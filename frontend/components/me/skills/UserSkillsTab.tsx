'use client';

import { useMemo, useState } from 'react';
import { Sparkles, PlusCircle, Search } from 'lucide-react';
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

/** kebab-case / snake_case → Title Case（用于展示 domain 原始值） */
function formatDomain(raw: string): string {
  return raw
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

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
    if (s.granted) return <StatusBadge tone="success" label={t('me.skills.statusGranted')} />;
    if (s.pending) return <StatusBadge tone="warning" label={t('me.skills.statusPending')} />;
    return <StatusBadge tone="neutral" label={t('me.skills.statusAvailable')} />;
  };

  return (
    <div className="space-y-5">
      {/* 待审批提示 */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
          {t('me.skills.pendingNote', { count: pendingCount })}
        </div>
      )}

      {/* 搜索 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('me.skills.search')}
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* 内容区 */}
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
              <Th className="w-[55%]">{t('me.skills.colSkill')}</Th>
              <Th className="w-[15%]">{t('me.skills.colStatus')}</Th>
              <Th className="w-[15%]">{t('me.skills.colExpires')}</Th>
              <Th className="w-[15%]" aria-label="actions" />
            </Tr>
          </THead>
          <TBody>
            {filtered.map((s) => (
              <Tr key={s.id}>
                {/* 技能名 + 描述（截断）+ domain chip */}
                <Td>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {s.name}
                        </span>
                        {s.domain && (
                          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500 leading-none shrink-0">
                            {formatDomain(s.domain)}
                          </span>
                        )}
                      </div>
                      {s.description && (
                        <p
                          className="mt-0.5 text-xs text-gray-400 overflow-hidden line-clamp-1 max-w-[40ch]"
                          title={s.description}
                        >
                          {s.description}
                        </p>
                      )}
                    </div>
                  </div>
                </Td>

                {/* 状态 */}
                <Td>{renderStatus(s)}</Td>

                {/* 到期 */}
                <Td className="text-sm text-gray-500">
                  {s.granted
                    ? s.grantExpiresAt
                      ? formatDateSafe(s.grantExpiresAt, 'date')
                      : <span className="text-gray-400">—</span>
                    : <span className="text-gray-300">—</span>}
                </Td>

                {/* 操作 */}
                <Td>
                  {!s.granted && !s.pending && (
                    <button
                      onClick={() => { setTarget(s); setReason(''); }}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                    >
                      <PlusCircle className="h-3.5 w-3.5" />
                      {t('me.skills.requestThis')}
                    </button>
                  )}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}

      {/* 申请授权 Modal */}
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
