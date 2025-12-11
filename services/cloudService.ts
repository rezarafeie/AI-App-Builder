// FIX: Import the 'Message' type from '../types' to resolve the 'Cannot find name 'Message'' error.
import { Project, User, Domain, Collaborator, CollaboratorRole, Message } from '../types';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { runBuildOnServer } from './geminiService';

const SUPABASE_URL = "https://sxvqqktlykguifvmqrni.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4dnFxa3RseWtndWlmdm1xcm5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MDE0MTIsImV4cCI6MjA4MDk3NzQxMn0.5psTW7xePYH3T0mkkHmDoWNgLKSghOHnZaW2zzShkSA";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export class DatabaseSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseSetupError';
  }
}

const wrapError = (error: any, context: string) => {
    console.error(`Error in ${context}:`, error);
    const msg = error?.message || "An unknown error occurred.";
    return new Error(msg);
};

const mapRowToProject = (row: any): Project => {
    return {
        id: row.id,
        userId: row.user_id,
        name: row.name,
        createdAt: new Date(row.created_at).getTime(),
        updatedAt: new Date(row.updated_at).getTime(),
        code: row.code || { html: '', javascript: '', css: '', explanation: '' },
        messages: row.messages || [],
        status: row.status || 'idle',
        buildState: row.build_state || null,
        publishedUrl: row.published_url,
        customDomain: row.custom_domain,
        owner: row.owner_details ? {
            id: row.owner_details.id,
            email: row.owner_details.email,
            name: row.owner_details.raw_user_meta_data?.name || 'Unknown',
            avatar: row.owner_details.raw_user_meta_data?.avatar_url
        } : undefined
    };
};

function dataUrlToBlob(dataUrl: string): Blob {
    const arr = dataUrl.split(',');
    // @ts-ignore
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}

export const cloudService = {
  // --- AUTH ---
  async getCurrentUser(): Promise<User | null> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return null;
      return {
        id: session.user.id,
        email: session.user.email!,
        name: session.user.user_metadata.name || session.user.email?.split('@')[0] || 'User',
        avatar: session.user.user_metadata.avatar_url || `https://ui-avatars.com/api/?name=${session.user.email}&background=random`
      };
    } catch (e) { return null; }
  },
  
  async login(email: string, password: string): Promise<User> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw wrapError(error, 'login');
    if (!data.user) throw new Error("Login failed: User not found.");
    
    return {
        id: data.user.id,
        email: data.user.email!,
        name: data.user.user_metadata.name || data.user.email?.split('@')[0] || 'User',
        avatar: data.user.user_metadata.avatar_url || `https://ui-avatars.com/api/?name=${data.user.email}&background=random`
    };
  },

  async register(email: string, password: string, name: string): Promise<User> {
    const avatar = `https://ui-avatars.com/api/?name=${name.split(' ').join('+')}&background=random`;
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                name: name,
                avatar_url: avatar
            }
        }
    });

    if (error) throw wrapError(error, 'register');
    if (!data.user) throw new Error("Registration failed: Could not create user.");

     return {
        id: data.user.id,
        email: data.user.email!,
        name: data.user.user_metadata.name || name,
        avatar: data.user.user_metadata.avatar_url || avatar
    };
  },

  async logout(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw wrapError(error, 'logout');
  },

  // --- PROJECTS ---
  async getProjects(userId: string): Promise<Project[]> {
    const { data, error } = await supabase.from('projects').select('*').order('updated_at', { ascending: false });
    if (error) {
       if (error.code === '42P01') throw new DatabaseSetupError("TABLE_MISSING");
       throw wrapError(error, 'getProjects');
    }
    return (data || []).map(mapRowToProject);
  },

  async getProject(projectId: string): Promise<Project | null> {
    const { data, error } = await supabase.from('projects').select('*').eq('id', projectId).single();
    if (error) {
        if (error.code === 'PGRST116') return null;
        throw wrapError(error, 'getProject');
    }
    return mapRowToProject(data);
  },

  async saveProject(project: Project): Promise<void> {
    const payload = {
        id: project.id, user_id: project.userId, name: project.name,
        // updated_at is now handled by a DB trigger for reliability
        code: project.code, messages: project.messages,
        status: project.status, build_state: project.buildState, published_url: project.publishedUrl,
        custom_domain: project.customDomain
    };
    const { error } = await supabase.from('projects').upsert(payload, { onConflict: 'id' });
    if (error) {
        if (error.code === '42P01') throw new DatabaseSetupError("TABLE_MISSING");
        if (error.code === '42703') throw new DatabaseSetupError("SCHEMA_MISMATCH");
        throw wrapError(error, 'saveProject');
    }
  },
  
  async deleteProject(projectId: string): Promise<void> {
      const { error } = await supabase.from('projects').delete().eq('id', projectId);
      if (error) throw wrapError(error, 'deleteProject');
  },

  // --- REALTIME & BACKGROUND JOBS ---

  subscribeToProjectChanges(projectId: string, callback: (project: Project) => void): { unsubscribe: () => void } {
    const channel: RealtimeChannel = supabase
      .channel(`project-${projectId}`)
      .on('postgres_changes', 
          { event: 'UPDATE', schema: 'public', table: 'projects', filter: `id=eq.${projectId}` },
          (payload) => callback(mapRowToProject(payload.new))
      )
      .subscribe();
      
      return { unsubscribe: () => supabase.removeChannel(channel) };
  },

  async uploadChatImage(userId: string, messageId: string, file: File): Promise<string> {
    const filePath = `${userId}/${messageId}/${file.name}`;
    const { error } = await supabase.storage
        .from('chat-images')
        .upload(filePath, file, { upsert: true });

    if (error) throw wrapError(error, 'uploadChatImage');

    const { data } = supabase.storage
        .from('chat-images')
        .getPublicUrl(filePath);

    return data.publicUrl;
  },

  async triggerBuild(project: Project, prompt: string, images?: { file: File, previewUrl: string }[]): Promise<void> {
      const userMsg: Message = { 
          id: crypto.randomUUID(), role: 'user', content: prompt, 
          timestamp: Date.now(), images: [] 
      };

      const uploadedImageUrls: string[] = [];
      if (images && images.length > 0) {
          const uploadPromises = images.map(img => 
              this.uploadChatImage(project.userId, userMsg.id, img.file)
          );
          uploadedImageUrls.push(...await Promise.all(uploadPromises));
          userMsg.images = uploadedImageUrls;
      }
      
      const updatedProject: Project = {
          ...project,
          messages: [...project.messages, userMsg],
          status: 'generating',
          buildState: { plan: [], currentStep: 0, lastCompletedStep: -1, error: null }
      };
      await this.saveProject(updatedProject);
      
      setTimeout(() => {
          const imageDataForAI = images ? images.map(img => img.previewUrl) : [];
          runBuildOnServer(updatedProject, prompt, imageDataForAI).catch(error => {
              console.error("Fatal error in background build process:", error);
          });
      }, 0);
  },

  // --- COLLABORATORS & DOMAINS (Unchanged) ---
  async getCollaborators(projectId: string): Promise<Collaborator[]> { return []; },
  async addCollaborator(projectId: string, email: string, role: CollaboratorRole): Promise<void> {},
  async removeCollaborator(projectId: string, userId: string): Promise<void> {},
  async getDomainsForProject(projectId: string): Promise<Domain[]> { return []; },
  async addDomain(projectId: string, userId: string, domainName: string): Promise<void> {},
  async deleteDomain(domainId: string): Promise<void> {},
  async verifyDomain(domainId: string): Promise<Domain> { return {} as any; },
};