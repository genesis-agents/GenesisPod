/**
 * Slides Engine v3.0 - 生成 Hook
 *
 * 处理幻灯片生成流程，包括：
 * - SSE 流式生成
 * - 进度追踪
 * - 错误处理
 */

import { useCallback, useRef } from 'react';
import {
  useSlidesV3Store,
  calculateOverallProgress,
} from '@/stores/slidesV3Store';
import { useAuth } from '@/contexts/AuthContext';
import { config } from '@/lib/utils/config';
import type {
  GenerateV3Request,
  StreamEvent,
  GenerationProgress,
  PageState,
  TaskDecomposition,
  OutlinePlan,
  QualityReport,
} from '@/types/slides-v3';

const API_BASE = config.apiUrl || '';

interface UseSlideGenerationV3Options {
  onSessionCreated?: (sessionId: string) => void;
  onPhaseStarted?: (phase: string) => void;
  onPhaseCompleted?: (phase: string, data: unknown) => void;
  onPageCompleted?: (pageNumber: number) => void;
  onComplete?: (result: { sessionId: string; checkpointId: string }) => void;
  onError?: (error: string) => void;
}

export function useSlideGenerationV3(
  options: UseSlideGenerationV3Options = {}
) {
  const abortControllerRef = useRef<AbortController | null>(null);
  const { user } = useAuth();

  const {
    session,
    generating,
    progress,
    pages,
    taskDecomposition,
    outlinePlan,
    qualityReport,
    error,
    setSession,
    setGenerating,
    setProgress,
    setPages,
    updatePage,
    setTaskDecomposition,
    setOutlinePlan,
    setQualityReport,
    addStreamEvent,
    clearStreamEvents,
    setError,
    addCheckpoint,
  } = useSlidesV3Store();

  /**
   * 处理阶段完成
   */
  const handlePhaseCompleted = useCallback(
    (phase: string, data: unknown) => {
      console.log('[SSE] Phase completed:', phase, data);
      switch (phase) {
        case 'task_decomposition':
          setTaskDecomposition(data as TaskDecomposition);
          break;
        case 'outline_planning':
          const outlineData = data as OutlinePlan;
          setOutlinePlan(outlineData);
          // 初始化页面状态
          const initialPages: PageState[] = outlineData.pages.map(
            (outline) => ({
              pageNumber: outline.pageNumber,
              outline,
              status: 'pending',
            })
          );
          setPages(initialPages);
          break;
        case 'quality_review':
          setQualityReport(data as QualityReport);
          break;
      }
    },
    [setTaskDecomposition, setOutlinePlan, setPages, setQualityReport]
  );

  /**
   * 处理流事件 - 必须在 generate 之前定义
   */
  const handleStreamEvent = useCallback(
    (event: StreamEvent) => {
      console.log('[SSE] Received event:', event.type, event);

      switch (event.type) {
        case 'session_created':
          const sessionData = event.data as {
            session: { id: string; title: string };
          };
          console.log('[SSE] Session created:', sessionData.session.id);
          setSession({
            id: sessionData.session.id,
            userId: user?.id || 'anonymous',
            title: sessionData.session.title,
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          options.onSessionCreated?.(sessionData.session.id);
          break;

        case 'phase_started':
          const phaseStartData = event.data as { phase: string };
          console.log('[SSE] Phase started:', phaseStartData.phase);
          setProgress({
            phase: phaseStartData.phase as GenerationProgress['phase'],
            phaseProgress: 0,
            overallProgress: calculateOverallProgress(
              phaseStartData.phase as GenerationProgress['phase'],
              0
            ),
            message: getPhaseMessage(phaseStartData.phase, 'started'),
          });
          options.onPhaseStarted?.(phaseStartData.phase);
          break;

        case 'phase_completed':
          const phaseCompleteData = event.data as {
            phase: string;
            data: unknown;
          };
          handlePhaseCompleted(phaseCompleteData.phase, phaseCompleteData.data);
          options.onPhaseCompleted?.(
            phaseCompleteData.phase,
            phaseCompleteData.data
          );
          break;

        case 'checkpoint_created':
          const checkpointData = event.data as {
            type: string;
            pageNumber?: number;
          };
          console.log('[SSE] Checkpoint created:', checkpointData.type);
          break;

        case 'page_started':
          const pageStartData = event.data as {
            pageNumber: number;
            totalPages: number;
          };
          console.log('[SSE] Page started:', pageStartData.pageNumber);
          const currentProgress = useSlidesV3Store.getState().progress;
          setProgress({
            phase: currentProgress?.phase || 'page_rendering',
            phaseProgress: currentProgress?.phaseProgress || 0,
            overallProgress: currentProgress?.overallProgress || 0,
            currentPage: pageStartData.pageNumber,
            totalPages: pageStartData.totalPages,
            message: `正在生成第 ${pageStartData.pageNumber} 页...`,
          });
          updatePage(pageStartData.pageNumber, { status: 'generating' });
          break;

        case 'page_completed':
          const pageCompleteData = event.data as {
            pageNumber: number;
            totalPages: number;
          };
          console.log('[SSE] Page completed:', pageCompleteData.pageNumber);
          updatePage(pageCompleteData.pageNumber, { status: 'completed' });
          options.onPageCompleted?.(pageCompleteData.pageNumber);
          break;

        case 'progress_update':
          const progressData = event.data as {
            phase: string;
            current: number;
            total: number;
            percentage: number;
          };
          console.log('[SSE] Progress update:', progressData);
          setProgress({
            phase: progressData.phase as GenerationProgress['phase'],
            phaseProgress: progressData.percentage,
            overallProgress: calculateOverallProgress(
              progressData.phase as GenerationProgress['phase'],
              progressData.percentage
            ),
            currentPage: progressData.current,
            totalPages: progressData.total,
            message: `正在生成第 ${progressData.current}/${progressData.total} 页...`,
          });
          break;

        case 'error':
          const errorData = event.data as { error: string };
          console.error('[SSE] Error:', errorData.error);
          setError(errorData.error);
          setGenerating(false);
          options.onError?.(errorData.error);
          break;

        case 'complete':
          const completeData = event.data as {
            sessionId: string;
            checkpointId: string;
            totalPages: number;
            qualityScore: number;
            durationMs: number;
          };
          console.log('[SSE] Complete:', completeData);
          setProgress({
            phase: 'quality_review',
            phaseProgress: 100,
            overallProgress: 100,
            totalPages: completeData.totalPages,
            message: '生成完成！',
          });
          setGenerating(false);
          options.onComplete?.({
            sessionId: completeData.sessionId,
            checkpointId: completeData.checkpointId,
          });
          break;

        default:
          console.log('[SSE] Unknown event type:', event.type);
      }
    },
    [
      setSession,
      setProgress,
      updatePage,
      setError,
      setGenerating,
      handlePhaseCompleted,
      options,
      user?.id,
    ]
  );

  /**
   * 开始生成幻灯片
   */
  const generate = useCallback(
    async (request: GenerateV3Request) => {
      console.log('[SSE] Starting generation:', request.title);

      // 清理之前的状态
      clearStreamEvents();
      setError(null);
      setGenerating(true);
      setProgress({
        phase: 'task_decomposition',
        phaseProgress: 0,
        overallProgress: 0,
        message: '正在分析素材...',
      });

      // 创建 AbortController
      abortControllerRef.current = new AbortController();

      try {
        // 构建 SSE URL
        const params = new URLSearchParams({
          userId: user?.id || 'anonymous',
          title: request.title,
          sourceText: request.sourceText,
        });

        if (request.userRequirement) {
          params.append('userRequirement', request.userRequirement);
        }
        if (request.targetPages) {
          params.append('targetPages', request.targetPages.toString());
        }
        if (request.stylePreference) {
          params.append('stylePreference', request.stylePreference);
        }
        if (request.targetAudience) {
          params.append('targetAudience', request.targetAudience);
        }

        const url = `${API_BASE}/ai-office/slides-v3/generate?${params.toString()}`;
        console.log('[SSE] Connecting to:', url);

        // 创建 EventSource
        const eventSource = new EventSource(url);

        // 连接成功
        eventSource.onopen = () => {
          console.log(
            '[SSE] Connection opened, readyState:',
            eventSource.readyState
          );
        };

        // 接收消息
        eventSource.onmessage = (event) => {
          console.log(
            '[SSE] Raw message received:',
            event.data?.substring(0, 200)
          );
          try {
            const streamEvent: StreamEvent = JSON.parse(event.data);
            addStreamEvent(streamEvent);
            handleStreamEvent(streamEvent);
          } catch (e) {
            console.error(
              '[SSE] Failed to parse stream event:',
              e,
              'Data:',
              event.data
            );
          }
        };

        // 错误处理
        eventSource.onerror = (event) => {
          console.error(
            '[SSE] Error occurred, readyState:',
            eventSource.readyState,
            'Event:',
            event
          );
          eventSource.close();
          setGenerating(false);
          setError('连接中断，请重试');
          options.onError?.('连接中断，请重试');
        };

        // 存储 eventSource 以便取消
        (abortControllerRef.current as any).eventSource = eventSource;

        // 监听 abort
        abortControllerRef.current.signal.addEventListener('abort', () => {
          console.log('[SSE] Aborting connection');
          eventSource.close();
        });
      } catch (err) {
        console.error('[SSE] Setup error:', err);
        const errorMessage = err instanceof Error ? err.message : '生成失败';
        setError(errorMessage);
        setGenerating(false);
        options.onError?.(errorMessage);
      }
    },
    [
      clearStreamEvents,
      setError,
      setGenerating,
      setProgress,
      addStreamEvent,
      handleStreamEvent,
      options,
      user?.id,
    ]
  );

  /**
   * 取消生成
   */
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      (abortControllerRef.current as any).eventSource?.close();
    }
    setGenerating(false);
    setProgress(null);
  }, [setGenerating, setProgress]);

  return {
    // 状态
    session,
    generating,
    progress,
    pages,
    taskDecomposition,
    outlinePlan,
    qualityReport,
    error,

    // 操作
    generate,
    cancel,
  };
}

/**
 * 获取阶段消息
 */
function getPhaseMessage(
  phase: string,
  status: 'started' | 'completed'
): string {
  const messages: Record<string, { started: string; completed: string }> = {
    task_decomposition: {
      started: '正在分析素材，规划任务...',
      completed: '任务分解完成',
    },
    outline_planning: {
      started: '正在规划大纲...',
      completed: '大纲规划完成',
    },
    page_rendering: {
      started: '正在生成页面...',
      completed: '页面生成完成',
    },
    quality_review: {
      started: '正在进行质量检查...',
      completed: '质量检查完成',
    },
  };

  return messages[phase]?.[status] || `${phase} ${status}`;
}

export default useSlideGenerationV3;
