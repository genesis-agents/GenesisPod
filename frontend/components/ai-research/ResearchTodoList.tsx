/**
 * ResearchTodoList Component
 *
 * 研究任务列表组件 - 表格形式展示
 * 参考 AI Teams 的任务分配表格设计
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
  AlertCircle,
  ChevronDown,
  ChevronUp,
  RotateCcw,
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
    icon: <Circle className="h-3.5 w-3.5" />,
    color: 'text-gray-400',
    bgColor: 'bg-gray-100',
  },
  [ResearchTodoStatus.QUEUED]: {
    label: '队列中',
    icon: <Clock className="h-3.5 w-3.5" />,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-50',
  },
  [ResearchTodoStatus.IN_PROGRESS]: {
    label: '进行中',
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    color: 'text-blue-500',
    bgColor: 'bg-blue-50',
  },
  [ResearchTodoStatus.PAUSED]: {
    label: '已暂停',
    icon: <Pause className="h-3.5 w-3.5" />,
    color: 'text-orange-500',
    bgColor: 'bg-orange-50',
  },
  [ResearchTodoStatus.COMPLETED]: {
    label: '已完成',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    color: 'text-green-500',
    bgColor: 'bg-green-50',
  },
  [ResearchTodoStatus.FAILED]: {
    label: '失败',
    icon: <X className="h-3.5 w-3.5" />,
    color: 'text-red-500',
    bgColor: 'bg-red-50',
  },
  [ResearchTodoStatus.CANCELLED]: {
    label: '已取消',
    icon: <X className="h-3.5 w-3.5" />,
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

// ==================== Helper Functions ====================

function getProgressStage(progress: number): string {
  if (progress < 10) return '收集中';
  if (progress < 30) return '规划中';
  if (progress < 80) return '研究中';
  return '整合中';
}

// ==================== Components ====================

/**
 * 状态徽章组件
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

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        config.bgColor,
        config.color,
        // 正在运行的任务添加闪光动画
        isRunning && 'animate-pulse ring-2 ring-blue-300 ring-opacity-50'
      )}
    >
      {config.icon}
      <span>{config.label}</span>
      {isRunning && progress !== undefined && progress > 0 && (
        <span className="ml-1 text-blue-600">{progress}%</span>
      )}
    </div>
  );
}

/**
 * 负责人显示组件
 */
function AgentDisplay({ todo }: { todo: ResearchTodo }) {
  // 从 agentName 中解析出名称和模型（格式可能是 "研究员名称 [model-id]"）
  const agentName = todo.agentName || '待分配';
  const modelMatch = agentName.match(/^(.+?)\s*\[([^\]]+)\]$/);

  if (modelMatch) {
    const [, name, model] = modelMatch;
    return (
      <div className="flex flex-col">
        <span className="text-sm font-medium text-gray-700">{name}</span>
        <span className="text-xs text-gray-400">({model})</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <span className="text-sm font-medium text-gray-700">{agentName}</span>
      {todo.agentRole && (
        <span className="text-xs text-gray-400">{todo.agentRole}</span>
      )}
    </div>
  );
}

/**
 * 操作按钮组件
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
      console.error(`Failed to ${action} todo:`, err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <Loader2 className="h-4 w-4 animate-spin text-gray-400" />;
  }

  return (
    <div className="flex items-center gap-1">
      {/* 暂停 */}
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

      {/* 继续 */}
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

      {/* 重试 */}
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

      {/* 执行 */}
      {todo.type === ResearchTodoType.USER_REQUEST &&
        todo.status === ResearchTodoStatus.PENDING && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleAction('execute');
            }}
            className="flex items-center gap-1 rounded bg-green-500 px-2 py-0.5 text-xs text-white hover:bg-green-600"
            title="开始执行"
          >
            <Play className="h-3 w-3" />
            执行
          </button>
        )}
    </div>
  );
}

/**
 * 任务表格行组件
 */
