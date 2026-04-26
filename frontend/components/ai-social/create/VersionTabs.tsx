'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Loader2, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils/common';
import {
  SocialPlatformType,
  SocialContentVersion,
  getContentVersions,
  generateVersion,
  generateAllVersions,
} from '@/services/ai-social/api';
import { ClientDate } from '@/components/common/ClientDate';

interface PlatformConfig {
  type: SocialPlatformType;
  label: string;
  limits: {
    title: number;
    digest: number;
    content: number;
  };
}

const PLATFORMS: PlatformConfig[] = [
  {
    type: 'WECHAT_MP',
    label: '微信公众号',
    limits: { title: 30, digest: 120, content: 0 },
  },
  {
    type: 'XIAOHONGSHU',
    label: '小红书',
    limits: { title: 20, digest: 0, content: 1000 },
  },
];

interface VersionTabsProps {
  contentId: string;
  onVersionSelect: (
    version: SocialContentVersion | null,
    platform: SocialPlatformType
  ) => void;
  selectedPlatform: SocialPlatformType;
}

export function VersionTabs({
  contentId,
  onVersionSelect,
  selectedPlatform,
}: VersionTabsProps) {
  const [versions, setVersions] = useState<SocialContentVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState<
    SocialPlatformType | 'all' | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Set mounted state to avoid hydration mismatch with date formatting
  useEffect(() => {
    setMounted(true);
  }, []);

  // Load versions
  const loadVersions = useCallback(async () => {
    if (!contentId) return;

    setLoading(true);
    setError(null);
    try {
      const result = await getContentVersions(contentId);
      setVersions(result.versions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载版本失败');
    } finally {
      setLoading(false);
    }
  }, [contentId]);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  // Generate version for a platform
  const handleGenerateVersion = async (platformType: SocialPlatformType) => {
    setGenerating(platformType);
    setError(null);
    try {
      const result = await generateVersion(contentId, platformType);
      setVersions((prev) => {
        const filtered = prev.filter((v) => v.platformType !== platformType);
        return [...filtered, result.version];
      });
      // Auto-select the generated version if it's the current platform
      if (platformType === selectedPlatform) {
        onVersionSelect(result.version, platformType);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成版本失败');
    } finally {
      setGenerating(null);
    }
  };

  // Generate all versions
  const handleGenerateAll = async () => {
    setGenerating('all');
    setError(null);
    try {
      const result = await generateAllVersions(contentId);
      setVersions(result.versions || []);
      // Select the version for current platform
      const currentVersion = result.versions?.find(
        (v) => v.platformType === selectedPlatform
      );
      if (currentVersion) {
        onVersionSelect(currentVersion, selectedPlatform);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成版本失败');
    } finally {
      setGenerating(null);
    }
  };

  // Handle platform tab click
  const handlePlatformClick = (platform: PlatformConfig) => {
    const version = versions.find((v) => v.platformType === platform.type);
    onVersionSelect(version || null, platform.type);
  };

  // Get version for a platform
  const getVersionForPlatform = (platformType: SocialPlatformType) => {
    return versions.find((v) => v.platformType === platformType);
  };

  // Check if version is within limits
  const isWithinLimits = (
    version: SocialContentVersion,
    platform: PlatformConfig
  ) => {
    if (
      platform.limits.title > 0 &&
      version.title.length > platform.limits.title
    ) {
      return false;
    }
    if (
      platform.limits.content > 0 &&
      version.content.length > platform.limits.content
    ) {
      return false;
    }
    if (
      platform.limits.digest > 0 &&
      version.digest &&
      version.digest.length > platform.limits.digest
    ) {
      return false;
    }
    return true;
  };

  return (
    <div className="space-y-3">
      {/* Platform Tabs */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {PLATFORMS.map((platform) => {
            const version = getVersionForPlatform(platform.type);
            const isSelected = selectedPlatform === platform.type;
            const hasVersion = !!version;
            const withinLimits = version
              ? isWithinLimits(version, platform)
              : true;

            return (
              <button
                key={platform.type}
                onClick={() => handlePlatformClick(platform)}
                className={cn(
                  'relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  isSelected
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                )}
              >
                {platform.label}
                {hasVersion && (
                  <span
                    className={cn(
                      'flex h-4 w-4 items-center justify-center rounded-full text-[10px]',
                      withinLimits
                        ? 'bg-green-100 text-green-600'
                        : 'bg-amber-100 text-amber-600'
                    )}
                  >
                    {withinLimits ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <AlertCircle className="h-3 w-3" />
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Generate buttons */}
        <div className="ml-auto flex gap-2">
          {(() => {
            const currentPlatform = PLATFORMS.find(
              (p) => p.type === selectedPlatform
            );
            const currentVersion = getVersionForPlatform(selectedPlatform);

            return (
              <button
                onClick={() => handleGenerateVersion(selectedPlatform)}
                disabled={generating !== null}
                className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {generating === selectedPlatform ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {currentVersion ? '重新生成' : '生成'} {currentPlatform?.label}{' '}
                版本
              </button>
            );
          })()}

          <button
            onClick={handleGenerateAll}
            disabled={generating !== null}
            className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {generating === 'all' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            生成所有版本
          </button>
        </div>
      </div>

      {/* Version info */}
      {(() => {
        const currentPlatform = PLATFORMS.find(
          (p) => p.type === selectedPlatform
        );
        const version = getVersionForPlatform(selectedPlatform);

        if (!currentPlatform) return null;

        return (
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>
              标题限制:{' '}
              {currentPlatform.limits.title > 0
                ? `${currentPlatform.limits.title}字`
                : '无'}
              {version && (
                <span
                  className={cn(
                    'ml-1',
                    version.title.length > currentPlatform.limits.title &&
                      currentPlatform.limits.title > 0
                      ? 'text-red-500'
                      : 'text-green-500'
                  )}
                >
                  ({version.title.length}/{currentPlatform.limits.title || '∞'})
                </span>
              )}
            </span>
            {currentPlatform.limits.digest > 0 && (
              <span>
                摘要限制: {currentPlatform.limits.digest}字
                {version?.digest && (
                  <span
                    className={cn(
                      'ml-1',
                      version.digest.length > currentPlatform.limits.digest
                        ? 'text-red-500'
                        : 'text-green-500'
                    )}
                  >
                    ({version.digest.length}/{currentPlatform.limits.digest})
                  </span>
                )}
              </span>
            )}
            {currentPlatform.limits.content > 0 && (
              <span>
                正文限制: {currentPlatform.limits.content}字
                {version && (
                  <span
                    className={cn(
                      'ml-1',
                      version.content.length > currentPlatform.limits.content
                        ? 'text-red-500'
                        : 'text-green-500'
                    )}
                  >
                    ({version.content.length}/{currentPlatform.limits.content})
                  </span>
                )}
              </span>
            )}
            {version && (
              <span className="ml-auto text-gray-400">
                {version.generatedBy === 'AI' ? 'AI 生成' : '手动编辑'} ·{' '}
                <ClientDate
                  date={version.updatedAt}
                  format="datetime"
                  dateOptions={{
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  }}
                />
              </span>
            )}
          </div>
        );
      })()}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载版本中...
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-500">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
    </div>
  );
}

export { PLATFORMS };
export type { PlatformConfig };
