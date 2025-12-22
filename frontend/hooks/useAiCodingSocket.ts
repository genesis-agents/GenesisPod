/**
 * AI Coding WebSocket Hook
 *
 * 用于连接 AI Coding WebSocket 以接收实时进度更新
 * 支持团队协作消息、Agent状态更新、Mission进度等
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/contexts/AuthContext';

// ==================== 类型定义 ====================

export type CodingAgentRole =
  | 'PM'
  | 'ARCHITECT'
  | 'PM_LEAD'
  | 'ENGINEER'
  | 'QA';
export type CodingAgentMemberStatus = 'IDLE' | 'WORKING' | 'WAITING' | 'ERROR';
export type CodingMessageType =
  | 'SYSTEM'
  | 'THINKING'
  | 'OUTPUT'
  | 'ERROR'
  | 'FEEDBACK'
  | 'APPROVAL'
  | 'REQUEST';

export interface ProjectProgressEvent {
  projectId: string;
  phase:
    | 'pm'
    | 'architect'
    | 'pm_lead'
    | 'engineer'
    | 'qa'
    | 'document'
    | 'complete';
  status: 'started' | 'progress' | 'completed' | 'failed';
  progress: number;
  message: string;
  data?: unknown;
}

export interface AgentStatusEvent {
  projectId: string;
  agent: 'pm' | 'architect' | 'pmLead' | 'engineer' | 'qa';
  status: 'pending' | 'running' | 'completed' | 'failed';
  message?: string;
  output?: unknown;
}

export interface ProjectCompleteEvent {
  projectId: string;
  success: boolean;
  result?: unknown;
  timestamp: string;
}

export interface ProjectErrorEvent {
  projectId: string;
  error: string;
  phase?: string;
  timestamp: string;
}

// ==================== 团队协作事件类型 ====================

export interface TeamMember {
  id: string;
  role: CodingAgentRole;
  displayName: string;
  avatar: string;
  status: CodingAgentMemberStatus;
  currentTask?: string;
  thinking?: string;
  tasksCompleted: number;
}

export interface TeamInitializedEvent {
  projectId: string;
  members: TeamMember[];
  timestamp: string;
}

export interface TeamMessageEvent {
  projectId: string;
  message: {
    id: string;
    senderId?: string;
    senderRole?: CodingAgentRole;
    content: string;
    messageType: CodingMessageType;
    metadata?: Record<string, unknown>;
    createdAt: string;
  };
  timestamp: string;
}

export interface AgentDetailStatusEvent {
  projectId: string;
  memberId: string;
  role: CodingAgentRole;
  status: CodingAgentMemberStatus;
  currentTask?: string;
  lastError?: string;
  timestamp: string;
}

export interface AgentThinkingEvent {
  projectId: string;
  memberId: string;
  role: CodingAgentRole;
  content: string;
  timestamp: string;
}

export interface AgentOutputEvent {
  projectId: string;
  memberId: string;
  role: CodingAgentRole;
  taskId: string;
  output: Record<string, unknown>;
  timestamp: string;
}

export interface MissionStartedEvent {
  projectId: string;
  missionId: string;
  title: string;
  totalTasks: number;
  timestamp: string;
}

export interface MissionProgressEvent {
  projectId: string;
  missionId: string;
  progress: number;
  completedTasks: number;
  totalTasks: number;
  currentTask?: string;
  timestamp: string;
}

export interface MissionCompletedEvent {
  projectId: string;
  missionId: string;
  totalTasks: number;
  outputs: Record<string, unknown>;
  timestamp: string;
}

export interface MissionFailedEvent {
  projectId: string;
  missionId: string;
  error: string;
  failedTask?: string;
  timestamp: string;
}

export interface TaskStartedEvent {
  projectId: string;
  taskId: string;
  title: string;
  assigneeRole: CodingAgentRole;
  assigneeName: string;
  timestamp: string;
}

export interface TaskCompletedEvent {
  projectId: string;
  taskId: string;
  title: string;
  output?: Record<string, unknown>;
  timestamp: string;
}

export interface TaskFailedEvent {
  projectId: string;
  taskId: string;
  title: string;
  error: string;
  retryCount: number;
  timestamp: string;
}

export interface TaskReviewEvent {
  projectId: string;
  taskId: string;
  title: string;
  approved: boolean;
  feedback: string;
  issues: string[];
  timestamp: string;
}

interface UseAiCodingSocketOptions {
  projectId?: string;
  // 原有事件
  onProgress?: (event: ProjectProgressEvent) => void;
  onAgentStatus?: (event: AgentStatusEvent) => void;
  onComplete?: (event: ProjectCompleteEvent) => void;
  onError?: (event: ProjectErrorEvent) => void;
  // 团队协作事件
  onTeamInitialized?: (event: TeamInitializedEvent) => void;
  onTeamMessage?: (event: TeamMessageEvent) => void;
  onAgentDetailStatus?: (event: AgentDetailStatusEvent) => void;
  onAgentThinking?: (event: AgentThinkingEvent) => void;
  onAgentOutput?: (event: AgentOutputEvent) => void;
  // Mission 事件
  onMissionStarted?: (event: MissionStartedEvent) => void;
  onMissionProgress?: (event: MissionProgressEvent) => void;
  onMissionCompleted?: (event: MissionCompletedEvent) => void;
  onMissionFailed?: (event: MissionFailedEvent) => void;
  // 任务事件
  onTaskStarted?: (event: TaskStartedEvent) => void;
  onTaskCompleted?: (event: TaskCompletedEvent) => void;
  onTaskFailed?: (event: TaskFailedEvent) => void;
  onTaskReview?: (event: TaskReviewEvent) => void;
}

export function useAiCodingSocket(options: UseAiCodingSocketOptions = {}) {
  const {
    projectId,
    onProgress,
    onAgentStatus,
    onComplete,
    onError,
    // 团队协作事件
    onTeamInitialized,
    onTeamMessage,
    onAgentDetailStatus,
    onAgentThinking,
    onAgentOutput,
    // Mission 事件
    onMissionStarted,
    onMissionProgress,
    onMissionCompleted,
    onMissionFailed,
    // 任务事件
    onTaskStarted,
    onTaskCompleted,
    onTaskFailed,
    onTaskReview,
  } = options;

  const { user, accessToken } = useAuth();
  const isAuthenticated = !!accessToken;
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [messages, setMessages] = useState<TeamMessageEvent['message'][]>([]);

  // Store callbacks in refs to avoid reconnection on callback changes
  const callbacksRef = useRef({
    onProgress,
    onAgentStatus,
    onComplete,
    onError,
    onTeamInitialized,
    onTeamMessage,
    onAgentDetailStatus,
    onAgentThinking,
    onAgentOutput,
    onMissionStarted,
    onMissionProgress,
    onMissionCompleted,
    onMissionFailed,
    onTaskStarted,
    onTaskCompleted,
    onTaskFailed,
    onTaskReview,
  });

  useEffect(() => {
    callbacksRef.current = {
      onProgress,
      onAgentStatus,
      onComplete,
      onError,
      onTeamInitialized,
      onTeamMessage,
      onAgentDetailStatus,
      onAgentThinking,
      onAgentOutput,
      onMissionStarted,
      onMissionProgress,
      onMissionCompleted,
      onMissionFailed,
      onTaskStarted,
      onTaskCompleted,
      onTaskFailed,
      onTaskReview,
    };
  }, [
    onProgress,
    onAgentStatus,
    onComplete,
    onError,
    onTeamInitialized,
    onTeamMessage,
    onAgentDetailStatus,
    onAgentThinking,
    onAgentOutput,
    onMissionStarted,
    onMissionProgress,
    onMissionCompleted,
    onMissionFailed,
    onTaskStarted,
    onTaskCompleted,
    onTaskFailed,
    onTaskReview,
  ]);

  // Connect to WebSocket
  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      return;
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ||
      'http://localhost:3000';

    const socket = io(`${baseUrl}/ai-coding`, {
      transports: ['websocket', 'polling'],
      auth: {
        userId: user.id,
      },
      query: {
        userId: user.id,
      },
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[AI Coding Socket] Connected:', socket.id);
      setIsConnected(true);
      setConnectionError(null);
    });

    socket.on('disconnect', (reason) => {
      console.log('[AI Coding Socket] Disconnected:', reason);
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('[AI Coding Socket] Connection error:', error.message);
      setConnectionError(error.message);
      setIsConnected(false);
    });

    // ==================== 原有事件监听 ====================

    socket.on('project:progress', (event: ProjectProgressEvent) => {
      console.log('[AI Coding Socket] Progress:', event);
      callbacksRef.current.onProgress?.(event);
    });

    socket.on('agent:status', (event: AgentStatusEvent) => {
      console.log('[AI Coding Socket] Agent status:', event);
      callbacksRef.current.onAgentStatus?.(event);
    });

    socket.on('project:complete', (event: ProjectCompleteEvent) => {
      console.log('[AI Coding Socket] Complete:', event);
      callbacksRef.current.onComplete?.(event);
    });

    socket.on('project:error', (event: ProjectErrorEvent) => {
      console.error('[AI Coding Socket] Error:', event);
      callbacksRef.current.onError?.(event);
    });

    // ==================== 团队协作事件监听 ====================

    socket.on('team:initialized', (event: TeamInitializedEvent) => {
      console.log('[AI Coding Socket] Team initialized:', event);
      setTeamMembers(event.members);
      callbacksRef.current.onTeamInitialized?.(event);
    });

    socket.on('team:message', (event: TeamMessageEvent) => {
      console.log('[AI Coding Socket] Team message:', event);
      setMessages((prev) => [...prev.slice(-99), event.message]);
      callbacksRef.current.onTeamMessage?.(event);
    });

    socket.on('agent:status', (event: AgentDetailStatusEvent) => {
      console.log('[AI Coding Socket] Agent detail status:', event);
      // 更新本地团队成员状态
      setTeamMembers((prev) =>
        prev.map((m) =>
          m.id === event.memberId
            ? { ...m, status: event.status, currentTask: event.currentTask }
            : m
        )
      );
      callbacksRef.current.onAgentDetailStatus?.(event);
    });

    socket.on('agent:thinking', (event: AgentThinkingEvent) => {
      console.log('[AI Coding Socket] Agent thinking:', event);
      // 更新本地团队成员的思考状态
      setTeamMembers((prev) =>
        prev.map((m) =>
          m.id === event.memberId ? { ...m, thinking: event.content } : m
        )
      );
      callbacksRef.current.onAgentThinking?.(event);
    });

    socket.on('agent:output', (event: AgentOutputEvent) => {
      console.log('[AI Coding Socket] Agent output:', event);
      callbacksRef.current.onAgentOutput?.(event);
    });

    // ==================== Mission 事件监听 ====================

    socket.on('mission:started', (event: MissionStartedEvent) => {
      console.log('[AI Coding Socket] Mission started:', event);
      callbacksRef.current.onMissionStarted?.(event);
    });

    socket.on('mission:progress', (event: MissionProgressEvent) => {
      console.log('[AI Coding Socket] Mission progress:', event);
      callbacksRef.current.onMissionProgress?.(event);
    });

    socket.on('mission:completed', (event: MissionCompletedEvent) => {
      console.log('[AI Coding Socket] Mission completed:', event);
      callbacksRef.current.onMissionCompleted?.(event);
    });

    socket.on('mission:failed', (event: MissionFailedEvent) => {
      console.error('[AI Coding Socket] Mission failed:', event);
      callbacksRef.current.onMissionFailed?.(event);
    });

    // ==================== 任务事件监听 ====================

    socket.on('task:started', (event: TaskStartedEvent) => {
      console.log('[AI Coding Socket] Task started:', event);
      callbacksRef.current.onTaskStarted?.(event);
    });

    socket.on('task:completed', (event: TaskCompletedEvent) => {
      console.log('[AI Coding Socket] Task completed:', event);
      callbacksRef.current.onTaskCompleted?.(event);
    });

    socket.on('task:failed', (event: TaskFailedEvent) => {
      console.error('[AI Coding Socket] Task failed:', event);
      callbacksRef.current.onTaskFailed?.(event);
    });

    socket.on('task:review', (event: TaskReviewEvent) => {
      console.log('[AI Coding Socket] Task review:', event);
      callbacksRef.current.onTaskReview?.(event);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, user?.id]);

  // Join/leave project room when projectId changes
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !isConnected || !projectId) {
      return;
    }

    console.log('[AI Coding Socket] Joining project:', projectId);
    socket.emit(
      'project:join',
      { projectId },
      (response: { success?: boolean; error?: string }) => {
        if (response.success) {
          console.log('[AI Coding Socket] Joined project successfully');
        } else {
          console.error(
            '[AI Coding Socket] Failed to join project:',
            response.error
          );
        }
      }
    );

    return () => {
      if (socket.connected && projectId) {
        console.log('[AI Coding Socket] Leaving project:', projectId);
        socket.emit('project:leave', { projectId });
      }
    };
  }, [isConnected, projectId]);

  // Manual join/leave methods
  const joinProject = useCallback((pid: string) => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      console.warn('[AI Coding Socket] Cannot join project: not connected');
      return;
    }

    socket.emit(
      'project:join',
      { projectId: pid },
      (response: { success?: boolean; error?: string }) => {
        if (response.success) {
          console.log('[AI Coding Socket] Joined project:', pid);
        } else {
          console.error(
            '[AI Coding Socket] Failed to join project:',
            response.error
          );
        }
      }
    );
  }, []);

  const leaveProject = useCallback((pid: string) => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      return;
    }

    socket.emit('project:leave', { projectId: pid });
  }, []);

  // 请求团队成员列表
  const getTeamMembers = useCallback((pid: string): Promise<TeamMember[]> => {
    return new Promise((resolve, reject) => {
      const socket = socketRef.current;
      if (!socket || !socket.connected) {
        reject(new Error('Socket not connected'));
        return;
      }

      socket.emit(
        'team:getMembers',
        { projectId: pid },
        (response: {
          success?: boolean;
          members?: TeamMember[];
          error?: string;
        }) => {
          if (response.success && response.members) {
            setTeamMembers(response.members);
            resolve(response.members);
          } else {
            reject(new Error(response.error || 'Failed to get team members'));
          }
        }
      );
    });
  }, []);

  // 请求团队消息历史
  const getTeamMessages = useCallback(
    (pid: string, limit = 50): Promise<TeamMessageEvent['message'][]> => {
      return new Promise((resolve, reject) => {
        const socket = socketRef.current;
        if (!socket || !socket.connected) {
          reject(new Error('Socket not connected'));
          return;
        }

        socket.emit(
          'team:getMessages',
          { projectId: pid, limit },
          (response: {
            success?: boolean;
            messages?: TeamMessageEvent['message'][];
            error?: string;
          }) => {
            if (response.success && response.messages) {
              setMessages(response.messages);
              resolve(response.messages);
            } else {
              reject(
                new Error(response.error || 'Failed to get team messages')
              );
            }
          }
        );
      });
    },
    []
  );

  // 请求团队统计
  const getTeamStats = useCallback(
    (
      pid: string
    ): Promise<{
      totalMembers: number;
      activeMembers: number;
      totalTasksCompleted: number;
    }> => {
      return new Promise((resolve, reject) => {
        const socket = socketRef.current;
        if (!socket || !socket.connected) {
          reject(new Error('Socket not connected'));
          return;
        }

        socket.emit(
          'team:getStats',
          { projectId: pid },
          (response: {
            success?: boolean;
            stats?: {
              totalMembers: number;
              activeMembers: number;
              totalTasksCompleted: number;
            };
            error?: string;
          }) => {
            if (response.success && response.stats) {
              resolve(response.stats);
            } else {
              reject(new Error(response.error || 'Failed to get team stats'));
            }
          }
        );
      });
    },
    []
  );

  // 清除消息
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    // 连接状态
    isConnected,
    connectionError,
    socket: socketRef.current,
    // 项目订阅
    joinProject,
    leaveProject,
    // 团队状态
    teamMembers,
    messages,
    // 团队方法
    getTeamMembers,
    getTeamMessages,
    getTeamStats,
    clearMessages,
  };
}
