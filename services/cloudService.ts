import { Project, User, Domain, Collaborator, CollaboratorRole } from '../types';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// --------------------------------------------------------
// SUPABASE CONFIG (Only public ANON KEY is allowed on FE)
// --------------------------------------------------------

const SUPABASE_URL = "https://sxvqqktlykguifvmqrni.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4dnFxa3RseWtndWlmdm1xcm5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MDE0MTIsImV4cCI6MjA4MDk3NzQxMn0.5psTW7xePYH3T0mkkHmDoWNgLKSghOHnZaW2zzShkSA";

const ADMIN_EMAIL = "rezarafeie13@gmail.com";

// --------------------------------------------------------
let supabase: SupabaseClient | null = null;

// --------------------- ERROR CLASS ----------------------
export class DatabaseSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseSetupError";
  }
}

// --------------------- HELPERS --------------------------
const generateAvatar = (email: string) =>
  `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`;

// ---------------------- SERVICE -------------------------
export const cloudService = {
  initSupabase() {
    if (!supabase) {
        supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
  },

  // ---------------- AUTH ----------------
  async login(email: string, password: string): Promise<User> {
    this.initSupabase();
    const { data, error } = await supabase!.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new Error(error.message);

    return {
      id: data.user!.id,
      email,
      name: data.user!.user_metadata?.name || email.split("@")[0],
      avatar: generateAvatar(email),
      isAdmin: email === ADMIN_EMAIL,
    };
  },

  async register(email: string, password: string, name: string): Promise<User> {
    this.initSupabase();
    const { data, error } = await supabase!.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
    });
    if (error) throw new Error(error.message);

    return {
      id: data.user!.id,
      email,
      name,
      avatar: generateAvatar(email),
      isAdmin: email === ADMIN_EMAIL,
    };
  },

  async logout() {
    this.initSupabase();
    await supabase!.auth.signOut();
  },

  async getCurrentUser(): Promise<User | null> {
    this.initSupabase();
    const { data: { session } } = await supabase!.auth.getSession();
    if (!session?.user) return null;
    
    return {
        id: session.user.id,
        email: session.user.email!,
        name: session.user.user_metadata?.name || session.user.email!.split("@")[0],
        avatar: generateAvatar(session.user.email!),
        isAdmin: session.user.email === ADMIN_EMAIL,
    };
  },

  // ---------------- PROJECTS ----------------

  async getProjects(userId: string): Promise<Project[]> {
    this.initSupabase();
    try {
      // STEP 1 — Fetch all projects the user owns
      const { data: owned, error: ownedErr } = await supabase!
        .from("projects")
        .select("*")
        .eq("user_id", userId);

      if (ownedErr) throw ownedErr;

      // STEP 1.5 — Fetch shared project ids
      const { data: shared, error: sharedErr } = await supabase!
        .from("project_collaborators")
        .select("project_id")
        .eq("user_id", userId);

      if (sharedErr) throw sharedErr;

      const sharedIds = shared?.map((s: any) => s.project_id) || [];

      const { data: sharedProjects, error: sharedProjErr } = await supabase!
        .from("projects")
        .select("*")
        .in(
          "id",
          sharedIds.length
            ? sharedIds
            : ["00000000-0000-0000-0000-000000000000"]
        );

      if (sharedProjErr) throw sharedProjErr;

      const allProjects = [...(owned || []), ...(sharedProjects || [])];

      // STEP 2 — Fetch collaborators WITHOUT ANY JOIN
      const projectIds = allProjects.map((p: any) => p.id);

      const { data: collabs, error: collabErr } = await supabase!
        .from("project_collaborators")
        .select("*")
        .in(
          "project_id",
          projectIds.length
            ? projectIds
            : ["00000000-0000-0000-0000-000000000000"]
        );

      if (collabErr) throw collabErr;

      // STEP 3 — Load needed user rows manually (from public.users view)
      const userIds = Array.from(
        new Set([
          ...allProjects.map((p: any) => p.user_id),
          ...collabs.map((c: any) => c.user_id),
        ])
      );

      const { data: users, error: usersErr } = await supabase!
        .from("users")
        .select("*")
        .in(
          "id",
          userIds.length
            ? userIds
            : ["00000000-0000-0000-0000-000000000000"]
        );

      if (usersErr) throw usersErr;

      const userMap: Record<string, any> = {};
      for (const u of users) userMap[u.id] = u;

      // STEP 4 — Merge final objects
      return allProjects.map((p: any) => {
        const owner = userMap[p.user_id];

        return {
          id: p.id,
          userId: p.user_id,
          name: p.name,
          createdAt: new Date(p.created_at).getTime(),
          updatedAt: new Date(p.updated_at).getTime(),
          status: p.status,
          code: p.code || { html: "", css: "", javascript: "", explanation: "" },
          messages: p.messages || [],
          publishedUrl: p.published_url,
          customDomain: p.custom_domain,

          owner: owner
            ? {
                id: owner.id,
                email: owner.email,
                name:
                  owner.user_metadata?.name ||
                  owner.email.split("@")[0],
                avatar: generateAvatar(owner.email),
              }
            : undefined,

          collaborators: collabs
            .filter((c: any) => c.project_id === p.id)
            .map((c: any) => {
              const u = userMap[c.user_id];
              return {
                id: u.id,
                email: u.email,
                role: c.role,
                projectId: p.id,
                name:
                  u.user_metadata?.name ||
                  u.email.split("@")[0],
                avatar: generateAvatar(u.email),
              };
            }),
        } as Project;
      });
    } catch (e: any) {
      console.error("Supabase Fetch Error:", e.message);
      if (e.message.includes('relation "projects" does not exist') || e.code === '42P01') {
          throw new DatabaseSetupError("TABLE_MISSING");
      }
      throw new Error("Failed to fetch projects: " + e.message);
    }
  },

  async getProject(projectId: string): Promise<Project | null> {
    this.initSupabase();
    const { data: p, error } = await supabase!
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .single();
    
    if (error || !p) return null;

    // Fetch owner
    const { data: owner } = await supabase!
        .from("users")
        .select("*")
        .eq("id", p.user_id)
        .single();

    // Fetch collaborators
    const { data: collabs } = await supabase!
        .from("project_collaborators")
        .select("*")
        .eq("project_id", projectId);
    
    let collaborators: Collaborator[] = [];
    if (collabs && collabs.length > 0) {
        const userIds = collabs.map((c:any) => c.user_id);
        const { data: users } = await supabase!.from("users").select("*").in("id", userIds);
        const userMap: any = {};
        users?.forEach((u:any) => userMap[u.id] = u);
        
        collaborators = collabs.map((c:any) => {
             const u = userMap[c.user_id];
             return {
                id: u.id,
                projectId,
                email: u.email,
                role: c.role,
                name: u.user_metadata?.name || u.email.split("@")[0],
                avatar: generateAvatar(u.email)
             };
        });
    }

    return {
        id: p.id,
        userId: p.user_id,
        name: p.name,
        createdAt: new Date(p.created_at).getTime(),
        updatedAt: new Date(p.updated_at).getTime(),
        status: p.status,
        code: p.code || { html: "", css: "", javascript: "", explanation: "" },
        messages: p.messages || [],
        publishedUrl: p.published_url,
        customDomain: p.custom_domain,
        owner: owner ? {
            id: owner.id,
            email: owner.email,
            name: owner.user_metadata?.name || owner.email.split("@")[0],
            avatar: generateAvatar(owner.email),
        } : undefined,
        collaborators
    };
  },

  async saveProject(project: Project): Promise<void> {
    this.initSupabase();
    const { error } = await supabase!
      .from('projects')
      .upsert({
        id: project.id,
        user_id: project.userId,
        name: project.name,
        code: project.code,
        messages: project.messages,
        status: project.status,
        updated_at: new Date().toISOString(),
      });
    
    if (error) throw error;
  },

  async deleteProject(projectId: string): Promise<void> {
    this.initSupabase();
    const { error } = await supabase!
      .from('projects')
      .delete()
      .eq('id', projectId);
      
    if (error) throw error;
  },

  // ---------------- COLLABORATION ----------------

  async getCollaborators(projectId: string): Promise<Collaborator[]> {
    this.initSupabase();
    const { data: collabs, error } = await supabase!
        .from("project_collaborators")
        .select("*")
        .eq("project_id", projectId);
    
    if (error) throw error;
    if (!collabs.length) return [];

    const userIds = collabs.map((c: any) => c.user_id);
    const { data: users, error: userError } = await supabase!
        .from("users")
        .select("*")
        .in("id", userIds);

    if (userError) throw userError;

    const userMap: Record<string, any> = {};
    users?.forEach((u: any) => userMap[u.id] = u);

    return collabs.map((c: any) => {
        const u = userMap[c.user_id];
        return {
            id: u?.id || c.user_id,
            projectId,
            email: u?.email || 'Unknown',
            role: c.role,
            name: u?.user_metadata?.name || u?.email?.split("@")[0],
            avatar: u?.email ? generateAvatar(u.email) : undefined
        };
    });
  },

  async addCollaborator(projectId: string, email: string, role: CollaboratorRole): Promise<void> {
    this.initSupabase();
    // Lookup user by email. Note: 'users' table access depends on RLS/View.
    const { data: users, error: userError } = await supabase!
        .from("users")
        .select("id")
        .eq("email", email)
        .single();
    
    if (userError || !users) {
        throw new Error("User not found or database not configured to allow user lookup.");
    }

    const { error } = await supabase!
        .from("project_collaborators")
        .insert({
            project_id: projectId,
            user_id: users.id,
            role
        });

    if (error) throw error;
  },

  async removeCollaborator(projectId: string, userId: string): Promise<void> {
    this.initSupabase();
    const { error } = await supabase!
        .from("project_collaborators")
        .delete()
        .match({ project_id: projectId, user_id: userId });
        
    if (error) throw error;
  },

  // ---------------- DOMAINS ----------------

  async getDomainsForProject(projectId: string): Promise<Domain[]> {
    this.initSupabase();
    const { data, error } = await supabase!
        .from("domains")
        .select("*")
        .eq("project_id", projectId);

    if (error) {
         if (error.message.includes('relation "domains" does not exist') || error.code === '42P01') {
             return [];
         }
         throw error;
    }
    
    return data.map((d: any) => ({
        id: d.id,
        projectId: d.project_id,
        domainName: d.domain_name,
        status: d.status,
        isPrimary: d.is_primary,
        dnsRecordType: d.dns_record_type,
        dnsRecordValue: d.dns_record_value,
        createdAt: new Date(d.created_at).getTime()
    }));
  },

  async addDomain(projectId: string, userId: string, domainName: string): Promise<void> {
    this.initSupabase();
    // Generate mock DNS values for the demo
    const dnsRecordType = 'CNAME';
    const dnsRecordValue = 'cname.vercel-dns.com'; 

    const { error } = await supabase!
        .from("domains")
        .insert({
            project_id: projectId,
            domain_name: domainName,
            status: 'pending',
            is_primary: false,
            dns_record_type: dnsRecordType,
            dns_record_value: dnsRecordValue
        });

    if (error) throw error;
  },

  async deleteDomain(domainId: string): Promise<void> {
    this.initSupabase();
    const { error } = await supabase!
        .from("domains")
        .delete()
        .eq("id", domainId);

    if (error) throw error;
  },

  async verifyDomain(domainId: string): Promise<Domain> {
    this.initSupabase();
    // In a real app, this would call an external API (like Vercel/Cloudflare)
    // For simulation, we randomly succeed or fail.
    
    const randomStatus = Math.random() > 0.3 ? 'verified' : 'error';
    
    const { data, error } = await supabase!
        .from("domains")
        .update({ status: randomStatus })
        .eq("id", domainId)
        .select()
        .single();

    if (error) throw error;

    return {
        id: data.id,
        projectId: data.project_id,
        domainName: data.domain_name,
        status: data.status,
        isPrimary: data.is_primary,
        dnsRecordType: data.dns_record_type,
        dnsRecordValue: data.dns_record_value,
        createdAt: new Date(data.created_at).getTime()
    };
  }
};