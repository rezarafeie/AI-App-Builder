import React, { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, Circle, AlertTriangle, XCircle, RefreshCw, X } from 'lucide-react';

interface ThinkingTerminalProps {
  plan: string[];
  currentStepIndex: number;
  isComplete: boolean;
  error: string | null;
  onRetry?: () => void;
  onClose?: () => void;
}

const ThinkingTerminal: React.FC<ThinkingTerminalProps> = ({ plan, currentStepIndex, isComplete, error, onRetry, onClose }) => {
  const [displayedError, setDisplayedError] = useState<string | null>(null);

  useEffect(() => {
    if (error) {
        setDisplayedError(error);
    } else {
        // Fade out error slowly when it's resolved (only if still active)
        if (!isComplete) {
            const timer = setTimeout(() => setDisplayedError(null), 1000);
            return () => clearTimeout(timer);
        }
    }
  }, [error, isComplete]);
  
  const loadingPlan = plan.length === 0;
  const isFailed = isComplete && error;
  const isHealing = !isComplete && error;
  
  // A finished successful state is when complete, no error, and we have a plan
  const isSuccess = isComplete && !error && plan.length > 0;

  return (
    <div className="w-full max-w-md my-6 animate-in fade-in duration-300">
      <div className={`rounded-xl border p-5 backdrop-blur-md shadow-lg transition-colors duration-500 relative overflow-hidden ${
          isFailed ? 'bg-red-950/30 border-red-900/50' : 
          isSuccess ? 'bg-emerald-950/20 border-emerald-900/30' : 
          'bg-slate-900/80 border-slate-700/50'
      }`}>
        
        {/* Success Gradient Glow */}
        {isSuccess && (
            <div className="absolute top-0 right-0 -mt-10 -mr-10 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
        )}

        <div className="flex items-center justify-between mb-5 relative z-10">
            <div className="flex items-center gap-3">
                {isFailed ? (
                    <XCircle size={20} className="text-red-500" />
                ) : isSuccess ? (
                    <div className="bg-emerald-500/20 p-1 rounded-full"><CheckCircle2 size={16} className="text-emerald-500" /></div>
                ) : (
                    <Loader2 size={20} className="animate-spin text-indigo-400" />
                )}
            
                <span className={`font-medium text-sm font-mono tracking-wide ${
                    isFailed ? 'text-red-400' : 
                    isSuccess ? 'text-emerald-400' : 
                    'text-indigo-400'
                }`}>
                    {isFailed ? "Build Failed" : isSuccess ? "Build Complete" : loadingPlan ? "Planning..." : "Building..."}
                </span>
            </div>
            
            <div className="flex items-center gap-3">
                {isHealing && (
                    <div className="flex items-center gap-2 text-xs text-yellow-400 animate-in fade-in duration-300">
                        <AlertTriangle size={14} />
                        <span>Self-Healing Mode</span>
                    </div>
                )}
                
                {/* Close Button - Only show when done (Success or Failed) */}
                {(isSuccess || isFailed) && onClose && (
                    <button 
                        onClick={onClose}
                        className="text-slate-500 hover:text-white transition-colors p-1 rounded hover:bg-slate-800"
                        title="Dismiss Summary"
                    >
                        <X size={16} />
                    </button>
                )}
            </div>
        </div>
        
        <div className="space-y-3 pl-1 relative z-10">
            {loadingPlan && !isComplete && (
                <div className="flex items-center gap-4 text-sm animate-pulse text-gray-500">
                    <Circle size={14} />
                    <span>Analyzing project requirements...</span>
                </div>
            )}

            {plan.map((step, index) => {
                const isCompleted = (isComplete && !error) || (isFailed && index < currentStepIndex) || (!isComplete && index < currentStepIndex);
                // If failed, the current step is the one that failed
                const isFailedStep = isFailed && index === currentStepIndex;
                const isCurrent = !isComplete && index === currentStepIndex;
                const isPending = index > currentStepIndex;

                return (
                    <div 
                        key={index} 
                        className={`flex items-center gap-3.5 text-sm transition-all duration-500 ${
                            isPending ? 'opacity-30 translate-x-2' : 'opacity-100 translate-x-0'
                        }`}
                    >
                        <div className="flex-shrink-0 relative">
                            {isFailedStep ? (
                                <div className="w-4 h-4 rounded-full border-2 border-red-500 flex items-center justify-center">
                                    <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                                </div>
                            ) : isCompleted ? (
                                <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                    <CheckCircle2 size={14} className="text-emerald-500" />
                                </div>
                            ) : isCurrent ? (
                                <div className="relative">
                                    <div className={`absolute inset-0 rounded-full animate-ping ${isHealing ? 'bg-yellow-500/30' : 'bg-indigo-500/30'}`}></div>
                                    <div className={`w-4 h-4 rounded-full border-2 ${isHealing ? 'border-yellow-500' : 'border-indigo-500'} border-t-transparent animate-spin`}></div>
                                </div>
                            ) : (
                                <div className="w-4 h-4 rounded-full border border-slate-600"></div>
                            )}
                            
                            {index < plan.length - 1 && (
                                <div className={`absolute left-[7px] top-5 w-[1px] h-[18px] ${
                                    isCompleted ? 'bg-emerald-500/20' : 'bg-slate-800'
                                }`}></div>
                            )}
                        </div>
                        <span className={`font-mono text-[13px] ${
                            isCompleted ? 'text-gray-500' : 
                            isFailedStep ? 'text-red-400 font-semibold' :
                            isCurrent ? (isHealing ? 'text-yellow-300 font-semibold' : 'text-indigo-200 font-semibold') : 
                            'text-gray-600'
                        }`}>
                            {step}
                        </span>
                    </div>
                );
            })}
        </div>

        {isFailed && onRetry && (
             <div className="mt-6 pt-4 border-t border-red-900/30 animate-in fade-in slide-in-from-top-2 relative z-10">
                <p className="text-xs text-red-300 mb-3 font-mono">{error || "Process terminated unexpectedly."}</p>
                <button 
                    onClick={onRetry} 
                    className="w-full flex items-center justify-center gap-2 text-xs bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg transition-colors shadow-lg shadow-red-900/20 font-medium"
                >
                    <RefreshCw size={14} />
                    Retry Job
                </button>
            </div>
        )}
      </div>
    </div>
  );
};

export default ThinkingTerminal;