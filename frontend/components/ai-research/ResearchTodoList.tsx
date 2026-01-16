/**
 * ResearchTodoList Component
 *
 * 研究 TODO 列表组件，展示任务进度和状态
 * 参考 Claude Code TODO 机制设计
 */

'use client';

import React, { useState, useCallback, useMemo } from 'react';
import {
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  Pause,
  Play,
  X,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  Pencil,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import {
  ResearchTodo,
  ResearchTodoStatus,
  ResearchTodoType,
  TodoSummary,
} from '@/types/topic-research';
import {
  pauseTodo,
  resumeTodo,
  cancelTodo,
  retryTodo,
  prioritizeTodo,
  executeTodo,
  updateTodo,
  deleteTodo,
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
  onPause?: (todoId: string) => Promise<void>;
  onResume?: (todoId: string) => Promise<void>;
  onCancel?: (todoId: string) => Promise<void>;
  onRetry?: (todoId: string) => Promise<void>;
  onPrioritize?: (
    todoId: string,
    priority: 'high' | 'normal' | 'low'
  ) => Promise<void>;
}

interface TodoGroupConfig {
  key: string;
  label: string;
  statuses: ResearchTodoStatus[];
  icon: React.ReactNode;
  color: string;
  defaultExpanded: boolean;
}

// ==================== Constants ====================

const TODO_GROUPS: TodoGroupConfig[] = [
  {
    key: 'in_progress',
    label: '进行中',
    statuses: [ResearchTodoStatus.IN_PROGRESS],
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    color: 'text-blue-500',
    defaultExpanded: true,
  },
  {
    key: 'pending',
    label: '待处理',
    statuses: [
      ResearchTodoStatus.PENDING,
      ResearchTodoStatus.QUEUED,
      ResearchTodoStatus.PAUSED,
    ],
    icon: <Clock className="h-4 w-4" />,
    color: 'text-gray-500',
    defaultExpanded: true,
  },
  {
    key: 'completed',
    label: '已完成',
    statuses: [ResearchTodoStatus.COMPLETED],
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: 'text-green-500',
    defaultExpanded: false,
  },
  {
    key: 'failed',
    label: '失败',
    statuses: [ResearchTodoStatus.FAILED, ResearchTodoStatus.CANCELLED],
    icon: <AlertCircle className="h-4 w-4" />,
    color: 'text-red-500',
    defaultExpanded: false,
  },
];

const STATUS_CONFIG: Record<
  ResearchTodoStatus,
  { icon: React.ReactNode; color: string; bgColor: string }
> = {
  [ResearchTodoStatus.PENDING]: {
    icon: <Circle className="h-4 w-4" />,
    color: 'text-gray-400',
    bgColor: 'bg-gray-50',
  },
  [ResearchTodoStatus.QUEUED]: {
    icon: <Clock className="h-4 w-4" />,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-50',
  },
  [ResearchTodoStatus.IN_PROGRESS]: {
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    color: 'text-blue-500',
    bgColor: 'bg-blue-50',
  },
  [ResearchTodoStatus.PAUSED]: {
    icon: <Pause className="h-4 w-4" />,
    color: 'text-orange-500',
    bgColor: 'bg-orange-50',
  },
  [ResearchTodoStatus.COMPLETED]: {
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: 'text-green-500',
    bgColor: 'bg-green-50',
  },
  [ResearchTodoStatus.FAILED]: {
    icon: <X className="h-4 w-4" />,
    color: 'text-red-500',
    bgColor: 'bg-red-50',
  },
  [ResearchTodoStatus.CANCELLED]: {
    icon: <X className="h-4 w-4" />,
    color: 'text-gray-400',
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

// ==================== Components ====================

/**
 * 进度条组件
 */
function ProgressBar({
  progress,
  status,
}: {
  progress: number;
  status: ResearchTodoStatus;
}) {
  const getProgressColor = () => {
    switch (status) {
      case ResearchTodoStatus.IN_PROGRESS:
        return 'bg-blue-500';
      case ResearchTodoStatus.COMPLETED:
        return 'bg-green-500';
      case ResearchTodoStatus.FAILED:
        return 'bg-red-500';
      case ResearchTodoStatus.PAUSED:
        return 'bg-orange-500';
      default:
        return 'bg-gray-300';
    }
  };

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
      <div
        className={cn(
          'h-full transition-all duration-300',
          getProgressColor(),
          status === ResearchTodoStatus.IN_PROGRESS && 'animate-pulse'
        )}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

/**
 * 单个 TODO 项组件
 */
function TodoItem({
  todo,
  topicId,
  isSelected,
  onSelect,
  onUpdated,
  onDeleted,
}: {
  todo: ResearchTodo;
  topicId: string;
  isSelected: boolean;
  onSelect?: () => void;
  onUpdated?: (todo: ResearchTodo) => void;
  onDeleted?: (todoId: string) => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(todo.title);

  const statusConfig = STATUS_CONFIG[todo.status];

  // 是否可以编辑/删除（仅 USER_REQUEST 且 PENDING 状态）
  const canEditOrDelete =
    todo.type === ResearchTodoType.USER_REQUEST &&
    todo.status === ResearchTodoStatus.PENDING;

  const handleAction = async (
    action:
      | 'pause'
      | 'resume'
      | 'cancel'
      | 'retry'
      | 'prioritize'
      | 'execute'
      | 'delete',
    priority?: 'high' | 'normal' | 'low'
  ) => {
    setIsLoading(true);
    setError(null);
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
        case 'prioritize':
          if (priority) {
            result = await prioritizeTodo(topicId, todo.id, priority);
          }
          break;
        case 'execute':
          result = await executeTodo(topicId, todo.id);
          break;
        case 'delete':
          if (confirm('确定要删除这个任务吗？')) {
            await deleteTodo(topicId, todo.id);
            onDeleted?.(todo.id);
            return;
          }
          break;
      }
      if (result?.todo && onUpdated) {
        onUpdated(result.todo);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : `操作失败: ${action}`;
      setError(message);
      console.error(`Failed to ${action} todo:`, err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editTitle.trim()) {
      setError('标题不能为空');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await updateTodo(topicId, todo.id, { title: editTitle });
      if (result?.todo && onUpdated) {
        onUpdated(result.todo);
      }
      setIsEditing(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存失败';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}秒`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}分${seconds % 60}秒`;
  };

  return (
    <div
      className={cn(
        'cursor-pointer rounded-lg border p-3 transition-all',
        statusConfig.bgColor,
        isSelected && 'ring-2 ring-blue-500',
        'hover:shadow-sm'
      )}
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        {/* 状态图标 */}
        <div className={cn('mt-0.5', statusConfig.color)}>
          {statusConfig.icon}
        </div>

        {/* 内容 */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-base">{TYPE_ICONS[todo.type]}</span>
            {isEditing ? (
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveEdit();
                  if (e.key === 'Escape') {
                    setIsEditing(false);
                    setEditTitle(todo.title);
                  }
                }}
                className="flex-1 rounded border bg-white px-2 py-0.5 text-sm text-gray-900"
                autoFocus
              />
            ) : (
              <span className="truncate text-sm font-medium">{todo.title}</span>
            )}
            {todo.progress > 0 && todo.progress < 100 && (
              <span className="text-xs text-gray-500">{todo.progress}%</span>
            )}
          </div>

          {/* 错误消息 */}
          {error && (
            <p className="mt-1 text-xs text-red-500">
              {typeof error === 'string' ? error : '操作失败'}
            </p>
          )}

          {/* 状态消息 */}
          {!error && todo.statusMessage && (
            <p className="mt-1 truncate text-xs text-gray-500">
              {typeof todo.statusMessage === 'string'
                ? todo.statusMessage
                : '处理中...'}
            </p>
          )}

          {/* 进度条 */}
          {(todo.status === ResearchTodoStatus.IN_PROGRESS ||
            todo.status === ResearchTodoStatus.PAUSED) && (
            <div className="mt-2">
              <ProgressBar progress={todo.progress} status={todo.status} />
            </div>
          )}

          {/* 完成信息 */}
          {todo.status === ResearchTodoStatus.COMPLETED && todo.actualMs && (
            <p className="mt-1 text-xs text-gray-400">
              耗时 {formatDuration(todo.actualMs)}
              {todo.result?.sourcesFound !== undefined &&
                ` · ${todo.result.sourcesFound} 条来源`}
            </p>
          )}

          {/* ★ 失败信息 - 显示失败原因摘要 */}
          {todo.status === ResearchTodoStatus.FAILED && (
            <p className="mt-1 truncate text-xs text-red-500">
              {typeof todo.result?.error === 'string'
                ? todo.result.error
                : typeof todo.statusMessage === 'string'
                  ? todo.statusMessage
                  : '执行失败，点击查看详情'}
            </p>
          )}

          {/* 操作按钮 */}
          <div className="mt-2 flex items-center gap-1">
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            ) : (
              <>
                {/* 暂停/恢复 */}
                {todo.userCanPause &&
                  todo.status === ResearchTodoStatus.IN_PROGRESS && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAction('pause');
                      }}
                      className="rounded p-1 text-orange-500 hover:bg-white/50"
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
                    className="rounded p-1 text-green-500 hover:bg-white/50"
                    title="继续"
                  >
                    <Play className="h-3.5 w-3.5" />
                  </button>
                )}

                {/* 取消 */}
                {todo.userCanCancel &&
                  [
                    ResearchTodoStatus.PENDING,
                    ResearchTodoStatus.QUEUED,
                    ResearchTodoStatus.PAUSED,
                  ].includes(todo.status) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAction('cancel');
                      }}
                      className="rounded p-1 text-red-500 hover:bg-white/50"
                      title="取消"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}

                {/* 重试 */}
                {todo.status === ResearchTodoStatus.FAILED && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAction('retry');
                    }}
                    className="rounded p-1 text-blue-500 hover:bg-white/50"
                    title="重试"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                )}

                {/* 开始执行 - 用户请求类 TODO */}
                {todo.type === ResearchTodoType.USER_REQUEST &&
                  todo.status === ResearchTodoStatus.PENDING && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAction('execute');
                      }}
                      disabled={isLoading}
                      className="flex items-center gap-1 rounded bg-green-500 px-2 py-0.5 text-xs text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
                      title="开始执行"
                    >
                      {isLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Play className="h-3 w-3" />
                      )}
                      执行
                    </button>
                  )}

                {/* 编辑和删除 - 仅用户请求类且待处理 */}
                {canEditOrDelete && (
                  <>
                    {isEditing ? (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSaveEdit();
                          }}
                          className="rounded bg-blue-500 px-2 py-0.5 text-xs text-white hover:bg-blue-600"
                          title="保存"
                        >
                          保存
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsEditing(false);
                            setEditTitle(todo.title);
                          }}
                          className="rounded bg-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-400"
                          title="取消"
                        >
                          取消
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsEditing(true);
                          }}
                          className="rounded p-1 text-gray-500 hover:bg-white/50"
                          title="编辑"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAction('delete');
                          }}
                          className="rounded p-1 text-red-400 hover:bg-white/50"
                          title="删除"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </>
                )}

                {/* 优先级 */}
                {todo.userCanPrioritize &&
                  [
                    ResearchTodoStatus.PENDING,
                    ResearchTodoStatus.QUEUED,
                  ].includes(todo.status) && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAction('prioritize', 'high');
                        }}
                        className="rounded p-1 text-gray-400 hover:bg-white/50"
                        title="提高优先级"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAction('prioritize', 'low');
                        }}
                        className="rounded p-1 text-gray-400 hover:bg-white/50"
                        title="降低优先级"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * TODO 分组组件
 */
