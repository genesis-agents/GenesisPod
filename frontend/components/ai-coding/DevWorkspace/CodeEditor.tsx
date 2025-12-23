'use client';

import { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import Monaco Editor to avoid SSR issues
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-gray-900">
      <div className="flex items-center gap-2 text-gray-400">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-500 border-t-transparent" />
        Loading editor...
      </div>
    </div>
  ),
});

interface ProjectFile {
  path: string;
  content: string;
  language?: string;
}

interface CodeEditorProps {
  file: ProjectFile | null;
  files: ProjectFile[];
  onFileChange?: (path: string, content: string) => void;
  onSave?: (path: string, content: string) => void;
  readOnly?: boolean;
  theme?: 'vs-dark' | 'light';
}

// Get language from file extension
function getLanguage(path: string): string {
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
    xml: 'xml',
    sql: 'sql',
    sh: 'shell',
    bash: 'shell',
  };
  return languageMap[ext] || 'plaintext';
}

export function CodeEditor({
  file,
  files,
  onFileChange,
  onSave,
  readOnly = false,
  theme = 'vs-dark',
}: CodeEditorProps) {
  const [localContent, setLocalContent] = useState<string>(file?.content || '');
  const [hasChanges, setHasChanges] = useState(false);

  // Update local content when file changes
  useEffect(() => {
    if (file) {
      setLocalContent(file.content);
      setHasChanges(false);
    }
  }, [file?.path, file?.content]);

  const handleChange = useCallback(
    (value: string | undefined) => {
      const newContent = value || '';
      setLocalContent(newContent);
      setHasChanges(newContent !== file?.content);
      onFileChange?.(file?.path || '', newContent);
    },
    [file?.path, file?.content, onFileChange]
  );

  const handleSave = useCallback(() => {
    if (file && hasChanges) {
      onSave?.(file.path, localContent);
      setHasChanges(false);
    }
  }, [file, hasChanges, localContent, onSave]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  if (!file) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-900">
        <div className="text-center text-gray-500">
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
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="text-sm">Select a file to view</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-gray-900">
      {/* Tab Bar */}
      <div className="flex items-center justify-between border-b border-gray-700 bg-gray-800 px-2">
        <div className="flex items-center">
          <div className="flex items-center gap-2 rounded-t bg-gray-900 px-3 py-1.5">
            <span className="text-sm text-gray-300">
              {file.path.split('/').pop()}
            </span>
            {hasChanges && (
              <span className="h-2 w-2 rounded-full bg-yellow-400" />
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 py-1">
          {hasChanges && !readOnly && (
            <button
              onClick={handleSave}
              className="flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-700"
            >
              <svg
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                />
              </svg>
              Save
            </button>
          )}
          <span className="text-xs text-gray-500">
            {getLanguage(file.path).toUpperCase()}
          </span>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1">
        <MonacoEditor
          height="100%"
          language={getLanguage(file.path)}
          value={localContent}
          onChange={handleChange}
          theme={theme}
          options={{
            readOnly,
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: 'on',
            renderWhitespace: 'selection',
            folding: true,
            padding: { top: 8 },
            scrollbar: {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
          }}
        />
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between border-t border-gray-700 bg-gray-800 px-3 py-1 text-xs text-gray-500">
        <div className="flex items-center gap-4">
          <span>{file.path}</span>
          {readOnly && (
            <span className="rounded bg-gray-700 px-1.5 py-0.5 text-gray-400">
              Read Only
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span>UTF-8</span>
          <span>{getLanguage(file.path)}</span>
        </div>
      </div>
    </div>
  );
}

export default CodeEditor;
