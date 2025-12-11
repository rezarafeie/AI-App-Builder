


import React, { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, Circle, AlertTriangle } from 'lucide-react';

interface ThinkingTerminalProps {
  plan: string[];
  currentStepIndex: number;
  isComplete: boolean;
  error: string | null;
}

const ThinkingTerminal: React.FC<ThinkingTerminalProps> = ({ plan, currentStepIndex, isComplete, error }) => {
  const [displayedError, setDisplayedError] = useState<string | null>(null);

  useEffect(() => {
    if (error) {
        setDisplayedError(error);
    } else {
        // Fade out error slowly when it's resolved
        const timer = setTimeout(() => setDisplayedError(null), 1000);
        return () => clearTimeout(timer);
    }
  }, [error]);
  
  const loadingPlan = plan.length === 0;

  return (
    <div className="w-full max-w-md my-6 animate-in fade-in duration-300">
      <div className="bg-slate-900/80 rounded-xl border border-slate-700/50 p-6 backdrop-blur-md shadow-lg">
        <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3 text-indigo-400">
                {isComplete ? (
                    <CheckCircle2 size={20} className="text-green-500" />
                ) : (
                    <Loader2 size={20} className="animate-spin" />
                )}
            
                <span className="font-medium text-sm font-mono tracking-wide">
                    {isComplete ? "Complete" : loadingPlan ? "Planning..." : "Building..."}
                </span>
            </div>
            {displayedError && (
                <div className="flex items-center gap-2 text-xs text-yellow-400 animate-in fade-in duration-300">
                    <AlertTriangle size={14} />
                    <span>Self-Healing Mode</span>
                </div>
            )}
        </div>
        
        <div className="space-y-4 pl-1">
            {loadingPlan && !isComplete && (
                <div className="flex items-center gap-4 text-sm animate-pulse text-gray-500">
                    <Circle size={14} />
                    <span>Analyzing project requirements...</span>
                </div>
            )}

            {plan.map((step, index) => {
                const isCompleted = isComplete || index < currentStepIndex;
                const isCurrent = !isComplete && index === currentStepIndex;
                const isPending = !isComplete && index > currentStepIndex;

                return (
                    <div 
                        key={index} 
                        className={`flex items-center gap-4 text-sm transition-all duration-500 ${
                            isPending ? 'opacity-30 translate-x-2' : 'opacity-100 translate-x-0'
                        }`}
                    >
                        <div className="flex-shrink-0 relative">
                            {isCompleted ? (
                                <div className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center">
                                    <CheckCircle2 size={14} className="text-green-500" />
                                </div>
                            ) : isCurrent ? (
                                <div className="relative">
                                    <div className="absolute inset-0 bg-indigo-500/30 rounded-full animate-ping"></div>
                                    <div className={`w-4 h-4 rounded-full border-2 ${error ? 'border-yellow-500' : 'border-indigo-500'} border-t-transparent animate-spin`}></div>
                                </div>
                            ) : (
                                <div className="w-4 h-4 rounded-full border border-slate-600"></div>
                            )}
                            
                            {index < plan.length - 1 && (
                                <div className={`absolute left-2 top-5 w-px h-6 -ml-px ${
                                    isCompleted ? 'bg-green-500/30' : 'bg-slate-800'
                                }`}></div>
                            )}
                        </div>
                        <span className={`font-mono ${
                            isCompleted ? 'text-gray-500 line-through' : 
                            isCurrent ? (error ? 'text-yellow-300 font-semibold' : 'text-indigo-200 font-semibold') : 
                            'text-gray-600'
                        }`}>
                            {step}
                        </span>
                    </div>
                );
            })}
        </div>
      </div>
    </div>
  );
};

export default ThinkingTerminal;