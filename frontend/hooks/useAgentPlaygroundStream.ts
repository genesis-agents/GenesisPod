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
import { replayMission } from '@/services/agent-playground/api';

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

  // keep ref synced (read-only snapshot for non-reactive consumers)
  useEffect(() => {
    eventsRef.current = events;
    // NOTE: lastTsRef is updated eagerly inside append() to avoid the race
    // where polling tick reads a stale lastTsRef before this effect fires.
  }, [events]);

  useEffect(() => {
    if (!missionId || missionId === 'undefined') return;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let socket: Socket | null = null;

    const append = (next: PlaygroundEvent[]) => {
      if (cancelled || !next.length) return;
      // ★ P1 (2026-05-06): 在 setEvents updater 内同步更新 lastTsRef，避免 polling
      //   tick 在 useEffect 触发前读到旧 ts 导致重复拉取已有事件（race condition）。
      setEvents((prev) => {
        const merged = dedupeAndCap([...prev, ...next]);
        if (merged.length) {
          lastTsRef.current = merged[merged.length - 1].timestamp;
        }
        return merged;
      });
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
    // 必须直连后端 —— gens.team 等自定义域名上 apiBaseUrl 是空字符串（走 Next.js
    // rewrites 代理 REST），但 Next.js 只代理 /api/v1/*，不代理 /socket.io/*，
    // 用相对 URL 会让 ws 连到 wss://gens.team/socket.io 永久 timeout。
    // getBackendUrl() 在浏览器/SSR 下都返回完整后端 URL（NEXT_PUBLIC_API_URL 或
    // RAILWAY_BACKEND_URL fallback）。
    const auth = getAuthHeader();
    const token = auth.Authorization?.replace(/^Bearer\s+/i, '') ?? auth.token;
    // 加 polling fallback：WS 升级失败（CDN/corp firewall）时退回 long-polling，
    // socket.io 自动 negotiate；不强制 ['websocket'] 单一 transport，避免硬死。
    // 重试次数提到 8 + 指数退避 → 短暂网络抖动可恢复，不立即降级 polling /replay。
    socket = io(`${config.getBackendUrl()}/agent-playground`, {
      transports: ['websocket', 'polling'],
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
