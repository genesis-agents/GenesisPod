'use client';

import { useMemo } from 'react';
import { useTranslation } from '@/lib/i18n';
import {
  CAPABILITY_DEFINITIONS,
  STANDALONE_TOOLS,
  type CapabilityDefinition,
  type ProviderDefinition,
} from './capability-mapping';
import UnifiedCapabilityCard, {
  type ProviderStatus,
} from './UnifiedCapabilityCard';
import {
  Landmark,
  Scale,
  Building2,
  CheckCircle,
  ExternalLink,
  Settings,
  Lock,
} from 'lucide-react';

// Icon mapping for standalone tools
const STANDALONE_ICON_MAP: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  Landmark,
  Scale,
  Building2,
};

export interface BuiltinTool {
  id: string;
  name: string;
  displayName?: string;
  category: string;
  enabled: boolean;
  implemented: boolean;
  description?: string;
}

export interface ExternalToolStatus {
  id: string;
  hasApiKey: boolean;
  status: 'configured' | 'not_configured' | 'error';
  secretKey?: string | null;
}

interface CapabilitiesTabProps {
  builtinTools: BuiltinTool[];
  externalToolStatuses: ExternalToolStatus[];
  onToggleCapability: (toolId: string, enabled: boolean) => void;
  onConfigureProvider: (
    provider: ProviderDefinition,
    toolCategory: string
  ) => void;
  onTestProvider?: (providerId: string, category: string) => void;
  testingProvider?: string | null;
  testResults?: Record<string, { success: boolean; message: string }>;
  loading?: boolean;
}

export function CapabilitiesTab({
  builtinTools,
  externalToolStatuses,
  onToggleCapability,
  onConfigureProvider,
  onTestProvider,
  testingProvider,
  testResults = {},
  loading,
}: CapabilitiesTabProps) {
  const { t } = useTranslation();

  // 构建能力数据
  const capabilitiesData = useMemo(() => {
    return CAPABILITY_DEFINITIONS.map((capability) => {
      // 查找内建工具状态
      const builtinTool = builtinTools.find((t) => t.id === capability.id);
      const enabled = builtinTool?.enabled ?? false;

      // 查找每个 provider 的状态
      const providerStatuses: ProviderStatus[] = capability.providers.map(
        (provider) => {
          const externalStatus = externalToolStatuses.find(
            (e) => e.id === provider.id
          );

          // 检查是否配置了（有 API key 或不需要 key）
          const configured =
            provider.noKeyRequired ||
            externalStatus?.status === 'configured' ||
            externalStatus?.hasApiKey ||
            !!externalStatus?.secretKey;

          return {
            id: provider.id,
            configured,
            hasApiKey:
              externalStatus?.hasApiKey || provider.noKeyRequired || false,
            secretKey: externalStatus?.secretKey,
            isActive: configured && enabled, // 简化：配置了且能力启用就是 active
          };
        }
      );

      return {
        capability,
        enabled,
        providerStatuses,
      };
    });
  }, [builtinTools, externalToolStatuses]);

  // 独立工具数据
  const standaloneToolsData = useMemo(() => {
    return STANDALONE_TOOLS.map((tool) => {
      const builtinTool = builtinTools.find((t) => t.id === tool.id);
      const externalStatus = externalToolStatuses.find((e) => e.id === tool.id);

      return {
        ...tool,
        enabled: builtinTool?.enabled ?? false,
        configured:
          tool.noKeyRequired ||
          externalStatus?.status === 'configured' ||
          !!externalStatus?.secretKey,
        secretKey: externalStatus?.secretKey,
      };
    });
  }, [builtinTools, externalToolStatuses]);

  // 按类别分组能力
  const groupedCapabilities = useMemo(() => {
    const groups: Record<string, typeof capabilitiesData> = {
      search: [],
      extraction: [],
      generation: [],
      analysis: [],
      other: [],
    };

    capabilitiesData.forEach((item) => {
      const category = item.capability.category;
      if (groups[category]) {
        groups[category].push(item);
      } else {
        groups.other.push(item);
      }
    });

    return groups;
  }, [capabilitiesData]);

  const categoryLabels: Record<string, string> = {
    search: t('admin.tools.categories.search'),
    extraction: t('admin.tools.categories.extraction'),
    generation: t('admin.tools.categories.generation'),
    analysis: t('admin.tools.categories.analysis'),
    other: t('admin.tools.categories.other'),
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Capabilities by Category */}
      {Object.entries(groupedCapabilities).map(([category, items]) => {
        if (items.length === 0) return null;

        return (
          <div key={category}>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
              {categoryLabels[category] || category}
            </h3>
            <div className="space-y-4">
              {items.map(({ capability, enabled, providerStatuses }) => (
                <UnifiedCapabilityCard
                  key={capability.id}
                  capability={capability}
                  enabled={enabled}
                  providerStatuses={providerStatuses}
                  onToggleCapability={(newEnabled) =>
                    onToggleCapability(capability.id, newEnabled)
                  }
                  onConfigureProvider={(provider) =>
                    onConfigureProvider(provider, capability.category)
                  }
                  onTestProvider={
                    onTestProvider
                      ? (providerId) =>
                          onTestProvider(providerId, capability.category)
                      : undefined
                  }
                  testingProvider={testingProvider}
                  testResults={testResults}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Standalone Policy Research Tools */}
      {standaloneToolsData.length > 0 && (
        <div>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
            {t('admin.tools.categories.policyResearch')}
          </h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {standaloneToolsData.map((tool) => {
              const Icon = STANDALONE_ICON_MAP[tool.icon] || Landmark;

              return (
                <div
                  key={tool.id}
                  className={`rounded-xl border p-4 transition-all ${
                    tool.enabled && tool.configured
                      ? 'border-green-200 bg-white shadow-sm'
                      : tool.enabled && !tool.configured
                        ? 'border-yellow-200 bg-yellow-50/30'
                        : 'border-gray-200 bg-gray-50/50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                          tool.enabled && tool.configured
                            ? 'bg-green-100 text-green-600'
                            : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-gray-900">
                            {tool.displayName}
                          </h4>
                          {tool.noKeyRequired && (
                            <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700">
                              Free
                            </span>
                          )}
                          {tool.configured && !tool.noKeyRequired && (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          )}
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          {tool.description}
                        </p>
                        {tool.freeQuota && (
                          <p className="mt-1 text-xs text-green-600">
                            {tool.freeQuota}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Toggle */}
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={tool.enabled}
                        onChange={(e) =>
                          onToggleCapability(tool.id, e.target.checked)
                        }
                        className="peer sr-only"
                      />
                      <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-2 peer-focus:ring-blue-300"></div>
                    </label>
                  </div>

                  {/* Actions */}
                  <div className="mt-3 flex items-center gap-2">
                    {!tool.noKeyRequired && (
                      <button
                        onClick={() =>
                          onConfigureProvider(
                            {
                              id: tool.id,
                              name: tool.name,
                              description: tool.description,
                              url: tool.url,
                              secretKeyName: tool.secretKeyName,
                            },
                            'policy-research'
                          )
                        }
                        className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                      >
                        <Settings className="h-3 w-3" />
                        Configure
                      </button>
                    )}
                    <a
                      href={tool.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Docs
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

export default CapabilitiesTab;
