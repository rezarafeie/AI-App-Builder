


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
  requiresAction?: 'CONNECT_DATABASE';
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

export interface BuildState {
    plan: string[];
    currentStep: number;
    lastCompletedStep: number; // The index of the last successfully completed step. -1 if none.
    error: string | null;
}

export interface RafieiCloudProject {
    id: string;
    userId: string;
    projectRef: string;
    projectName: string;
    region: string;
    status: 'CREATING' | 'ACTIVE' | 'FAILED';
    dbPassword?: string; // Stored for potential reset/connection needs
    publishableKey?: string;
    secretKey?: string;
    createdAt: number;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number; // Timestamp if project is in trash
  code: GeneratedCode;
  messages: Message[];
  status?: 'idle' | 'generating';
  buildState?: BuildState | null; // Persisted build history
  publishedUrl?: string;
  customDomain?: string;
  domains?: Domain[];
  // User's own manual backend configuration
  supabaseConfig?: {
      url: string;
      key: string;
  };
  // Managed Rafiei Cloud Backend
  rafieiCloudProject?: RafieiCloudProject;
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