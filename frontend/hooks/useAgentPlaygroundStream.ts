'use client';

/**
 * useAgentPlaygroundStream — Socket.IO subscription for a playground mission
 *
 * 必修 #9: 删除 extraHeaders（websocket transport 下被忽略）；
 * 改为只用 auth.token，由后端 Gateway.extractUserId() 解析。
 * 必修 #12: EventStream 显示有上限保护；本 hook 加 5000 cap 防内存泄漏。
 */

import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';

const MAX_EVENTS = 5000;

export interface PlaygroundEvent {
  type: string;
  payload: unknown;
  agentId?: string;
  traceId?: string;
  timestamp: number;
}

export function useAgentPlaygroundStream(missionId: string | null) {
  const [events, setEvents] = useState<PlaygroundEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!missionId) return;
    const auth = getAuthHeader();
    const token = auth.Authorization?.replace(/^Bearer\s+/i, '') ?? auth.token;
    const socket: Socket = io(`${config.apiBaseUrl}/agent-playground`, {
      transports: ['websocket'],
      auth: token ? { token } : {},
    });

    const onConnect = () => {
      setConnected(true);
      socket.emit(
        'join',
        { missionId },
        (resp: { ok: boolean; error?: string }) => {
          if (!resp?.ok) {
            setError(resp?.error ?? 'join failed');
          }
        }
      );
    };
    const onDisconnect = () => setConnected(false);
    const onConnectError = (err: Error) => setError(err.message);
    const onAnyHandler = (type: string, data: PlaygroundEvent) => {
      if (!type.startsWith('agent-playground.')) return;
      setEvents((prev) => {
        const next = [...prev, { ...data, type }];
        // cap 防长 mission 内存泄漏
        return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
      });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.onAny(onAnyHandler);

    return () => {
      // 必修 #9: 显式移除 listeners 防 leak，再 disconnect
      socket.emit('leave', { missionId });
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.offAny(onAnyHandler);
      socket.disconnect();
    };
  }, [missionId]);

  return { events, connected, error };
}
