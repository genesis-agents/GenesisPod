/**
 * AI Writing WebSocket Hook
 *
 * 连接到 AI Writing WebSocket Gateway，接收实时更新
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';

// 事件类型
export type WritingEventType =
  | 'mission:started'
  | 'mission:progress'
  | 'mission:completed'
  | 'mission:failed'
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
  | 'world:building_completed';

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
  enabled = true
): UseWritingWebSocketResult {
  const socketRef = useRef<Socket | null>(null);
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
    if (!projectId || socketRef.current?.connected) return;

    const wsUrl =
      process.env.NEXT_PUBLIC_WS_URL ||
      (typeof window !== 'undefined'
        ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
        : 'ws://localhost:3001');

    const socket = io(`${wsUrl}/ai-writing`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('[WritingWS] Connected');
      setIsConnected(true);
      setError(null);

      // 加入项目房间
      socket.emit('join:project', { projectId });
    });

    socket.on('disconnect', () => {
      console.log('[WritingWS] Disconnected');
      setIsConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('[WritingWS] Connection error:', err.message);
      setError(`连接失败: ${err.message}`);
    });

    // 任务事件
    socket.on('mission:started', (data) => {
      console.log('[WritingWS] Mission started:', data);
      setProgress(0);
      setCurrentStep('任务已启动');
    });

    socket.on('mission:progress', (data: MissionProgressData) => {
      setProgress(data.progress);
      setCurrentStep(data.currentStep);
      setActiveAgentIds(data.activeAgents);
    });

    socket.on('mission:completed', (data) => {
      console.log('[WritingWS] Mission completed:', data);
      setProgress(100);
      setCurrentStep('创作完成');
      setActiveAgentIds([]);
    });

    socket.on('mission:failed', (data) => {
      console.error('[WritingWS] Mission failed:', data);
      setError(data.error || '任务失败');
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
    });

    // 章节事件
    socket.on('chapter:content', (data: ChapterContentData) => {
      setChapters((prev) => {
        const newMap = new Map(prev);
        newMap.set(data.chapterNumber, data);
        return newMap;
      });
    });

    socket.on('chapter:completed', (data: { chapterNumber: number }) => {
      console.log(`[WritingWS] Chapter ${data.chapterNumber} completed`);
    });

    // 一致性检查事件
    socket.on('consistency:issues_found', (data: ConsistencyCheckData) => {
      setConsistencyIssues((prev) => [...prev, data]);
    });

    socket.on('consistency:fix_completed', (data) => {
      console.log(
        `[WritingWS] Chapter ${data.chapterNumber} fixed ${data.fixedIssues} issues`
      );
    });

    // 世界观设定事件
    socket.on('world:building_completed', (data: WorldBuildingData) => {
      if (data.settings) {
        setWorldSettings(data.settings);
      }
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
      disconnect();
    };
  }, [enabled, projectId, connect, disconnect]);

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
