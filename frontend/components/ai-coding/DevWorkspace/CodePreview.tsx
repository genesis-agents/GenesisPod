'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface ProjectFile {
  path: string;
  content: string;
  language?: string;
}

interface CodePreviewProps {
  files: ProjectFile[];
  entryPoint?: string;
  onError?: (error: string) => void;
  className?: string;
}

// Transform JSX/TSX code to browser-compatible ESM
function transformToESM(code: string): string {
  // Basic JSX to JS transformation
  // This is a simplified transformation - for production, use a proper compiler
  let result = code;

  // Remove TypeScript type annotations (simplified)
  result = result.replace(
    /:\s*(string|number|boolean|any|void|never|undefined|null|object|React\.[\w.]+|[\w]+\[\]|[\w<>[\],\s|&]+)(?=\s*[,)=;}\n])/g,
    ''
  );
  result = result.replace(/interface\s+\w+\s*\{[^}]*\}/g, '');
  result = result.replace(/type\s+\w+\s*=\s*[^;]+;/g, '');
  result = result.replace(/<[\w,\s]+>(?=\()/g, '');

  // Transform import statements for ESM CDN
  result = result.replace(
    /import\s+(?:React,?\s*)?(?:\{\s*([\w\s,]+)\s*\})?\s*from\s*['"]react['"]/g,
    (match, namedImports) => {
      const imports = ['React'];
      if (namedImports) {
        imports.push(...namedImports.split(',').map((s: string) => s.trim()));
      }
      return `const { ${imports.join(', ')} } = window.React`;
    }
  );

  result = result.replace(
    /import\s+\{\s*([\w\s,]+)\s*\}\s*from\s*['"]react-dom\/client['"]/g,
    'const { $1 } = window.ReactDOM'
  );

  // Remove export default and export statements
  result = result.replace(/export\s+default\s+/g, '');
  result = result.replace(/export\s+\{\s*[\w\s,]*\s*\}/g, '');
  result = result.replace(/export\s+/g, '');

  return result;
}

// Generate HTML for preview
function generatePreviewHTML(files: ProjectFile[], entryPoint: string): string {
  const mainFile = files.find((f) => f.path === entryPoint);
  if (!mainFile) {
    return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: sans-serif; padding: 20px; color: #666; }
  </style>
</head>
<body>
  <p>No entry point found: ${entryPoint}</p>
</body>
</html>`;
  }

  // Find App component
  const appFile = files.find(
    (f) =>
      f.path.includes('App.tsx') ||
      f.path.includes('App.jsx') ||
      f.path.includes('App.js')
  );

  const cssFiles = files.filter(
    (f) => f.path.endsWith('.css') && !f.path.includes('node_modules')
  );
  const cssContent = cssFiles.map((f) => f.content).join('\n');

  // Build component code
  let componentCode = '';
  if (appFile) {
    componentCode = transformToESM(appFile.content);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview</title>
  <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    ${cssContent}
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel" data-type="module">
    ${
      componentCode ||
      `
    function App() {
      return (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <h1 style={{ color: '#10b981', marginBottom: '16px' }}>Preview Ready</h1>
          <p style={{ color: '#666' }}>Your application will appear here once code is generated.</p>
        </div>
      );
    }
    `
    }

    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(<App />);
  </script>
  <script>
    // Error handling
    window.onerror = function(message, source, lineno, colno, error) {
      const errorDiv = document.createElement('div');
      errorDiv.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#fee2e2;color:#dc2626;padding:12px;font-family:monospace;font-size:12px;border-top:2px solid #dc2626;';
      errorDiv.innerHTML = '<strong>Error:</strong> ' + message + ' (line ' + lineno + ')';
      document.body.appendChild(errorDiv);
      return true;
    };
  </script>
</body>
</html>`;
}

export function CodePreview({
  files,
  entryPoint = 'src/main.tsx',
  onError,
  className = '',
}: CodePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const openInNewWindow = useCallback(() => {
    const html = generatePreviewHTML(files, entryPoint);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [files, entryPoint]);

  useEffect(() => {
    if (!iframeRef.current) return;

    setIsLoading(true);
    setError(null);

    try {
      const html = generatePreviewHTML(files, entryPoint);
      iframeRef.current.srcdoc = html;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Preview failed';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [files, entryPoint, refreshKey, onError]);

  return (
    <div className={`flex h-full flex-col ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-red-400" />
            <span className="h-3 w-3 rounded-full bg-yellow-400" />
            <span className="h-3 w-3 rounded-full bg-green-400" />
          </div>
          <span className="ml-2 text-xs text-gray-500">Preview</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={refresh}
            className="rounded p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
            title="Refresh"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
          <button
            onClick={openInNewWindow}
            className="rounded p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
            title="Open in new window"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </button>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="rounded p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
            title="Toggle fullscreen"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {isFullscreen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Preview Area */}
      <div className="relative flex-1 bg-white">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
              Loading preview...
            </div>
          </div>
        )}

        {files.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-gray-400">
              <svg
                className="mx-auto mb-3 h-12 w-12"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              <p className="text-sm">Waiting for code...</p>
            </div>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            className={`h-full w-full border-0 ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}
            sandbox="allow-scripts allow-same-origin"
            title="Code Preview"
          />
        )}

        {error && (
          <div className="absolute bottom-0 left-0 right-0 border-t-2 border-red-500 bg-red-50 p-3">
            <div className="flex items-start gap-2">
              <svg
                className="h-5 w-5 flex-shrink-0 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="flex-1">
                <div className="text-sm font-medium text-red-800">
                  Preview Error
                </div>
                <div className="text-xs text-red-600">{error}</div>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-red-400 hover:text-red-600"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CodePreview;
