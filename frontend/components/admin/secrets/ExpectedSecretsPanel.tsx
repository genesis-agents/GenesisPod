'use client';

import {
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Settings,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useState } from 'react';
import {
  ExpectedSecretItem,
  ExpectedSecretsResponse,
} from '@/hooks/domain/useAdminSecrets';

export interface ExpectedSecretsPanelProps {
  expected: ExpectedSecretsResponse | null;
  loading: boolean;
  onConfigure: (item: ExpectedSecretItem) => void;
  onDeleteOrphan: (secretId: string, name: string) => void;
}

function groupByCategory(
  items: ExpectedSecretItem[]
): Record<string, ExpectedSecretItem[]> {
  return items.reduce<Record<string, ExpectedSecretItem[]>>((acc, item) => {
    const key = item.category;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

function CategoryLabel({ category }: { category: string }) {
  const labelMap: Record<string, string> = {
    AI_MODEL: 'AI Model',
    SEARCH: 'Search',
    EXTRACTION: 'Content Extraction',
    YOUTUBE: 'YouTube',
    TTS: 'Text-to-Speech',
    SKILLSMP: 'SkillsMP',
    POLICY: 'Policy Research',
    FINANCE: 'Finance Data',
    ACADEMIC: 'Academic Research',
    WEATHER: 'Weather Data',
    IMAGE_SEARCH: 'Image Search',
    DEV_TOOLS: 'Dev Tools',
    MCP: 'MCP Server',
    USER_DONATED: 'User Donated',
    OTHER: 'Other',
  };
  return <>{labelMap[category] ?? category}</>;
}

function MissingSecretCard({
  item,
  onConfigure,
}: {
  item: ExpectedSecretItem;
  onConfigure: (item: ExpectedSecretItem) => void;
}) {
  const hasGuide = Boolean(item.setupGuideUrl);

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800/40 dark:bg-orange-900/10">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-gray-900 dark:text-white">
            {item.displayName}
          </span>
          {item.provider && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              {item.provider}
            </span>
          )}
          {item.freeTierAvailable && (
            <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
              Free tier
            </span>
          )}
        </div>
        {item.description && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {item.description}
          </p>
        )}
        <p className="mt-0.5 font-mono text-xs text-gray-400 dark:text-gray-500">
          {item.name}
        </p>
      </div>
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
        {hasGuide ? (
          <button
            onClick={() =>
              window.open(item.setupGuideUrl, '_blank', 'noopener,noreferrer')
            }
            className="flex items-center gap-1 rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:border-blue-700 dark:bg-gray-800 dark:text-blue-400 dark:hover:bg-blue-900/20"
          >
            <ExternalLink className="h-3 w-3" />
            Apply
          </button>
        ) : (
          <button
            disabled
            className="flex cursor-not-allowed items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500"
            title="Setup guide coming soon"
          >
            <ExternalLink className="h-3 w-3" />
            Setup guide coming soon
          </button>
        )}
        <button
          onClick={() => onConfigure(item)}
          className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Settings className="h-3 w-3" />
          Configure
        </button>
      </div>
    </div>
  );
}

export function ExpectedSecretsPanel({
  expected,
  loading,
  onConfigure,
  onDeleteOrphan,
}: ExpectedSecretsPanelProps) {
  const [expanded, setExpanded] = useState(true);

  if (loading && !expected) {
    return (
      <div
        data-testid="expected-loading"
        className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50"
      >
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        <span className="text-sm text-gray-500">Loading expected secrets...</span>
      </div>
    );
  }

  if (!expected) return null;

  const { summary, orphans } = expected;
  const missingItems = expected.items.filter((i) => i.status === 'missing');
  const allConfigured = summary.missing === 0;

  if (allConfigured && orphans.length === 0) {
    return (
      <div
        data-testid="expected-all-configured"
        className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800/40 dark:bg-green-900/10"
      >
        <CheckCircle className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
        <span className="text-sm font-medium text-green-700 dark:text-green-300">
          All {summary.total} expected secrets configured
        </span>
      </div>
    );
  }

  const grouped = groupByCategory(missingItems);

  return (
    <div className="space-y-3">
      {/* Summary header */}
      <div className="flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 dark:border-orange-800/40 dark:bg-orange-900/10">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-orange-500" />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Expected{' '}
            <span className="font-semibold text-gray-900 dark:text-white">
              {summary.total}
            </span>{' '}
            secrets &mdash; configured{' '}
            <span className="font-semibold text-green-700 dark:text-green-400">
              {summary.configured}
            </span>
            , pending{' '}
            <span className="font-semibold text-orange-600 dark:text-orange-400">
              {summary.missing}
            </span>
          </span>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="rounded p-1 hover:bg-orange-100 dark:hover:bg-orange-900/30"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-gray-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-500" />
          )}
        </button>
      </div>

      {/* Missing items grouped by category */}
      {expanded && missingItems.length > 0 && (
        <div className="space-y-4">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                <CategoryLabel category={category} />
              </h4>
              <div className="space-y-2">
                {items.map((item) => (
                  <MissingSecretCard
                    key={item.name}
                    item={item}
                    onConfigure={onConfigure}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Orphans alert */}
      {orphans.length > 0 && (
        <div
          data-testid="orphans-alert"
          className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800/40 dark:bg-yellow-900/10"
        >
          <div className="mb-2 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            <span className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
              {orphans.length} secret{orphans.length > 1 ? 's' : ''} not in the
              preset list
            </span>
          </div>
          <ul className="space-y-1">
            {orphans.map((orphan) => (
              <li
                key={orphan.secretId}
                className="flex items-center justify-between gap-2"
              >
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {orphan.displayName}
                  <span className="ml-1 font-mono text-xs text-gray-400">
                    ({orphan.name})
                  </span>
                </span>
                <button
                  onClick={() => onDeleteOrphan(orphan.secretId, orphan.name)}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/30"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
