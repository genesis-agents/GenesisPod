'use client';

import { useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import {
  Plus,
  X,
  Eye,
  EyeOff,
  Circle,
  AlertCircle,
  Clock,
  RefreshCw,
} from 'lucide-react';
import type { KeyHealthStatus } from '@/types/admin';

interface ApiKeyListProps {
  /** 当前密钥列表 */
  keys: string[];
  /** 密钥变更回调 */
  onChange: (keys: string[]) => void;
  /** 密钥健康状态 */
  keyHealth?: KeyHealthStatus[];
  /** 输入框占位符 */
  placeholder?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 刷新健康状态回调 */
  onRefreshHealth?: () => void;
  /** 是否正在刷新 */
  isRefreshing?: boolean;
}

/**
 * 多 API Key 输入列表组件
 *
 * UI 设计:
 * - 每行明确显示 Key 1、Key 2、Key 3 标签
 * - 输入框占据主要空间，方便粘贴完整密钥
 * - 健康状态用颜色圆点 + 文字双重指示
 * - 删除按钮在最右侧
 * - 添加按钮显示下一个序号
 */
export function ApiKeyList({
  keys,
  onChange,
  keyHealth = [],
  placeholder,
  disabled = false,
  onRefreshHealth,
  isRefreshing = false,
}: ApiKeyListProps) {
  const { t } = useTranslation();
  const [showKeys, setShowKeys] = useState<Record<number, boolean>>({});

  // 确保至少有一个输入框
  const displayKeys = keys.length > 0 ? keys : [''];

  const handleKeyChange = (index: number, value: string) => {
    const newKeys = [...displayKeys];
    newKeys[index] = value;
    // 过滤掉尾部的空值，但保留至少一个
    const trimmedKeys = newKeys.filter(
      (k, i) => k.trim() !== '' || i === newKeys.length - 1
    );
    onChange(trimmedKeys.length > 0 ? trimmedKeys : ['']);
  };

  const handleAddKey = () => {
    onChange([...displayKeys, '']);
  };

  const handleRemoveKey = (index: number) => {
    if (displayKeys.length <= 1) return;
    const newKeys = displayKeys.filter((_, i) => i !== index);
    onChange(newKeys);
  };

  const toggleShowKey = (index: number) => {
    setShowKeys((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const getHealthStatus = (index: number): KeyHealthStatus | undefined => {
    // 优先按 index 字段匹配
    const byIndex = keyHealth.find((h) => h.index === index);
    if (byIndex) return byIndex;

    // Fallback: 按数组位置匹配（容错处理，防止后端索引不一致）
    if (index >= 0 && index < keyHealth.length) {
      return keyHealth[index];
    }

    return undefined;
  };

  const renderHealthIndicator = (health?: KeyHealthStatus) => {
    if (!health) {
      // 新添加的 key，还没有健康数据
      return (
        <span className="flex items-center gap-1 text-xs text-gray-400">
          <Circle className="h-3 w-3 fill-gray-300" />
          <span>{t('admin.tools.multiKey.new')}</span>
        </span>
      );
    }

    if (health.isHealthy) {
      return (
        <span className="flex items-center gap-1 text-xs text-green-600">
          <Circle className="h-3 w-3 fill-green-500" />
          <span>{t('admin.tools.multiKey.healthy')}</span>
        </span>
      );
    }

    if (health.cooldownUntil) {
      const cooldownEnd = new Date(health.cooldownUntil);
      const now = new Date();
      const remainingMs = cooldownEnd.getTime() - now.getTime();
      const remainingMin = Math.ceil(remainingMs / 60000);

      return (
        <span
          className="flex items-center gap-1 text-xs text-gray-500"
          title={`${t('admin.tools.multiKey.cooldownUntil')}: ${cooldownEnd.toLocaleTimeString()}`}
        >
          <Clock className="h-3 w-3" />
          <span>
            {remainingMin > 0
              ? `${remainingMin}${t('admin.tools.multiKey.minLeft')}`
              : t('admin.tools.multiKey.cooldown')}
          </span>
        </span>
      );
    }

    return (
      <span
        className="flex items-center gap-1 text-xs text-red-600"
        title={health.lastError}
      >
        <AlertCircle className="h-3 w-3" />
        <span>{health.lastError || t('admin.tools.multiKey.unhealthy')}</span>
      </span>
    );
  };

  return (
    <div className="space-y-3">
      {/* Header with refresh button */}
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">
          {t('admin.tools.multiKey.title')}
          <span className="ml-2 text-xs font-normal text-gray-500">
            ({t('admin.tools.multiKey.rotationHint')})
          </span>
        </label>
        {onRefreshHealth && keyHealth.length > 0 && (
          <button
            type="button"
            onClick={onRefreshHealth}
            disabled={isRefreshing}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`}
            />
            {t('admin.tools.multiKey.refresh')}
          </button>
        )}
      </div>

      {/* Key list */}
      <div className="space-y-2">
        {displayKeys.map((key, index) => {
          const health = getHealthStatus(index);
          const showKey = showKeys[index] || false;

          return (
            <div
              key={index}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-2"
            >
              {/* Key label */}
              <span className="w-14 flex-shrink-0 text-sm font-medium text-gray-600">
                Key {index + 1}
              </span>

              {/* Input */}
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={key}
                  onChange={(e) => handleKeyChange(index, e.target.value)}
                  placeholder={
                    placeholder || t('admin.tools.multiKey.keyPlaceholder')
                  }
                  disabled={disabled}
                  autoComplete="new-password"
                  spellCheck="false"
                  className="w-full rounded-md border-0 bg-gray-50 px-3 py-1.5 pr-8 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <button
                  type="button"
                  onClick={() => toggleShowKey(index)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>

              {/* Health indicator */}
              <div className="w-24 flex-shrink-0">
                {key.trim() !== '' && renderHealthIndicator(health)}
              </div>

              {/* Remove button */}
              <button
                type="button"
                onClick={() => handleRemoveKey(index)}
                disabled={displayKeys.length <= 1 || disabled}
                className="flex-shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
                title={t('admin.tools.multiKey.removeKey')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Add button */}
      <button
        type="button"
        onClick={handleAddKey}
        disabled={disabled}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-2 text-sm text-gray-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        {t('admin.tools.multiKey.addKey')} {displayKeys.length + 1}
      </button>

      {/* Health summary */}
      {keyHealth.length > 0 && (
        <div className="flex items-center gap-4 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <span>
            {t('admin.tools.multiKey.keyCount', { count: keyHealth.length })}
          </span>
          <span className="text-green-600">
            {keyHealth.filter((k) => k.isHealthy).length}{' '}
            {t('admin.tools.multiKey.healthy')}
          </span>
          {keyHealth.filter((k) => !k.isHealthy).length > 0 && (
            <span className="text-red-600">
              {keyHealth.filter((k) => !k.isHealthy).length}{' '}
              {t('admin.tools.multiKey.unhealthy')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default ApiKeyList;
