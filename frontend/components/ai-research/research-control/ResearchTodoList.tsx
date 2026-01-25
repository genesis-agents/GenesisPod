/**
 * ResearchTodoList Component
 *
 * 研究任务列表组件 - 单一扁平表格形式
 * v2.0: 移除分组折叠，使用单一表格显示所有任务
 */

'use client';

import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  Pause,
  Play,
  X,
  RotateCcw,
  Link2,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import {
  ResearchTodo,
  ResearchTodoStatus,
  ResearchTodoType,
  TodoSummary,
} from '@/types/topic-research';
import { logger } from '@/lib/utils/logger';
import {
  pauseTodo,
  resumeTodo,
  cancelTodo,
  retryTodo,
  executeTodo,
} from '@/lib/api/topic-research';

// ==================== Types ====================

interface ResearchTodoListProps {
  todos: ResearchTodo[];
  summary?: TodoSummary | null;
  topicId: string;
  isLoading?: boolean;
  onTodoUpdated?: (todo: ResearchTodo) => void;
  onTodoDeleted?: (todoId: string) => void;
  onTodoSelect?: (todoId: string) => void;
  selectedTodoId?: string | null;
}

// ==================== Constants ====================

const STATUS_CONFIG: Record<
  ResearchTodoStatus,
  { label: string; icon: React.ReactNode; color: string; bgColor: string }
> = {
  [ResearchTodoStatus.PENDING]: {
    label: '待处理',
    icon: <Circle className="h-3 w-3" />,
    color: 'text-gray-500',
    bgColor: 'bg-gray-100',
  },
  [ResearchTodoStatus.QUEUED]: {
    label: '队列中',
    icon: <Clock className="h-3 w-3" />,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
  },
  [ResearchTodoStatus.IN_PROGRESS]: {
    label: '研究中',
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  [ResearchTodoStatus.REVIEWING]: {
    label: '审核中',
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
  },
  [ResearchTodoStatus.PAUSED]: {
    label: '已暂停',
    icon: <Pause className="h-3 w-3" />,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
  },
  [ResearchTodoStatus.COMPLETED]: {
    label: '已完成',
    icon: <CheckCircle2 className="h-3 w-3" />,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
  [ResearchTodoStatus.FAILED]: {
    label: '失败',
    icon: <X className="h-3 w-3" />,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
  },
  [ResearchTodoStatus.CANCELLED]: {
    label: '已取消',
    icon: <X className="h-3 w-3" />,
    color: 'text-gray-500',
    bgColor: 'bg-gray-100',
  },
};

const TYPE_ICONS: Record<ResearchTodoType, string> = {
  [ResearchTodoType.LEADER_PLANNING]: '🧠',
  [ResearchTodoType.DIMENSION_RESEARCH]: '🔍',
  [ResearchTodoType.REPORT_WRITING]: '📝',
  [ResearchTodoType.QUALITY_REVIEW]: '✅',
  [ResearchTodoType.USER_REQUEST]: '💬',
};

// ==================== Helper Functions ====================

/**
 * 从 agentName 中解析模型ID
 * 格式: "研究员名称 [model-id]" 或直接 agentName
 */
function parseAgentInfo(todo: ResearchTodo): {
  name: string;
  modelId: string | null;
} {
  // 优先使用直接的 modelId 字段
  if (todo.modelId) {
    return {
      name: todo.agentName || '待分配',
      modelId: todo.modelId,
    };
  }

  // 尝试从 agentName 解析 [model-id] 格式
  const agentName = todo.agentName || '待分配';
  const modelMatch = agentName.match(/^(.+?)\s*\[([^\]]+)\]$/);

  if (modelMatch) {
    return {
      name: modelMatch[1].trim(),
      modelId: modelMatch[2],
    };
  }

  return {
    name: agentName,
    modelId: null,
  };
}

/**
 * 排序优先级：进行中 > 待处理 > 已完成 > 失败
 */
function getStatusPriority(status: ResearchTodoStatus): number {
  switch (status) {
    case ResearchTodoStatus.IN_PROGRESS:
      return 0;
    case ResearchTodoStatus.QUEUED:
      return 1;
    case ResearchTodoStatus.PENDING:
      return 2;
    case ResearchTodoStatus.PAUSED:
      return 3;
    case ResearchTodoStatus.COMPLETED:
      return 4;
    case ResearchTodoStatus.FAILED:
      return 5;
    case ResearchTodoStatus.CANCELLED:
      return 6;
    default:
      return 99;
  }
}

// ==================== Components ====================

/**
 * 状态徽章
 */
function StatusBadge({
  status,
  progress,
}: {
  status: ResearchTodoStatus;
  progress?: number;
}) {
  const config = STATUS_CONFIG[status];
  const isRunning = status === ResearchTodoStatus.IN_PROGRESS;
  // ★ 修改：研究中状态始终显示进度百分比（即使是 0%）
  const showProgress = isRunning && typeof progress === 'number';
  const progressValue = progress ?? 0;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium shadow-sm',
        config.bgColor,
        config.color,
        isRunning && 'animate-pulse ring-2 ring-blue-300/50'
      )}
    >
      {config.icon}
      <span>{config.label}</span>
      {showProgress && (
        <span className="rounded-full bg-white/50 px-1.5 py-0.5 text-[10px] font-bold">
          {progressValue}%
        </span>
      )}
    </span>
  );
}

