'use client';

import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';
import { DemoLauncher } from '@/components/agent-playground';

export default function ResearchTeamLauncherPage() {
  return (
    <div className="h-full overflow-auto bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/50 backdrop-blur-sm">
        <div className="px-8 py-6">
          <Link
            href="/agent-playground"
            className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-violet-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Playground
          </Link>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/25">
              <Users className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Research Team
              </h1>
              <p className="text-sm text-gray-500">
                5-agent crew · LeaderWorker + Reflexion + Verify Consensus
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-3xl px-8 py-8">
        <p className="mb-6 text-sm leading-relaxed text-gray-600">
          Spawns a 5-agent team using the Harness runtime. Real LLMs, real tools
          (web-search / arxiv-search / github-search), real credit billing.
          Mission progress streams over WebSocket as it runs.
        </p>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <DemoLauncher />
        </div>
      </div>
    </div>
  );
}
