'use client';

import { useState, useEffect, useCallback } from 'react';
import { Activity, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { logger } from '@/lib/utils/logger';
import { AdminPageLayout } from '@/components/admin/layout';
import ClientDate from '@/components/common/ClientDate';

interface TraceSummary {
  id: string;
  name: string;
  type: string;
  status: 'running' | 'success' | 'error';
  startTime: string;
  duration?: number;
  spanCount: number;
}

interface SpanData {
  id: string;
  name: string;
  type: string;
  status: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  output?: unknown;
  error?: string;
}

interface TraceDetail {
  id: string;
  name: string;
  type: string;
  status: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  metadata?: Record<string, unknown>;
  spans: SpanData[];
}

interface TraceStats {
  totalTraces: number;
  runningTraces: number;
  totalSpans: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
}

interface ApiEnvelope<T> {
  data?: T | ApiEnvelope<T>;
}

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-blue-100 text-blue-800',
  success: 'bg-green-100 text-green-800',
  error: 'bg-red-100 text-red-800',
};

// Values must match backend TraceType union in trace.interface.ts
const TYPE_FILTERS = [
  'all',
  'research',
  'research_mission',
  'team_execution',
  'tool_call',
  'a2a_task',
];

function formatDuration(ms?: number): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function unwrapApiData<T>(payload: unknown): T | undefined {
  let current = payload;
  while (
    current &&
    typeof current === 'object' &&
    'data' in current &&
    (current as ApiEnvelope<T>).data !== undefined
  ) {
    current = (current as ApiEnvelope<T>).data;
  }
  return current as T | undefined;
}

function TraceRow({ trace, apiUrl }: { trace: TraceSummary; apiUrl: string }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<TraceDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchDetail = useCallback(async () => {
    if (detail) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/admin/traces/${trace.id}`, {
        headers: getAuthHeader(),
      });
      if (!res.ok) throw new Error('Failed to fetch trace detail');
      const data = unwrapApiData<TraceDetail>(await res.json());
      setDetail(data ?? null);
    } catch (err) {
      logger.error('Failed to fetch trace detail:', err);
    } finally {
      setLoading(false);
    }
  }, [detail, apiUrl, trace.id]);

  const handleExpand = () => {
    if (!expanded) {
      void fetchDetail();
    }
    setExpanded(!expanded);
  };

  return (
    <>
      <tr className="cursor-pointer hover:bg-gray-50" onClick={handleExpand}>
        <td className="px-4 py-3">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          )}
        </td>
        <td className="px-4 py-3">
          <span className="text-sm font-medium text-gray-900">
            {trace.name}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
            {trace.type}
          </span>
        </td>
        <td className="px-4 py-3">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[trace.status] ?? 'bg-gray-100 text-gray-800'}`}
          >
            {trace.status}
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-gray-500">
          <ClientDate date={trace.startTime} format="datetime" />
        </td>
        <td className="px-4 py-3 text-sm text-gray-500">
          {formatDuration(trace.duration)}
        </td>
        <td className="px-4 py-3 text-sm text-gray-500">{trace.spanCount}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="bg-gray-50 px-4 py-3">
            {loading ? (
              <div className="text-sm text-gray-500">Loading spans...</div>
            ) : !detail ? (
              <div className="text-sm text-red-500">Failed to load detail</div>
            ) : (
              <div className="space-y-2">
                {detail.metadata && Object.keys(detail.metadata).length > 0 && (
                  <div className="text-xs text-gray-500">
                    {Object.entries(detail.metadata).map(([k, v]) => (
                      <span key={k} className="mr-4">
                        <span className="font-medium">{k}:</span> {String(v)}
                      </span>
                    ))}
                  </div>
                )}
                {detail.spans.length === 0 ? (
                  <div className="text-sm text-gray-500">No spans recorded</div>
                ) : (
                  <div className="overflow-x-auto rounded border bg-white">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b bg-gray-100">
                        <tr>
                          <th className="px-3 py-2 font-medium">Span</th>
                          <th className="px-3 py-2 font-medium">Type</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                          <th className="px-3 py-2 font-medium">Duration</th>
                          <th className="px-3 py-2 font-medium">Output</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {detail.spans.map((span) => (
                          <tr key={span.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium text-gray-800">
                              {span.name}
                            </td>
                            <td className="px-3 py-2 text-gray-500">
                              {span.type}
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${STATUS_COLORS[span.status] ?? 'bg-gray-100 text-gray-800'}`}
                              >
                                {span.status}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-gray-500">
                              {formatDuration(span.duration)}
                            </td>
                            <td className="max-w-xs truncate px-3 py-2 text-gray-500">
                              {span.error ? (
                                <span className="text-red-600">
                                  {span.error}
                                </span>
                              ) : span.output ? (
                                JSON.stringify(span.output).slice(0, 100)
                              ) : (
                                '-'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function TracesPage() {
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [stats, setStats] = useState<TraceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');
  const apiUrl = config.apiUrl;

  const fetchTraces = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (typeFilter !== 'all') params.append('type', typeFilter);

      const [tracesRes, statsRes] = await Promise.all([
        fetch(`${apiUrl}/admin/traces?${params.toString()}`, {
          headers: getAuthHeader(),
        }),
        fetch(`${apiUrl}/admin/traces/stats`, { headers: getAuthHeader() }),
      ]);

      if (tracesRes.ok) {
        const data = unwrapApiData<TraceSummary[]>(await tracesRes.json());
        setTraces(Array.isArray(data) ? data : []);
      }
      if (statsRes.ok) {
        const data = unwrapApiData<TraceStats>(await statsRes.json());
        setStats(data ?? null);
      }
    } catch (err) {
      logger.error('Failed to fetch traces:', err);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, typeFilter]);

  useEffect(() => {
    void fetchTraces();
  }, [fetchTraces]);

  return (
    <AdminPageLayout
      title="Agent Traces"
      description="Monitor AI agent execution traces and spans"
      icon={Activity}
      domain="ai"
    >
      <div className="space-y-4">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-lg bg-white p-4 shadow">
              <div className="text-2xl font-bold text-gray-900">
                {stats.totalTraces}
              </div>
              <div className="text-sm text-gray-500">Total Traces</div>
            </div>
            <div className="rounded-lg bg-white p-4 shadow">
              <div className="text-2xl font-bold text-blue-600">
                {stats.runningTraces}
              </div>
              <div className="text-sm text-gray-500">Running</div>
            </div>
            <div className="rounded-lg bg-white p-4 shadow">
              <div className="text-2xl font-bold text-green-600">
                {stats.byStatus?.success ?? 0}
              </div>
              <div className="text-sm text-gray-500">Success</div>
            </div>
            <div className="rounded-lg bg-white p-4 shadow">
              <div className="text-2xl font-bold text-red-600">
                {stats.byStatus?.error ?? 0}
              </div>
              <div className="text-sm text-gray-500">Errors</div>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setTypeFilter(f)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  typeFilter === f
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            onClick={() => void fetchTraces()}
            disabled={loading}
            className="ml-auto flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
            />
            Refresh
          </button>
        </div>

        {/* Table */}
        <div className="rounded-lg bg-white shadow">
          {loading && traces.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              Loading traces...
            </div>
          ) : traces.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No traces found. Start a research session to see traces.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="w-8 px-4 py-3" />
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Started</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3">Spans</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {traces.map((trace) => (
                    <TraceRow key={trace.id} trace={trace} apiUrl={apiUrl} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminPageLayout>
  );
}