/**
 * 操作按钮
 */
function ActionButtons({
  todo,
  topicId,
  onUpdated,
}: {
  todo: ResearchTodo;
  topicId: string;
  onUpdated?: (todo: ResearchTodo) => void;
}) {
  const [isLoading, setIsLoading] = useState(false);

  const handleAction = async (action: string) => {
    setIsLoading(true);
    try {
      let result;
      switch (action) {
        case 'pause':
          result = await pauseTodo(topicId, todo.id);
          break;
        case 'resume':
          result = await resumeTodo(topicId, todo.id);
          break;
        case 'cancel':
          result = await cancelTodo(topicId, todo.id);
          break;
        case 'retry':
          result = await retryTodo(topicId, todo.id);
          break;
        case 'execute':
          result = await executeTodo(topicId, todo.id);
          break;
      }
      if (result?.todo && onUpdated) {
        onUpdated(result.todo);
      }
    } catch (err) {
      logger.error(`Failed to ${action} todo:`, err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <Loader2 className="h-4 w-4 animate-spin text-gray-400" />;
  }

  return (
    <div className="flex items-center gap-1">
      {todo.userCanPause && todo.status === ResearchTodoStatus.IN_PROGRESS && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleAction('pause');
          }}
          className="rounded p-1 text-orange-500 hover:bg-orange-50"
          title="暂停"
        >
          <Pause className="h-3.5 w-3.5" />
        </button>
      )}
      {todo.status === ResearchTodoStatus.PAUSED && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleAction('resume');
          }}
          className="rounded p-1 text-green-500 hover:bg-green-50"
          title="继续"
        >
          <Play className="h-3.5 w-3.5" />
        </button>
      )}
      {todo.status === ResearchTodoStatus.FAILED && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleAction('retry');
          }}
          className="rounded p-1 text-blue-500 hover:bg-blue-50"
          title="重试"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )}
      {todo.type === ResearchTodoType.USER_REQUEST &&
        todo.status === ResearchTodoStatus.PENDING && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleAction('execute');
            }}
            className="flex items-center gap-1 rounded bg-green-500 px-2 py-0.5 text-xs text-white hover:bg-green-600"
            title="执行"
          >
            <Play className="h-3 w-3" />
            执行
          </button>
        )}
    </div>
  );
}

// ==================== Main Component ====================

