'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Eye,
  ClipboardList,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import {
  WritingMission,
  WritingTask,
  WritingTaskStatus,
} from './WritingCanvasView';

interface WritingMissionPanelProps {
  mission: WritingMission | null;
  onRetry?: () => void;
  onCancel?: () => void;
}

// 状态图标映射
function getStatusIcon(status: WritingTaskStatus) {
  switch (status) {
    case 'PENDING':
      return <Clock className="h-4 w-4 text-gray-400" />;
    case 'IN_PROGRESS':
      return <RefreshCw className="h-4 w-4 text-blue-500" />;
    case 'COMPLETED':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'FAILED':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'REVIEWING':
      return <Eye className="h-4 w-4 text-purple-500" />;
  }
}

// 状态颜色映射
const statusColors: Record<WritingTaskStatus, string> = {
  PENDING: 'bg-gray-100 text-gray-600',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
  REVIEWING: 'bg-purple-100 text-purple-700',
};

export default function WritingMissionPanel({
  mission,
  onRetry,
  onCancel,
}: WritingMissionPanelProps) {
  const { t } = useI18n();
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  if (!mission) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-center">
        <ClipboardList className="mb-3 h-10 w-10 text-gray-300" />
        <p className="text-sm text-gray-500">
          {t('aiWriting.missionPanel.selectOrCreate')}
        </p>
      </div>
    );
  }

  const toggleTask = (taskId: string) => {
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

  // 按状态分组任务
  const tasksByStatus = mission.tasks.reduce(
    (acc, task) => {
      if (!acc[task.status]) {
        acc[task.status] = [];
      }
      acc[task.status].push(task);
      return acc;
    },
    {} as Record<WritingTaskStatus, WritingTask[]>
  );

  // 计算统计信息
  const completedCount = tasksByStatus['COMPLETED']?.length || 0;
  const inProgressCount = tasksByStatus['IN_PROGRESS']?.length || 0;
  const failedCount = tasksByStatus['FAILED']?.length || 0;
  const totalCount = mission.tasks.length;

  return (
    <div className="flex h-full flex-col">
      {/* 头部 */}
      <div className="border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">
            {t('aiWriting.missionPanel.taskProgress')}
          </h3>
          <div className="flex gap-2">
            {mission.status === 'FAILED' && onRetry && (
              <button
                onClick={onRetry}
                className="rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-600 hover:bg-blue-100"
              >
                {t('aiWriting.missionPanel.retry')}
              </button>
            )}
            {mission.status === 'IN_PROGRESS' && onCancel && (
              <button
                onClick={onCancel}
                className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100"
              >
                {t('aiWriting.missionPanel.cancel')}
              </button>
            )}
          </div>
        </div>

        {/* 进度统计 */}
        <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1 text-green-600">
            <CheckCircle2 className="h-3 w-3" /> {completedCount}
          </span>
          <span className="flex items-center gap-1 text-blue-600">
            <RefreshCw className="h-3 w-3" /> {inProgressCount}
          </span>
          {failedCount > 0 && (
            <span className="flex items-center gap-1 text-red-600">
              <XCircle className="h-3 w-3" /> {failedCount}
            </span>
          )}
          <span className="text-gray-400">
            {t('aiWriting.missionPanel.totalTasks', { count: totalCount })}
          </span>
        </div>

        {/* 总进度条 */}
        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full transition-all duration-500 ${
                mission.status === 'FAILED'
                  ? 'bg-red-500'
                  : mission.status === 'COMPLETED'
                    ? 'bg-green-500'
                    : 'bg-blue-500'
              }`}
              style={{ width: `${mission.progress}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-xs text-gray-400">
            <span>
              {mission.wordCount.toLocaleString()} /{' '}
              {mission.targetWordCount.toLocaleString()}{' '}
              {t('aiWriting.missionPanel.words')}
            </span>
            <span>{Math.round(mission.progress)}%</span>
          </div>
        </div>
      </div>

      {/* 任务列表 */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-2 p-3">
          {/* 进行中的任务 */}
          {tasksByStatus['IN_PROGRESS']?.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              isExpanded={expandedTasks.has(task.id)}
              onToggle={() => toggleTask(task.id)}
            />
          ))}

          {/* 待处理的任务 */}
          {tasksByStatus['PENDING']?.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              isExpanded={expandedTasks.has(task.id)}
              onToggle={() => toggleTask(task.id)}
            />
          ))}

          {/* 审核中的任务 */}
          {tasksByStatus['REVIEWING']?.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              isExpanded={expandedTasks.has(task.id)}
              onToggle={() => toggleTask(task.id)}
            />
          ))}

          {/* 已完成的任务 */}
          {tasksByStatus['COMPLETED']?.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              isExpanded={expandedTasks.has(task.id)}
              onToggle={() => toggleTask(task.id)}
            />
          ))}

          {/* 失败的任务 */}
          {tasksByStatus['FAILED']?.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              isExpanded={expandedTasks.has(task.id)}
              onToggle={() => toggleTask(task.id)}
            />
          ))}
        </div>
      </div>

      {/* 底部状态 */}
      <div className="border-t border-gray-200 px-4 py-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">
            {t('aiWriting.missionPanel.phaseLabel')}:{' '}
            {mission.phase === 'executing'
              ? t('aiWriting.missionPanel.phase.executing')
              : mission.phase === 'reviewing'
                ? t('aiWriting.missionPanel.phase.reviewing')
                : mission.phase === 'completed'
                  ? t('aiWriting.missionPanel.phase.completed')
                  : mission.phase}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 ${
              mission.status === 'COMPLETED'
                ? 'bg-green-100 text-green-700'
                : mission.status === 'FAILED'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-blue-100 text-blue-700'
            }`}
          >
            {mission.status === 'IN_PROGRESS'
              ? t('aiWriting.missionPanel.statusLabels.inProgress')
              : mission.status === 'COMPLETED'
                ? t('aiWriting.missionPanel.phase.completed')
                : mission.status === 'FAILED'
                  ? t('aiWriting.missionPanel.statusLabels.failed')
                  : mission.status}
          </span>
        </div>
      </div>
    </div>
  );
}

// 任务项组件
function TaskItem({
  task,
  isExpanded,
  onToggle,
}: {
  task: WritingTask;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`rounded-lg border ${
        task.status === 'IN_PROGRESS'
          ? 'border-blue-200 bg-blue-50/50'
          : task.status === 'COMPLETED'
            ? 'border-green-200 bg-green-50/50'
            : task.status === 'FAILED'
              ? 'border-red-200 bg-red-50/50'
              : 'border-gray-200 bg-white'
      }`}
    >
      <button className="w-full px-3 py-2 text-left" onClick={onToggle}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon(task.status)}
            <span className="text-sm font-medium text-gray-800">
              {task.name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${statusColors[task.status]}`}
            >
              {task.progress}%
            </span>
            <span className="text-xs text-gray-400">
              {isExpanded ? '▲' : '▼'}
            </span>
          </div>
        </div>

        {/* 进度条 */}
        {task.status === 'IN_PROGRESS' && (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-blue-200">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${task.progress}%` }}
            />
          </div>
        )}
      </button>

      {/* 展开的详情 */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-600">
          <p>{task.description}</p>
          {task.result && (
            <div className="mt-2 max-h-32 overflow-y-auto rounded bg-gray-50 p-2 text-gray-500">
              <pre className="whitespace-pre-wrap">
                {task.result.slice(0, 500)}...
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
