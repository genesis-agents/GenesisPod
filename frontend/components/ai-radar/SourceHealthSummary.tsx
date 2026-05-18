'use client';

import { useEffect } from 'react';

interface Props {
  totalSources: number;
  okCount: number;
  failCount: number;
  /** When fail/total >= 0.5, called with true; otherwise called with false */
  onAmberStateChange?: (amber: boolean) => void;
}

export function shouldShowAmber(
  failCount: number,
  totalSources: number
): boolean {
  if (totalSources === 0) return false;
  return failCount / totalSources >= 0.5;
}

export function SourceHealthSummary({
  totalSources,
  okCount,
  failCount,
  onAmberStateChange,
}: Props) {
  const amber = shouldShowAmber(failCount, totalSources);

  useEffect(() => {
    onAmberStateChange?.(amber);
  }, [amber, onAmberStateChange]);

  if (totalSources === 0) {
    return <span className="text-slate-400">0 源</span>;
  }

  return (
    <span className={amber ? 'text-amber-600' : 'text-slate-500'}>
      {totalSources} 源 · {okCount} ✓ · {failCount} ✗
    </span>
  );
}
