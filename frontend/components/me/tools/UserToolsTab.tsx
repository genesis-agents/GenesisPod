'use client';

import { useMemo, useState } from 'react';
import { FlaskConical, Search, Wrench, KeyRound, SendHorizonal, Check } from 'lucide-react';
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
  onClose: () => void;
  onSuccess: () => void;
}

function ConfigureKeyModal({
  tool,
  onClose,
  onSuccess,
}: ConfigureKeyModalProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!value.trim()) {
      setError(t('me.tools.modal.keyRequired'));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await apiClient.post('/user/secrets', {
        name: tool.secretName,
        category: mapCategory(tool.category),
        provider: tool.toolId,
        value: value.trim(),
      });
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
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          {t('me.tools.modal.configureDesc', { secretName: tool.secretName })}
        </p>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            {t('me.tools.modal.keyLabel')}
          </label>
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t('me.tools.modal.keyPlaceholder')}
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

function ToolRow({ tool, onConfigureKey, onRequestGrant, onTestKey, isTesting }: ToolRowProps) {
  const { t } = useTranslation();

  let badgeTone: 'success' | 'info' | 'neutral' | 'warning';
  let badgeLabel: string;

  if (tool.configured) {
    badgeTone = 'success';
    badgeLabel = t('me.tools.status.configured');
  } else if (tool.granted) {
    badgeTone = 'info';
    badgeLabel = t('me.tools.status.grantedSystem');
  } else if (tool.systemConfigured) {
    badgeTone = 'neutral';
    badgeLabel = t('me.tools.status.systemAvailable');
  } else {
    badgeTone = 'warning';
    badgeLabel = t('me.tools.status.notConfigured');
  }

  return (
    <Tr className="hover:bg-gray-50">
      <Td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 flex-shrink-0 text-gray-400" />
          <span className="font-medium text-gray-900">{tool.name}</span>
        </div>
      </Td>
      <Td className="px-4 py-2.5">
        <code className="font-mono rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
          {tool.toolId}
        </code>
      </Td>
      <Td className="px-4 py-2.5 text-sm text-gray-600">{tool.category}</Td>
      <Td className="px-4 py-2.5">
        <StatusBadge tone={badgeTone} label={badgeLabel} />
      </Td>
      <Td className="px-4 py-2.5">
        {tool.systemConfigured ? (
          <Check className="h-4 w-4 text-emerald-500" />
        ) : (
          <span className="text-sm text-gray-400">—</span>
        )}
      </Td>
      <Td className="px-4 py-2.5 text-right">
        <div className="flex items-center justify-end gap-1">
          {tool.userConfigurable && !tool.configured && (
            <button
              onClick={() => onConfigureKey(tool)}
              className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
            >
              <KeyRound className="h-3.5 w-3.5" />
              {t('me.tools.action.configureKey')}
            </button>
          )}
          {tool.configured && onTestKey && (
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
          {!tool.granted && !tool.configured && !tool.systemConfigured && (
            <button
              onClick={() => onRequestGrant(tool)}
              className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
            >
              <SendHorizonal className="h-3.5 w-3.5" />
              {t('me.tools.action.requestGrant')}
            </button>
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
        <Table className="w-full">
          <THead className="bg-gray-50">
            <Tr>
              <Th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('me.tools.col.name')}
              </Th>
              <Th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('me.tools.col.toolId')}
              </Th>
              <Th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('me.tools.col.category')}
              </Th>
              <Th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('me.tools.col.myKey')}
              </Th>
              <Th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('me.tools.col.system')}
              </Th>
              <Th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
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
