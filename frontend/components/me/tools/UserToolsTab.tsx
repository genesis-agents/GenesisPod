'use client';

import { useMemo, useState } from 'react';
import {
  FlaskConical,
  Search,
  Wrench,
  KeyRound,
  SendHorizonal,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { apiClient } from '@/lib/api/client';
import { Table, THead, TBody, Tr, Th, Td } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/badges';
import { EmptyState } from '@/components/ui/states/EmptyState';
import { LoadingState } from '@/components/ui/states/LoadingState';
import { ErrorState } from '@/components/ui/states/ErrorState';
import { Modal } from '@/components/ui/dialogs/Modal';
import { Button } from '@/components/ui/primitives/button';
import {
  useUserTools,
  requestToolGrant,
  type UserToolItem,
} from '@/hooks/features/useUserTools';
import { useUserSecrets } from '@/hooks/features/useUserSecrets';

// category string → SecretCategory enum value used in POST /user/secrets
const CATEGORY_MAP: Record<string, string> = {
  'Web Search': 'SEARCH',
  'Content Extraction': 'EXTRACTION',
  YouTube: 'YOUTUBE',
  TTS: 'TTS',
  Finance: 'FINANCE',
  Weather: 'WEATHER',
};

function mapCategory(category: string): string {
  if (CATEGORY_MAP[category]) return CATEGORY_MAP[category];
  if (/academic/i.test(category)) return 'ACADEMIC';
  if (/image/i.test(category)) return 'IMAGE_SEARCH';
  return 'OTHER';
}

// ─── Configure Key Modal ──────────────────────────────────────────────────────

interface ConfigureKeyModalProps {
  tool: UserToolItem;
  userSecrets: Array<{
    id: string;
    name: string;
    displayName: string;
    category: string;
    maskedValue: string;
    source: string;
  }>;
  onClose: () => void;
  onSuccess: () => void;
}

function ConfigureKeyModal({
  tool,
  userSecrets,
  onClose,
  onSuccess,
}: ConfigureKeyModalProps) {
  const { t } = useTranslation();
  const targetCategory = mapCategory(tool.category);

  // 可选密钥 = 用户全部已有 key（同类别排前面）。确保「能选自己的 key」，
  // 不因类别不匹配就一个都不显示（旧行为的 bug：选不了的根因）。
  const selectableSecrets = useMemo(() => {
    const sameCat = (c?: string) =>
      (c ?? '').toUpperCase() === targetCategory.toUpperCase();
    return [...userSecrets].sort(
      (a, b) => Number(sameCat(b.category)) - Number(sameCat(a.category))
    );
  }, [userSecrets, targetCategory]);

  const [mode, setMode] = useState<'select' | 'new'>(
    selectableSecrets.length > 0 ? 'select' : 'new'
  );
  const [selectedId, setSelectedId] = useState(selectableSecrets[0]?.id ?? '');
  const [newValue, setNewValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (mode === 'select') {
      if (!selectedId) {
        setError('请选择一个已有密钥');
        return;
      }
    } else {
      if (!newValue.trim()) {
        setError(t('me.tools.modal.keyRequired'));
        return;
      }
    }
    setSubmitting(true);
    try {
      const body =
        mode === 'select'
          ? {
              name: tool.secretName,
              category: targetCategory,
              provider: tool.toolId,
              sourceSecretId: selectedId,
            }
          : {
              name: tool.secretName,
              category: targetCategory,
              provider: tool.toolId,
              value: newValue.trim(),
            };
      await apiClient.post('/user/secrets', body);
      onSuccess();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('me.tools.modal.saveFailed')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      closeOnOverlayClick={false}
      size="sm"
      title={t('me.tools.modal.configureTitle', { name: tool.name })}
      footer={
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={submitting}
          >
            {t('me.tools.modal.cancel')}
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? t('me.tools.modal.saving') : t('me.tools.modal.save')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-gray-500">
          为「{tool.name}」选择你已有的 Key，或新增一个。
        </p>

        {/* 模式切换 */}
        <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          {selectableSecrets.length > 0 && (
            <button
              onClick={() => setMode('select')}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                mode === 'select'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              从已有密钥选择（{selectableSecrets.length}）
            </button>
          )}
          <button
            onClick={() => setMode('new')}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
              mode === 'new'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            输入新密钥
          </button>
        </div>

        {mode === 'select' ? (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-700">
              选择你的一个密钥（同类别已置顶）
            </label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {selectableSecrets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName || s.name} · {s.category} · {s.maskedValue}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium text-gray-700">
                {t('me.tools.modal.keyLabel')}
              </label>
              {selectableSecrets.length === 0 && (
                <a
                  href="/me/api-keys"
                  className="text-xs text-primary underline hover:text-primary/80"
                >
                  前往「我的 API Keys」添加
                </a>
              )}
            </div>
            <input
              type="text"
              autoComplete="new-password"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder={t('me.tools.modal.keyPlaceholder')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

// ─── Request Grant Modal ──────────────────────────────────────────────────────

interface RequestGrantModalProps {
  tool: UserToolItem;
  onClose: () => void;
  onSuccess: () => void;
}

function RequestGrantModal({
  tool,
  onClose,
  onSuccess,
}: RequestGrantModalProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await requestToolGrant(tool.toolId, reason.trim() || undefined);
      onSuccess();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('me.tools.modal.requestFailed')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      closeOnOverlayClick={false}
      size="sm"
      title={t('me.tools.modal.requestTitle', { name: tool.name })}
      footer={
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={submitting}
          >
            {t('me.tools.modal.cancel')}
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={submitting}>
            {submitting
              ? t('me.tools.modal.requesting')
              : t('me.tools.modal.request')}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          {t('me.tools.modal.requestDesc')}
        </p>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            {t('me.tools.modal.reasonLabel')}
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('me.tools.modal.reasonPlaceholder')}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

// ─── Tool Row ─────────────────────────────────────────────────────────────────

interface ToolRowProps {
  tool: UserToolItem;
  onConfigureKey: (tool: UserToolItem) => void;
  onRequestGrant: (tool: UserToolItem) => void;
  onTestKey?: (tool: UserToolItem) => void;
  isTesting?: boolean;
}

function ToolRow({
  tool,
  onConfigureKey,
  onRequestGrant,
  onTestKey,
  isTesting,
}: ToolRowProps) {
  const { t } = useTranslation();

  // 状态由后端算好的 source 驱动：可用(绿) vs 需配置(黄)，一眼看懂。
  const badgeTone: 'success' | 'warning' =
    tool.source === 'none' ? 'warning' : 'success';
  const badgeLabel =
    tool.source === 'user'
      ? t('me.tools.status.configured')
      : tool.source === 'granted'
        ? t('me.tools.status.grantedSystem')
        : tool.source === 'platform'
          ? t('me.tools.status.systemAvailable')
          : t('me.tools.status.notConfigured');

  return (
    <Tr className="hover:bg-gray-50">
      <Td className="px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Wrench className="h-4 w-4 flex-shrink-0 text-gray-400" />
          <span className="truncate font-medium text-gray-900">
            {tool.name}
          </span>
        </div>
      </Td>
      <Td className="px-4 py-2.5">
        <code className="font-mono block truncate rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
          {tool.toolId}
        </code>
      </Td>
      <Td className="truncate px-4 py-2.5 text-sm text-gray-600">
        {tool.category}
      </Td>
      <Td className="px-4 py-2.5">
        <StatusBadge tone={badgeTone} label={badgeLabel} />
      </Td>
      <Td className="px-4 py-2.5 text-right">
        <div className="flex items-center justify-end gap-1">
          {tool.source === 'user' ? (
            // 已用你的 Key：测试 + 更换
            <>
              {onTestKey && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onTestKey(tool)}
                  disabled={isTesting}
                >
                  <FlaskConical className="mr-1 h-3.5 w-3.5" />
                  {isTesting ? t('me.apiKeys.testing') : t('me.apiKeys.test')}
                </Button>
              )}
              <button
                onClick={() => onConfigureKey(tool)}
                className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
              >
                <KeyRound className="h-3.5 w-3.5" />
                {t('me.tools.action.useMyKey')}
              </button>
            </>
          ) : tool.usable ? (
            // 平台已提供/已授权：开箱可用，BYOK 为可选覆盖
            <button
              onClick={() => onConfigureKey(tool)}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100"
            >
              <KeyRound className="h-3.5 w-3.5" />
              {t('me.tools.action.useMyKey')}
            </button>
          ) : (
            // 不可用：需要配置 Key（或申请平台授权）
            <>
              <button
                onClick={() => onConfigureKey(tool)}
                className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
              >
                <KeyRound className="h-3.5 w-3.5" />
                {t('me.tools.action.configureKey')}
              </button>
              {!tool.systemConfigured && (
                <button
                  onClick={() => onRequestGrant(tool)}
                  className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                >
                  <SendHorizonal className="h-3.5 w-3.5" />
                  {t('me.tools.action.requestGrant')}
                </button>
              )}
            </>
          )}
        </div>
      </Td>
    </Tr>
  );
}

// ─── Category Group ───────────────────────────────────────────────────────────

interface CategoryGroupProps {
  category: string;
  tools: UserToolItem[];
  onConfigureKey: (tool: UserToolItem) => void;
  onRequestGrant: (tool: UserToolItem) => void;
  onTestKey: (tool: UserToolItem) => void;
  testingSecretId: string | null;
  secretIdByName: Map<string, string>;
}

function CategoryGroup({
  category,
  tools,
  onConfigureKey,
  onRequestGrant,
  onTestKey,
  testingSecretId,
  secretIdByName,
}: CategoryGroupProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
        {category}
      </h3>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {/* table-fixed + 统一列宽：保证各类别组的列上下对齐 */}
        <Table className="w-full table-fixed">
          <THead className="bg-gray-50">
            <Tr>
              <Th className="w-[28%] px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('me.tools.col.name')}
              </Th>
              <Th className="w-[16%] px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('me.tools.col.toolId')}
              </Th>
              <Th className="w-[18%] px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('me.tools.col.category')}
              </Th>
              <Th className="w-[16%] px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('me.tools.col.myKey')}
              </Th>
              <Th className="w-[22%] px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('me.tools.col.actions')}
              </Th>
            </Tr>
          </THead>
          <TBody className="divide-y divide-gray-200">
            {tools.map((tool) => {
              const sid = secretIdByName.get(tool.secretName);
              return (
                <ToolRow
                  key={tool.toolId}
                  tool={tool}
                  onConfigureKey={onConfigureKey}
                  onRequestGrant={onRequestGrant}
                  onTestKey={sid ? onTestKey : undefined}
                  isTesting={!!sid && testingSecretId === sid}
                />
              );
            })}
          </TBody>
        </Table>
      </div>
    </div>
  );
}

// ─── UserToolsTab ─────────────────────────────────────────────────────────────

export function UserToolsTab() {
  const { t } = useTranslation();
  const { tools, loading, error, refresh } = useUserTools();
  const { secrets, testSecret, testingId } = useUserSecrets();
  const [search, setSearch] = useState('');
  const [configureTarget, setConfigureTarget] = useState<UserToolItem | null>(
    null
  );
  const [requestTarget, setRequestTarget] = useState<UserToolItem | null>(null);

  // Build a map: secretName → secret id, for cross-referencing configured tool keys
  const secretIdByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of secrets) {
      map.set(s.name, s.id);
    }
    return map;
  }, [secrets]);

  const handleTestKey = (tool: UserToolItem) => {
    const sid = secretIdByName.get(tool.secretName);
    if (sid) {
      void testSecret('secret', sid);
    }
  };

  const grouped = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? tools.filter(
          (t) =>
            t.name.toLowerCase().includes(term) ||
            t.toolId.toLowerCase().includes(term)
        )
      : tools;

    const map = new Map<string, UserToolItem[]>();
    for (const tool of filtered) {
      const list = map.get(tool.category) ?? [];
      list.push(tool);
      map.set(tool.category, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [tools, search]);

  if (loading) return <LoadingState text={t('me.tools.loading')} />;
  if (error)
    return (
      <ErrorState
        error={error}
        onRetry={refresh}
        title={t('me.tools.loadError')}
      />
    );

  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
        <p className="text-sm text-blue-800">{t('me.tools.grantInfo')}</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('me.tools.searchPlaceholder')}
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Content */}
      {grouped.length === 0 ? (
        <EmptyState
          type={search ? 'search' : 'default'}
          title={
            search ? t('me.tools.emptySearch') : t('me.tools.emptyDefault')
          }
        />
      ) : (
        <div className="space-y-6">
          {grouped.map(([category, categoryTools]) => (
            <CategoryGroup
              key={category}
              category={category}
              tools={categoryTools}
              onConfigureKey={setConfigureTarget}
              onRequestGrant={setRequestTarget}
              onTestKey={handleTestKey}
              testingSecretId={testingId}
              secretIdByName={secretIdByName}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {configureTarget && (
        <ConfigureKeyModal
          tool={configureTarget}
          userSecrets={secrets}
          onClose={() => setConfigureTarget(null)}
          onSuccess={refresh}
        />
      )}
      {requestTarget && (
        <RequestGrantModal
          tool={requestTarget}
          onClose={() => setRequestTarget(null)}
          onSuccess={refresh}
        />
      )}
    </div>
  );
}

export default UserToolsTab;
