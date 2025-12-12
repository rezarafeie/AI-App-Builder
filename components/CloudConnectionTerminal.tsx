
import React from 'react';
import { Loader2, CheckCircle2, Circle, AlertTriangle, Cloud, RefreshCw, X } from 'lucide-react';

type Status = 'provisioning' | 'waking' | 'success' | 'error';

interface CloudConnectionTerminalProps {
  status: Status;
  error?: string | null;
  onRetry?: () => void;
  onClose: () => void;
}

const CloudConnectionTerminal: React.FC<CloudConnectionTerminalProps> = ({ status, error, onRetry, onClose }) => {
  const steps = [
    { id: 'provisioning', text: 'Provisioning cloud project...' },
    { id: 'waking', text: 'Waking up database...' },
  ];
  
  const getStepStatus = (stepId: 'provisioning' | 'waking') => {
    if (status === 'success') return 'completed';
    if (status === 'error') {
        if (stepId === 'provisioning' && (error?.includes('Database') || error?.includes('connection'))) return 'completed';
        return 'error';
    }
    
    if (stepId === 'provisioning') {
        return status === 'provisioning' ? 'active' : 'completed';
    }
    if (stepId === 'waking') {
        return status === 'waking' ? 'active' : (status === 'provisioning' ? 'pending' : 'completed');
    }
    return 'pending';
  };

  const isComplete = status === 'success' || status === 'error';

  return (
    <div className="w-full max-w-md my-6 animate-in fade-in duration-300">
      <div className={`rounded-xl border p-5 backdrop-blur-md shadow-lg transition-colors duration-500 relative overflow-hidden ${
          status === 'error' ? 'bg-red-950/30 border-red-900/50' : 
          status === 'success' ? 'bg-emerald-950/20 border-emerald-900/30' : 
          'bg-slate-900/80 border-slate-700/50'
      }`}>
        <div className="flex items-center justify-between mb-5 relative z-10">
            <div className="flex items-center gap-3">
                {status === 'error' ? (
                    <AlertTriangle size={20} className="text-red-500" />
                ) : status === 'success' ? (
                    <div className="bg-emerald-500/20 p-1 rounded-full"><CheckCircle2 size={16} className="text-emerald-500" /></div>
                ) : (
                    <Loader2 size={20} className="animate-spin text-indigo-400" />
                )}
            
                <span className={`font-medium text-sm font-mono tracking-wide ${
                    status === 'error' ? 'text-red-400' : 
                    status === 'success' ? 'text-emerald-400' : 
                    'text-indigo-400'
                }`}>
                    {status === 'error' ? "Connection Failed" : status === 'success' ? "Cloud Connected" : "Connecting to Cloud..."}
                </span>
            </div>
            {isComplete && (
                <button 
                    onClick={onClose}
                    className="text-slate-500 hover:text-white transition-colors p-1 rounded hover:bg-slate-800"
                    title="Dismiss"
                >
                    <X size={16} />
                </button>
            )}
        </div>
        
        <div className="space-y-3 pl-1 relative z-10">
            {steps.map((step, index) => {
                const stepStatus = getStepStatus(step.id as 'provisioning' | 'waking');
                const isCompleted = stepStatus === 'completed';
                const isActive = stepStatus === 'active';
                const isPending = stepStatus === 'pending';
                const isFailed = stepStatus === 'error';

                return (
                    <div 
                        key={step.id} 
                        className={`flex items-center gap-3.5 text-sm transition-all duration-500 ${
                            isPending ? 'opacity-30' : 'opacity-100'
                        }`}
                    >
                        <div className="flex-shrink-0 relative">
                            {isFailed ? (
                                <div className="w-4 h-4 rounded-full border-2 border-red-500 flex items-center justify-center"><div className="w-1.5 h-1.5 rounded-full bg-red-500"></div></div>
                            ) : isCompleted ? (
                                <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center"><CheckCircle2 size={14} className="text-emerald-500" /></div>
                            ) : isActive ? (
                                <div className="relative"><div className="absolute inset-0 rounded-full animate-ping bg-indigo-500/30"></div><div className="w-4 h-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div></div>
                            ) : (
                                <div className="w-4 h-4 rounded-full border border-slate-600"></div>
                            )}
                            
                            {index < steps.length - 1 && (
                                <div className={`absolute left-[7px] top-5 w-[1px] h-[18px] ${isCompleted ? 'bg-emerald-500/20' : 'bg-slate-800'}`}></div>
                            )}
                        </div>
                        <span className={`font-mono text-[13px] ${
                            isCompleted ? 'text-gray-500' : 
                            isFailed ? 'text-red-400 font-semibold' :
                            isActive ? 'text-indigo-200 font-semibold' : 
                            'text-gray-600'
                        }`}>
                            {step.text}
                        </span>
                    </div>
                );
            })}
        </div>

        {status === 'error' && (
             <div className="mt-6 pt-4 border-t border-red-900/30 animate-in fade-in slide-in-from-top-2 relative z-10">
                <p className="text-xs text-red-300 mb-3 font-mono break-words">{error || "Process terminated unexpectedly."}</p>
                {onRetry && <button 
                    onClick={onRetry} 
                    className="w-full flex items-center justify-center gap-2 text-xs bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg transition-colors shadow-lg shadow-red-900/20 font-medium"
                >
                    <RefreshCw size={14} />
                    Retry Connection
                </button>}
            </div>
        )}

        {status === 'success' && (
             <div className="mt-4 pt-4 border-t border-emerald-900/30 animate-in fade-in slide-in-from-top-2 relative z-10">
                 <p className="text-xs text-emerald-300 font-mono">Backend is ready. Resuming build...</p>
             </div>
        )}
      </div>
    </div>
  );
};

export default CloudConnectionTerminal;
