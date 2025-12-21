/**
 * AI Coding WebSocket Hook
 *
 * 用于连接 AI Coding WebSocket 以接收实时进度更新
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/contexts/AuthContext';

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

interface UseAiCodingSocketOptions {
  projectId?: string;
  onProgress?: (event: ProjectProgressEvent) => void;
  onAgentStatus?: (event: AgentStatusEvent) => void;
  onComplete?: (event: ProjectCompleteEvent) => void;
  onError?: (event: ProjectErrorEvent) => void;
}

export function useAiCodingSocket(options: UseAiCodingSocketOptions = {}) {
  const { projectId, onProgress, onAgentStatus, onComplete, onError } = options;
  const { user, accessToken } = useAuth();
  const isAuthenticated = !!accessToken;
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Store callbacks in refs to avoid reconnection on callback changes
  const callbacksRef = useRef({
    onProgress,
    onAgentStatus,
    onComplete,
    onError,
  });

  useEffect(() => {
    callbacksRef.current = {
      onProgress,
      onAgentStatus,
      onComplete,
      onError,
    };
  }, [onProgress, onAgentStatus, onComplete, onError]);

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

    // Event listeners
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

  return {
    isConnected,
    connectionError,
    joinProject,
    leaveProject,
    socket: socketRef.current,
  };
}
