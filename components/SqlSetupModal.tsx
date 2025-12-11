import React, { useState } from 'react';
import { Database, Shield, Copy, Check, RefreshCw, AlertTriangle, ImageIcon, Clock } from 'lucide-react';

interface SqlSetupModalProps {
  errorType: 'TABLE_MISSING' | 'RLS_POLICY_MISSING' | string;
  onRetry: () => void;
}

const SQL_COMMANDS = {
  CREATE_TABLE: `CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  code JSONB,
  messages JSONB,
  build_state JSONB,
  status TEXT,
  published_url TEXT,
  custom_domain TEXT
);`,
  MIGRATIONS: `ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS build_state JSONB;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS published_url TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS custom_domain TEXT;`,
  ENABLE_RLS: `ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;`,
  POLICIES: `CREATE POLICY "Allow individual read access" ON public.projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Allow individual insert access" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Allow individual update access" ON public.projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Allow individual delete access" ON public.projects FOR DELETE USING (auth.uid() = user_id);`,
  UPDATE_TRIGGER: `CREATE OR REPLACE FUNCTION public.handle_updated_at() 
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW; 
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_project_update ON public.projects;

CREATE TRIGGER on_project_update
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_updated_at();`,
  CREATE_BUCKET: `INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-images', 'chat-images', true)
ON CONFLICT (id) DO NOTHING;`,
  STORAGE_POLICIES: `CREATE POLICY "Allow authenticated uploads" ON storage.objects 
FOR INSERT TO authenticated 
WITH CHECK (bucket_id = 'chat-images');

CREATE POLICY "Allow public reads" ON storage.objects 
FOR SELECT USING (bucket_id = 'chat-images');`
};

const CodeBlock: React.FC<{ title: string, code: string }> = ({ title, code }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <div className="bg-slate-900/50 border border-slate-700 rounded-lg">
            <div className="flex justify-between items-center p-3 border-b border-slate-700">
                <h4 className="font-mono text-xs text-slate-300">{title}</h4>
                <button onClick={handleCopy} className="text-xs flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors">
                    {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                    {copied ? 'Copied!' : 'Copy'}
                </button>
            </div>
            <pre className="p-3 text-xs text-slate-400 overflow-x-auto"><code>{code}</code></pre>
        </div>
    );
};

const SqlSetupModal: React.FC<SqlSetupModalProps> = ({ errorType, onRetry }) => {
  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4 text-white">
      <div className="w-full max-w-3xl bg-[#1e293b] border border-slate-700 rounded-2xl shadow-2xl p-8 animate-in fade-in zoom-in-95 duration-300">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 mb-4">
            <AlertTriangle size={24} />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Database Configuration Required</h1>
          <p className="text-slate-400 text-sm">
            It looks like your Supabase project isn't set up yet. Please run the following SQL commands in your Supabase project's SQL Editor to enable all features.
          </p>
        </div>

        <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-4">
            {errorType === 'TABLE_MISSING' && (
                <div className="space-y-4">
                    <div className="flex items-center gap-3"><Database size={18} className="text-indigo-400" /><h3 className="text-lg font-semibold">Step 1: Create the 'projects' table</h3></div>
                    <p className="text-sm text-slate-500 -mt-2 ml-9">This table stores all your generated applications.</p>
                    <CodeBlock title="create_projects_table.sql" code={SQL_COMMANDS.CREATE_TABLE} />
                </div>
            )}
            
            <div className="space-y-4">
                <div className="flex items-center gap-3"><Shield size={18} className="text-indigo-400" /><h3 className="text-lg font-semibold">Step {errorType === 'TABLE_MISSING' ? '2' : '1'}: Enable Row Level Security</h3></div>
                <p className="text-sm text-slate-500 -mt-2 ml-9">This is a critical security step to ensure users can only access their own data.</p>
                <CodeBlock title="enable_rls.sql" code={SQL_COMMANDS.ENABLE_RLS} />
                <CodeBlock title="create_policies.sql" code={SQL_COMMANDS.POLICIES} />
            </div>
            
            <div className="space-y-4">
                <div className="flex items-center gap-3"><Clock size={18} className="text-indigo-400" /><h3 className="text-lg font-semibold">Step {errorType === 'TABLE_MISSING' ? '3' : '2'}: Automate Timestamps</h3></div>
                <p className="text-sm text-slate-500 -mt-2 ml-9">This trigger automatically updates the 'updated_at' field on every project change.</p>
                <CodeBlock title="create_updated_at_trigger.sql" code={SQL_COMMANDS.UPDATE_TRIGGER} />
            </div>

            <div className="space-y-4">
                <div className="flex items-center gap-3"><ImageIcon size={18} className="text-indigo-400" /><h3 className="text-lg font-semibold">Step {errorType === 'TABLE_MISSING' ? '4' : '3'}: Setup Image Storage</h3></div>
                <p className="text-sm text-slate-500 -mt-2 ml-9">This creates a public bucket for storing images uploaded in the chat.</p>
                <CodeBlock title="create_storage_bucket.sql" code={SQL_COMMANDS.CREATE_BUCKET} />
                <CodeBlock title="create_storage_policies.sql" code={SQL_COMMANDS.STORAGE_POLICIES} />
            </div>

             {/* Always show this for existing users who need to migrate */}
             <div className="space-y-4">
                <div className="flex items-center gap-3"><Database size={18} className="text-indigo-400" /><h3 className="text-lg font-semibold">Schema Migrations (For existing users)</h3></div>
                <p className="text-sm text-slate-500 -mt-2 ml-9">Run this if you have an older version of the table to add all required columns.</p>
                <CodeBlock title="run_migrations.sql" code={SQL_COMMANDS.MIGRATIONS} />
            </div>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-700/50 text-center">
            <p className="text-sm text-slate-500 mb-4">After running these commands, your database will be ready.</p>
            <button
                onClick={onRetry}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 px-6 rounded-lg transition-all flex items-center justify-center gap-2 mx-auto shadow-lg shadow-indigo-900/20"
            >
                <RefreshCw size={16} />
                Retry Connection
            </button>
        </div>
      </div>
    </div>
  );
};

export default SqlSetupModal;