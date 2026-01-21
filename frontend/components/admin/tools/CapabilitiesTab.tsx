'use client';

import { useMemo } from 'react';
import { useTranslation } from '@/lib/i18n';
import {
  CAPABILITY_DEFINITIONS,
  CATEGORY_CONFIG,
  getIndependentProviderIds,
  type CapabilityDefinition,
  type CapabilityCategory,
  type ProviderDefinition,
} from './capability-mapping';
import UnifiedCapabilityCard from './UnifiedCapabilityCard';
import type { BuiltinTool, ExternalToolStatus, ProviderStatus } from './types';

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

  // 获取独立 Provider ID 列表（如政策研究工具）
  const independentProviderIds = useMemo(() => getIndependentProviderIds(), []);

  // 构建能力数据
  const capabilitiesData = useMemo(() => {
    return CAPABILITY_DEFINITIONS.map((capability) => {
      // 对于 independentProviders，每个 provider 有独立开关
      if (capability.independentProviders) {
        const providerStatuses: ProviderStatus[] = capability.providers.map(
          (provider) => {
            // 独立 provider 使用自己的 ID 查找 builtinTool
            const builtinTool = builtinTools.find((t) => t.id === provider.id);
            const externalStatus = externalToolStatuses.find(
              (e) => e.id === provider.id
            );

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
              isActive: configured,
              // 独立 provider 需要自己的 enabled 状态
              enabled: builtinTool?.enabled ?? false,
            };
          }
        );

        // 对于独立 providers，整体 enabled 取决于任一 provider 是否启用
        const anyEnabled = providerStatuses.some((p) => p.enabled);

        return {
          capability,
          enabled: anyEnabled,
          providerStatuses,
        };
      }

      // 普通能力：使用能力 ID 查找 builtinTool
      const builtinTool = builtinTools.find((t) => t.id === capability.id);
      const enabled = builtinTool?.enabled ?? false;

      // 查找每个 provider 的状态
      const providerStatuses: ProviderStatus[] = capability.providers.map(
        (provider) => {
          const externalStatus = externalToolStatuses.find(
            (e) => e.id === provider.id
          );

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
            isActive: configured && enabled,
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

  // 按类别分组并排序
  const groupedCapabilities = useMemo(() => {
    const groups = new Map<CapabilityCategory, typeof capabilitiesData>();

    capabilitiesData.forEach((item) => {
      const category = item.capability.category;
      const list = groups.get(category) || [];
      list.push(item);
      groups.set(category, list);
    });

    // 按 order 排序
    const sortedCategories = Array.from(groups.keys()).sort(
      (a, b) => CATEGORY_CONFIG[a].order - CATEGORY_CONFIG[b].order
    );

    return sortedCategories.map((category) => ({
      category,
      items: groups.get(category)!,
    }));
  }, [capabilitiesData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {groupedCapabilities.map(({ category, items }) => {
        if (items.length === 0) return null;

        const categoryLabel = t(CATEGORY_CONFIG[category].labelKey);

        return (
          <div key={category}>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
              {categoryLabel}
            </h3>
            <div className="space-y-4">
              {items.map(({ capability, enabled, providerStatuses }) => (
                <UnifiedCapabilityCard
                  key={capability.id}
                  capability={capability}
                  enabled={enabled}
                  providerStatuses={providerStatuses}
                  onToggleCapability={(newEnabled) => {
                    // UnifiedCapabilityCard 内部会处理 independentProviders 的批量切换
                    onToggleCapability(capability.id, newEnabled);
                  }}
                  onToggleProvider={
                    capability.independentProviders
                      ? (providerId, newEnabled) => {
                          onToggleCapability(providerId, newEnabled);
                        }
                      : undefined
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
    </div>
  );
}

export default CapabilitiesTab;
