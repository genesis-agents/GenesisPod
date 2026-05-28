'use client';

import { useMemo, useState } from 'react';
import { FlaskConical, Key, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { confirm } from '@/stores';
import { Table, THead, TBody, Tr, Th, Td } from '@/components/ui/table';
import { TruncatedCell } from '@/components/common/tables';
import { StatusBadge } from '@/components/ui/badges';
import { EmptyState } from '@/components/ui/states/EmptyState';
import { LoadingState } from '@/components/ui/states';
import { ErrorState } from '@/components/ui/states';
import { Modal } from '@/components/ui/dialogs/Modal';
import { Button } from '@/components/ui/primitives/button';
import { Input } from '@/components/ui/form/Input';
import {
  useUserSecrets,
  SECRET_CATEGORIES,
  type UserSecretItem,
  type SecretCategory,
  type CreateSecretBody,
  type UpdateSecretBody,
} from '@/hooks/features/useUserSecrets';

// ─── Add Key Modal ─────────────────────────────────────────────────────────────

interface AddKeyModalProps {
  onClose: () => void;
  onSubmit: (body: CreateSecretBody) => Promise<boolean>;
}

function AddKeyModal({ onClose, onSubmit }: AddKeyModalProps) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [category, setCategory] = useState<SecretCategory>('AI_MODEL');
  const [provider, setProvider] = useState('');
  const [value, setValue] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);

  const handleSubmit = async () => {
    if (!name.trim() || !value.trim()) return;
    setSubmitting(true);
    const ok = await onSubmit({
      name: name.trim(),
      displayName: displayName.trim() || undefined,
      category,
      provider: provider.trim() || undefined,
      value: value.trim(),
      description: description.trim() || undefined,
      isActive,
    });
    setSubmitting(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={t('me.apiKeys.addTitle')}
      size="md"
      closeButtonDisabled={submitting}
      footer={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={submitting}
          >
            {t('me.apiKeys.cancel')}
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || !name.trim() || !value.trim()}
          >
            {submitting ? t('me.apiKeys.saving') : t('me.apiKeys.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            {t('me.apiKeys.fieldName')} *
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. openai-key-1"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            {t('me.apiKeys.fieldDisplayName')}
          </label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. OpenAI Production Key"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            {t('me.apiKeys.fieldCategory')} *
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as SecretCategory)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {SECRET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            {t('me.apiKeys.fieldProvider')}
          </label>
          <Input
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            placeholder="e.g. openai"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            {t('me.apiKeys.fieldValue')} *
          </label>
          <Input
            type="text" autoComplete="new-password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t('me.apiKeys.fieldValuePlaceholder')}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            {t('me.apiKeys.fieldDescription')}
          </label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder=""
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="add-isActive"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <label htmlFor="add-isActive" className="text-sm text-gray-700">
            {t('me.apiKeys.fieldIsActive')}
          </label>
        </div>
      </div>
    </Modal>
  );
}

// ─── Edit Key Modal ─────────────────────────────────────────────────────────────

interface EditKeyModalProps {
  item: UserSecretItem;
  onClose: () => void;
  onSubmit: (
    source: 'llm' | 'secret',
    id: string,
    body: UpdateSecretBody
  ) => Promise<boolean>;
}

function EditKeyModal({ item, onClose, onSubmit }: EditKeyModalProps) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [value, setValue] = useState('');
  const [displayName, setDisplayName] = useState(item.displayName);
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(item.isActive);

  const handleSubmit = async () => {
    setSubmitting(true);
    const body: UpdateSecretBody = {
      displayName: displayName.trim() || undefined,
      description: description.trim() || undefined,
      isActive,
    };
    if (value.trim()) body.value = value.trim();
    const ok = await onSubmit(item.source, item.id, body);
    setSubmitting(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={t('me.apiKeys.editTitle')}
      size="md"
      closeButtonDisabled={submitting}
      footer={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={submitting}
          >
            {t('me.apiKeys.cancel')}
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? t('me.apiKeys.saving') : t('me.apiKeys.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            {t('me.apiKeys.fieldDisplayName')}
          </label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            {t('me.apiKeys.fieldValue')}
          </label>
          <Input
            type="text" autoComplete="new-password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t('me.apiKeys.fieldValueEditPlaceholder')}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            {t('me.apiKeys.fieldDescription')}
          </label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="edit-isActive"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <label htmlFor="edit-isActive" className="text-sm text-gray-700">
            {t('me.apiKeys.fieldIsActive')}
          </label>
        </div>
      </div>
    </Modal>
  );
}

// ─── Request System Key Modal ───────────────────────────────────────────────────

interface RequestKeyModalProps {
  onClose: () => void;
  onSubmit: (
    category: SecretCategory,
    targetId: string,
    reason?: string
  ) => Promise<boolean>;
}

function RequestKeyModal({ onClose, onSubmit }: RequestKeyModalProps) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [category, setCategory] = useState<SecretCategory>('AI_MODEL');
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');

  const handleSubmit = async () => {
    if (!targetId.trim()) return;
    setSubmitting(true);
    const ok = await onSubmit(
      category,
      targetId.trim(),
      reason.trim() || undefined
    );
    setSubmitting(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={t('me.apiKeys.requestTitle')}
      size="md"
      closeButtonDisabled={submitting}
      footer={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={submitting}
          >
            {t('me.apiKeys.cancel')}
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || !targetId.trim()}
          >
            {submitting ? t('me.apiKeys.submitting') : t('me.apiKeys.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            {t('me.apiKeys.requestCategory')} *
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as SecretCategory)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {SECRET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Target ID *
          </label>
          <Input
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            placeholder="e.g. openai-gpt4"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            {t('me.apiKeys.fieldReason')}
          </label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

// ─── Main Tab Component ─────────────────────────────────────────────────────────

export function UserApiKeysTab() {
  const { t } = useTranslation();
  const {
    secrets,
    loading,
    error,
    refresh,
    createSecret,
    updateSecret,
    deleteSecret,
    requestSystemKey,
    testSecret,
    testingId,
  } = useUserSecrets();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [editingItem, setEditingItem] = useState<UserSecretItem | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return secrets.filter((s) => {
      if (categoryFilter !== 'ALL' && s.category !== categoryFilter)
        return false;
      if (
        term &&
        !s.name.toLowerCase().includes(term) &&
        !s.displayName.toLowerCase().includes(term)
      )
        return false;
      return true;
    });
  }, [secrets, search, categoryFilter]);

  const handleDelete = async (item: UserSecretItem) => {
    const confirmed = await confirm({
      title: t('me.apiKeys.deleteConfirmTitle'),
      description: t('me.apiKeys.deleteConfirmDesc'),
      type: 'danger',
    });
    if (!confirmed) return;
    await deleteSecret(item.source, item.id);
  };

  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState error={error} onRetry={() => void refresh()} />;
  }

  const isEmpty = filtered.length === 0;
  const isSearchActive = search.trim() !== '' || categoryFilter !== 'ALL';

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold text-gray-900">
          {t('me.apiKeys.title')}
        </h2>
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('me.apiKeys.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="ALL">{t('me.apiKeys.filterAll')}</option>
          {SECRET_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          onClick={() => void refresh()}
          className="rounded-lg border border-gray-300 p-2 transition-colors hover:bg-gray-100"
          title={t('me.apiKeys.refresh')}
        >
          <RefreshCw className="h-4 w-4 text-gray-500" />
        </button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowRequestModal(true)}
        >
          <Key className="mr-1.5 h-4 w-4" />
          {t('me.apiKeys.requestSystemKey')}
        </Button>
        <Button size="sm" onClick={() => setShowAddModal(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          {t('me.apiKeys.addKey')}
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <Table className="w-full">
          <THead className="bg-gray-50">
            <Tr>
              <Th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('me.apiKeys.colName')}
              </Th>
              <Th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('me.apiKeys.colCategory')}
              </Th>
              <Th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('me.apiKeys.colValue')}
              </Th>
              <Th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('me.apiKeys.colStatus')}
              </Th>
              <Th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('me.apiKeys.colUsage')}
              </Th>
              <Th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('me.apiKeys.colActions')}
              </Th>
            </Tr>
          </THead>
          <TBody className="divide-y divide-gray-200">
            {isEmpty ? (
              <Tr>
                <Td colSpan={6}>
                  <EmptyState
                    size="sm"
                    title={
                      isSearchActive
                        ? t('me.apiKeys.emptySearchTitle')
                        : t('me.apiKeys.emptyTitle')
                    }
                    description={
                      isSearchActive ? undefined : t('me.apiKeys.emptyDesc')
                    }
                  />
                </Td>
              </Tr>
            ) : (
              filtered.map((item) => (
                <SecretRow
                  key={`${item.source}-${item.id}`}
                  item={item}
                  onEdit={() => setEditingItem(item)}
                  onDelete={() => void handleDelete(item)}
                  onTest={() => void testSecret(item.source, item.id)}
                  isTesting={testingId === item.id}
                />
              ))
            )}
          </TBody>
        </Table>
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddKeyModal
          onClose={() => setShowAddModal(false)}
          onSubmit={createSecret}
        />
      )}
      {editingItem && (
        <EditKeyModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSubmit={updateSecret}
        />
      )}
      {showRequestModal && (
        <RequestKeyModal
          onClose={() => setShowRequestModal(false)}
          onSubmit={requestSystemKey}
        />
      )}
    </div>
  );
}

