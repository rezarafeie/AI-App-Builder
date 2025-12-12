
// ... (imports remain the same)
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { GeneratedCode, Message, Suggestion, BuildState, Project } from "../types";
import { rafieiCloudService } from "./rafieiCloudService";

// Safe environment access
const getEnv = (key: string) => {
  try {
    // @ts-ignore
    if (typeof process !== 'undefined' && process.env) {
       // @ts-ignore
       return process.env[key];
    }
  } catch (e) {
    // Ignore errors
  }
  return undefined;
};

const ai = new GoogleGenAI({ apiKey: getEnv('API_KEY') || '' });

const DB_CONNECT_MESSAGE = "This project requires a backend database. Starting Rafiei Cloud connection process...";

// --- SYSTEM INSTRUCTIONS ---
const CHAT_SYSTEM_INSTRUCTION = `
You are Rafiei Builder's assistant. You are helpful, fast, and witty. Your goal is to answer general questions, explain concepts, or acknowledge simple requests. Use the provided conversation history to understand context. If the user asks to BUILD, CREATE, GENERATE, or MODIFY code, politely explain that you are switching to "Architect" mode. Keep responses concise.
`;

const ROUTER_SYSTEM_INSTRUCTION = `
You are a smart router. Your job is to decide if the user's input requires the "ARCHITECT" (who writes/modifies code) or the "CHAT" (who answers questions).
RETURN "ARCHITECT" IF: User wants to create, build, generate, modify, edit, fix, add, or change the app/code/UI. This includes requests with images.
RETURN "CHAT" IF: User is asking a conceptual question, saying hello, or reacting.
Output: Strictly "ARCHITECT" or "CHAT".
`;

const REQUIREMENTS_ANALYZER_SYSTEM_INSTRUCTION = `
You are a technical requirements analyst for a web app builder.
Your task is to classify if a user's request requires a BACKEND DATABASE (Supabase) or if it can be built as a STATIC FRONTEND.

**CRITICAL RULES:**
1. **RETURN "databaseRequired": true IF:**
   - The user wants to **STORE**, **SAVE**, **RECORD**, **KEEP**, **COLLECT**, or **PERSIST** data.
   - The user mentions specific data fields like **"first name"**, **"last name"**, **"email"**, **"phone"**.
   - Example: "Store user name", "Save messages", "Guestbook", "Todo list that saves", "Form to collect names".
   - The user mentions **Database**, **DB**, **SQL**, **Tables**, **Auth**, **Login**, **Users**.
   - The user mentions **FORMS** that submit data (e.g. "Contact Form", "Signup Form", "Order Form").
   - The user mentions dynamic entities like **Posts**, **Comments**, **Products**, **Orders**, **Inventory**.
   - Even if the user says "Simple app", if it involves *saving* data, it NEEDS a database.

2. **RETURN "databaseRequired": false IF:**
   - The request is purely visual (e.g., "Change color to red", "Make it responsive").
   - The data is transient/local only (e.g., "Calculator", "Unit converter", "Lorem ipsum generator").
   - The user EXPLICITLY says "static", "mock data", "frontend only", "no db".

3. **AMBIGUITY:**
   - If unsure, default to **true** to ensure the app is capable.

**Output strictly JSON:** { "databaseRequired": boolean }
`;

const PLANNER_SYSTEM_INSTRUCTION = `
You are a senior software architect. Based on the user's request (which may include images) and conversation history, create a concise, step-by-step technical plan to build or modify the React application.
// ... (rest of instructions)
- Return ONLY a JSON array of strings. Do not include markdown or any other text.
`;

