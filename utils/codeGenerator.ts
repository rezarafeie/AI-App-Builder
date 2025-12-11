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
      /* Base styles to ensure preview looks good */
      body { min-height: 100vh; background-color: #ffffff; color: #1f2937; }
      ${code.css || ''}
    </style>
</head>
<body>
    <div id="app-root">
      ${code.html || '<div id="root"></div>'}
    </div>
    
    <!-- type="text/babel" is crucial for Babel to process the JSX -->
    <script type="text/babel">
      try {
        ${code.javascript}
      } catch (err) {
        console.error('Runtime Error:', err);
        document.body.innerHTML += '<div style="color:red; padding:10px; border:1px solid red; background:#fee; margin: 10px; border-radius: 4px;"><strong>Runtime Error:</strong> ' + err.message + '</div>';
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