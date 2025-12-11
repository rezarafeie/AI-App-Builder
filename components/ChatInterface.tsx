import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Message, Suggestion, BuildState } from '../types';
import { Send, Sparkles, Square, RefreshCw, Wrench, Lightbulb, Paperclip, X, Image as ImageIcon, Wind } from 'lucide-react';
import ThinkingTerminal from './ThinkingTerminal';
import { useTranslation } from '../utils/translations';

interface StagedImage {
  file: File;
  previewUrl: string;
}

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (content: string, images: StagedImage[]) => void;
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
          return <pre key={index} className="bg-slate-950/50 text-gray-300 p-3 rounded-md my-2 overflow-x-auto text-xs font-mono border border-slate-800"><code>{code}</code></pre>;
        }
        if (part.startsWith('`') && part.endsWith('`')) return <code key={index} className="bg-slate-800 text-indigo-300 px-1.5 py-0.5 rounded text-xs font-mono">{part.slice(1, -1)}</code>;
        if (part.startsWith('**') && part.endsWith('**')) return <strong key={index} className="text-white font-semibold">{part.slice(2, -2)}</strong>;
        return <span key={index}>{part}</span>;
      })}
    </div>
  );
};

const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, onSendMessage, onStop, onRetry, onAutoFix, isThinking, buildState, suggestions }) => {
  const [input, setInput] = useState('');
  const [stagedImages, setStagedImages] = useState<StagedImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const successSoundRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wasThinkingRef = useRef(false);
  const { t, dir } = useTranslation();

  useEffect(() => {
    successSoundRef.current = new Audio(SUCCESS_SOUND_URL);
    successSoundRef.current.volume = 0.5;
  }, []);

  useEffect(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [messages, buildState]);

  useEffect(() => {
    if (!isThinking && wasThinkingRef.current) {
        successSoundRef.current?.play().catch(console.warn);
    }
    wasThinkingRef.current = isThinking;
  }, [isThinking]);

  const handleFileValidation = (file: File): boolean => {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      const maxSize = 10 * 1024 * 1024; // 10 MB
      if (!allowedTypes.includes(file.type)) {
          alert('Invalid file type. Please upload PNG, JPG, or WebP.');
          return false;
      }
      if (file.size > maxSize) {
          alert('File is too large. Maximum size is 10MB.');
          return false;
      }
      return true;
  };

  const addFilesToStage = (files: File[]) => {
      const validFiles = Array.from(files).filter(handleFileValidation);
      if (validFiles.length > 0) {
          const newImages: StagedImage[] = validFiles.map(file => ({
              file,
              previewUrl: URL.createObjectURL(file)
          }));
          setStagedImages(prev => [...prev, ...newImages]);
      }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) addFilesToStage(Array.from(e.target.files));
  };
  
  const removeStagedImage = (index: number) => {
      setStagedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((input.trim() || stagedImages.length > 0) && !isThinking) {
      onSendMessage(input.trim(), stagedImages);
      setInput('');
      setStagedImages([]);
    }
  };

  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
  const handleRetryClick = () => lastUserMessage && onRetry(lastUserMessage.content);
  const handleSuggestionClick = (prompt: string) => { setInput(prompt); document.getElementById('chat-input')?.focus(); };
  
  const dropHandler = useCallback((ev: React.DragEvent<HTMLDivElement>) => {
    ev.preventDefault();
    setIsDragging(false);
    if (ev.dataTransfer.files) addFilesToStage(Array.from(ev.dataTransfer.files));
  }, []);
  
  const dragOverHandler = (ev: React.DragEvent<HTMLDivElement>) => {
    ev.preventDefault();
    setIsDragging(true);
  };
  
  const dragLeaveHandler = () => setIsDragging(false);

  const pasteHandler = useCallback((ev: ClipboardEvent) => {
    if (ev.clipboardData) {
      const items = Array.from(ev.clipboardData.items).filter(item => item.type.indexOf('image') !== -1);
      if (items.length > 0) {
        const files = items.map(item => item.getAsFile()).filter(Boolean) as File[];
        addFilesToStage(files);
      }
    }
  }, []);
  
  useEffect(() => {
    window.addEventListener('paste', pasteHandler);
    return () => window.removeEventListener('paste', pasteHandler);
  }, [pasteHandler]);

  const lastMessageIsError = messages.length > 0 && messages[messages.length - 1].role === 'assistant' && messages[messages.length - 1].content.toLowerCase().includes('error');
  const shouldShowTerminal = isThinking || (buildState && buildState.plan.length > 0);

  return (
    <div className="flex flex-col h-full bg-[#0f172a] relative" onDrop={dropHandler} onDragOver={dragOverHandler} onDragLeave={dragLeaveHandler}>
      {isDragging && (
        <div className="absolute inset-0 bg-indigo-900/50 backdrop-blur-sm z-30 flex flex-col items-center justify-center pointer-events-none border-4 border-dashed border-indigo-500 rounded-2xl m-4">
            <ImageIcon size={48} className="text-indigo-300 mb-4" />
            <p className="font-bold text-lg text-white">Drop images to upload</p>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4 space-y-8 scroll-smooth">
        {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-50"><Sparkles size={48} className="mb-4 text-indigo-500/50" /><p>Start building your dream app...</p></div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} group`}>
             <div className={`flex items-baseline gap-2 mb-1.5 px-1 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}><span className="text-[10px] text-gray-500 font-medium">{msg.role === 'user' ? t('you') : 'Nova AI'}</span><span className="text-[10px] text-gray-600 font-mono opacity-0 group-hover:opacity-100 transition-opacity">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
             <div dir="auto" className={`max-w-[95%] text-sm shadow-sm ${ msg.role === 'user' ? 'bg-[#1e293b] text-gray-100 rounded-2xl rounded-tr-none border border-gray-700/50' : 'bg-transparent text-gray-300 pl-0'}`}>
                {msg.images && msg.images.length > 0 && (
                    <div className={`grid gap-2 p-2 ${msg.images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        {msg.images.map((img, idx) => (
                            <img key={idx} src={img} alt="Chat attachment" className="rounded-lg max-w-full h-auto object-cover max-h-60" />
                        ))}
                    </div>
                )}
                {msg.content && <div className="px-5 py-3.5"><MarkdownRenderer content={msg.content} /></div>}
             </div>
          </div>
        ))}
        
        {shouldShowTerminal && (
          <div className="w-full pl-0 animate-in fade-in slide-in-from-bottom-4 duration-500"><ThinkingTerminal isComplete={!isThinking} plan={buildState?.plan || []} currentStepIndex={buildState?.currentStep || 0} error={buildState?.error || null} /></div>
        )}

        {!isThinking && lastMessageIsError && (
            <div className="flex justify-start gap-2 pt-2">
                 <button onClick={handleRetryClick} className="flex items-center gap-2 text-xs bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 px-3 py-1.5 rounded-lg transition-colors border border-indigo-500/30"><RefreshCw size={12}/>Retry</button>
                 <button onClick={onAutoFix} className="flex items-center gap-2 text-xs bg-slate-600/20 hover:bg-slate-600/40 text-slate-300 px-3 py-1.5 rounded-lg transition-colors border border-slate-500/30"><Wrench size={12}/>Attempt Fix</button>
            </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-gradient-to-t from-[#0f172a] via-[#0f172a] to-transparent sticky bottom-0 z-20">
        {suggestions.length > 0 && !isThinking && (
          <div className="mb-3 flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 px-1"><div className="flex items-center gap-1.5 text-xs font-medium text-indigo-400 shrink-0 px-2"><Lightbulb size={12} /><span>Next:</span></div>{suggestions.map((s, i) => (<button key={i} onClick={() => handleSuggestionClick(s.prompt)} className="whitespace-nowrap bg-[#1e293b] hover:bg-indigo-600/20 hover:text-indigo-300 hover:border-indigo-500/30 text-gray-400 border border-gray-700 rounded-full px-3 py-1 text-xs transition-all duration-200 animate-in fade-in slide-in-from-bottom-2 fill-mode-forwards" style={{ animationDelay: `${i * 100}ms` }}>{s.title}</button>))}</div>
        )}
        <form onSubmit={handleSubmit} className="relative group bg-[#1e293b]/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 shadow-2xl">
          {stagedImages.length > 0 && (
            <div className="p-2 border-b border-gray-700/50"><div className="flex gap-2 overflow-x-auto">{stagedImages.map((img, i) => (<div key={i} className="relative shrink-0"><img src={img.previewUrl} className="w-16 h-16 rounded-lg object-cover" /><button type="button" onClick={() => removeStagedImage(i)} className="absolute -top-1 -right-1 bg-gray-900/80 text-white rounded-full p-0.5"><X size={12} /></button></div>))}</div></div>
          )}
          <div className="flex items-center">
            <button type="button" onClick={() => fileInputRef.current?.click()} className="p-4 text-gray-400 hover:text-indigo-400 transition-colors"><Paperclip size={20} /></button>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/png, image/jpeg, image/webp" multiple className="hidden" />
            <input id="chat-input" type="text" dir="auto" value={input} onChange={(e) => setInput(e.target.value)} placeholder={t('placeholder')} disabled={isThinking} className="w-full bg-transparent text-white placeholder-gray-500 focus:outline-none py-4" />
            <div className="p-2">{isThinking ? (<button type="button" onClick={onStop} className="relative p-2 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500/20" title="Stop"><div className="absolute inset-0 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin"></div><Square size={14} fill="currentColor" /></button>) : (<button type="submit" disabled={!input.trim() && stagedImages.length === 0} className="p-2 bg-indigo-600 rounded-xl text-white hover:bg-indigo-500 disabled:opacity-0 disabled:scale-75 transition-all duration-300 shadow-lg shadow-indigo-500/20"><Send size={18} /></button>)}</div>
          </div>
        </form>
      </div>
    </div>
  );
};
export default ChatInterface;
