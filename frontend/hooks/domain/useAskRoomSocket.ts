/**
 * useAskRoomSocket
 *
 * 订阅 `/ai-ask-room` namespace 的 socket.io 事件，把 server event 派发到 store。
 * 设计：teams-mode.md §6.2；模式参考 useNotificationSocket。
 *
 * 用法：
 *   useAskRoomSocket({ sessionId, enabled: !!sessionId, onEvent });
 */

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getAuthTokens } from '@/lib/utils/auth';
import { logger } from '@/lib/utils/logger';
import {
  ASK_ROOM_CLIENT_EVENT_NAME,
  ASK_ROOM_EVENT_NAME,
  ASK_ROOM_JOIN_EVENT_NAME,
  ASK_ROOM_NAMESPACE,
  type AskRoomClientEvent,
  type AskRoomJoinAck,
  type AskRoomServerEvent,
} from '@/types/ask-room';
import { useAskRoomStore } from '@/stores/ask-room.store';

interface UseAskRoomSocketOptions {
  sessionId: string;
  enabled?: boolean;
  onEvent?: (event: AskRoomServerEvent) => void;
  onJoinError?: (reason: string) => void;
}

interface SocketHandle {
  cancelTurn: (turnId: string) => void;
  isConnected: () => boolean;
}

export function useAskRoomSocket(opts: UseAskRoomSocketOptions): SocketHandle {
  const { sessionId, enabled = true, onEvent, onJoinError } = opts;
  const socketRef = useRef<Socket | null>(null);
  const onEventRef = useRef(onEvent);
  const onJoinErrorRef = useRef(onJoinError);
  onEventRef.current = onEvent;
  onJoinErrorRef.current = onJoinError;

  const applyEvent = useAskRoomStore((s) => s.applyEvent);

  useEffect(() => {
    if (!enabled || !sessionId) return;

    const tokens = getAuthTokens();
    if (!tokens?.accessToken) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    const baseUrl = apiUrl?.replace('/api/v1', '') || 'http://localhost:3001';

    const socket = io(`${baseUrl}${ASK_ROOM_NAMESPACE}`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 2000,
      timeout: 10000,
      withCredentials: true,
      auth: { token: tokens.accessToken },
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      logger.debug('[AskRoomSocket] connected; joining session=' + sessionId);
      socket.emit(
        ASK_ROOM_JOIN_EVENT_NAME,
        { sessionId },
        (ack: AskRoomJoinAck) => {
          if (!ack.ok) {
            logger.warn(
              `[AskRoomSocket] join rejected: ${ack.reason ?? 'unknown'}`
            );
            onJoinErrorRef.current?.(ack.reason ?? 'unknown');
          }
        }
      );
    });

    socket.on(ASK_ROOM_EVENT_NAME, (event: AskRoomServerEvent) => {
      applyEvent(event);
      onEventRef.current?.(event);
    });

    socket.on('connect_error', (err: Error) => {
      logger.debug(`[AskRoomSocket] connect_error: ${err.message}`);
    });

    socket.on('disconnect', (reason: string) => {
      logger.debug(`[AskRoomSocket] disconnected: ${reason}`);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [sessionId, enabled, applyEvent]);

  return {
    cancelTurn(turnId: string) {
      const s = socketRef.current;
      if (!s || !s.connected) return;
      const event: AskRoomClientEvent = { kind: 'turn.cancel', turnId };
      s.emit(ASK_ROOM_CLIENT_EVENT_NAME, event);
    },
    isConnected() {
      return !!socketRef.current?.connected;
    },
  };
}
