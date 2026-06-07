'use client';

import { useMemo } from 'react';
import { useTranslation } from '@/lib/i18n';
import { StatusBadge } from '@/components/ui/badges';
import { formatDateSafe } from '@/lib/utils/date';
import { useUserSkills } from '@/hooks/features/useUserSkills';
import {
  TeamResourceSection,
  type TeamResourceCard,
} from './TeamResourceSection';

/** kebab-case / snake_case → Title Case（分组标题展示用） */
function formatDomain(raw: string): string {
  return raw.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * 团队技能 —— 接真实后端（/user/skills）的技能库，按 domain 分组的卡片呈现。
 * 状态徽章语义同原 UserSkillsTab（已授权 / 待审 / 可申请）。
 */
export function TeamSkillsSection() {
  const { t } = useTranslation();
  const { skills, loading, error, refresh } = useUserSkills();

  const cards: TeamResourceCard[] = useMemo(
    () =>
      skills.map((s) => ({
        id: s.id,
        name: s.name,
        subtitle: s.description,
        category: formatDomain(s.domain || 'other'),
        meta: (
          <StatusBadge
            tone={s.granted ? 'success' : s.pending ? 'warning' : 'neutral'}
            label={
              s.granted
                ? t('me.skills.statusGranted')
                : s.pending
                  ? t('me.skills.statusPending')
                  : t('me.skills.statusAvailable')
            }
          />
        ),
        usage:
          s.granted && s.grantExpiresAt
            ? `到期 ${formatDateSafe(s.grantExpiresAt, 'date')}`
            : undefined,
      })),
    [skills, t]
  );

  return (
    <TeamResourceSection
      kind="skill"
      cards={cards}
      loading={loading}
      error={error}
      onRetry={refresh}
      unitLabel="项技能"
      marketLabel="技能市场"
      hint="获取更多技能。"
      emptyTitle="还没有可用技能"
      emptyDesc="去技能市场获取团队可用的技能"
    />
  );
}

export default TeamSkillsSection;
