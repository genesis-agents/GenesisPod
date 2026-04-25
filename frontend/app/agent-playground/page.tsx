'use client';

import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';
import { Sparkles, ArrowRight } from 'lucide-react';

const DEMOS = [
  {
    id: 'research-team',
    title: 'Research Team',
    description:
      'Leader plans dimensions → 5 Researchers run in parallel → Analyst reflects → Writer drafts → 3-judge consensus.',
    badges: ['LeaderWorker', 'Reflexion', 'Verify Consensus', 'Memory Index'],
    href: '/agent-playground/research-team',
  },
  // 后续可加 Writing Team / Slides Team / ...
] as const;

export default function PlaygroundIndexPage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8 flex items-center gap-3">
        <Sparkles className="h-7 w-7 text-purple-500" />
        <h1 className="text-2xl font-bold text-gray-900">
          {t('nav.playground') || 'Playground'}
        </h1>
      </div>
      <p className="mb-8 text-sm text-gray-600">
        Demo agent teams that showcase the full Harness stack: Loop strategies,
        Verify consensus, Checkpoints, Memory auto-index, BYOK / credit
        awareness, and OTel-standard tracing.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {DEMOS.map((demo) => (
          <Link
            key={demo.id}
            href={demo.href}
            className="group rounded-xl border border-gray-200 bg-white p-5 transition hover:border-purple-300 hover:shadow-md"
          >
            <div className="mb-3 flex items-start justify-between">
              <h2 className="text-base font-semibold text-gray-900">
                {demo.title}
              </h2>
              <ArrowRight className="h-4 w-4 text-gray-400 group-hover:translate-x-1 group-hover:text-purple-500" />
            </div>
            <p className="mb-3 text-sm text-gray-600">{demo.description}</p>
            <div className="flex flex-wrap gap-1.5">
              {demo.badges.map((b) => (
                <span
                  key={b}
                  className="inline-block rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700"
                >
                  {b}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
