'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Sparkles, X } from 'lucide-react';
import {
  hasNewVersion,
  markVersionAsSeen,
  getLatestChangelog,
  CURRENT_VERSION,
} from '@/lib/utils/changelog';

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
    <div className="relative flex-shrink-0 border-b border-violet-200 bg-gradient-to-r from-violet-50 to-indigo-50">
      <div className="mx-auto max-w-7xl px-4 py-2.5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <Link
            href="/changelog"
            onClick={handleClose}
            className="flex flex-1 items-center gap-3 hover:opacity-80"
          >
            <Sparkles className="h-5 w-5 flex-shrink-0 text-violet-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">
                v{CURRENT_VERSION} released{' '}
                <span className="hidden text-gray-600 sm:inline">
                  &middot; {latestChangelog.changes.length} changes
                </span>
                <span className="ml-2 text-xs text-violet-600 underline">
                  View changelog
                </span>
              </p>
            </div>
          </Link>
          <button
            onClick={handleClose}
            className="ml-3 rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
