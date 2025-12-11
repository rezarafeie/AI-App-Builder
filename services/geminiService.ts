import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { GeneratedCode, Message, Suggestion, BuildState, Project } from "../types";
import { cloudService } from './cloudService';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- SYSTEM INSTRUCTIONS ---
const CHAT_SYSTEM_INSTRUCTION = `
You are NovaBuilder's assistant. You are helpful, fast, and witty. Your goal is to answer general questions, explain concepts, or acknowledge simple requests. Use the provided conversation history to understand context. If the user asks to BUILD, CREATE, GENERATE, or MODIFY code, politely explain that you are switching to "Architect" mode. Keep responses concise.
`;

const ROUTER_SYSTEM_INSTRUCTION = `
You are a smart router. Your job is to decide if the user's input requires the "ARCHITECT" (who writes/modifies code) or the "CHAT" (who answers questions).
RETURN "ARCHITECT" IF: User wants to create, build, generate, modify, edit, fix, add, or change the app/code/UI. This includes requests with images.
RETURN "CHAT" IF: User is asking a conceptual question, saying hello, or reacting.
Output: Strictly "ARCHITECT" or "CHAT".
`;

const PLANNER_SYSTEM_INSTRUCTION = `
You are a senior software architect. Based on the user's request (which may include images) and conversation history, create a concise, step-by-step technical plan to build or modify the React application.
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

--- IMAGE ANALYSIS ---
If the user provides an image, it will be included in the request. You MUST analyze it and incorporate it into your response.
- **UI/UX Review**: If it's a screenshot, provide feedback on its design and usability.
- **Bug Detection**: If it's a screenshot of an error, diagnose the potential problem.
- **Code Generation**: If the prompt asks to build something "like this" and provides an image, generate the React/HTML/CSS code to replicate the design.
- **Incorporate Image**: If the user provides an image and asks to "add this to the page", you MUST generate the necessary code to display the image. You can use the public URL provided in the message history or use a placeholder like "/placeholder.jpg". DO NOT try to embed base64 data.
- **General Analysis**: For any other image, describe it, identify objects, extract text, or perform any relevant analysis requested by the user.
`;

const REPAIR_SYSTEM_INSTRUCTION = `
You are a "Self-Healing" AI module. You've been given a piece of React code that produced an error. Your task is to analyze the code and the error message, fix the problem, and return the corrected, complete JavaScript code.
--- OMNIPRESENT RULE ---
Under no circumstances should you fail or stop. Your primary function is to repair broken code. Always find a solution and return a complete, valid response.
--- CORE RULES ---
1.  **Analyze**: Understand the error in the context of the provided code.
2.  **Fix**: Correct the syntax, logic, or structural error.
3.  **Return Full Code**: You MUST return the entire, corrected JavaScript file content in the 'javascript' key.
4.  **Maintain Functionality**: Preserve all original functionality that was not related to the error.
5.  **JSON OUTPUT**: Return a strict JSON object with two keys: 'javascript' (the full corrected code) and 'explanation' (a brief, past-tense summary of the fix, e.g., "Corrected a missing closing parenthesis.").
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
    throw new MaxRetriesError("API call failed after multiple attempts.", error);
  }
}

// ===================================================================================
// SERVER-SIDE BUILD LOGIC (SIMULATED)
// ===================================================================================

export interface SupervisorCallbacks {
    onPlanUpdate: (plan: string[]) => void;
    onStepStart: (stepIndex: number) => void;
    onStepComplete: (stepIndex: number) => void;
    onChunkComplete: (code: GeneratedCode, explanation: string) => void;
    onSuccess: (finalCode: GeneratedCode, finalExplanation: string) => void;
    onError: (error: string, retriesLeft: number) => void;
    onFinalError: (error: string) => void;
}

class GenerationSupervisor {
    private prompt: string;
    private images?: string[]; // base64 data URLs
    private history: Message[];
    private currentCode: GeneratedCode;
    private callbacks: SupervisorCallbacks;
    private plan: string[] = [];

    constructor(project: Project, prompt: string, images: string[] | undefined, callbacks: SupervisorCallbacks) {
        this.prompt = prompt;
        this.images = images;
        this.history = project.messages;
        this.currentCode = project.code;
        this.callbacks = callbacks;
    }

    public async start() {
        try {
            this.plan = await this.generatePlan();
            this.callbacks.onPlanUpdate(this.plan);
            await this.executeLoop(0);
            this.callbacks.onSuccess(this.currentCode, "Project built successfully!");
        } catch (error: any) {
            console.error("Build process failed terminally.", error);
            this.callbacks.onFinalError(error.message || "The build process failed after multiple attempts.");
        }
    }

    private async executeLoop(startIndex: number) {
        for (let i = startIndex; i < this.plan.length; i++) {
            this.callbacks.onStepStart(i);
            await this.executeStep(i);
            this.callbacks.onStepComplete(i);
        }
    }

    private async generatePlan(): Promise<string[]> {
        const historyContext = this.history.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n');
        
        const requestParts: ({ text: string } | { inlineData: { mimeType: string; data: string; } })[] = [
            { text: `USER_REQUEST: "${this.prompt}"\n\nHISTORY:\n${historyContext}` }
        ];

        if (this.images && this.images.length > 0) {
            for (const image of this.images) {
                const [meta, base64Data] = image.split(',');
                const mimeType = meta.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
                requestParts.push({ inlineData: { mimeType, data: base64Data } });
            }
        }

        const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: { parts: requestParts },
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
                
                const requestContents: any[] = [{ text: stepPrompt }];

                // Only attach images to the first step to avoid redundant processing
                if (this.images && this.images.length > 0 && stepIndex === 0) {
                    for (const image of this.images) {
                        const [meta, base64Data] = image.split(',');
                        const mimeType = meta.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
                        requestContents.push({ inlineData: { mimeType, data: base64Data } });
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

                const result = JSON.parse(response.text!) as GeneratedCode;
                this.currentCode = { ...this.currentCode, ...result };
                this.callbacks.onChunkComplete(this.currentCode, result.explanation);
                return;
            } catch (error: any) {
                retries--;
                this.callbacks.onError(`Step failed: ${error.message}. Retrying...`, retries);
                if (retries > 0) {
                    await this.repairCode(error.message);
                } else {
                    throw new Error(`Failed to execute step "${this.plan[stepIndex]}" after multiple retries.`);
                }
            }
        }
    }

    private async repairCode(errorMessage: string) {
        console.log(`Attempting to self-heal code from error: ${errorMessage}`);
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
            }), 1); // 1 retry for the repair itself

            const result = JSON.parse(response.text!);
            
            if (result.javascript) {
                console.log("Self-healing successful. Applying fix.");
                this.currentCode.javascript = result.javascript;
                this.callbacks.onChunkComplete(this.currentCode, `(Auto-fix: ${result.explanation})`);
            } else {
                console.warn("Self-healing did not return valid javascript.");
            }
        } catch (repairError: any) {
            console.error("Self-healing process failed:", repairError.message);
        }
    }

    private createStepPrompt(stepIndex: number): string {
      return `
        CONTEXT: The user wants to build/modify a web application.
        USER_REQUEST: "${this.prompt}"
        BUILD_PLAN: ${this.plan.map((s, i) => `${i + 1}. ${s}`).join('\n')}
        CURRENT_STEP_ACTION: Step ${stepIndex + 1}: ${this.plan[stepIndex]}
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

