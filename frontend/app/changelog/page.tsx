'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Sparkles, Bug, Zap, AlertTriangle } from 'lucide-react';
import {
  CHANGELOG,
  CURRENT_VERSION,
  getChangeTypeInfo,
  markVersionAsSeen,
} from '@/lib/utils/changelog';
import type { ChangelogEntry } from '@/lib/utils/changelog';
import AppShell from '@/components/layout/AppShell';

const typeIcons: Record<ChangelogEntry['changes'][0]['type'], React.ReactNode> =
  {
    feature: <Sparkles className="h-4 w-4" />,
    fix: <Bug className="h-4 w-4" />,
    improvement: <Zap className="h-4 w-4" />,
    breaking: <AlertTriangle className="h-4 w-4" />,
  };

export default function ChangelogPage() {
  useEffect(() => {
    markVersionAsSeen();
  }, []);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl overflow-y-auto px-4 py-8">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">What's New</h1>
          <p className="mt-1 text-sm text-gray-500">
            Current version:{' '}
            <span className="font-mono rounded bg-gray-100 px-2 py-0.5">
              v{CURRENT_VERSION}
            </span>
          </p>
        </div>

        <div className="space-y-8">
          {CHANGELOG.map((entry) => (
            <div key={entry.version} className="relative">
              <div className="mb-3 flex items-center gap-3">
                <h2 className="text-lg font-semibold text-gray-900">
                  v{entry.version}
                </h2>
                <span className="text-sm text-gray-400">{entry.date}</span>
                {entry.version === CURRENT_VERSION && (
                  <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                    Latest
                  </span>
                )}
              </div>
              <ul className="space-y-2">
                {entry.changes.map((change, i) => {
                  const info = getChangeTypeInfo(change.type);
                  return (
                    <li key={i} className="flex items-start gap-2.5">
                      <span
                        className={`mt-0.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${info.color}`}
                      >
                        {typeIcons[change.type]}
                        {info.label}
                      </span>
                      <span className="text-sm text-gray-700">
                        {change.description}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
