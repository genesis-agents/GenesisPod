'use client';

import { useState } from 'react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { useTranslation } from '@/lib/i18n';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Save,
  ExternalLink,
  Wallet,
  Eye,
  EyeOff,
  Play,
  Tag,
  Settings,
  Lock,
  Key,
  X,
  Trash2,
} from 'lucide-react';

// External tool categories
const EXTERNAL_CATEGORIES = [
  'external-search',
  'external-extraction',
  'external-youtube',
  'external-tts',
  'external-skills',
  'policy-research',
] as const;

type ExternalCategory = (typeof EXTERNAL_CATEGORIES)[number];

export interface ExternalTool {
  id: string;
  name: string;
  category: string;
  status: 'configured' | 'not_configured' | 'error';
  hasApiKey: boolean;
  noKeyRequired?: boolean;
  secretKey?: string | null;
  url?: string;
  freeQuota?: string;
  pricing?: string;
}

interface ExternalToolsTabProps {
  tools: ExternalTool[];
  onConfigure: (tool: ExternalTool) => void;
  onTest: (tool: ExternalTool) => void;
  onDelete: (tool: ExternalTool) => void;
  testingTool: string | null;
  deletingTool: string | null;
  testResults: Record<string, { success: boolean; message: string }>;
  loading?: boolean;
}

export default function ExternalToolsTab({
  tools,
  onConfigure,
  onTest,
  onDelete,
  testingTool,
  deletingTool,
  testResults,
  loading = false,
}: ExternalToolsTabProps) {
  const { t } = useTranslation();

  // Filter only external tools
  const externalTools = tools.filter((tool) =>
    EXTERNAL_CATEGORIES.includes(tool.category as ExternalCategory)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  if (externalTools.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <Settings className="mx-auto h-12 w-12 text-gray-300" />
        <p className="mt-2">{t('admin.tools.noToolsFound')}</p>
      </div>
    );
  }

  // Group tools by category
  const groupedTools = externalTools.reduce(
    (acc, tool) => {
      const category = tool.category;
      if (!acc[category]) acc[category] = [];
      acc[category].push(tool);
      return acc;
    },
    {} as Record<string, ExternalTool[]>
  );

  return (
    <div className="space-y-6">
      {EXTERNAL_CATEGORIES.map((category) => {
        const categoryTools = groupedTools[category];
        if (!categoryTools || categoryTools.length === 0) return null;

        return (
          <div key={category}>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
              <span className="rounded-lg bg-blue-50 px-2 py-1 text-blue-700">
                {t(
                  `admin.tools.categories.${category.replace('external-', '')}`
                )}
              </span>
              <span className="text-xs text-gray-400">
                ({categoryTools.filter((t) => t.status === 'configured').length}
                /{categoryTools.length})
              </span>
            </h3>
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              {categoryTools.map((tool) => (
                <ExternalToolRow
                  key={tool.id}
                  tool={tool}
                  onConfigure={onConfigure}
                  onTest={onTest}
                  onDelete={onDelete}
                  testing={testingTool === tool.id}
                  deleting={deletingTool === tool.id}
                  testResult={testResults[tool.id]}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ExternalToolRow({
  tool,
  onConfigure,
  onTest,
  onDelete,
  testing,
  deleting,
  testResult,
}: {
  tool: ExternalTool;
  onConfigure: (tool: ExternalTool) => void;
  onTest: (tool: ExternalTool) => void;
  onDelete: (tool: ExternalTool) => void;
  testing: boolean;
  deleting: boolean;
  testResult?: { success: boolean; message: string };
}) {
  const { t } = useTranslation();

  return (
    <div className="group flex items-center gap-4 border-b border-gray-100 px-4 py-4 transition-colors last:border-b-0 hover:bg-gray-50">
      {/* Status Indicator */}
      <div className="flex-shrink-0">
        {tool.noKeyRequired ? (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
            <CheckCircle className="h-5 w-5 text-green-600" />
          </div>
        ) : tool.status === 'configured' ? (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
            <CheckCircle className="h-5 w-5 text-green-600" />
          </div>
        ) : tool.status === 'error' ? (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
            <AlertTriangle className="h-5 w-5 text-red-600" />
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
          <h3 className="font-medium text-gray-900">{tool.name}</h3>
          {tool.noKeyRequired && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              {t('admin.tools.free')}
            </span>
          )}
          {tool.secretKey && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
              <Lock className="mr-1 inline h-3 w-3" />
              Secret
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-sm text-gray-500">
          {t(`admin.tools.providers.${tool.id}.description`)}
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

      {/* Status & Quota */}
      <div className="hidden flex-shrink-0 flex-col items-end gap-1 sm:flex">
        {tool.freeQuota && (
          <span className="text-xs text-gray-400">{tool.freeQuota}</span>
        )}
        {testResult && (
          <span
            className={`text-xs ${testResult.success ? 'text-green-600' : 'text-red-600'}`}
          >
            {testResult.message}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-shrink-0 items-center gap-2">
        {!tool.noKeyRequired && (
          <button
            onClick={() => onTest(tool)}
            disabled={testing || !tool.hasApiKey}
            className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">{t('admin.tools.test')}</span>
          </button>
        )}
        <button
          onClick={() => onConfigure(tool)}
          className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Settings className="h-4 w-4" />
          <span className="hidden sm:inline">{t('admin.tools.configure')}</span>
        </button>
        {tool.url && (
          <a
            href={tool.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-gray-200 p-1.5 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
        {!tool.noKeyRequired && (tool.hasApiKey || tool.secretKey) && (
          <button
            onClick={() => onDelete(tool)}
            disabled={deleting}
            className="rounded-lg border border-gray-200 p-1.5 text-gray-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            title={t('admin.tools.delete')}
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
