/**
 * TodoDetailPanel - TODO 详情面板
 *
 * 显示选中 TODO 的详细信息和 Agent 思考过程
 */

'use client';

import { useState, useEffect } from 'react';
import {
  X,
  Clock,
  User,
  Brain,
  ChevronDown,
  ChevronUp,
  FileText,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getTodoDetails, getTaskActivities } from '@/lib/api/topic-research';
import type { ResearchTodo, ResearchTodoStatus } from '@/types/topic-research';
import type { AgentActivity } from '@/lib/api/topic-research';
import { cn } from '@/lib/utils/common';

interface TodoDetailPanelProps {
  topicId: string;
  todoId: string;
  /** 直接传入的 TODO 数据（来自 missionStatus.tasks 转换），避免 API 调用 */
  initialTodo?: ResearchTodo;
  onClose: () => void;
  className?: string;
}

const STATUS_LABELS: Record<ResearchTodoStatus, string> = {
  PENDING: '待处理',
  QUEUED: '排队中',
  IN_PROGRESS: '进行中',
  PAUSED: '已暂停',
  COMPLETED: '已完成',
  FAILED: '失败',
  CANCELLED: '已取消',
};

const STATUS_COLORS: Record<ResearchTodoStatus, string> = {
  PENDING: 'text-gray-500',
  QUEUED: 'text-blue-500',
  IN_PROGRESS: 'text-blue-600',
  PAUSED: 'text-orange-500',
  COMPLETED: 'text-green-600',
  FAILED: 'text-red-600',
  CANCELLED: 'text-gray-400',
};

