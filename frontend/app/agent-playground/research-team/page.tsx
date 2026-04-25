'use client';

import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { DemoLauncher } from '@/components/agent-playground';

export default function ResearchTeamLauncherPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link
        href="/agent-playground"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-purple-600"
      >
        <ArrowLeft className="h-4 w-4" />
        Playground
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <Sparkles className="h-7 w-7 text-purple-500" />
        <h1 className="text-2xl font-bold text-gray-900">Research Team</h1>
      </div>
      <p className="mb-8 text-sm text-gray-600">
        Spawns a 5-agent team using Harness LeaderWorker + Reflexion + Verify
        Consensus loops. Real LLMs, real tools (web-search / arxiv-search /
        github-search), real credit billing.
      </p>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <DemoLauncher />
      </div>
    </div>
  );
}
