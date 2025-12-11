import React, { useState, useEffect, useRef, useMemo } from 'react';
import { GeneratedCode } from '../types';
import { Copy, Check, Terminal, Loader2, Play, Pause, ChevronDown, Sparkles } from 'lucide-react';

interface CodeEditorProps {
  code: GeneratedCode | null;
  isThinking?: boolean;
}

// --- Syntax Highlighting Logic ---
// Applied per-line to allow virtualization/performance during streaming
const highlightLine = (line: string, lang: 'js' | 'html' | 'css'): string => {
  if (!line) return '';
  
  let html = line
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  if (lang === 'js') {
    // Comments
    if (html.trim().startsWith('//')) {
        return `<span class="text-slate-500 italic">${html}</span>`;
    }
    html = html.replace(/(\/\/.*)/g, '<span class="text-slate-500 italic">$1</span>');
    
    // Keywords
    html = html.replace(/\b(const|let|var|function|return|if|else|for|while|import|export|from|default|class|extends|=>|async|await|try|catch|switch|case|break|new)\b/g, '<span class="text-pink-400 font-medium">$1</span>');
    
    // React/Globals
    html = html.replace(/\b(useState|useEffect|useRef|useCallback|useMemo|React|ReactDOM|console|window|document)\b/g, '<span class="text-cyan-400">$1</span>');
    
    // Functions
    html = html.replace(/([a-zA-Z0-9_]+)(?=\()/g, '<span class="text-yellow-300">$1</span>');
    
    // Strings
    html = html.replace(/(['"`])(.*?)\1/g, '<span class="text-emerald-400">$1$2$1</span>');
    
    // JSX/HTML Tags within JS
    html = html.replace(/(&lt;\/?)(\w+)/g, '$1<span class="text-blue-400">$2</span>');
  }

  if (lang === 'css') {
    html = html.replace(/([a-zA-Z-0-9]+):/g, '<span class="text-cyan-300">$1</span>:');
    html = html.replace(/:(.*?);/g, ':<span class="text-emerald-300">$1</span>;');
    html = html.replace(/(\.|#)([a-zA-Z0-9_-]+)/g, '<span class="text-yellow-300">$1$2</span>');
    // Comments
    html = html.replace(/(\/\*.*?\*\/)/g, '<span class="text-slate-500 italic">$1</span>');
  }

  if (lang === 'html') {
    html = html.replace(/(&lt;\/?)(\w+)/g, '$1<span class="text-blue-400">$2</span>');
    html = html.replace(/\b([a-zA-Z-0-9]+)=/g, '<span class="text-sky-300">$1</span>=');
    html = html.replace(/(['"])(.*?)\1/g, '<span class="text-emerald-400">$1$2$1</span>');
    // Comments
    html = html.replace(/(&lt;!--.*?--&gt;)/g, '<span class="text-slate-500 italic">$1</span>');
  }

  return html;
};

const CodeEditor: React.FC<CodeEditorProps> = ({ code, isThinking = false }) => {
  const [activeTab, setActiveTab] = useState<'html' | 'js' | 'css'>('js');
  const [copied, setCopied] = useState(false);
  
  // Streaming State
  const [displayedContent, setDisplayedContent] = useState('');
  const [targetContent, setTargetContent] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentEndRef = useRef<HTMLDivElement>(null);
  const streamRequestRef = useRef<number>(null);

  // Update target content when props change
  useEffect(() => {
    if (!code) return;
    const newTarget = activeTab === 'html' ? code.html : activeTab === 'js' ? code.javascript : code.css;
    setTargetContent(newTarget || '');
    
    // If not thinking (generation done), snap immediately to result
    if (!isThinking) {
        setDisplayedContent(newTarget || '');
    }
  }, [code, activeTab, isThinking]);

  // Streaming Logic (Interpolation)
  useEffect(() => {
    if (!isThinking) return;

    const animate = () => {
      setDisplayedContent(current => {
        if (current === targetContent) return current;
        
        // Handle deletions/rewrites (simple reset if mismatch at start, otherwise append)
        if (!targetContent.startsWith(current)) {
           // If the AI rewrote the file from scratch or significantly changed previous parts
           // For smoother UI, we might just snap, or try to keep common prefix.
           // For now, snap to common prefix to avoid "typing backwards".
           return targetContent.slice(0, current.length); 
        }

        const diff = targetContent.length - current.length;
        if (diff <= 0) return current;

        // Dynamic typing speed based on backlog
        // If we are far behind, type faster.
        const chunk = Math.max(1, Math.ceil(diff / 10)); 
        return targetContent.slice(0, current.length + chunk);
      });
      
      streamRequestRef.current = requestAnimationFrame(animate);
    };

    streamRequestRef.current = requestAnimationFrame(animate);

    return () => {
      if (streamRequestRef.current) cancelAnimationFrame(streamRequestRef.current);
    };
  }, [targetContent, isThinking]);

  // Smart Auto-Scroll
  useEffect(() => {
    if (autoScroll && contentEndRef.current) {
        contentEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [displayedContent, autoScroll]);

  // Scroll Event Listener to toggle Auto-Scroll
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    
    // If user is near bottom (within 50px), enable auto-scroll. Otherwise disable.
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    
    if (isThinking) {
        setAutoScroll(isNearBottom);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(targetContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = useMemo(() => displayedContent.split('\n'), [displayedContent]);

  if (!code && !isThinking) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 bg-[#020617]">
        <Terminal size={48} className="mx-auto mb-4 opacity-20" />
        <p className="font-mono text-sm">Waiting for generation...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#020617] text-slate-300 font-mono text-sm relative group border-l border-slate-800">
      
      {/* --- HEADER --- */}
      <div className="flex items-center justify-between bg-[#0f172a] px-4 py-3 border-b border-slate-800 select-none shadow-sm z-10">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {/* Tabs */}
            {['js', 'html', 'css'].map((tab) => {
               const isActive = activeTab === tab;
               const hasContent = tab === 'js' ? code?.javascript : tab === 'html' ? code?.html : code?.css;
               
               return (
                <button 
                    key={tab}
                    onClick={() => setActiveTab(tab as any)}
                    className={`
                        relative px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 flex items-center gap-2
                        ${isActive ? 'bg-indigo-500/10 text-indigo-300 ring-1 ring-indigo-500/50' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}
                        ${!hasContent && !isThinking ? 'opacity-50' : 'opacity-100'}
                    `}
                >
                    {tab === 'js' ? 'React.jsx' : tab === 'html' ? 'index.html' : 'style.css'}
                    {isThinking && isActive && (
                        <span className="flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-1.5 w-1.5 rounded-full bg-indigo-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-500"></span>
                        </span>
                    )}
                </button>
               );
            })}
        </div>
        
        <div className="flex items-center gap-3">
             {/* Status Indicator */}
             <div className="hidden sm:flex items-center gap-2 text-xs font-medium">
                {isThinking ? (
                    <div className="flex items-center gap-2 text-amber-400 bg-amber-400/10 px-2 py-1 rounded-full border border-amber-400/20 animate-pulse">
                        <Sparkles size={12} />
                        <span>AI Editing...</span>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 text-emerald-400/80 px-2 py-1">
                        <Check size={12} />
                        <span>Up to date</span>
                    </div>
                )}
            </div>
            
            <div className="h-4 w-px bg-slate-700 mx-1 hidden sm:block"></div>

            <button onClick={handleCopy} className="p-1.5 hover:bg-slate-800 rounded-md transition-colors text-slate-400 hover:text-white" title="Copy Code">
                {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            </button>
        </div>
      </div>

      {/* --- EDITOR AREA --- */}
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto relative custom-scrollbar scroll-smooth"
      >
        <div className="flex min-h-full">
             {/* Gutter (Line Numbers) */}
            <div className="bg-[#0f172a]/50 text-right py-4 px-3 select-none border-r border-slate-800 sticky left-0 z-10">
                {lines.map((_, i) => (
                    <div key={i} className="text-slate-600 text-xs leading-6 font-mono h-6">{i + 1}</div>
                ))}
            </div>

            {/* Code Content */}
            <div className="flex-1 p-4 pb-20">
                {lines.map((line, i) => (
                    <div key={i} className="leading-6 whitespace-pre h-6 w-full">
                        <code dangerouslySetInnerHTML={{ __html: highlightLine(line, activeTab) }} />
                    </div>
                ))}
                
                {/* Blinking Cursor */}
                {isThinking && (
                    <div className="inline-block w-2 h-4 bg-indigo-500 align-middle animate-pulse ml-0.5 shadow-[0_0_8px_rgba(99,102,241,0.5)]"></div>
                )}
                
                <div ref={contentEndRef} />
            </div>
        </div>

        {/* Floating Auto-Scroll Notification (if user scrolled up during generation) */}
        {!autoScroll && isThinking && (
            <button 
                onClick={() => setAutoScroll(true)}
                className="absolute bottom-6 right-8 bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 z-20"
            >
                <ChevronDown size={14} />
                <span>Follow Cursor</span>
            </button>
        )}
      </div>

      {/* Footer Info */}
      <div className="bg-[#0f172a] text-slate-500 text-[10px] px-4 py-1.5 border-t border-slate-800 flex justify-between items-center select-none">
        <div className="flex gap-4">
            <span>Spaces: 2</span>
            <span>UTF-8</span>
            <span className="uppercase">{activeTab === 'js' ? 'React' : activeTab}</span>
        </div>
        <div>
            Ln {lines.length}, Col {lines[lines.length - 1]?.length || 0}
        </div>
      </div>
    </div>
  );
};

export default CodeEditor;
