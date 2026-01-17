/**
 * ResearchCollaborationPanel - 研究协作面板
 *
 * 整合 TODO List、QuickCommandBar 和对话消息区的主面板
 * 用户输入后，AI Leader 先解码意图，再决定是否创建 TODO
 * 类似 Claude Code CLI 的交互模式
 *
 * 数据来源优先级：
 * 1. missionStatus.tasks (从父组件传入，与左侧面板同源)
 * 2. fetchTodos API (作为备选)
 */

'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ResearchTodoList } from './ResearchTodoList';
import { QuickCommandBar } from './QuickCommandBar';
import { TodoDetailPanel } from './TodoDetailPanel';
import AIMessageRenderer from '@/components/ui/AIMessageRenderer';
import { useTopicResearchStore } from '@/stores/topicResearchStore';
import {
  Loader2,
  User,
  Brain,
  MessageSquare,
  CheckCircle2,
  HelpCircle,
  MessageCircle,
  ListTodo,
} from 'lucide-react';
import { cn, safeString } from '@/lib/utils/common';
import {
  leaderChat,
  getTeamMessages,
  type LeaderChatResponse,
  type LeaderDecisionType,
  type TeamMessage,
} from '@/lib/api/topic-research';
import type { MissionStatus, TaskStatus } from '@/lib/api/topic-research';
import type {
  ResearchTodo,
  ResearchTodoStatus,
  ResearchTodoType,
  TodoSummary,
} from '@/types/topic-research';

// 对话消息类型
interface ConversationMessage {
  id: string;
  type: 'user' | 'leader';
  content: string;
  timestamp: Date;
  // Leader 响应特有字段
  decisionType?: LeaderDecisionType;
  understanding?: string;
  todoCreated?: { id: string; title: string };
  clarifyOptions?: string[];
}

interface ResearchCollaborationPanelProps {
  topicId: string;
  missionId?: string;
  missionStatus?: MissionStatus | null;
  className?: string;
}

/**
 * 将 TaskStatus 转换为 ResearchTodo 格式
 */
function convertTaskToTodo(task: TaskStatus): ResearchTodo {
  // 状态映射
  const statusMap: Record<string, ResearchTodoStatus> = {
    PENDING: 'PENDING' as ResearchTodoStatus,
    ASSIGNED: 'QUEUED' as ResearchTodoStatus,
    EXECUTING: 'IN_PROGRESS' as ResearchTodoStatus,
    COMPLETED: 'COMPLETED' as ResearchTodoStatus,
    NEEDS_REVISION: 'PAUSED' as ResearchTodoStatus,
    FAILED: 'FAILED' as ResearchTodoStatus,
  };

  // 类型映射
  const typeMap: Record<string, ResearchTodoType> = {
    dimension_research: 'DIMENSION_RESEARCH' as ResearchTodoType,
    quality_review: 'QUALITY_REVIEW' as ResearchTodoType,
    report_synthesis: 'REPORT_WRITING' as ResearchTodoType,
    leader_planning: 'LEADER_PLANNING' as ResearchTodoType,
  };

  // ★ 修复：根据状态计算真实进度
  // COMPLETED/FAILED = 100% (已结束), EXECUTING = 30-70% 估算, PENDING = 0%
  let progress = task.progress || 0;
  if (!task.progress) {
    if (task.status === 'COMPLETED' || task.status === 'FAILED') {
      progress = 100;
    } else if (task.status === 'EXECUTING') {
      progress = 30; // 执行中默认 30%（会通过实时事件更新）
    }
  }

  // ★ 修复：构建状态消息，确保失败原因清晰显示
  let statusMessage: string | undefined;
  if (task.status === 'FAILED') {
    // 失败时优先显示错误信息
    statusMessage =
      task.result?.error || task.resultSummary || 'Task execution failed';
  } else if (task.resultSummary) {
    statusMessage = task.resultSummary;
  }

  return {
    id: task.id,
    topicId: '', // ★ 空字符串表示这是从 ResearchTask 转换的，不是真正的 ResearchTodo
    missionId: '',
    type: typeMap[task.taskType] || ('DIMENSION_RESEARCH' as ResearchTodoType),
    title: task.title,
    description: task.description || task.dimensionName,
    dimensionName: task.dimensionName,
    agentName: task.assignedAgent,
    status: statusMap[task.status] || ('PENDING' as ResearchTodoStatus),
    progress,
    priority: 0,
    dependsOn: [],
    // ★ ResearchTask 不支持暂停/取消/优先级调整操作
    // 这些功能只对真正的 ResearchTodo（用户创建的任务）有效
    userCanPause: false,
    userCanCancel: false,
    userCanPrioritize: false,
    createdAt: task.startedAt || new Date().toISOString(),
    updatedAt: task.completedAt || new Date().toISOString(),
    startedAt: task.startedAt,
    completedAt: task.completedAt,
    // ★ 新增：传递任务结果（包含成功数据或错误信息）
    result: task.result,
    // ★ 新增：状态消息，用于显示失败原因
    statusMessage,
  };
}

