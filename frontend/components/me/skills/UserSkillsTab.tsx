'use client';

import { useMemo, useState } from 'react';
import { Sparkles, Plus } from 'lucide-react';
import { useApiGet } from '@/hooks/core';
import { apiClient } from '@/lib/api/client';
import { toast } from '@/stores';
import { useTranslation } from '@/lib/i18n';
import { Table, THead, TBody, Tr, Th, Td } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/badges';
import { EmptyState } from '@/components/ui/states/EmptyState';
import { LoadingState } from '@/components/ui/states/LoadingState';
import { ErrorState } from '@/components/ui/states/ErrorState';
import { Modal } from '@/components/ui/dialogs/Modal';
import { Button } from '@/components/ui/primitives/button';
import { Input, Textarea } from '@/components/ui/form';
import { formatDateSafe } from '@/lib/utils/date';

interface AuthGrant {
  id: string;
  type: string;
  targetId: string;
  expiresAt: string | null;
  createdAt: string;
}

interface AuthRequest {
  id: string;
  type: string;
  targetId: string;
  status: string;
  createdAt: string;
}

/**
 * 我的技能（/me/skills）—— 镜像 admin 本地技能的用户视角。
 * 当前后端用户侧技能能力 = 授权工单（SKILL_GRANT）：展示已授权技能 + 申请授权。
 */
export function UserSkillsTab() {
  const { t } = useTranslation();
  const {
    data: grantsData,
    loading: grantsLoading,
    error: grantsError,
    execute: refreshGrants,
  } = useApiGet<{ items: AuthGrant[] }>('/user/authorization/grants', {
    immediate: true,
  });
  const { data: reqData, execute: refreshReqs } = useApiGet<{
    items: AuthRequest[];
  }>('/user/authorization/requests', { immediate: true });

  const [requestOpen, setRequestOpen] = useState(false);
  const [skillId, setSkillId] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const skillGrants = useMemo(
    () => (grantsData?.items ?? []).filter((g) => g.type === 'SKILL_GRANT'),
    [grantsData]
  );
  const pendingSkillRequests = useMemo(
    () =>
      (reqData?.items ?? []).filter(
        (r) => r.type === 'SKILL_GRANT' && r.status === 'PENDING'
      ),
    [reqData]
  );

  const submitRequest = async () => {
    if (!skillId.trim()) {
      toast.error(t('me.skills.skillIdRequired'));
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post('/user/authorization/requests', {
        type: 'SKILL_GRANT',
        targetId: skillId.trim(),
        reason: reason.trim() || undefined,
      });
      toast.success(t('me.skills.requestSuccess'));
      setRequestOpen(false);
      setSkillId('');
      setReason('');
      void refreshReqs();
    } catch {
      toast.error(t('me.skills.requestError'));
    } finally {
      setSubmitting(false);
    }
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
        <Button onClick={() => setRequestOpen(true)} className="shrink-0">
          <Plus className="mr-1 h-4 w-4" />
          {t('me.skills.requestGrant')}
        </Button>
      </div>

      {pendingSkillRequests.length > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {t('me.skills.pendingNote', {
            count: pendingSkillRequests.length,
          })}
        </p>
      )}

      {grantsLoading ? (
        <LoadingState />
      ) : grantsError ? (
        <ErrorState error={grantsError} onRetry={() => void refreshGrants()} />
      ) : skillGrants.length === 0 ? (
        <EmptyState
          title={t('me.skills.emptyTitle')}
          description={t('me.skills.emptyDesc')}
        />
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>{t('me.skills.colSkill')}</Th>
              <Th>{t('me.skills.colStatus')}</Th>
              <Th>{t('me.skills.colExpires')}</Th>
            </Tr>
          </THead>
          <TBody>
            {skillGrants.map((g) => (
              <Tr key={g.id}>
                <Td>{g.targetId}</Td>
                <Td>
                  <StatusBadge
                    tone="success"
                    label={t('me.skills.statusGranted')}
                  />
                </Td>
                <Td>
                  {g.expiresAt
                    ? formatDateSafe(g.expiresAt, 'date')
                    : t('me.skills.neverExpires')}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}

      <Modal
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        title={t('me.skills.requestTitle')}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500">{t('me.skills.requestDesc')}</p>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('me.skills.skillIdLabel')}
            </label>
            <Input
              value={skillId}
              onChange={(e) => setSkillId(e.target.value)}
              placeholder={t('me.skills.skillIdPlaceholder')}
            />
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
            <Button variant="ghost" onClick={() => setRequestOpen(false)}>
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
