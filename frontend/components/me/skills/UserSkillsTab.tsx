'use client';

import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { toast } from '@/stores';
import { useTranslation } from '@/lib/i18n';
import { useUserSkills, type UserSkillItem } from '@/hooks/features/useUserSkills';
import { Table, THead, TBody, Tr, Th, Td } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/badges';
import { EmptyState } from '@/components/ui/states/EmptyState';
import { LoadingState } from '@/components/ui/states/LoadingState';
import { ErrorState } from '@/components/ui/states/ErrorState';
import { Modal } from '@/components/ui/dialogs/Modal';
import { Button } from '@/components/ui/primitives/button';
import { Input, Textarea } from '@/components/ui/form';
import { formatDateSafe } from '@/lib/utils/date';

/**
 * 我的技能（/me/skills）—— 授权版：展示系统技能目录（来自 SkillRegistry）+
 * 当前用户的授权状态（已授权 / 审批中 / 未授权），逐技能向系统申请授权。
 */
export function UserSkillsTab() {
  const { t } = useTranslation();
  const { skills, loading, error, refresh, requestSkillGrant } = useUserSkills();

  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<UserSkillItem | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
    );
  }, [skills, query]);

  const pendingCount = useMemo(
    () => skills.filter((s) => s.pending).length,
    [skills]
  );

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

  const renderStatus = (s: UserSkillItem) => {
    if (s.granted) {
      return <StatusBadge tone="success" label={t('me.skills.statusGranted')} />;
    }
    if (s.pending) {
      return <StatusBadge tone="warning" label={t('me.skills.statusPending')} />;
    }
    return <StatusBadge tone="neutral" label={t('me.skills.statusAvailable')} />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Sparkles className="h-5 w-5 text-primary" />
            {t('me.skills.title')}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {t('me.skills.description')}
          </p>
        </div>
      </div>

      {pendingCount > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {t('me.skills.pendingNote', { count: pendingCount })}
        </p>
      )}

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('me.skills.search')}
        className="max-w-sm"
      />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refresh()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={t('me.skills.catalogEmptyTitle')}
          description={t('me.skills.catalogEmptyDesc')}
        />
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>{t('me.skills.colSkill')}</Th>
              <Th>{t('me.skills.colDomain')}</Th>
              <Th>{t('me.skills.colStatus')}</Th>
              <Th>{t('me.skills.colExpires')}</Th>
              <Th aria-label="actions" />
            </Tr>
          </THead>
          <TBody>
            {filtered.map((s) => (
              <Tr key={s.id}>
                <Td>
                  <div className="font-medium text-gray-900">{s.name}</div>
                  <div className="text-xs text-gray-500">{s.description}</div>
                </Td>
                <Td>{s.domain}</Td>
                <Td>{renderStatus(s)}</Td>
                <Td>
                  {s.granted
                    ? s.grantExpiresAt
                      ? formatDateSafe(s.grantExpiresAt, 'date')
                      : t('me.skills.neverExpires')
                    : '—'}
                </Td>
                <Td>
                  {!s.granted && !s.pending && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setTarget(s);
                        setReason('');
                      }}
                    >
                      {t('me.skills.requestThis')}
                    </Button>
                  )}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}

      <Modal
        open={target !== null}
        onClose={() => setTarget(null)}
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
    </div>
  );
}

export default UserSkillsTab;
