'use client';

/**
 * useAgentPlaygroundStream — Socket.IO subscription for a playground mission
 */

import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';

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
    const socket: Socket = io(`${config.apiBaseUrl}/agent-playground`, {
      transports: ['websocket'],
      extraHeaders: auth,
      auth: auth,
    });

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join', { missionId });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', (err) => setError(err.message));

    // 监听所有 agent-playground.* 事件
    socket.onAny((type: string, data: PlaygroundEvent) => {
      if (!type.startsWith('agent-playground.')) return;
      setEvents((prev) => [...prev, { ...data, type }]);
    });

    return () => {
      socket.emit('leave', { missionId });
      socket.disconnect();
    };
  }, [missionId]);

  return { events, connected, error };
}
