import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { GeneratedCode, Message, Suggestion } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- SYSTEM INSTRUCTIONS ---

const CHAT_SYSTEM_INSTRUCTION = `
You are NovaBuilder's assistant. You are helpful, fast, and witty. Your goal is to answer general questions, explain concepts, or acknowledge simple requests. Use the provided conversation history to understand context. If the user asks to BUILD, CREATE, GENERATE, or MODIFY code, politely explain that you are switching to "Architect" mode. Keep responses concise.
`;

const ROUTER_SYSTEM_INSTRUCTION = `
You are a smart router. Your job is to decide if the user's input requires the "ARCHITECT" (who writes/modifies code) or the "CHAT" (who answers questions).
RETURN "ARCHITECT" IF: User wants to create, build, generate, modify, edit, fix, add, or change the app/code/UI.
RETURN "CHAT" IF: User is asking a conceptual question, saying hello, or reacting.
Output: Strictly "ARCHITECT" or "CHAT".
`;

const PLANNER_SYSTEM_INSTRUCTION = `
You are a senior software architect. Based on the user's request and conversation history, create a concise, step-by-step technical plan to build or modify the React application.
- The plan should have between 4 and 8 steps.
- Steps should be short, actionable phrases (e.g., "Scaffold main App component", "Add state for counter", "Style buttons with Tailwind").
- Return ONLY a JSON array of strings. Do not include markdown or any other text.
`;

const BUILDER_SYSTEM_INSTRUCTION_CHUNKED = `
You are NovaBuilder, an expert React developer executing one step in a multi-step build process. Your goal is to incrementally build an app by applying changes for the current step to the existing code.

--- OMNIPRESENT RULE ---
Under no circumstances should you fail or stop due to large requests. If you sense an overload or error, simplify your output for the current step. Always continue the task until a complete, successful result is delivered for the given step.

--- CORE RULES ---
1.  **INCREMENTAL BUILDS**: You will receive the 'CURRENT_JAVASCRIPT_CODE' and a specific 'CURRENT_BUILD_STEP'. You MUST modify the code to implement ONLY that step.
2.  **RETURN FULL CODE**: You MUST return the **FULL, COMPLETE** source code for the JavaScript file after your changes. Do not use comments like "//... existing code". The entire file is replaced on each step.
3.  **STAY FOCUSED**: Do not work ahead. Only implement the current 'CURRENT_BUILD_STEP'. Preserve all existing, unrelated functionality.
4.  **TECH STACK**:
    -   React Functional Components and Hooks (destructured from global 'React').
    -   Tailwind CSS via CDN for all styling.
    -   FontAwesome for icons (e.g., '<i className="fas fa-home"></i>').
    -   NO 'import' statements.
5.  **MOUNTING**: The final JS must mount an '<App />' component to the 'root' div using 'ReactDOM.createRoot'.
6.  **JSON OUTPUT**: Return a strict JSON object. The 'explanation' field should be a brief, past-tense summary of the step you just completed (e.g., "Added state management for the counter.").
`;

const REPAIR_SYSTEM_INSTRUCTION = `
You are a "Self-Healing" AI module. You've been given a piece of React code that produced an error. Your task is to analyze the code and the error message, fix the problem, and return the corrected, complete JavaScript code.

--- OMNIPRESENT RULE ---
Under no circumstances should you fail or stop. Your primary function is to repair broken code. Always find a solution and return a complete, valid response.

--- CORE RULES ---
1.  **Analyze**: Understand the error in the context of the provided code.
2.  **Fix**: Correct the syntax, logic, or structural error.
3.  **Return Full Code**: You MUST return the entire, corrected JavaScript file content. Do not use placeholders or omit code.
4.  **Maintain Functionality**: Preserve all original functionality that was not related to the error.
`;

const SUGGESTION_SYSTEM_INSTRUCTION = `
You are a product manager/UX designer for a web app builder.
Based on the conversation history and the current state of the code, suggest 3 to 4 logical, short, and actionable next steps or features to implement.
These should be things the user might want to do next to improve their app.

Rules:
1. Return a JSON array of objects.
2. Each object must have a 'title' (2-5 words, catchy and short) and a 'prompt' (a clear instruction for the AI builder).
3. Do not include markdown or explanations.
4. Ensure the prompt is specific (e.g., "Add a dark mode toggle to the navbar" instead of "Dark mode").
`;


