'use client';

import { useState, useEffect, useRef } from 'react';
import { Activity, ChevronDown } from 'lucide-react';
import type { PlaygroundEvent } from '@/hooks/useAgentPlaygroundStream';
import { ClientDate } from '@/components/common/ClientDate';

function tagColor(type: string): string {
  if (
    type.includes('error') ||
    type.includes('failed') ||
    type.includes('rejected')
  )
    return 'bg-red-50 text-red-700 ring-red-200';
  if (type.includes('completed') || type.includes('verdict'))
    return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (type.includes('started')) return 'bg-blue-50 text-blue-700 ring-blue-200';
  if (type.includes('budget') || type.includes('cost'))
    return 'bg-amber-50 text-amber-700 ring-amber-200';
  if (type.includes('observation') || type.includes('action'))
    return 'bg-violet-50 text-violet-700 ring-violet-200';
  return 'bg-gray-50 text-gray-700 ring-gray-200';
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

export function RawEventLog({ events }: { events: PlaygroundEvent[] }) {
  const [open, setOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open)
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [events.length, open]);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <span className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-900">
            Raw event stream
          </span>
          <span className="text-xs text-gray-500">{events.length} events</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="border-t border-gray-100">
          <div className="max-h-[420px] overflow-y-auto p-3">
            {events.length === 0 ? (
              <p className="p-4 text-center text-sm text-gray-500">
                No events yet
              </p>
            ) : (
              <ol className="space-y-1.5">
                {events.map((ev, i) => (
                  <li
                    key={`${ev.timestamp}-${i}`}
                    className="flex gap-2 text-sm"
                  >
                    <span className="font-mono shrink-0 text-xs text-gray-400">
                      <ClientDate date={ev.timestamp} format="time" />
                    </span>
                    <span
                      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ${tagColor(ev.type)}`}
                    >
                      {ev.type.replace('agent-playground.', '')}
                    </span>
                    {ev.agentId && (
                      <span className="font-mono shrink-0 text-[10px] text-gray-400">
                        {ev.agentId}
                      </span>
                    )}
                    <span className="line-clamp-1 flex-1 text-[11px] text-gray-600">
                      {summarize(ev.payload)}
                    </span>
                  </li>
                ))}
                <div ref={bottomRef} />
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
