'use client';

import { useState, useCallback, useMemo } from 'react';
import { FileExplorer } from './FileExplorer';
import { CodeEditor } from './CodeEditor';
import { CodePreview } from './CodePreview';
import { BackendPreview } from './BackendPreview';
import { ThinkingPanel } from './ThinkingPanel';

interface ProjectFile {
  path: string;
  content: string;
  language?: string;
}

interface ThinkingStep {
  step: string;
  thought: string;
  keyPoints?: string[];
  progress?: number;
}

interface AgentInfo {
  role: string;
  name: string;
  icon: string;
  isActive: boolean;
  thinkingData?: ThinkingStep;
  streamingContent?: string;
}

interface DevWorkspaceProps {
  files: ProjectFile[];
  currentAgent?: AgentInfo;
  onFileChange?: (path: string, content: string) => void;
  onFileSave?: (path: string, content: string) => void;
  isGenerating?: boolean;
  showPreview?: boolean;
  className?: string;
}

type ViewMode = 'code' | 'preview' | 'split';

export function DevWorkspace({
  files,
  currentAgent,
  onFileChange,
  onFileSave,
  isGenerating = false,
  showPreview = true,
  className = '',
}: DevWorkspaceProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [sidebarWidth] = useState(220);
  const [splitRatio, setSplitRatio] = useState(50);

  // Get selected file object
  const currentFile = useMemo(() => {
    if (!selectedFile) return null;
    return files.find((f) => f.path === selectedFile) || null;
  }, [files, selectedFile]);

  // Detect if this is a frontend (React) or backend project
  const projectType = useMemo(() => {
    const hasReactFiles = files.some(
      (f) => f.path.endsWith('.tsx') || f.path.endsWith('.jsx')
    );
    const hasHtmlEntry = files.some(
      (f) => f.path.endsWith('.html') || f.path === 'index.html'
    );
    const hasReactImport = files.some(
      (f) =>
        f.content.includes("from 'react'") || f.content.includes('from "react"')
    );

    // Check for React entry point
    const hasReactEntry = files.some(
      (f) =>
        (f.path === 'src/main.tsx' ||
          f.path === 'src/index.tsx' ||
          f.path === 'src/App.tsx') &&
        (f.content.includes('createRoot') || f.content.includes('ReactDOM'))
    );

    if (hasReactEntry || (hasReactFiles && hasReactImport) || hasHtmlEntry) {
      return 'frontend' as const;
    }
    return 'backend' as const;
  }, [files]);

  // Auto-select first file if none selected
  useMemo(() => {
    if (!selectedFile && files.length > 0) {
      const mainFiles =
        projectType === 'frontend'
          ? ['src/App.tsx', 'src/App.jsx', 'src/main.tsx', 'src/index.tsx']
          : [
              'src/main.ts',
              'src/index.ts',
              'src/app.ts',
              'src/server.ts',
              'src/app.module.ts',
            ];
      const defaultFile =
        files.find((f) => mainFiles.includes(f.path)) || files[0];
      setSelectedFile(defaultFile?.path || null);
    }
  }, [files, selectedFile, projectType]);

  const handleSelectFile = useCallback((path: string) => {
    setSelectedFile(path);
  }, []);

  const handleFileChange = useCallback(
    (path: string, content: string) => {
      onFileChange?.(path, content);
    },
    [onFileChange]
  );

  const handleFileSave = useCallback(
    (path: string, content: string) => {
      onFileSave?.(path, content);
    },
    [onFileSave]
  );

  return (
    <div className={`flex h-full flex-col bg-gray-100 ${className}`}>
      {/* AI Thinking Panel */}
      {currentAgent?.isActive && (
        <div className="border-b border-gray-200 p-3">
          <ThinkingPanel
            agentName={currentAgent.name}
            agentIcon={currentAgent.icon}
            isActive={currentAgent.isActive}
            thinkingData={currentAgent.thinkingData}
            streamingContent={currentAgent.streamingContent}
          />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">
            {files.length} files
          </span>
          {isGenerating && (
            <span className="flex items-center gap-1.5 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
              Generating...
            </span>
          )}
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          <button
            onClick={() => setViewMode('code')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'code'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
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
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
              />
            </svg>
            Code
          </button>
          <button
            onClick={() => setViewMode('split')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'split'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
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
                d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
              />
            </svg>
            Split
          </button>
          <button
            onClick={() => setViewMode('preview')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'preview'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
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
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
            Preview
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* File Explorer Sidebar */}
        {viewMode !== 'preview' && (
          <div
            className="flex-shrink-0 border-r border-gray-200"
            style={{ width: sidebarWidth }}
          >
            <FileExplorer
              files={files}
              selectedFile={selectedFile || undefined}
              onSelectFile={handleSelectFile}
            />
          </div>
        )}

        {/* Code Editor */}
        {(viewMode === 'code' || viewMode === 'split') && (
          <div
            className="flex-1 overflow-hidden"
            style={{
              width: viewMode === 'split' ? `${splitRatio}%` : undefined,
            }}
          >
            <CodeEditor
              file={currentFile}
              files={files}
              onFileChange={handleFileChange}
              onSave={handleFileSave}
              readOnly={isGenerating}
            />
          </div>
        )}

        {/* Resizer */}
        {viewMode === 'split' && (
          <div
            className="group relative w-1 cursor-col-resize bg-gray-200 hover:bg-blue-400"
            onMouseDown={(e) => {
              const startX = e.clientX;
              const startRatio = splitRatio;
              const container = e.currentTarget.parentElement;
              if (!container) return;

              const onMouseMove = (moveEvent: MouseEvent) => {
                const containerWidth = container.offsetWidth - sidebarWidth;
                const deltaX = moveEvent.clientX - startX;
                const deltaRatio = (deltaX / containerWidth) * 100;
                const newRatio = Math.min(
                  80,
                  Math.max(20, startRatio + deltaRatio)
                );
                setSplitRatio(newRatio);
              };

              const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
              };

              document.addEventListener('mousemove', onMouseMove);
              document.addEventListener('mouseup', onMouseUp);
            }}
          >
            <div className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 bg-transparent group-hover:bg-blue-400" />
          </div>
        )}

        {/* Preview */}
        {(viewMode === 'preview' || viewMode === 'split') && showPreview && (
          <div
            className="flex-1 overflow-hidden border-l border-gray-200"
            style={{
              width: viewMode === 'split' ? `${100 - splitRatio}%` : undefined,
            }}
          >
            {projectType === 'frontend' ? (
              <CodePreview files={files} entryPoint="src/main.tsx" />
            ) : (
              <BackendPreview files={files} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default DevWorkspace;