function TaskTableRow({
  todo,
  index,
  topicId,
  isSelected,
  onSelect,
  onUpdated,
}: {
  todo: ResearchTodo;
  index: number;
  topicId: string;
  isSelected: boolean;
  onSelect?: () => void;
  onUpdated?: (todo: ResearchTodo) => void;
}) {
  const isRunning = todo.status === ResearchTodoStatus.IN_PROGRESS;

  return (
    <tr
      onClick={onSelect}
      className={cn(
        'cursor-pointer border-b transition-all hover:bg-gray-50',
        isSelected && 'bg-blue-50 hover:bg-blue-50',
        // 正在运行的行添加左边框高亮
        isRunning && 'border-l-4 border-l-blue-500 bg-blue-50/30'
      )}
    >
      {/* 序号 */}
      <td className="w-12 px-3 py-3 text-center text-sm text-gray-500">
        {index + 1}
      </td>

      {/* 任务名称 */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base">{TYPE_ICONS[todo.type]}</span>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-gray-900">
              {todo.title}
            </span>
            {todo.dimensionName && todo.dimensionName !== todo.title && (
              <span className="text-xs text-gray-400">
                {todo.dimensionName}
              </span>
            )}
          </div>
        </div>
      </td>

      {/* 负责人 */}
      <td className="px-3 py-3">
        <AgentDisplay todo={todo} />
      </td>

      {/* 状态 */}
      <td className="px-3 py-3">
        <StatusBadge status={todo.status} progress={todo.progress} />
        {/* 进度阶段 */}
        {isRunning && todo.progress > 0 && (
          <div className="mt-1 text-xs text-blue-500">
            {getProgressStage(todo.progress)}
          </div>
        )}
      </td>

      {/* 操作 */}
      <td className="w-24 px-3 py-3 text-right">
        <ActionButtons todo={todo} topicId={topicId} onUpdated={onUpdated} />
      </td>
    </tr>
  );
}

/**
 * 任务分组组件
 */
function TaskGroup({
  todos,
  title,
  icon,
  defaultExpanded,
  topicId,
  selectedTodoId,
  onTodoSelect,
  onTodoUpdated,
}: {
  todos: ResearchTodo[];
  title: string;
  icon: React.ReactNode;
  defaultExpanded: boolean;
  topicId: string;
  selectedTodoId?: string | null;
  onTodoSelect?: (todoId: string) => void;
  onTodoUpdated?: (todo: ResearchTodo) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (todos.length === 0) return null;

  return (
    <div className="mb-4">
      {/* 分组标题 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 rounded-t-lg bg-gray-100 px-4 py-2 text-left hover:bg-gray-200"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-gray-500" />
        ) : (
          <ChevronUp className="h-4 w-4 text-gray-500" />
        )}
        {icon}
        <span className="text-sm font-medium text-gray-700">{title}</span>
        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">
          {todos.length}
        </span>
      </button>

      {/* 任务表格 */}
      {isExpanded && (
        <div className="overflow-hidden rounded-b-lg border border-t-0">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="w-12 px-3 py-2 text-center">#</th>
                <th className="px-3 py-2">任务名称</th>
                <th className="w-36 px-3 py-2">负责人</th>
                <th className="w-32 px-3 py-2">状态</th>
                <th className="w-24 px-3 py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {todos.map((todo, idx) => (
                <TaskTableRow
                  key={todo.id}
                  todo={todo}
                  index={idx}
                  topicId={topicId}
                  isSelected={selectedTodoId === todo.id}
                  onSelect={() => onTodoSelect?.(todo.id)}
                  onUpdated={onTodoUpdated}
                />
              ))}
            </tbody>
          </table>
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
  onTodoSelect,
  selectedTodoId,
}: ResearchTodoListProps) {
  const [isProgressCollapsed, setIsProgressCollapsed] = useState(true);

  // 按状态分组统计
  const { inProgressTodos, pendingTodos, completedTodos, failedTodos } =
    useMemo(() => {
      const inProgress = todos.filter(
        (t) => t.status === ResearchTodoStatus.IN_PROGRESS
      );
      const pending = todos.filter((t) =>
        [
          ResearchTodoStatus.PENDING,
          ResearchTodoStatus.QUEUED,
          ResearchTodoStatus.PAUSED,
        ].includes(t.status)
      );
      const completed = todos.filter(
        (t) => t.status === ResearchTodoStatus.COMPLETED
      );
      const failed = todos.filter((t) =>
        [ResearchTodoStatus.FAILED, ResearchTodoStatus.CANCELLED].includes(
          t.status
        )
      );
      return {
        inProgressTodos: inProgress,
        pendingTodos: pending,
        completedTodos: completed,
        failedTodos: failed,
      };
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
        <div className="mb-4 rounded-lg bg-gray-50">
          <div
            className="flex cursor-pointer items-center justify-between p-3 hover:bg-gray-100"
            onClick={() => setIsProgressCollapsed(!isProgressCollapsed)}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">
                整体进度
              </span>
              <span className="text-xs text-gray-500">
                完成 {summary.completed}/{summary.total}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">
                {summary.overallProgress}%
              </span>
              {isProgressCollapsed ? (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              )}
            </div>
          </div>
          {!isProgressCollapsed && (
            <div className="border-t border-gray-200 p-3 pt-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${summary.overallProgress}%` }}
                />
              </div>
              <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                {summary.inProgress > 0 && (
                  <span className="flex items-center gap-1 text-blue-500">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    进行中 {summary.inProgress}
                  </span>
                )}
                {summary.failed > 0 && (
                  <span className="text-red-500">失败 {summary.failed}</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 进行中的任务 - 带闪光效果 */}
      <TaskGroup
        todos={inProgressTodos}
        title="进行中"
        icon={<Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
        defaultExpanded={true}
        topicId={topicId}
        selectedTodoId={selectedTodoId}
        onTodoSelect={onTodoSelect}
        onTodoUpdated={onTodoUpdated}
      />

      {/* 待处理的任务 */}
      <TaskGroup
        todos={pendingTodos}
        title="待处理"
        icon={<Clock className="h-4 w-4 text-gray-500" />}
        defaultExpanded={true}
        topicId={topicId}
        selectedTodoId={selectedTodoId}
        onTodoSelect={onTodoSelect}
        onTodoUpdated={onTodoUpdated}
      />

      {/* 已完成的任务 */}
      <TaskGroup
        todos={completedTodos}
        title="已完成"
        icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
        defaultExpanded={false}
        topicId={topicId}
        selectedTodoId={selectedTodoId}
        onTodoSelect={onTodoSelect}
        onTodoUpdated={onTodoUpdated}
      />

      {/* 失败的任务 */}
      <TaskGroup
        todos={failedTodos}
        title="失败"
        icon={<AlertCircle className="h-4 w-4 text-red-500" />}
        defaultExpanded={false}
        topicId={topicId}
        selectedTodoId={selectedTodoId}
        onTodoSelect={onTodoSelect}
        onTodoUpdated={onTodoUpdated}
      />
    </div>
  );
}

export default ResearchTodoList;
