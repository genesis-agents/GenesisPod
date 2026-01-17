'use client';

/**
 * AI Studio - 研究项目列表页
 * 对标 NotebookLM 设计
 */

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getAuthTokens } from '@/lib/utils/auth';
import { useTranslation } from '@/lib/i18n';
import { KnowledgeBaseSelector } from '@/components/shared/selectors';
import {
  TopicResearchTab,
  CreateTopicDialog as TopicCreateDialog,
} from '@/components/ai-research';
import { ResearchTopicType } from '@/types/topic-research';

// ==================== 自定义图标组件 ====================
const PlusIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 4v16m8-8H4"
    />
  </svg>
);

const SearchIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
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
);

const MoreVerticalIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="5" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="12" cy="19" r="1.5" />
  </svg>
);

const ArchiveIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
    />
  </svg>
);

const TrashIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
    />
  </svg>
);

const ClockIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const FileTextIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
    />
  </svg>
);

const MessageSquareIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
    />
  </svg>
);

const LoaderIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
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
);

const FolderOpenIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"
    />
  </svg>
);

// ==================== 类型定义 ====================
interface ResearchProject {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  status: 'ACTIVE' | 'ARCHIVED' | 'DELETED';
  researchType: 'FAST' | 'DEEP';
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
    headers['Authorization'] = `Bearer ${tokens.accessToken}`;
  }
  return headers;
}

async function fetchProjects(options?: {
  status?: string;
  search?: string;
  researchType?: 'FAST' | 'DEEP';
}): Promise<{ data: ResearchProject[]; pagination: any }> {
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (options?.search) params.set('search', options.search);
  if (options?.researchType) params.set('researchType', options.researchType);

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
  researchType?: 'FAST' | 'DEEP';
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
  defaultResearchType = 'FAST',
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (project: ResearchProject) => void;
  defaultResearchType?: 'FAST' | 'DEEP';
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [researchType, setResearchType] = useState<'FAST' | 'DEEP'>(
    defaultResearchType
  );
  const [selectedKnowledgeBases, setSelectedKnowledgeBases] = useState<
    string[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 当 defaultResearchType 变化时更新
  useEffect(() => {
    setResearchType(defaultResearchType);
  }, [defaultResearchType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const project = await createProject({
        name: name.trim(),
        description: description.trim() || undefined,
        researchType,
      });
      onCreated(project);
      setName('');
      setDescription('');
      setSelectedKnowledgeBases([]);
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
          {t('aiStudio.project.createTitle')}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {t('aiStudio.project.createDesc')}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              {t('aiStudio.project.name')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('aiStudio.project.namePlaceholder')}
              className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              {t('aiStudio.project.descriptionOptional')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('aiStudio.project.descriptionPlaceholder')}
              rows={3}
              className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>

          {/* Knowledge Base Selector */}
          <div>
            <KnowledgeBaseSelector
              selectedIds={selectedKnowledgeBases}
              onSelectionChange={setSelectedKnowledgeBases}
              multiple={true}
              maxSelections={5}
              placeholder={t('aiStudio.project.knowledgeBasePlaceholder')}
              disabled={loading}
            />
            <p className="mt-1 text-xs text-gray-500">
              {t('aiStudio.project.knowledgeBaseHint')}
            </p>
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
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={!name.trim() || loading}
              className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {loading && <LoaderIcon className="h-4 w-4 animate-spin" />}
              {t('aiStudio.project.create')}
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
  const { t } = useTranslation();
  const [showMenu, setShowMenu] = useState(false);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return t('aiStudio.time.never');
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours === 0) {
        const diffMins = Math.floor(diffMs / (1000 * 60));
        return t('aiStudio.time.minutesAgo', { count: diffMins });
      }
      return t('aiStudio.time.hoursAgo', { count: diffHours });
    }
    if (diffDays === 1) return t('aiStudio.time.yesterday');
    if (diffDays < 7) return t('aiStudio.time.daysAgo', { count: diffDays });
    return date.toLocaleDateString();
  };

  const sourceCount = project._count?.sources ?? project.sourceCount;
  const noteCount = project._count?.notes ?? project.noteCount;

  return (
    <div
      onClick={onClick}
      className="group relative cursor-pointer rounded-xl border border-gray-200 bg-white p-5 transition-all hover:border-violet-300 hover:shadow-lg"
    >
      {/* Menu Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowMenu(!showMenu);
        }}
        className="absolute right-3 top-3 rounded-lg p-1.5 opacity-0 transition-opacity hover:bg-gray-100 group-hover:opacity-100"
      >
        <MoreVerticalIcon className="h-4 w-4 text-gray-500" />
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
            <ArchiveIcon className="h-4 w-4" />
            {t('aiStudio.project.archive')}
          </button>
          <button
            onClick={() => {
              onDelete();
              setShowMenu(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            <TrashIcon className="h-4 w-4" />
            {t('aiStudio.project.delete')}
          </button>
        </div>
      )}

      {/* Project Icon - 使用统一风格的渐变图标 */}
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-md">
        <svg
          className="h-6 w-6 text-white"
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
          <FileTextIcon className="h-3.5 w-3.5" />
          <span>
            {t('aiStudio.project.sourcesCount', { count: sourceCount })}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <MessageSquareIcon className="h-3.5 w-3.5" />
          <span>{t('aiStudio.project.notesCount', { count: noteCount })}</span>
        </div>
      </div>

      {/* Last Access */}
      <div className="mt-3 flex items-center gap-1 text-xs text-gray-400">
        <ClockIcon className="h-3 w-3" />
        <span>{formatDate(project.lastAccessAt || project.updatedAt)}</span>
      </div>
    </div>
  );
}

