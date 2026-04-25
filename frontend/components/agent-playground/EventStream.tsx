'use client';

import { useEffect, useRef } from 'react';
import { Activity, AlertCircle } from 'lucide-react';
import type { PlaygroundEvent } from '@/hooks/useAgentPlaygroundStream';

function tagColor(type: string): string {
  if (type.includes('error') || type.includes('failed'))
    return 'bg-red-50 text-red-700 border-red-200';
  if (type.includes('completed') || type.includes('scored'))
    return 'bg-green-50 text-green-700 border-green-200';
  if (type.includes('started'))
    return 'bg-blue-50 text-blue-700 border-blue-200';
  if (type.includes('budget'))
    return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-gray-50 text-gray-700 border-gray-200';
}

export function EventStream({ events }: { events: PlaygroundEvent[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [events.length]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
        <Activity className="h-4 w-4 text-purple-500" />
        <h3 className="text-sm font-semibold text-gray-900">
          Live Event Stream
        </h3>
        <span className="ml-auto text-xs text-gray-400">
          {events.length} events
        </span>
      </div>
      <div className="max-h-[480px] overflow-y-auto p-3">
        {events.length === 0 ? (
          <div className="flex items-center gap-2 p-4 text-sm text-gray-500">
            <AlertCircle className="h-4 w-4" />
            Waiting for events…
          </div>
        ) : (
          <ol className="space-y-1.5">
            {events.map((ev, i) => (
              <li key={`${ev.timestamp}-${i}`} className="flex gap-2 text-sm">
                <span className="font-mono shrink-0 text-xs text-gray-400">
                  {new Date(ev.timestamp).toLocaleTimeString()}
                </span>
                <span
                  className={`inline-block shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${tagColor(ev.type)}`}
                >
                  {ev.type.replace('agent-playground.', '')}
                </span>
                <span className="line-clamp-1 flex-1 text-gray-700">
                  {summarize(ev.payload)}
                </span>
              </li>
            ))}
            <div ref={bottomRef} />
          </ol>
        )}
      </div>
    </div>
  );
}

function summarize(payload: unknown): string {
  if (payload == null) return '';
  if (typeof payload === 'string') return payload;
  try {
    const s = JSON.stringify(payload);
    return s.length > 200 ? s.slice(0, 200) + '…' : s;
  } catch {
    return String(payload);
  }
}
