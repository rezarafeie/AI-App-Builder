
// FIX: Import the 'Message' type from '../types' to resolve the 'Cannot find name 'Message'' error.
import { Project, User, Domain, Message, RafieiCloudProject } from '../types';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { generateProjectTitle, runBuildOnServer } from './geminiService';

// Safe environment access to prevent "process is not defined" crashes
const getEnv = (key: string) => {
  try {
    // @ts-ignore
    if (typeof process !== 'undefined' && process.env) {
       // @ts-ignore
       return process.env[key];
    }
  } catch (e) {
    // Ignore errors
  }
  return undefined;
};

// Initialize the Platform Supabase Client (Main Auth/Dashboard)
// We use the provided credentials as defaults to ensure immediate connectivity.
const SUPABASE_URL = getEnv('SUPABASE_URL') || getEnv('REACT_APP_SUPABASE_URL') || 'https://sxvqqktlykguifvmqrni.supabase.co';
const SUPABASE_KEY = getEnv('SUPABASE_ANON_KEY') || getEnv('REACT_APP_SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4dnFxa3RseWtndWlmdm1xcm5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MDE0MTIsImV4cCI6MjA4MDk3NzQxMn0.5psTW7xePYH3T0mkkHmDoWNgLKSghOHnZaW2zzShkSA';

let supabase: SupabaseClient | null = null;

if (SUPABASE_URL && SUPABASE_KEY) {
    try {
        supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: true,
            },
        });
    } catch (e) {
        console.error("Failed to initialize main Supabase client", e);
    }
}

// Track active build abort controllers
const buildAbortControllers = new Map<string, AbortController>();

export class DatabaseSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseSetupError';
  }
}

const wrapError = (error: any, context: string) => {
    console.error(`Error in ${context}:`, error);

    // New: Specifically detect network/CORS errors
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
        return new DatabaseSetupError("NETWORK_ERROR");
    }

    let msg = "An unknown error occurred.";
    
    if (error) {
        if (typeof error === 'string') {
            msg = error;
        } else if (error.message) {
            msg = error.message;
        } else if (error.error_description) {
            msg = error.error_description;
        } else if (error.details) {
            msg = error.details;
        } else if (error.hint) {
            msg = `Error: ${error.hint}`;
        }
    }
    
    return new Error(msg);
};

// Helper to ensure we are connected before performing actions
const requireClient = () => {
    if (!supabase) throw new Error("Platform Supabase not configured. Please check environment variables.");
    return supabase;
};

const mapRowToProject = (row: any): Project => {
    let deletedAtTimestamp: number | undefined = undefined;
    if (row.deleted_at) {
        // Handle both numeric (BIGINT) and string (TIMESTAMPTZ) formats for backward compatibility
        if (typeof row.deleted_at === 'number') {
            deletedAtTimestamp = row.deleted_at;
        } else if (typeof row.deleted_at === 'string') {
            const parsedDate = new Date(row.deleted_at);
            if (!isNaN(parsedDate.getTime())) {
                deletedAtTimestamp = parsedDate.getTime();
            }
        }
    }
    
    return {
        id: row.id,
        userId: row.user_id,
        name: row.name,
        createdAt: new Date(row.created_at).getTime(),
        updatedAt: new Date(row.updated_at).getTime(),
        deletedAt: deletedAtTimestamp,
        code: row.code || { html: '', javascript: '', css: '', explanation: '' },
        messages: row.messages || [],
        status: row.status || 'idle',
        buildState: row.build_state || null,
        publishedUrl: row.published_url,
        customDomain: row.custom_domain,
        supabaseConfig: row.supabase_config || undefined,
        rafieiCloudProject: row.rafiei_cloud_project || undefined
    };
};

// Helper to convert File to Base64
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};

