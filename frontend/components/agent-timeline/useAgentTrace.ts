'use client';

/**
 * useAgentTrace
 *
 * 轮询 /api/v1/admin/monitoring/traces/:id 获取 Trace 详情。
 * running 状态下每 2s 刷新；success/error 状态停止轮询。
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types (mirroring backend trace.interface.ts) ────────

export type ExecutionStatus = 'running' | 'success' | 'error';
export type SpanType =
  | 'llm_call'
  | 'tool_execution'
  | 'search'
  | 'analysis'
  | 'synthesis'
  | 'review'
  | 'planning';

export interface SpanData {
  id: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  type: SpanType;
  status: ExecutionStatus;
  startTime: string; // ISO string from API
  endTime?: string;
  duration?: number; // ms
  metadata: Record<string, unknown>;
  output?: unknown;
  error?: string;
}

export interface TraceData {
  id: string;
  name: string;
  type: string;
  status: ExecutionStatus;
  startTime: string;
  endTime?: string;
  duration?: number;
  metadata: Record<string, unknown>;
  spans: SpanData[];
}

export interface UseAgentTraceResult {
  trace: TraceData | null;
  loading: boolean;
  error: string | null;
  /** Manually trigger a refresh */
  refresh: () => void;
}

const POLL_INTERVAL_MS = 2000;

export function useAgentTrace(traceId: string | null): UseAgentTraceResult {
  const [trace, setTrace] = useState<TraceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchTrace = useCallback(async () => {
    if (!traceId) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      setLoading(true);
      const res = await fetch(`/api/v1/admin/monitoring/traces/${traceId}`, {
        signal: abortRef.current.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: TraceData = await res.json();
      setTrace(data);
      setError(null);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [traceId]);

  useEffect(() => {
    if (!traceId) {
      setTrace(null);
      setError(null);
      return;
    }

    let cancelled = false;

    // Single poll chain: fire immediately (delay=0), then every POLL_INTERVAL_MS
    // while still running. This avoids two concurrent fetch chains.
    const scheduleNext = (delay: number) => {
      timerRef.current = setTimeout(async () => {
        if (cancelled) return;
        await fetchTrace();
        // Check latest status and continue only if still running
        setTrace((current) => {
          if (!cancelled && current?.status === 'running') {
            scheduleNext(POLL_INTERVAL_MS);
          }
          return current;
        });
      }, delay);
    };

    scheduleNext(0);

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, [traceId, fetchTrace]);

  return { trace, loading, error, refresh: fetchTrace };
}