const BUILDER_SYSTEM_INSTRUCTION_CHUNKED = `
You are Rafiei Builder, an expert React developer executing one step in a multi-step build process. Your goal is to incrementally build an app by applying changes for the current step to the existing code.

--- CRITICAL ARCHITECTURE RULES ---
1.  **SINGLE FILE REACT**: You are building a *single-file* React application.
    -   **DO NOT IMPORT LOCAL FILES**: Do not write \`import Header from './Header';\` or \`import { Card } from '@/components/ui/card';\`. These files DO NOT EXIST.
    -   **DEFINE EVERYTHING LOCALLY**: All components (Header, Footer, Cards, Buttons) must be defined in this same file before they are used.
    -   **NO EXPORTS**: Do not use \`export default\`. Just define the component.
    -   **TAILWIND ONLY**: Use Tailwind CSS classes for all styling. Do not write custom CSS in the 'css' field unless absolutely necessary for animations.

2.  **TECH STACK**:
    -   React Functional Components & Hooks.
    -   Tailwind CSS (via CDN).
    -   Lucide React Icons (available globally as \`lucide-react\`).
    -   **NO EXTERNAL NPM MODULES** (except \`lucide-react\`, \`recharts\`, \`framer-motion\`, \`@supabase/supabase-js\`).

3.  **RETURN FULL CODE**: You MUST return the **FULL, COMPLETE** source code for the JavaScript file after your changes. Do not use comments like "//... existing code".

4.  **MOUNTING**:
    -   You MUST define a root component named \`App\`.
    -   You MUST end the code with the mounting logic:
        \`\`\`javascript
        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(<App />);
        \`\`\`

5.  **JSON OUTPUT**: Return a strict JSON object with keys: 'html' (usually empty div), 'javascript' (The React Code), 'css' (Optional), 'explanation'.

--- IMAGE & DATABASE ---
- Use provided image URLs directly.
- Use \`supabase.createClient\` if backend config is present.
`;

const SQL_GENERATOR_SYSTEM_INSTRUCTION = `
You are a Database Architect for Supabase (PostgreSQL).
// ... (rest of instructions)
`;

const REPAIR_SYSTEM_INSTRUCTION = `
You are a "Self-Healing" AI module. You've been given a piece of React code that produced an error.
// ... (rest of instructions)
`;

const SUGGESTION_SYSTEM_INSTRUCTION = `
You are a product manager/UX designer for a web app builder.
// ... (rest of instructions)
`;

export class MaxRetriesError extends Error {
  constructor(message: string, public originalError: any) {
    super(message);
    this.name = 'MaxRetriesError';
  }
}

function cleanJsonOutput(text: string): string {
    if (!text) return "{}";
    let clean = text.trim();
    clean = clean.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
    return clean;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => 
            setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
        )
    ]);
}

async function callWithRetry<T>(fn: () => Promise<T>, retries = 2, delay = 1000, timeoutMs = 120000): Promise<T> {
  try {
    return await withTimeout(fn(), timeoutMs);
  } catch (error: any) {
    if (retries > 0) {
      console.warn(`API Call Failed. Retrying... (${retries} left). Error: ${error.message}`);
      await new Promise(res => setTimeout(res, delay));
      return callWithRetry(fn, retries - 1, delay * 2, timeoutMs);
    }
    throw new MaxRetriesError("API call failed after multiple attempts.", error);
  }
}

export interface SupervisorCallbacks {
    onPlanUpdate: (plan: string[]) => Promise<void>;
    onStepStart: (stepIndex: number) => Promise<void>;
    onStepComplete: (stepIndex: number) => Promise<void>;
    onChunkComplete: (code: GeneratedCode, explanation: string) => Promise<void>;
    onSuccess: (finalCode: GeneratedCode, finalExplanation: string) => Promise<void>;
    onError: (error: string, retriesLeft: number) => Promise<void>;
    onFinalError: (error: string) => Promise<void>;
}

class GenerationSupervisor {
    private prompt: string;
    private images?: string[]; 
    private history: Message[];
    private currentCode: GeneratedCode;
    private project: Project;
    private callbacks: SupervisorCallbacks;
    private plan: string[] = [];
    private abortSignal?: AbortSignal;

    constructor(project: Project, prompt: string, images: string[] | undefined, callbacks: SupervisorCallbacks, abortSignal?: AbortSignal) {
        this.project = project;
        this.prompt = prompt;
        this.images = images;
        this.history = project.messages;
        this.currentCode = project.code;
        this.callbacks = callbacks;
        this.abortSignal = abortSignal;
    }