/**
 * 计算 TODO 统计摘要
 */
function calculateSummary(todos: ResearchTodo[]): TodoSummary {
  const total = todos.length;
  let completed = 0,
    inProgress = 0,
    pending = 0,
    queued = 0,
    paused = 0,
    failed = 0,
    cancelled = 0;

  for (const todo of todos) {
    switch (todo.status) {
      case 'COMPLETED':
        completed++;
        break;
      case 'IN_PROGRESS':
        inProgress++;
        break;
      case 'PENDING':
        pending++;
        break;
      case 'QUEUED':
        queued++;
        break;
      case 'PAUSED':
        paused++;
        break;
      case 'FAILED':
        failed++;
        break;
      case 'CANCELLED':
        cancelled++;
        break;
    }
  }

  return {
    total,
    completed,
    inProgress,
    pending,
    queued,
    paused,
    failed,
    cancelled,
    overallProgress: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

/**
 * 决策类型的显示配置
 */
const DECISION_TYPE_CONFIG: Record<
  LeaderDecisionType,
  { label: string; icon: React.ElementType; colorClass: string }
> = {
  DIRECT_ANSWER: {
    label: '直接回答',
    icon: MessageCircle,
    colorClass: 'text-green-600 bg-green-50 border-green-200',
  },
  CREATE_TODO: {
    label: '创建任务',
    icon: CheckCircle2,
    colorClass: 'text-blue-600 bg-blue-50 border-blue-200',
  },
  CLARIFY: {
    label: '需要澄清',
    icon: HelpCircle,
    colorClass: 'text-amber-600 bg-amber-50 border-amber-200',
  },
  ACKNOWLEDGE: {
    label: '已了解',
    icon: MessageSquare,
    colorClass: 'text-gray-600 bg-gray-50 border-gray-200',
  },
};

/**
 * 对话消息显示组件
 */
function ConversationMessageItem({
  message,
  onClarifyOptionClick,
  onTodoClick,
}: {
  message: ConversationMessage;
  onClarifyOptionClick?: (option: string) => void;
  onTodoClick?: (todoId: string) => void;
}) {
  if (message.type === 'user') {
    return (
      <div className="flex gap-3 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100">
          <User className="h-4 w-4 text-blue-600" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">你</span>
            <span className="text-xs text-gray-400">
              {message.timestamp.toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-900">
            {safeString(message.content)}
          </p>
        </div>
      </div>
    );
  }

  // Leader 消息
  const config = message.decisionType
    ? DECISION_TYPE_CONFIG[message.decisionType]
    : null;
  const DecisionIcon = config?.icon || Brain;

  return (
    <div className="flex gap-3 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100">
        <Brain className="h-4 w-4 text-purple-600" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Leader</span>
          {config && (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
                config.colorClass
              )}
            >
              <DecisionIcon className="h-3 w-3" />
              {config.label}
            </span>
          )}
          <span className="text-xs text-gray-400">
            {message.timestamp.toLocaleTimeString('zh-CN', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>

        {/* 理解说明 */}
        {message.understanding && (
          <p className="mt-1 text-xs italic text-gray-500">
            💭 {safeString(message.understanding)}
          </p>
        )}

        {/* 响应内容 - Markdown渲染 */}
        <div className="mt-1">
          <AIMessageRenderer
            content={safeString(message.content)}
            className="text-sm"
          />
        </div>

        {/* 创建的 TODO - 可点击跳转 */}
        {message.todoCreated && (
          <button
            onClick={() => onTodoClick?.(message.todoCreated!.id)}
            className="mt-2 inline-flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs transition-colors hover:bg-blue-100"
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />
            <span className="text-blue-700">
              已创建任务: {safeString(message.todoCreated.title)}
            </span>
            <span className="text-blue-500">查看 →</span>
          </button>
        )}

        {/* 澄清选项 - 可点击发送 */}
        {message.clarifyOptions && message.clarifyOptions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.clarifyOptions.map((option, idx) => (
              <button
                key={idx}
                onClick={() => onClarifyOptionClick?.(option)}
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-700 transition-colors hover:border-amber-300 hover:bg-amber-100"
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ResearchCollaborationPanel({
  topicId,
  missionId,
  missionStatus,
  className,
}: ResearchCollaborationPanelProps) {
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null);
  const [conversationMessages, setConversationMessages] = useState<
    ConversationMessage[]
  >([]);
  const [isProcessingInput, setIsProcessingInput] = useState(false);
  const conversationEndRef = useRef<HTMLDivElement>(null);

  const {
    todos: apiTodos,
    todosSummary: apiSummary,
    isLoadingTodos,
    currentMission,
    fetchTodos,
  } = useTopicResearchStore();

  // 自动滚动到最新消息
  useEffect(() => {
    if (conversationEndRef.current) {
      conversationEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversationMessages]);

  // 合并 missionStatus.tasks 和 apiTodos（用户请求的TODO可能不在tasks中）
  const { todos, todosSummary } = useMemo(() => {
    const tasks = missionStatus?.tasks || [];
    const convertedTodos = tasks.map(convertTaskToTodo);
    const taskIds = new Set(convertedTodos.map((t) => t.id));

    // ★ 收集已有任务的维度名称和标题，用于去重 USER_REQUEST
    // 当用户请求新增维度时，会创建 USER_REQUEST todo，然后 executeAddDimension 又创建 ResearchTask
    // 两者描述同一个维度但 ID 不同，需要基于 dimensionName 或 title 去重
    const taskDimensionNames = new Set<string>();
    const taskTitlePrefixes = new Set<string>();

    for (const todo of convertedTodos) {
      if (todo.dimensionName) {
        taskDimensionNames.add(todo.dimensionName.toLowerCase().trim());
      }
      // 也收集 "研究: XXX" 格式的标题（去掉前缀后的部分）
      const titleMatch = todo.title.match(/^研究[：:]\s*(.+)$/);
      if (titleMatch) {
        taskTitlePrefixes.add(titleMatch[1].toLowerCase().trim());
      }
    }

    // 合并 API 返回的 TODO（去重，补充用户请求等类型）
    const mergedTodos = [...convertedTodos];
    for (const apiTodo of apiTodos) {
      // 基本 ID 去重
      if (taskIds.has(apiTodo.id)) {
        continue;
      }

      // ★ USER_REQUEST 类型的 TODO：如果已存在同名的 DIMENSION_RESEARCH 任务，则跳过
      // 这避免了"研究：XX维度"同时显示 USER_REQUEST 和 DIMENSION_RESEARCH 两条记录
      if (apiTodo.type === 'USER_REQUEST') {
        let shouldSkip = false;

        // 方法1: 基于 dimensionName 匹配
        if (apiTodo.dimensionName) {
          const normalizedName = apiTodo.dimensionName.toLowerCase().trim();
          if (taskDimensionNames.has(normalizedName)) {
            shouldSkip = true;
          }
        }

        // 方法2: 基于标题匹配（如 "研究：XX" 与 "研究: XX"）
        if (!shouldSkip) {
          const todoTitleMatch = apiTodo.title.match(/^研究[：:]\s*(.+)$/);
          if (todoTitleMatch) {
            const normalizedTitle = todoTitleMatch[1].toLowerCase().trim();
            if (
              taskTitlePrefixes.has(normalizedTitle) ||
              taskDimensionNames.has(normalizedTitle)
            ) {
              shouldSkip = true;
            }
          }
        }

        if (shouldSkip) {
          continue;
        }
      }

      mergedTodos.push(apiTodo);
    }

    // 按状态和优先级排序
    mergedTodos.sort((a, b) => {
      // 状态优先级：进行中 > 待处理 > 已完成
      const statusOrder: Record<string, number> = {
        IN_PROGRESS: 0,
        QUEUED: 1,
        PENDING: 2,
        PAUSED: 3,
        COMPLETED: 4,
        FAILED: 5,
        CANCELLED: 6,
      };
      const statusDiff =
        (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
      if (statusDiff !== 0) return statusDiff;
      // 同状态按优先级排序
      return (b.priority ?? 0) - (a.priority ?? 0);
    });

    return {
      todos: mergedTodos,
      todosSummary: calculateSummary(mergedTodos),
    };
  }, [missionStatus?.tasks, apiTodos]);

  // Load TODOs from API (包括用户请求创建的 TODO)
  useEffect(() => {
    if (topicId) {
      void fetchTodos(topicId, missionId);
    }
  }, [topicId, missionId, fetchTodos]);

  // Get current mission ID
  const activeMissionId = missionId || missionStatus?.id || currentMission?.id;

  // Load conversation history from API
  useEffect(() => {
    const loadConversationHistory = async () => {
      if (!topicId || !activeMissionId) return;

      try {
        const messages = await getTeamMessages(topicId, {
          missionId: activeMissionId,
          limit: 50,
        });

        // 只转换用户消息和 Leader 响应
        const conversationMsgs: ConversationMessage[] = messages
          .filter(
            (msg: TeamMessage) =>
              msg.messageType === 'USER_MESSAGE' ||
              msg.messageType === 'LEADER_RESPONSE'
          )
          .map((msg: TeamMessage) => ({
            id: msg.id,
            type: msg.messageType === 'USER_MESSAGE' ? 'user' : 'leader',
            content: msg.content,
            timestamp: new Date(msg.createdAt),
          }));

        if (conversationMsgs.length > 0) {
          setConversationMessages(conversationMsgs);
        }
      } catch (error) {
        console.error('[loadConversationHistory] Failed:', error);
      }
    };

    void loadConversationHistory();
  }, [topicId, activeMissionId]);

  // Handle user instruction submission - 使用 AI Leader 解码用户意图
  const handleInstructionSubmit = useCallback(
    async (instruction: string) => {
      console.log('[handleInstructionSubmit] Called with:', {
        instruction,
        activeMissionId,
        topicId,
      });

      if (!activeMissionId) {
        console.warn(
          '[handleInstructionSubmit] No active mission to add instruction to'
        );
        alert('请先启动研究任务');
        return;
      }

      // 1. 立即显示用户消息
      const userMessage: ConversationMessage = {
        id: `user-${Date.now()}`,
        type: 'user',
        content: instruction,
        timestamp: new Date(),
      };
      setConversationMessages((prev) => [...prev, userMessage]);
      setIsProcessingInput(true);

      try {
        // 2. 调用 Leader 解码 API
        console.log('[handleInstructionSubmit] Calling leaderChat API...');
        const result = await leaderChat(topicId, instruction, activeMissionId);
        console.log('[handleInstructionSubmit] Leader response:', result);

        // 3. 添加 Leader 响应消息
        const leaderMessage: ConversationMessage = {
          id: `leader-${Date.now()}`,
          type: 'leader',
          content: result.response,
          timestamp: new Date(),
          decisionType: result.decisionType,
          understanding: result.understanding,
          todoCreated: result.todo,
          clarifyOptions: result.clarifyOptions,
        };
        setConversationMessages((prev) => [...prev, leaderMessage]);

        // 4. 如果创建了 TODO，刷新列表
        if (result.decisionType === 'CREATE_TODO' && result.todo) {
          console.log(
            '[handleInstructionSubmit] TODO created, refreshing list...'
          );
          await fetchTodos(topicId, activeMissionId);
        }
      } catch (error) {
        console.error('[handleInstructionSubmit] Leader chat failed:', error);

        // 添加错误消息
        const errorMessage: ConversationMessage = {
          id: `leader-error-${Date.now()}`,
          type: 'leader',
          content: `抱歉，处理您的请求时遇到问题: ${error instanceof Error ? error.message : '未知错误'}`,
          timestamp: new Date(),
        };
        setConversationMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsProcessingInput(false);
      }
    },
    [topicId, activeMissionId, fetchTodos]
  );

  // Handle TODO selection
  const handleSelectTodo = useCallback((todoId: string) => {
    setSelectedTodoId(todoId);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedTodoId(null);
  }, []);

  // Handle clarify option click - 发送选中的澄清选项
  const handleClarifyOptionClick = useCallback(
    (option: string) => {
      void handleInstructionSubmit(option);
    },
    [handleInstructionSubmit]
  );

  // Handle TODO click from conversation - 跳转到 TODO 详情
  const handleTodoClick = useCallback((todoId: string) => {
    setSelectedTodoId(todoId);
  }, []);

  // 获取当前选中的 TODO 对象（用于传递给 TodoDetailPanel，避免 API 调用）
  const selectedTodo = useMemo(() => {
    if (!selectedTodoId) return undefined;
    return todos.find((t) => t.id === selectedTodoId);
  }, [selectedTodoId, todos]);

  return (
    <div className={cn('flex h-full', className)}>
      {/* Main Content Area - 双区域布局 */}
      <div
        className={cn(
          'flex flex-col gap-3 p-3 transition-all duration-300',
          selectedTodoId ? 'w-1/2' : 'w-full'
        )}
      >
        {/* ★ 任务区 - 上半部分 */}
        <div className="flex h-[40%] min-h-[200px] flex-col rounded-lg border bg-white">
          <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
            <ListTodo className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium">任务列表</span>
            {todos.length > 0 && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                {todosSummary.completed}/{todos.length}
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {isLoadingTodos && !todos.length ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : todos.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                暂无任务
              </div>
            ) : (
              <ResearchTodoList
                topicId={topicId}
                todos={todos}
                summary={todosSummary}
                selectedTodoId={selectedTodoId}
                onTodoSelect={handleSelectTodo}
              />
            )}
          </div>
        </div>

        {/* ★ 对话区 - 下半部分 */}
        <div className="flex min-h-[200px] flex-1 flex-col rounded-lg border bg-white">
          <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
            <MessageSquare className="h-4 w-4 text-purple-600" />
            <span className="text-sm font-medium">与 Leader 对话</span>
            {conversationMessages.length > 0 && (
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                {conversationMessages.length}
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {conversationMessages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                暂无对话
              </div>
            ) : (
              <div className="divide-y">
                {conversationMessages.map((msg) => (
                  <ConversationMessageItem
                    key={msg.id}
                    message={msg}
                    onClarifyOptionClick={handleClarifyOptionClick}
                    onTodoClick={handleTodoClick}
                  />
                ))}
                {/* 正在处理指示器 */}
                {isProcessingInput && (
                  <div className="flex items-center gap-2 py-3 text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Leader 正在思考...</span>
                  </div>
                )}
                <div ref={conversationEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* 输入框 - 固定在底部 */}
        <div className="shrink-0">
          <QuickCommandBar
            topicId={topicId}
            missionId={activeMissionId}
            onSubmit={handleInstructionSubmit}
            disabled={!activeMissionId || isProcessingInput}
            placeholder={
              activeMissionId
                ? '输入研究指令，如：深入研究政策环境...'
                : '请先启动研究任务'
            }
          />
        </div>
      </div>

      {/* TODO Detail Panel - Shows when a TODO is selected */}
      {selectedTodoId && (
        <TodoDetailPanel
          topicId={topicId}
          todoId={selectedTodoId}
          initialTodo={selectedTodo}
          onClose={handleCloseDetail}
          className="w-1/2"
        />
      )}
    </div>
  );
}

export default ResearchCollaborationPanel;
