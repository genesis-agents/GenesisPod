'use client';

import { useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import {
  CheckCircle,
  XCircle,
  Tag,
  Settings,
  ExternalLink,
  Loader2,
} from 'lucide-react';

// Builtin tool categories
const BUILTIN_CATEGORIES = [
  'information',
  'content',
  'data',
  'code',
  'integration',
  'memory',
  'export',
  'collaboration',
] as const;

type BuiltinCategory = (typeof BUILTIN_CATEGORIES)[number];

export interface BuiltinTool {
  id: string;
  name: string;
  displayName?: string;
  category: string;
  enabled: boolean;
  implemented: boolean;
  description?: string;
}

interface BuiltinToolsTabProps {
  tools: BuiltinTool[];
  onToggle: (toolId: string, enabled: boolean) => Promise<void>;
  loading?: boolean;
}

export default function BuiltinToolsTab({
  tools,
  onToggle,
  loading = false,
}: BuiltinToolsTabProps) {
  const { t } = useTranslation();
  const [togglingTool, setTogglingTool] = useState<string | null>(null);

  // Filter only builtin tools
  const builtinTools = tools.filter((tool) =>
    BUILTIN_CATEGORIES.includes(tool.category as BuiltinCategory)
  );

  const handleToggle = async (tool: BuiltinTool) => {
    if (!tool.implemented) return;

    setTogglingTool(tool.id);
    try {
      await onToggle(tool.id, !tool.enabled);
    } finally {
      setTogglingTool(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  if (builtinTools.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <Settings className="mx-auto h-12 w-12 text-gray-300" />
        <p className="mt-2">{t('admin.tools.noToolsFound')}</p>
      </div>
    );
  }

  // Group tools by category
  const groupedTools = builtinTools.reduce(
    (acc, tool) => {
      const category = tool.category;
      if (!acc[category]) acc[category] = [];
      acc[category].push(tool);
      return acc;
    },
    {} as Record<string, BuiltinTool[]>
  );

  return (
    <div className="space-y-6">
      {BUILTIN_CATEGORIES.map((category) => {
        const categoryTools = groupedTools[category];
        if (!categoryTools || categoryTools.length === 0) return null;

        return (
          <div key={category}>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
              <span className="rounded-lg bg-blue-50 px-2 py-1 text-blue-700">
                {t(`admin.tools.categories.${category}`)}
              </span>
              <span className="text-xs text-gray-400">
                ({categoryTools.filter((t) => t.enabled).length}/
                {categoryTools.length})
              </span>
            </h3>
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              {categoryTools.map((tool) => (
                <BuiltinToolRow
                  key={tool.id}
                  tool={tool}
                  onToggle={handleToggle}
                  toggling={togglingTool === tool.id}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BuiltinToolRow({
  tool,
  onToggle,
  toggling,
}: {
  tool: BuiltinTool;
  onToggle: (tool: BuiltinTool) => void;
  toggling: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="group flex items-center gap-4 border-b border-gray-100 px-4 py-4 transition-colors last:border-b-0 hover:bg-gray-50">
      {/* Status Indicator */}
      <div className="flex-shrink-0">
        {tool.enabled ? (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
            <CheckCircle className="h-5 w-5 text-green-600" />
          </div>
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
            <XCircle className="h-5 w-5 text-gray-400" />
          </div>
        )}
      </div>

      {/* Tool Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-gray-900">
            {tool.displayName || tool.name}
          </h3>
          {!tool.implemented && (
            <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
              {t('admin.skills.comingSoon')}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-gray-500">
          {tool.description ||
            t(`admin.tools.providers.${tool.id}.description`)}
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
          {t(`admin.tools.providers.${tool.id}.tags`)
            .split(', ')
            .filter(Boolean)
            .map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600"
              >
                <Tag className="mr-0.5 h-3 w-3" />
                {tag}
              </span>
            ))}
        </div>
      </div>

      {/* Toggle Switch */}
      <div className="flex flex-shrink-0 items-center gap-2">
        <button
          onClick={() => onToggle(tool)}
          disabled={toggling || !tool.implemented}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
            tool.enabled ? 'bg-blue-600' : 'bg-gray-200'
          }`}
          role="switch"
          aria-checked={tool.enabled}
        >
          {toggling ? (
            <Loader2 className="absolute left-1/2 h-4 w-4 -translate-x-1/2 animate-spin text-white" />
          ) : (
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                tool.enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          )}
        </button>
      </div>
    </div>
  );
}
