
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '../types';
import { cloudService } from '../services/cloudService';
import AuthModal from './AuthModal';
import PromptInputBox from './PromptInputBox';
import { Sparkles, Loader2, Rocket } from 'lucide-react';

const ADJECTIVES = ['amazing', 'perfect', 'beautiful', 'incredible', 'innovative', 'stunning', 'awesome'];

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [dynamicAdjective, setDynamicAdjective] = useState('amazing');

  useEffect(() => {
    // Pick a random adjective on mount
    setDynamicAdjective(ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]);

    // Check for existing user session
    cloudService.getCurrentUser().then(setUser);

    // Listen for auth state changes just to update UI if needed (App.tsx handles routing)
    const unsubscribe = cloudService.onAuthStateChange((user) => {
        setUser(user);
    });

    return () => unsubscribe();
  }, []);

  const handleSendMessage = async (content: string, images: { url: string; base64: string }[]) => {
    // Save intent to session storage so Dashboard can pick it up after redirect
    sessionStorage.setItem('rafiei_pending_prompt', JSON.stringify({ content, images }));
    setAuthModalOpen(true);
  };

  const handleLoginSuccess = (loggedInUser: User) => {
    setUser(loggedInUser);
    setAuthModalOpen(false);
    // App.tsx will detect the auth change and redirect to /dashboard automatically
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white flex flex-col relative overflow-hidden font-['Inter']">
      {/* Background Gradients */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-50%] left-[-20%] w-[80vw] h-[80vw] md:w-[60%] md:h-[60%] bg-indigo-900/30 rounded-full blur-[150px] animate-pulse-slow"></div>
        <div className="absolute bottom-[-50%] right-[-20%] w-[80vw] h-[80vw] md:w-[50%] md:h-[50%] bg-red-900/20 rounded-full blur-[150px] animate-pulse-slow animation-delay-4000"></div>
      </div>
      
      {isLoading && (
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex flex-col items-center justify-center text-white animate-in fade-in duration-300">
            <div className="flex items-center gap-3 bg-slate-800 px-6 py-4 rounded-full shadow-xl border border-slate-700">
                <Loader2 className="animate-spin text-indigo-400" size={20} />
                <span className="font-medium text-slate-200">Creating your project...</span>
            </div>
        </div>
      )}

      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setAuthModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* Header */}
      <header className="relative z-10 px-6 py-6 flex items-center justify-between max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2">
            <div className="bg-slate-800 p-2 rounded-lg border border-slate-700">
                <Rocket size={24} className="text-indigo-400" />
            </div>
            <span className="text-xl font-bold tracking-tight">Rafiei Builder</span>
        </div>
        <div className="flex items-center gap-4">
            {user ? (
                 <button onClick={() => navigate('/dashboard')} className="bg-white text-slate-900 px-5 py-2.5 rounded-full font-semibold hover:bg-gray-100 transition-colors shadow-lg shadow-white/10">
                    Dashboard
                </button>
            ) : (
                <>
                    <button onClick={() => setAuthModalOpen(true)} className="text-gray-300 hover:text-white font-medium transition-colors">Log in</button>
                    <button onClick={() => setAuthModalOpen(true)} className="bg-white text-slate-900 px-5 py-2.5 rounded-full font-semibold hover:bg-gray-100 transition-colors shadow-lg shadow-white/10">
                        Get started
                    </button>
                </>
            )}
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-4 pb-20">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm font-medium mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <Sparkles size={14} />
            <span>Gemini 3 Pro in Rafiei Builder</span>
        </div>
        
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-4 max-w-4xl bg-clip-text text-transparent bg-gradient-to-br from-white via-slate-300 to-indigo-400 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-100">
            Build something <span className="text-indigo-400">{dynamicAdjective}</span>
        </h1>
        
        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mb-12 leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
            Create apps and websites by chatting with AI.
        </p>
        
        <div className="w-full max-w-2xl mx-auto animate-in fade-in zoom-in-95 duration-500 delay-300">
             <PromptInputBox 
                onSendMessage={handleSendMessage}
                onInteraction={() => !user && setAuthModalOpen(true)}
                isThinking={isLoading}
             />
        </div>
      </main>
      
    </div>
  );
};

export default LandingPage;
