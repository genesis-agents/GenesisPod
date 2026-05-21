'use client';

/**
 * useSocialMissionStream — SocialPublishMission 事件流订阅
 *
 * 监听 social.* DomainEvent（mission lifecycle / stage lifecycle / agent
 * narrative / cost tick / publish:executed / publish:verified），连接到后端
 * `social` socket.io namespace。
 *
 * Mirror of useAgentPlaygroundStream，差异：
 *   - namespace = 'social'（不是 agent-playground）
 *   - 没有 /replay 端点兜底（W5 后再加）；socket 断了只能等重连
 *   - 5000 上限防长 mission 内存泄漏
 */

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';

const MAX_EVENTS = 5000;

export interface SocialMissionEvent {
  type: string;
  payload: unknown;
  agentId?: string;
  traceId?: string;
  timestamp: number;
}

type ConnState = 'connecting' | 'live' | 'disconnected';

export function useSocialMissionStream(missionId: string | null) {
  const [events, setEvents] = useState<SocialMissionEvent[]>([]);
  const [connState, setConnState] = useState<ConnState>('connecting');
  const [error, setError] = useState<string | null>(null);
  const eventsRef = useRef<SocialMissionEvent[]>([]);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    if (!missionId || missionId === 'undefined') return;
    let cancelled = false;
    let socket: Socket | null = null;

    const append = (next: SocialMissionEvent[]) => {
      if (cancelled || !next.length) return;
      setEvents((prev) => {
        const merged = [...prev, ...next];
        return merged.length > MAX_EVENTS ? merged.slice(-MAX_EVENTS) : merged;
      });
    };

    const auth = getAuthHeader();
    const token = auth.Authorization?.replace(/^Bearer\s+/i, '') ?? auth.token;
    socket = io(`${config.getBackendUrl()}/social`, {
      transports: ['polling', 'websocket'],
      auth: token ? { token } : {},
      reconnectionAttempts: 8,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 12000,
      withCredentials: true,
    });

    const onConnect = () => {
      setConnState('live');
      setError(null);
      socket?.emit(
        'join',
        { missionId },
        (resp: { ok: boolean; error?: string }) => {
          if (!resp?.ok) {
            setError(resp?.error ?? 'join failed');
          }
        }
      );
    };
    const onDisconnect = () => {
      if (cancelled) return;
      setConnState('disconnected');
    };
    const onConnectError = (err: Error) => {
      if (cancelled) return;
      setError(err.message);
      setConnState('disconnected');
    };
    const onAnyHandler = (type: string, data: SocialMissionEvent) => {
      if (!type.startsWith('social.')) return;
      append([{ ...data, type }]);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.onAny(onAnyHandler);

    return () => {
      cancelled = true;
      if (socket) {
        socket.emit('leave', { missionId });
        socket.off('connect', onConnect);
        socket.off('disconnect', onDisconnect);
        socket.off('connect_error', onConnectError);
        socket.offAny(onAnyHandler);
        socket.disconnect();
      }
    };
  }, [missionId]);

  return {
    events,
    connState,
    connected: connState === 'live',
    error,
  };
}
