import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket, Sparkles, ArrowRight, Code, Zap, Globe } from 'lucide-react';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col relative overflow-hidden font-['Inter']">
      {/* Background Gradients */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-indigo-900/20 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-900/10 rounded-full blur-[120px]"></div>
      </div>

      {/* Header */}
      <header className="relative z-10 px-6 py-6 flex items-center justify-between max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg shadow-lg shadow-indigo-500/30">
                <Rocket size={24} className="text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">NovaBuilder</span>
        </div>
        <div className="flex items-center gap-4">
            <button onClick={() => navigate('/auth')} className="text-gray-300 hover:text-white font-medium transition-colors">Sign In</button>
            <button onClick={() => navigate('/auth')} className="bg-white text-slate-900 px-5 py-2.5 rounded-full font-semibold hover:bg-gray-100 transition-colors shadow-lg shadow-white/10">
                Get Started
            </button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-4 py-20">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm font-medium mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <Sparkles size={14} />
            <span>Powered by Gemini 3 Pro</span>
        </div>
        
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 max-w-4xl bg-clip-text text-transparent bg-gradient-to-r from-white via-indigo-200 to-indigo-400 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-100">
            Build web apps with <br className="hidden md:block"/> conversational AI.
        </h1>
        
        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mb-10 leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
            Describe your idea, and NovaBuilder writes the code, designs the UI, and deploys it instantly. No coding required.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center gap-4 animate-in fade-in slide-in-from-bottom-10 duration-700 delay-300">
            <button onClick={() => navigate('/auth')} className="group bg-indigo-600 hover:bg-indigo-500 text-white text-lg px-8 py-4 rounded-full font-semibold transition-all shadow-xl shadow-indigo-600/30 hover:scale-105 flex items-center gap-2">
                Start Building Free
                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </button>
            <a href="https://github.com/google/genai" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white px-8 py-4 font-medium transition-colors">
                View Documentation
            </a>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-24 max-w-5xl mx-auto text-left">
            <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl backdrop-blur-sm hover:bg-slate-800/80 transition-colors">
                <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center text-indigo-400 mb-4">
                    <Zap size={24} />
                </div>
                <h3 className="text-xl font-bold mb-2">Instant Generation</h3>
                <p className="text-slate-400">Turn simple text prompts into full-stack React applications in seconds.</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl backdrop-blur-sm hover:bg-slate-800/80 transition-colors">
                <div className="w-12 h-12 bg-pink-500/20 rounded-xl flex items-center justify-center text-pink-400 mb-4">
                    <Code size={24} />
                </div>
                <h3 className="text-xl font-bold mb-2">Clean Code</h3>
                <p className="text-slate-400">Get production-ready, editable code. Export to GitHub or Replit anytime.</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl backdrop-blur-sm hover:bg-slate-800/80 transition-colors">
                <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400 mb-4">
                    <Globe size={24} />
                </div>
                <h3 className="text-xl font-bold mb-2">One-Click Deploy</h3>
                <p className="text-slate-400">Publish your app to a live URL instantly and share it with the world.</p>
            </div>
        </div>
      </main>
      
      <footer className="py-8 text-center text-slate-500 text-sm">
        © 2024 NovaBuilder AI. All rights reserved.
      </footer>
    </div>
  );
};

export default LandingPage;