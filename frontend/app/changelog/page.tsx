'use client';

import { useMemo } from 'react';
import { Sparkles, Bug, Zap, AlertTriangle } from 'lucide-react';
import {
  CHANGELOG,
  CURRENT_VERSION,
  getChangeTypeInfo,
} from '@/lib/utils/changelog';
import type { ChangelogEntry } from '@/lib/utils/changelog';
import AppShell from '@/components/layout/AppShell';

type ChangeType = ChangelogEntry['changes'][0]['type'];

const typeIcons: Record<ChangeType, React.ReactNode> = {
  feature: <Sparkles className="h-4 w-4" />,
  fix: <Bug className="h-4 w-4" />,
  improvement: <Zap className="h-4 w-4" />,
  breaking: <AlertTriangle className="h-4 w-4" />,
};

const statConfig: {
  type: ChangeType;
  label: string;
  icon: React.ReactNode;
  gradient: string;
  textColor: string;
}[] = [
  {
    type: 'feature',
    label: 'Features',
    icon: <Sparkles className="h-5 w-5" />,
    gradient: 'from-emerald-50 to-green-50 border-emerald-200',
    textColor: 'text-emerald-700',
  },
  {
    type: 'fix',
    label: 'Bug Fixes',
    icon: <Bug className="h-5 w-5" />,
    gradient: 'from-red-50 to-rose-50 border-red-200',
    textColor: 'text-red-600',
  },
  {
    type: 'improvement',
    label: 'Improvements',
    icon: <Zap className="h-5 w-5" />,
    gradient: 'from-blue-50 to-indigo-50 border-blue-200',
    textColor: 'text-blue-600',
  },
  {
    type: 'breaking',
    label: 'Breaking',
    icon: <AlertTriangle className="h-5 w-5" />,
    gradient: 'from-amber-50 to-orange-50 border-amber-200',
    textColor: 'text-amber-600',
  },
];

export default function ChangelogPage() {
  const stats = useMemo(() => {
    const counts: Record<ChangeType, number> = {
      feature: 0,
      fix: 0,
      improvement: 0,
      breaking: 0,
    };
    for (const entry of CHANGELOG) {
      for (const change of entry.changes) {
        counts[change.type]++;
      }
    }
    return counts;
  }, []);

  const totalVersions = CHANGELOG.length;

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto px-4 py-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">
              What&apos;s New
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Current version:{' '}
              <span className="font-mono rounded bg-gray-100 px-2 py-0.5">
                v{CURRENT_VERSION}
              </span>
              <span className="ml-3 text-gray-400">
                {totalVersions} releases
              </span>
            </p>
          </div>

          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {statConfig.map(({ type, label, icon, gradient, textColor }) => (
              <div
                key={type}
                className={`rounded-xl border bg-gradient-to-br ${gradient} p-3.5`}
              >
                <div className={`flex items-center gap-2 ${textColor}`}>
                  {icon}
                  <span className="text-2xl font-bold tabular-nums">
                    {stats[type]}
                  </span>
                </div>
                <p className="mt-1 text-xs font-medium text-gray-500">
                  {label}
                </p>
              </div>
            ))}
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
      </div>
    </AppShell>
  );
}
