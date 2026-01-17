'use client';

import { useState, useEffect } from 'react';
import { Sparkles, X } from 'lucide-react';
import {
  hasNewVersion,
  markVersionAsSeen,
  getLatestChangelog,
  CURRENT_VERSION,
} from '@/lib/utils/changelog';
import { config } from '@/lib/utils/config';

export default function VersionUpdateBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    setShowBanner(hasNewVersion());
  }, []);

  const handleClose = () => {
    markVersionAsSeen();
    setShowBanner(false);
  };

  if (!isMounted || !showBanner) {
    return null;
  }

  const latestChangelog = getLatestChangelog();

  return (
    <div className="relative border-b border-red-200 bg-gradient-to-r from-red-50 to-orange-50">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <div className="flex flex-1 items-center gap-3">
            <Sparkles className="h-5 w-5 flex-shrink-0 text-red-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">
                新版本 v{CURRENT_VERSION} 已发布!{' '}
                <span className="hidden text-gray-600 sm:inline">
                  {latestChangelog.changes.length} 项更新
                </span>
                <span className="font-mono ml-2 rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-700">
                  {config.gitCommitHash}
                </span>
              </p>
              <p className="mt-0.5 hidden text-xs text-gray-600 md:block">
                {latestChangelog.changes[0]?.description}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
