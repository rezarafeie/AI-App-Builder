
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Project, User, RafieiCloudProject } from '../types';
import { cloudService, DatabaseSetupError } from '../services/cloudService';
import { rafieiCloudService } from '../services/rafieiCloudService';
import { useTranslation } from '../utils/translations';
import PreviewCanvas from './PreviewCanvas';
import SqlSetupModal from './SqlSetupModal';
import PromptInputBox from './PromptInputBox';
import { Rocket, Cloud, LogOut, RefreshCw, Plus, Trash2, Globe, Sparkles, LayoutGrid, Database, Loader2, Recycle, Undo2, X, Save, Settings, Check, AlertTriangle, Shield, Unplug, Power, ExternalLink } from 'lucide-react';

interface DashboardProps {
  user: User;
  onLogout: () => void;
  view?: 'active' | 'trash';
}

const ADMIN_EMAILS = ['rezarafeie13@gmail.com'];

interface CloudDetailsModalProps {
    onClose: () => void;
    rafieiProject?: RafieiCloudProject | null;
    customConfig?: { url: string; key: string } | null;
    onDisconnect: () => Promise<void>;
    projectId?: string; // Add projectId to link to full page
    navigate: (path: string) => void;
}

const CloudDetailsModal: React.FC<CloudDetailsModalProps> = ({ onClose, rafieiProject, customConfig, onDisconnect, projectId, navigate }) => {
    
    const handleDisconnect = async () => {
        if (window.confirm("Are you sure? Disconnecting affects all projects using this global configuration.")) {
            await onDisconnect();
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#1e293b] border border-slate-700 rounded-2xl shadow-2xl p-6 w-full max-w-md animate-in fade-in zoom-in-95">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Cloud size={20} className="text-emerald-400"/> Rafiei Cloud
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20}/></button>
                </div>

                {rafieiProject ? (
                    <div className="space-y-4">
                        <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                             <div className="flex justify-between items-center mb-2">
                                <span className="text-xs text-slate-500 font-medium uppercase">Status</span>
                                {rafieiProject.status === 'ACTIVE' ? (
                                    <span className="text-xs text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full border border-emerald-400/20">Active</span>
                                ) : (
                                    <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full border border-yellow-400/20">{rafieiProject.status}</span>
                                )}
                             </div>
                             <div className="space-y-2">
                                <div>
                                    <div className="text-xs text-slate-500">Project Name</div>
                                    <div className="text-sm font-mono text-slate-300">{rafieiProject.projectName}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-slate-500">Project Ref</div>
                                    <div className="text-sm font-mono text-slate-300">{rafieiProject.projectRef}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-slate-500">Region</div>
                                    <div className="text-sm font-mono text-slate-300 uppercase">{rafieiProject.region}</div>
                                </div>
                             </div>
                        </div>
                        <p className="text-xs text-slate-400">
                            The AI agent has full access to this project to run migrations, manage auth, and store data.
                        </p>
                    </div>
                ) : (
                    <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800 text-sm text-slate-300">
                        <div className="flex items-center gap-2 mb-2 text-yellow-400"><AlertTriangle size={16}/> Manual Connection</div>
                        <p className="text-xs text-slate-400 mb-2">You are connected via a manually provided API Key.</p>
                        <div className="font-mono text-xs break-all bg-black/30 p-2 rounded">{customConfig?.url}</div>
                    </div>
                )}

                <div className="mt-8 flex flex-col gap-3">
                    {/* Link to new Cloud Page if we have a project context, or just link to Supabase if global */}
                    {rafieiProject && (
                         <a 
                            href={`https://supabase.com/dashboard/project/${rafieiProject.projectRef}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="w-full px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/20"
                        >
                            Open Project Settings
                        </a>
                    )}
                    <button 
                        onClick={handleDisconnect}
                        className="w-full px-4 py-2 text-sm bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg flex items-center justify-center gap-2"
                    >
                        <Power size={16} /> Disconnect Global
                    </button>
                </div>
            </div>
        </div>
    );
};

const Dashboard: React.FC<DashboardProps> = ({ user, onLogout, view = 'active' }) => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [dbSetupError, setDbSetupError] = useState<string | null>(null); 
  const [showSqlSetup, setShowSqlSetup] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [trashCount, setTrashCount] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  
  // Cloud Connection States
  const [customBackendConfig, setCustomBackendConfig] = useState<{ url: string; key: string } | null>(null);
  const [rafieiCloudProject, setRafieiCloudProject] = useState<RafieiCloudProject | null>(null);
  const [showCloudDetails, setShowCloudDetails] = useState(false);
  const [isConnectingCloud, setIsConnectingCloud] = useState(false);
  
  const { t, dir, lang, setLanguage } = useTranslation();

  const isAdmin = user && ADMIN_EMAILS.includes(user.email);

  // Check for pending prompt from Landing Page
  useEffect(() => {
      const pending = sessionStorage.getItem('rafiei_pending_prompt');
      if (pending) {
          try {
              const { content, images } = JSON.parse(pending);
              sessionStorage.removeItem('rafiei_pending_prompt');
              // Small delay to ensure UI is ready
              setTimeout(() => {
                  handleCreateProject(content, images);
              }, 500);
          } catch (e) {
              console.error("Failed to parse pending prompt", e);
          }
      }
  }, []);

  useEffect(() => {
      const loadSettings = async () => {
          // 1. Get Settings (URL/Key)
          const settings = await cloudService.getUserSettings(user.id);
          setCustomBackendConfig(settings);
          // In dashboard context, we don't have a specific rafiei project unless we fetch it from a list,
          // but here we are checking for GLOBAL settings.
      };
      loadSettings();
  }, [user.id]);

  const fetchProjects = async () => {
      if (isSyncing) return;
      setIsSyncing(true);
      setDbSetupError(null);
      try {
          let fetchedProjects: Project[] = [];
          if (view === 'trash') {
             fetchedProjects = await cloudService.getTrashedProjects(user.id);
          } else {
             fetchedProjects = await cloudService.getProjects(user.id);
          }
          setProjects(fetchedProjects);

          if (view === 'active') {
             const count = await cloudService.getTrashCount(user.id);
             setTrashCount(count);
          }
      } catch (err: any) {
          if (err instanceof DatabaseSetupError) {
              if (err.message) {
                   setDbSetupError(err.message);
              }
              if (isAdmin && (err.message === 'TABLE_MISSING' || err.message.includes('Recursion'))) {
                   setShowSqlSetup(true);
              }
          } else {
              console.error("Failed to fetch projects:", err);
          }
      } finally {
          setIsSyncing(false);
      }
  };

  useEffect(() => {
    fetchProjects();
    const { unsubscribe } = cloudService.subscribeToUserProjects(user.id, (payload) => {
        fetchProjects();
    });
    return () => unsubscribe();
  }, [user.id, view]);

  const handleConnectCloud = async () => {
      setIsConnectingCloud(true);
      try {
          // 1. Provision Project
          let project = await rafieiCloudService.createProject(user);
          
          // 2. Poll for Active state (using correct service logic)
          // We wait up to 5 minutes, checking every 5 seconds.
          const startTime = Date.now();
          const timeout = 300000; // 5 minutes
          
          let isReady = false;

          while (Date.now() - startTime < timeout) {
               // Wait 5 seconds
               await new Promise(r => setTimeout(r, 5000));
               
               // Sync status via Service (checks health + keys)
               project = await rafieiCloudService.syncProjectStatus(project);
               
               if (project.status === 'ACTIVE' && project.publishableKey && project.secretKey) {
                   // 3. Verify Database API is actually responsive (PostgREST)
                   const apiReady = await rafieiCloudService.waitForPostgrest(project.projectRef, project.secretKey);
                   if (apiReady) {
                       isReady = true;
                       break;
                   }
               }
          }

          if (isReady && project.publishableKey) {
              const url = `https://${project.projectRef}.supabase.co`;
              const key = project.publishableKey;
              
              await cloudService.saveUserSettings(user.id, { url, key });
              setCustomBackendConfig({ url, key });
              setRafieiCloudProject(project);
          } else {
              throw new Error("Provisioning timed out. The infrastructure is taking longer than expected. Please try again in a few minutes.");
          }

      } catch (error: any) {
          console.error(error);
          alert("Failed to create Rafiei Cloud project. " + error.message);
      } finally {
          setIsConnectingCloud(false);
      }
  };

  const handleDisconnect = async () => {
      await cloudService.saveUserSettings(user.id, null);
      setCustomBackendConfig(null);
      setRafieiCloudProject(null);
  };

  const handleCreateProject = async (content: string, images: { url: string; base64: string }[]) => {
    setIsCreating(true);
    try {
        const projectId = await cloudService.createNewProjectAndInitiateBuild(user, content, images);
        navigate(`/project/${projectId}`);
    } catch (error) {
        console.error("Failed to create project:", error);
        alert("There was an error creating your project. Please try again.");
        setIsCreating(false);
    }
  };

  const handleSoftDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("Move this project to trash?")) return;
    
    setActionId(id);
    setProjects(prev => prev.filter(p => p.id !== id));
    
    try {
        await cloudService.softDeleteProject(id);
        setTrashCount(prev => prev + 1);
    } catch (error: any) {
        console.error("Soft delete failed:", error);
        fetchProjects(); // Revert on failure by refetching
        alert(`Failed to move to trash. Error: ${error.message || 'Unknown error'}`);
    } finally {
        setActionId(null);
    }
  };

  const handleRestore = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActionId(id);
    setProjects(prev => prev.filter(p => p.id !== id));
    try {
        await cloudService.restoreProject(id);
        setTrashCount(prev => Math.max(0, prev - 1));
    } catch (error: any) {
        fetchProjects();
        alert("Failed to restore project.");
    } finally {
        setActionId(null);
    }
  };

  const handlePermanentDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("Permanently delete this project? This cannot be undone.")) return;
    
    setActionId(id);
    setProjects(prev => prev.filter(p => p.id !== id));
    
    try {
        await cloudService.deleteProject(id);
        setTrashCount(prev => Math.max(0, prev - 1));
    } catch (error: any) {
        fetchProjects();
        alert("Failed to delete project.");
    } finally {
        setActionId(null);
    }
  };

  return (
        <div className="min-h-screen bg-[#020617] text-slate-200 font-sans selection:bg-indigo-500/30" dir={dir}>
            
            {isAdmin && (
                <SqlSetupModal 
                    isOpen={showSqlSetup} 
                    errorType={dbSetupError} 
                    onRetry={fetchProjects} 
                    onClose={() => setShowSqlSetup(false)}
                />
            )}

            {showCloudDetails && (
                <CloudDetailsModal 
                    onClose={() => setShowCloudDetails(false)}
                    rafieiProject={rafieiCloudProject}
                    customConfig={customBackendConfig}
                    onDisconnect={handleDisconnect}
                    navigate={navigate}
                />
            )}
            
            <header className="sticky top-0 z-30 w-full backdrop-blur-xl bg-[#020617]/80 border-b border-slate-800/50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="bg-indigo-600/10 p-1.5 rounded-lg border border-indigo-500/20">
                            <Rocket size={20} className="text-indigo-400" />
                        </div>
                        <span className="font-semibold text-white tracking-tight text-lg">Rafiei Builder</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="hidden md:flex items-center gap-2">
                            {isSyncing && (
                                <div className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400">
                                    <RefreshCw size={12} className="animate-spin text-indigo-400" /> {t('syncing')}
                                </div>
                            )}
                        </div>
                        <div className="h-4 w-px bg-slate-800 mx-2 hidden sm:block" />
                        <div className="flex items-center gap-3">
                            {isAdmin && (<button onClick={() => setShowSqlSetup(true)} className="hidden md:flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-amber-400 hover:text-white bg-amber-900/10 hover:bg-amber-900/20 border border-amber-700/30 rounded-md transition-colors" title="Admin: System Database Setup"><Shield size={14} /><span>System DB</span></button>)}
                            
                            {customBackendConfig ? (
                                <button 
                                    onClick={() => setShowCloudDetails(true)} 
                                    className="hidden md:flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md transition-colors hover:bg-emerald-500/20"
                                >
                                    <Cloud size={14} />
                                    <span>Global Cloud</span>
                                </button>
                            ) : (
                                <button 
                                    onClick={handleConnectCloud} 
                                    disabled={isConnectingCloud}
                                    className="hidden md:flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-slate-900/50 text-slate-400 border border-slate-800 hover:text-white hover:bg-slate-800 rounded-md transition-colors disabled:opacity-50"
                                >
                                    {isConnectingCloud ? <Loader2 size={14} className="animate-spin"/> : <Cloud size={14} />}
                                    <span>{isConnectingCloud ? 'Provisioning...' : 'Connect to Rafiei Cloud'}</span>
                                </button>
                            )}

                            <button onClick={() => setLanguage(lang === 'en' ? 'fa' : 'en')} className="p-2 text-slate-400 hover:text-white transition-colors" title="Change Language"><Globe size={18} /></button>
                            <div className="flex items-center gap-3 pl-2">
                                <img src={user.avatar} alt="Avatar" className="w-8 h-8 rounded-full ring-2 ring-slate-800 select-none" />
                                <button onClick={onLogout} className="text-slate-400 hover:text-red-400 transition-colors p-1" title={t('logout')}><LogOut size={18} /></button>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
                {view === 'active' && (
                    <div className="w-full max-w-2xl mx-auto mb-16 text-center">
                         <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">Start a new project</h1>
                         <p className="text-slate-500 text-sm mb-6">Describe the application you want to build.</p>
                         <PromptInputBox onSendMessage={handleCreateProject} isThinking={isCreating} />
                    </div>
                )}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-white mb-1 tracking-tight">{view === 'trash' ? t('trash') : t('projects')}</h1>
                        <p className="text-slate-500 text-sm">{view === 'trash' ? t('trashDesc') : t('projectsDesc')}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {view === 'active' ? (<>{trashCount > 0 && (<Link to="/dashboard/trash" className="flex items-center justify-center w-10 h-10 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors border border-transparent hover:border-slate-700" title={t('trash')}><Trash2 size={20} /></Link>)}</>) : (<Link to="/dashboard" className="flex items-center gap-2 text-slate-400 hover:text-white px-4 py-2.5 rounded-lg font-medium transition-colors hover:bg-slate-800"><LayoutGrid size={18} /><span>{t('projects')}</span></Link>)}
                    </div>
                </div>

                {dbSetupError && (<div className="mb-6 p-4 bg-red-900/20 border border-red-800/50 rounded-lg flex items-center gap-3 text-red-300 animate-in fade-in slide-in-from-top-2"><AlertTriangle size={20} className="shrink-0" /><div><p className="font-semibold text-sm">System Connection Issue</p><p className="text-xs opacity-80">Unable to load projects from the platform database. Error: {dbSetupError}</p>{isAdmin && <button onClick={() => setShowSqlSetup(true)} className="text-xs underline mt-1 hover:text-white">Run Setup Wizard</button>}</div></div>)}
                
                {projects.length === 0 && !isSyncing ? (<div className="text-center py-20 bg-slate-900/30 border border-slate-800 border-dashed rounded-2xl animate-in fade-in zoom-in-95 duration-500"><div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-500">{view === 'trash' ? <Recycle size={32} /> : <Rocket size={32} />}</div><h3 className="text-lg font-medium text-white mb-2">{view === 'trash' ? t('emptyTrash') : "No projects yet"}</h3><p className="text-slate-500 max-w-sm mx-auto mb-6">{view === 'trash' ? t('emptyTrashDesc') : "Describe your first project above to start building with AI."}</p></div>) : (<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">{projects.map((project, idx) => (<div key={project.id} onClick={() => view === 'active' && navigate(`/project/${project.id}`)} className={`group bg-[#0f172a] border border-slate-800 rounded-xl overflow-hidden relative flex flex-col h-full transition-all hover:shadow-xl hover:shadow-indigo-900/10 hover:-translate-y-1 ${view === 'active' ? 'cursor-pointer hover:border-indigo-500/50' : 'cursor-default hover:border-red-900/50'}`} style={{ animationDelay: `${idx * 50}ms` }}><div className={`h-44 bg-[#020617] relative overflow-hidden group-hover:opacity-90 transition-opacity ${view === 'trash' ? 'grayscale opacity-60' : ''}`}>{project.code?.javascript ? (<div className="absolute inset-0 w-[400%] h-[400%] scale-[0.25] origin-top-left pointer-events-none select-none grayscale-[30%] group-hover:grayscale-0 transition-all duration-500"><PreviewCanvas code={project.code} /></div>) : (<div className="w-full h-full flex items-center justify-center bg-slate-800/30"><Sparkles className="text-slate-700" size={24} /></div>)}<div className="absolute top-3 right-3 flex flex-col gap-2 items-end">{project.status === 'generating' && view === 'active' && (<div className="flex items-center gap-1.5 bg-indigo-500/90 text-white text-[10px] px-2 py-1 rounded-full font-medium shadow-sm animate-pulse backdrop-blur-sm"><RefreshCw size={10} className="animate-spin" />Building</div>)}{project.publishedUrl && view === 'active' && (<div className="flex items-center gap-1.5 bg-emerald-500/90 text-white text-[10px] px-2 py-1 rounded-full font-medium shadow-sm backdrop-blur-sm"><Globe size={10} />Live</div>)}{view === 'trash' && (<div className="flex items-center gap-1.5 bg-red-500/90 text-white text-[10px] px-2 py-1 rounded-full font-medium shadow-sm backdrop-blur-sm"><Trash2 size={10} />Deleted</div>)}</div></div><div className="p-4 flex flex-col flex-1"><div className="flex justify-between items-start mb-1"><h3 className="font-semibold text-slate-200 truncate pr-2 group-hover:text-indigo-400 transition-colors">{project.name}</h3></div><p className="text-xs text-slate-500 mb-4">{view === 'trash' && project.deletedAt ? `Deleted ${new Date(project.deletedAt).toLocaleDateString()}` : `Edited ${new Date(project.updatedAt).toLocaleDateString()}`}</p>
                <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-800/50">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-600 font-medium">Personal Project</span>
                        {/* Link to Cloud Page from Card if Connected */}
                        {project.rafieiCloudProject?.status === 'ACTIVE' && view === 'active' && (
                             <button onClick={(e) => {e.stopPropagation(); navigate(`/cloud/${project.id}`)}} className="text-xs bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 hover:bg-emerald-500/20 flex items-center gap-1" title="Manage Cloud Backend">
                                 <Database size={10} /> Cloud
                             </button>
                        )}
                    </div>
                    <div className="flex items-center gap-1">{view === 'active' && project.userId === user.id && (<button onClick={(e) => handleSoftDelete(project.id, e)} disabled={actionId === project.id} className="text-slate-500 hover:text-red-400 p-1.5 rounded-md hover:bg-red-500/10 transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 disabled:opacity-50" title="Move to Trash">{actionId === project.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}</button>)}{view === 'trash' && project.userId === user.id && (<><button onClick={(e) => handleRestore(project.id, e)} disabled={actionId === project.id} className="text-slate-500 hover:text-emerald-400 p-1.5 rounded-md hover:bg-emerald-500/10 transition-all disabled:opacity-50" title={t('restore')}>{actionId === project.id ? <Loader2 size={16} className="animate-spin" /> : <Undo2 size={16} />}</button><button onClick={(e) => handlePermanentDelete(project.id, e)} disabled={actionId === project.id} className="text-slate-500 hover:text-red-400 p-1.5 rounded-md hover:bg-red-500/10 transition-all disabled:opacity-50" title={t('deleteForever')}>{actionId === project.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}</button></>)}</div></div></div></div>))}</div>)}
            </main>
        </div>
  );
};

export default Dashboard;
