import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Project, User } from '../types';
import { cloudService, DatabaseSetupError } from '../services/cloudService';
import { useTranslation } from '../utils/translations';
import PreviewCanvas from './PreviewCanvas';
import SqlSetupModal from './SqlSetupModal';
import { Rocket, Cloud, LogOut, RefreshCw, Plus, Trash2, Globe } from 'lucide-react';

interface DashboardProps {
  user: User;
  onLogout: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [dbSetupError, setDbSetupError] = useState<string | null>(null);
  const { t, dir, lang, setLanguage } = useTranslation();

  const fetchProjects = async () => {
      setIsSyncing(true);
      setDbSetupError(null);
      try {
          const fetchedProjects = await cloudService.getProjects(user.id);
          setProjects(fetchedProjects);
      } catch (err: any) {
          if (err instanceof DatabaseSetupError) {
              setDbSetupError(err.message);
          } else {
              console.error("Failed to fetch projects:", err);
          }
      } finally {
          setIsSyncing(false);
      }
  };

  useEffect(() => {
    fetchProjects();
  }, [user.id]);

  const createProject = async () => {
    const newProject: Project = {
      id: crypto.randomUUID(), userId: user.id, name: `${t('newProject')} ${projects.length + 1}`,
      createdAt: Date.now(), updatedAt: Date.now(),
      code: { html: '', javascript: '', css: '', explanation: '' },
      messages: [{ id: 'welcome', role: 'assistant', content: t('welcome'), timestamp: Date.now() }],
      status: 'idle',
      owner: user,
      collaborators: [{...user, projectId: '', role: 'owner'}]
    };
    
    // Optimistic UI update not needed here as we redirect immediately, 
    // but saving first ensures consistency.
    try {
        await cloudService.saveProject(newProject);
        navigate(`/project/${newProject.id}`);
    } catch (e) {
        console.error("Failed to create project", e);
    }
  };

  const deleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this project? This action cannot be undone.")) return;
    setProjects(prev => prev.filter(p => p.id !== id));
    await cloudService.deleteProject(id).catch(console.error);
  };

  if (dbSetupError) return <SqlSetupModal errorType={dbSetupError} onRetry={fetchProjects} />;

  return (
        <div className="min-h-screen bg-[#0f172a] text-white flex flex-col" dir={dir}>
            <div className="border-b border-gray-800 bg-[#1e293b] p-4 flex items-center justify-between sticky top-0 z-20">
                <div className="flex items-center gap-3"><div className="bg-indigo-600 p-2 rounded-lg"><Rocket size={24} /></div><h1 className="text-xl font-bold tracking-tight">NovaBuilder</h1></div>
                <div className="flex items-center gap-4">
                    <div className="hidden md:flex items-center gap-2 text-xs text-gray-400 bg-slate-900/50 px-3 py-1.5 rounded-full border border-gray-700">
                        {isSyncing ? (<><RefreshCw size={12} className="animate-spin" /> {t('syncing')}</>) : (<><Cloud size={12} className="text-green-500" /> {t('cloud')}</>)}
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={() => setLanguage(lang === 'en' ? 'fa' : 'en')} className="p-2 hover:bg-gray-700 rounded-full transition-colors text-gray-400 hover:text-indigo-400"><Globe size={20} /></button>
                        <div className="h-8 w-px bg-gray-700 mx-1"></div>
                        <div className="flex items-center gap-3 pl-1">
                            <div className="text-right hidden sm:block"><div className="text-sm font-medium">{user.name}</div><div className="text-xs text-gray-500">{user.email}</div></div>
                            <img src={user.avatar} alt="Profile" className="w-9 h-9 rounded-full bg-indigo-600 border border-gray-600" />
                            <button onClick={onLogout} className="p-2 hover:bg-gray-700 rounded-full text-gray-400 hover:text-red-400 transition-colors ml-1"><LogOut size={20} /></button>
                        </div>
                    </div>
                </div>
            </div>
            <div className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full">
                <div className="flex items-center justify-between mb-8">
                    <h2 className="text-2xl font-bold flex items-center gap-2">{t('projects')}<span className="text-sm font-normal text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{projects.length}</span></h2>
                    <button onClick={createProject} className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-lg font-medium flex items-center gap-2 shadow-lg shadow-indigo-900/20 transition-all hover:scale-105"><Plus size={20} /> {t('newProject')}</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {projects.map(project => (
                        <div key={project.id} onClick={() => navigate(`/project/${project.id}`)} className="bg-[#1e293b] border border-gray-700 hover:border-indigo-500/50 rounded-xl overflow-hidden cursor-pointer transition-all hover:shadow-xl hover:-translate-y-1 group relative flex flex-col min-h-[220px]">
                            <div className="h-28 bg-gray-800 border-b border-gray-700/50 relative overflow-hidden pointer-events-none">
                                {project.code && project.code.javascript ? (<div className="absolute inset-0 transform scale-[0.25] origin-top-left w-[400%] h-[400%]"><PreviewCanvas code={project.code} /></div>) : (<div className="flex items-center justify-center h-full"><Rocket size={24} className="text-slate-600" /></div>)}
                                {project.publishedUrl && (<div className="absolute bottom-2 left-2 flex items-center gap-1 bg-green-500/20 text-green-300 text-[10px] px-2 py-0.5 rounded-full border border-green-500/30"><div className="w-1.5 h-1.5 rounded-full bg-green-400"></div>Live</div>)}
                            </div>
                            <div className="p-4 flex-1 flex flex-col">
                                <h3 className="font-semibold truncate mb-1">{project.name}</h3>
                                {project.owner && project.owner.id !== user.id && (
                                  <div className="flex items-center gap-1.5 mb-2">
                                    <img src={project.owner.avatar} className="w-4 h-4 rounded-full" />
                                    <p className="text-xs text-gray-500">Shared by {project.owner.name}</p>
                                  </div>
                                )}
                                <p className="text-xs text-gray-500 mb-4 flex-1">Edited {new Date(project.updatedAt).toLocaleDateString()}</p>
                                <div className="mt-auto flex items-center justify-between">
                                    <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-1 rounded border border-slate-700">React App</span>
                                    {project.owner?.id === user.id && <button onClick={(e) => deleteProject(project.id, e)} className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={16} /></button>}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
  );
};

export default Dashboard;