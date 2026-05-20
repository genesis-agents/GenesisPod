'use client';

import { useState, useEffect } from 'react';
import {
  Sparkles,
  Tag,
  FolderPlus,
  Link2,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle,
  AlertCircle,
  Zap,
} from 'lucide-react';
import { Modal } from '@/components/ui/dialogs/Modal';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';

import { logger } from '@/lib/utils/logger';
interface Collection {
  id: string;
  name: string;
  itemCount?: number;
}

interface AIOrganizePanelProps {
  collections: Collection[];
  onRefresh: () => void;
  activeTab?:
    | 'bookmarks'
    | 'notes'
    | 'images'
    | 'graph'
    | 'notion'
    | 'google-drive'
    | 'knowledge-base'
    | 'personal-kb'
    | 'team-kb'
    | 'data-sources';
}

type TaskType =
  | 'batch-tags'
  | 'smart-classify'
  | 'theme-cluster'
  | 'notes-keypoints'
  | 'notes-connections'
  | 'notes-summarize'
  | 'images-autotag'
  | 'images-style'
  | 'images-cluster';
type TaskStatus = 'idle' | 'running' | 'success' | 'error';

interface KeyPoint {
  insight?: string;
  title?: string;
  point?: string;
  source?: string;
}

interface Connection {
  from: string;
  to: string;
  reasoning: string;
  note1Title?: string;
  note2Title?: string;
  noteIds?: string[];
  note1?: string;
  note2?: string;
  relationship?: string;
  reason?: string;
  description?: string;
  theme?: string;
  strength?: 'strong' | 'moderate' | 'weak';
}

interface ImageTag {
  id: string;
  tags: string[];
  prompt?: string;
  title?: string;
}

interface Style {
  style: string;
  count: number;
  name?: string;
  description?: string;
  colors?: string[];
}

interface Cluster {
  name: string;
  count: number;
  theme?: string;
  description?: string;
  keywords?: string[];
  images?: unknown[];
}

interface TaskResults {
  clusters?: Cluster[];
  suggestions?: Array<{ resourceTitle: string; suggestedCollection: string }>;
  keyPoints?: Array<KeyPoint | string>;
  connections?: Connection[];
  images?: ImageTag[];
  styles?: Style[];
  summary?: string;
  topics?: string[];
  [key: string]: unknown;
}

interface TaskState {
  status: TaskStatus;
  message: string;
  progress?: number;
  results?: TaskResults;
}