export async function runBuildOnServer(project: Project, prompt: string, images?: string[]) {
    const projectRef = { ...project };

    const serverCallbacks: SupervisorCallbacks = {
        onPlanUpdate: (plan) => {
            projectRef.buildState = { plan, currentStep: 0, lastCompletedStep: -1, error: null };
            projectRef.status = 'generating';
            cloudService.saveProject(projectRef);
        },
        onStepStart: (stepIndex) => {
            if (projectRef.buildState) {
                projectRef.buildState.currentStep = stepIndex;
                projectRef.buildState.error = null;
                cloudService.saveProject(projectRef);
            }
        },
        onStepComplete: (stepIndex) => {
            if (projectRef.buildState) {
                projectRef.buildState.lastCompletedStep = stepIndex;
                cloudService.saveProject(projectRef);
            }
        },
        onChunkComplete: (code, explanation) => {
            const aiMsg: Message = { id: crypto.randomUUID(), role: 'assistant', content: explanation, timestamp: Date.now() };
            projectRef.code = code;
            projectRef.messages.push(aiMsg);
            cloudService.saveProject(projectRef);
        },
        onSuccess: async (finalCode, finalExplanation) => {
            const aiMsg: Message = { id: crypto.randomUUID(), role: 'assistant', content: finalExplanation, timestamp: Date.now() };
            projectRef.code = finalCode;
            projectRef.messages.push(aiMsg);
            projectRef.status = 'idle';
            projectRef.buildState = null; // Clear the build state on success
            await cloudService.saveProject(projectRef);
        },
        onError: (error, retriesLeft) => {
             if (projectRef.buildState) {
                projectRef.buildState.error = error;
                cloudService.saveProject(projectRef);
            }
        },
        onFinalError: (error) => {
            const errorMsg: Message = { id: crypto.randomUUID(), role: 'assistant', content: `Error: ${error}`, timestamp: Date.now() };
            projectRef.messages.push(errorMsg);
            projectRef.status = 'idle';
            // We keep the buildState on final error so the user can see what went wrong.
            // The next build will clear it automatically.
            cloudService.saveProject(projectRef);
        }
    };

    const supervisor = new GenerationSupervisor(projectRef, prompt, images, serverCallbacks);
    await supervisor.start();
}


// ===================================================================================
// CLIENT-SIDE FUNCTIONS
// ===================================================================================

export async function handleUserIntent(project: Project, prompt: string): Promise<{ isArchitect: boolean, response?: string }> {
    const isArchitect = await detectUserIntent(prompt, project.messages);
    if (isArchitect) {
        return { isArchitect: true };
    }
    const chatResponse = await chatQuickly(prompt, project.messages);
    return { isArchitect: false, response: chatResponse };
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
        const codeSummary = `HTML Size: ${currentCode.html?.length || 0} chars, JS Size: ${currentCode.javascript?.length || 0} chars, CSS Size: ${currentCode.css?.length || 0} chars`;
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
                        properties: { title: { type: Type.STRING }, prompt: { type: Type.STRING } },
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