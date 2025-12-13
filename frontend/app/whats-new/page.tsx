'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import {
  CHANGELOG,
  CURRENT_VERSION,
  getChangeTypeInfo,
  type ChangelogEntry,
} from '@/lib/utils/changelog';
import { Sparkles } from 'lucide-react';

function WhatsNewContent() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
          <div className="flex items-center gap-3">
            <Sparkles className="h-6 w-6 text-red-600" />
            <h1 className="text-2xl font-bold text-gray-900">What's New</h1>
          </div>
          <div className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800">
            v{CURRENT_VERSION}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-4xl">
            <p className="mb-8 text-gray-600">
              查看DeepDive的最新功能和改进。我们持续优化您的学术研究体验。
            </p>

            {/* Changelog Timeline */}
            <div className="space-y-8">
              {CHANGELOG.map((entry: ChangelogEntry, idx: number) => (
                <div
                  key={entry.version}
                  className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
                >
                  {/* Version Header */}
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <h2 className="text-xl font-bold text-gray-900">
                        v{entry.version}
                      </h2>
                      {idx === 0 && (
                        <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                          Latest
                        </span>
                      )}
                    </div>
                    <span className="text-sm text-gray-500">{entry.date}</span>
                  </div>

                  {/* Changes List */}
                  <div className="space-y-3">
                    {entry.changes.map((change, changeIdx: number) => {
                      const typeInfo = getChangeTypeInfo(change.type);
                      return (
                        <div key={changeIdx} className="flex items-start gap-3">
                          <span
                            className={`mt-0.5 rounded px-2 py-0.5 text-xs font-medium ${typeInfo.color}`}
                          >
                            {typeInfo.label}
                          </span>
                          <p className="flex-1 text-gray-700">
                            {change.description}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="mt-12 rounded-lg bg-gray-100 p-6 text-center">
              <p className="text-sm text-gray-600">
                想了解更多？访问我们的{' '}
                <a
                  href="https://github.com/JUNJIE-DUAN/deepdive-engine"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-red-600 hover:text-red-700"
                >
                  GitHub仓库
                </a>{' '}
                查看完整更新日志
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function WhatsNew() {
  return <WhatsNewContent />;
}
