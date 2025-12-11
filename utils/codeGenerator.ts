import { GeneratedCode } from "../types";

export const constructFullDocument = (code: GeneratedCode): string => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    
    <!-- React & ReactDOM -->
    <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    
    <!-- Babel for JSX compilation in browser -->
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>

    <style>
      /* Base styles */
      body { min-height: 100vh; background-color: #ffffff; color: #1f2937; margin: 0; }
      
      /* Error Overlay Styles */
      #runtime-error-overlay {
          display: none;
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background-color: rgba(15, 23, 42, 0.95);
          z-index: 9999;
          align-items: center;
          justify-content: center;
          padding: 20px;
          backdrop-filter: blur(4px);
      }
      .error-card {
          background-color: #1e293b;
          border: 1px solid #7f1d1d;
          border-radius: 12px;
          padding: 24px;
          max-width: 600px;
          width: 100%;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          color: white;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          animation: slideUp 0.3s ease-out;
      }
      .error-header {
          display: flex;
          align-items: center;
          gap: 12px;
          color: #ef4444;
          font-weight: bold;
          font-size: 1.125rem;
          margin-bottom: 16px;
          padding-bottom: 16px;
          border-bottom: 1px solid #334155;
      }
      .error-content {
          background-color: #0f172a;
          padding: 16px;
          border-radius: 8px;
          font-size: 0.875rem;
          overflow-x: auto;
          line-height: 1.6;
          color: #e2e8f0;
          white-space: pre-wrap;
      }
      @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
      }
      
      ${code.css || ''}
    </style>
</head>
<body>
    <div id="app-root">
      ${code.html || '<div id="root"></div>'}
    </div>
    
    <div id="runtime-error-overlay">
        <div class="error-card">
            <div class="error-header">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Runtime Error
            </div>
            <div id="error-message" class="error-content"></div>
        </div>
    </div>
    
    <!-- type="text/babel" is crucial for Babel to process the JSX -->
    <script type="text/babel">
      window.showError = (msg) => {
          const overlay = document.getElementById('runtime-error-overlay');
          const msgEl = document.getElementById('error-message');
          if (overlay && msgEl) {
            overlay.style.display = 'flex';
            msgEl.textContent = msg;
          }
      };

      window.onerror = function(message, source, lineno, colno, error) {
        window.showError(message);
        window.parent.postMessage({ type: 'RUNTIME_ERROR', message: message }, '*');
        return true;
      };

      try {
        ${code.javascript}
      } catch (err) {
        console.error('Runtime Error:', err);
        window.showError(err.message + (err.stack ? '\\n' + err.stack : ''));
        window.parent.postMessage({ type: 'RUNTIME_ERROR', message: err.message }, '*');
      }
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