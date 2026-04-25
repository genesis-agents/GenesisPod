'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';
import {
  Sparkles,
  ArrowRight,
  Users,
  Cpu,
  Activity,
  Database,
  History,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import { listMissions, type MissionListItem } from '@/lib/api/agent-playground';
import { ClientDate } from '@/components/common/ClientDate';

const DEMOS = [
  {
    id: 'research-team',
    title: 'Research Team',
    tagline: '5-Agent · LeaderWorker · Reflexion · Verify Consensus',
    description:
      'Leader plans dimensions → 5 Researchers run in parallel → Analyst reflects → Writer drafts → 3-judge consensus.',
    badges: ['LeaderWorker', 'Reflexion', 'Verify Consensus', 'Memory Index'],
    href: '/agent-playground/research-team',
    accent: 'from-violet-500 to-purple-600',
    iconAccent: 'shadow-violet-500/25',
    icon: Users,
  },
] as const;

const CAPABILITIES = [
  {
    icon: Cpu,
    title: 'Loop strategies',
    desc: 'ReAct · Reflexion · LeaderWorker',
  },
  {
    icon: Activity,
    title: 'Verify consensus',
    desc: 'Self · external · critical judges',
  },
  {
    icon: Database,
    title: 'Memory auto-index',
    desc: 'Trajectory → vector store',
  },
  {
    icon: Sparkles,
    title: 'BYOK / credits',
    desc: 'Real billing · OTel tracing',
  },
];

function StatusPill({ status }: { status: string }) {
  if (status === 'completed')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200">
        <CheckCircle2 className="h-3 w-3" /> Completed
      </span>
    );
  if (status === 'failed')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 ring-1 ring-red-200">
        <XCircle className="h-3 w-3" /> Failed
      </span>
    );
  if (status === 'running')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700 ring-1 ring-violet-200">
        <Loader2 className="h-3 w-3 animate-spin" /> Running
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-500 ring-1 ring-gray-200">
      <Clock className="h-3 w-3" /> {status}
    </span>
  );
}

function MissionHistoryCard({ mission }: { mission: MissionListItem }) {
  return (
    <Link
      href={`/agent-playground/research-team/${mission.id}`}
      className="group block rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="line-clamp-2 flex-1 text-sm font-semibold text-gray-900 group-hover:text-violet-700">
          {mission.topic}
        </p>
        <StatusPill status={mission.status} />
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
          {mission.depth}
        </span>
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
          {mission.language}
        </span>
        <ClientDate date={mission.startedAt} format="datetime" />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        {mission.finalScore != null && (
          <span
            className={`font-semibold ${
              mission.finalScore >= 80
                ? 'text-emerald-600'
                : mission.finalScore >= 60
                  ? 'text-amber-600'
                  : 'text-red-600'
            }`}
          >
            Score {mission.finalScore}
          </span>
        )}
        {mission.tokensUsed != null && mission.tokensUsed > 0 && (
          <span className="text-gray-500">
            {mission.tokensUsed.toLocaleString()} tokens
          </span>
        )}
        {mission.wallTimeMs != null && (
          <span className="text-gray-500">
            {(mission.wallTimeMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>
      {mission.errorMessage && (
        <p className="mt-2 line-clamp-2 text-[11px] text-red-600">
          {mission.errorMessage}
        </p>
      )}
    </Link>
  );
}

export default function PlaygroundIndexPage() {
  const { t } = useTranslation();
  const [missions, setMissions] = useState<MissionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listMissions()
      .then((items) => {
        if (!cancelled) {
          setMissions(items);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="h-full overflow-auto bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/50 backdrop-blur-sm">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/25">
                <Sparkles className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {t('nav.playground') || 'Playground'}
                </h1>
                <p className="text-sm text-gray-500">
                  Demo agent teams powered by the full Harness runtime
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-8 py-8">
        {/* Capabilities strip */}
        <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          {CAPABILITIES.map((c) => {
            const Icon = c.icon;
            return (
              <div
                key={c.title}
                className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm"
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <Icon className="h-4 w-4 text-violet-500" />
                  <p className="text-sm font-semibold text-gray-900">
                    {c.title}
                  </p>
                </div>
                <p className="text-xs text-gray-500">{c.desc}</p>
              </div>
            );
          })}
        </div>

        {/* Demo teams */}
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            Available teams
          </h2>
          <span className="text-xs text-gray-500">
            {DEMOS.length} {DEMOS.length === 1 ? 'team' : 'teams'}
          </span>
        </div>

        <div className="mb-10 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {DEMOS.map((demo) => {
            const Icon = demo.icon;
            return (
              <Link
                key={demo.id}
                href={demo.href}
                className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-lg"
              >
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${demo.accent} shadow-md ${demo.iconAccent}`}
                    >
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {demo.title}
                      </h3>
                      <p className="text-xs font-medium text-violet-600">
                        {demo.tagline}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-gray-300 transition-all group-hover:translate-x-1 group-hover:text-violet-500" />
                </div>

                <p className="mb-4 text-sm leading-relaxed text-gray-600">
                  {demo.description}
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {demo.badges.map((b) => (
                    <span
                      key={b}
                      className="inline-flex items-center rounded-full border border-violet-100 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700"
                    >
                      {b}
                    </span>
                  ))}
                </div>
              </Link>
            );
          })}
        </div>

        {/* Mission history */}
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <History className="h-4 w-4 text-gray-500" />
            Your mission history
          </h2>
          <span className="text-xs text-gray-500">
            {missions.length} {missions.length === 1 ? 'mission' : 'missions'}
          </span>
        </div>

        {loading ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-10 text-center">
            <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-gray-400" />
            <p className="text-sm text-gray-500">Loading mission history…</p>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Failed to load missions: {error}
          </div>
        ) : missions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-10 text-center">
            <p className="text-sm text-gray-500">
              No missions yet. Start one above ↑
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {missions.map((m) => (
              <MissionHistoryCard key={m.id} mission={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
