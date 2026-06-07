'use client';

import { useMemo, useState } from 'react';
import { PlusCircle } from 'lucide-react';
import { toast } from '@/stores';
import { useTranslation } from '@/lib/i18n';
import { StatusBadge } from '@/components/ui/badges';
import { Modal } from '@/components/ui/dialogs/Modal';
import { Button } from '@/components/ui/primitives/button';
import { Input, Textarea } from '@/components/ui/form';
import { formatDateSafe } from '@/lib/utils/date';
import {
  useUserSkills,
  type UserSkillItem,
} from '@/hooks/features/useUserSkills';
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
 * 卡片带「申请授权」操作（语义同原 UserSkillsTab）。
 */
export function TeamSkillsSection() {
  const { t } = useTranslation();
  const { skills, loading, error, refresh, requestSkillGrant } =
    useUserSkills();
  const [target, setTarget] = useState<UserSkillItem | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submitRequest = async () => {
    if (!target) return;
    setSubmitting(true);
    try {
      const ok = await requestSkillGrant(target.id, reason.trim() || undefined);
      if (ok) {
        toast.success(t('me.skills.requestSuccess'));
        setTarget(null);
        setReason('');
      } else {
        toast.error(t('me.skills.requestError'));
      }
    } finally {
      setSubmitting(false);
    }
  };

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
        actions:
          !s.granted && !s.pending ? (
            <button
              onClick={() => {
                setTarget(s);
                setReason('');
              }}
              className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100"
            >
              <PlusCircle className="h-3 w-3" />
              {t('me.skills.requestThis')}
            </button>
          ) : null,
      })),
    [skills, t]
  );

  return (
    <>
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

      <Modal
        open={target !== null}
        onClose={() => setTarget(null)}
        closeOnOverlayClick={false}
        title={t('me.skills.requestTitle')}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500">{t('me.skills.requestDesc')}</p>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('me.skills.skillIdLabel')}
            </label>
            <Input value={target?.name ?? ''} disabled />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('me.skills.reasonLabel')}
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('me.skills.reasonPlaceholder')}
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setTarget(null)}>
              {t('me.skills.cancel')}
            </Button>
            <Button onClick={() => void submitRequest()} disabled={submitting}>
              {submitting ? t('me.skills.submitting') : t('me.skills.submit')}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export default TeamSkillsSection;
