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
import { cn, safeString } from '@/lib/utils/common';

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
  REVIEWING: '审核中',
  PAUSED: '已暂停',
  COMPLETED: '已完成',
  FAILED: '失败',
  CANCELLED: '已取消',
};

const STATUS_COLORS: Record<ResearchTodoStatus, string> = {
  PENDING: 'text-gray-500',
  QUEUED: 'text-blue-500',
  IN_PROGRESS: 'text-blue-600',
  REVIEWING: 'text-purple-600',
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

  // ★ 修复闪烁问题：使用 initialTodo.id 作为依赖，而不是整个对象
  // 整个对象作为依赖会导致每次父组件渲染时 useEffect 都重新执行
  const initialTodoId = initialTodo?.id;
  const initialTodoTopicId = initialTodo?.topicId;

  useEffect(() => {
    // 如果已有 initialTodo，先设置基础数据
    if (initialTodo) {
      setTodo(initialTodo);
    }

    // ★ 根据数据来源选择正确的 API，避免不必要的 404 错误
    // - 来自 apiTodos（真正的 ResearchTodo 记录）：topicId 非空，使用 getTodoDetails
    // - 来自 missionStatus.tasks（ResearchTask 转换）：topicId 为空，使用 getTaskActivities
    const loadDetails = async () => {
      setIsLoading(true);
      setError(null);

      // 判断数据来源：apiTodos 的记录有 topicId，convertedTodos 的 topicId 为空
      const isFromApiTodos = initialTodoTopicId && initialTodoTopicId !== '';

      try {
        if (isFromApiTodos) {
          // 来自 apiTodos（真正的 ResearchTodo），用 getTodoDetails
          const response = await getTodoDetails(topicId, todoId);
          setTodo(response.todo);
          setActivities(response.activities || []);
        } else {
          // 来自 missionStatus.tasks（ResearchTask），用 getTaskActivities
          try {
            const taskResponse = await getTaskActivities(topicId, todoId);
            setActivities(taskResponse.activities || []);
            // 如果没有 initialTodo，用返回的 task 数据
            if (!initialTodoId && taskResponse.task) {
              // ★ 转换 task 数据为 todo 格式
              // 状态映射
              const statusMap: Record<string, string> = {
                COMPLETED: 'COMPLETED',
                EXECUTING: 'IN_PROGRESS',
                FAILED: 'FAILED',
                PENDING: 'PENDING',
              };
              const mappedStatus =
                statusMap[taskResponse.task.status] || 'PENDING';

              // ★ 修复：根据状态计算真实进度
              // COMPLETED = 100%, FAILED = 100% (已结束), EXECUTING = 使用活动计数估算, PENDING = 0%
              let progress = 0;
              if (taskResponse.task.status === 'COMPLETED') {
                progress = 100;
              } else if (taskResponse.task.status === 'FAILED') {
                progress = 100; // 失败也是结束状态
              } else if (taskResponse.task.status === 'EXECUTING') {
                // 根据活动数量估算进度（如果有活动记录）
                const activityCount = taskResponse.activities?.length || 0;
                progress = Math.min(90, 10 + activityCount * 20); // 10-90% 范围
              }

              setTodo({
                id: taskResponse.task.id,
                topicId: '',
                missionId: taskResponse.task.missionId || '',
                type: 'DIMENSION_RESEARCH',
                title: taskResponse.task.title,
                description: taskResponse.task.description,
                dimensionName: taskResponse.task.dimensionName,
                agentName: taskResponse.task.assignedAgent,
                status: mappedStatus as any,
                progress,
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
                // ★ 新增：如果失败，从 result.error 或 resultSummary 获取状态消息
                statusMessage:
                  taskResponse.task.status === 'FAILED'
                    ? taskResponse.task.result?.error ||
                      taskResponse.task.resultSummary ||
                      '任务执行失败'
                    : taskResponse.task.resultSummary,
              } as any);
            }
          } catch (taskErr) {
            // 如果 getTaskActivities 失败，尝试 getTodoDetails 作为后备
            const response = await getTodoDetails(topicId, todoId);
            setTodo(response.todo);
            setActivities(response.activities || []);
          }
        }
      } catch (err) {
        // 所有尝试都失败
        if (!initialTodoId) {
          setError(
            err instanceof Error ? err.message : 'Failed to load details'
          );
        } else {
          console.warn('Failed to load activities:', err);
        }
      } finally {
        setIsLoading(false);
      }
    };

    void loadDetails();
    // ★ 只依赖 ID，不依赖整个对象，避免无限循环
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId, todoId, initialTodoId, initialTodoTopicId]);

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

  const formatTimestamp = (timestamp: string | null | undefined) => {
    if (!timestamp) return '--:--:--';
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return '--:--:--';
      return date.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return '--:--:--';
    }
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
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
        <p className="text-sm text-muted-foreground">
          {typeof error === 'string' ? error : '无法加载详情'}
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
        <h3 className="truncate pr-4 text-sm font-semibold text-gray-900">
          {todo.title}
        </h3>
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
              <span className="text-xs text-muted-foreground">
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

          {todo.statusMessage && todo.status !== 'FAILED' && (
            <p className="text-xs text-muted-foreground">
              {typeof todo.statusMessage === 'string'
                ? todo.statusMessage
                : '处理中...'}
            </p>
          )}
        </div>

        {/* ★ 失败原因显示 - 专门针对 FAILED 状态的醒目展示 */}
        {todo.status === 'FAILED' && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-red-700">
              <AlertCircle className="h-4 w-4" />
              失败原因
            </div>
            <p className="mt-1 text-sm text-red-600">
              {typeof todo.result?.error === 'string'
                ? todo.result.error
                : typeof todo.statusMessage === 'string'
                  ? todo.statusMessage
                  : '任务执行过程中发生错误，请查看详细日志'}
            </p>
            {typeof todo.result?.error === 'string' &&
              typeof todo.statusMessage === 'string' &&
              todo.result.error !== todo.statusMessage && (
                <p className="mt-1 text-xs text-muted-foreground">
                  详情: {todo.statusMessage}
                </p>
              )}
          </div>
        )}

        {/* Agent Info */}
        {todo.agentName && (
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">执行者:</span>
            <span className="font-medium text-gray-900">{todo.agentName}</span>
            {todo.agentRole && (
              <span className="text-xs text-muted-foreground">
                ({todo.agentRole})
              </span>
            )}
          </div>
        )}

        {/* Time Info */}
        <div className="space-y-1 text-sm">
          {todo.startedAt && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
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
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">耗时:</span>
              <span>{formatDuration(todo.actualMs)}</span>
            </div>
          )}
        </div>

        {/* Result */}
        {todo.result && (
          <div className="space-y-3 rounded-lg bg-gray-50 p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4" />
              结果
            </div>

            {/* Basic stats */}
            <div className="flex flex-wrap gap-3 text-sm">
              {todo.result.sourcesFound !== undefined && (
                <div className="rounded-md bg-blue-50 px-2 py-1">
                  <span className="text-blue-600">
                    {safeString(todo.result.sourcesFound)} 条来源
                  </span>
                </div>
              )}
              {todo.result.wordCount !== undefined && (
                <div className="rounded-md bg-green-50 px-2 py-1">
                  <span className="text-green-600">
                    {safeString(todo.result.wordCount)} 字
                  </span>
                </div>
              )}
              {/* Show count if keyFindings is array */}
              {Array.isArray(todo.result.keyFindings) && (
                <div className="rounded-md bg-purple-50 px-2 py-1">
                  <span className="text-purple-600">
                    {todo.result.keyFindings.length} 个关键发现
                  </span>
                </div>
              )}
              {typeof todo.result.keyFindings === 'number' && (
                <div className="rounded-md bg-purple-50 px-2 py-1">
                  <span className="text-purple-600">
                    {todo.result.keyFindings} 个关键发现
                  </span>
                </div>
              )}
            </div>

            {/* Summary */}
            {todo.result.summary && typeof todo.result.summary === 'string' && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-gray-500">摘要</div>
                <p className="text-sm text-gray-700">{todo.result.summary}</p>
              </div>
            )}

            {/* Key Findings - formatted */}
            {Array.isArray(todo.result.keyFindings) &&
              todo.result.keyFindings.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-gray-500">
                    关键发现
                  </div>
                  <ul className="space-y-1">
                    {todo.result.keyFindings.slice(0, 5).map(
                      (
                        finding: {
                          finding?: string;
                          significance?: string;
                        },
                        idx: number
                      ) => (
                        <li
                          key={idx}
                          className="flex items-start gap-2 text-sm"
                        >
                          <span
                            className={cn(
                              'mt-0.5 shrink-0 rounded px-1 py-0.5 text-xs',
                              finding.significance === 'high'
                                ? 'bg-red-100 text-red-700'
                                : finding.significance === 'low'
                                  ? 'bg-gray-100 text-gray-600'
                                  : 'bg-yellow-100 text-yellow-700'
                            )}
                          >
                            {finding.significance === 'high'
                              ? '高'
                              : finding.significance === 'low'
                                ? '低'
                                : '中'}
                          </span>
                          <span className="text-gray-700">
                            {finding.finding || '未知发现'}
                          </span>
                        </li>
                      )
                    )}
                    {todo.result.keyFindings.length > 5 && (
                      <li className="text-xs text-muted-foreground">
                        ...还有 {todo.result.keyFindings.length - 5} 个发现
                      </li>
                    )}
                  </ul>
                </div>
              )}

            {/* Trends - formatted */}
            {Array.isArray(todo.result.trends) &&
              todo.result.trends.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-gray-500">
                    趋势分析
                  </div>
                  <ul className="space-y-1">
                    {todo.result.trends.slice(0, 3).map(
                      (
                        trend: {
                          trend?: string;
                          direction?: string;
                          timeframe?: string;
                        },
                        idx: number
                      ) => (
                        <li key={idx} className="text-sm text-gray-700">
                          <span className="font-medium">{trend.trend}</span>
                          {trend.direction && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              ({trend.direction}
                              {trend.timeframe ? `, ${trend.timeframe}` : ''})
                            </span>
                          )}
                        </li>
                      )
                    )}
                  </ul>
                </div>
              )}

            {/* Error */}
            {todo.result.error && (
              <p className="text-sm text-red-600">
                {typeof todo.result.error === 'string'
                  ? todo.result.error
                  : '执行出错'}
              </p>
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
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatTimestamp(activity.createdAt)}
                        </span>
                        <span className="truncate text-sm font-medium text-gray-900">
                          {safeString(activity.agentName || activity.agentRole)}
                        </span>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="space-y-2 px-3 pb-3">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="rounded bg-gray-100 px-1.5 py-0.5">
                            {safeString(activity.activityType)}
                          </span>
                          {activity.phase && (
                            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-600">
                              {safeString(activity.phase)}
                            </span>
                          )}
                          {activity.progress !== undefined && (
                            <span>{safeString(activity.progress)}%</span>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-gray-700">
                          {safeString(activity.content)}
                        </p>
                        {activity.dimensionName && (
                          <div className="text-xs text-muted-foreground">
                            维度: {safeString(activity.dimensionName)}
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
          <div className="py-6 text-center text-muted-foreground">
            <Brain className="mx-auto mb-2 h-8 w-8 opacity-50" />
            <p className="text-sm">暂无 Agent 活动记录</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default TodoDetailPanel;