export function TodoDetailPanel({
  topicId,
  todoId,
  initialTodo,
  onClose,
  className,
}: TodoDetailPanelProps) {
  const [todo, setTodo] = useState<ResearchTodo | null>(initialTodo || null);
  const [activities, setActivities] = useState<AgentActivity[]>([]);
  const [isLoading, setIsLoading] = useState(!initialTodo);
  const [error, setError] = useState<string | null>(null);
  const [expandedActivities, setExpandedActivities] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    // 如果已有 initialTodo，先设置基础数据
    if (initialTodo) {
      setTodo(initialTodo);
    }

    // ★ 优先使用 getTaskActivities（因为 todoId 实际上是 ResearchTask.id）
    // 如果失败，再尝试 getTodoDetails（兼容真正的 ResearchTodo）
    const loadDetails = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // 先尝试用 taskId（ResearchTask.id）获取
        const taskResponse = await getTaskActivities(topicId, todoId);
        setActivities(taskResponse.activities || []);
        // 如果没有 initialTodo，用返回的 task 数据
        if (!initialTodo && taskResponse.task) {
          // 转换 task 数据为 todo 格式
          setTodo({
            id: taskResponse.task.id,
            topicId: '',
            missionId: taskResponse.task.missionId || '',
            type: 'DIMENSION_RESEARCH',
            title: taskResponse.task.title,
            description: taskResponse.task.description,
            dimensionName: taskResponse.task.dimensionName,
            agentName: taskResponse.task.assignedAgent,
            status:
              taskResponse.task.status === 'COMPLETED'
                ? 'COMPLETED'
                : taskResponse.task.status === 'EXECUTING'
                  ? 'IN_PROGRESS'
                  : 'PENDING',
            progress:
              taskResponse.task.status === 'COMPLETED'
                ? 100
                : taskResponse.task.status === 'EXECUTING'
                  ? 50
                  : 0,
            priority: taskResponse.task.priority || 0,
            dependsOn: [],
            userCanPause: false,
            userCanCancel: false,
            userCanPrioritize: false,
            createdAt: taskResponse.task.createdAt,
            updatedAt: taskResponse.task.updatedAt,
            startedAt: taskResponse.task.startedAt,
            completedAt: taskResponse.task.completedAt,
            result: taskResponse.task.result,
          } as any);
        }
      } catch (taskErr) {
        // 如果 getTaskActivities 失败，尝试 getTodoDetails
        console.warn(
          'getTaskActivities failed, trying getTodoDetails:',
          taskErr
        );
        try {
          const response = await getTodoDetails(topicId, todoId);
          setTodo(response.todo);
          setActivities(response.activities || []);
        } catch (todoErr) {
          // 两个 API 都失败
          if (!initialTodo) {
            setError(
              todoErr instanceof Error
                ? todoErr.message
                : 'Failed to load details'
            );
          } else {
            console.warn('Failed to load activities from both APIs:', todoErr);
          }
        }
      } finally {
        setIsLoading(false);
      }
    };

    void loadDetails();
  }, [topicId, todoId, initialTodo]);

  const toggleActivity = (activityId: string) => {
    setExpandedActivities((prev) => {
      const next = new Set(prev);
      if (next.has(activityId)) {
        next.delete(activityId);
      } else {
        next.add(activityId);
      }
      return next;
    });
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}秒`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}分${seconds}秒`;
  };

  if (isLoading) {
    return (
      <div
        className={cn(
          'flex h-full items-center justify-center border-l bg-white',
          className
        )}
      >
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error || !todo) {
    return (
      <div
        className={cn(
          'flex h-full flex-col items-center justify-center border-l bg-white p-6',
          className
        )}
      >
        <AlertCircle className="mb-4 h-10 w-10 text-red-500" />
        <p className="text-muted-foreground text-sm">
          {error || '无法加载详情'}
        </p>
        <Button variant="outline" size="sm" onClick={onClose} className="mt-4">
          关闭
        </Button>
      </div>
    );
  }

  return (
    <div className={cn('flex h-full flex-col border-l bg-white', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="truncate pr-4 text-sm font-semibold">{todo.title}</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Status & Progress */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span
              className={cn('text-sm font-medium', STATUS_COLORS[todo.status])}
            >
              {STATUS_LABELS[todo.status]}
            </span>
            {todo.progress > 0 && todo.progress < 100 && (
              <span className="text-muted-foreground text-xs">
                {todo.progress}%
              </span>
            )}
          </div>

          {/* Progress bar */}
          {todo.progress > 0 && todo.progress < 100 && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${todo.progress}%` }}
              />
            </div>
          )}

          {todo.statusMessage && (
            <p className="text-muted-foreground text-xs">
              {todo.statusMessage}
            </p>
          )}
        </div>

        {/* Agent Info */}
        {todo.agentName && (
          <div className="flex items-center gap-2 text-sm">
            <User className="text-muted-foreground h-4 w-4" />
            <span className="text-muted-foreground">执行者:</span>
            <span className="font-medium">{todo.agentName}</span>
            {todo.agentRole && (
              <span className="text-muted-foreground text-xs">
                ({todo.agentRole})
              </span>
            )}
          </div>
        )}

        {/* Time Info */}
        <div className="space-y-1 text-sm">
          {todo.startedAt && (
            <div className="flex items-center gap-2">
              <Clock className="text-muted-foreground h-4 w-4" />
              <span className="text-muted-foreground">开始时间:</span>
              <span>{formatTimestamp(todo.startedAt)}</span>
            </div>
          )}
          {todo.completedAt && (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-muted-foreground">完成时间:</span>
              <span>{formatTimestamp(todo.completedAt)}</span>
            </div>
          )}
          {todo.actualMs && (
            <div className="flex items-center gap-2">
              <Clock className="text-muted-foreground h-4 w-4" />
              <span className="text-muted-foreground">耗时:</span>
              <span>{formatDuration(todo.actualMs)}</span>
            </div>
          )}
        </div>

        {/* Result */}
        {todo.result && (
          <div className="space-y-1 rounded-lg bg-gray-50 p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4" />
              结果
            </div>
            {todo.result.sourcesFound !== undefined && (
              <p className="text-muted-foreground text-sm">
                找到 {todo.result.sourcesFound} 条来源
              </p>
            )}
            {todo.result.wordCount !== undefined && (
              <p className="text-muted-foreground text-sm">
                生成 {todo.result.wordCount} 字
              </p>
            )}
            {todo.result.keyFindings !== undefined && (
              <p className="text-muted-foreground text-sm">
                发现 {todo.result.keyFindings} 个关键发现
              </p>
            )}
            {todo.result.error && (
              <p className="text-sm text-red-600">{todo.result.error}</p>
            )}
          </div>
        )}

        {/* Agent Thinking / Activities */}
        {activities.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Brain className="h-4 w-4" />
              Agent 思考过程
            </div>

            <div className="space-y-2">
              {activities.map((activity) => {
                const isExpanded = expandedActivities.has(activity.id);
                return (
                  <div
                    key={activity.id}
                    className="overflow-hidden rounded-lg border"
                  >
                    <button
                      onClick={() => toggleActivity(activity.id)}
                      className="flex w-full items-center justify-between p-3 text-left hover:bg-gray-50"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="text-muted-foreground shrink-0 text-xs">
                          {formatTimestamp(activity.createdAt)}
                        </span>
                        <span className="truncate text-sm font-medium">
                          {activity.agentName || activity.agentRole}
                        </span>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="text-muted-foreground h-4 w-4 shrink-0" />
                      ) : (
                        <ChevronDown className="text-muted-foreground h-4 w-4 shrink-0" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="space-y-2 px-3 pb-3">
                        <div className="text-muted-foreground flex items-center gap-2 text-xs">
                          <span className="rounded bg-gray-100 px-1.5 py-0.5">
                            {activity.activityType}
                          </span>
                          {activity.phase && (
                            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-600">
                              {activity.phase}
                            </span>
                          )}
                          {activity.progress !== undefined && (
                            <span>{activity.progress}%</span>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-gray-700">
                          {activity.content}
                        </p>
                        {activity.dimensionName && (
                          <div className="text-muted-foreground text-xs">
                            维度: {activity.dimensionName}
                          </div>
                        )}
                        {activity.metadata &&
                          Object.keys(activity.metadata).length > 0 && (
                            <div className="rounded bg-gray-50 p-2 text-xs">
                              <span className="font-medium text-gray-600">
                                元数据:
                              </span>
                              <pre className="mt-1 overflow-x-auto text-gray-500">
                                {JSON.stringify(activity.metadata, null, 2)}
                              </pre>
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state for activities */}
        {activities.length === 0 && (
          <div className="text-muted-foreground py-6 text-center">
            <Brain className="mx-auto mb-2 h-8 w-8 opacity-50" />
            <p className="text-sm">暂无 Agent 活动记录</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default TodoDetailPanel;
