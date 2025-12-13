'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Database,
  XCircle,
  Pause,
  Play,
  Download,
  Zap,
} from 'lucide-react';
import {
  getCollectionTask,
  CollectionTask,
  pauseTask,
  resumeTask,
  executeTask,
} from '@/lib/api/data-collection';

interface TaskStats {
  total: number;
  success: number;
  failed: number;
  duplicates: number;
}

function BatchMonitorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const taskIds = searchParams.get('tasks')?.split(',') || [];
  const categoryName = searchParams.get('category') || 'Batch Collection';

  const [tasks, setTasks] = useState<Map<string, CollectionTask>>(new Map());
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<
    'all' | 'running' | 'completed' | 'failed'
  >('all');
  const [loading, setLoading] = useState(true);
  const [startTime] = useState(new Date());

  // Fetch all tasks
  const fetchTasks = async () => {
    try {
      const taskPromises = taskIds.map((id) => getCollectionTask(id));
      const responses = await Promise.allSettled(taskPromises);

      const newTasks = new Map<string, CollectionTask>();
      responses.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          newTasks.set(taskIds[index], result.value.data);
        }
      });

      setTasks(newTasks);
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
      setLoading(false);
    }
  };

  // Auto-expand failed tasks
  useEffect(() => {
    const failedTaskIds = Array.from(tasks.entries())
      .filter(([_, task]) => task.status === 'FAILED')
      .map(([id]) => id);

    setExpandedTasks((prev) => {
      const next = new Set(prev);
      failedTaskIds.forEach((id) => next.add(id));
      return next;
    });
  }, [tasks]);

  // Poll for updates
  useEffect(() => {
    fetchTasks();

    const interval = setInterval(() => {
      const hasRunningTasks = Array.from(tasks.values()).some(
        (task) => task.status === 'RUNNING' || task.status === 'PENDING'
      );

      if (hasRunningTasks || tasks.size === 0) {
        fetchTasks();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [taskIds.join(',')]);

  // Calculate aggregate stats
  const aggregateStats: TaskStats = {
    total: 0,
    success: 0,
    failed: 0,
    duplicates: 0,
  };

  const statusCounts = {
    running: 0,
    completed: 0,
    failed: 0,
    pending: 0,
  };

  tasks.forEach((task) => {
    aggregateStats.total += task.totalItems || 0;
    aggregateStats.success += task.successItems || 0;
    aggregateStats.failed += task.failedItems || 0;
    aggregateStats.duplicates += task.duplicateItems || 0;

    if (task.status === 'RUNNING') statusCounts.running++;
    else if (task.status === 'COMPLETED') statusCounts.completed++;
    else if (task.status === 'FAILED') statusCounts.failed++;
    else if (task.status === 'PENDING') statusCounts.pending++;
  });

  // Calculate overall progress
  const totalProgress =
    tasks.size > 0
      ? Array.from(tasks.values()).reduce(
          (sum, task) => sum + task.progress,
          0
        ) / tasks.size
      : 0;

  // Filter tasks
  const filteredTasks = Array.from(tasks.entries())
    .filter(([_, task]) => {
      if (filter === 'running') return task.status === 'RUNNING';
      if (filter === 'completed') return task.status === 'COMPLETED';
      if (filter === 'failed') return task.status === 'FAILED';
      return true;
    })
    .sort(([_, a], [__, b]) => {
      // Sort: FAILED > RUNNING > PENDING > COMPLETED > CANCELLED
      const priority: Record<string, number> = {
        FAILED: 0,
        RUNNING: 1,
        PENDING: 2,
        COMPLETED: 3,
        CANCELLED: 4,
      };
      return (priority[a.status] || 999) - (priority[b.status] || 999);
    });

  const toggleExpand = (taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const handlePauseAll = async () => {
    const runningTasks = Array.from(tasks.entries())
      .filter(([_, task]) => task.status === 'RUNNING')
      .map(([id]) => id);

    await Promise.all(runningTasks.map((id) => pauseTask(id)));
    await fetchTasks();
  };

  const handleResumeAll = async () => {
    const pausedTasks = Array.from(tasks.entries())
      .filter(([_, task]) => task.status === 'PENDING')
      .map(([id]) => id);

    await Promise.all(pausedTasks.map((id) => resumeTask(id)));
    await fetchTasks();
  };

  const handleRunAll = async () => {
    const nonRunningTasks = Array.from(tasks.entries())
      .filter(([_, task]) => task.status !== 'RUNNING')
      .map(([id]) => id);

    try {
      await Promise.all(nonRunningTasks.map((id) => executeTask(id)));
      await fetchTasks();
    } catch (error) {
      console.error('Failed to execute tasks:', error);
    }
  };

  const formatTime = (date?: string) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleTimeString();
  };

  const formatDuration = (start?: string, end?: string) => {
    if (!start) return 'N/A';
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const seconds = Math.floor((endTime - startTime) / 1000);

    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'RUNNING':
        return <Activity className="h-4 w-4 animate-pulse text-blue-600" />;
      case 'COMPLETED':
        return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
      case 'FAILED':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'PENDING':
        return <Clock className="h-4 w-4 text-gray-600" />;
      default:
        return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RUNNING':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'COMPLETED':
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'FAILED':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'PENDING':
        return 'bg-gray-100 text-gray-700 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  if (loading && tasks.size === 0) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <Activity className="mx-auto h-12 w-12 animate-spin text-blue-600" />
          <p className="mt-4 text-lg text-gray-600">
            Loading batch collection monitor...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/data-collection/config')}
                className="rounded-lg p-2 hover:bg-gray-100"
              >
                <ArrowLeft className="h-5 w-5 text-gray-600" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {categoryName} - 批量采集监控
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                  Started: {startTime.toLocaleString()} • {tasks.size} tasks
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 animate-pulse text-green-500" />
              <span className="text-sm font-medium text-gray-700">Live</span>
            </div>
          </div>

          {/* Overall Progress */}
          <div className="mt-6 rounded-xl border border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50 p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center justify-between text-sm font-medium text-gray-700">
                  <span>Overall Progress</span>
                  <span>{Math.round(totalProgress)}%</span>
                </div>
                <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                    style={{ width: `${totalProgress}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center gap-4 text-sm text-gray-600">
                  <span>{statusCounts.running} Running</span>
                  <span>•</span>
                  <span>{statusCounts.completed} Completed</span>
                  <span>•</span>
                  <span>{statusCounts.pending} Pending</span>
                  {statusCounts.failed > 0 && (
                    <>
                      <span>•</span>
                      <span className="font-medium text-red-600">
                        {statusCounts.failed} Failed
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="mt-6 grid grid-cols-4 gap-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Collected</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    {aggregateStats.total.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg bg-blue-100 p-3">
                  <Database className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Success</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-600">
                    {aggregateStats.success.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg bg-emerald-100 p-3">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Duplicates</p>
                  <p className="mt-1 text-2xl font-bold text-orange-600">
                    {aggregateStats.duplicates.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg bg-orange-100 p-3">
                  <Zap className="h-6 w-6 text-orange-600" />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Failed</p>
                  <p className="mt-1 text-2xl font-bold text-red-600">
                    {aggregateStats.failed.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg bg-red-100 p-3">
                  <XCircle className="h-6 w-6 text-red-600" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Task List */}
      <div className="mx-auto max-w-7xl px-6 py-6">
        {/* Filters */}
        <div className="mb-4 flex items-center gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            All ({tasks.size})
          </button>
          <button
            onClick={() => setFilter('running')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              filter === 'running'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            Running ({statusCounts.running})
          </button>
          <button
            onClick={() => setFilter('completed')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              filter === 'completed'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            Completed ({statusCounts.completed})
          </button>
          <button
            onClick={() => setFilter('failed')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              filter === 'failed'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            Failed ({statusCounts.failed})
          </button>
        </div>

        {/* Task Cards */}
        <div className="space-y-3">
          {filteredTasks.map(([taskId, task]) => {
            const isExpanded = expandedTasks.has(taskId);

            return (
              <div
                key={taskId}
                className={`rounded-xl border-2 bg-white shadow-sm transition ${
                  task.status === 'FAILED'
                    ? 'border-red-300'
                    : 'border-gray-200'
                }`}
              >
                {/* Task Header */}
                <div className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex flex-1 items-start gap-3">
                      <div className="mt-1">{getStatusIcon(task.status)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900">
                            {task.source?.name || 'Unknown Source'}
                          </h3>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${getStatusColor(task.status)}`}
                          >
                            {task.status}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-gray-600">
                          {task.description || task.name}
                        </p>

                        {/* Progress */}
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-xs text-gray-600">
                            <span>
                              Progress: {task.processedItems}/
                              {task.totalItems || '?'} items
                            </span>
                            <span className="font-medium">
                              {Math.round(task.progress)}%
                            </span>
                          </div>
                          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                            <div
                              className={`h-full transition-all duration-500 ${
                                task.status === 'COMPLETED'
                                  ? 'bg-emerald-500'
                                  : task.status === 'FAILED'
                                    ? 'bg-red-500'
                                    : 'bg-blue-500'
                              }`}
                              style={{ width: `${task.progress}%` }}
                            />
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="mt-3 flex items-center gap-4 text-sm">
                          <span className="flex items-center gap-1 text-emerald-600">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {task.successItems} Success
                          </span>
                          {task.failedItems > 0 && (
                            <span className="flex items-center gap-1 text-red-600">
                              <XCircle className="h-3.5 w-3.5" />
                              {task.failedItems} Failed
                            </span>
                          )}
                          {task.duplicateItems > 0 && (
                            <span className="flex items-center gap-1 text-orange-600">
                              <Zap className="h-3.5 w-3.5" />
                              {task.duplicateItems} Duplicates
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-gray-500">
                            <Clock className="h-3.5 w-3.5" />
                            {formatDuration(task.startedAt, task.completedAt)}
                          </span>
                        </div>

                        {/* Current Status Message */}
                        {task.status === 'RUNNING' && (
                          <div className="mt-2 text-sm text-blue-700">
                            ⚡ Collecting data... [{formatTime(task.startedAt)}]
                          </div>
                        )}
                        {task.status === 'COMPLETED' && (
                          <div className="mt-2 text-sm text-emerald-700">
                            ✓ Completed in{' '}
                            {formatDuration(task.startedAt, task.completedAt)} [
                            {formatTime(task.completedAt)}]
                          </div>
                        )}
                        {task.status === 'FAILED' && task.errorMessage && (
                          <div className="mt-2 text-sm text-red-700">
                            ❌ Error: {task.errorMessage} [
                            {formatTime(task.updatedAt)}]
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Expand Button */}
                    <button
                      onClick={() => toggleExpand(taskId)}
                      className="ml-4 rounded-lg p-2 hover:bg-gray-100"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5 text-gray-600" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-gray-600" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50 p-5">
                    <h4 className="mb-3 text-sm font-semibold text-gray-900">
                      Task Details
                    </h4>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Task ID:</span>
                        <span className="ml-2 font-mono text-gray-900">
                          {task.id.slice(0, 8)}...
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Type:</span>
                        <span className="ml-2 text-gray-900">
                          {String(task.config?.type || 'N/A')}
                        </span>
                      </div>
                      {task.startedAt && (
                        <div>
                          <span className="text-gray-500">Started At:</span>
                          <span className="ml-2 text-gray-900">
                            {new Date(task.startedAt).toLocaleString()}
                          </span>
                        </div>
                      )}
                      {task.completedAt && (
                        <div>
                          <span className="text-gray-500">Completed At:</span>
                          <span className="ml-2 text-gray-900">
                            {new Date(task.completedAt).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Error Details */}
                    {task.status === 'FAILED' && task.errorMessage && (
                      <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
                          <div className="flex-1">
                            <div className="font-medium text-red-900">
                              Error Details
                            </div>
                            <div className="mt-1 text-sm text-red-800">
                              {task.errorMessage}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {filteredTasks.length === 0 && (
          <div className="py-12 text-center">
            <Database className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-4 text-sm text-gray-500">
              No tasks found for the selected filter
            </p>
          </div>
        )}
      </div>

      {/* Bottom Actions */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleRunAll}
              disabled={tasks.size === 0 || statusCounts.running === tasks.size}
              className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Zap className="-mt-0.5 mr-1.5 inline h-4 w-4" />
              Run All
            </button>
            <button
              onClick={handlePauseAll}
              disabled={statusCounts.running === 0}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Pause className="-mt-0.5 mr-1.5 inline h-4 w-4" />
              Pause All
            </button>
            <button
              onClick={handleResumeAll}
              disabled={statusCounts.pending === 0}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play className="-mt-0.5 mr-1.5 inline h-4 w-4" />
              Resume All
            </button>
          </div>

          <button
            onClick={() => router.push('/data-collection/config')}
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Close & Background
          </button>
        </div>
      </div>

      {/* Spacing for fixed bottom bar */}
      <div className="h-20" />
    </div>
  );
}

export default function BatchMonitorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <div className="text-center">
            <Activity className="mx-auto h-12 w-12 animate-spin text-blue-600" />
            <p className="mt-4 text-lg text-gray-600">
              Loading batch collection monitor...
            </p>
          </div>
        </div>
      }
    >
      <BatchMonitorContent />
    </Suspense>
  );
}
