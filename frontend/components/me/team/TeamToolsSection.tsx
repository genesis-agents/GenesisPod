'use client';

import { useMemo } from 'react';
import { useTranslation } from '@/lib/i18n';
import { StatusBadge } from '@/components/ui/badges';
import { useUserTools } from '@/hooks/features/useUserTools';
import {
  TeamResourceSection,
  type TeamResourceCard,
} from './TeamResourceSection';

/**
 * 团队工具 —— 接真实后端（/user/tools）的工具库，按分类分组的卡片呈现。
 * 状态徽章语义同原 UserToolsTab（已配置 / 已授权 / 平台可用 / 需配置）。
 */
export function TeamToolsSection() {
  const { t } = useTranslation();
  const { tools, loading, error, refresh } = useUserTools();

  const cards: TeamResourceCard[] = useMemo(
    () =>
      tools.map((tl) => ({
        id: tl.toolId,
        name: tl.name,
        category: tl.category,
        meta: (
          <StatusBadge
            tone={tl.source === 'none' ? 'warning' : 'success'}
            label={
              tl.source === 'user'
                ? t('me.tools.status.configured')
                : tl.source === 'granted'
                  ? t('me.tools.status.grantedSystem')
                  : tl.source === 'platform'
                    ? t('me.tools.status.systemAvailable')
                    : t('me.tools.status.notConfigured')
            }
          />
        ),
        usage: (
          <code className="font-mono text-[11px] text-gray-400">
            {tl.toolId}
          </code>
        ),
      })),
    [tools, t]
  );

  return (
    <TeamResourceSection
      kind="tool"
      cards={cards}
      loading={loading}
      error={error}
      onRetry={refresh}
      unitLabel="个工具"
      marketLabel="工具市场"
      hint="获取更多工具。"
      emptyTitle="还没有可用工具"
      emptyDesc="去工具市场获取团队可用的工具"
    />
  );
}

export default TeamToolsSection;
