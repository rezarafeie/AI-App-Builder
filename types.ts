export interface GeneratedCode {
  html: string;
  javascript: string;
  css: string;
  explanation: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string; // The text prompt
  images?: string[]; // Array of public URLs for stored images
  timestamp: number;
  isThinking?: boolean;
}

export interface Suggestion {
  title: string;
  prompt: string;
}

export interface Domain {
  id:string;
  projectId: string;
  domainName: string;
  status: 'pending' | 'verified' | 'error';
  isPrimary: boolean;
  dnsRecordType: 'A' | 'CNAME' | null;
  dnsRecordValue: string | null;
  createdAt: number;
}

export type CollaboratorRole = 'owner' | 'editor' | 'viewer';

export interface Collaborator {
  id: string; // This is the user ID from auth.users
  projectId: string;
  email: string; // Denormalized for easy display
  name?: string; // Denormalized for easy display
  avatar?: string; // Denormalized for easy display
  role: CollaboratorRole;
}

export interface BuildState {
    plan: string[];
    currentStep: number;
    lastCompletedStep: number; // The index of the last successfully completed step. -1 if none.
    error: string | null;
}

export interface Project {
  id: string;
  userId: string; // The original owner's ID
  name: string;
  createdAt: number;
  updatedAt: number;
  code: GeneratedCode;
  messages: Message[];
  status?: 'idle' | 'generating';
  buildState?: BuildState | null; // Persisted build history
  publishedUrl?: string;
  customDomain?: string;
  // New fields for collaboration and domains
  owner?: User; // Details of the project owner, especially for shared projects
  collaborators?: Collaborator[];
  domains?: Domain[];
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  isAdmin?: boolean;
}

export interface SupabaseConfig {
  url: string;
  key: string;
}

export type ViewMode = 'split' | 'code' | 'preview';