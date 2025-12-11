import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Project, Message, ViewMode, User, Suggestion } from '../types';
import { handleUserRequest, generateProjectTitle, generateSuggestions, SupervisorCallbacks } from '../services/geminiService';
import { cloudService } from '../services/cloudService';
import { useTranslation } from '../utils/translations';
import ChatInterface from './ChatInterface';
import PreviewCanvas from './PreviewCanvas';
import CodeEditor from './CodeEditor';
import PublishDropdown from './PublishDropdown';
import ManageDomainsModal from './ManageDomainsModal';
import { ArrowLeft, MessageSquare, Eye, Monitor, Tablet, Smartphone, Globe, Loader2 } from 'lucide-react';

type DeviceMode = 'desktop' | 'tablet' | 'mobile';

interface BuildState {
    plan: string[];
    currentStep: number;
    error: string | null;
}

interface ProjectBuilderProps {
  user: User;
}

const ProjectBuilder: React.FC<ProjectBuilderProps> = ({ user }) => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [isThinking, setIsThinking] = useState(false);
  const [buildState, setBuildState] = useState<BuildState | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [mobileTab, setMobileTab] = useState<'chat' | 'preview'>('chat');
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('desktop');
  
  const [showPublishDropdown, setShowPublishDropdown] = useState(false);
  const [showManageDomains, setShowManageDomains] = useState(false);
  
  const desktopPublishRef = useRef<HTMLDivElement>(null);
  const mobilePublishRef = useRef<HTMLDivElement>(null);
  
  const { t, dir } = useTranslation();

  const isFirstGeneration = isThinking && project ? (!project.code.html && !project.code.javascript) : false;

  const fetchProject = async () => {
      if (!projectId) return;
      try {
          const p = await cloudService.getProject(projectId);
          if (p) {
              setProject(p);
          } else {
              // Project not found or no access
              navigate('/dashboard');
          }
      } catch (err) {
          console.error("Failed to load project:", err);
          navigate('/dashboard');
      } finally {
          setLoading(false);
      }
  };

  useEffect(() => {
    fetchProject();
  }, [projectId]);

  // Dropdown close logic
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const inDesktop = desktopPublishRef.current?.contains(target);
      const inMobile = mobilePublishRef.current?.contains(target);
      if (!inDesktop && !inMobile) {
        setShowPublishDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleStopGeneration = () => {
    setIsThinking(false);
    setBuildState(null);
  };

  const handleRetry = (prompt: string) => {
      if(project) {
          const updated = {...project, messages: project.messages.slice(0, -1)};
          setProject(updated);
          handleSendMessage(prompt);
      }
  };

  const handleAutoFix = () => {
      if (project) {
          handleSendMessage("The current code seems to have an error. Please analyze it, find the root cause, and provide a complete fix.");
      }
  };

  const handleSendMessage = async (content: string) => {
    if (!project || !user) return;
    
    // Optimistic update
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content, timestamp: Date.now() };
    const updatedProject = { ...project, messages: [...project.messages, userMsg], updatedAt: Date.now() };
    setProject(updatedProject);
    
    setIsThinking(true);
    setBuildState({ plan: [], currentStep: 0, error: null });
    setSuggestions([]); // Clear suggestions while thinking

    // Generate title if it's the first message
    if (updatedProject.messages.filter(m => m.role === 'user').length === 1) {
        generateProjectTitle(content).then(title => {
            setProject(prev => prev ? {...prev, name: title} : null);
        });
    }

    const callbacks: SupervisorCallbacks = {
        onPlanUpdate: (plan) => setBuildState(prev => prev ? { ...prev, plan } : { plan, currentStep: 0, error: null }),
        onStepStart: (stepIndex) => setBuildState(prev => prev ? { ...prev, currentStep: stepIndex, error: null } : null),
        onChunkComplete: (code, explanation) => {
            const aiMsg: Message = { id: crypto.randomUUID(), role: 'assistant', content: explanation, timestamp: Date.now() };
            setProject(prev => prev ? { ...prev, code, messages: [...prev.messages, aiMsg] } : null);
        },
        onSuccess: async (finalCode, finalExplanation) => {
            const aiMsg: Message = { id: crypto.randomUUID(), role: 'assistant', content: finalExplanation, timestamp: Date.now() };
            
            // Save final state
            setProject(prev => {
                if (!prev) return null;
                const completed = { ...prev, code: finalCode, messages: [...prev.messages, aiMsg], status: 'idle' } as Project;
                cloudService.saveProject(completed).catch(console.error);
                return completed;
            });
            setIsThinking(false); 
            setBuildState(null);

            // Generate next suggestions
            try {
                const nextSteps = await generateSuggestions([...updatedProject.messages, aiMsg], finalCode);
                setSuggestions(nextSteps);
            } catch (err) {
                console.error("Error generating suggestions:", err);
            }
        },
        onError: (error, retriesLeft) => setBuildState(prev => prev ? { ...prev, error: `${error} Retrying...` } : null),
        onFinalError: (error) => {
            const errorMsg: Message = { id: crypto.randomUUID(), role: 'assistant', content: `Error: ${error}`, timestamp: Date.now() };
            setProject(prev => {
                if (!prev) return null;
                const failed = { ...prev, messages: [...prev.messages, errorMsg], status: 'idle' } as Project;
                cloudService.saveProject(failed).catch(console.error);
                return failed;
            });
            setIsThinking(false); setBuildState(null);
        }
    };

    try {
        await handleUserRequest(content, updatedProject.messages, updatedProject.code, callbacks);
        // We also save after initiating request to persist the user message
        await cloudService.saveProject(updatedProject);
    } catch (e) {
        console.error("Error in generation:", e);
        setIsThinking(false);
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-[#0f172a] text-white"><Loader2 className="animate-spin" size={32} /></div>;
  if (!project) return null;

  const deviceSizeClass = deviceMode === 'desktop' ? 'w-full h-full' : deviceMode === 'tablet' ? 'w-[768px] h-full max-w-full mx-auto' : 'w-[375px] h-[667px] max-w-full mx-auto';

  return (
    <div className="flex flex-col h-screen bg-[#0f172a] text-white overflow-hidden" dir={dir}>
        {/* Header - Hidden on Mobile */}
        <div className="hidden md:flex h-14 bg-[#0f172a] border-b border-gray-700 items-center justify-between px-4 z-20 shrink-0">
            <div className="flex items-center gap-2">
                <button onClick={() => navigate('/dashboard')} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors flex items-center gap-2">
                    <ArrowLeft size={18} /><span className="text-sm font-medium hidden sm:inline">Dashboard</span>
                </button>
                <div className="h-6 w-px bg-gray-700 hidden sm:block"></div>
                <h1 className="font-semibold text-gray-200 truncate max-w-[150px] md:max-w-md hidden sm:block">{project.name}</h1>
            </div>
            <div className="flex-1 flex justify-center items-center gap-4">
                <div className="hidden md:flex bg-slate-800 rounded-lg p-1 border border-slate-700">
                    <button onClick={() => setViewMode('split')} className={`px-3 py-1.5 rounded-md text-xs font-medium ${viewMode === 'split' ? 'bg-indigo-600' : 'text-gray-400 hover:text-white'}`}>{t('split')}</button>
                    <button onClick={() => setViewMode('preview')} className={`px-3 py-1.5 rounded-md text-xs font-medium ${viewMode === 'preview' ? 'bg-indigo-600' : 'text-gray-400 hover:text-white'}`}>{t('preview')}</button>
                    <button onClick={() => setViewMode('code')} className={`px-3 py-1.5 rounded-md text-xs font-medium ${viewMode === 'code' ? 'bg-indigo-600' : 'text-gray-400 hover:text-white'}`}>{t('code')}</button>
                </div>
                <div className="hidden md:flex items-center gap-1 bg-slate-800 rounded-lg p-1 border border-slate-700">
                    <button onClick={() => setDeviceMode('desktop')} className={`p-1.5 rounded-md ${deviceMode === 'desktop' ? 'text-indigo-400' : 'text-gray-500 hover:text-white'}`}><Monitor size={16}/></button>
                    <button onClick={() => setDeviceMode('tablet')} className={`p-1.5 rounded-md ${deviceMode === 'tablet' ? 'text-indigo-400' : 'text-gray-500 hover:text-white'}`}><Tablet size={16}/></button>
                    <button onClick={() => setDeviceMode('mobile')} className={`p-1.5 rounded-md ${deviceMode === 'mobile' ? 'text-indigo-400' : 'text-gray-500 hover:text-white'}`}><Smartphone size={16}/></button>
                </div>
            </div>
            <div className="flex items-center gap-2 relative">
                 <button onClick={() => setShowPublishDropdown(prev => !prev)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-lg font-medium flex items-center gap-2 shadow-lg shadow-indigo-900/20 transition-all">{t('publish')}</button>
                 {showPublishDropdown && user && (
                    <div ref={desktopPublishRef} className="absolute top-full right-0 mt-2 z-50">
                        <PublishDropdown 
                            project={project}
                            user={user}
                            onManageDomains={() => { setShowManageDomains(true); setShowPublishDropdown(false); }}
                            onClose={() => setShowPublishDropdown(false)}
                            onUpdate={fetchProject}
                        />
                    </div>
                 )}
            </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden relative">
            <div className={`flex flex-col bg-[#0f172a] z-10 border-r border-gray-700 md:w-1/4 md:min-w-[320px] ${(viewMode === 'code' || viewMode === 'preview') ? 'md:hidden' : ''} ${mobileTab === 'chat' ? 'flex w-full h-full absolute inset-0 pb-16 md:pb-0 md:static md:h-auto' : 'hidden md:flex'}`}>
                <ChatInterface messages={project.messages} onSendMessage={handleSendMessage} onStop={handleStopGeneration} onRetry={handleRetry} onAutoFix={handleAutoFix} isThinking={isThinking} buildState={buildState} suggestions={suggestions} />
            </div>
            <div className={`bg-gray-900 relative flex justify-center items-center p-4 overflow-auto ${viewMode === 'split' ? 'md:w-3/4' : 'md:w-full'} ${mobileTab === 'preview' ? 'flex w-full h-full absolute inset-0 md:static md:h-auto' : 'hidden md:flex'}`}>
                <div className="hidden md:flex w-full h-full items-center justify-center">
                    {viewMode === 'code' ? (<div className="h-full w-full" dir="ltr"><CodeEditor code={project.code} isThinking={isThinking} /></div>) : (<div className={`transition-all duration-300 ${deviceSizeClass}`}><PreviewCanvas code={project.code} isGenerating={isFirstGeneration} className="h-full w-full" /></div>)}
                </div>
                <div className="md:hidden h-full w-full"><PreviewCanvas code={project.code} isGenerating={isFirstGeneration} className="h-full w-full rounded-none border-0" /></div>
            </div>
        </div>
             
        {/* Bottom Navigation Bar - Mobile Only */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#152033]/80 backdrop-blur-xl border-t border-gray-800 flex justify-between items-center h-16 shrink-0 z-30 pb-safe px-4 sm:px-8">
            {/* Back Button */}
            <button onClick={() => navigate('/dashboard')} className="flex flex-col items-center justify-center w-14 space-y-1 text-gray-500 hover:text-white">
                <ArrowLeft size={20} />
                <span className="text-[10px] font-medium">Back</span>
            </button>

            {/* Chat Tab */}
            <button onClick={() => setMobileTab('chat')} className={`flex flex-col items-center justify-center w-14 space-y-1 ${mobileTab === 'chat' ? 'text-indigo-400' : 'text-gray-500'}`}>
                <MessageSquare size={20} />
                <span className="text-[10px] font-medium">Chat</span>
            </button>

            {/* Preview Tab */}
            <button onClick={() => setMobileTab('preview')} className={`flex flex-col items-center justify-center w-14 space-y-1 ${mobileTab === 'preview' ? 'text-indigo-400' : 'text-gray-500'}`}>
                <Eye size={20} />
                <span className="text-[10px] font-medium">Preview</span>
            </button>
            
            {/* Publish Button */}
            <div className="relative">
            <button onClick={() => setShowPublishDropdown(prev => !prev)} className={`flex flex-col items-center justify-center w-14 space-y-1 ${showPublishDropdown ? 'text-indigo-400' : 'text-gray-500'}`}>
                <Globe size={20} />
                <span className="text-[10px] font-medium">Publish</span>
            </button>
            {/* Dropdown for Mobile */}
            {showPublishDropdown && user && (
                <div ref={mobilePublishRef} className="absolute bottom-full right-0 mb-4 z-50 origin-bottom-right">
                    <PublishDropdown 
                        project={project}
                        user={user}
                        onManageDomains={() => { setShowManageDomains(true); setShowPublishDropdown(false); }}
                        onClose={() => setShowPublishDropdown(false)}
                        onUpdate={fetchProject}
                    />
                </div>
            )}
            </div>
        </div>

        {showManageDomains && user && (
            <ManageDomainsModal
                project={project}
                user={user}
                onClose={() => setShowManageDomains(false)}
                onUpdate={fetchProject}
            />
        )}
    </div>
  );
};

export default ProjectBuilder;