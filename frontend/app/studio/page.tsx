'use client';

/**
 * AI Studio - 研究项目列表页
 * 对标 NotebookLM 设计
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Search,
  MoreVertical,
  Archive,
  Trash2,
  Clock,
  FileText,
  MessageSquare,
  Loader2,
  FolderOpen,
} from 'lucide-react';
import { getAuthTokens } from '@/lib/auth';
import Sidebar from '@/components/layout/Sidebar';

// ==================== 类型定义 ====================
interface ResearchProject {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  status: 'ACTIVE' | 'ARCHIVED' | 'DELETED';
  sourceCount: number;
  noteCount: number;
  chatCount: number;
  createdAt: string;
  updatedAt: string;
  lastAccessAt: string | null;
  _count?: {
    sources: number;
    notes: number;
    chats: number;
    outputs: number;
  };
}

// ==================== API ====================
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

function getAuthHeaders(): HeadersInit {
  const tokens = getAuthTokens();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (tokens?.accessToken) {
    (headers as Record<string, string>)['Authorization'] =
      `Bearer ${tokens.accessToken}`;
  }
  return headers;
}

async function fetchProjects(options?: {
  status?: string;
  search?: string;
}): Promise<{ data: ResearchProject[]; pagination: any }> {
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (options?.search) params.set('search', options.search);

  const res = await fetch(`${API_BASE}/api/v1/ai-studio/projects?${params}`, {
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Please sign in to view projects');
    }
    throw new Error('Failed to fetch projects');
  }

  return res.json();
}

async function createProject(data: {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
}): Promise<ResearchProject> {
  const res = await fetch(`${API_BASE}/api/v1/ai-studio/projects`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Please sign in to create a project');
    }
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to create project');
  }

  return res.json();
}

async function deleteProject(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/ai-studio/projects/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new Error('Failed to delete project');
  }
}

async function archiveProject(id: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/v1/ai-studio/projects/${id}/archive`,
    {
      method: 'POST',
      headers: getAuthHeaders(),
    }
  );

  if (!res.ok) {
    throw new Error('Failed to archive project');
  }
}

// ==================== 组件 ====================

// 创建项目对话框
function CreateProjectDialog({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (project: ResearchProject) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const project = await createProject({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      onCreated(project);
      setName('');
      setDescription('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-semibold text-gray-900">
          Create New Research Project
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Start a new research project to organize your sources and insights
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Project Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., LLM Inference Optimization Research"
              className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of your research goals..."
              rows={3}
              className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || loading}
              className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Project
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 项目卡片
function ProjectCard({
  project,
  onClick,
  onArchive,
  onDelete,
}: {
  project: ResearchProject;
  onClick: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours === 0) {
        const diffMins = Math.floor(diffMs / (1000 * 60));
        return `${diffMins} minutes ago`;
      }
      return `${diffHours} hours ago`;
    }
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const sourceCount = project._count?.sources ?? project.sourceCount;
  const noteCount = project._count?.notes ?? project.noteCount;

  return (
    <div
      onClick={onClick}
      className="group relative cursor-pointer rounded-xl border border-gray-200 bg-white p-5 transition-all hover:border-purple-300 hover:shadow-lg"
    >
      {/* Menu Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowMenu(!showMenu);
        }}
        className="absolute right-3 top-3 rounded-lg p-1.5 opacity-0 transition-opacity hover:bg-gray-100 group-hover:opacity-100"
      >
        <MoreVertical className="h-4 w-4 text-gray-500" />
      </button>

      {/* Dropdown Menu */}
      {showMenu && (
        <div
          className="absolute right-3 top-10 z-10 w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              onArchive();
              setShowMenu(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Archive className="h-4 w-4" />
            Archive
          </button>
          <button
            onClick={() => {
              onDelete();
              setShowMenu(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      )}

      {/* Project Icon */}
      <div
        className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl text-2xl"
        style={{ backgroundColor: `${project.color || '#6366f1'}20` }}
      >
        {project.icon || '📚'}
      </div>

      {/* Project Info */}
      <h3 className="line-clamp-1 font-semibold text-gray-900">
        {project.name}
      </h3>
      {project.description && (
        <p className="mt-1 line-clamp-2 text-sm text-gray-500">
          {project.description}
        </p>
      )}

      {/* Stats */}
      <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <FileText className="h-3.5 w-3.5" />
          <span>{sourceCount} sources</span>
        </div>
        <div className="flex items-center gap-1">
          <MessageSquare className="h-3.5 w-3.5" />
          <span>{noteCount} notes</span>
        </div>
      </div>

      {/* Last Access */}
      <div className="mt-3 flex items-center gap-1 text-xs text-gray-400">
        <Clock className="h-3 w-3" />
        <span>{formatDate(project.lastAccessAt || project.updatedAt)}</span>
      </div>
    </div>
  );
}

// ==================== 主页面 ====================
export default function StudioPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // 加载项目
  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await fetchProjects({
        search: searchQuery || undefined,
      });
      setProjects(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // 处理项目创建
  const handleProjectCreated = (project: ResearchProject) => {
    setProjects((prev) => [project, ...prev]);
    // 直接跳转到新项目
    router.push(`/studio/${project.id}`);
  };

  // 处理项目归档
  const handleArchive = async (id: string) => {
    try {
      await archiveProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error('Failed to archive project:', err);
    }
  };

  // 处理项目删除
  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this project?')) return;

    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />

      <main className="flex-1 overflow-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur-sm">
          <div className="mx-auto max-w-7xl px-6 py-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/25">
                  <svg
                    className="h-7 w-7 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                    />
                  </svg>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    AI Studio
                  </h1>
                  <p className="text-sm text-gray-500">
                    上传资料，让AI帮你研究和分析
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateDialog(true)}
                className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-700"
              >
                <Plus className="h-5 w-5" />
                New Project
              </button>
            </div>

            {/* Search Bar */}
            <div className="mt-6">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索项目..."
                  className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-4 text-sm outline-none transition-all focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="mx-auto max-w-7xl px-6 py-8">
          {/* Projects Grid */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
            </div>
          ) : error ? (
            <div className="rounded-xl bg-red-50 p-6 text-center">
              <p className="text-red-600">{error}</p>
              <button
                onClick={loadProjects}
                className="mt-4 text-sm text-purple-600 hover:underline"
              >
                Try again
              </button>
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 py-20">
              <FolderOpen className="h-16 w-16 text-gray-300" />
              <h3 className="mt-4 text-lg font-medium text-gray-900">
                No projects yet
              </h3>
              <p className="mt-1 text-gray-500">
                Create your first research project to get started
              </p>
              <button
                onClick={() => setShowCreateDialog(true)}
                className="mt-6 flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2.5 font-medium text-white hover:bg-purple-700"
              >
                <Plus className="h-5 w-5" />
                Create Project
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onClick={() => router.push(`/studio/${project.id}`)}
                  onArchive={() => handleArchive(project.id)}
                  onDelete={() => handleDelete(project.id)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Create Project Dialog */}
      <CreateProjectDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreated={handleProjectCreated}
      />
    </div>
  );
}