    private checkAborted() {
        if (this.abortSignal?.aborted) {
            throw new Error('Build cancelled by user');
        }
    }

    public async start() {
        try {
            this.checkAborted();
            this.plan = await this.generatePlan();
            this.checkAborted();

            // --- STRICT FAILSAFE: Check if plan requires SQL but no DB connected ---
            // Check for keywords in plan steps that imply database usage
            const needsDb = this.plan.some(step => {
                const s = step.toUpperCase();
                return s.includes("SQL") || 
                       s.includes("DATABASE") || 
                       s.includes("TABLE") || 
                       s.startsWith("CREATE ") || 
                       s.includes("SCHEMA");
            });

            const hasDb = (this.project.rafieiCloudProject && this.project.rafieiCloudProject.status === 'ACTIVE') || 
                          (this.project.supabaseConfig && !!this.project.supabaseConfig.url);

            if (needsDb && !hasDb) {
                // If plan requires DB but none exists, abort with specific code.
                // We throw BEFORE calling onPlanUpdate so the user doesn't see the SQL steps in the terminal.
                throw new Error("DB_REQUIRED_BY_PLAN");
            }
            // ----------------------------------------------------------------

            if (!this.plan || this.plan.length === 0) {
                await this.callbacks.onSuccess(this.currentCode, "I've reviewed your request but no code changes were needed.");
                return;
            }
            await this.callbacks.onPlanUpdate(this.plan);
            await this.executeLoop(0);
            await this.callbacks.onSuccess(this.currentCode, "Project built successfully!");
        } catch (error: any) {
            if (error.message === 'Build cancelled by user') {
                console.log("Build stopped by supervisor check.");
                return; // Silent exit
            }
            if (error.message === 'DB_REQUIRED_BY_PLAN') {
                 console.warn("Halting build: Plan requires DB, but none active.");
                 // Pass this specific error to onFinalError so UI can react. 
                 // Using the constant friendly message defined at top of file.
                 await this.callbacks.onFinalError(DB_CONNECT_MESSAGE);
                 return;
            }
            console.error("Build process failed terminally.", error);
            await this.callbacks.onFinalError(error.message || "The build process failed after multiple attempts.");
        }
    }

    private async executeLoop(startIndex: number) {
        for (let i = startIndex; i < this.plan.length; i++) {
            this.checkAborted();
            await this.callbacks.onStepStart(i);
            const stepDescription = this.plan[i];
            
            // Loose matching for SQL steps to be safe
            if (stepDescription.toUpperCase().includes("SQL") || stepDescription.toUpperCase().startsWith("CREATE TABLE")) {
                await this.executeSqlStep(stepDescription, i);
            } else {
                await this.executeCodeStep(i);
            }
            
            this.checkAborted();
            await this.callbacks.onStepComplete(i);
        }
    }