// ==================== 主页面内容 ====================
function StudioPageContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get('tab');
  // ★ 读取分享链接中的 topicId 参数
  const topicIdParam = searchParams?.get('topicId');
  // ★ 读取分享链接中的 view 参数（用于直接跳转到报告视图）
  const viewParam = searchParams?.get('view');

  const [activeTab, setActiveTab] = useState<'fast' | 'deep' | 'topic'>(() => {
    if (tabParam === 'deep') {
      return 'deep';
    }
    if (tabParam === 'topic') {
      return 'topic';
    }
    return 'fast';
  });
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Topic Research tab state
  const [topicActiveType, setTopicActiveType] =
    useState<ResearchTopicType | null>(null);
  const [showTopicCreateDialog, setShowTopicCreateDialog] = useState(false);
  const [isTopicDetailView, setIsTopicDetailView] = useState(false);

  // Update activeTab when URL parameter changes
  useEffect(() => {
    if (tabParam === 'fast' || tabParam === 'deep' || tabParam === 'topic') {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  // 加载项目
  const loadProjects = useCallback(async () => {
    // Skip loading for topic tab
    if (activeTab === 'topic') {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await fetchProjects({
        search: searchQuery || undefined,
        researchType: activeTab === 'fast' ? 'FAST' : 'DEEP',
      });
      setProjects(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, activeTab]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // 处理项目创建
  const handleProjectCreated = (project: ResearchProject) => {
    setProjects((prev) => [project, ...prev]);
    // 直接跳转到新项目
    router.push(`/ai-research/${project.id}`);
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
    <div className="h-full overflow-auto bg-gray-50">
      {/* Header - Hidden when viewing topic detail */}
      {!isTopicDetailView && (
        <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/50 backdrop-blur-sm">
          <div className="px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/25">
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
                    {t('aiStudio.title')}
                  </h1>
                  <p className="text-sm text-gray-500">
                    {t('aiStudio.subtitle')}
                  </p>
                </div>
              </div>
              {/* ★ 暂时隐藏新建项目按钮 */}
              {/* <button
                onClick={() => setShowCreateDialog(true)}
                className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-700"
              >
                <PlusIcon className="h-5 w-5" />
                {t('aiStudio.project.newProject')}
              </button> */}
            </div>

            {/* Tabs */}
            <div className="mt-6 flex items-center gap-6 border-b border-gray-200">
              <button
                onClick={() => setActiveTab('fast')}
                className={`relative pb-3 text-sm font-medium transition-colors ${
                  activeTab === 'fast'
                    ? 'text-violet-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
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
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  {t('aiStudio.tabs.fastResearch')}
                </div>
                {activeTab === 'fast' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-600" />
                )}
              </button>
              <button
                onClick={() => setActiveTab('deep')}
                className={`relative pb-3 text-sm font-medium transition-colors ${
                  activeTab === 'deep'
                    ? 'text-purple-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
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
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
                    />
                  </svg>
                  {t('aiStudio.tabs.deepResearch')}
                </div>
                {activeTab === 'deep' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-600" />
                )}
              </button>
              <button
                onClick={() => setActiveTab('topic')}
                className={`relative pb-3 text-sm font-medium transition-colors ${
                  activeTab === 'topic'
                    ? 'text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
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
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  {t('topicResearch.title')}
                </div>
                {activeTab === 'topic' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                )}
              </button>
            </div>

            {/* Search Bar */}
            <div className="mt-6">
              <div className="relative">
                <SearchIcon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('aiStudio.search.placeholder')}
                  className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-4 text-sm outline-none transition-all focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className={isTopicDetailView ? 'h-full' : 'px-8 py-6'}>
        {activeTab === 'topic' ? (
          /* Topic Research Tab Content */
          <TopicResearchTab
            activeType={topicActiveType}
            searchQuery={searchQuery}
            showCreateDialog={showTopicCreateDialog}
            onShowCreateDialog={setShowTopicCreateDialog}
            onDetailViewChange={setIsTopicDetailView}
            initialTopicId={topicIdParam}
            initialView={viewParam}
          />
        ) : (
          /* Fast/Deep Research Projects Grid */
          <>
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <LoaderIcon className="h-8 w-8 animate-spin text-violet-600" />
              </div>
            ) : error ? (
              <div className="rounded-xl bg-red-50 p-6 text-center">
                <p className="text-red-600">
                  {typeof error === 'string' ? error : t('common.loadError')}
                </p>
                <button
                  onClick={loadProjects}
                  className="mt-4 text-sm text-purple-600 hover:underline"
                >
                  {t('aiStudio.tryAgain')}
                </button>
              </div>
            ) : projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 py-20">
                <FolderOpenIcon className="h-16 w-16 text-gray-300" />
                <h3 className="mt-4 text-lg font-medium text-gray-900">
                  {t('aiStudio.empty.noProjects')}
                </h3>
                <p className="mt-1 text-gray-500">
                  {t('aiStudio.empty.noProjectsDesc')}
                </p>
                <button
                  onClick={() => setShowCreateDialog(true)}
                  className="mt-6 flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2.5 font-medium text-white hover:bg-purple-700"
                >
                  <PlusIcon className="h-5 w-5" />
                  {t('aiStudio.empty.createFirst')}
                </button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {projects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onClick={() => router.push(`/ai-research/${project.id}`)}
                    onArchive={() => handleArchive(project.id)}
                    onDelete={() => handleDelete(project.id)}
                  />
                ))}

                {/* Create New Project Card */}
                <button
                  onClick={() => setShowCreateDialog(true)}
                  className={`flex min-h-[180px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white p-6 transition-colors ${
                    activeTab === 'fast'
                      ? 'hover:border-violet-400 hover:bg-violet-50'
                      : 'hover:border-purple-400 hover:bg-purple-50'
                  }`}
                >
                  <PlusIcon
                    className={`h-10 w-10 ${activeTab === 'fast' ? 'text-violet-400' : 'text-purple-400'}`}
                  />
                  <span className="mt-2 text-sm font-medium text-gray-600">
                    {t('aiStudio.empty.createNew')}
                  </span>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Project Dialog */}
      <CreateProjectDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreated={handleProjectCreated}
        defaultResearchType={activeTab === 'fast' ? 'FAST' : 'DEEP'}
      />
    </div>
  );
}

// ==================== 主页面 ====================
export default function StudioPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center bg-gray-50">
          <LoaderIcon className="h-8 w-8 animate-spin text-violet-600" />
        </div>
      }
    >
      <StudioPageContent />
    </Suspense>
  );
}
