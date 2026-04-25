'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Activity } from 'lucide-react';
import { EventStream, MissionDashboard } from '@/components/agent-playground';
import { useAgentPlaygroundStream } from '@/hooks/useAgentPlaygroundStream';

export default function MissionDetailPage() {
  const params = useParams();
  const missionId = params?.missionId as string;
  const { events, connected, error } = useAgentPlaygroundStream(missionId);

  return (
    <div className="h-full overflow-auto bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/50 backdrop-blur-sm">
        <div className="px-8 py-6">
          <Link
            href="/agent-playground/research-team"
            className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-violet-600"
          >
            <ArrowLeft className="h-4 w-4" />
            New mission
          </Link>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/25">
                <Activity className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Research Mission
                </h1>
                <p className="font-mono text-xs text-gray-500">{missionId}</p>
              </div>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
                connected
                  ? 'bg-green-50 text-green-700 ring-1 ring-green-200'
                  : 'bg-gray-100 text-gray-600 ring-1 ring-gray-200'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  connected ? 'animate-pulse bg-green-500' : 'bg-gray-400'
                }`}
              />
              {connected ? 'Live' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-8 py-8">
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Connection error: {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <MissionDashboard events={events} />
          </div>
          <div className="lg:col-span-2">
            <EventStream events={events} />
          </div>
        </div>
      </div>
    </div>
  );
}
