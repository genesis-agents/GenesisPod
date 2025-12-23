/**
 * Parse code files from AI-generated output
 * Extracts file path and content from markdown code blocks
 */

export interface ParsedFile {
  path: string;
  content: string;
  language?: string;
}

/**
 * Extract file path from a code block header
 * Supports formats like:
 * - ```tsx // src/App.tsx
 * - ```typescript:src/App.tsx
 * - File: src/App.tsx
 */
function extractFilePath(header: string, language: string): string | null {
  // Pattern: ```language // path/to/file
  const commentPattern = /\/\/\s*([^\s]+\.\w+)/;
  const commentMatch = header.match(commentPattern);
  if (commentMatch) {
    return commentMatch[1];
  }

  // Pattern: ```language:path/to/file
  const colonPattern = /:([^\s]+\.\w+)/;
  const colonMatch = header.match(colonPattern);
  if (colonMatch) {
    return colonMatch[1];
  }

  // Pattern: File: path/to/file or file: path/to/file
  const filePattern = /(?:file|filename):\s*([^\s]+)/i;
  const fileMatch = header.match(filePattern);
  if (fileMatch) {
    return fileMatch[1];
  }

  return null;
}

/**
 * Infer language from file extension
 */
function inferLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    css: 'css',
    scss: 'scss',
    html: 'html',
    md: 'markdown',
    py: 'python',
    go: 'go',
    yaml: 'yaml',
    yml: 'yaml',
  };
  return languageMap[ext] || 'plaintext';
}

/**
 * Parse markdown content and extract code files
 */
export function parseCodeFiles(content: string): ParsedFile[] {
  const files: ParsedFile[] = [];

  // Match code blocks with optional file path in header
  // Pattern: ```language optional-metadata\n...code...\n```
  const codeBlockPattern = /```(\w+)?([^\n]*)\n([\s\S]*?)```/g;

  let match;
  let fileIndex = 0;

  while ((match = codeBlockPattern.exec(content)) !== null) {
    const language = match[1] || '';
    const header = match[2] || '';
    const code = match[3];

    // Skip empty code blocks
    if (!code.trim()) continue;

    // Try to extract file path
    let path = extractFilePath(header, language);

    // If no path found, try to find it in the line before the code block
    if (!path) {
      const beforeBlock = content.slice(0, match.index);
      const lines = beforeBlock.split('\n');
      const lastLine = lines[lines.length - 1] || '';

      // Check for patterns like "**src/App.tsx**" or "### src/App.tsx"
      const boldPattern = /\*\*([^\s*]+\.\w+)\*\*/;
      const headerPattern = /#{1,6}\s*([^\s#]+\.\w+)/;
      const fileMarkerPattern = /(?:file|filename|path):\s*`?([^\s`]+\.\w+)`?/i;

      const boldMatch = lastLine.match(boldPattern);
      const headerMatch = lastLine.match(headerPattern);
      const fileMarkerMatch = lastLine.match(fileMarkerPattern);

      if (boldMatch) {
        path = boldMatch[1];
      } else if (headerMatch) {
        path = headerMatch[1];
      } else if (fileMarkerMatch) {
        path = fileMarkerMatch[1];
      }
    }

    // Generate a default path if none found
    if (!path) {
      const ext =
        language === 'typescript' || language === 'ts'
          ? 'tsx'
          : language === 'javascript' || language === 'js'
            ? 'jsx'
            : language || 'txt';
      path = `src/file${fileIndex}.${ext}`;
      fileIndex++;
    }

    // Normalize path
    if (!path.includes('/')) {
      path = `src/${path}`;
    }

    files.push({
      path,
      content: code.trim(),
      language: inferLanguage(path),
    });
  }

  return files;
}

/**
 * Merge new files with existing files, updating existing ones
 */
export function mergeFiles(
  existingFiles: ParsedFile[],
  newFiles: ParsedFile[]
): ParsedFile[] {
  const fileMap = new Map<string, ParsedFile>();

  // Add existing files
  existingFiles.forEach((file) => {
    fileMap.set(file.path, file);
  });

  // Add or update with new files
  newFiles.forEach((file) => {
    fileMap.set(file.path, file);
  });

  return Array.from(fileMap.values());
}

/**
 * Create a default project structure
 */
export function createDefaultProjectFiles(): ParsedFile[] {
  return [
    {
      path: 'src/main.tsx',
      content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`,
      language: 'typescript',
    },
    {
      path: 'src/App.tsx',
      content: `import React from 'react';

function App() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Welcome to Your App
        </h1>
        <p className="text-gray-600">
          Start editing to see your changes live
        </p>
      </div>
    </div>
  );
}

export default App;`,
      language: 'typescript',
    },
    {
      path: 'src/index.css',
      content: `@tailwind base;
@tailwind components;
@tailwind utilities;`,
      language: 'css',
    },
    {
      path: 'package.json',
      content: JSON.stringify(
        {
          name: 'ai-generated-app',
          private: true,
          version: '0.0.0',
          type: 'module',
          scripts: {
            dev: 'vite',
            build: 'vite build',
            preview: 'vite preview',
          },
          dependencies: {
            react: '^18.2.0',
            'react-dom': '^18.2.0',
          },
          devDependencies: {
            '@types/react': '^18.2.0',
            '@types/react-dom': '^18.2.0',
            '@vitejs/plugin-react': '^4.0.0',
            typescript: '^5.0.0',
            vite: '^5.0.0',
          },
        },
        null,
        2
      ),
      language: 'json',
    },
  ];
}