// --- API CALLS ---

export class MaxRetriesError extends Error {
  constructor(message: string, public originalError: any) {
    super(message);
    this.name = 'MaxRetriesError';
  }
}

async function callWithRetry<T>(fn: () => Promise<T>, retries = 2, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries > 0) {
      console.warn(`API Call Failed. Retrying... (${retries} left). Error: ${error.message}`);
      await new Promise(res => setTimeout(res, delay));
      return callWithRetry(fn, retries - 1, delay * 2);
    }
    
    console.error("API Call Failed after all retries.");
    console.error("Error Message:", error.message);
    if (error.stack) {
        console.error("Stack Trace:", error.stack);
    }
    
    throw new MaxRetriesError("API call failed after multiple attempts. The service might be temporarily unavailable.", error);
  }
}

async function detectUserIntent(prompt: string, history: Message[]): Promise<boolean> {
    const context = history?.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n') || 'No history.';
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-flash-lite-latest',
        contents: `HISTORY:\n${context}\n\nUSER PROMPT: "${prompt}"`,
        config: { systemInstruction: ROUTER_SYSTEM_INSTRUCTION, temperature: 0 }
    });
    return response.text?.trim().toUpperCase() === 'ARCHITECT';
}

async function chatQuickly(prompt: string, history?: Message[]): Promise<string> {
    const context = history?.slice(-5).map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n") || "";
    const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-flash-lite-latest',
      contents: `CONVERSATION HISTORY:\n${context}\n\nUSER REQUEST: ${prompt}`,
      config: { systemInstruction: CHAT_SYSTEM_INSTRUCTION, temperature: 0.7 }
    }));
    return response.text || "I'm listening...";
}

// --- GENERATION SUPERVISOR ---

export interface SupervisorCallbacks {
    onPlanUpdate: (plan: string[]) => void;
    onStepStart: (stepIndex: number) => void;
    onChunkComplete: (code: GeneratedCode, explanation: string) => void;
    onSuccess: (finalCode: GeneratedCode, finalExplanation: string) => void;
    onError: (error: string, retriesLeft: number) => void;
    onFinalError: (error: string) => void;
}

export class GenerationSupervisor {
    private prompt: string;
    private history: Message[];
    private currentCode: GeneratedCode;
    private callbacks: SupervisorCallbacks;
    private plan: string[] = [];

    constructor(prompt: string, history: Message[], currentCode: GeneratedCode, callbacks: SupervisorCallbacks) {
        this.prompt = prompt;
        this.history = history;
        this.currentCode = currentCode;
        this.callbacks = callbacks;
    }

    public async start() {
        try {
            // 1. Create a plan
            this.plan = await this.generatePlan();
            this.callbacks.onPlanUpdate(this.plan);

            // 2. Execute plan steps
            for (let i = 0; i < this.plan.length; i++) {
                this.callbacks.onStepStart(i);
                await this.executeStep(i);
            }

            // 3. Success
            this.callbacks.onSuccess(this.currentCode, "Project built successfully!");
        } catch (error: any) {
            console.error("Build process failed terminally.", error);
            this.callbacks.onFinalError(error.message || "The build process failed after multiple attempts.");
        }
    }

