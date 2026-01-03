/**
 * Slides Engine - Team SSE 生成 Hook
 *
 * 处理 Team 协作模式的幻灯片生成流程：
 * - POST-based SSE 流式生成
 * - Agent 状态追踪
 * - 实时进度展示
 */

import { useCallback, useRef, useState } from 'react';
import { useSlidesStore, calculateOverallProgress } from '@/stores/slidesStore';
import { useAuth } from '@/contexts/AuthContext';
import { config } from '@/lib/utils/config';
import type {
  GenerateTeamRequest,
  SlidesTeamEvent,
  SlidesTeamEventType,
  SlidesAgentRole,
  AgentState,
  TeamExecutionState,
  ExecutionStartedData,
  ExecutionCompletedData,
  ExecutionFailedData,
  PhaseStartedData,
  PhaseProgressData,
  PhaseCompletedData,
  PhaseRetryData,
  AgentThinkingData,
  AgentWorkingData,
  AgentCompletedData,
  AgentHandoffData,
  AgentSwitchedData,
  SlideGeneratingData,
  SlideGeneratedData,
  ReviewIssueData,
  ReviewFixedData,
  ReviewScoringData,
  ReviewRejectedData,
  ReviewMaxRetriesData,
  ReviewDiagnosticsData,
  SLIDES_TEAM_AGENTS,
} from '@/types/slides-team';
import type { PageState, GenerationProgress } from '@/types/slides';

const API_BASE = config.apiUrl || '';

// ============================================================================
// 初始 Agent 状态
// ============================================================================

function createInitialAgentStates(): Record<SlidesAgentRole, AgentState> {
  return {
    leader: { role: 'leader', name: 'Slides Architect', status: 'idle' },
    analyst: { role: 'analyst', name: 'Content Analyst', status: 'idle' },
    strategist: {
      role: 'strategist',
      name: 'Visual Strategist',
      status: 'idle',
    },
    writer: { role: 'writer', name: 'Content Writer', status: 'idle' },
    reviewer: { role: 'reviewer', name: 'Quality Reviewer', status: 'idle' },
  };
}

// ============================================================================
// Hook Options
// ============================================================================

interface UseSlideGenerationTeamOptions {
  onExecutionStarted?: (sessionId: string) => void;
  onPhaseStarted?: (phase: string, agent: SlidesAgentRole) => void;
  onAgentThinking?: (agent: SlidesAgentRole, thought: string) => void;
  onAgentWorking?: (agent: SlidesAgentRole, task: string) => void;
  onAgentCompleted?: (agent: SlidesAgentRole, result: string) => void;
  onHandoff?: (from: SlidesAgentRole, to: SlidesAgentRole) => void;
  onSlideGenerated?: (pageNumber: number, html?: string) => void;
  onComplete?: (result: {
    sessionId: string;
    checkpointId: string;
    totalPages: number;
  }) => void;
  onError?: (error: string) => void;
}

// ============================================================================
// Main Hook
// ============================================================================