export const cloudService = {
  // --- AUTH ---
  onAuthStateChange(callback: (user: User | null) => void) {
    const client = requireClient();
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
            callback({
                id: session.user.id,
                email: session.user.email!,
                name: session.user.user_metadata.name || session.user.email?.split('@')[0] || 'User',
                avatar: session.user.user_metadata.avatar_url || `https://ui-avatars.com/api/?name=${session.user.email}&background=random`
            });
        } else {
            callback(null);
        }
    });
    return () => subscription.unsubscribe();
  },

  async getCurrentUser(): Promise<User | null> {
    if (!supabase) return null;
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
    const client = requireClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
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
    const client = requireClient();
    const avatar = `https://ui-avatars.com/api/?name=${name.split(' ').join('+')}&background=random`;
    const { data, error } = await client.auth.signUp({
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

  async signInWithGoogle(): Promise<void> {
    const client = requireClient();
    const { error } = await client.auth.signInWithOAuth({ provider: 'google' });
    if (error) throw wrapError(error, 'signInWithGoogle');
  },
  
  async signInWithGitHub(): Promise<void> {
    const client = requireClient();
    const { error } = await client.auth.signInWithOAuth({ provider: 'github' });
    if (error) throw wrapError(error, 'signInWithGitHub');
  },

  async logout(): Promise<void> {
    const client = requireClient();
    const { error } = await client.auth.signOut();
    if (error) throw wrapError(error, 'logout');
  },

  // --- RAFIEI CLOUD PROJECTS ---
  async saveRafieiCloudProject(cloudProject: RafieiCloudProject): Promise<void> {
    const client = requireClient();
    const payload = {
        id: cloudProject.id,
        user_id: cloudProject.userId, // Include user_id for RLS check
        project_ref: cloudProject.projectRef,
        project_name: cloudProject.projectName,
        status: cloudProject.status,
        region: cloudProject.region,
        db_pass: cloudProject.dbPassword,
        publishable_key: cloudProject.publishableKey,
        secret_key: cloudProject.secretKey,
        created_at: new Date(cloudProject.createdAt).toISOString()
    };
    
    // Save to the specific Rafiei Cloud Table
    const { error } = await client.from('rafiei_cloud_projects').upsert(payload, { onConflict: 'id' });
    
    if (error) {
        if (error.code === '42P01') throw new DatabaseSetupError("TABLE_MISSING");
        throw wrapError(error, 'saveRafieiCloudProject');
    }
  },

  // --- PROJECTS ---
  async createNewProjectAndInitiateBuild(user: User, prompt: string, images: { url: string; base64: string }[]): Promise<string> {
    const name = await generateProjectTitle(prompt);
    
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
      images: images.map(i => i.url)
    };

    const newProject: Project = {
      id: crypto.randomUUID(),
      userId: user.id,
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      code: { html: '', javascript: '', css: '', explanation: '' },
      messages: [userMsg],
      status: 'idle', // Keep as idle, let ProjectBuilder trigger the actual build flow
      supabaseConfig: await this.getUserSettings(user.id) || undefined
    };

    await this.saveProject(newProject);
    
    // NOTE: We do NOT call triggerBuild here anymore.
    // The ProjectBuilder component will detect this is a new project (1 message, no code)
    // and initiate the "Check Requirements -> Connect Cloud -> Build" flow.
    
    return newProject.id;
  },

  async getProjects(userId: string): Promise<Project[]> {
    const client = requireClient();
    
    try {
        const { data, error } = await client
            .from('projects')
            .select('*')
            .eq('user_id', userId)
            .is('deleted_at', null)
            .order('updated_at', { ascending: false });

        if (error) throw error;
        return (data || []).map(mapRowToProject);
    } catch (error: any) {
        if (error.code === '42P01') throw new DatabaseSetupError("TABLE_MISSING");
        if (error.code === '42P17') throw new DatabaseSetupError("Infinite Recursion detected in DB Policies. Run SQL Setup.");
        
        if (error.code === '42703') {
            const { data: fallbackData, error: fallbackError } = await client
                .from('projects')
                .select('*')
                .eq('user_id', userId)
                .order('updated_at', { ascending: false });
            
            if (fallbackError) throw wrapError(fallbackError, 'getProjects_Fallback');
            return (fallbackData || []).map(mapRowToProject);
        }

        throw wrapError(error, 'getProjects');
    }
  },

  async getTrashedProjects(userId: string): Promise<Project[]> {
    const client = requireClient();
    try {
        const { data, error } = await client
            .from('projects')
            .select('*')
            .eq('user_id', userId)
            .not('deleted_at', 'is', null)
            .order('deleted_at', { ascending: false });

        if (error) throw error;
        return (data || []).map(mapRowToProject);
    } catch (error: any) {
       if (error.code === '42703') return [];
       throw wrapError(error, 'getTrashedProjects');
    }
  },

  async getTrashCount(userId: string): Promise<number> {
    const client = requireClient();
    try {
        const { count, error } = await client
            .from('projects')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .not('deleted_at', 'is', null);
        
        if (error) {
             if (error.code === '42703' || error.code === '42P01') return 0; 
             throw error;
        }
        return count || 0;
    } catch (e) {
        return 0;
    }
  },

  async getProject(projectId: string): Promise<Project | null> {
    const client = requireClient();
    const { data, error } = await client.from('projects').select('*').eq('id', projectId).single();
    if (error) {
        if (error.code === 'PGRST116') return null;
        throw wrapError(error, 'getProject');
    }
    return mapRowToProject(data);
  },

  async saveProject(project: Project): Promise<void> {
    const client = requireClient();
    const payload = {
        id: project.id, user_id: project.userId, name: project.name,
        code: project.code, messages: project.messages,
        status: project.status, build_state: project.buildState, published_url: project.publishedUrl,
        custom_domain: project.customDomain,
        supabase_config: project.supabaseConfig,
        rafiei_cloud_project: project.rafieiCloudProject // Save the managed project info if exists
    };
    const { error } = await client.from('projects').upsert(payload, { onConflict: 'id' });
    if (error) {
        if (error.code === '42P01') throw new DatabaseSetupError("TABLE_MISSING");
        if (error.code === '42703') throw new DatabaseSetupError("SCHEMA_MISMATCH");
        if (error.code === '42P17') throw new DatabaseSetupError("Infinite Recursion detected in DB Policies. Run SQL Setup.");
        throw wrapError(error, 'saveProject');
    }
  },

  async softDeleteProject(projectId: string): Promise<void> {
      const client = requireClient();
      const { error } = await client
        .from('projects')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', projectId);
      
      if (error) {
          if (error.code === '42703' || error.message?.includes('deleted_at')) {
             console.warn("Soft delete failed (schema mismatch). Falling back to hard delete.");
             return this.deleteProject(projectId);
          }
          throw wrapError(error, 'softDeleteProject');
      }
  },

  async restoreProject(projectId: string): Promise<void> {
      const client = requireClient();
      const { error } = await client
        .from('projects')
        .update({ deleted_at: null })
        .eq('id', projectId);
      
      if (error) throw wrapError(error, 'restoreProject');
  },
  
  async deleteProject(projectId: string): Promise<void> {
      const client = requireClient();
      const { error } = await client.from('projects').delete().eq('id', projectId);
      if (error) throw wrapError(error, 'deleteProject');
  },

  // --- REALTIME & BACKGROUND JOBS ---

  subscribeToProjectChanges(projectId: string, callback: (project: Project) => void): { unsubscribe: () => void } {
    const client = requireClient();
    const channel: RealtimeChannel = client
      .channel(`project-${projectId}`)
      .on('postgres_changes', 
          { event: 'UPDATE', schema: 'public', table: 'projects', filter: `id=eq.${projectId}` },
          (payload) => callback(mapRowToProject(payload.new))
      )
      .subscribe();
      
      return { unsubscribe: () => client.removeChannel(channel) };
  },

  subscribeToUserProjects(userId: string, callback: (payload: any) => void): { unsubscribe: () => void } {
    const client = requireClient();
    const channel: RealtimeChannel = client
        .channel(`user-projects-${userId}`)
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'projects', filter: `user_id=eq.${userId}` },
            callback
        )
        .subscribe();
    return { unsubscribe: () => client.removeChannel(channel) };
  },

  async uploadChatImage(userId: string, messageId: string, file: File): Promise<string> {
    const client = requireClient();
    const filePath = `${userId}/${messageId}/${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const { error } = await client.storage
        .from('chat-images')
        .upload(filePath, file, { upsert: true });

    if (error) throw wrapError(error, 'uploadChatImage');

    const { data } = client.storage
        .from('chat-images')
        .getPublicUrl(filePath);

    return data.publicUrl;
  },

  // STOP BUILD: Aborts the running controller for this project
  stopBuild(projectId: string) {
      const controller = buildAbortControllers.get(projectId);
      if (controller) {
          controller.abort();
          buildAbortControllers.delete(projectId);
      }
  },

  async triggerBuild(
    project: Project, 
    prompt: string, 
    images?: { url: string, base64: string }[],
    onStateChange?: (project: Project) => void
  ): Promise<void> {
      const finalMessages = [...project.messages];
      
      // FIX: Find the last user message, not just the last message overall.
      // This is crucial for resuming builds after system messages (e.g., cloud connect).
      const lastUserMsg = [...finalMessages].reverse().find(m => m.role === 'user');

      if (!lastUserMsg) {
          console.error("triggerBuild could not find a user message in the history. Aborting build trigger.");
          if (project.status === 'generating') {
            await this.saveProject({ ...project, status: 'idle' });
          }
          return;
      }

      // This logic now correctly targets the last user message to add image URLs.
      if (images && images.length > 0) {
          const lastUserMsgIndex = finalMessages.findIndex(m => m.id === lastUserMsg.id);
          if (lastUserMsgIndex !== -1) {
              const imageUrls = images.map(img => img.url);
              // Ensure we don't duplicate images if they were already there from a previous step
              const existingImages = finalMessages[lastUserMsgIndex].images || [];
              const allImages = [...new Set([...existingImages, ...imageUrls])];
              finalMessages[lastUserMsgIndex] = { ...finalMessages[lastUserMsgIndex], images: allImages };
          }
      }
      
      const updatedProject: Project = {
          ...project,
          messages: finalMessages,
          status: 'generating',
          buildState: { plan: [], currentStep: 0, lastCompletedStep: -1, error: null }
      };
      
      if (onStateChange) onStateChange(updatedProject);
      await this.saveProject(updatedProject);
      
      // Cancel previous builds for this project
      this.stopBuild(project.id);
      
      const controller = new AbortController();
      buildAbortControllers.set(project.id, controller);
      
      setTimeout(() => {
          const imageDataForAI = images ? images.map(img => img.base64) : [];
          runBuildOnServer(updatedProject, prompt, imageDataForAI, onStateChange, (p) => this.saveProject(p), controller.signal)
            .catch(error => {
                // Ignore errors if aborted, otherwise log
                if (error.message !== 'Build cancelled by user') {
                     console.error("Fatal error in background build process:", error);
                }
            })
            .finally(() => {
                if (buildAbortControllers.get(updatedProject.id) === controller) {
                    buildAbortControllers.delete(updatedProject.id);
                }
            });
      }, 0);
  },

  async getDomainsForProject(projectId: string): Promise<Domain[]> { 
      return []; 
  },
  async addDomain(projectId: string, userId: string, domainName: string): Promise<void> {},
  async deleteDomain(domainId: string): Promise<void> {},
  async verifyDomain(domainId: string): Promise<Domain> { return {} as any; },

  // --- USER GLOBAL SETTINGS ---

  async getUserSettings(userId: string): Promise<{url: string, key: string} | null> {
      const client = requireClient();
      try {
          const { data, error } = await client.from('user_settings').select('supabase_config').eq('user_id', userId).single();
          if (error) {
              if (error.code === 'PGRST116' || error.code === '42P01') return null; // Not found or table missing
              throw error;
          }
          return data?.supabase_config || null;
      } catch (e) {
          console.warn("Failed to fetch user settings", e);
          return null;
      }
  },

  async saveUserSettings(userId: string, config: {url: string, key: string} | null): Promise<void> {
      const client = requireClient();
      if (config === null) {
           await client.from('user_settings').upsert({ user_id: userId, supabase_config: null });
      } else {
           await client.from('user_settings').upsert({ user_id: userId, supabase_config: config });
      }
  },

  // --- INFRASTRUCTURE VERIFICATION ---
  async checkTableExists(tableName: string): Promise<boolean> {
      const client = requireClient();
      const { error } = await client.from(tableName).select('id').limit(1);
      if (error && error.code === '42P01') return false;
      return true;
  },

  async checkBucketExists(bucketName: string): Promise<boolean> {
      const client = requireClient();
      const { data, error } = await client.storage.getBucket(bucketName);
      if (error || !data) return false;
      return true;
  },
  
  async testConnection(url: string, key: string): Promise<boolean> {
      if (!url || !key) return false;
      
      let validUrl = url.trim();
      if (!validUrl.match(/^https?:\/\//)) {
          validUrl = `https://${validUrl}`;
      }

      try {
          const tempClient = createClient(validUrl, key.trim(), {
              auth: { 
                  persistSession: false,
                  autoRefreshToken: false,
                  detectSessionInUrl: false,
                  storageKey: 'nova_test_auth'
              },
              global: { headers: { 'x-client-info': 'rafieibuilder-test' } }
          });
          
          const { error } = await tempClient.from('__nova_connection_check__').select('*').limit(1);
          
          if (!error) return true;
          if (error.code === '42P01' || error.code === 'PGRST205') return true;
          if (error.message && (error.message.includes('does not exist') || error.message.includes('relation') || error.message.includes('schema cache'))) {
              return true;
          }

          console.warn("Test connection failed:", error);
          return false;
      } catch (e) {
          console.error("Test connection exception:", e);
          return false;
      }
  }
};