    private async generatePlan(): Promise<string[]> {
        const historyContext = this.history.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n');
        const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-flash-lite-latest',
            contents: `USER_REQUEST: "${this.prompt}"\n\nHISTORY:\n${historyContext}`,
            config: {
                systemInstruction: PLANNER_SYSTEM_INSTRUCTION,
                responseMimeType: "application/json",
                responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } }
            }
        }));
        return JSON.parse(response.text || "[]");
    }

    private async executeStep(stepIndex: number) {
        let retries = 3;
        while (retries > 0) {
            try {
                const stepPrompt = this.createStepPrompt(stepIndex);
                const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
                    model: 'gemini-3-pro-preview',
                    contents: stepPrompt,
                    config: {
                        systemInstruction: BUILDER_SYSTEM_INSTRUCTION_CHUNKED,
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: Type.OBJECT, properties: {
                                html: { type: Type.STRING }, javascript: { type: Type.STRING },
                                css: { type: Type.STRING }, explanation: { type: Type.STRING }
                            }, required: ["javascript", "explanation"]
                        },
                    }
                }), 1);

                const result = JSON.parse(response.text!) as GeneratedCode;
                this.currentCode = { ...this.currentCode, ...result }; // Merge results
                this.callbacks.onChunkComplete(this.currentCode, result.explanation);
                return; // Success, exit loop
            } catch (error: any) {
                retries--;
                this.callbacks.onError(`Step failed: ${error.message}. Retrying... (${retries} left)`, retries);
                
                if (retries > 0) {
                    // Self-healing attempt
                    await this.repairCode(error.message);
                } else {
                    throw new Error(`Failed to execute step "${this.plan[stepIndex]}" after multiple retries.`);
                }
            }
        }
    }

    private async repairCode(errorMessage: string) {
        try {
            console.warn("Activating self-healing mode...");
            const repairPrompt = `
                --- CURRENT JAVASCRIPT CODE (has an error) ---
                ${this.currentCode.javascript}
                --- END CODE ---

                --- ERROR MESSAGE ---
                ${errorMessage}
                --- END ERROR ---

                Please fix the code.
            `;
            const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
                model: 'gemini-3-pro-preview',
                contents: repairPrompt,
                config: {
                    systemInstruction: REPAIR_SYSTEM_INSTRUCTION,
                    temperature: 0.2
                }
            }));
            
            this.currentCode.javascript = response.text || this.currentCode.javascript;
            console.log("Self-healing successful. Applying fix.");
            this.callbacks.onChunkComplete(this.currentCode, "Applied an automatic fix to the code.");
        } catch (repairError: any) {
            console.error("Self-healing failed", repairError);
        }
    }

    private createStepPrompt(stepIndex: number): string {
        return `
        CONTEXT:
        The user wants to build/modify a web application.
        
        USER_REQUEST: "${this.prompt}"
        
        BUILD_PLAN:
        ${this.plan.map((s, i) => `${i + 1}. ${s}`).join('\n')}
        
        CURRENT_STEP_ACTION:
        Step ${stepIndex + 1}: ${this.plan[stepIndex]}
        
        CURRENT_CODE_STATE:
        HTML: ${this.currentCode.html || '<!-- Empty -->'}
        CSS: ${this.currentCode.css || '/* Empty */'}
        JAVASCRIPT: ${this.currentCode.javascript || '// Empty'}
        
        INSTRUCTIONS:
        - Implement ONLY the changes required for "Step ${stepIndex + 1}".
        - Return the full updated code.
        `;
    }
}

export async function handleUserRequest(prompt: string, history: Message[], currentCode: GeneratedCode, callbacks: SupervisorCallbacks) {
    const isArchitect = await detectUserIntent(prompt, history);

    if (!isArchitect) {
        const response = await chatQuickly(prompt, history);
        callbacks.onSuccess(currentCode, response);
        return;
    }

    // Architect mode
    const supervisor = new GenerationSupervisor(prompt, history, currentCode, callbacks);
    await supervisor.start();
}

export async function generateProjectTitle(prompt: string): Promise<string> {
    const response = await ai.models.generateContent({
        model: 'gemini-flash-lite-latest',
        contents: `Generate a short, catchy, 3-5 word title for a web app based on this description: "${prompt}". Do not use quotes.`,
    });
    return response.text?.trim() || "New Project";
}

export async function generateSuggestions(history: Message[], currentCode: GeneratedCode): Promise<Suggestion[]> {
    try {
        const historyContext = history.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n');
        
        // We only send a summary of code size to save tokens/time, as usually context + feature list is enough
        const codeSummary = `
            HTML Size: ${currentCode.html?.length || 0} chars
            JS Size: ${currentCode.javascript?.length || 0} chars
            CSS Size: ${currentCode.css?.length || 0} chars
        `;

        const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-flash-lite-latest',
            contents: `HISTORY:\n${historyContext}\n\nCODE STATS:\n${codeSummary}\n\nSuggest 3-4 next features.`,
            config: {
                systemInstruction: SUGGESTION_SYSTEM_INSTRUCTION,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING },
                            prompt: { type: Type.STRING }
                        },
                        required: ["title", "prompt"]
                    }
                }
            }
        }));

        return JSON.parse(response.text || "[]");
    } catch (error) {
        console.error("Failed to generate suggestions", error);
        return [];
    }
}