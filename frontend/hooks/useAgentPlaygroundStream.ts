'use client';

/**
 * useAgentPlaygroundStream — 双通道事件流（replay + socket）
 *
 * 设计：
 *   1. 进页面立刻从 /replay 端点拉取累积事件（hydrate）—— 解决刷新页面 UI 全空
 *   2. Socket 连上后追加 live 事件
 *   3. Socket 断/出错时自动 polling /replay (since=lastTs) 兜底
 *   4. 5000 上限防长 mission 内存泄漏
 */

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { replayMission } from '@/lib/api/agent-playground';

const MAX_EVENTS = 5000;
const POLL_INTERVAL_MS = 4000;

export interface PlaygroundEvent {
  type: string;
  payload: unknown;
  agentId?: string;
  traceId?: string;
  timestamp: number;
}

type ConnState = 'connecting' | 'live' | 'polling' | 'disconnected';

function dedupeAndCap(events: PlaygroundEvent[]): PlaygroundEvent[] {
  // 用 type+timestamp+agentId+payload 序列化做 key —— 同 ms 内多条 trace 不会被误吞
  const seen = new Set<string>();
  const out: PlaygroundEvent[] = [];
  for (const e of events) {
    let payloadKey = '';
    try {
      payloadKey = JSON.stringify(e.payload);
    } catch {
      payloadKey = String(e.payload);
    }
    const key = `${e.type}|${e.timestamp}|${e.agentId ?? ''}|${payloadKey.slice(0, 120)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  out.sort((a, b) => a.timestamp - b.timestamp);
  return out.length > MAX_EVENTS ? out.slice(-MAX_EVENTS) : out;
}

export function useAgentPlaygroundStream(missionId: string | null) {
  const [events, setEvents] = useState<PlaygroundEvent[]>([]);
  const [connState, setConnState] = useState<ConnState>('connecting');
  const [error, setError] = useState<string | null>(null);
  const lastTsRef = useRef<number>(0);
  const eventsRef = useRef<PlaygroundEvent[]>([]);

  // keep ref synced
  useEffect(() => {
    eventsRef.current = events;
    if (events.length) {
      lastTsRef.current = events[events.length - 1].timestamp;
    }
  }, [events]);

  useEffect(() => {
    if (!missionId || missionId === 'undefined') return;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let socket: Socket | null = null;

    const append = (next: PlaygroundEvent[]) => {
      if (cancelled || !next.length) return;
      setEvents((prev) => dedupeAndCap([...prev, ...next]));
    };

    // Step 1: hydrate 从 /replay
    void (async () => {
      try {
        const replay = await replayMission(missionId);
        if (!cancelled) append(replay.events);
      } catch (e) {
        if (!cancelled) {
          setError(`Failed to load mission history: ${(e as Error).message}`);
        }
      }
    })();

    // Step 2: 连 socket
    const auth = getAuthHeader();
    const token = auth.Authorization?.replace(/^Bearer\s+/i, '') ?? auth.token;
    socket = io(`${config.apiBaseUrl}/agent-playground`, {
      transports: ['websocket'],
      auth: token ? { token } : {},
      reconnectionAttempts: 3,
      timeout: 8000,
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
            startPolling();
          }
        }
      );
    };
    const onDisconnect = () => {
      if (cancelled) return;
      setConnState('polling');
      startPolling();
    };
    const onConnectError = (err: Error) => {
      if (cancelled) return;
      setError(err.message);
      setConnState('polling');
      startPolling();
    };
    const onAnyHandler = (type: string, data: PlaygroundEvent) => {
      if (!type.startsWith('agent-playground.')) return;
      append([{ ...data, type }]);
    };

    const startPolling = () => {
      if (pollTimer) return;
      const tick = async () => {
        if (cancelled) return;
        try {
          const replay = await replayMission(missionId, lastTsRef.current);
          append(replay.events);
        } catch {
          // 忽略 polling 错误
        }
      };
      pollTimer = setInterval(() => {
        void tick();
      }, POLL_INTERVAL_MS);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.onAny(onAnyHandler);

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
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
