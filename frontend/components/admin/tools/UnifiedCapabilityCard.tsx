'use client';

import { useState } from 'react';
import {
  Search,
  FileText,
  Volume2,
  Youtube,
  Landmark,
  Scale,
  Building2,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Settings,
  Loader2,
  Lock,
  GraduationCap,
  Newspaper,
  Github,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import type {
  CapabilityDefinition,
  ProviderDefinition,
} from './capability-mapping';
import type { ProviderStatus } from './types';

// Icon mapping
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Search,
  FileText,
  Volume2,
  Youtube,
  Landmark,
  Scale,
  Building2,
  GraduationCap,
  Newspaper,
  Github,
};

interface UnifiedCapabilityCardProps {
  capability: CapabilityDefinition;
  enabled: boolean;
  providerStatuses: ProviderStatus[];
  onToggleCapability: (enabled: boolean) => void;
  onToggleProvider?: (providerId: string, enabled: boolean) => void;
  onConfigureProvider: (provider: ProviderDefinition) => void;
  onTestProvider?: (providerId: string) => void;
  testingProvider?: string | null;
  testResults?: Record<string, { success: boolean; message: string }>;
}

export function UnifiedCapabilityCard({
  capability,
  enabled,
  providerStatuses,
  onToggleCapability,
  onToggleProvider,
  onConfigureProvider,
  onTestProvider,
  testingProvider,
  testResults = {},
}: UnifiedCapabilityCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const Icon = ICON_MAP[capability.icon] || Search;
  const isIndependent = capability.independentProviders;

  // 计算配置状态
  const configuredProviders = providerStatuses.filter((p) => p.configured);
  const hasAnyProvider = configuredProviders.length > 0;
  const activeProvider = providerStatuses.find((p) => p.isActive);

  // 对于独立 providers，计算启用数量
  const enabledCount = isIndependent
    ? providerStatuses.filter((p) => p.enabled).length
    : 0;
  const totalCount = capability.providers.length;

  // 处理主开关切换
  const handleMainToggle = (newEnabled: boolean) => {
    if (isIndependent && onToggleProvider) {
      // 批量切换所有 provider
      capability.providers.forEach((provider) => {
        onToggleProvider(provider.id, newEnabled);
      });
    } else {
      onToggleCapability(newEnabled);
    }
  };

  return (
    <div
      className={`overflow-hidden rounded-xl border transition-all ${
        enabled && hasAnyProvider
          ? 'border-green-200 bg-white shadow-sm'
          : enabled && !hasAnyProvider
            ? 'border-yellow-200 bg-yellow-50/30'
            : 'border-gray-200 bg-gray-50/50'
      }`}
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            {/* Status Icon */}
            <div
              className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-lg ${
                enabled && hasAnyProvider
                  ? 'bg-green-100 text-green-600'
                  : enabled && !hasAnyProvider
                    ? 'bg-yellow-100 text-yellow-600'
                    : 'bg-gray-100 text-gray-400'
              }`}
            >
              <Icon className="h-5 w-5" />
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-gray-900">
                  {capability.displayName}
                </h3>
                {/* Status Badge */}
                {enabled && hasAnyProvider && !isIndependent && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    <CheckCircle className="h-3 w-3" />
                    {t('admin.tools.capability.ready')}
                  </span>
                )}
                {enabled && !hasAnyProvider && !isIndependent && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
                    <AlertCircle className="h-3 w-3" />
                    {t('admin.tools.capability.needsProvider')}
                  </span>
                )}
                {/* 独立 providers 显示启用数量 */}
                {isIndependent && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      enabledCount > 0
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {enabledCount}/{totalCount}{' '}
                    {t('admin.tools.capability.enabled')}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-gray-500">
                {capability.description}
              </p>

              {/* Active Provider Info */}
              {enabled &&
                hasAnyProvider &&
                activeProvider &&
                !isIndependent && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                    <span>{t('admin.tools.capability.using')}:</span>
                    <span className="font-medium text-gray-700">
                      {
                        capability.providers.find(
                          (p) => p.id === activeProvider.id
                        )?.name
                      }
                    </span>
                  </div>
                )}
            </div>
          </div>

          {/* Toggle + Expand */}
          <div className="flex items-center gap-3">
            {/* Toggle Switch */}
            <label
              className="relative inline-flex cursor-pointer items-center"
              title={
                isIndependent
                  ? t('admin.tools.capability.toggleAll')
                  : undefined
              }
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={isIndependent ? enabledCount === totalCount : enabled}
                onChange={(e) => {
                  e.stopPropagation();
                  handleMainToggle(e.target.checked);
                }}
                className="peer sr-only"
              />
              <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-2 peer-focus:ring-blue-300"></div>
            </label>

            {/* Expand Button */}
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
            >
              <span>
                {configuredProviders.length}/{capability.providers.length}{' '}
                {t('admin.tools.capability.providers')}
              </span>
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Expanded Providers List */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3">
          <div className="space-y-2">
            {capability.providers.map((provider) => {
              const status = providerStatuses.find(
                (p) => p.id === provider.id
              ) || {
                id: provider.id,
                configured: provider.noKeyRequired || false,
                hasApiKey: provider.noKeyRequired || false,
              };

              const testResult = testResults[provider.id];
              const isTesting = testingProvider === provider.id;
              const providerEnabled = isIndependent
                ? (status.enabled ?? false)
                : enabled;

              return (
                <div
                  key={provider.id}
                  className={`flex items-center justify-between rounded-lg border bg-white p-3 ${
                    status.configured && providerEnabled
                      ? 'border-green-200'
                      : status.configured
                        ? 'border-gray-200'
                        : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Provider Status Icon */}
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full ${
                        status.configured && providerEnabled
                          ? 'bg-green-100 text-green-600'
                          : status.configured
                            ? 'bg-gray-100 text-gray-400'
                            : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {status.configured ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        <Lock className="h-4 w-4" />
                      )}
                    </div>

                    {/* Provider Info */}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">
                          {provider.name}
                        </span>
                        {provider.noKeyRequired && (
                          <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700">
                            {t('admin.tools.capability.free')}
                          </span>
                        )}
                        {status.isActive && (
                          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                            {t('admin.tools.capability.active')}
                          </span>
                        )}
                        {status.secretKey && (
                          <span className="inline-flex items-center gap-1 rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700">
                            <Lock className="h-3 w-3" />
                            Secret
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        {provider.description}
                      </p>
                      {provider.freeQuota && (
                        <p className="mt-0.5 text-xs text-green-600">
                          {t('admin.tools.capability.freeQuota')}:{' '}
                          {provider.freeQuota}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Provider Actions - 统一布局: Toggle | Test | Configure | Link */}
                  <div className="flex items-center gap-2">
                    {/* Independent Provider Toggle - 固定宽度确保对齐 */}
                    <div className="w-12 flex-shrink-0">
                      {isIndependent && onToggleProvider && (
                        <label
                          className="relative inline-flex cursor-pointer items-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={providerEnabled}
                            onChange={(e) => {
                              e.stopPropagation();
                              onToggleProvider(provider.id, e.target.checked);
                            }}
                            className="peer sr-only"
                          />
                          <div className="peer h-5 w-9 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-2 peer-focus:ring-blue-300"></div>
                        </label>
                      )}
                    </div>

                    {/* Test Button - 固定宽度确保对齐 */}
                    <div className="w-16 flex-shrink-0">
                      {status.configured && onTestProvider && (
                        <button
                          onClick={() => onTestProvider(provider.id)}
                          disabled={isTesting}
                          className="flex w-full items-center justify-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                        >
                          {isTesting ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              {testResult && (
                                <span
                                  className={
                                    testResult.success
                                      ? 'text-green-600'
                                      : 'text-red-600'
                                  }
                                >
                                  {testResult.success ? '✓' : '✗'}
                                </span>
                              )}
                              {t('admin.tools.capability.test')}
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {/* Configure Button - 固定宽度确保对齐 */}
                    <div className="w-24 flex-shrink-0">
                      {!provider.noKeyRequired && (
                        <button
                          onClick={() => onConfigureProvider(provider)}
                          className="flex w-full items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                        >
                          <Settings className="h-3 w-3" />
                          {t('admin.tools.capability.configure')}
                        </button>
                      )}
                    </div>

                    {/* External Link */}
                    <a
                      href={provider.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default UnifiedCapabilityCard;
