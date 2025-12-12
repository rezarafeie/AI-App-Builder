
import { GeneratedCode } from "../types";

export const constructFullDocument = (code: GeneratedCode): string => {
  let rawJs = code.javascript || '';

  // --- PRE-PROCESSING: CLEANUP IMPORTS ---
  // We remove standard imports because we provide these libraries globally.
  // This prevents conflicts with the browser's lack of a module system.

  // 1. Remove React/ReactDOM imports (we inject them manually later)
  rawJs = rawJs.replace(/^import\s+React.*?from\s+['"]react['"];?/gm, '');
  rawJs = rawJs.replace(/^import\s+ReactDOM.*?from\s+['"]react-dom.*?['"];?/gm, '');

  // 2. Transform known libraries to global destructuring
  // This allows code like "import { Camera } from 'lucide-react'" to work by using "window.LucideReact"
  rawJs = rawJs.replace(/import\s+{\s*([^}]+)\s*}\s+from\s+['"]lucide-react['"];?/g, 'const { $1 } = window.LucideReact;');
  rawJs = rawJs.replace(/import\s+{\s*([^}]+)\s*}\s+from\s+['"]recharts['"];?/g, 'const { $1 } = window.Recharts;');
  rawJs = rawJs.replace(/import\s+{\s*([^}]+)\s*}\s+from\s+['"]framer-motion['"];?/g, 'const { $1 } = window.Motion;');
  rawJs = rawJs.replace(/import\s+{\s*([^}]+)\s*}\s+from\s+['"]@supabase\/supabase-js['"];?/g, 'const { $1 } = window.supabase;');

  // 3. Stub unknown local imports to prevent crash
  // Example: import Header from './Header' => const Header = window.MockUI.createMissing('Header');
  rawJs = rawJs.replace(/^import\s+(\w+)\s+from\s+['"]\.\/.*?['"];?/gm, 'const $1 = window.MockUI.createMissing("$1");');

  // 4. Remove exports to allow the code to run as a simple script
  rawJs = rawJs.replace(/^export\s+default\s+/gm, '');
  rawJs = rawJs.replace(/^export\s+/gm, '');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    
    <!-- ERROR STYLES: Ensures errors are visible even if CSS fails -->
    <style>
        body { margin: 0; font-family: sans-serif; background-color: #ffffff; color: #1f2937; }
        #root { width: 100%; min-height: 100vh; }
        #error-overlay {
            display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(254, 226, 226, 0.95); color: #991b1b; z-index: 9999;
            padding: 2rem; box-sizing: border-box; flex-direction: column; overflow: auto;
        }
        .error-title { font-weight: bold; font-size: 1.25rem; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem; }
        .error-pre { background: #fff; padding: 1rem; border-radius: 0.5rem; border: 1px solid #f87171; overflow-x: auto; font-family: monospace; font-size: 0.875rem; white-space: pre-wrap; }
        ${code.css || ''}
    </style>

    <!-- CRITICAL: ERROR HANDLER (MUST BE FIRST) -->
    <script>
        window.showError = function(type, message, stack) {
            const overlay = document.getElementById('error-overlay');
            const content = document.getElementById('error-content');
            if (overlay && content) {
                overlay.style.display = 'flex';
                content.innerHTML = '<div class="error-title">⚠️ ' + type + '</div>' + 
                                    '<div class="error-pre">' + message + '</div>' +
                                    (stack ? '<div class="error-pre" style="margin-top:1rem; color:#666; font-size:0.75rem">' + stack + '</div>' : '');
            }
            console.error('[Preview Error]', type, message);
        };

        window.onerror = function(msg, url, line, col, error) {
            window.showError('Runtime Error', msg, error ? error.stack : '');
            return true;
        };

        window.onunhandledrejection = function(event) {
            window.showError('Async Error', event.reason ? event.reason.message : 'Unknown Promise Rejection');
        };
    </script>

    <!-- DEPENDENCIES -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script src="https://unpkg.com/lucide-react@latest/dist/umd/lucide-react.js"></script>
    <script src="https://unpkg.com/recharts/umd/Recharts.js"></script>
    <script src="https://unpkg.com/framer-motion/dist/framer-motion.js"></script>
</head>
<body>
    <div id="root"></div>
    <!-- Error Container -->
    <div id="error-overlay"><div id="error-content" class="w-full max-w-3xl mx-auto"></div></div>

    <script>
        // --- ENVIRONMENT SETUP ---
        window.process = { env: { NODE_ENV: 'development' } };
        
        // Setup Supabase Global
        window.initSupabase = function() {
            if (window.supabase && window.supabase.createClient) return window.supabase;
            if (window.Supabase && window.Supabase.createClient) {
                 window.supabase = { createClient: window.Supabase.createClient };
                 return window.supabase;
            }
            return null;
        };
        window.initSupabase();

        // Setup Mock UI for missing components
        window.MockUI = {
            createMissing: (name) => {
                return (props) => React.createElement(
                    'div', 
                    { className: 'p-4 border-2 border-dashed border-yellow-400 bg-yellow-50 text-yellow-700 rounded-lg my-2' },
                    'Missing Component: ' + name
                );
            }
        };
        
        // Setup global access for libs
        if (window.LucideReact) window.lucide = window.LucideReact;
    </script>

    <!-- RAW CODE STORAGE (Hidden) -->
    <script type="text/plain" id="user-code">
${rawJs}
    </script>

    <!-- COMPILER & RUNNER -->
    <script>
        (function() {
            try {
                // 1. Get Code
                const rawCode = document.getElementById('user-code').textContent;
                if (!rawCode || !rawCode.trim()) return;

                // 2. Pre-declare Globals for Babel Scope
                // This ensures "const { useState } = React" works inside eval without import
                const { useState, useEffect, useRef, useMemo, useCallback, useReducer, useContext, createContext } = React;
                
                // 3. Compile via Babel (Catches Syntax Errors)
                const compiled = Babel.transform(rawCode, {
                    presets: ['react', 'env'],
                    filename: 'main.tsx'
                }).code;

                // 4. Execute Code
                eval(compiled);

                // 5. Auto-Mount Logic
                // We assume the user code might have called createRoot. If not, we try to help.
                setTimeout(() => {
                    const rootEl = document.getElementById('root');
                    if (rootEl.innerHTML.trim() === '') {
                        // Check for common root component names in global scope
                        let RootComp = window.App || (typeof App !== 'undefined' ? App : null) || (typeof Main !== 'undefined' ? Main : null);
                        
                        if (RootComp) {
                            console.log("[System] Auto-mounting found component...");
                            const root = ReactDOM.createRoot(rootEl);
                            root.render(React.createElement(RootComp));
                        }
                    }
                }, 50);

            } catch (e) {
                // Catch Compilation Errors (Babel) or Synchronous Runtime Errors
                window.showError(e.name || 'Error', e.message, e.stack);
            }
        })();
    </script>
</body>
</html>
  `;
};

export const createDeployableBlob = (code: GeneratedCode): string => {
  const fullHtml = constructFullDocument(code);
  const blob = new Blob([fullHtml], { type: 'text/html' });
  return URL.createObjectURL(blob);
};
