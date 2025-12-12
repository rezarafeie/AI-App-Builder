
import React, { useState, useEffect } from 'react';
import { Database, Shield, Copy, Check, RefreshCw, AlertTriangle, Clock, Users, Terminal, CheckCircle2, Play, X, Settings, ChevronDown, ChevronUp, Cloud } from 'lucide-react';
import { cloudService } from '../services/cloudService';

interface SqlSetupModalProps {
  errorType?: 'TABLE_MISSING' | 'RLS_POLICY_MISSING' | 'NETWORK_ERROR' | string | null;
  onRetry: () => void;
  isOpen?: boolean;
  onClose?: () => void;
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
  custom_domain TEXT,
  supabase_config JSONB,
  rafiei_cloud_project JSONB
);`,
  MIGRATIONS: `ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS build_state JSONB;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS published_url TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS custom_domain TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS rafiei_cloud_project JSONB;

-- Add deleted_at as TIMESTAMPTZ if it doesn't exist.
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Robustly correct all timestamp columns to ensure they are of type TIMESTAMPTZ
DO $$
BEGIN
  -- Fix created_at if it is BIGINT
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='created_at' AND data_type='bigint') THEN
    ALTER TABLE public.projects ALTER COLUMN created_at TYPE TIMESTAMPTZ USING (to_timestamp(created_at / 1000.0));
  END IF;

  -- Fix updated_at if it is BIGINT
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='updated_at' AND data_type='bigint') THEN
    ALTER TABLE public.projects ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING (to_timestamp(updated_at / 1000.0));
  END IF;

  -- Fix deleted_at if it is BIGINT
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='deleted_at' AND data_type='bigint') THEN
    ALTER TABLE public.projects ALTER COLUMN deleted_at TYPE TIMESTAMPTZ USING (to_timestamp(deleted_at / 1000.0));
  END IF;
END;
$$;`,
  ENABLE_RLS: `ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;`,
  POLICIES: `-- This is the definitive fix for recursion errors.
-- It programmatically finds and drops ALL policies on the projects table before recreating them.
DO $$
DECLARE
    policy_name TEXT;
BEGIN
    -- Loop through all policies on the 'projects' table in the 'public' schema
    FOR policy_name IN
        SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'projects'
    LOOP
        -- Dynamically execute DROP POLICY for each policy found
        EXECUTE 'DROP POLICY IF EXISTS "' || policy_name || '" ON public.projects;';
    END LOOP;
END;
$$;

-- After purging all old policies, recreate the essential ones.
CREATE POLICY "Projects are viewable by owner" ON public.projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create projects" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners can update their own projects" ON public.projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Owners can delete their own projects" ON public.projects FOR DELETE USING (auth.uid() = user_id);`,
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
  CREATE_RAFIEI_CLOUD_TABLE: `CREATE TABLE IF NOT EXISTS public.rafiei_cloud_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  project_ref TEXT NOT NULL,
  project_name TEXT NOT NULL,
  status TEXT DEFAULT 'CREATING',
  region TEXT,
  db_pass TEXT,
  publishable_key TEXT,
  secret_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.rafiei_cloud_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their cloud projects" ON public.rafiei_cloud_projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert cloud projects" ON public.rafiei_cloud_projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update cloud projects" ON public.rafiei_cloud_projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete cloud projects" ON public.rafiei_cloud_projects FOR DELETE USING (auth.uid() = user_id);`
};

interface SetupStep {
    id: string;
    title: string;
    icon: React.ReactNode;
    desc: string;
    sql: string;
    verify: () => Promise<boolean>;
}

const CodeBlock: React.FC<{ code: string }> = ({ code }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden my-2">
            <div className="flex justify-between items-center px-3 py-2 border-b border-slate-800 bg-slate-900/50">
                <span className="text-xs text-slate-400 font-mono">SQL</span>
                <button onClick={handleCopy} className="text-xs flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 transition-colors">
                    {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                    {copied ? 'Copied' : 'Copy'}
                </button>
            </div>
            <pre className="p-3 text-xs text-slate-300 overflow-x-auto font-mono leading-relaxed"><code>{code}</code></pre>
        </div>
    );
};

