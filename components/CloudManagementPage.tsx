
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { RafieiCloudProject, Project, User } from '../types';
import { cloudService } from '../services/cloudService';
import { rafieiCloudService } from '../services/rafieiCloudService';
import { 
    Cloud, Database, Users, HardDrive, Zap, Bot, Key, FileText, 
    ArrowLeft, Loader2, RefreshCw, Plus, Trash2, Check, AlertTriangle, Play, Power, Activity
} from 'lucide-react';

interface CloudManagementPageProps {
  user: User;
}

type TabId = 'overview' | 'database' | 'users' | 'storage' | 'functions' | 'ai' | 'secrets' | 'logs';

const CloudManagementPage: React.FC<CloudManagementPageProps> = ({ user }) => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  
  const [project, setProject] = useState<Project | null>(null);
  const [cloudProject, setCloudProject] = useState<RafieiCloudProject | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  // Tab specific input states
  const [sqlQuery, setSqlQuery] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');

  useEffect(() => {
    const loadProject = async () => {
        if (!projectId) return;
        try {
            const p = await cloudService.getProject(projectId);
            if (p) {
                setProject(p);
                setCloudProject(p.rafieiCloudProject || null);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };
    loadProject();
  }, [projectId]);

  const fetchData = async () => {
    if (!cloudProject) return;
    setTabLoading(true);
    setError(null);
    setData(null);
    setIsPaused(false);
    
    try {
        const ref = cloudProject.projectRef;
        let result;
        
        switch (activeTab) {
            case 'overview':
                try {
                    result = await rafieiCloudService.getProjectHealth(ref);
                } catch (e: any) {
                    console.error("Health check failed", e);
                    if (e.message && (e.message.includes('ECONNREFUSED') || e.message.includes('400'))) {
                        setIsPaused(true);
                        result = { state: 'PAUSED_OR_UNREACHABLE', error: e.message };
                    } else {
                        throw e;
                    }
                }
                break;
            case 'database':
                result = await rafieiCloudService.getTables(ref);
                break;
            case 'users':
                result = await rafieiCloudService.getAuthUsers(ref);
                break;
            case 'storage':
                result = await rafieiCloudService.getStorageBuckets(ref);
                break;
            case 'functions':
                result = await rafieiCloudService.getEdgeFunctions(ref);
                break;
            case 'ai':
                result = await rafieiCloudService.getAiSettings(ref);
                break;
            case 'secrets':
                result = await rafieiCloudService.getApiKeys(ref);
                break;
            case 'logs':
                result = await rafieiCloudService.getLogs(ref);
                break;
        }
        setData(result);
    } catch (err: any) {
        console.error("Tab fetch failed", err);
        const errMsg = err.message || "Failed to load data";
        setError(errMsg);
        if (errMsg.includes('ECONNREFUSED') || errMsg.includes('5432') || errMsg.includes('Statement reached its timeout')) {
            setIsPaused(true);
        }
    } finally {
        setTabLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab, cloudProject]);

  const handleWakeUp = async () => {
      setTabLoading(true);
      setTimeout(() => {
          fetchData();
      }, 3000);
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-[#0f172a] text-white"><Loader2 className="animate-spin" /></div>;
  if (!project || !cloudProject) return <div className="h-screen flex items-center justify-center bg-[#0f172a] text-white">Project not found or not connected to Cloud.</div>;

  const tabs: {id: TabId, label: string, icon: React.ReactNode}[] = [
      { id: 'overview', label: 'Overview', icon: <Cloud size={18} /> },
      { id: 'database', label: 'Database', icon: <Database size={18} /> },
      { id: 'users', label: 'Users', icon: <Users size={18} /> },
      { id: 'storage', label: 'Storage', icon: <HardDrive size={18} /> },
      { id: 'functions', label: 'Edge Functions', icon: <Zap size={18} /> },
      { id: 'ai', label: 'AI', icon: <Bot size={18} /> },
      { id: 'secrets', label: 'Secrets', icon: <Key size={18} /> },
      { id: 'logs', label: 'Logs', icon: <FileText size={18} /> },
  ];

  const handleExecuteSql = async () => {
      if(!sqlQuery.trim()) return;
      setTabLoading(true);
      // Run as background promise (in memory)
      rafieiCloudService.executeSql(cloudProject.projectRef, sqlQuery)
        .then(async () => {
            alert("Query executed successfully");
            setSqlQuery('');
            const res = await rafieiCloudService.getTables(cloudProject.projectRef);
            setData(res);
        })
        .catch(e => alert(`Error: ${e.message}`))
        .finally(() => setTabLoading(false));
  };

  const handleAddUser = async () => {
      if(!newUserEmail.trim()) return;
      setTabLoading(true);
      // Run as background promise (in memory)
      rafieiCloudService.createUser(cloudProject.projectRef, newUserEmail)
        .then(async () => {
             setNewUserEmail('');
             const res = await rafieiCloudService.getAuthUsers(cloudProject.projectRef);
             setData(res);
        })
        .catch(e => alert(`Error: ${e.message}`))
        .finally(() => setTabLoading(false));
  };

  return (
    <div className="flex h-screen bg-[#0f172a] text-slate-200 font-sans overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-[#1e293b] border-r border-slate-700 flex flex-col shrink-0">
            <div className="p-4 border-b border-slate-700 flex items-center gap-2">
                 <button onClick={() => navigate(`/project/${projectId}`)} className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors">
                     <ArrowLeft size={20} />
                 </button>
                 <span className="font-bold text-white truncate">{project.name} Cloud</span>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </nav>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
            <header className="h-16 border-b border-slate-700 bg-[#0f172a] flex items-center justify-between px-8">
                <h2 className="text-xl font-semibold text-white capitalize flex items-center gap-2">
                    {tabs.find(t => t.id === activeTab)?.icon}
                    {tabs.find(t => t.id === activeTab)?.label}
                </h2>
                <div className="flex items-center gap-2">
                    {isPaused ? (
                        <span className="flex items-center gap-1.5 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-2 py-1 rounded-full">
                            <Power size={12} /> Paused / Sleeping
                        </span>
                    ) : (
                        <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-full">{cloudProject.status}</span>
                    )}
                    <span className="text-xs text-slate-500 font-mono">{cloudProject.region}</span>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-8">
                {tabLoading ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-500 gap-3">
                        <Loader2 className="animate-spin text-indigo-500" size={32} />
                        <p>{isPaused ? "Waking up database..." : "Processing..."}</p>
                    </div>
                ) : isPaused ? (
                    <div className="flex flex-col items-center justify-center h-full p-8 text-center max-w-lg mx-auto">
                        <div className="bg-yellow-500/10 p-4 rounded-full mb-4">
                            <Activity size={48} className="text-yellow-500" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">Project Paused</h3>
                        <p className="text-slate-400 mb-6">
                            The database is currently paused or unreachable (ECONNREFUSED). This usually happens with free tier projects after inactivity.
                        </p>
                        <button 
                            onClick={handleWakeUp}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/20"
                        >
                            <RefreshCw size={20} />
                            Wake Up Database
                        </button>
                    </div>
                ) : error ? (
                    <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg flex items-start gap-3 text-red-300">
                        <AlertTriangle className="shrink-0 mt-0.5" />
                        <div>
                            <p className="font-bold">Error loading data</p>
                            <p className="text-sm opacity-80 break-all font-mono mt-1">{error}</p>
                            <p className="text-xs mt-3 opacity-60 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                Possible causes: Project paused, network firewall, or invalid API permissions.
                            </p>
                            <button onClick={() => fetchData()} className="mt-3 text-xs bg-red-500/20 hover:bg-red-500/30 px-3 py-1.5 rounded text-white transition-colors">
                                Retry Connection
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="max-w-5xl mx-auto space-y-6">
                        {/* OVERVIEW */}
                        {activeTab === 'overview' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
                                    <h3 className="text-lg font-medium text-white mb-4">Project Details</h3>
                                    <div className="space-y-4">
                                        <div className="flex justify-between border-b border-slate-700 pb-2">
                                            <span className="text-slate-400">Name</span>
                                            <span className="font-mono text-white">{cloudProject.projectName}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-slate-700 pb-2">
                                            <span className="text-slate-400">Reference ID</span>
                                            <span className="font-mono text-white">{cloudProject.projectRef}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-slate-700 pb-2">
                                            <span className="text-slate-400">Region</span>
                                            <span className="font-mono text-white uppercase">{cloudProject.region}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
                                    <h3 className="text-lg font-medium text-white mb-4">Health Status</h3>
                                    {data ? (
                                        <pre className="text-xs text-green-300 font-mono whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
                                    ) : <span className="text-slate-500">No health data available</span>}
                                </div>
                            </div>
                        )}

                        {/* DATABASE */}
                        {activeTab === 'database' && (
                            <div className="space-y-6">
                                <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
                                    <h3 className="text-lg font-medium text-white mb-4">Execute SQL</h3>
                                    <textarea 
                                        value={sqlQuery}
                                        onChange={(e) => setSqlQuery(e.target.value)}
                                        placeholder="CREATE TABLE posts (id uuid primary key...)" 
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 font-mono text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 h-32 mb-3"
                                    />
                                    <button onClick={handleExecuteSql} disabled={!sqlQuery.trim()} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50">
                                        <Play size={16} /> Execute (Background)
                                    </button>
                                </div>

                                <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                                    <div className="p-4 border-b border-slate-700 font-medium">Tables</div>
                                    <div className="p-4">
                                        {Array.isArray(data) && data.length > 0 ? (
                                            <div className="grid gap-2">
                                                {data.map((table: any, idx: number) => (
                                                    <div key={idx} className="flex justify-between items-center p-3 bg-slate-900/50 rounded-lg border border-slate-700/50">
                                                        <span className="font-mono text-indigo-300">{table.name || JSON.stringify(table)}</span>
                                                        <span className="text-xs text-slate-500">{table.schema || 'public'}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : <div className="text-slate-500 text-sm">No tables found or raw JSON returned.</div>}
                                        
                                        {!Array.isArray(data) && data && (
                                            <pre className="mt-4 text-xs text-slate-400 overflow-x-auto">{JSON.stringify(data, null, 2)}</pre>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* USERS */}
                        {activeTab === 'users' && (
                            <div className="space-y-6">
                                <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 flex gap-4 items-end">
                                    <div className="flex-1">
                                        <label className="block text-xs font-medium text-slate-400 mb-1">Invite User (Email)</label>
                                        <input 
                                            type="email" 
                                            value={newUserEmail}
                                            onChange={(e) => setNewUserEmail(e.target.value)}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-sm"
                                        />
                                    </div>
                                    <button onClick={handleAddUser} disabled={!newUserEmail} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 mb-[1px] disabled:opacity-50">
                                        <Plus size={16} /> Add User
                                    </button>
                                </div>
                                <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-900 text-slate-400">
                                            <tr>
                                                <th className="p-4">ID</th>
                                                <th className="p-4">Email</th>
                                                <th className="p-4">Created At</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-700">
                                            {Array.isArray(data?.users) ? data.users.map((u: any) => (
                                                <tr key={u.id}>
                                                    <td className="p-4 font-mono text-xs text-slate-500">{u.id}</td>
                                                    <td className="p-4 text-white">{u.email}</td>
                                                    <td className="p-4 text-slate-400">{new Date(u.created_at).toLocaleDateString()}</td>
                                                </tr>
                                            )) : (
                                                <tr><td colSpan={3} className="p-4 text-slate-500 text-center">No users found</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* GENERIC JSON RENDERER FOR OTHER TABS */}
                        {['storage', 'functions', 'ai', 'secrets', 'logs'].includes(activeTab) && (
                            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
                                <h3 className="text-lg font-medium text-white mb-4 capitalize">{activeTab} Data</h3>
                                <pre className="bg-slate-950 p-4 rounded-lg overflow-x-auto text-xs font-mono text-green-400 border border-slate-800">
                                    {JSON.stringify(data, null, 2)}
                                </pre>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    </div>
  );
};

export default CloudManagementPage;
