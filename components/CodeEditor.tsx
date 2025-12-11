import React, { useState, useEffect, useRef } from 'react';
import { GeneratedCode } from '../types';
import { Copy, Check, Terminal, Loader2 } from 'lucide-react';

interface CodeEditorProps {
  code: GeneratedCode | null;
  isThinking?: boolean;
}

const CodeEditor: React.FC<CodeEditorProps> = ({ code, isThinking = false }) => {
  const [activeTab, setActiveTab] = useState<'html' | 'js' | 'css'>('js');
  const [copied, setCopied] = useState(false);
  
  // Typewriter state
  const [displayedCode, setDisplayedCode] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const codeEndRef = useRef<HTMLDivElement>(null);

  const getFullContent = () => {
    if (!code) return '';
    switch (activeTab) {
      case 'html': return code.html || '<!-- No HTML -->';
      case 'js': return code.javascript || '// No JavaScript';
      case 'css': return code.css || '/* No CSS */';
    }
  };

  const fullContent = getFullContent();

  // Typewriter Effect Logic
  useEffect(() => {
    if (isThinking) {
        setDisplayedCode('');
        return;
    }

    setDisplayedCode('');
    setIsTyping(true);
    let currentIndex = 0;
    
    // Adjust speed based on length (longer code = faster typing)
    const speed = fullContent.length > 1000 ? 1 : 3;
    const chunkSize = fullContent.length > 2000 ? 20 : 5;

    const interval = setInterval(() => {
      if (currentIndex >= fullContent.length) {
        clearInterval(interval);
        setIsTyping(false);
        setDisplayedCode(fullContent);
        return;
      }

      const nextChunk = fullContent.slice(currentIndex, currentIndex + chunkSize);
      setDisplayedCode(prev => prev + nextChunk);
      currentIndex += chunkSize;

      // Auto-scroll to bottom while typing
      if (codeEndRef.current) {
         codeEndRef.current.scrollIntoView({ behavior: 'auto', block: 'nearest' });
      }

    }, speed);

    return () => clearInterval(interval);
  }, [fullContent, isThinking]);

  const handleCopy = () => {
    navigator.clipboard.writeText(fullContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Simple Regex Syntax Highlighter
  const highlightCode = (code: string, lang: 'js' | 'html' | 'css') => {
    if (!code) return { __html: '' };
    
    // Escape HTML entities first
    let html = code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    if (lang === 'js') {
        // Comments
        html = html.replace(/(\/\/.*)/g, '<span class="text-gray-500 italic">$1</span>');
        
        // Keywords
        html = html.replace(/\b(const|let|var|function|return|if|else|for|while|import|export|from|default|class|extends|=>|async|await|try|catch|switch|case|break)\b/g, '<span class="text-pink-400 font-semibold">$1</span>');
        
        // React Hooks & Built-ins
        html = html.replace(/\b(useState|useEffect|useRef|useCallback|useMemo|React|ReactDOM|console|window|document)\b/g, '<span class="text-cyan-400">$1</span>');
        
        // Function Calls
        html = html.replace(/([a-zA-Z0-9_]+)(?=\()/g, '<span class="text-yellow-300">$1</span>');
        
        // Strings
        html = html.replace(/(['"`])(.*?)\1/g, '<span class="text-emerald-400">$1$2$1</span>');
        
        // JSX Tags
        html = html.replace(/(&lt;\/?)(\w+)/g, '$1<span class="text-blue-400">$2</span>');
        
        // Attributes (simple)
        html = html.replace(/\b([a-zA-Z-0-9]+)=/g, '<span class="text-sky-300">$1</span>=');
    }

    if (lang === 'css') {
        html = html.replace(/([a-zA-Z-0-9]+):/g, '<span class="text-cyan-300">$1</span>:');
        html = html.replace(/:(.*?);/g, ':<span class="text-emerald-300">$1</span>;');
        html = html.replace(/(\.|#)([a-zA-Z0-9_-]+)/g, '<span class="text-yellow-300">$1$2</span>');
    }

    if (lang === 'html') {
        html = html.replace(/(&lt;\/?)(\w+)/g, '$1<span class="text-blue-400">$2</span>');
        html = html.replace(/\b([a-zA-Z-0-9]+)=/g, '<span class="text-sky-300">$1</span>=');
        html = html.replace(/(['"])(.*?)\1/g, '<span class="text-emerald-400">$1$2$1</span>');
    }

    return { __html: html };
  };

  // Line Numbers Generation
  const lines = displayedCode.split('\n');

  if (!code && !isThinking) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 bg-[#1e1e1e]">
        <div className="text-center">
            <Terminal size={48} className="mx-auto mb-4 opacity-20" />
            <p>Code will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e] text-gray-300 font-mono text-sm relative">
      {/* Tab Header */}
      <div className="flex items-center justify-between bg-[#252526] px-4 py-2 border-b border-black/50 select-none">
        <div className="flex gap-1">
          {['js', 'html', 'css'].map((tab) => (
             <button 
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`px-3 py-1.5 rounded-t-md text-xs font-medium transition-colors ${
                    activeTab === tab 
                    ? 'bg-[#1e1e1e] text-white border-t border-indigo-500' 
                    : 'text-gray-500 hover:text-gray-300 hover:bg-[#2d2d2d]'
                }`}
            >
                {tab === 'js' ? 'React.jsx' : tab === 'html' ? 'index.html' : 'style.css'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
            {isThinking && (
                <div className="flex items-center gap-2 text-xs text-indigo-400 animate-pulse mr-2">
                    <Loader2 size={12} className="animate-spin" />
                    Generating...
                </div>
            )}
            <button onClick={handleCopy} className="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-white" title="Copy Code">
                {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
            </button>
        </div>
      </div>

      {/* Editor Area */}
      <div className="flex-1 overflow-auto relative flex" id="code-scroll-container">
        
        {/* Line Numbers */}
        <div className="bg-[#1e1e1e] border-r border-gray-800 py-4 px-2 text-right select-none sticky left-0 z-10 min-h-full">
            {lines.map((_, i) => (
                <div key={i} className="text-gray-600 text-xs leading-6 font-mono w-8">
                    {i + 1}
                </div>
            ))}
            {isThinking && !displayedCode && (
                 <div className="text-gray-600 text-xs leading-6 font-mono w-8 animate-pulse">1</div>
            )}
        </div>

        {/* Code Content */}
        <div className="flex-1 p-4 pt-4 overflow-x-auto">
            {isThinking && !displayedCode ? (
                <div className="flex items-center gap-2 text-gray-500 italic">
                    <span className="w-2 h-4 bg-indigo-500 animate-blink block"></span>
                    <span>// AI is thinking...</span>
                </div>
            ) : (
                <pre className="font-mono text-sm leading-6 tab-4 outline-none">
                    <code 
                        dangerouslySetInnerHTML={highlightCode(displayedCode, activeTab)} 
                    />
                    {isTyping && <span className="w-2 h-4 bg-indigo-500 inline-block align-middle animate-pulse ml-0.5"></span>}
                    <div ref={codeEndRef} />
                </pre>
            )}
        </div>
      </div>
      
      {/* Footer Status */}
      <div className="bg-[#007acc] text-white text-[10px] px-3 py-1 flex justify-between items-center select-none">
        <div className="flex gap-4">
            <span>Spaces: 2</span>
            <span>UTF-8</span>
            <span>{activeTab === 'js' ? 'JavaScript React' : activeTab.toUpperCase()}</span>
        </div>
        <div>
            Ln {lines.length}, Col 1
        </div>
      </div>
    </div>
  );
};

export default CodeEditor;