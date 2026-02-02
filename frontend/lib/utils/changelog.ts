/**
 * Version changelog configuration
 * 版本更新日志配置
 */

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: {
    type: 'feature' | 'fix' | 'improvement' | 'breaking';
    description: string;
  }[];
}

export const CURRENT_VERSION = '3.3.14';

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '3.3.14',
    date: '2026-02-02',
    changes: [
      {
        type: 'fix',
        description:
          'Agent activity records now consistently display model labels',
      },
      {
        type: 'fix',
        description:
          'Auto-set API format from provider selection, preventing model configuration errors',
      },
      {
        type: 'fix',
        description:
          'Fixed NestJS dependency injection in refactored research services',
      },
    ],
  },
  {
    version: '3.3.10',
    date: '2026-02-01',
    changes: [
      {
        type: 'improvement',
        description:
          'Major restructuring of topic-research module for better maintainability',
      },
      {
        type: 'improvement',
        description: 'Comprehensive code quality improvements across 11 tasks',
      },
      {
        type: 'fix',
        description: 'Enhanced Leader planning depth and report breadth',
      },
    ],
  },
  {
    version: '3.3.4',
    date: '2026-02-01',
    changes: [
      {
        type: 'fix',
        description: 'Report quality improvements and code review hardening',
      },
      {
        type: 'fix',
        description: 'Business logic audit fixes for research pipeline',
      },
      {
        type: 'fix',
        description: 'Handle 401 auth failures gracefully in frontend polling',
      },
    ],
  },
  {
    version: '3.3.0',
    date: '2026-02-01',
    changes: [
      {
        type: 'feature',
        description: 'Research task todos now visible during refresh',
      },
      {
        type: 'fix',
        description: 'Preserve full section content instead of AI compression',
      },
      {
        type: 'fix',
        description: 'Save analyses before cognitive loop for data safety',
      },
    ],
  },
  {
    version: '3.2.0',
    date: '2026-01-31',
    changes: [
      {
        type: 'feature',
        description: 'AI Research deep dive with multi-agent collaboration',
      },
      {
        type: 'feature',
        description: 'Mission system with checkpoints and resume',
      },
      {
        type: 'feature',
        description: 'Structured research reports with citations and charts',
      },
    ],
  },
  {
    version: '3.0.0',
    date: '2026-01-15',
    changes: [
      {
        type: 'feature',
        description:
          'AI Coding multi-agent pipeline (PM → Architect → Engineer → QA)',
      },
      {
        type: 'feature',
        description: 'AI Writing with chapter management and version control',
      },
      {
        type: 'feature',
        description: 'AI Social content generation for multiple platforms',
      },
      { type: 'feature', description: 'Credits billing system' },
      {
        type: 'breaking',
        description:
          'Unified PostgreSQL architecture, removed MongoDB/Neo4j/Qdrant',
      },
    ],
  },
];

/**
 * Get the latest changelog entry
 */
export function getLatestChangelog(): ChangelogEntry {
  return CHANGELOG[0];
}

/**
 * Check if there's a new version
 */
export function hasNewVersion(): boolean {
  if (typeof window === 'undefined') return false;

  const lastSeenVersion = localStorage.getItem('lastSeenVersion');
  return !lastSeenVersion || lastSeenVersion !== CURRENT_VERSION;
}

/**
 * Mark current version as seen
 */
export function markVersionAsSeen(): void {
  if (typeof window === 'undefined') return;

  localStorage.setItem('lastSeenVersion', CURRENT_VERSION);
}

/**
 * Get change type display info
 */
export function getChangeTypeInfo(type: ChangelogEntry['changes'][0]['type']): {
  label: string;
  color: string;
} {
  switch (type) {
    case 'feature':
      return { label: 'New', color: 'bg-green-100 text-green-800' };
    case 'fix':
      return { label: 'Fix', color: 'bg-red-100 text-red-800' };
    case 'improvement':
      return { label: 'Improved', color: 'bg-blue-100 text-blue-800' };
    case 'breaking':
      return { label: 'Breaking', color: 'bg-orange-100 text-orange-800' };
  }
}