const SqlSetupModal: React.FC<SqlSetupModalProps> = ({ errorType, onRetry, isOpen, onClose }) => {
  // If no explicit open prop is passed, check if there is an error
  const shouldShow = isOpen || !!errorType;
  const [stepStatus, setStepStatus] = useState<Record<string, 'pending' | 'verifying' | 'verified' | 'failed'>>({});
  const [showSql, setShowSql] = useState<Record<string, boolean>>({});
  
  const steps: SetupStep[] = [
      {
          id: 'projects_table',
          title: "Projects Table",
          icon: <Database size={18}/>,
          desc: "Creates the main table to store your applications.",
          sql: SQL_COMMANDS.CREATE_TABLE,
          verify: async () => await cloudService.checkTableExists('projects')
      },
      {
        id: 'migrations',
        title: "Migrations & Schema Updates",
        icon: <RefreshCw size={18}/>,
        desc: "Adds necessary columns (e.g. deleted_at, custom_domain, rafiei_cloud_project) to the projects table.",
        sql: SQL_COMMANDS.MIGRATIONS,
        verify: async () => true 
      },
      {
        id: 'rafiei_cloud',
        title: "Rafiei Cloud Table",
        icon: <Cloud size={18}/>,
        desc: "Table to store managed Supabase PaaS project credentials.",
        sql: SQL_COMMANDS.CREATE_RAFIEI_CLOUD_TABLE,
        verify: async () => await cloudService.checkTableExists('rafiei_cloud_projects')
      },
      {
        id: 'rls',
        title: "Security Policies (RLS)",
        icon: <Shield size={18}/>,
        desc: "Enables Row Level Security so users only see their own data.",
        sql: `${SQL_COMMANDS.ENABLE_RLS}\n\n${SQL_COMMANDS.POLICIES}`,
        verify: async () => {
             return await cloudService.checkTableExists('projects'); 
        }
      },
      {
        id: 'automation',
        title: "Automation Triggers",
        icon: <Clock size={18}/>,
        desc: "Updates timestamps automatically when projects change.",
        sql: SQL_COMMANDS.UPDATE_TRIGGER,
        verify: async () => true 
      }
  ];

  // Initial check on mount
  useEffect(() => {
      if (shouldShow) {
          steps.forEach(async (step) => {
              try {
                  const exists = await step.verify();
                  if (exists) {
                      setStepStatus(prev => ({ ...prev, [step.id]: 'verified' }));
                  }
              } catch(e) {}
          });
      }
  }, [shouldShow]);

  const handleVerifyStep = async (step: SetupStep) => {
      setStepStatus(prev => ({ ...prev, [step.id]: 'verifying' }));
      try {
          const result = await step.verify();
          if (result) {
              setStepStatus(prev => ({ ...prev, [step.id]: 'verified' }));
          } else {
               setStepStatus(prev => ({ ...prev, [step.id]: 'failed' }));
          }
      } catch (e) {
          setStepStatus(prev => ({ ...prev, [step.id]: 'failed' }));
      }
  };
  
  const toggleSql = (id: string) => {
      setShowSql(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (!shouldShow) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 text-white overflow-hidden">
      <div className="w-full max-w-4xl bg-[#1e293b] border border-slate-700 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-700 flex justify-between items-start">
            <div className="flex items-start gap-4">
                <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
                    <Terminal size={24} className="text-indigo-400" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-white mb-1">Database Setup & Health</h1>
                    <p className="text-slate-400 text-sm">
                        Run these SQL commands in your Supabase SQL Editor to configure the backend.
                    </p>
                </div>
            </div>
            {onClose && (
                <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 transition-colors">
                    <X size={20} />
                </button>
            )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {errorType === 'NETWORK_ERROR' ? (
                <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-4 mb-6 animate-in fade-in">
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-red-500/10 rounded-lg mt-1">
                            <AlertTriangle size={20} className="text-red-400" />
                        </div>
                        <div>
                            <h3 className="font-bold text-red-300">Network Error: Connection Failed</h3>
                            <p className="text-sm text-red-200 mt-1">The app could not connect to your Supabase project. This is often a CORS issue.</p>
                            <p className="text-xs text-red-200/80 mt-3">
                                <strong>How to Fix:</strong> Go to your Supabase Dashboard ➡️ <strong>API Settings</strong> ➡️ <strong>CORS Configuration</strong> and add this app's URL as an allowed origin. Use <strong>*</strong> for local testing if necessary.
                            </p>
                        </div>
                    </div>
                </div>
            ) : errorType && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 flex items-center gap-3 text-yellow-200 mb-6">
                    <AlertTriangle size={20} />
                    <span>System detected a configuration issue: <strong>{errorType}</strong></span>
                </div>
            )}

            <div className="grid gap-6">
                {steps.map((step) => {
                    const status = stepStatus[step.id] || 'pending';
                    const isVerified = status === 'verified';
                    const isSqlVisible = showSql[step.id] || !isVerified;
                    
                    return (
                        <div key={step.id} className={`border rounded-xl transition-all duration-300 ${isVerified ? 'bg-slate-900/30 border-slate-800' : 'bg-slate-800/50 border-slate-700'}`}>
                            <div className="p-4 flex items-start gap-4">
                                <div className={`mt-1 p-2 rounded-lg ${isVerified ? 'bg-green-500/10 text-green-400' : 'bg-slate-700 text-slate-400'}`}>
                                    {isVerified ? <CheckCircle2 size={18} /> : step.icon}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-1">
                                        <h3 className={`font-semibold ${isVerified ? 'text-slate-300' : 'text-white'}`}>{step.title}</h3>
                                        <div className="flex items-center gap-2">
                                            {status === 'failed' && <span className="text-xs text-red-400 font-medium">Verification Failed</span>}
                                            
                                            {isVerified ? (
                                                 <div className="flex items-center gap-2">
                                                     <span className="text-xs bg-green-500/10 text-green-400 px-2 py-1 rounded-full border border-green-500/20 flex items-center gap-1">
                                                         <Check size={12} /> Installed
                                                     </span>
                                                     <button onClick={() => toggleSql(step.id)} className="text-xs text-slate-500 hover:text-indigo-400 transition-colors underline flex items-center gap-1">
                                                         {isSqlVisible ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
                                                         {isSqlVisible ? 'Hide SQL' : 'View SQL'}
                                                     </button>
                                                 </div>
                                            ) : (
                                                <button 
                                                    onClick={() => handleVerifyStep(step)}
                                                    className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded-md transition-all disabled:opacity-50"
                                                    disabled={status === 'verifying'}
                                                >
                                                    {status === 'verifying' ? <RefreshCw size={12} className="animate-spin"/> : <Play size={12}/>}
                                                    {status === 'verifying' ? 'Checking...' : 'Verify'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-sm text-slate-500 mb-3">{step.desc}</p>
                                    
                                    {isSqlVisible && (
                                        <div className="animate-in fade-in slide-in-from-top-2">
                                            <CodeBlock code={step.sql} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-700/50 bg-slate-800/30 flex justify-between items-center">
            <span className="text-xs text-slate-500">
                Connection Status: <span className={errorType === 'NETWORK_ERROR' ? 'text-red-400' : 'text-emerald-400'}>{errorType === 'NETWORK_ERROR' ? 'Connection Failed' : 'Connected to Supabase'}</span>
            </span>
            <button
                onClick={onRetry}
                className="bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 px-6 rounded-lg transition-all flex items-center gap-2"
            >
                <RefreshCw size={16} />
                Refresh Connection
            </button>
        </div>
      </div>
    </div>
  );
};

export default SqlSetupModal;