    private async generatePlan(): Promise<string[]> {
        this.checkAborted();
        const historyContext = this.history.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n');
        
        let backendContext = '';
        if (this.project.rafieiCloudProject && this.project.rafieiCloudProject.status === 'ACTIVE') {
            backendContext = "\n[SYSTEM] A Rafiei Cloud (Supabase) Database is ACTIVE. You CAN and SHOULD include 'SQL: ...' steps to create tables if needed.";
        } else if (this.project.supabaseConfig && this.project.supabaseConfig.url) {
            backendContext = "\n[SYSTEM] A manual Supabase Database is configured. You CAN and SHOULD include 'SQL: ...' steps.";
        }

        const requestParts: any[] = [
            { text: `USER_REQUEST: "${this.prompt}"\n${backendContext}\n\nHISTORY:\n${historyContext}` }
        ];

        if (this.images && this.images.length > 0) {
            for (const image of this.images) {
                try {
                    const parts = image.split(',');
                    if (parts.length === 2) {
                        requestParts.push({ inlineData: { mimeType: parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg', data: parts[1] } });
                    }
                } catch (e) {}
            }
        }

        const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: requestParts },
            config: {
                systemInstruction: PLANNER_SYSTEM_INSTRUCTION,
                responseMimeType: "application/json",
                responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } }
            }
        }));
        
        try {
            return JSON.parse(cleanJsonOutput(response.text || "[]"));
        } catch (e) {
            return ["Analyze request", "Implement changes"];
        }
    }

    private async executeSqlStep(stepDescription: string, stepIndex: number) {
        this.checkAborted();
        // Double check in execution loop
        if (!this.project.rafieiCloudProject || this.project.rafieiCloudProject.status !== 'ACTIVE') {
             // If we reached here without DB, throw error to trigger recovery
             throw new Error("DB_REQUIRED_BY_PLAN");
        }

        try {
            const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `Task: ${stepDescription}`,
                config: {
                    systemInstruction: SQL_GENERATOR_SYSTEM_INSTRUCTION,
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: { sql: { type: Type.STRING }, explanation: { type: Type.STRING } },
                        required: ["sql", "explanation"]
                    }
                }
            }));

            const result = JSON.parse(cleanJsonOutput(response.text!));
            if (result.sql) {
                await rafieiCloudService.executeSql(this.project.rafieiCloudProject.projectRef, result.sql);
                this.checkAborted();
                await this.callbacks.onChunkComplete(this.currentCode, `[DATABASE] ${result.explanation}`);
            }

        } catch (error: any) {
            if (error.message === 'Build cancelled by user') throw error;
            await this.callbacks.onError(`Database migration failed: ${error.message}. Continuing with frontend...`, 0);
        }
    }

    private async executeCodeStep(stepIndex: number) {
        let retries = 3;
        while (retries > 0) {
            this.checkAborted();
            try {
                const stepPrompt = this.createStepPrompt(stepIndex);
                const requestContents: any[] = [{ text: stepPrompt }];

                if (this.images && this.images.length > 0) {
                     for (const image of this.images) {
                        try {
                            const parts = image.split(',');
                            if (parts.length === 2) {
                                requestContents.push({ inlineData: { mimeType: parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg', data: parts[1] } });
                            }
                        } catch (e) {}
                    }
                }
                
                const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: { parts: requestContents },
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

                this.checkAborted();
                const cleanedJson = cleanJsonOutput(response.text!);
                const result = JSON.parse(cleanedJson) as GeneratedCode;
                
                this.currentCode = { ...this.currentCode, ...result };
                await this.callbacks.onChunkComplete(this.currentCode, result.explanation);
                return;
            } catch (error: any) {
                if (error.message === 'Build cancelled by user') throw error;
                retries--;
                await this.callbacks.onError(`Step failed: ${error.message}. Retrying...`, retries);
                if (retries > 0) {
                    await this.repairCode(error.message);
                } else {
                    throw new Error(`Failed to execute step "${this.plan[stepIndex]}" after multiple retries.`);
                }
            }
        }
    }

    private async repairCode(errorMessage: string) {
        this.checkAborted();
        try {
            const repairPrompt = `
            The last step produced an error. Analyze the error message and the current code, then provide a fix.

            ERROR MESSAGE:
            "${errorMessage}"

            CURRENT JAVASCRIPT CODE:
            \`\`\`javascript
            ${this.currentCode.javascript}
            \`\`\`
            
            INSTRUCTIONS:
            - Fix the error in the javascript code.
            - Return the FULL, corrected javascript code.
            - Provide a brief, past-tense explanation of the fix.
            `;

            const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [{ text: repairPrompt }] },
                config: {
                    systemInstruction: REPAIR_SYSTEM_INSTRUCTION,
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT, properties: {
                            javascript: { type: Type.STRING },
                            explanation: { type: Type.STRING }
                        }, required: ["javascript", "explanation"]
                    },
                }
            }), 1); 
            
            this.checkAborted();
            const cleanedJson = cleanJsonOutput(response.text!);
            const result = JSON.parse(cleanedJson);
            
            if (result.javascript) {
                this.currentCode.javascript = result.javascript;
                await this.callbacks.onChunkComplete(this.currentCode, `(Auto-fix: ${result.explanation})`);
            }
        } catch (repairError: any) {
            if (repairError.message === 'Build cancelled by user') throw repairError;
            console.error("Self-healing process failed:", repairError.message);
        }
    }

    private createStepPrompt(stepIndex: number): string {
        const lastUserMsg = this.history.slice().reverse().find(m => m.role === 'user');
        const imageUrls = lastUserMsg?.images || [];
        
        let assetsContext = '';
        if (imageUrls.length > 0) {
            assetsContext = `\n\n[ASSETS] The user has provided the following images. YOU MUST USE THESE EXACT URLs in your <img> tags:\n${imageUrls.map(url => `- ${url}`).join('\n')}`;
        }

        let backendContext = '';
        if (this.project.rafieiCloudProject && this.project.rafieiCloudProject.status === 'ACTIVE' && this.project.rafieiCloudProject.publishableKey) {
            backendContext = `
            \n\n[RAFIEI CLOUD BACKEND CONNECTED]
            URL: https://${this.project.rafieiCloudProject.projectRef}.supabase.co
            KEY: ${this.project.rafieiCloudProject.publishableKey}
            Use 'window.supabase.createClient(URL, KEY)'.
            `;
        } else if (this.project.supabaseConfig && this.project.supabaseConfig.url) {
            backendContext = `
            \n\n[USER MANUAL BACKEND CONFIGURATION]
            URL: ${this.project.supabaseConfig.url}
            KEY: ${this.project.supabaseConfig.key}
            Use 'window.supabase.createClient(URL, KEY)'.
            `;
        }

        return `
        CONTEXT: The user wants to build/modify a web application.
        USER_REQUEST: "${this.prompt}"${assetsContext}${backendContext}
        BUILD_PLAN: ${this.plan.map((s, i) => `${i + 1}. ${s}`).join('\n')}
        CURRENT_STEP_ACTION: Step ${stepIndex + 1}: ${this.plan[stepIndex]}
        CURRENT_CODE_STATE:
        HTML: ${this.currentCode.html || '<!-- Empty -->'}
        CSS: ${this.currentCode.css || '/* Empty */'}
        JAVASCRIPT: ${this.currentCode.javascript || '// Empty'}
        INSTRUCTIONS:
        - Implement ONLY the changes required for "Step ${stepIndex + 1}".
        - Return the full updated code.
        - **IMPORTANT**: Do NOT use imports. Destructure from global 'React'.
        - **IMPORTANT**: End your code with \`ReactDOM.createRoot(document.getElementById('root')).render(<App />);\`
        `;
    }
}