export function ResearchTodoList({
  todos,
  summary,
  topicId,
  isLoading,
  onTodoUpdated,
  onTodoSelect,
  selectedTodoId,
}: ResearchTodoListProps) {
  // 按状态优先级排序
  const sortedTodos = useMemo(() => {
    return [...todos].sort((a, b) => {
      const priorityDiff =
        getStatusPriority(a.status) - getStatusPriority(b.status);
      if (priorityDiff !== 0) return priorityDiff;
      // 同状态按创建时间排序
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [todos]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">加载中...</span>
      </div>
    );
  }

  if (todos.length === 0) {
    return (
      <div className="py-8 text-center text-gray-500">
        <Circle className="mx-auto mb-2 h-8 w-8 text-gray-300" />
        <p>暂无任务</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* 表头：任务列表 + 统计 */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-800">
            📋 任务列表
          </span>
          <span className="rounded-full bg-blue-500 px-2.5 py-0.5 text-xs font-medium text-white shadow-sm">
            {summary?.completed || 0}/{summary?.total || todos.length}
          </span>
        </div>
        {summary && (
          <div className="flex items-center gap-4 text-xs">
            {summary.inProgress > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-blue-600">
                <Loader2 className="h-3 w-3 animate-spin" />
                进行中 {summary.inProgress}
              </span>
            )}
            {summary.failed > 0 && (
              <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-600">
                失败 {summary.failed}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 单一扁平表格 - 自适应宽度 */}
      <div className="overflow-hidden">
        <table className="w-full table-fixed">
          <thead className="border-b border-gray-200 bg-gray-50/80">
            <tr>
              <th className="w-8 whitespace-nowrap px-2 py-2.5 text-center text-xs font-semibold text-gray-600">
                #
              </th>
              <th className="w-[32%] whitespace-nowrap px-3 py-2.5 text-center text-xs font-semibold text-gray-600">
                任务名称
              </th>
              <th className="w-[22%] whitespace-nowrap px-2 py-2.5 text-center text-xs font-semibold text-gray-600">
                负责人
              </th>
              <th className="w-[18%] whitespace-nowrap px-2 py-2.5 text-center text-xs font-semibold text-gray-600">
                模型
              </th>
              <th className="w-[15%] whitespace-nowrap px-2 py-2.5 text-center text-xs font-semibold text-gray-600">
                状态
              </th>
              <th className="w-12 whitespace-nowrap px-2 py-2.5 text-center text-xs font-semibold text-gray-600">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {sortedTodos.map((todo, index) => {
              const { name: agentName, modelId } = parseAgentInfo(todo);
              const isSelected = selectedTodoId === todo.id;

              // 依赖关系：此任务依赖于哪些任务
              const hasDependencies =
                todo.dependsOn && todo.dependsOn.length > 0;
              // 计算哪些任务依赖于此任务（被阻塞）
              const blockingCount = sortedTodos.filter((t) =>
                t.dependsOn?.includes(todo.id)
              ).length;

              // 根据状态设置行样式（背景色 + 左边框）
              const rowStyles = (() => {
                if (isSelected) {
                  return 'bg-blue-50 border-l-4 border-l-blue-500 hover:bg-blue-100';
                }
                switch (todo.status) {
                  case ResearchTodoStatus.IN_PROGRESS:
                    return 'bg-blue-50/60 border-l-4 border-l-blue-400 hover:bg-blue-100/60';
                  case ResearchTodoStatus.COMPLETED:
                    return 'bg-green-50/40 border-l-4 border-l-green-400 hover:bg-green-100/40';
                  case ResearchTodoStatus.FAILED:
                    return 'bg-red-50/40 border-l-4 border-l-red-400 hover:bg-red-100/40';
                  case ResearchTodoStatus.PAUSED:
                    return 'bg-orange-50/40 border-l-4 border-l-orange-400 hover:bg-orange-100/40';
                  case ResearchTodoStatus.QUEUED:
                    return 'bg-yellow-50/40 border-l-4 border-l-yellow-400 hover:bg-yellow-100/40';
                  default:
                    return 'bg-white border-l-4 border-l-transparent hover:bg-gray-50 hover:border-l-gray-300';
                }
              })();

              return (
                <tr
                  key={todo.id}
                  onClick={() => onTodoSelect?.(todo.id)}
                  className={cn(
                    'cursor-pointer transition-all duration-150',
                    rowStyles
                  )}
                >
                  {/* 序号 */}
                  <td className="px-2 py-2 text-center text-xs text-gray-400">
                    {index + 1}
                  </td>

                  {/* 任务名称 */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="flex-shrink-0 text-sm">
                        {TYPE_ICONS[todo.type]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div
                          className="truncate text-sm font-medium text-gray-900"
                          title={todo.title}
                        >
                          {todo.title}
                        </div>
                        {todo.dimensionName &&
                          todo.dimensionName !== todo.title && (
                            <div
                              className="truncate text-xs text-gray-400"
                              title={todo.dimensionName}
                            >
                              {todo.dimensionName}
                            </div>
                          )}
                      </div>
                      {blockingCount > 0 && (
                        <span
                          className="flex-shrink-0 text-orange-500"
                          title={`阻塞 ${blockingCount} 个任务`}
                        >
                          <Link2 className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 负责人 */}
                  <td
                    className="truncate px-2 py-2 text-xs text-gray-600"
                    title={agentName}
                  >
                    {agentName}
                  </td>

                  {/* 模型 */}
                  <td className="px-2 py-2">
                    {modelId ? (
                      <span
                        className="font-mono inline-block max-w-full truncate rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] text-indigo-600"
                        title={modelId}
                      >
                        {modelId}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>

                  {/* 状态 */}
                  <td className="px-2 py-2">
                    <StatusBadge
                      status={todo.status}
                      progress={todo.progress}
                    />
                  </td>

                  {/* 操作 */}
                  <td className="px-2 py-2 text-center">
                    <ActionButtons
                      todo={todo}
                      topicId={topicId}
                      onUpdated={onTodoUpdated}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ResearchTodoList;
