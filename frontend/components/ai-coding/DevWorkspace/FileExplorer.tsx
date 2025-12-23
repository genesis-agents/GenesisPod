'use client';

import { useState, useMemo, useCallback } from 'react';

interface ProjectFile {
  path: string;
  content: string;
  language?: string;
}

// Internal type used during tree building
interface InternalFileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: Record<string, InternalFileNode>;
  content?: string;
  language?: string;
}

// Final type with children as array
interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  content?: string;
  language?: string;
}

interface FileExplorerProps {
  files: ProjectFile[];
  selectedFile?: string;
  onSelectFile: (path: string) => void;
  className?: string;
}

// File type icons
const FILE_ICONS: Record<string, { icon: string; color: string }> = {
  tsx: { icon: 'TS', color: 'text-blue-500 bg-blue-50' },
  ts: { icon: 'TS', color: 'text-blue-500 bg-blue-50' },
  jsx: { icon: 'JS', color: 'text-yellow-600 bg-yellow-50' },
  js: { icon: 'JS', color: 'text-yellow-600 bg-yellow-50' },
  json: { icon: '{}', color: 'text-gray-500 bg-gray-100' },
  css: { icon: '#', color: 'text-purple-500 bg-purple-50' },
  scss: { icon: '#', color: 'text-pink-500 bg-pink-50' },
  html: { icon: '<>', color: 'text-orange-500 bg-orange-50' },
  md: { icon: 'M', color: 'text-gray-600 bg-gray-100' },
  py: { icon: 'PY', color: 'text-green-600 bg-green-50' },
  go: { icon: 'GO', color: 'text-cyan-500 bg-cyan-50' },
  yaml: { icon: 'Y', color: 'text-red-400 bg-red-50' },
  yml: { icon: 'Y', color: 'text-red-400 bg-red-50' },
  env: { icon: 'E', color: 'text-gray-500 bg-gray-100' },
  gitignore: { icon: 'G', color: 'text-gray-400 bg-gray-100' },
};

function getFileIcon(filename: string): { icon: string; color: string } {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return FILE_ICONS[ext] || { icon: 'F', color: 'text-gray-400 bg-gray-100' };
}

// Build file tree from flat file list
function buildFileTree(files: ProjectFile[]): FileNode[] {
  const root: Record<string, InternalFileNode> = {};

  files.forEach((file) => {
    const parts = file.path.split('/');
    let current: Record<string, InternalFileNode> = root;

    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1;
      const currentPath = parts.slice(0, index + 1).join('/');

      if (!current[part]) {
        current[part] = {
          name: part,
          path: currentPath,
          type: isFile ? 'file' : 'folder',
          children: isFile ? undefined : {},
          content: isFile ? file.content : undefined,
          language: isFile ? file.language : undefined,
        };
      }

      if (!isFile && current[part].children) {
        current = current[part].children!;
      }
    });
  });

  // Convert to array and sort
  function toArray(nodes: Record<string, InternalFileNode>): FileNode[] {
    return Object.values(nodes)
      .map(
        (node): FileNode => ({
          name: node.name,
          path: node.path,
          type: node.type,
          children: node.children ? toArray(node.children) : undefined,
          content: node.content,
          language: node.language,
        })
      )
      .sort((a, b) => {
        // Folders first, then files
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
  }

  return toArray(root);
}

// File Tree Node Component
function FileTreeNode({
  node,
  depth = 0,
  selectedFile,
  expandedFolders,
  onSelectFile,
  onToggleFolder,
}: {
  node: FileNode;
  depth?: number;
  selectedFile?: string;
  expandedFolders: Set<string>;
  onSelectFile: (path: string) => void;
  onToggleFolder: (path: string) => void;
}) {
  const isExpanded = expandedFolders.has(node.path);
  const isSelected = selectedFile === node.path;
  const fileIcon = node.type === 'file' ? getFileIcon(node.name) : null;

  return (
    <div>
      <div
        className={`flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-sm transition-colors ${
          isSelected
            ? 'bg-blue-100 text-blue-700'
            : 'text-gray-700 hover:bg-gray-100'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => {
          if (node.type === 'folder') {
            onToggleFolder(node.path);
          } else {
            onSelectFile(node.path);
          }
        }}
      >
        {/* Folder/File Icon */}
        {node.type === 'folder' ? (
          <>
            <svg
              className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
            <svg
              className="h-4 w-4 text-yellow-500"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
            </svg>
          </>
        ) : (
          <span
            className={`flex h-4 w-4 items-center justify-center rounded text-[8px] font-bold ${fileIcon?.color}`}
          >
            {fileIcon?.icon}
          </span>
        )}

        {/* Name */}
        <span className="truncate">{node.name}</span>
      </div>

      {/* Children */}
      {node.type === 'folder' && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedFile={selectedFile}
              expandedFolders={expandedFolders}
              onSelectFile={onSelectFile}
              onToggleFolder={onToggleFolder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileExplorer({
  files,
  selectedFile,
  onSelectFile,
  className = '',
}: FileExplorerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(['src', 'src/components'])
  );

  const fileTree = useMemo(() => buildFileTree(files), [files]);

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const allFolders = new Set<string>();
    const addFolders = (nodes: FileNode[]) => {
      nodes.forEach((node) => {
        if (node.type === 'folder') {
          allFolders.add(node.path);
          if (node.children) {
            addFolders(node.children);
          }
        }
      });
    };
    addFolders(fileTree);
    setExpandedFolders(allFolders);
  }, [fileTree]);

  const collapseAll = useCallback(() => {
    setExpandedFolders(new Set());
  }, []);

  // Filter files by search query
  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return fileTree;

    const query = searchQuery.toLowerCase();
    const filterNodes = (nodes: FileNode[]): FileNode[] => {
      return nodes
        .map((node) => {
          if (node.type === 'file') {
            return node.name.toLowerCase().includes(query) ? node : null;
          }
          const filteredChildren = filterNodes(node.children || []);
          if (filteredChildren.length > 0) {
            return { ...node, children: filteredChildren };
          }
          return node.name.toLowerCase().includes(query) ? node : null;
        })
        .filter(Boolean) as FileNode[];
    };
    return filterNodes(fileTree);
  }, [fileTree, searchQuery]);

  // Count files and folders
  const counts = useMemo(() => {
    let fileCount = 0;
    let folderCount = 0;
    const count = (nodes: FileNode[]) => {
      nodes.forEach((node) => {
        if (node.type === 'file') {
          fileCount++;
        } else {
          folderCount++;
          if (node.children) count(node.children);
        }
      });
    };
    count(fileTree);
    return { files: fileCount, folders: folderCount };
  }, [fileTree]);

  return (
    <div className={`flex h-full flex-col bg-white ${className}`}>
      {/* Header */}
      <div className="border-b border-gray-200 p-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase text-gray-500">
            Files
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={expandAll}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              title="Expand all"
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
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            <button
              onClick={collapseAll}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              title="Collapse all"
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
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mt-2">
          <svg
            className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files..."
            className="w-full rounded-md border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-2 text-sm focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-300"
          />
        </div>
      </div>

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto p-1">
        {filteredTree.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            {files.length === 0 ? 'No files yet' : 'No matching files'}
          </div>
        ) : (
          filteredTree.map((node) => (
            <FileTreeNode
              key={node.path}
              node={node}
              selectedFile={selectedFile}
              expandedFolders={expandedFolders}
              onSelectFile={onSelectFile}
              onToggleFolder={toggleFolder}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 px-3 py-2 text-xs text-gray-500">
        {counts.files} files, {counts.folders} folders
      </div>
    </div>
  );
}

export default FileExplorer;
