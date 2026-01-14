/**
 * ResearchCollaborationPanel - 研究协作面板
 *
 * 整合 TODO List 和 QuickCommandBar 的主面板
 * 支持查看 TODO 详情和 Agent 思考过程
 *
 * 数据来源优先级：
 * 1. missionStatus.tasks (从父组件传入，与左侧面板同源)
 * 2. fetchTodos API (作为备选)
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ResearchTodoList } from './ResearchTodoList';
import { QuickCommandBar } from './QuickCommandBar';
import { TodoDetailPanel } from './TodoDetailPanel';
import { useTopicResearchStore } from '@/stores/topicResearchStore';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/common';
import type { MissionStatus, TaskStatus } from '@/lib/api/topic-research';
import type {
  ResearchTodo,
  ResearchTodoStatus,
  ResearchTodoType,
  TodoSummary,
} from '@/types/topic-research';

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

  return {
    id: task.id,
    topicId: '',
    missionId: '',
    type: typeMap[task.taskType] || ('DIMENSION_RESEARCH' as ResearchTodoType),
    title: task.title,
    description: task.dimensionName,
    dimensionName: task.dimensionName,
    agentName: task.assignedAgent,
    status: statusMap[task.status] || ('PENDING' as ResearchTodoStatus),
    progress:
      task.progress ||
      (task.status === 'COMPLETED'
        ? 100
        : task.status === 'EXECUTING'
          ? 50
          : 0),
    priority: 0,
    dependsOn: [],
    userCanPause: task.status === 'EXECUTING',
    userCanCancel: task.status === 'PENDING' || task.status === 'ASSIGNED',
    userCanPrioritize: task.status === 'PENDING',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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

export function ResearchCollaborationPanel({
  topicId,
  missionId,
  missionStatus,
  className,
}: ResearchCollaborationPanelProps) {
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null);

  const {
    todos: apiTodos,
    todosSummary: apiSummary,
    isLoadingTodos,
    currentMission,
    fetchTodos,
    createUserRequestTodo,
  } = useTopicResearchStore();

  // 优先使用 missionStatus.tasks，转换为 ResearchTodo 格式
  const { todos, todosSummary } = useMemo(() => {
    const tasks = missionStatus?.tasks || [];
    if (tasks.length > 0) {
      const convertedTodos = tasks.map(convertTaskToTodo);
      return {
        todos: convertedTodos,
        todosSummary: calculateSummary(convertedTodos),
      };
    }
    // 如果没有 missionStatus.tasks，使用 API 返回的数据
    return {
      todos: apiTodos,
      todosSummary: apiSummary,
    };
  }, [missionStatus?.tasks, apiTodos, apiSummary]);

  // Load TODOs from API as fallback
  useEffect(() => {
    if (topicId && !missionStatus?.tasks?.length) {
      void fetchTodos(topicId, missionId);
    }
  }, [topicId, missionId, missionStatus?.tasks?.length, fetchTodos]);

  // Get current mission ID
  const activeMissionId = missionId || missionStatus?.id || currentMission?.id;

  // Handle user instruction submission
  const handleInstructionSubmit = useCallback(
    async (instruction: string) => {
      if (!activeMissionId) {
        console.warn('No active mission to add instruction to');
        return;
      }
      await createUserRequestTodo(topicId, activeMissionId, instruction);
      // Refresh TODOs
      await fetchTodos(topicId, activeMissionId);
    },
    [topicId, activeMissionId, createUserRequestTodo, fetchTodos]
  );

  // Handle TODO selection
  const handleSelectTodo = useCallback((todoId: string) => {
    setSelectedTodoId(todoId);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedTodoId(null);
  }, []);

  // 获取当前选中的 TODO 对象（用于传递给 TodoDetailPanel，避免 API 调用）
  const selectedTodo = useMemo(() => {
    if (!selectedTodoId) return undefined;
    return todos.find((t) => t.id === selectedTodoId);
  }, [selectedTodoId, todos]);

  return (
    <div className={cn('flex h-full', className)}>
      {/* Main Content Area */}
      <div
        className={cn(
          'flex flex-col transition-all duration-300',
          selectedTodoId ? 'w-1/2' : 'w-full'
        )}
      >
        {/* Quick Command Bar - Always visible at top */}
        <div className="bg-background/95 supports-[backdrop-filter]:bg-background/60 shrink-0 border-b p-4 backdrop-blur">
          <QuickCommandBar
            topicId={topicId}
            missionId={activeMissionId}
            onSubmit={handleInstructionSubmit}
            disabled={!activeMissionId}
            placeholder={
              activeMissionId
                ? '输入研究指令，如：深入研究政策环境...'
                : '请先启动研究任务'
            }
          />
        </div>

        {/* TODO List - Scrollable area */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoadingTodos && !todos.length ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
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
