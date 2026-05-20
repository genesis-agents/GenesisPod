/**
 * AI Writing WebSocket Hook
 *
 * 连接到 AI Writing WebSocket Gateway，接收实时更新
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';

import { logger } from '@/lib/utils/logger';
// 事件类型
export type WritingEventType =
  | 'mission:started'
  | 'mission:progress'
  | 'mission:completed'
  | 'mission:failed'
  // Leader 多轮对话响应事件
  | 'leader:response'
  | 'agent:working'
  | 'agent:completed'
  | 'agent:failed'
  | 'chapter:started'
  | 'chapter:content'
  | 'chapter:completed'
  | 'consistency:check_started'
  | 'consistency:issues_found'
  | 'consistency:fix_started'
  | 'consistency:fix_completed'
  | 'world:building_started'
  | 'world:building_completed'
  // 守护者增强事件
  | 'keeper:extracting_context'
  | 'keeper:context_ready'
  | 'keeper:updating_bible'
  | 'keeper:bible_updated';

// Agent 工作状态
export interface AgentWorkingData {
  agentId: string;
  agentName: string;
  agentRole: 'architect' | 'keeper' | 'writer' | 'checker' | 'editor';
  status: 'working' | 'completed' | 'failed';
  taskDescription?: string;
  progress?: number;
  timestamp: string;
}

// 章节内容数据
export interface ChapterContentData {
  chapterNumber: number;
  title: string;
  content: string;
  wordCount: number;
  volumeIndex: number;
  timestamp: string;
}

// 任务进度数据
export interface MissionProgressData {
  missionId: string;
  progress: number;
  currentStep: string;
  activeAgents: string[];
  timestamp: string;
}

// 一致性检查数据
export interface ConsistencyCheckData {
  chapterNumber: number;
  passed: boolean;
  issues: Array<{
    type: string;
    severity: 'error' | 'warning' | 'info';
    description: string;
    suggestion?: string;
  }>;
  timestamp: string;
}

// 世界观设定数据
export interface WorldBuildingData {
  settings?: Record<string, unknown>;
  timestamp: string;
}

// 守护者上下文数据
export interface KeeperContextData {
  chapterNumber: number;
  context?: {
    relevantCharacters: string[];
    relevantLocations: string[];
    previousEvents: string[];
    warnings: string[];
  };
  timestamp: string;
}

// 守护者圣经更新数据
export interface KeeperBibleUpdateData {
  chapterNumber: number;
  updates?: {
    newFacts: string[];
    characterUpdates: string[];
    timelineEvents: string[];
  };
  timestamp: string;
}

// 事件回调类型
export interface WritingEvent {
  type: WritingEventType;
  data: unknown;
  timestamp: string;
}

// Hook 配置选项
interface UseWritingWebSocketOptions {
  enabled?: boolean;
  onEvent?: (event: WritingEvent) => void;
}

// Hook 返回类型
interface UseWritingWebSocketResult {
  isConnected: boolean;
  error: string | null;
  // 最新状态
  progress: number;
  currentStep: string;
  activeAgentIds: string[];
  chapters: Map<number, ChapterContentData>;
  consistencyIssues: ConsistencyCheckData[];
  worldSettings: Record<string, unknown> | null;
  // 方法
  connect: () => void;
  disconnect: () => void;
}

export function useWritingWebSocket(
  projectId: string | null,
  enabledOrOptions: boolean | UseWritingWebSocketOptions = true
): UseWritingWebSocketResult {
  // 支持旧的 boolean 参数和新的 options 对象
  const options: UseWritingWebSocketOptions =
    typeof enabledOrOptions === 'boolean'
      ? { enabled: enabledOrOptions }
      : enabledOrOptions;
  const { enabled = true, onEvent } = options;
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const socketRef = useRef<Socket | null>(null);
  const connectingRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 状态
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [activeAgentIds, setActiveAgentIds] = useState<string[]>([]);
  const [chapters, setChapters] = useState<Map<number, ChapterContentData>>(
    new Map()
  );
  const [consistencyIssues, setConsistencyIssues] = useState<
    ConsistencyCheckData[]
  >([]);
  const [worldSettings, setWorldSettings] = useState<Record<
    string,
    unknown
  > | null>(null);

  // 连接
  const connect = useCallback(() => {
    // 防止重复连接
    if (!projectId || socketRef.current?.connected || connectingRef.current) {
      return;
    }

    // 从 NEXT_PUBLIC_API_URL 获取后端 URL
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      // 本地开发环境
      logger.debug('[WritingWS] No API URL configured, using localhost');
    }

    // 移除 /api/v1 后缀获取基础 URL
    const baseUrl = apiUrl?.replace('/api/v1', '') || 'http://localhost:3001';

    connectingRef.current = true;
    logger.debug('[WritingWS] Connecting to:', `${baseUrl}/ai-writing`);

    const socket = io(`${baseUrl}/ai-writing`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 2000,
      timeout: 10000,
      withCredentials: true,
    });

    socket.on('connect', () => {
      logger.debug('[WritingWS] Connected');
      connectingRef.current = false;
      setIsConnected(true);
      setError(null);

      // 加入项目房间
      socket.emit('join:project', { projectId });
    });

    socket.on('disconnect', (reason) => {
      logger.debug('[WritingWS] Disconnected:', reason);
      connectingRef.current = false;
      setIsConnected(false);
    });

    socket.on('connect_error', (err) => {
      logger.error('[WritingWS] Connection error:', err.message);
      connectingRef.current = false;
      // 只在首次失败时设置错误，避免频繁更新状态导致闪烁
      if (!error) {
        setError(`WebSocket 连接失败`);
      }
    });

    // Helper to emit event to callback
    const emitEvent = (type: WritingEventType, data: unknown) => {
      if (onEventRef.current) {
        onEventRef.current({
          type,
          data,
          timestamp: new Date().toISOString(),
        });
      }
    };

    // 任务事件
    socket.on('mission:started', (data) => {
      logger.debug('[WritingWS] Mission started:', data);
      setProgress(0);
      setCurrentStep('任务已启动');
      emitEvent('mission:started', data);
    });

    socket.on('mission:progress', (data: MissionProgressData) => {
      setProgress(data.progress);
      setCurrentStep(data.currentStep);
      setActiveAgentIds(data.activeAgents);
      emitEvent('mission:progress', data);
    });

    socket.on('mission:completed', (data) => {
      logger.debug('[WritingWS] Mission completed:', data);
      setProgress(100);
      setCurrentStep('创作完成');
      setActiveAgentIds([]);
      emitEvent('mission:completed', data);
    });

    socket.on('mission:failed', (data) => {
      logger.error('[WritingWS] Mission failed:', data);
      setError(data.error || '任务失败');
      emitEvent('mission:failed', data);
    });

    // Leader 多轮对话响应事件
    socket.on('leader:response', (data) => {
      logger.debug('[WritingWS] Leader response:', data);
      emitEvent('leader:response', data);
    });

    // Agent 事件
    socket.on('agent:working', (data: AgentWorkingData) => {
      if (data.status === 'working') {
        setActiveAgentIds((prev) =>
          prev.includes(data.agentId) ? prev : [...prev, data.agentId]
        );
      } else {
        setActiveAgentIds((prev) => prev.filter((id) => id !== data.agentId));
      }
      emitEvent('agent:working', data);
    });

    // 章节事件
    socket.on('chapter:started', (data) => {
      logger.debug('[WritingWS] Chapter started:', data);
      emitEvent('chapter:started', data);
    });

    socket.on('chapter:content', (data: ChapterContentData) => {
      setChapters((prev) => {
        const newMap = new Map(prev);
        newMap.set(data.chapterNumber, data);
        return newMap;
      });
      emitEvent('chapter:content', data);
    });

    socket.on('chapter:completed', (data: { chapterNumber: number }) => {
      logger.debug(`[WritingWS] Chapter ${data.chapterNumber} completed`);
      emitEvent('chapter:completed', data);
    });

    // 一致性检查事件
    socket.on('consistency:check_started', (data) => {
      logger.debug('[WritingWS] Consistency check started:', data);
      emitEvent('consistency:check_started', data);
    });

    socket.on('consistency:issues_found', (data: ConsistencyCheckData) => {
      setConsistencyIssues((prev) => [...prev, data]);
      emitEvent('consistency:issues_found', data);
    });

    socket.on('consistency:fix_started', (data) => {
      logger.debug('[WritingWS] Consistency fix started:', data);
      emitEvent('consistency:fix_started', data);
    });

    socket.on('consistency:fix_completed', (data) => {
      logger.debug(
        `[WritingWS] Chapter ${data.chapterNumber} fixed ${data.fixedIssues} issues`
      );
      emitEvent('consistency:fix_completed', data);
    });

    // 世界观设定事件
    socket.on('world:building_started', (data) => {
      logger.debug('[WritingWS] World building started');
      emitEvent('world:building_started', data);
    });

    socket.on('world:building_completed', (data: WorldBuildingData) => {
      if (data.settings) {
        setWorldSettings(data.settings);
      }
      emitEvent('world:building_completed', data);
    });

    // 守护者增强事件
    socket.on('keeper:extracting_context', (data: KeeperContextData) => {
      logger.debug(
        `[WritingWS] Keeper extracting context for chapter ${data.chapterNumber}`
      );
      emitEvent('keeper:extracting_context', data);
    });

    socket.on('keeper:context_ready', (data: KeeperContextData) => {
      logger.debug(
        `[WritingWS] Keeper context ready for chapter ${data.chapterNumber}`
      );
      emitEvent('keeper:context_ready', data);
    });

    socket.on('keeper:updating_bible', (data: KeeperContextData) => {
      logger.debug(
        `[WritingWS] Keeper updating bible after chapter ${data.chapterNumber}`
      );
      emitEvent('keeper:updating_bible', data);
    });

    socket.on('keeper:bible_updated', (data: KeeperBibleUpdateData) => {
      logger.debug(
        `[WritingWS] Keeper bible updated: ${data.updates?.newFacts?.length || 0} new facts`
      );
      emitEvent('keeper:bible_updated', data);
    });

    socketRef.current = socket;
  }, [projectId]);

  // 断开连接
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      if (projectId) {
        socketRef.current.emit('leave:project', { projectId });
      }
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    }
  }, [projectId]);

  // 自动连接/断开
  useEffect(() => {
    if (enabled && projectId) {
      connect();
    }

    return () => {
      if (socketRef.current) {
        if (projectId) {
          socketRef.current.emit('leave:project', { projectId });
        }
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
        connectingRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, projectId]);

  return {
    isConnected,
    error,
    progress,
    currentStep,
    activeAgentIds,
    chapters,
    consistencyIssues,
    worldSettings,
    connect,
    disconnect,
  };
}