function TodoGroup({
  config,
  todos,
  topicId,
  selectedTodoId,
  onTodoSelect,
  onTodoUpdated,
  onTodoDeleted,
}: {
  config: TodoGroupConfig;
  todos: ResearchTodo[];
  topicId: string;
  selectedTodoId?: string | null;
  onTodoSelect?: (todoId: string) => void;
  onTodoUpdated?: (todo: ResearchTodo) => void;
  onTodoDeleted?: (todoId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(config.defaultExpanded);

  if (todos.length === 0) {
    return null;
  }

  return (
    <div className="mb-3">
      {/* 分组标题 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 rounded px-1 py-1.5 text-left hover:bg-gray-50"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-400" />
        )}
        <span className={config.color}>{config.icon}</span>
        <span className="text-sm font-medium text-gray-700">
          {config.label}
        </span>
        <span className="text-xs text-gray-400">({todos.length})</span>
      </button>

      {/* 分组内容 */}
      {isExpanded && (
        <div className="ml-6 mt-2 space-y-2">
          {todos.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              topicId={topicId}
              isSelected={selectedTodoId === todo.id}
              onSelect={() => onTodoSelect?.(todo.id)}
              onUpdated={onTodoUpdated}
              onDeleted={onTodoDeleted}
            />
          ))}
        </div>
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
  onTodoDeleted,
  onTodoSelect,
  selectedTodoId,
}: ResearchTodoListProps) {
  // 按状态分组
  const groupedTodos = useMemo(() => {
    const groups: Record<string, ResearchTodo[]> = {};

    for (const config of TODO_GROUPS) {
      groups[config.key] = todos.filter((todo) =>
        config.statuses.includes(todo.status)
      );
    }

    return groups;
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
    <div className="space-y-2">
      {/* 整体进度 */}
      {summary && (
        <div className="mb-4 rounded-lg bg-gray-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">整体进度</span>
            <span className="text-sm text-gray-500">
              {summary.overallProgress}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full bg-blue-500 transition-all duration-500"
              style={{ width: `${summary.overallProgress}%` }}
            />
          </div>
          <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
            <span>
              完成 {summary.completed}/{summary.total}
            </span>
            {summary.inProgress > 0 && (
              <span className="text-blue-500">进行中 {summary.inProgress}</span>
            )}
            {summary.failed > 0 && (
              <span className="text-red-500">失败 {summary.failed}</span>
            )}
          </div>
        </div>
      )}

      {/* 分组列表 */}
      {TODO_GROUPS.map((config) => (
        <TodoGroup
          key={config.key}
          config={config}
          todos={groupedTodos[config.key] || []}
          topicId={topicId}
          selectedTodoId={selectedTodoId}
          onTodoSelect={onTodoSelect}
          onTodoUpdated={onTodoUpdated}
          onTodoDeleted={onTodoDeleted}
        />
      ))}
    </div>
  );
}

export default ResearchTodoList;
