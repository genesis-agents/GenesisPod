'use client';

import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';
import {
  Sparkles,
  ArrowRight,
  Users,
  Cpu,
  Activity,
  Database,
} from 'lucide-react';

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

export default function PlaygroundIndexPage() {
  const { t } = useTranslation();

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

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
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
      </div>
    </div>
  );
}
