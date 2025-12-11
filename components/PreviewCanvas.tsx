


import React, { useEffect, useRef } from 'react';
import { GeneratedCode } from '../types';
import { constructFullDocument } from '../utils/codeGenerator';

interface PreviewCanvasProps {
  code: GeneratedCode | null;
  className?: string;
  isGenerating?: boolean;
}

const loadingMessages = [
  "Compiling pixels into a masterpiece...",
  "Teaching components how to speak React...",
  "Aligning divs and herding cats...",
  "Polishing JSX until it shines...",
  "Negotiating with the CSS specificity gods...",
  "Warming up the AI's creativity cores...",
  "Untangling the virtual wires of the DOM...",
  "Assembling state and props into a symphony...",
  "Brewing some fresh JavaScript...",
  "Reticulating splines..."
];

const PreviewCanvas: React.FC<PreviewCanvasProps> = ({ code, className, isGenerating = false }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (iframeRef.current) {
        const hasCode = code && (code.html || code.javascript);
        
        if (hasCode) {
            const doc = constructFullDocument(code);
            iframeRef.current.srcdoc = doc;
        } else if (isGenerating) {
            iframeRef.current.srcdoc = `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body {
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            height: 100vh;
                            margin: 0;
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol';
                            color: #94a3b8; /* Slate 400 */
                            background-color: #0f172a; /* Slate 900 */
                            overflow: hidden;
                        }
                        .container { 
                            text-align: center; 
                            animation: fadeIn 0.5s ease-out;
                        }
                        .loader {
                            width: 48px;
                            height: 48px;
                            border: 4px solid #374151; /* Gray 700 */
                            border-top-color: #6366f1; /* Indigo 500 */
                            border-radius: 50%;
                            display: inline-block;
                            box-sizing: border-box;
                            animation: rotation 1s linear infinite;
                            margin-bottom: 24px;
                        }
                        h2 { 
                            font-size: 1.25rem; 
                            font-weight: 600; 
                            color: #e2e8f0; /* Slate 200 */
                            margin-bottom: 8px; 
                            letter-spacing: -0.025em;
                        }
                        p { 
                            font-size: 0.875rem; 
                            max-width: 280px;
                            min-height: 2.5em; /* Prevent layout shift */
                            transition: opacity 0.4s ease-in-out;
                        }
                        @keyframes rotation {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                        @keyframes fadeIn {
                            from { opacity: 0; transform: translateY(10px); }
                            to { opacity: 1; transform: translateY(0); }
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="loader"></div>
                        <h2>Building your vision...</h2>
                        <p id="loading-text">${loadingMessages[0]}</p>
                    </div>
                    <script>
                        const messages = ${JSON.stringify(loadingMessages)};
                        const p = document.getElementById('loading-text');
                        let currentIndex = 0;

                        const intervalId = setInterval(() => {
                            // Pick a random index, but not the same as the current one
                            let nextIndex;
                            do {
                                nextIndex = Math.floor(Math.random() * messages.length);
                            } while (messages.length > 1 && nextIndex === currentIndex);
                            
                            currentIndex = nextIndex;
                            
                            p.style.opacity = 0;
                            setTimeout(() => {
                                p.textContent = messages[currentIndex];
                                p.style.opacity = 1;
                            }, 400); // Should match transition duration
                        }, 2500);
                    </script>
                </body>
                </html>
            `;
        } else {
            iframeRef.current.srcdoc = `
                <!DOCTYPE html>
                <html>
                <body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;color:#64748b;background:#f8fafc;">
                    <div style="text-align:center;">
                        <h2>Ready to Build</h2>
                        <p>Describe your app in the chat to start generating.</p>
                    </div>
                </body>
                </html>
            `;
        }
    }
  }, [code, isGenerating]);

  return (
    <div className={`w-full h-full bg-[#0f172a] rounded-lg overflow-hidden shadow-xl border border-gray-700 ${className}`}>
      <iframe
        ref={iframeRef}
        title="App Preview"
        className="w-full h-full"
        sandbox="allow-scripts allow-modals allow-same-origin allow-forms allow-popups"
      />
    </div>
  );
};

export default PreviewCanvas;