export async function runBuildOnServer(
    project: Project, 
    prompt: string, 
    images?: string[],
    onStateChange?: (project: Project) => void,
    onSaveProject?: (project: Project) => Promise<void>,
    abortSignal?: AbortSignal
) {
    const projectRef = { ...project };

    const save = async (p: Project) => {
        if (onSaveProject) await onSaveProject(p);
    };

    const updateState = (updated: Project) => {
        if (onStateChange) onStateChange(updated);
    };

    const serverCallbacks: SupervisorCallbacks = {
        onPlanUpdate: async (plan) => {
            projectRef.buildState = { plan, currentStep: 0, lastCompletedStep: -1, error: null };
            projectRef.status = 'generating';
            updateState({ ...projectRef });
            await save(projectRef);
        },
        onStepStart: async (stepIndex) => {
            if (projectRef.buildState) {
                projectRef.buildState.currentStep = stepIndex;
                projectRef.buildState.error = null;
                updateState({ ...projectRef });
                await save(projectRef);
            }
        },
        onStepComplete: async (stepIndex) => {
            if (projectRef.buildState) {
                projectRef.buildState.lastCompletedStep = stepIndex;
                updateState({ ...projectRef });
                await save(projectRef);
            }
        },
        onChunkComplete: async (code, explanation) => {
            const aiMsg: Message = { id: crypto.randomUUID(), role: 'assistant', content: explanation, timestamp: Date.now() };
            projectRef.code = code;
            projectRef.messages.push(aiMsg);
            updateState({ ...projectRef });
            await save(projectRef);
        },
        onSuccess: async (finalCode, finalExplanation) => {
            const aiMsg: Message = { id: crypto.randomUUID(), role: 'assistant', content: finalExplanation, timestamp: Date.now() };
            projectRef.code = finalCode;
            projectRef.messages.push(aiMsg);
            projectRef.status = 'idle';
            if (projectRef.buildState) {
                projectRef.buildState.currentStep = projectRef.buildState.plan.length;
                projectRef.buildState.lastCompletedStep = projectRef.buildState.plan.length - 1;
                projectRef.buildState.error = null;
            }
            updateState({ ...projectRef });
            await save(projectRef);
        },
        onError: async (error, retriesLeft) => {
             if (projectRef.buildState) {
                projectRef.buildState.error = error;
                updateState({ ...projectRef });
                await save(projectRef);
            }
        },
        onFinalError: async (error) => {
            // Check if this is our special system trigger message.
            // If so, do NOT prepend "Error:", just show the message as is.
            const isSystemTrigger = error === DB_CONNECT_MESSAGE;
            const content = isSystemTrigger ? error : `Error: ${error}`;
            
            const errorMsg: Message = { 
                id: crypto.randomUUID(), 
                role: 'assistant', 
                content: content, 
                timestamp: Date.now() 
            };
            
            projectRef.messages.push(errorMsg);
            projectRef.status = 'idle';
            updateState({ ...projectRef });
            await save(projectRef);
        }
    };

    const supervisor = new GenerationSupervisor(projectRef, prompt, images, serverCallbacks, abortSignal);
    await supervisor.start();
}

