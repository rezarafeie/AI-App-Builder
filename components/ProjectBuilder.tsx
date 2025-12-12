
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Project, Message, ViewMode, User, Suggestion, BuildState } from '../types';
import { generateProjectTitle, generateSuggestions, handleUserIntent } from '../services/geminiService';
import { cloudService } from '../services/cloudService';
import { rafieiCloudService } from '../services/rafieiCloudService';
import { useTranslation } from '../utils/translations';
import ChatInterface from './ChatInterface';
import PreviewCanvas from './PreviewCanvas';
import CodeEditor from './CodeEditor';
import PublishDropdown from './PublishDropdown';
import ManageDomainsModal from './ManageDomainsModal';
import { ArrowLeft, MessageSquare, Eye, Monitor, Tablet, Smartphone, Globe, Loader2, Check, Cloud, Power, ExternalLink, LayoutDashboard, Trash2, X } from 'lucide-react';

type DeviceMode = 'desktop' | 'tablet' | 'mobile';

interface ProjectBuilderProps {
  user: User;
}

const ProjectBuilder: React.FC<ProjectBuilderProps> = ({ user }) => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [buildState, setBuildState] = useState<BuildState | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<{ content: string; images: { url: string; base64: string }[] } | null>(null);

  const projectRef = useRef<Project | null>(null);
  const lastSuggestionMessageIdRef = useRef<string | null>(null);
  const failedSuggestionAttemptsRef = useRef<Record<string, number>>({});
  
  // Guard against multiple connection attempts
  const connectingRef = useRef(false);
  
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [mobileTab, setMobileTab] = useState<'chat' | 'preview'>('chat');
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('desktop');
  
  const [showPublishDropdown, setShowPublishDropdown] = useState(false);
  const [showManageDomains, setShowManageDomains] = useState(false);
  
  const [showCloudDetails, setShowCloudDetails] = useState(false);
  const [localCloudError, setLocalCloudError] = useState<string | null>(null);

  const desktopPublishRef = useRef<HTMLDivElement>(null);
  const mobilePublishRef = useRef<HTMLDivElement>(null);

  const { t, dir } = useTranslation();
  
  const cloudStatus = project?.rafieiCloudProject?.status || 'idle';
  const isCloudActive = cloudStatus === 'ACTIVE';
  const isConnectingCloud = cloudStatus === 'CREATING'; // Note: connectingRef.current helps cover the gap before this updates
  
  // Adjusted Logic: If active, we consider the terminal 'idle' (hidden) so the Build Terminal can show.
  // The chat history message serves as the "Success" record.
  const uiCloudStatus: 'idle' | 'provisioning' | 'waking' | 'success' | 'error' = 
    localCloudError ? 'error' :
    cloudStatus === 'CREATING' ? 'provisioning' :
    cloudStatus === 'FAILED' ? 'error' : 
    'idle';

  const isBuilding = project?.status === 'generating';
  const isThinking = isBuilding || isConnectingCloud;
  
  const isFirstGeneration = isBuilding && project ? (!project.code.html && !project.code.javascript) : false;
  const isUpdating = isBuilding && !isFirstGeneration;

  useEffect(() => {
      projectRef.current = project;
      
      if (project?.rafieiCloudProject?.status === 'ACTIVE' && pendingPrompt) {
          const successMsg: Message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: "✅ **Rafiei Cloud Connected**\n\nDatabase is ready. Resuming your build request...",
            timestamp: Date.now()
          };
          
          const updated = { ...project, messages: [...project.messages, successMsg] };
          setProject(updated);
          cloudService.saveProject(updated);

          setTimeout(() => {
              handleSendMessage(pendingPrompt.content, pendingPrompt.images, updated, true);
              setPendingPrompt(null);
          }, 1000);
      }

  }, [project]);

  // --- FAILSAFE MONITORING ---
  // If the backend build process screams "I NEED A DATABASE", we catch it here.
  // Updated to match the user-friendly message from geminiService.
  const DB_CONNECT_MESSAGE = "This project requires a backend database. Starting Rafiei Cloud connection process...";

  useEffect(() => {
      if (project && project.messages.length > 0) {
          const lastMsg = project.messages[project.messages.length - 1];
          
          if (lastMsg.role === 'assistant' && lastMsg.content === DB_CONNECT_MESSAGE) {
              
              // Only trigger if we aren't already connected/connecting
              const hasCloud = project.rafieiCloudProject && project.rafieiCloudProject.status === 'ACTIVE';
              
              // We also check connectingRef here to prevent duplicate firing from this useEffect
              if (!hasCloud && !isConnectingCloud && !connectingRef.current) {
                  console.log("Failsafe Triggered: Auto-connecting cloud based on AI System Signal.");
                  
                  // Clear the failed build state visually
                  setBuildState(null);

                  // Find the last user prompt to resume later
                  const lastUserMsg = [...project.messages].reverse().find(m => m.role === 'user');
                  if (lastUserMsg) {
                      const promptData = { 
                          content: lastUserMsg.content, 
                          images: (lastUserMsg.images || []).map(url => ({ url, base64: '' })) 
                      };
                      setPendingPrompt(promptData);
                      handleConnectCloud(project, promptData);
                  } else {
                      handleConnectCloud(project);
                  }
              }
          }
      }
  }, [project?.messages, isConnectingCloud]);

  const fetchProject = async () => {
      if (!projectId) return;
      try {
          const p = await cloudService.getProject(projectId);
          if (p) {
              setProject(p);
              setBuildState(p.buildState || null);
              
              if (p.rafieiCloudProject && p.rafieiCloudProject.status === 'CREATING') {
                  console.log("Resuming background provisioning monitor...");
                  rafieiCloudService.monitorProvisioning(p.rafieiCloudProject, p.id);
              }
          } else {
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
    setSuggestions([]);
    lastSuggestionMessageIdRef.current = null;
    failedSuggestionAttemptsRef.current = {};
    connectingRef.current = false; // Reset on load
  }, [projectId]);

  useEffect(() => {
      if (project && project.status === 'idle' && project.messages.length === 1 && project.messages[0].role === 'user' && !project.code.javascript) {
          const prompt = project.messages[0].content;
          const images = project.messages[0].images?.map(url => ({ url, base64: '' })) || [];
          handleSendMessage(prompt, images, project, true); 
      }
  }, [project?.id]); 

  useEffect(() => {
    if (!projectId) return;
    const { unsubscribe } = cloudService.subscribeToProjectChanges(projectId, (updatedProject) => {
      setProject(updatedProject);
      setBuildState(updatedProject.buildState || null);
    });
    return () => unsubscribe();
  }, [projectId]);

  useEffect(() => {
      setRuntimeError(null);
  }, [project?.code]);

  useEffect(() => {
    if (project?.status === 'generating') {
      const timeSinceLastUpdate = Date.now() - project.updatedAt;
      if (timeSinceLastUpdate > 130000) { 
        handleStopGeneration(true);
      }
    }
  }, [project, project?.updatedAt]);

  useEffect(() => {
    if (!project || project.status !== 'idle' || project.messages.length === 0) return;

    const lastMessage = project.messages[project.messages.length - 1];
    
    if (lastMessage.role === 'assistant' && !lastMessage.content.toLowerCase().includes('error')) {
        const attempts = failedSuggestionAttemptsRef.current[lastMessage.id] || 0;
        const isNewMessage = lastMessage.id !== lastSuggestionMessageIdRef.current;
        const shouldRetry = suggestions.length === 0 && attempts < 2;

        if ((isNewMessage || shouldRetry) && !isSuggestionsLoading) {
            if (isNewMessage) {
                 lastSuggestionMessageIdRef.current = lastMessage.id;
            }

            setIsSuggestionsLoading(true);
            if (isNewMessage) setSuggestions([]); 

            generateSuggestions(project.messages, project.code)
                .then(newSuggestions => {
                    if (newSuggestions && newSuggestions.length > 0) {
                        setSuggestions(newSuggestions);
                    } else {
                        failedSuggestionAttemptsRef.current[lastMessage.id] = (failedSuggestionAttemptsRef.current[lastMessage.id] || 0) + 1;
                    }
                })
                .catch(err => {
                    failedSuggestionAttemptsRef.current[lastMessage.id] = (failedSuggestionAttemptsRef.current[lastMessage.id] || 0) + 1;
                })
                .finally(() => setIsSuggestionsLoading(false));
        }
    }
  }, [project?.status, project?.messages.length, suggestions.length, isSuggestionsLoading]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!desktopPublishRef.current?.contains(target) && !mobilePublishRef.current?.contains(target)) {
        setShowPublishDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleStop = async () => {
    if (isConnectingCloud && project?.rafieiCloudProject) {
        rafieiCloudService.cancelMonitoring(project.rafieiCloudProject.id);
        setPendingPrompt(null);
        connectingRef.current = false;
        
        const cancelMsg: Message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: "🛑 Cloud connection cancelled by user.",
            timestamp: Date.now()
        };
        
        const updated = {
            ...project,
            rafieiCloudProject: undefined,
            messages: [...project.messages, cancelMsg],
            updatedAt: Date.now()
        };
        
        setProject(updated);
        setBuildState(null);
        setLocalCloudError(null);
        await cloudService.saveProject(updated);
        return;
    }

    if (isBuilding) {
        if (project) cloudService.stopBuild(project.id);
        handleStopGeneration(false);
    }
  };

  const handleStopGeneration = (isAutoRecovery = false) => {
    if (project) {
        let updatedMessages = project.messages;
        let updatedBuildState = project.buildState ? { ...project.buildState } : null;

        if (isAutoRecovery) {
             const recoveryMsg: Message = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: "Error: The build process timed out. Please try again.",
                timestamp: Date.now()
            };
            updatedMessages = [...project.messages, recoveryMsg];
            
            if (updatedBuildState) {
                updatedBuildState.error = "Timeout: No activity detected";
            }
        }

        const stoppedProject = { 
            ...project, 
            status: 'idle' as const, 
            messages: updatedMessages,
            buildState: updatedBuildState,
            updatedAt: Date.now() 
        };
        setProject(stoppedProject);
        cloudService.saveProject(stoppedProject);
    }
  };

  const handleRetry = (prompt: string) => {
      if(project) {
          const updated = {
              ...project, 
              messages: project.messages.slice(0, -1),
              updatedAt: Date.now() 
          };
          setProject(updated); 
          cloudService.saveProject(updated).then(() => {
              handleSendMessage(prompt, []);
          });
      }
  };
  
  const handleAutoFix = () => {
      if (project) {
          const prompt = runtimeError 
            ? `I encountered a runtime error in the preview: "${runtimeError}". Please analyze the code and fix this error.`
            : "The current code has an error. Please find the root cause and provide a fix.";
          handleSendMessage(prompt, []);
          setRuntimeError(null);
      }
  };
  
  const handleClearBuildState = async () => {
      if (project) {
          const updated = { ...project, buildState: null };
          setProject(updated); 
          setBuildState(null);
          await cloudService.saveProject(updated);
      }
  };
  
  const handleUploadImage = async (file: File): Promise<string> => {
      if (!project) throw new Error("No project context");
      const tempId = crypto.randomUUID(); 
      return await cloudService.uploadChatImage(project.userId, tempId, file);
  };

  const handleClearCloudConnectionState = () => {
      setLocalCloudError(null);
      connectingRef.current = false;
  };

  const handleCloudConnectRetry = () => {
      // Allow retry by resetting the ref
      connectingRef.current = false;
      if (pendingPrompt) {
          handleConnectCloud(project, pendingPrompt);
      } else {
          handleConnectCloud(project);
      }
  };
  
  const handleConnectCloud = async (startProject?: Project, resumePrompt?: { content: string; images: { url: string; base64: string }[] }) => {
    const currentProject = startProject || project;
    if (!currentProject) return;

    // Prevent duplicate calls
    if (connectingRef.current) {
        console.log("Cloud connection already in progress. Ignoring duplicate request.");
        return;
    }
    
    connectingRef.current = true;
    setLocalCloudError(null);

    try {
        await rafieiCloudService.provisionProject(user, currentProject);
        // Note: connectingRef stays true to prevent re-trigger during polling/subscription update lag
    } catch (error: any) {
        connectingRef.current = false; // Reset on error so user can retry
        setLocalCloudError(error.message);
        
        const failMsg: Message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `❌ Failed to connect Rafiei Cloud: ${error.message}`,
            timestamp: Date.now()
        };
        const projectWithError = { ...currentProject, messages: [...currentProject.messages, failMsg] };
        setProject(projectWithError);
        await cloudService.saveProject(projectWithError);
    }
  };

  const handleDisconnectCloud = async () => {
      if (!project || !window.confirm("Disconnecting will remove access to the database. Your data will persist on Supabase but the AI won't be able to access it.")) return;
      
      const updated = { ...project, rafieiCloudProject: undefined };
      setProject(updated);
      await cloudService.saveProject(updated);
      setShowCloudDetails(false);
      connectingRef.current = false;
  };

  const handleSendMessage = async (content: string, images: { url: string, base64: string }[], projectOverride?: Project, isInitialAutoStart = false) => {
    const currentProject = projectOverride || projectRef.current;
    
    if (!currentProject || !user || (currentProject.status === 'generating' && !projectOverride && !isInitialAutoStart)) return;

    setSuggestions([]);
    handleClearCloudConnectionState();

    let updatedProject = currentProject;

    if (!isInitialAutoStart) {
        const userMsg: Message = {
            id: crypto.randomUUID(),
            role: 'user',
            content,
            timestamp: Date.now(),
            images: images.map(i => i.url) 
        };
        updatedProject = { 
            ...currentProject, 
            messages: [...currentProject.messages, userMsg],
            updatedAt: Date.now() 
        };
        setProject(updatedProject);
    } else {
        updatedProject = {
            ...currentProject,
            updatedAt: Date.now()
        };
        setProject(updatedProject);
    }

    setBuildState({
        plan: ["Analyzing project requirements...", "Verifying cloud dependencies..."],
        currentStep: 0,
        lastCompletedStep: -1,
        error: null
    });

    // --- ENHANCED INTENT DETECTION ---
    
    let { isArchitect, requiresDatabase: aiSaysDbRequired, response } = await handleUserIntent(updatedProject, content);
    
    // 1. Force Architect Mode for specific keywords
    const heuristicArchitect = /\b(create|build|generate|make|develop|code|app|website|page|dashboard|fix|change|update|add|remove|delete|insert|style|design|layout|form)\b/i.test(content);

    // 2. Robust DB Requirement Regex
    const dbRegex = /\b(database|db|store|saving|saved|save|persist|persistent|record|auth|login|signin|signup|user|profile|admin|dashboard|cms|crm|shop|ecommerce|cart|inventory|blog|post|comment|member|setting|preference|analytic|history|transaction|payment|order|product|service|booking|reservation|todo|task|list|collection|table|row|column|sql|data|form|submit|capture|collect|input|review|message|chat)\b/i;
    const heuristicDbRequired = dbRegex.test(content);
    
    // Combine AI and Heuristic
    let requiresDatabase = aiSaysDbRequired || heuristicDbRequired;

    // 3. Override for static keywords
    if (isArchitect || heuristicArchitect || heuristicDbRequired) {
        // Removed "simple", "hello world" from static keywords to avoid false negatives on "simple db app"
        const staticRegex = /\b(static|mock|landing page|brochure|portfolio|frontend only|ui only|no database|no db|html only|css only)\b/i; 
        const isExplicitlyStatic = staticRegex.test(content);
        
        // Only override if NO explicit DB keywords are present
        if (isExplicitlyStatic && !heuristicDbRequired) {
            requiresDatabase = false;
        }
        
        // Final Force: If AI says yes OR Regex says yes (and not static), then Architect + DB.
        if (requiresDatabase) {
            isArchitect = true;
        } else if (heuristicArchitect) {
            isArchitect = true;
        }
    }

    // --- CRITICAL CLOUD CHECK ---
    if (isArchitect && requiresDatabase) {
        // Use updatedProject to check current state, not potentially stale state
        const hasCloud = updatedProject.rafieiCloudProject && updatedProject.rafieiCloudProject.status === 'ACTIVE';
        const hasManual = updatedProject.supabaseConfig && updatedProject.supabaseConfig.url;

        // Check if we are already connecting to avoid race conditions here too
        if (!hasCloud && !hasManual && !isConnectingCloud && !connectingRef.current) {
            setBuildState(null);

            const connectMsg: Message = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: "This application requires a database. Automatically connecting to Rafiei Cloud to provision a secure backend...",
                timestamp: Date.now(),
            };
            const projectWithMsg = { ...updatedProject, messages: [...updatedProject.messages, connectMsg]};
            setProject(projectWithMsg);
            
            const promptData = { content, images };
            setPendingPrompt(promptData);
            await handleConnectCloud(projectWithMsg, promptData); 
            return; 
        }
    }

    if (!isArchitect && response) {
      setBuildState(null);
      const assistantMsg: Message = { id: crypto.randomUUID(), role: 'assistant', content: response, timestamp: Date.now() };
      const finalProject = { 
          ...updatedProject, 
          messages: [...updatedProject.messages, assistantMsg],
          updatedAt: Date.now()
      };
      setProject(finalProject);
      await cloudService.saveProject(finalProject);
      return;
    }

    let projectToBuild = { ...updatedProject };

    if (projectToBuild.messages.filter(m => m.role === 'user').length === 1) {
      const title = await generateProjectTitle(content);
      projectToBuild.name = title;
    }

    projectToBuild.status = 'generating';
    projectToBuild.updatedAt = Date.now(); 
    setProject(projectToBuild); 

    const handleLocalStateUpdate = (updatedState: Project) => {
        setProject(prev => {
            if (!prev || prev.id !== updatedState.id) return prev;
            return updatedState;
        });
        setBuildState(updatedState.buildState || null);
    };

    await cloudService.triggerBuild(projectToBuild, content, images, handleLocalStateUpdate);
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-[#0f172a] text-white"><Loader2 className="animate-spin" size={32} /></div>;
  
  if (project && project.deletedAt) {
      return (
          <div className="h-screen flex flex-col items-center justify-center bg-[#0f172a] text-white space-y-4">
              <div className="bg-red-500/10 p-4 rounded-full"><Trash2 size={48} className="text-red-500" /></div>
              <h1 className="text-xl font-semibold">Project is in Trash</h1>
              <button onClick={() => navigate('/dashboard/trash')} className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-2 rounded-lg transition-colors">Go to Trash</button>
          </div>
      );
  }

  if (!project) return null;

  const deviceSizeClass = deviceMode === 'desktop' ? 'w-full h-full' : deviceMode === 'tablet' ? 'w-[768px] h-full max-w-full mx-auto' : 'w-[375px] h-[667px] max-w-full mx-auto';
  const hasCloudProject = project.rafieiCloudProject != null && project.rafieiCloudProject.status === 'ACTIVE';
  const isPendingCloud = project.rafieiCloudProject != null && project.rafieiCloudProject.status === 'CREATING';
  
  return (
    <div className="flex flex-col h-screen bg-[#0f172a] text-white overflow-hidden" dir={dir}>
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
                 {hasCloudProject ? (
                    <button onClick={() => setShowCloudDetails(true)} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors flex items-center gap-2 shadow-sm shadow-emerald-900/20" title="View Cloud Details">
                        <Check size={14} className="text-emerald-400" /> <span className="hidden sm:inline">Rafiei Cloud Connected</span><span className="sm:hidden">Connected</span>
                    </button>
                 ) : (
                    <button onClick={() => handleConnectCloud()} disabled={isConnectingCloud} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors flex items-center gap-2 disabled:opacity-50" title={isPendingCloud ? "Waiting for provisioning..." : "Connect to Rafiei Cloud"}>
                        {(isConnectingCloud) ? <Loader2 size={14} className="animate-spin" /> : <Cloud size={14} />}
                        {(isConnectingCloud) ? 'Provisioning...' : 'Connect to Rafiei Cloud'}
                    </button>
                 )}
                 <button onClick={() => setShowPublishDropdown(prev => !prev)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-lg font-medium flex items-center gap-2 shadow-lg shadow-indigo-900/20 transition-all">{t('publish')}</button>
                 {showPublishDropdown && user && (<div ref={desktopPublishRef} className="absolute top-full right-0 mt-2 z-50"><PublishDropdown project={project} user={user} onManageDomains={() => { setShowManageDomains(true); setShowPublishDropdown(false); }} onClose={() => setShowPublishDropdown(false)} onUpdate={fetchProject} /></div>)}
            </div>
        </div>

        <div className="flex-1 flex overflow-hidden relative">
            <div className={`flex flex-col bg-[#0f172a] z-10 border-r border-gray-700 md:w-1/4 md:min-w-[320px] ${(viewMode === 'code' || viewMode === 'preview') ? 'md:hidden' : ''} ${mobileTab === 'chat' ? 'flex w-full h-full absolute inset-0 pb-16 md:pb-0 md:static md:h-auto' : 'hidden md:flex'}`}>
                <ChatInterface messages={project.messages} onSendMessage={handleSendMessage} onUploadImage={handleUploadImage} onStop={handleStop} onRetry={handleRetry} onAutoFix={handleAutoFix} onClearBuildState={handleClearBuildState} onConnectDatabase={hasCloudProject ? undefined : () => handleConnectCloud()} isThinking={isThinking} buildState={buildState} suggestions={suggestions} isSuggestionsLoading={isSuggestionsLoading} runtimeError={runtimeError} cloudConnectionStatus={uiCloudStatus} cloudConnectionError={localCloudError} onCloudConnectRetry={handleCloudConnectRetry} onClearCloudConnectionState={handleClearCloudConnectionState} />
            </div>
            <div className={`bg-gray-900 relative flex justify-center items-center p-4 overflow-auto ${viewMode === 'split' ? 'md:w-3/4' : 'md:w-full'} ${mobileTab === 'preview' ? 'flex w-full h-full absolute inset-0 md:static md:h-auto' : 'hidden md:flex'}`}>
                <div className="hidden md:flex w-full h-full items-center justify-center">
                    {viewMode === 'code' ? (<div className="h-full w-full" dir="ltr"><CodeEditor code={project.code} isThinking={isThinking} /></div>) : (<div className={`transition-all duration-300 ${deviceSizeClass}`}><PreviewCanvas code={project.code} isGenerating={isFirstGeneration} isUpdating={isUpdating} className="h-full w-full" onRuntimeError={setRuntimeError} /></div>)}
                </div>
                <div className="md:hidden h-full w-full"><PreviewCanvas code={project.code} isGenerating={isFirstGeneration} isUpdating={isUpdating} className="h-full w-full rounded-none border-0" onRuntimeError={setRuntimeError} /></div>
            </div>
        </div>
             
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#152033]/80 backdrop-blur-xl border-t border-gray-800 flex justify-between items-center h-16 shrink-0 z-30 pb-safe px-4 sm:px-8">
            <button onClick={() => navigate('/dashboard')} className="flex flex-col items-center justify-center w-14 space-y-1 text-gray-500 hover:text-white"><ArrowLeft size={20} /><span className="text-[10px] font-medium">Back</span></button>
            <button onClick={() => setMobileTab('chat')} className={`flex flex-col items-center justify-center w-14 space-y-1 ${mobileTab === 'chat' ? 'text-indigo-400' : 'text-gray-500'}`}><MessageSquare size={20} /><span className="text-[10px] font-medium">Chat</span></button>
            <button onClick={() => setMobileTab('