export default function AIOrganizePanel({
  collections,
  onRefresh,
  activeTab = 'bookmarks',
}: AIOrganizePanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [resultsModal, setResultsModal] = useState<TaskType | null>(null);
  const [stats, setStats] = useState({
    untaggedCount: 0,
    unclassifiedCount: 0,
    totalCount: 0,
  });
  const [taskStates, setTaskStates] = useState<Record<TaskType, TaskState>>({
    'batch-tags': { status: 'idle', message: '' },
    'smart-classify': { status: 'idle', message: '' },
    'theme-cluster': { status: 'idle', message: '' },
    'notes-keypoints': { status: 'idle', message: '' },
    'notes-connections': { status: 'idle', message: '' },
    'notes-summarize': { status: 'idle', message: '' },
    'images-autotag': { status: 'idle', message: '' },
    'images-style': { status: 'idle', message: '' },
    'images-cluster': { status: 'idle', message: '' },
  });
  const [selectedCollection, setSelectedCollection] = useState<string>('all');

  // Fetch stats when panel expands
  useEffect(() => {
    if (isExpanded) {
      fetchStats();
    }
  }, [isExpanded]);

  const fetchStats = async () => {
    try {
      const response = await fetch(
        `${config.apiBaseUrl}/api/v1/collections/ai/stats`,
        {
          headers: getAuthHeader(),
        }
      );
      if (response.ok) {
        const result = await response.json();
        // Handle wrapped response { success: true, data: {...} }
        const data = result?.data ?? result;
        setStats(data);
      }
    } catch (err) {
      logger.error('Failed to fetch stats:', err);
    }
  };

  const updateTaskState = (task: TaskType, updates: Partial<TaskState>) => {
    setTaskStates((prev) => ({
      ...prev,
      [task]: { ...prev[task], ...updates },
    }));
  };

  // 批量打标签
  const handleBatchTags = async () => {
    updateTaskState('batch-tags', {
      status: 'running',
      message: 'Analyzing resources and generating tags...',
      progress: 0,
    });

    try {
      const response = await fetch(
        `${config.apiBaseUrl}/api/v1/collections/ai/batch-tags`,
        {
          method: 'POST',
          headers: {
            ...getAuthHeader(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            collectionId:
              selectedCollection === 'all' ? null : selectedCollection,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to generate tags');
      }

      const apiResult = await response.json();
      // Handle wrapped response { success: true, data: {...} }
      const result = apiResult?.data ?? apiResult;
      updateTaskState('batch-tags', {
        status: 'success',
        message: `Successfully tagged ${result.taggedCount} resources`,
        results: result,
      });
      onRefresh();
    } catch (err: unknown) {
      updateTaskState('batch-tags', {
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to generate tags',
      });
    }
  };

  // 智能分类
  const handleSmartClassify = async () => {
    updateTaskState('smart-classify', {
      status: 'running',
      message: 'Analyzing resources and suggesting classifications...',
    });

    try {
      const response = await fetch(
        `${config.apiBaseUrl}/api/v1/collections/ai/smart-classify`,
        {
          method: 'POST',
          headers: {
            ...getAuthHeader(),
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to classify resources');
      }

      const apiResult = await response.json();
      // Handle wrapped response { success: true, data: {...} }
      const result = apiResult?.data ?? apiResult;
      updateTaskState('smart-classify', {
        status: 'success',
        message: `Suggested ${result.suggestions?.length || 0} classifications`,
        results: result,
      });
      onRefresh();
    } catch (err: unknown) {
      updateTaskState('smart-classify', {
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to classify',
      });
    }
  };

  // 主题聚类
  const handleThemeCluster = async () => {
    updateTaskState('theme-cluster', {
      status: 'running',
      message: 'Discovering themes and patterns...',
    });

    try {
      const response = await fetch(
        `${config.apiBaseUrl}/api/v1/collections/ai/theme-cluster`,
        {
          method: 'POST',
          headers: {
            ...getAuthHeader(),
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to analyze themes');
      }

      const apiResult = await response.json();
      // Handle wrapped response { success: true, data: {...} }
      const result = apiResult?.data ?? apiResult;
      updateTaskState('theme-cluster', {
        status: 'success',
        message: `Found ${result.clusters?.length || 0} theme clusters`,
        results: result,
      });
    } catch (err: unknown) {
      updateTaskState('theme-cluster', {
        status: 'error',
        message:
          err instanceof Error ? err.message : 'Failed to analyze themes',
      });
    }
  };

  // ===== Notes Tab Handlers =====

  // 提取笔记要点
  const handleExtractKeyPoints = async () => {
    updateTaskState('notes-keypoints', {
      status: 'running',
      message: 'Extracting key insights from your notes...',
    });

    try {
      const response = await fetch(
        `${config.apiBaseUrl}/api/v1/notes/ai/extract-keypoints`,
        {
          method: 'POST',
          headers: {
            ...getAuthHeader(),
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to extract key points');
      }

      const apiResult = await response.json();
      // Handle wrapped response { success: true, data: {...} }
      const result = apiResult?.data ?? apiResult;
      updateTaskState('notes-keypoints', {
        status: 'success',
        message: `Extracted ${result.keyPoints?.length || 0} key insights`,
        results: result,
      });
      onRefresh();
    } catch (err: unknown) {
      updateTaskState('notes-keypoints', {
        status: 'error',
        message:
          err instanceof Error ? err.message : 'Failed to extract key points',
      });
    }
  };

  // 发现笔记关联
  const handleAnalyzeConnections = async () => {
    updateTaskState('notes-connections', {
      status: 'running',
      message: 'Finding connections between your notes...',
    });

    try {
      const response = await fetch(
        `${config.apiBaseUrl}/api/v1/notes/ai/find-connections`,
        {
          method: 'POST',
          headers: {
            ...getAuthHeader(),
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to analyze connections');
      }

      const apiResult = await response.json();
      // Handle wrapped response { success: true, data: {...} }
      const result = apiResult?.data ?? apiResult;
      updateTaskState('notes-connections', {
        status: 'success',
        message: `Found ${result.connections?.length || 0} connections`,
        results: result,
      });
    } catch (err: unknown) {
      updateTaskState('notes-connections', {
        status: 'error',
        message:
          err instanceof Error ? err.message : 'Failed to analyze connections',
      });
    }
  };

  // 生成笔记摘要
  const handleSummarizeNotes = async () => {
    updateTaskState('notes-summarize', {
      status: 'running',
      message: 'Generating comprehensive summary...',
    });

    try {
      const response = await fetch(
        `${config.apiBaseUrl}/api/v1/notes/ai/summarize`,
        {
          method: 'POST',
          headers: {
            ...getAuthHeader(),
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to summarize notes');
      }

      const apiResult = await response.json();
      // Handle wrapped response { success: true, data: {...} }
      const result = apiResult?.data ?? apiResult;
      updateTaskState('notes-summarize', {
        status: 'success',
        message: 'Summary generated successfully',
        results: result,
      });
    } catch (err: unknown) {
      updateTaskState('notes-summarize', {
        status: 'error',
        message:
          err instanceof Error ? err.message : 'Failed to summarize notes',
      });
    }
  };

  // ===== Images Tab Handlers =====

  // 图片自动打标签
  const handleAutoTagImages = async () => {
    updateTaskState('images-autotag', {
      status: 'running',
      message: 'Analyzing images and generating tags...',
    });

    try {
      const response = await fetch(
        `${config.apiBaseUrl}/api/v1/ai-image/ai/auto-tag`,
        {
          method: 'POST',
          headers: {
            ...getAuthHeader(),
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to auto-tag images');
      }

      const apiResult = await response.json();
      // Handle wrapped response { success: true, data: {...} }
      const result = apiResult?.data ?? apiResult;
      updateTaskState('images-autotag', {
        status: 'success',
        message: `Tagged ${result.taggedCount || 0} images`,
        results: result,
      });
      onRefresh();
    } catch (err: unknown) {
      updateTaskState('images-autotag', {
        status: 'error',
        message:
          err instanceof Error ? err.message : 'Failed to auto-tag images',
      });
    }
  };

  // 图片风格分析
  const handleAnalyzeStyles = async () => {
    updateTaskState('images-style', {
      status: 'running',
      message: 'Analyzing art styles and color palettes...',
    });

    try {
      const response = await fetch(
        `${config.apiBaseUrl}/api/v1/ai-image/ai/analyze-styles`,
        {
          method: 'POST',
          headers: {
            ...getAuthHeader(),
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to analyze styles');
      }

      const apiResult = await response.json();
      // Handle wrapped response { success: true, data: {...} }
      const result = apiResult?.data ?? apiResult;
      updateTaskState('images-style', {
        status: 'success',
        message: `Identified ${result.styles?.length || 0} styles`,
        results: result,
      });
    } catch (err: unknown) {
      updateTaskState('images-style', {
        status: 'error',
        message:
          err instanceof Error ? err.message : 'Failed to analyze styles',
      });
    }
  };

  // 视觉主题聚类
  const handleClusterVisualThemes = async () => {
    updateTaskState('images-cluster', {
      status: 'running',
      message: 'Clustering images by visual themes...',
    });

    try {
      const response = await fetch(
        `${config.apiBaseUrl}/api/v1/ai-image/ai/cluster-themes`,
        {
          method: 'POST',
          headers: {
            ...getAuthHeader(),
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to cluster themes');
      }

      const apiResult = await response.json();
      // Handle wrapped response { success: true, data: {...} }
      const result = apiResult?.data ?? apiResult;
      updateTaskState('images-cluster', {
        status: 'success',
        message: `Found ${result.clusters?.length || 0} visual themes`,
        results: result,
      });
    } catch (err: unknown) {
      updateTaskState('images-cluster', {
        status: 'error',
        message:
          err instanceof Error ? err.message : 'Failed to cluster themes',
      });
    }
  };

  const getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="mb-4">
      {/* Toggle Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex w-full items-center justify-between rounded-xl border-2 border-dashed px-4 py-3 transition-all ${
          isExpanded
            ? 'border-purple-300 bg-gradient-to-r from-purple-50 to-indigo-50'
            : 'border-gray-200 bg-white hover:border-purple-200 hover:bg-purple-50/50'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`rounded-lg p-2 ${isExpanded ? 'bg-purple-100' : 'bg-gray-100'}`}
          >
            <Sparkles
              className={`h-5 w-5 ${isExpanded ? 'text-purple-600' : 'text-gray-500'}`}
            />
          </div>
          <div className="text-left">
            <h3
              className={`font-semibold ${isExpanded ? 'text-purple-900' : 'text-gray-700'}`}
            >
              AI Organize Assistant
            </h3>
            <p className="text-sm text-gray-500">
              {activeTab === 'bookmarks' &&
                'Smart tagging, classification, and theme discovery'}
              {activeTab === 'notes' &&
                'Analyze notes, extract insights, and find connections'}
              {activeTab === 'images' &&
                'Image tagging, style analysis, and visual themes'}
              {activeTab === 'notion' &&
                'Sync management, AI insights, and cross-linking'}
              {activeTab === 'graph' &&
                'Knowledge graph visualization and exploration'}
              {activeTab === 'data-sources' &&
                '请选择一个子数据源（书签、笔记、图片）来使用 AI 整理功能'}
              {activeTab === 'personal-kb' &&
                '个人知识库 - 可在 RAG 工作台使用 AI 智能检索'}
              {activeTab === 'team-kb' &&
                '团队知识库 - 可在 RAG 工作台使用 AI 智能检索'}
            </p>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-5 w-5 text-gray-400" />
        ) : (
          <ChevronDown className="h-5 w-5 text-gray-400" />
        )}
      </button>

      {/* Expanded Panel */}
      {isExpanded && (
        <div className="mt-2 rounded-xl border border-purple-100 bg-white p-4 shadow-sm">
          {/* Stats Bar - Only for Bookmarks */}
          {activeTab === 'bookmarks' && (
            <div className="mb-4 flex items-center gap-4 rounded-lg bg-gray-50 px-4 py-2 text-sm">
              <span className="text-gray-600">
                <strong className="text-gray-900">{stats.totalCount}</strong>{' '}
                total resources
              </span>
              <span className="text-gray-300">|</span>
              <span className="text-amber-600">
                <strong>{stats.untaggedCount}</strong> without tags
              </span>
              <span className="text-gray-300">|</span>
              <span className="text-blue-600">
                <strong>{stats.unclassifiedCount}</strong> uncategorized
              </span>
            </div>
          )}

          {/* Notes Tab Info */}
          {activeTab === 'notes' && (
            <div className="mb-4 rounded-lg bg-gradient-to-r from-green-50 to-emerald-50 px-4 py-3 text-sm">
              <p className="text-green-800">
                AI can help you analyze your notes, find key insights, and
                discover connections between ideas.
              </p>
            </div>
          )}

          {/* Images Tab Info */}
          {activeTab === 'images' && (
            <div className="mb-4 rounded-lg bg-gradient-to-r from-pink-50 to-rose-50 px-4 py-3 text-sm">
              <p className="text-pink-800">
                AI can analyze your saved images, detect styles, and help
                organize them by visual themes.
              </p>
            </div>
          )}

          {/* Data Sources Tab Info */}
          {activeTab === 'data-sources' && (
            <div className="mb-4 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 text-sm">
              <p className="text-blue-800">
                请在上方选择一个具体的数据源类型（书签、笔记、图片等），然后即可使用对应的
                AI 整理功能。
              </p>
            </div>
          )}

          {/* Personal KB Tab Info */}
          {activeTab === 'personal-kb' && (
            <div className="mb-4 rounded-lg bg-gradient-to-r from-violet-50 to-purple-50 px-4 py-3 text-sm">
              <p className="text-violet-800">
                个人知识库已具备 AI 向量检索能力。前往{' '}
                <a
                  href="/library/rag"
                  className="font-medium underline hover:text-violet-900"
                >
                  RAG 工作台
                </a>{' '}
                进行智能问答和知识检索。
              </p>
            </div>
          )}

          {/* Team KB Tab Info */}
          {activeTab === 'team-kb' && (
            <div className="mb-4 rounded-lg bg-gradient-to-r from-teal-50 to-cyan-50 px-4 py-3 text-sm">
              <p className="text-teal-800">
                团队知识库支持多人协作和 AI 智能检索。前往{' '}
                <a
                  href="/library/rag"
                  className="font-medium underline hover:text-teal-900"
                >
                  RAG 工作台
                </a>{' '}
                进行团队知识问答。
              </p>
            </div>
          )}

          {/* Collection Selector - Only for Bookmarks */}
          {activeTab === 'bookmarks' && (
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Apply to:
              </label>
              <select
                value={selectedCollection}
                onChange={(e) => setSelectedCollection(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="all">All Collections</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.itemCount || 0} items)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Action Cards - Bookmarks Tab */}
          {activeTab === 'bookmarks' && (
            <div className="grid grid-cols-3 gap-3">
              {/* Batch Tags */}
              <div className="rounded-xl border border-gray-200 p-4 transition-all hover:border-purple-200 hover:shadow-md">
                <div className="mb-3 flex items-center gap-2">
                  <div className="rounded-lg bg-amber-100 p-2">
                    <Tag className="h-5 w-5 text-amber-600" />
                  </div>
                  <h4 className="font-medium text-gray-900">Batch Tags</h4>
                </div>
                <p className="mb-3 text-xs text-gray-500">
                  AI generates relevant tags for resources without tags
                </p>
                <button
                  onClick={handleBatchTags}
                  disabled={taskStates['batch-tags'].status === 'running'}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {taskStates['batch-tags'].status === 'running' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
                      Generate Tags
                    </>
                  )}
                </button>
                {taskStates['batch-tags'].message && (
                  <div
                    className={`mt-2 flex items-center gap-1 text-xs ${
                      taskStates['batch-tags'].status === 'error'
                        ? 'text-red-600'
                        : taskStates['batch-tags'].status === 'success'
                          ? 'text-green-600'
                          : 'text-gray-500'
                    }`}
                  >
                    {getStatusIcon(taskStates['batch-tags'].status)}
                    {taskStates['batch-tags'].message}
                  </div>
                )}
              </div>

              {/* Smart Classify */}
              <div className="rounded-xl border border-gray-200 p-4 transition-all hover:border-purple-200 hover:shadow-md">
                <div className="mb-3 flex items-center gap-2">
                  <div className="rounded-lg bg-blue-100 p-2">
                    <FolderPlus className="h-5 w-5 text-blue-600" />
                  </div>
                  <h4 className="font-medium text-gray-900">Smart Classify</h4>
                </div>
                <p className="mb-3 text-xs text-gray-500">
                  AI suggests which collection each resource belongs to
                </p>
                <button
                  onClick={handleSmartClassify}
                  disabled={taskStates['smart-classify'].status === 'running'}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {taskStates['smart-classify'].status === 'running' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
                      Classify
                    </>
                  )}
                </button>
                {taskStates['smart-classify'].message && (
                  <div
                    className={`mt-2 flex items-center gap-1 text-xs ${
                      taskStates['smart-classify'].status === 'error'
                        ? 'text-red-600'
                        : taskStates['smart-classify'].status === 'success'
                          ? 'text-green-600'
                          : 'text-gray-500'
                    }`}
                  >
                    {getStatusIcon(taskStates['smart-classify'].status)}
                    {taskStates['smart-classify'].message}
                  </div>
                )}
              </div>

              {/* Theme Cluster */}
              <div className="rounded-xl border border-gray-200 p-4 transition-all hover:border-purple-200 hover:shadow-md">
                <div className="mb-3 flex items-center gap-2">
                  <div className="rounded-lg bg-purple-100 p-2">
                    <Link2 className="h-5 w-5 text-purple-600" />
                  </div>
                  <h4 className="font-medium text-gray-900">Theme Clusters</h4>
                </div>
                <p className="mb-3 text-xs text-gray-500">
                  Discover hidden themes and patterns across resources
                </p>
                <button
                  onClick={handleThemeCluster}
                  disabled={taskStates['theme-cluster'].status === 'running'}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-purple-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {taskStates['theme-cluster'].status === 'running' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Discovering...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
                      Discover
                    </>
                  )}
                </button>
                {taskStates['theme-cluster'].message && (
                  <div
                    className={`mt-2 flex items-center gap-1 text-xs ${
                      taskStates['theme-cluster'].status === 'error'
                        ? 'text-red-600'
                        : taskStates['theme-cluster'].status === 'success'
                          ? 'text-green-600'
                          : 'text-gray-500'
                    }`}
                  >
                    {getStatusIcon(taskStates['theme-cluster'].status)}
                    {taskStates['theme-cluster'].message}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Cards - Notes Tab */}
          {activeTab === 'notes' && (
            <div className="grid grid-cols-3 gap-3">
              {/* Extract Key Points */}
              <div className="rounded-xl border border-gray-200 p-4 transition-all hover:border-green-200 hover:shadow-md">
                <div className="mb-3 flex items-center gap-2">
                  <div className="rounded-lg bg-green-100 p-2">
                    <Sparkles className="h-5 w-5 text-green-600" />
                  </div>
                  <h4 className="font-medium text-gray-900">Key Points</h4>
                </div>
                <p className="mb-3 text-xs text-gray-500">
                  Extract key insights and main ideas from your notes
                </p>
                <button
                  onClick={handleExtractKeyPoints}
                  disabled={taskStates['notes-keypoints'].status === 'running'}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {taskStates['notes-keypoints'].status === 'running' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Extracting...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
                      Extract
                    </>
                  )}
                </button>
                {taskStates['notes-keypoints'].message && (
                  <div
                    className={`mt-2 flex items-center gap-1 text-xs ${
                      taskStates['notes-keypoints'].status === 'error'
                        ? 'text-red-600'
                        : taskStates['notes-keypoints'].status === 'success'
                          ? 'text-green-600'
                          : 'text-gray-500'
                    }`}
                  >
                    {getStatusIcon(taskStates['notes-keypoints'].status)}
                    {taskStates['notes-keypoints'].message}
                  </div>
                )}
                {taskStates['notes-keypoints'].status === 'success' &&
                  taskStates['notes-keypoints'].results && (
                    <button
                      onClick={() => setResultsModal('notes-keypoints')}
                      className="mt-2 w-full rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100"
                    >
                      View Results / 查看结果
                    </button>
                  )}
              </div>

              {/* Find Connections */}
              <div className="rounded-xl border border-gray-200 p-4 transition-all hover:border-emerald-200 hover:shadow-md">
                <div className="mb-3 flex items-center gap-2">
                  <div className="rounded-lg bg-emerald-100 p-2">
                    <Link2 className="h-5 w-5 text-emerald-600" />
                  </div>
                  <h4 className="font-medium text-gray-900">Connections</h4>
                </div>
                <p className="mb-3 text-xs text-gray-500">
                  Find hidden connections between your notes
                </p>
                <button
                  onClick={handleAnalyzeConnections}
                  disabled={
                    taskStates['notes-connections'].status === 'running'
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {taskStates['notes-connections'].status === 'running' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
                      Analyze
                    </>
                  )}
                </button>
                {taskStates['notes-connections'].message && (
                  <div
                    className={`mt-2 flex items-center gap-1 text-xs ${
                      taskStates['notes-connections'].status === 'error'
                        ? 'text-red-600'
                        : taskStates['notes-connections'].status === 'success'
                          ? 'text-green-600'
                          : 'text-gray-500'
                    }`}
                  >
                    {getStatusIcon(taskStates['notes-connections'].status)}
                    {taskStates['notes-connections'].message}
                  </div>
                )}
                {taskStates['notes-connections'].status === 'success' &&
                  taskStates['notes-connections'].results && (
                    <button
                      onClick={() => setResultsModal('notes-connections')}
                      className="mt-2 w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                    >
                      View Results / 查看结果
                    </button>
                  )}
              </div>

              {/* Summarize All */}
              <div className="rounded-xl border border-gray-200 p-4 transition-all hover:border-teal-200 hover:shadow-md">
                <div className="mb-3 flex items-center gap-2">
                  <div className="rounded-lg bg-teal-100 p-2">
                    <FolderPlus className="h-5 w-5 text-teal-600" />
                  </div>
                  <h4 className="font-medium text-gray-900">Summarize</h4>
                </div>
                <p className="mb-3 text-xs text-gray-500">
                  Generate a comprehensive summary of all notes
                </p>
                <button
                  onClick={handleSummarizeNotes}
                  disabled={taskStates['notes-summarize'].status === 'running'}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {taskStates['notes-summarize'].status === 'running' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Summarizing...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
                      Summarize
                    </>
                  )}
                </button>
                {taskStates['notes-summarize'].message && (
                  <div
                    className={`mt-2 flex items-center gap-1 text-xs ${
                      taskStates['notes-summarize'].status === 'error'
                        ? 'text-red-600'
                        : taskStates['notes-summarize'].status === 'success'
                          ? 'text-green-600'
                          : 'text-gray-500'
                    }`}
                  >
                    {getStatusIcon(taskStates['notes-summarize'].status)}
                    {taskStates['notes-summarize'].message}
                  </div>
                )}
                {taskStates['notes-summarize'].status === 'success' &&
                  taskStates['notes-summarize'].results && (
                    <button
                      onClick={() => setResultsModal('notes-summarize')}
                      className="mt-2 w-full rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-100"
                    >
                      View Results / 查看结果
                    </button>
                  )}
              </div>
            </div>
          )}

          {/* Action Cards - Images Tab */}
          {activeTab === 'images' && (
            <div className="grid grid-cols-3 gap-3">
              {/* Auto Tag Images */}
              <div className="rounded-xl border border-gray-200 p-4 transition-all hover:border-pink-200 hover:shadow-md">
                <div className="mb-3 flex items-center gap-2">
                  <div className="rounded-lg bg-pink-100 p-2">
                    <Tag className="h-5 w-5 text-pink-600" />
                  </div>
                  <h4 className="font-medium text-gray-900">Auto Tag</h4>
                </div>
                <p className="mb-3 text-xs text-gray-500">
                  AI detects content and generates relevant tags
                </p>
                <button
                  onClick={handleAutoTagImages}
                  disabled={taskStates['images-autotag'].status === 'running'}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-pink-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-pink-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {taskStates['images-autotag'].status === 'running' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Tagging...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
                      Tag Images
                    </>
                  )}
                </button>
                {taskStates['images-autotag'].message && (
                  <div
                    className={`mt-2 flex items-center gap-1 text-xs ${
                      taskStates['images-autotag'].status === 'error'
                        ? 'text-red-600'
                        : taskStates['images-autotag'].status === 'success'
                          ? 'text-green-600'
                          : 'text-gray-500'
                    }`}
                  >
                    {getStatusIcon(taskStates['images-autotag'].status)}
                    {taskStates['images-autotag'].message}
                  </div>
                )}
                {taskStates['images-autotag'].status === 'success' &&
                  taskStates['images-autotag'].results && (
                    <button
                      onClick={() => setResultsModal('images-autotag')}
                      className="mt-2 w-full rounded-lg border border-pink-200 bg-pink-50 px-3 py-1.5 text-xs font-medium text-pink-700 hover:bg-pink-100"
                    >
                      View Results / 查看结果
                    </button>
                  )}
              </div>

              {/* Style Analysis */}
              <div className="rounded-xl border border-gray-200 p-4 transition-all hover:border-rose-200 hover:shadow-md">
                <div className="mb-3 flex items-center gap-2">
                  <div className="rounded-lg bg-rose-100 p-2">
                    <Sparkles className="h-5 w-5 text-rose-600" />
                  </div>
                  <h4 className="font-medium text-gray-900">Style Analysis</h4>
                </div>
                <p className="mb-3 text-xs text-gray-500">
                  Identify art styles, color palettes, and themes
                </p>
                <button
                  onClick={handleAnalyzeStyles}
                  disabled={taskStates['images-style'].status === 'running'}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-rose-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {taskStates['images-style'].status === 'running' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
                      Analyze
                    </>
                  )}
                </button>
                {taskStates['images-style'].message && (
                  <div
                    className={`mt-2 flex items-center gap-1 text-xs ${
                      taskStates['images-style'].status === 'error'
                        ? 'text-red-600'
                        : taskStates['images-style'].status === 'success'
                          ? 'text-green-600'
                          : 'text-gray-500'
                    }`}
                  >
                    {getStatusIcon(taskStates['images-style'].status)}
                    {taskStates['images-style'].message}
                  </div>
                )}
                {taskStates['images-style'].status === 'success' &&
                  taskStates['images-style'].results && (
                    <button
                      onClick={() => setResultsModal('images-style')}
                      className="mt-2 w-full rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
                    >
                      View Results / 查看结果
                    </button>
                  )}
              </div>

              {/* Visual Clusters */}
              <div className="rounded-xl border border-gray-200 p-4 transition-all hover:border-fuchsia-200 hover:shadow-md">
                <div className="mb-3 flex items-center gap-2">
                  <div className="rounded-lg bg-fuchsia-100 p-2">
                    <Link2 className="h-5 w-5 text-fuchsia-600" />
                  </div>
                  <h4 className="font-medium text-gray-900">Visual Themes</h4>
                </div>
                <p className="mb-3 text-xs text-gray-500">
                  Group images by visual similarity and themes
                </p>
                <button
                  onClick={handleClusterVisualThemes}
                  disabled={taskStates['images-cluster'].status === 'running'}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-fuchsia-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-fuchsia-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {taskStates['images-cluster'].status === 'running' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Clustering...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
                      Cluster
                    </>
                  )}
                </button>
                {taskStates['images-cluster'].message && (
                  <div
                    className={`mt-2 flex items-center gap-1 text-xs ${
                      taskStates['images-cluster'].status === 'error'
                        ? 'text-red-600'
                        : taskStates['images-cluster'].status === 'success'
                          ? 'text-green-600'
                          : 'text-gray-500'
                    }`}
                  >
                    {getStatusIcon(taskStates['images-cluster'].status)}
                    {taskStates['images-cluster'].message}
                  </div>
                )}
                {taskStates['images-cluster'].status === 'success' &&
                  taskStates['images-cluster'].results && (
                    <button
                      onClick={() => setResultsModal('images-cluster')}
                      className="mt-2 w-full rounded-lg border border-fuchsia-200 bg-fuchsia-50 px-3 py-1.5 text-xs font-medium text-fuchsia-700 hover:bg-fuchsia-100"
                    >
                      View Results / 查看结果
                    </button>
                  )}
              </div>
            </div>
          )}

          {/* Action Cards - Notion Tab */}
          {activeTab === 'notion' && (
            <div className="grid grid-cols-3 gap-3">
              {/* Sync Pages */}
              <div className="rounded-xl border border-gray-200 p-4 transition-all hover:border-gray-300 hover:shadow-md">
                <div className="mb-3 flex items-center gap-2">
                  <div className="rounded-lg bg-gray-100 p-2">
                    <svg
                      className="h-5 w-5 text-gray-600"
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
                  </div>
                  <h4 className="font-medium text-gray-900">Quick Sync</h4>
                </div>
                <p className="mb-3 text-xs text-gray-500">
                  Sync latest changes from your connected Notion workspace
                </p>
                <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-800 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700">
                  <Zap className="h-4 w-4" />
                  Sync Now
                </button>
              </div>

              {/* Extract Insights */}
              <div className="rounded-xl border border-gray-200 p-4 transition-all hover:border-blue-200 hover:shadow-md">
                <div className="mb-3 flex items-center gap-2">
                  <div className="rounded-lg bg-blue-100 p-2">
                    <Sparkles className="h-5 w-5 text-blue-600" />
                  </div>
                  <h4 className="font-medium text-gray-900">AI Insights</h4>
                </div>
                <p className="mb-3 text-xs text-gray-500">
                  Extract key insights and summaries from Notion pages
                </p>
                <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600">
                  <Zap className="h-4 w-4" />
                  Analyze
                </button>
              </div>

              {/* Link to Library */}
              <div className="rounded-xl border border-gray-200 p-4 transition-all hover:border-purple-200 hover:shadow-md">
                <div className="mb-3 flex items-center gap-2">
                  <div className="rounded-lg bg-purple-100 p-2">
                    <Link2 className="h-5 w-5 text-purple-600" />
                  </div>
                  <h4 className="font-medium text-gray-900">Smart Link</h4>
                </div>
                <p className="mb-3 text-xs text-gray-500">
                  Find and link related resources between Notion and Library
                </p>
                <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-purple-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-600">
                  <Zap className="h-4 w-4" />
                  Find Links
                </button>
              </div>
            </div>
          )}

          {/* Results Display - Only for Bookmarks */}
          {activeTab === 'bookmarks' && (
            <>
              {/* Results Display */}
              {taskStates['theme-cluster'].status === 'success' &&
                taskStates['theme-cluster'].results?.clusters &&
                taskStates['theme-cluster'].results.clusters.length > 0 && (
                  <div className="mt-4 rounded-lg border border-purple-100 bg-purple-50/50 p-4">
                    <h4 className="mb-2 font-medium text-purple-900">
                      Discovered Themes
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {taskStates['theme-cluster'].results.clusters.map(
                        (cluster, index: number) => (
                          <span
                            key={index}
                            className="rounded-full bg-purple-100 px-3 py-1 text-sm text-purple-700"
                          >
                            {cluster.name} ({cluster.count} items)
                          </span>
                        )
                      )}
                    </div>
                  </div>
                )}

              {taskStates['smart-classify'].status === 'success' &&
                taskStates['smart-classify'].results?.suggestions &&
                taskStates['smart-classify'].results.suggestions.length > 0 && (
                  <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/50 p-4">
                    <h4 className="mb-2 font-medium text-blue-900">
                      Classification Suggestions
                    </h4>
                    <div className="space-y-2">
                      {taskStates['smart-classify'].results.suggestions
                        .slice(0, 5)
                        .map((suggestion, index: number) => (
                          <div
                            key={index}
                            className="flex items-center justify-between rounded-lg bg-white p-2 text-sm"
                          >
                            <span className="truncate text-gray-700">
                              {suggestion.resourceTitle}
                            </span>
                            <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                              → {suggestion.suggestedCollection}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
            </>
          )}
        </div>
      )}

      {/* Results Modal - Bilingual Popup */}
      <Modal
        open={!!(resultsModal && taskStates[resultsModal]?.results)}
        onClose={() => setResultsModal(null)}
        size="lg"
        title={
          resultsModal === 'notes-keypoints'
            ? 'Key Points / 关键要点'
            : resultsModal === 'notes-connections'
              ? 'Connections / 笔记关联'
              : resultsModal === 'notes-summarize'
                ? 'Summary / 总结摘要'
                : resultsModal === 'images-autotag'
                  ? 'Auto Tags / 自动标签'
                  : resultsModal === 'images-style'
                    ? 'Style Analysis / 风格分析'
                    : resultsModal === 'images-cluster'
                      ? 'Visual Themes / 视觉主题'
                      : ''
        }
        subtitle={
          resultsModal === 'notes-keypoints'
            ? 'Key insights extracted from your notes / 从笔记中提取的关键见解'
            : resultsModal === 'notes-connections'
              ? 'Hidden connections between notes / 笔记之间的隐藏关联'
              : resultsModal === 'notes-summarize'
                ? 'Comprehensive summary of all notes / 所有笔记的综合总结'
                : resultsModal === 'images-autotag'
                  ? 'AI-generated tags for your images / AI为图片生成的标签'
                  : resultsModal === 'images-style'
                    ? 'Art styles and themes detected / 检测到的艺术风格和主题'
                    : resultsModal === 'images-cluster'
                      ? 'Images grouped by visual similarity / 按视觉相似度分组的图片'
                      : undefined
        }
        footer={
          <button
            onClick={() => setResultsModal(null)}
            className="w-full rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Close / 关闭
          </button>
        }
      >
        {resultsModal && (
          <div>
            {/* Notes Key Points */}
            {resultsModal === 'notes-keypoints' && (
              <div className="space-y-4">
                {taskStates[resultsModal].results?.keyPoints &&
                taskStates[resultsModal].results.keyPoints.length > 0 ? (
                  taskStates[resultsModal].results.keyPoints.map(
                    (point: KeyPoint | string, index: number) => {
                      const pointText =
                        typeof point === 'string'
                          ? point
                          : point.insight || point.title || point.point || '';
                      const source =
                        typeof point === 'object' ? point.source : undefined;

                      return (
                        <div
                          key={index}
                          className="rounded-lg border border-green-100 bg-green-50 p-4"
                        >
                          <div className="mb-2 flex items-start gap-2">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-white">
                              {index + 1}
                            </span>
                            <div className="flex-1">
                              <p className="font-medium text-green-900">
                                {pointText}
                              </p>
                              {source && (
                                <p className="mt-1 text-xs text-green-600">
                                  Source / 来源: {source}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }
                  )
                ) : (
                  <p className="text-center text-gray-500">
                    No key points found / 未找到关键要点
                  </p>
                )}
              </div>
            )}

            {/* Notes Connections */}
            {resultsModal === 'notes-connections' && (
              <div className="space-y-4">
                {taskStates[resultsModal].results?.connections &&
                taskStates[resultsModal].results.connections.length > 0 ? (
                  taskStates[resultsModal].results.connections.map(
                    (conn: Connection, index: number) => {
                      // 优先使用带标题的字段，fallback到ID
                      const note1Display =
                        conn.note1Title ||
                        conn.noteIds?.[0] ||
                        conn.note1 ||
                        conn.from ||
                        'Unknown';
                      const note2Display =
                        conn.note2Title ||
                        conn.noteIds?.[1] ||
                        conn.note2 ||
                        conn.to ||
                        'Unknown';
                      const relationship =
                        conn.relationship || conn.reason || conn.description;
                      const theme = conn.theme;
                      const strength = conn.strength;

                      return (
                        <div
                          key={index}
                          className="rounded-lg border border-emerald-100 bg-emerald-50 p-4"
                        >
                          <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Link2 className="h-4 w-4 text-emerald-600" />
                              <span className="font-medium text-emerald-900">
                                Connection #{index + 1}
                              </span>
                            </div>
                            {strength && (
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                  strength === 'strong'
                                    ? 'bg-emerald-200 text-emerald-800'
                                    : strength === 'moderate'
                                      ? 'bg-yellow-200 text-yellow-800'
                                      : 'bg-gray-200 text-gray-600'
                                }`}
                              >
                                {strength === 'strong'
                                  ? 'Strong / 强'
                                  : strength === 'moderate'
                                    ? 'Moderate / 中'
                                    : 'Weak / 弱'}
                              </span>
                            )}
                          </div>

                          {/* 关联描述 */}
                          {relationship && (
                            <p className="mb-3 text-sm leading-relaxed text-emerald-800">
                              {relationship}
                            </p>
                          )}

                          {/* 主题标签 */}
                          {theme && (
                            <div className="mb-3">
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-800">
                                <span className="text-emerald-600">#</span>
                                {theme}
                              </span>
                            </div>
                          )}

                          {/* 关联的笔记 */}
                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-lg bg-white p-2.5 shadow-sm">
                              <p className="mb-1 text-xs text-gray-400">
                                Note 1
                              </p>
                              <p className="line-clamp-2 text-sm font-medium text-gray-700">
                                {note1Display}
                              </p>
                            </div>
                            <div className="rounded-lg bg-white p-2.5 shadow-sm">
                              <p className="mb-1 text-xs text-gray-400">
                                Note 2
                              </p>
                              <p className="line-clamp-2 text-sm font-medium text-gray-700">
                                {note2Display}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    }
                  )
                ) : (
                  <p className="text-center text-gray-500">
                    No connections found / 未找到关联
                  </p>
                )}
              </div>
            )}

            {/* Notes Summary */}
            {resultsModal === 'notes-summarize' && (
              <div className="space-y-4">
                {taskStates[resultsModal].results?.summary ? (
                  <div className="rounded-lg border border-teal-100 bg-teal-50 p-4">
                    <p className="whitespace-pre-wrap leading-relaxed text-teal-900">
                      {taskStates[resultsModal].results.summary}
                    </p>
                    {taskStates[resultsModal].results.topics &&
                      Array.isArray(taskStates[resultsModal].results.topics) &&
                      taskStates[resultsModal].results.topics.length > 0 && (
                        <div className="mt-4 border-t border-teal-200 pt-3">
                          <p className="mb-2 text-xs font-medium text-teal-700">
                            Main Topics / 主要主题:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {taskStates[resultsModal].results.topics.map(
                              (topic: string, i: number) => (
                                <span
                                  key={i}
                                  className="rounded-full bg-teal-200 px-3 py-1 text-xs text-teal-800"
                                >
                                  {topic}
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      )}
                  </div>
                ) : (
                  <p className="text-center text-gray-500">
                    No summary generated / 未生成摘要
                  </p>
                )}
              </div>
            )}

            {/* Images Auto Tag */}
            {resultsModal === 'images-autotag' && (
              <div className="space-y-4">
                {taskStates[resultsModal].results?.images &&
                taskStates[resultsModal].results.images.length > 0 ? (
                  taskStates[resultsModal].results.images.map(
                    (img: ImageTag, index: number) => (
                      <div
                        key={index}
                        className="rounded-lg border border-pink-100 bg-pink-50 p-4"
                      >
                        <p className="mb-2 truncate font-medium text-pink-900">
                          {img.prompt?.substring(0, 50) ||
                            img.title ||
                            `Image #${index + 1}`}
                          ...
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {(img.tags || []).map((tag: string, i: number) => (
                            <span
                              key={i}
                              className="rounded-full bg-pink-200 px-2.5 py-0.5 text-xs font-medium text-pink-800"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )
                  )
                ) : (
                  <p className="text-center text-gray-500">
                    No images tagged / 未标记图片
                  </p>
                )}
              </div>
            )}

            {/* Images Style Analysis */}
            {resultsModal === 'images-style' && (
              <div className="space-y-4">
                {taskStates[resultsModal].results?.styles &&
                taskStates[resultsModal].results.styles.length > 0 ? (
                  taskStates[resultsModal].results.styles.map(
                    (style: Style, index: number) => (
                      <div
                        key={index}
                        className="rounded-lg border border-rose-100 bg-rose-50 p-4"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="font-medium text-rose-900">
                            {style.name || style.style || `Style ${index + 1}`}
                          </span>
                          <span className="rounded-full bg-rose-200 px-2 py-0.5 text-xs text-rose-800">
                            {style.count || 0} images / 张图片
                          </span>
                        </div>
                        {style.description && (
                          <p className="text-sm text-rose-700">
                            {style.description}
                          </p>
                        )}
                        {style.colors && (
                          <div className="mt-2 flex gap-1">
                            {style.colors.map((color: string, i: number) => (
                              <div
                                key={i}
                                className="h-6 w-6 rounded-full border border-white shadow-sm"
                                style={{ backgroundColor: color }}
                                title={color}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  )
                ) : (
                  <p className="text-center text-gray-500">
                    No styles identified / 未识别到风格
                  </p>
                )}
              </div>
            )}

            {/* Images Visual Clusters */}
            {resultsModal === 'images-cluster' && (
              <div className="space-y-4">
                {taskStates[resultsModal].results?.clusters &&
                taskStates[resultsModal].results.clusters.length > 0 ? (
                  taskStates[resultsModal].results.clusters.map(
                    (cluster: Cluster, index: number) => (
                      <div
                        key={index}
                        className="rounded-lg border border-fuchsia-100 bg-fuchsia-50 p-4"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="font-medium text-fuchsia-900">
                            {cluster.theme ||
                              cluster.name ||
                              `Theme ${index + 1}`}
                          </span>
                          <span className="rounded-full bg-fuchsia-200 px-2 py-0.5 text-xs text-fuchsia-800">
                            {cluster.count || cluster.images?.length || 0}{' '}
                            images / 张图片
                          </span>
                        </div>
                        {cluster.description && (
                          <p className="text-sm text-fuchsia-700">
                            {cluster.description}
                          </p>
                        )}
                        {cluster.keywords && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {cluster.keywords.map((kw: string, i: number) => (
                              <span
                                key={i}
                                className="rounded bg-fuchsia-200/50 px-1.5 py-0.5 text-xs text-fuchsia-700"
                              >
                                {kw}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  )
                ) : (
                  <p className="text-center text-gray-500">
                    No visual themes found / 未找到视觉主题
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
