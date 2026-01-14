/**
 * ResearchCollaborationPanel - 研究协作面板
 *
 * 整合 TODO List 和 QuickCommandBar 的主面板
 * 支持查看 TODO 详情和 Agent 思考过程
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { ResearchTodoList } from './ResearchTodoList';
import { QuickCommandBar } from './QuickCommandBar';
import { TodoDetailPanel } from './TodoDetailPanel';
import { useTopicResearchStore } from '@/stores/topicResearchStore';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/common';

interface ResearchCollaborationPanelProps {
  topicId: string;
  missionId?: string;
  className?: string;
}

export function ResearchCollaborationPanel({
  topicId,
  missionId,
  className,
}: ResearchCollaborationPanelProps) {
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null);

  const {
    todos,
    todosSummary,
    isLoadingTodos,
    currentMission,
    fetchTodos,
    createUserRequestTodo,
  } = useTopicResearchStore();

  // Load TODOs on mount and when mission changes
  useEffect(() => {
    if (topicId) {
      void fetchTodos(topicId, missionId);
    }
  }, [topicId, missionId, fetchTodos]);

  // Get current mission ID (either from props or from store)
  const activeMissionId = missionId || currentMission?.id;

  // Handle user instruction submission
  const handleInstructionSubmit = useCallback(
    async (instruction: string) => {
      if (!activeMissionId) {
        console.warn('No active mission to add instruction to');
        return;
      }
      await createUserRequestTodo(topicId, activeMissionId, instruction);
      // Refresh TODOs to show the new one
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
        <div className="flex-1 overflow-hidden">
          {isLoadingTodos ? (
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
          onClose={handleCloseDetail}
          className="w-1/2"
        />
      )}
    </div>
  );
}

export default ResearchCollaborationPanel;