export function useSlideGenerationTeam(
  options: UseSlideGenerationTeamOptions = {}
) {
  const abortControllerRef = useRef<AbortController | null>(null);
  const { user } = useAuth();

  // Team 状态
  const [teamState, setTeamState] = useState<TeamExecutionState | null>(null);
  const [teamEvents, setTeamEvents] = useState<SlidesTeamEvent[]>([]);

  // Store 状态
  const {
    session,
    generating,
    progress,
    pages,
    error,
    setSession,
    setGenerating,
    setProgress,
    setPages,
    updatePage,
    setError,
    clearStreamEvents,
  } = useSlidesStore();

  // ============================================================================
  // 更新 Agent 状态
  // ============================================================================

  const updateAgentState = useCallback(
    (role: SlidesAgentRole, updates: Partial<AgentState>) => {
      setTeamState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          agents: {
            ...prev.agents,
            [role]: { ...prev.agents[role], ...updates },
          },
        };
      });
    },
    []
  );

  // ============================================================================
  // 处理 Team 事件
  // ============================================================================

  const handleTeamEvent = useCallback(
    (event: SlidesTeamEvent) => {
      console.log('[Team SSE] Event:', event.type, event.data);
      setTeamEvents((prev) => [...prev, event]);

      switch (event.type) {
        case 'execution:started': {
          const data = event.data as ExecutionStartedData;
          console.log('[Team SSE] Execution started:', data.sessionId);

          // 初始化 Team 状态
          setTeamState({
            executionId: event.executionId,
            sessionId: data.sessionId,
            phase: 'initializing',
            phaseProgress: 0,
            overallProgress: 0,
            agents: createInitialAgentStates(),
            handoffs: [],
            issues: [],
            fixes: [],
            scoringHistory: [],
            rejections: [],
            agentSwitches: [],
          });

          setSession({
            id: data.sessionId,
            userId: user?.id || 'anonymous',
            title: '演示文稿',
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          options.onExecutionStarted?.(data.sessionId);
          break;
        }

        case 'phase:started': {
          const data = event.data as PhaseStartedData;
          console.log(
            '[Team SSE] Phase started:',
            data.phase,
            'by',
            data.agent
          );

          setTeamState((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              phase: data.phase,
              currentAgent: data.agent,
              phaseProgress: 0,
            };
          });

          // 更新进度显示
          setProgress({
            phase: mapPhaseToProgress(data.phase),
            phaseProgress: 0,
            overallProgress: calculateTeamProgress(data.phase, 0),
            message: data.description,
          });

          options.onPhaseStarted?.(data.phase, data.agent);
          break;
        }

        case 'phase:progress': {
          const data = event.data as PhaseProgressData;
          setTeamState((prev) => {
            if (!prev) return prev;
            return { ...prev, phaseProgress: data.progress };
          });

          const currentProgress = useSlidesStore.getState().progress;
          setProgress({
            phase: currentProgress?.phase || mapPhaseToProgress(data.phase),
            phaseProgress: data.progress,
            overallProgress: calculateTeamProgress(data.phase, data.progress),
            message: data.message,
          });
          break;
        }

        case 'phase:completed': {
          const data = event.data as PhaseCompletedData;
          console.log(
            '[Team SSE] Phase completed:',
            data.phase,
            'in',
            data.duration,
            'ms'
          );

          // 如果是 planning 阶段完成，初始化页面
          if (data.phase === 'planning' && data.result) {
            const planResult = data.result as {
              totalPages?: number;
              pageOutlines?: Array<{
                pageNumber: number;
                title: string;
                templateType: string;
              }>;
            };
            // 安全检查：确保 pageOutlines 存在
            if (
              planResult.pageOutlines &&
              Array.isArray(planResult.pageOutlines)
            ) {
              const initialPages: PageState[] = planResult.pageOutlines.map(
                (outline) => ({
                  pageNumber: outline.pageNumber,
                  outline: {
                    pageNumber: outline.pageNumber,
                    title: outline.title,
                    templateType:
                      outline.templateType as PageState['outline']['templateType'],
                    purpose: '',
                    keyPoints: [],
                  },
                  status: 'pending',
                })
              );
              setPages(initialPages);
            }
          }
          break;
        }

        case 'agent:thinking': {
          const data = event.data as AgentThinkingData;
          updateAgentState(data.agent, {
            status: 'thinking',
            thought: data.thought,
          });
          options.onAgentThinking?.(data.agent, data.thought);
          break;
        }

        case 'agent:working': {
          const data = event.data as AgentWorkingData;
          updateAgentState(data.agent, {
            status: 'working',
            currentTask: data.task,
            progress: data.progress,
          });
          options.onAgentWorking?.(data.agent, data.task);
          break;
        }

        case 'agent:completed': {
          const data = event.data as AgentCompletedData;
          updateAgentState(data.agent, {
            status: 'completed',
            result: data.result,
            duration: data.duration,
          });
          options.onAgentCompleted?.(data.agent, data.result);
          break;
        }

        case 'agent:handoff': {
          const data = event.data as AgentHandoffData;
          console.log(
            '[Team SSE] Handoff:',
            data.fromAgent,
            '->',
            data.toAgent
          );

          setTeamState((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              currentAgent: data.toAgent,
              handoffs: [...prev.handoffs, data],
            };
          });

          // 重置 toAgent 状态
          updateAgentState(data.toAgent, { status: 'idle' });
          options.onHandoff?.(data.fromAgent, data.toAgent);
          break;
        }

        case 'slide:generating': {
          const data = event.data as SlideGeneratingData;
          console.log('[Team SSE] Slide generating:', data.pageNumber);

          updatePage(data.pageNumber, { status: 'generating' });

          const currentProgress = useSlidesStore.getState().progress;
          setProgress({
            phase: currentProgress?.phase || 'page_rendering',
            phaseProgress: currentProgress?.phaseProgress || 0,
            overallProgress: currentProgress?.overallProgress || 50,
            currentPage: data.pageNumber,
            totalPages: data.totalPages,
            message: `正在生成第 ${data.pageNumber}/${data.totalPages} 页: ${data.title}`,
          });
          break;
        }

        case 'slide:generated': {
          const data = event.data as SlideGeneratedData;
          console.log('[Team SSE] Slide generated:', data.pageNumber);

          updatePage(data.pageNumber, {
            status: 'completed',
            html: data.html,
          });

          options.onSlideGenerated?.(data.pageNumber, data.html);
          break;
        }

        case 'review:issue_found': {
          const data = event.data as ReviewIssueData;
          console.log(
            '[Team SSE] Issue found:',
            data.type,
            'on page',
            data.pageNumber
          );

          setTeamState((prev) => {
            if (!prev) return prev;
            return { ...prev, issues: [...prev.issues, data] };
          });
          break;
        }

        case 'review:auto_fixed': {
          const data = event.data as ReviewFixedData;
          console.log(
            '[Team SSE] Issue fixed:',
            data.issueType,
            'on page',
            data.pageNumber
          );

          setTeamState((prev) => {
            if (!prev) return prev;
            return { ...prev, fixes: [...prev.fixes, data] };
          });
          break;
        }

        case 'review:scoring': {
          const data = event.data as ReviewScoringData;
          console.log(
            '[Team SSE] Review scoring:',
            data.phase,
            data.score,
            '/',
            data.threshold,
            data.passed ? '✓' : '✗'
          );

          setTeamState((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              scoringHistory: [...prev.scoringHistory, data],
            };
          });

          // 更新对应 Agent 的评分
          updateAgentState(data.agent, {
            lastScore: data.score,
            scoreDimensions: data.dimensions,
          });
          break;
        }

        case 'review:rejected': {
          const data = event.data as ReviewRejectedData;
          console.log(
            '[Team SSE] Review rejected:',
            data.phase,
            'attempt',
            data.attempt,
            'score',
            data.score
          );

          setTeamState((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              rejections: [...prev.rejections, data],
            };
          });
          break;
        }

        case 'review:max_retries_reached': {
          const data = event.data as ReviewMaxRetriesData;
          console.log(
            '[Team SSE] Max retries reached:',
            data.phase,
            'action:',
            data.action
          );
          break;
        }

        case 'review:diagnostics': {
          // v3.2: 接收诊断信息
          const data = event.data as ReviewDiagnosticsData;
          console.log(
            '[Team SSE] Diagnostics received:',
            data.diagnostics.length,
            'pages, fix rate:',
            data.overallFixRate + '%'
          );

          setTeamState((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              diagnostics: data.diagnostics,
            };
          });
          break;
        }

        case 'phase:retry': {
          const data = event.data as PhaseRetryData;
          console.log(
            '[Team SSE] Phase retry:',
            data.phase,
            'attempt',
            data.attempt,
            '/',
            data.maxAttempts
          );

          // 更新当前 Agent 的重试次数
          const currentAgent = teamState?.currentAgent;
          if (currentAgent) {
            updateAgentState(currentAgent, {
              retryCount: data.attempt,
            });
          }
          break;
        }

        case 'agent:switched': {
          const data = event.data as AgentSwitchedData;
          console.log(
            '[Team SSE] Agent switched:',
            data.originalAgent,
            '->',
            data.newAgent
          );

          setTeamState((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              agentSwitches: [...prev.agentSwitches, data],
            };
          });

          // 更新 Agent 变体信息
          updateAgentState(data.originalAgent, {
            variant: data.newAgent,
            retryCount: 0, // 重置重试次数
          });
          break;
        }

        case 'execution:completed': {
          const data = event.data as ExecutionCompletedData;
          console.log(
            '[Team SSE] Execution completed:',
            data.totalPages,
            'pages in',
            data.totalTime,
            'ms'
          );

          setTeamState((prev) => {
            if (!prev) return prev;
            return { ...prev, phase: 'completed', overallProgress: 100 };
          });

          setProgress({
            phase: 'quality_review',
            phaseProgress: 100,
            overallProgress: 100,
            totalPages: data.totalPages,
            message: '生成完成！',
          });

          setGenerating(false);
          options.onComplete?.({
            sessionId: teamState?.sessionId || '',
            checkpointId: data.checkpointId,
            totalPages: data.totalPages,
          });
          break;
        }

        case 'execution:failed': {
          const data = event.data as ExecutionFailedData;
          console.error('[Team SSE] Execution failed:', data.error);

          setTeamState((prev) => {
            if (!prev) return prev;
            return { ...prev, phase: 'failed' };
          });

          setError(data.error);
          setGenerating(false);
          options.onError?.(data.error);
          break;
        }

        case 'heartbeat': {
          // 心跳事件，保持连接
          break;
        }

        default:
          console.log('[Team SSE] Unknown event:', event.type);
      }
    },
    [
      user?.id,
      teamState?.sessionId,
      setSession,
      setProgress,
      setPages,
      updatePage,
      setError,
      setGenerating,
      updateAgentState,
      options,
    ]
  );

  // ============================================================================
  // 开始 Team 生成
  // ============================================================================

  const generateWithTeam = useCallback(
    async (request: GenerateTeamRequest) => {
      console.log('[Team SSE] Starting Team generation');

      // 清理状态
      clearStreamEvents();
      setTeamEvents([]);
      setTeamState(null);
      setError(null);
      setGenerating(true);
      setProgress({
        phase: 'task_decomposition',
        phaseProgress: 0,
        overallProgress: 0,
        message: '正在初始化 AI 团队...',
      });

      // 创建 AbortController
      abortControllerRef.current = new AbortController();

      try {
        const url = `${API_BASE}/ai-office/slides/team/generate?userId=${user?.id || 'anonymous'}`;
        console.log('[Team SSE] Connecting to:', url);

        // 使用 fetch 发送 POST 请求并处理 SSE 流
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify(request),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            console.log('[Team SSE] Stream ended');
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          // 解析 SSE 事件
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // 保留最后一行（可能不完整）

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6).trim();
              if (jsonStr) {
                try {
                  const event: SlidesTeamEvent = JSON.parse(jsonStr);
                  handleTeamEvent(event);
                } catch (e) {
                  console.error('[Team SSE] Parse error:', e, 'Data:', jsonStr);
                }
              }
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          console.log('[Team SSE] Aborted by user');
          return;
        }

        console.error('[Team SSE] Error:', err);
        const errorMessage = err instanceof Error ? err.message : '生成失败';
        setError(errorMessage);
        setGenerating(false);
        options.onError?.(errorMessage);
      }
    },
    [
      user?.id,
      clearStreamEvents,
      setError,
      setGenerating,
      setProgress,
      handleTeamEvent,
      options,
    ]
  );

  // ============================================================================
  // 取消生成
  // ============================================================================

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setGenerating(false);
    setProgress(null);
    setTeamState(null);
  }, [setGenerating, setProgress]);

  // ============================================================================
  // 返回值
  // ============================================================================

  return {
    // Store 状态
    session,
    generating,
    progress,
    pages,
    error,

    // Team 特有状态
    teamState,
    teamEvents,

    // 操作
    generateWithTeam,
    cancel,
  };
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 映射 Team Phase 到 GenerationProgress Phase
 */
function mapPhaseToProgress(
  phase: string
):
  | 'task_decomposition'
  | 'outline_planning'
  | 'page_rendering'
  | 'quality_review' {
  switch (phase) {
    case 'initializing':
    case 'analyzing':
      return 'task_decomposition';
    case 'planning':
      return 'outline_planning';
    case 'generating':
    case 'rendering':
      return 'page_rendering';
    case 'reviewing':
    case 'completed':
      return 'quality_review';
    default:
      return 'task_decomposition';
  }
}

/**
 * 计算 Team 整体进度
 */
function calculateTeamProgress(phase: string, phaseProgress: number): number {
  const phaseWeights: Record<string, { start: number; weight: number }> = {
    initializing: { start: 0, weight: 5 },
    analyzing: { start: 5, weight: 15 },
    planning: { start: 20, weight: 15 },
    generating: { start: 35, weight: 40 },
    rendering: { start: 75, weight: 15 },
    reviewing: { start: 90, weight: 10 },
    completed: { start: 100, weight: 0 },
  };

  const config = phaseWeights[phase] || { start: 0, weight: 10 };
  return Math.min(100, config.start + (phaseProgress / 100) * config.weight);
}

export default useSlideGenerationTeam;