export default UserApiKeysTab;

// ─── Row ───────────────────────────────────────────────────────────────────────

function SecretRow({
  item,
  onEdit,
  onDelete,
  onTest,
  isTesting,
}: {
  item: UserSecretItem;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  isTesting: boolean;
}) {
  const { t } = useTranslation();

  return (
    <Tr className="hover:bg-gray-50">
      {/* Name */}
      <Td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 flex-shrink-0 text-gray-400" />
          <div className="min-w-0">
            <TruncatedCell className="max-w-[200px] font-medium text-gray-900">
              {item.displayName || item.name}
            </TruncatedCell>
            {item.displayName && (
              <TruncatedCell className="max-w-[200px] text-xs text-gray-400">
                {item.name}
              </TruncatedCell>
            )}
          </div>
        </div>
      </Td>
      {/* Category + provider */}
      <Td className="px-4 py-2.5">
        <StatusBadge tone="info" label={item.category} />
        {item.provider && (
          <p className="mt-0.5 text-xs text-gray-400">{item.provider}</p>
        )}
      </Td>
      {/* Masked value */}
      <Td className="px-4 py-2.5">
        <TruncatedCell className="font-mono max-w-[180px] text-sm text-gray-600">
          {item.maskedValue || '—'}
        </TruncatedCell>
      </Td>
      {/* Status */}
      <Td className="px-4 py-2.5">
        <StatusBadge
          tone={item.isActive ? 'success' : 'neutral'}
          label={
            item.isActive
              ? t('me.apiKeys.statusActive')
              : t('me.apiKeys.statusInactive')
          }
          dot
        />
      </Td>
      {/* Usage */}
      <Td className="px-4 py-2.5 text-sm text-gray-500">{item.usageCount}</Td>
      {/* Actions */}
      <Td className="px-4 py-2.5 text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={onTest}
            disabled={isTesting}
            title={t('me.apiKeys.test')}
          >
            <FlaskConical className="h-3.5 w-3.5" />
            <span className="ml-1 hidden sm:inline">
              {isTesting ? t('me.apiKeys.testing') : t('me.apiKeys.test')}
            </span>
          </Button>
          <button
            onClick={onEdit}
            className="rounded p-1.5 hover:bg-gray-100"
            title={t('me.apiKeys.editTitle')}
          >
            <Pencil className="h-4 w-4 text-gray-500" />
          </button>
          <button
            onClick={onDelete}
            className="rounded p-1.5 hover:bg-red-50"
            title={t('me.apiKeys.deleteConfirmTitle')}
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </button>
        </div>
      </Td>
    </Tr>
  );
}
