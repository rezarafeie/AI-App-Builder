import React, { useState, useRef, useEffect } from 'react';
import { Message, Suggestion } from '../types';
import { Send, Sparkles, Square, RefreshCw, Wrench, Lightbulb } from 'lucide-react';
import ThinkingTerminal from './ThinkingTerminal';
import { useTranslation } from '../utils/translations';

interface BuildState {
    plan: string[];
    currentStep: number;
    error: string | null;
}
interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  onStop: () => void;
  onRetry: (prompt: string) => void;
  onAutoFix: () => void;
  isThinking: boolean;
  buildState: BuildState | null;
  suggestions: Suggestion[];
}

const SUCCESS_SOUND_URL = 'https://cdn.pixabay.com/audio/2022/03/15/audio_2b28b1e36c.mp3';

const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  const parts = content.split(/(```[\s\S]*?```|`[^`]+`|\*\*[^*]+\*\*)/g);
  return (
    <div className="whitespace-pre-wrap leading-relaxed">
      {parts.map((part, index) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const code = part.slice(3, -3);
          return (
            <pre key={index} className="bg-slate-950/50 text-gray-300 p-3 rounded-md my-2 overflow-x-auto text-xs font-mono border border-slate-800">
              <code>{code}</code>
            </pre>
          );
        }
        if (part.startsWith('`') && part.endsWith('`')) {
            return <code key={index} className="bg-slate-800 text-indigo-300 px-1.5 py-0.5 rounded text-xs font-mono">{part.slice(1, -1)}</code>;
        }
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={index} className="text-white font-semibold">{part.slice(2, -2)}</strong>;
        }
        return <span key={index}>{part}</span>;
      })}
    </div>
  );
};

const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, onSendMessage, onStop, onRetry, onAutoFix, isThinking, buildState, suggestions }) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const successSoundRef = useRef<HTMLAudioElement | null>(null);
  const { t, dir } = useTranslation();
  
  const [showTerminal, setShowTerminal] = useState(false);
  const wasThinkingRef = useRef(false);
  
  useEffect(() => {
    successSoundRef.current = new Audio(SUCCESS_SOUND_URL);
    successSoundRef.current.volume = 0.5;
  }, []);


  useEffect(() => {
    setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, [messages, showTerminal]);

  useEffect(() => {
    if (isThinking) {
      setShowTerminal(true);
    } else {
      // If it *was* thinking and now it's not, play sound and hide terminal after a delay
      if (wasThinkingRef.current) {
        if (successSoundRef.current) {
            successSoundRef.current.play().catch(error => console.warn("Audio play failed:", error));
        }
        const timer = setTimeout(() => {
          setShowTerminal(false);
        }, 2000); 
        return () => clearTimeout(timer);
      }
    }
    wasThinkingRef.current = isThinking;
  }, [isThinking]);


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isThinking) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const handleRetryClick = () => {
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMessage) {
        onRetry(lastUserMessage.content);
    }
  };

  const handleSuggestionClick = (prompt: string) => {
    setInput(prompt);
  };

  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
  const lastMessageIsError = messages.length > 0 && messages[messages.length - 1].role === 'assistant' && messages[messages.length - 1].content.toLowerCase().includes('error');

  return (
    <div className="flex flex-col h-full bg-[#0f172a] relative">
      <div className="flex-1 overflow-y-auto p-4 space-y-8 scroll-smooth">
        {messages.length <= 1 && (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-50">
                <Sparkles size={48} className="mb-4 text-indigo-500/50" />
                <p>Start building your dream app...</p>
            </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} group`}>
             <span className={`text-[10px] mb-1.5 text-gray-500 font-medium px-1 ${msg.role === 'user' ? 'mr-1' : 'ml-1'}`}>
                {msg.role === 'user' ? t('you') : 'Nova AI'}
             </span>
             <div dir="auto" className={`max-w-[95%] px-5 py-3.5 text-sm shadow-sm ${ msg.role === 'user' ? 'bg-[#1e293b] text-gray-100 rounded-2xl rounded-tr-none border border-gray-700/50' : 'bg-transparent text-gray-300 pl-0'}`}>
                <MarkdownRenderer content={msg.content} />
             </div>
          </div>
        ))}
        
        {showTerminal && (
          <div className="w-full pl-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
             <ThinkingTerminal 
                isComplete={!isThinking}
                plan={buildState?.plan || []}
                currentStepIndex={buildState?.currentStep || 0}
                error={buildState?.error || null}
             />
          </div>
        )}

        {!isThinking && lastMessageIsError && (
            <div className="flex justify-start gap-2 pt-2">
                 <button onClick={handleRetryClick} className="flex items-center gap-2 text-xs bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 px-3 py-1.5 rounded-lg transition-colors border border-indigo-500/30">
                     <RefreshCw size={12}/>
                     Retry Generation
                 </button>
                 <button onClick={onAutoFix} className="flex items-center gap-2 text-xs bg-slate-600/20 hover:bg-slate-600/40 text-slate-300 px-3 py-1.5 rounded-lg transition-colors border border-slate-500/30">
                     <Wrench size={12}/>
                     Attempt to Fix
                 </button>
            </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-gradient-to-t from-[#0f172a] via-[#0f172a] to-transparent sticky bottom-0 z-20">
        
        {/* Suggestions Row */}
        {suggestions.length > 0 && !isThinking && (
          <div className="mb-3 flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 px-1">
             <div className="flex items-center gap-1.5 text-xs font-medium text-indigo-400 shrink-0 px-2">
                <Lightbulb size={12} />
                <span>Next:</span>
             </div>
             {suggestions.map((suggestion, index) => (
                <button 
                  key={index} 
                  onClick={() => handleSuggestionClick(suggestion.prompt)}
                  className="whitespace-nowrap bg-[#1e293b] hover:bg-indigo-600/20 hover:text-indigo-300 hover:border-indigo-500/30 text-gray-400 border border-gray-700 rounded-full px-3 py-1 text-xs transition-all duration-200 animate-in fade-in slide-in-from-bottom-2 fill-mode-forwards"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  {suggestion.title}
                </button>
             ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="relative group">
          <input
            type="text"
            dir="auto"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('placeholder')}
            disabled={isThinking}
            className="w-full bg-[#1e293b]/80 backdrop-blur-xl text-white placeholder-gray-500 rounded-2xl pl-5 pr-14 py-4 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 border border-gray-700/50 shadow-2xl transition-all"
          />
          <div className={`absolute top-1/2 -translate-y-1/2 ${dir === 'rtl' ? 'left-2' : 'right-2'}`}>
            {isThinking ? (
                <button type="button" onClick={onStop} className="relative p-2 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all" title="Stop Generating">
                    <div className="absolute inset-0 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin"></div>
                    <Square size={14} fill="currentColor" />
                </button>
            ) : (
                <button type="submit" disabled={!input.trim()} className="p-2 bg-indigo-600 rounded-xl text-white hover:bg-indigo-500 disabled:opacity-0 disabled:scale-75 transition-all duration-300 shadow-lg shadow-indigo-500/20">
                    <Send size={18} />
                </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;