// ... (rest of the file remains unchanged)
export async function handleUserIntent(project: Project, prompt: string): Promise<{ isArchitect: boolean, requiresDatabase?: boolean, response?: string }> {
    const isArchitect = await detectUserIntent(prompt, project.messages);
    if (isArchitect) {
        const { databaseRequired } = await analyzeRequirements(prompt, project.messages);
        return { isArchitect: true, requiresDatabase: databaseRequired };
    }
    const chatResponse = await chatQuickly(prompt, project.messages);
    return { isArchitect: false, response: chatResponse };
}

export async function analyzeRequirements(prompt: string, history?: Message[]): Promise<{ databaseRequired: boolean }> {
    try {
        const historyContext = history?.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n') || '';
        const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {parts: [{text: `HISTORY:\n${historyContext}\n\nUSER PROMPT: "${prompt}"`}]},
            config: {
                systemInstruction: REQUIREMENTS_ANALYZER_SYSTEM_INSTRUCTION,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT, properties: { databaseRequired: { type: Type.BOOLEAN } },
                    required: ["databaseRequired"]
                }
            }
        }));
        const result = JSON.parse(cleanJsonOutput(response.text || '{"databaseRequired": false}'));
        return { databaseRequired: result.databaseRequired || false };
    } catch (error) {
        return { databaseRequired: false };
    }
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

async function detectUserIntent(prompt: string, history: Message[]): Promise<boolean> {
    return await callWithRetry(async () => {
        const context = history?.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n') || 'No history.';
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-flash-lite-latest',
            contents: `HISTORY:\n${context}\n\nUSER PROMPT: "${prompt}"`,
            config: { systemInstruction: ROUTER_SYSTEM_INSTRUCTION, temperature: 0 }
        });
        return response.text?.trim().toUpperCase() === 'ARCHITECT';
    });
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
        const codeSummary = `HTML Size: ${currentCode.html?.length || 0} chars, JS Size: ${currentCode.javascript?.length || 0} chars`;
        const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `HISTORY:\n${historyContext}\n\nCODE STATS:\n${codeSummary}\n\nSuggest 3-4 next features.`,
            config: {
                systemInstruction: SUGGESTION_SYSTEM_INSTRUCTION,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: { title: { type: Type.STRING }, prompt: { type: Type.STRING } },
                        required: ["title", "prompt"]
                    }
                }
            }
        }));
        let jsonStr = response.text || "[]";
        jsonStr = cleanJsonOutput(jsonStr);
        return JSON.parse(jsonStr);
    } catch (error) {
        return [];
    }
}
