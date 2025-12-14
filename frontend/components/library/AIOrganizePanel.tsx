'use client';

import { useState, useEffect } from 'react';
import {
  Sparkles,
  Tag,
  FolderPlus,
  Link2,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle,
  AlertCircle,
  Zap,
} from 'lucide-react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';

interface Collection {
  id: string;
  name: string;
  itemCount?: number;
}

interface AIOrganizePanelProps {
  collections: Collection[];
  onRefresh: () => void;
}

type TaskType = 'batch-tags' | 'smart-classify' | 'theme-cluster';
type TaskStatus = 'idle' | 'running' | 'success' | 'error';

interface TaskState {
  status: TaskStatus;
  message: string;
  progress?: number;
  results?: any;
}

export default function AIOrganizePanel({
  collections,
  onRefresh,
}: AIOrganizePanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [stats, setStats] = useState({
    untaggedCount: 0,
    unclassifiedCount: 0,
    totalCount: 0,
  });
  const [taskStates, setTaskStates] = useState<Record<TaskType, TaskState>>({
    'batch-tags': { status: 'idle', message: '' },
    'smart-classify': { status: 'idle', message: '' },
    'theme-cluster': { status: 'idle', message: '' },
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
        const data = await response.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
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

      const result = await response.json();
      updateTaskState('batch-tags', {
        status: 'success',
        message: `Successfully tagged ${result.taggedCount} resources`,
        results: result,
      });
      onRefresh();
    } catch (err: any) {
      updateTaskState('batch-tags', {
        status: 'error',
        message: err.message || 'Failed to generate tags',
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

      const result = await response.json();
      updateTaskState('smart-classify', {
        status: 'success',
        message: `Suggested ${result.suggestions?.length || 0} classifications`,
        results: result,
      });
      onRefresh();
    } catch (err: any) {
      updateTaskState('smart-classify', {
        status: 'error',
        message: err.message || 'Failed to classify',
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

      const result = await response.json();
      updateTaskState('theme-cluster', {
        status: 'success',
        message: `Found ${result.clusters?.length || 0} theme clusters`,
        results: result,
      });
    } catch (err: any) {
      updateTaskState('theme-cluster', {
        status: 'error',
        message: err.message || 'Failed to analyze themes',
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
              Smart tagging, classification, and theme discovery
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
          {/* Stats Bar */}
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

          {/* Collection Selector */}
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

          {/* Action Cards */}
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

          {/* Results Display */}
          {taskStates['theme-cluster'].status === 'success' &&
            taskStates['theme-cluster'].results?.clusters?.length > 0 && (
              <div className="mt-4 rounded-lg border border-purple-100 bg-purple-50/50 p-4">
                <h4 className="mb-2 font-medium text-purple-900">
                  Discovered Themes
                </h4>
                <div className="flex flex-wrap gap-2">
                  {taskStates['theme-cluster'].results.clusters.map(
                    (cluster: any, index: number) => (
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
            taskStates['smart-classify'].results?.suggestions?.length > 0 && (
              <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/50 p-4">
                <h4 className="mb-2 font-medium text-blue-900">
                  Classification Suggestions
                </h4>
                <div className="space-y-2">
                  {taskStates['smart-classify'].results.suggestions
                    .slice(0, 5)
                    .map((suggestion: any, index: number) => (
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
        </div>
      )}
    </div>
  );
}
