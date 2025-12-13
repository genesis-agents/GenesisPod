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

export const CURRENT_VERSION = '1.0.0';

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.0',
    date: '2025-12-13',
    changes: [
      {
        type: 'feature',
        description:
          'AI Office - Create professional documents, presentations, and reports with AI assistance',
      },
      {
        type: 'feature',
        description:
          'AI Teams - Collaborate with AI agents on research topics and analysis',
      },
      {
        type: 'feature',
        description:
          'AI Simulation - Run strategic simulations with multiple AI perspectives',
      },
      {
        type: 'feature',
        description:
          'Labs - Toggle AI features on/off to customize your experience',
      },
      {
        type: 'feature',
        description:
          'Feedback System - Submit bug reports and feature requests directly',
      },
      {
        type: 'improvement',
        description:
          'Admin Console - Reorganized tabs following best practices',
      },
      {
        type: 'improvement',
        description:
          'Notifications - Persistent notification system with filtering',
      },
    ],
  },
  {
    version: '0.9.0',
    date: '2025-12-10',
    changes: [
      {
        type: 'feature',
        description:
          'AI Studio - Build custom AI workflows and automation pipelines',
      },
      {
        type: 'feature',
        description: 'AI Store - Discover and install AI agents and extensions',
      },
      {
        type: 'improvement',
        description: 'Explore - Enhanced search with filters and sorting',
      },
      {
        type: 'fix',
        description: 'Fixed resource detail page loading issues',
      },
    ],
  },
  {
    version: '0.8.0',
    date: '2025-12-01',
    changes: [
      {
        type: 'feature',
        description:
          'Multi-Agent Mode - Use multiple AI agents for complex document generation',
      },
      {
        type: 'feature',
        description: 'PPT Templates - 10+ professional presentation templates',
      },
      {
        type: 'improvement',
        description:
          'Export System - Support for Word, PPT, PDF, Markdown formats',
      },
    ],
  },
  {
    version: '0.5.0',
    date: '2025-11-15',
    changes: [
      {
        type: 'feature',
        description: 'Ask AI - Chat with AI about any research topic',
      },
      {
        type: 'feature',
        description: 'Library - Organize and manage your bookmarked resources',
      },
      {
        type: 'feature',
        description: 'AI Summary - Automatically generate summaries for papers',
      },
      {
        type: 'feature',
        description: 'AI Translation - Translate content between languages',
      },
    ],
  },
  {
    version: '0.3.0',
    date: '2025-10-20',
    changes: [
      {
        type: 'feature',
        description:
          'Profile - Edit your profile, research interests, and preferences',
      },
      {
        type: 'feature',
        description: 'Google OAuth - Sign in with your Google account',
      },
      {
        type: 'improvement',
        description: 'UI - Modern sidebar navigation with collapsible design',
      },
    ],
  },
  {
    version: '0.1.0',
    date: '2025-10-01',
    changes: [
      {
        type: 'feature',
        description: 'Explore - Browse AI papers, projects, and news',
      },
      {
        type: 'feature',
        description: 'Bookmark - Save resources to your library',
      },
      {
        type: 'feature',
        description:
          'Data Collection - Aggregate content from multiple sources',
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
