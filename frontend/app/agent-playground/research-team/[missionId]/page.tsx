'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { EventStream, MissionDashboard } from '@/components/agent-playground';
import { useAgentPlaygroundStream } from '@/hooks/useAgentPlaygroundStream';

export default function MissionDetailPage() {
  const params = useParams();
  const missionId = params?.missionId as string;
  const { events, connected, error } = useAgentPlaygroundStream(missionId);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <Link
        href="/agent-playground/research-team"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-purple-600"
      >
        <ArrowLeft className="h-4 w-4" />
        New mission
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Research Mission</h1>
          <p className="font-mono mt-0.5 text-xs text-gray-500">{missionId}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            connected
              ? 'bg-green-50 text-green-700'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-400'}`}
          />
          {connected ? 'Live' : 'Disconnected'}
        </span>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
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
  );
}
