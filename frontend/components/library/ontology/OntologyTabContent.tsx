'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  LayoutList,
  LayoutGrid,
  Network,
  ChevronRight,
  ChevronDown,
  Building2,
  User,
  Cpu,
  Package,
  Calendar,
  Lightbulb,
  MapPin,
  HelpCircle,
  Clock,
  RefreshCw,
  Sliders,
  Merge,
  Pencil,
  GitBranch,
  History,
  Link2,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import {
  useOntology,
  type OntologyObjectView,
  type ObjectType,
  type LinkType,
  type OntologyEdit,
  type ListEntitiesParams,
  type EntityTypeCount,
  type StartBackfillParams,
  type BackfillStatus,
} from '@/hooks/domain/useOntology';
import { Switch } from '@/components/ui/primitives/switch';
import { LoadingState, EmptyState, ErrorState } from '@/components/ui/states';
import { Tag } from '@/components/ui/tag/Tag';
import { AssetCard } from '@/components/ui/cards/asset-card';
import { SideDrawer } from '@/components/common/drawers/SideDrawer';
import DataTable, {
  type ColumnDef,
} from '@/components/common/tables/DataTable';
import { Tabs, type TabItem } from '@/components/ui/tabs/Tabs';
import { Modal } from '@/components/ui/dialogs/Modal';
import { ConfirmDialog } from '@/components/ui/dialogs/ConfirmDialog';
import { Button } from '@/components/ui/primitives/button';
import KnowledgeGraphView from '@/components/common/views/KnowledgeGraphView';
import { entityToken, type EntityKey } from '@/lib/design/tokens';
import { logger } from '@/lib/utils/logger';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const KNOWN_ENTITY_KEYS: EntityKey[] = [
  'org',
  'person',
  'technology',
  'product',
  'event',
  'concept',
  'location',
];

const ENTITY_ICON_MAP: Record<EntityKey, React.ElementType> = {
  org: Building2,
  person: User,
  technology: Cpu,
  product: Package,
  event: Calendar,
  concept: Lightbulb,
  location: MapPin,
};

function normalizeTypeKey(typeKey: string): EntityKey | null {
  const lower = typeKey.toLowerCase();
  // common aliases
  if (lower === 'organization' || lower === 'company') return 'org';
  if (lower === 'person' || lower === 'individual') return 'person';
  if (lower === 'technology' || lower === 'tech') return 'technology';
  if (lower === 'product') return 'product';
  if (lower === 'event') return 'event';
  if (lower === 'concept') return 'concept';
  if (lower === 'location' || lower === 'place') return 'location';
  if ((KNOWN_ENTITY_KEYS as string[]).includes(lower))
    return lower as EntityKey;
  return null;
}

function EntityTypeBadge({ typeKey }: { typeKey: string }) {
  const key = normalizeTypeKey(typeKey);
  if (!key) {
    return (
      <Tag className="bg-gray-100 text-gray-600 ring-gray-200">{typeKey}</Tag>
    );
  }
  const tok = entityToken[key];
  return (
    <Tag className={cn('ring-1', tok.text, tok.bg, tok.ring)}>{tok.label}</Tag>
  );
}

function formatDate(value: string | Date): string {
  try {
    return new Date(value).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return String(value);
  }
}

function formatDateTime(value: string | Date): string {
  try {
    return new Date(value).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(value);
  }
}

// ─── Left sidebar ─────────────────────────────────────────────────────────────

interface TypeTreeProps {
  /** True per-type counts from the backend (not the current page). */
  counts: EntityTypeCount[];
  /** True grand total across all types for the current topic/search. */
  total: number;
  selectedTypeKey: string | null;
  onSelect: (typeKey: string | null) => void;
}

function TypeTree({ counts, total, selectedTypeKey, onSelect }: TypeTreeProps) {
  const [open, setOpen] = useState(true);

  const countByType: Record<string, number> = {};
  for (const c of counts) countByType[c.typeKey] = c.count;
  const allTypes = [...counts]
    .map((c) => c.typeKey)
    .sort((a, b) => a.localeCompare(b));

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center gap-1 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        实体类型
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5">
          <li>
            <button
              type="button"
              onClick={() => onSelect(null)}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors',
                selectedTypeKey === null
                  ? 'bg-violet-50 font-medium text-violet-700'
                  : 'text-gray-700 hover:bg-gray-50'
              )}
            >
              <span>全部</span>
              <span className="text-xs text-gray-400">{total}</span>
            </button>
          </li>
          {allTypes.map((typeKey) => {
            const key = normalizeTypeKey(typeKey);
            const Icon = key ? ENTITY_ICON_MAP[key] : HelpCircle;
            const count = countByType[typeKey] ?? 0;
            const tok = key ? entityToken[key] : null;
            return (
              <li key={typeKey}>
                <button
                  type="button"
                  onClick={() => onSelect(typeKey)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors',
                    selectedTypeKey === typeKey
                      ? 'bg-violet-50 font-medium text-violet-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <Icon
                      className={cn(
                        'h-3.5 w-3.5',
                        tok ? tok.text : 'text-gray-400'
                      )}
                    />
                    {tok ? tok.label : typeKey}
                  </span>
                  <span className="text-xs text-gray-400">{count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface RecentChangesProps {
  items: OntologyObjectView[];
}

function RecentChanges({ items }: RecentChangesProps) {
  const [open, setOpen] = useState(true);
  const recent = [...items]
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
    .slice(0, 5);

  if (recent.length === 0) return null;

  return (
    <div className="mt-4">
      <button
        type="button"
        className="flex w-full items-center gap-1 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        最近变更
      </button>
      {open && (
        <ul className="mt-1 space-y-1">
          {recent.map((item) => (
            <li key={item.id} className="flex items-start gap-1.5 px-1 py-1">
              <Clock className="mt-0.5 h-3 w-3 shrink-0 text-gray-400" />
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-gray-700">
                  {item.label}
                </p>
                <p className="text-[10px] text-gray-400">
                  {formatDate(item.updatedAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Action modals ─────────────────────────────────────────────────────────────

interface EditPropertyModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (key: string, value: string, reason: string) => Promise<void>;
  entityLabel: string;
}

function EditPropertyModal({
  open,
  onClose,
  onSubmit,
  entityLabel,
}: EditPropertyModalProps) {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!key.trim() || !value.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(key.trim(), value.trim(), reason.trim());
      setKey('');
      setValue('');
      setReason('');
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="编辑属性"
      subtitle={entityLabel}
      size="sm"
      closeButtonDisabled={submitting}
      footer={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={submitting}
          >
            取消
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSubmit()}
            disabled={submitting || !key.trim() || !value.trim()}
          >
            {submitting ? '保存中…' : '保存'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            属性键
          </label>
          <input
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="如 industry"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            属性值
          </label>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="如 互联网"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            备注（可选）
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="修改原因"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
        </div>
      </div>
    </Modal>
  );
}

interface SetConfidenceModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (value: number, reason: string) => Promise<void>;
  entityLabel: string;
  currentConfidence: number;
}

function SetConfidenceModal({
  open,
  onClose,
  onSubmit,
  entityLabel,
  currentConfidence,
}: SetConfidenceModalProps) {
  const [value, setValue] = useState(Math.round(currentConfidence * 100));
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // sync when entity changes
  useEffect(() => {
    setValue(Math.round(currentConfidence * 100));
  }, [currentConfidence, open]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(value / 100, reason.trim());
      setReason('');
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="标注置信度"
      subtitle={entityLabel}
      size="sm"
      closeButtonDisabled={submitting}
      footer={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={submitting}
          >
            取消
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSubmit()}
            disabled={submitting}
          >
            {submitting ? '保存中…' : '保存'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            置信度：{value}%
          </label>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            className="w-full accent-violet-600"
          />
          <div className="mt-1 flex justify-between text-[10px] text-gray-400">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            备注（可选）
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="调整原因"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
        </div>
      </div>
    </Modal>
  );
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────

interface EntityDetailDrawerProps {
  entity: OntologyObjectView | null;
  related: OntologyObjectView[];
  relatedLoading: boolean;
  onClose: () => void;
  onEditProperty: (entity: OntologyObjectView) => void;
  onSetConfidence: (entity: OntologyObjectView) => void;
  onMerge: (entity: OntologyObjectView) => void;
}

function EntityDetailDrawer({
  entity,
  related,
  relatedLoading,
  onClose,
  onEditProperty,
  onSetConfidence,
  onMerge,
}: EntityDetailDrawerProps) {
  return (
    <SideDrawer
      open={entity !== null}
      onClose={onClose}
      title={entity?.label ?? ''}
      widthPx={440}
    >
      {entity && (
        <div className="space-y-5">
          {/* Type + confidence */}
          <div className="flex items-center gap-2">
            <EntityTypeBadge typeKey={entity.typeKey} />
            <span className="text-xs text-gray-400">
              置信度 {Math.round(entity.confidence * 100)}%
            </span>
          </div>

          {/* Action panel */}
          <section className="rounded-xl border border-gray-100 bg-gray-50 p-3">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              操作
            </h4>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEditProperty(entity)}
                className="flex items-center gap-1.5 text-xs"
              >
                <Pencil className="h-3.5 w-3.5" />
                编辑属性
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSetConfidence(entity)}
                className="flex items-center gap-1.5 text-xs"
              >
                <Sliders className="h-3.5 w-3.5" />
                标注置信度
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onMerge(entity)}
                className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700"
              >
                <Merge className="h-3.5 w-3.5" />
                合并对象
              </Button>
            </div>
          </section>

          {/* Aliases */}
          {entity.aliases.length > 0 && (
            <section>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                别名
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {entity.aliases.map((alias) => (
                  <Tag key={alias}>{alias}</Tag>
                ))}
              </div>
            </section>
          )}

          {/* Properties */}
          {Object.keys(entity.properties).length > 0 && (
            <section>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                属性
              </h4>
              <dl className="space-y-1.5 rounded-lg border border-gray-100 bg-gray-50 p-3">
                {Object.entries(entity.properties).map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-xs">
                    <dt className="shrink-0 font-medium text-gray-600">{k}:</dt>
                    <dd className="truncate text-gray-700">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {/* Related entities */}
          <section>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              相关实体
            </h4>
            {relatedLoading ? (
              <LoadingState size="sm" text="" />
            ) : related.length === 0 ? (
              <EmptyState size="sm" title="暂无相关实体" />
            ) : (
              <ul className="space-y-1">
                {related.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <EntityTypeBadge typeKey={r.typeKey} />
                    <span className="truncate">{r.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Provenance */}
          <section>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              溯源
            </h4>
            <dl className="space-y-1 text-xs text-gray-600">
              <div className="flex gap-2">
                <dt className="shrink-0 font-medium text-gray-500">创建者:</dt>
                <dd>{entity.createdBy}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 font-medium text-gray-500">创建于:</dt>
                <dd>{formatDate(entity.createdAt)}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 font-medium text-gray-500">更新于:</dt>
                <dd>{formatDate(entity.updatedAt)}</dd>
              </div>
              {entity.topicId && (
                <div className="flex gap-2">
                  <dt className="shrink-0 font-medium text-gray-500">话题:</dt>
                  <dd className="font-mono truncate text-[10px]">
                    {entity.topicId}
                  </dd>
                </div>
              )}
            </dl>
          </section>
        </div>
      )}
    </SideDrawer>
  );
}

// ─── Card view ────────────────────────────────────────────────────────────────

interface EntityCardProps {
  entity: OntologyObjectView;
  onClick: () => void;
}

function EntityCard({ entity, onClick }: EntityCardProps) {
  const key = normalizeTypeKey(entity.typeKey);
  const Icon = key ? ENTITY_ICON_MAP[key] : HelpCircle;
  const tok = key ? entityToken[key] : null;

  // canonical AssetCard（R2：禁止自写卡片）；类型色经 icon + badge 传达
  return (
    <AssetCard
      title={entity.label}
      description={
        entity.aliases.length > 0
          ? entity.aliases.slice(0, 3).join(' · ')
          : null
      }
      icon={
        <Icon className={cn('h-6 w-6', tok ? tok.text : 'text-gray-500')} />
      }
      badges={[
        {
          key: 'type',
          label: tok ? tok.label : entity.typeKey,
          className: tok ? cn(tok.bg, tok.text) : 'bg-gray-100 text-gray-600',
        },
      ]}
      onClick={onClick}
      timestamp={entity.updatedAt}
      className="h-full"
    />
  );
}

// ─── Meta-model tab ───────────────────────────────────────────────────────────

interface MetaModelTabProps {
  topicId?: string;
}

function MetaModelTab({ topicId: _topicId }: MetaModelTabProps) {
  const { listTypes, listLinkTypes } = useOntology();
  const [objectTypes, setObjectTypes] = useState<ObjectType[]>([]);
  const [linkTypes, setLinkTypes] = useState<LinkType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([listTypes(), listLinkTypes()])
      .then(([ot, lt]) => {
        setObjectTypes(ot);
        setLinkTypes(lt);
      })
      .catch((e: unknown) => {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        logger.error('[MetaModelTab] load failed', { error: err.message });
      })
      .finally(() => setLoading(false));
  }, [listTypes, listLinkTypes]);

  const objectTypeCols: ColumnDef<ObjectType>[] = [
    {
      id: 'key',
      header: '键名',
      accessorKey: 'key',
      sortable: true,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-gray-700">{row.key}</span>
      ),
    },
    {
      id: 'label',
      header: '标签',
      accessorKey: 'label',
      sortable: true,
      cell: ({ row }) => (
        <span className="font-medium text-gray-900">{row.label}</span>
      ),
    },
    {
      id: 'description',
      header: '描述',
      accessorKey: 'description',
      cell: ({ row }) =>
        row.description ? (
          <span className="text-sm text-gray-500">{row.description}</span>
        ) : (
          <span className="text-gray-300">—</span>
        ),
    },
  ];

  const linkTypeCols: ColumnDef<LinkType>[] = [
    {
      id: 'key',
      header: '键名',
      accessorKey: 'key',
      sortable: true,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-gray-700">{row.key}</span>
      ),
    },
    {
      id: 'label',
      header: '标签',
      accessorKey: 'label',
      sortable: true,
      cell: ({ row }) => (
        <span className="font-medium text-gray-900">{row.label}</span>
      ),
    },
    {
      id: 'directed',
      header: '有向',
      accessorKey: 'directed',
      cell: ({ row }) => (
        <span
          className={cn(
            'text-xs font-medium',
            row.directed ? 'text-violet-600' : 'text-gray-400'
          )}
        >
          {row.directed ? '是' : '否'}
        </span>
      ),
    },
    {
      id: 'description',
      header: '描述',
      accessorKey: 'description',
      cell: ({ row }) =>
        row.description ? (
          <span className="text-sm text-gray-500">{row.description}</span>
        ) : (
          <span className="text-gray-300">—</span>
        ),
    },
  ];

  if (loading) return <LoadingState size="lg" text="加载元模型..." />;
  if (error) {
    return (
      <ErrorState
        error={error}
        onRetry={() => {
          setError(null);
          setLoading(true);
          Promise.all([listTypes(), listLinkTypes()])
            .then(([ot, lt]) => {
              setObjectTypes(ot);
              setLinkTypes(lt);
            })
            .catch((e: unknown) => {
              const err = e instanceof Error ? e : new Error(String(e));
              setError(err);
            })
            .finally(() => setLoading(false));
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
          <GitBranch className="h-4 w-4 text-gray-400" />
          对象类型
          <Tag className="bg-gray-100 text-gray-500 ring-gray-200">
            {objectTypes.length}
          </Tag>
        </h3>
        {objectTypes.length === 0 ? (
          <EmptyState size="sm" title="暂无对象类型" />
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <DataTable
              data={objectTypes}
              columns={objectTypeCols}
              getRowId={(row) => row.key}
              emptyState={{ title: '暂无对象类型' }}
            />
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Link2 className="h-4 w-4 text-gray-400" />
          关系类型
          <Tag className="bg-gray-100 text-gray-500 ring-gray-200">
            {linkTypes.length}
          </Tag>
        </h3>
        {linkTypes.length === 0 ? (
          <EmptyState size="sm" title="暂无关系类型" />
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <DataTable
              data={linkTypes}
              columns={linkTypeCols}
              getRowId={(row) => row.key}
              emptyState={{ title: '暂无关系类型' }}
            />
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Graph tab ────────────────────────────────────────────────────────────────

interface GraphTabProps {
  topicId?: string;
}

function GraphTab({ topicId }: GraphTabProps) {
  const { loading, error } = useOntology();
  const [subgraphData, setSubgraphData] = useState<{
    nodes: Array<{
      id: string;
      label: string;
      type: string;
      properties: Record<string, unknown>;
    }>;
    edges: Array<{
      source: string;
      target: string;
      type: string;
      weight?: number;
    }>;
  } | null>(null);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [graphError, setGraphError] = useState<Error | null>(null);

  useEffect(() => {
    setLoadingGraph(true);
    setGraphError(null);
    const url = topicId
      ? `/ontology/subgraph?topicId=${topicId}`
      : '/ontology/subgraph';

    import('@/lib/api/client')
      .then(({ apiClient }) =>
        apiClient.get<{
          nodes: Array<{
            id: string;
            label: string;
            typeKey: string;
            properties: Record<string, unknown>;
          }>;
          links: Array<{
            fromId: string;
            toId: string;
            linkTypeKey: string;
            confidence?: number;
          }>;
        }>(url)
      )
      .then((data) => {
        setSubgraphData({
          nodes: (data.nodes ?? []).map((n) => ({
            id: n.id,
            label: n.label,
            type: n.typeKey,
            properties: n.properties ?? {},
          })),
          edges: (data.links ?? []).map((l) => ({
            source: l.fromId,
            target: l.toId,
            type: l.linkTypeKey,
            weight: l.confidence,
          })),
        });
      })
      .catch((e: unknown) => {
        const err = e instanceof Error ? e : new Error(String(e));
        setGraphError(err);
        logger.error('[GraphTab] subgraph load failed', { error: err.message });
      })
      .finally(() => setLoadingGraph(false));
  }, [topicId]);

  const nodeColor = useCallback(
    (node: { type: string }): string | undefined => {
      const key = normalizeTypeKey(node.type);
      if (!key) return undefined;
      // map entityToken text color → a hex via simple lookup
      const colorMap: Record<EntityKey, string> = {
        org: '#3b82f6',
        person: '#f59e0b',
        technology: '#10b981',
        product: '#8b5cf6',
        event: '#ef4444',
        concept: '#6366f1',
        location: '#14b8a6',
      };
      return colorMap[key];
    },
    []
  );

  if (loadingGraph || loading) {
    return <LoadingState size="lg" text="加载图谱数据..." />;
  }
  if (graphError || error) {
    return (
      <ErrorState
        error={graphError ?? error ?? new Error('Unknown error')}
        onRetry={() => {
          setGraphError(null);
          setLoadingGraph(true);
        }}
      />
    );
  }
  if (!subgraphData || subgraphData.nodes.length === 0) {
    return (
      <EmptyState
        icon={<Network className="h-12 w-12" />}
        title="暂无图谱数据"
        description="当前范围内尚未构建知识图谱"
      />
    );
  }

  return (
    <div className="h-[600px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <KnowledgeGraphView
        nodes={subgraphData.nodes}
        edges={subgraphData.edges}
        title="知识本体图谱"
        nodeColor={nodeColor}
      />
    </div>
  );
}

// ─── Edit feed tab ────────────────────────────────────────────────────────────

interface EditFeedTabProps {
  topicId?: string;
}

function EditFeedTab({ topicId }: EditFeedTabProps) {
  const { listEdits } = useOntology();
  const [edits, setEdits] = useState<OntologyEdit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    listEdits({ topicId, limit: 50 })
      .then((items) => setEdits(items))
      .catch((e: unknown) => {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        logger.error('[EditFeedTab] load failed', { error: err.message });
      })
      .finally(() => setLoading(false));
  }, [listEdits, topicId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingState size="lg" text="加载编辑历史..." />;
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (edits.length === 0) {
    return (
      <EmptyState
        icon={<History className="h-12 w-12" />}
        title="暂无编辑记录"
        description="本体变更历史将在这里展示"
      />
    );
  }

  const ACTION_LABEL: Record<string, string> = {
    create: '创建',
    update: '更新',
    delete: '删除',
    merge: '合并',
    confidence_update: '置信度更新',
    property_edit: '属性编辑',
  };

  return (
    <div className="space-y-3">
      {edits.map((edit) => (
        <div
          key={edit.id}
          className="flex gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
        >
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-50">
            <History className="h-3.5 w-3.5 text-violet-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Tag className="bg-violet-50 text-violet-700 ring-1 ring-violet-200">
                {ACTION_LABEL[edit.action] ?? edit.action}
              </Tag>
              <span className="text-xs text-gray-400">{edit.actorType}</span>
            </div>
            {edit.reason && (
              <p className="mt-1 text-sm text-gray-700">{edit.reason}</p>
            )}
            {(edit.before ?? edit.after) && (
              <dl className="mt-2 space-y-0.5 rounded-lg bg-gray-50 p-2 text-xs">
                {edit.before && (
                  <div className="flex gap-1.5">
                    <dt className="shrink-0 font-medium text-gray-500">
                      变更前:
                    </dt>
                    <dd className="truncate text-gray-600">
                      {JSON.stringify(edit.before)}
                    </dd>
                  </div>
                )}
                {edit.after && (
                  <div className="flex gap-1.5">
                    <dt className="shrink-0 font-medium text-gray-500">
                      变更后:
                    </dt>
                    <dd className="truncate text-gray-600">
                      {JSON.stringify(edit.after)}
                    </dd>
                  </div>
                )}
              </dl>
            )}
            <p className="mt-1.5 text-[10px] text-gray-400">
              {formatDateTime(edit.createdAt)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Objects tab (existing table/card view) ───────────────────────────────────

interface ObjectsTabProps {
  topicId?: string;
  onEntityClick: (entity: OntologyObjectView) => void;
}

function ObjectsTab({ topicId, onEntityClick }: ObjectsTabProps) {
  const { items, total, loading, error, listEntities, listTypeCounts } =
    useOntology();
  const [search, setSearch] = useState('');
  const [selectedTypeKey, setSelectedTypeKey] = useState<string | null>(null);
  const [view, setView] = useState<'table' | 'card'>('table');
  const [typeCounts, setTypeCounts] = useState<EntityTypeCount[]>([]);
  const [typeTotal, setTypeTotal] = useState(0);

  // Sidebar facets reflect DB totals (topic/search scoped, type-independent).
  const loadTypeCounts = useCallback(
    (searchValue: string) => {
      const params: { topicId?: string; search?: string } = {};
      if (topicId) params.topicId = topicId;
      if (searchValue) params.search = searchValue;
      void listTypeCounts(params)
        .then((r) => {
          setTypeCounts(r.counts);
          setTypeTotal(r.total);
        })
        .catch(() => undefined);
    },
    [topicId, listTypeCounts]
  );

  useEffect(() => {
    const params: ListEntitiesParams = {};
    if (topicId) params.topicId = topicId;
    void listEntities(params).catch((e: unknown) => {
      logger.error('[ObjectsTab] initial load failed', { error: String(e) });
    });
    loadTypeCounts('');
  }, [topicId, listEntities, loadTypeCounts]);

  const handleSearch = useCallback(
    (value: string) => {
      setSearch(value);
      const params: ListEntitiesParams = { search: value };
      if (topicId) params.topicId = topicId;
      if (selectedTypeKey) params.typeKey = selectedTypeKey;
      void listEntities(params).catch(() => undefined);
      loadTypeCounts(value);
    },
    [topicId, selectedTypeKey, listEntities, loadTypeCounts]
  );

  const handleTypeSelect = useCallback(
    (typeKey: string | null) => {
      setSelectedTypeKey(typeKey);
      const params: ListEntitiesParams = {};
      if (topicId) params.topicId = topicId;
      if (typeKey) params.typeKey = typeKey;
      if (search) params.search = search;
      void listEntities(params).catch(() => undefined);
    },
    [topicId, search, listEntities]
  );

  const handleRefresh = useCallback(() => {
    const params: ListEntitiesParams = {};
    if (topicId) params.topicId = topicId;
    if (selectedTypeKey) params.typeKey = selectedTypeKey;
    if (search) params.search = search;
    void listEntities(params).catch(() => undefined);
    loadTypeCounts(search);
  }, [topicId, selectedTypeKey, search, listEntities, loadTypeCounts]);

  const columns: ColumnDef<OntologyObjectView>[] = [
    {
      id: 'label',
      header: '名称',
      accessorKey: 'label',
      sortable: true,
      className: 'max-w-[200px]',
      cell: ({ row }) => (
        <span className="block truncate font-medium text-gray-900">
          {row.label}
        </span>
      ),
    },
    {
      id: 'typeKey',
      header: '类型',
      accessorKey: 'typeKey',
      cell: ({ row }) => <EntityTypeBadge typeKey={row.typeKey} />,
    },
    {
      id: 'aliases',
      header: '别名',
      headerClassName: 'hidden lg:table-cell',
      className: 'hidden max-w-[180px] lg:table-cell',
      accessorFn: (row) => row.aliases.join(', '),
      cell: ({ row }) =>
        row.aliases.length > 0 ? (
          <span className="block truncate text-sm text-gray-500">
            {row.aliases.slice(0, 2).join(' · ')}
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        ),
    },
    {
      id: 'confidence',
      header: '置信度',
      accessorKey: 'confidence',
      sortable: true,
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {Math.round(row.confidence * 100)}%
        </span>
      ),
    },
    {
      id: 'updatedAt',
      header: '更新时间',
      accessorKey: 'updatedAt',
      sortable: true,
      cell: ({ row }) => (
        <span className="text-sm text-gray-500">
          {formatDate(row.updatedAt)}
        </span>
      ),
    },
  ];

  return (
    <div className="flex h-full min-h-0 gap-6">
      {/* ── Left sidebar ── */}
      <aside className="flex min-h-0 w-56 shrink-0 flex-col rounded-xl border border-gray-200 bg-white shadow-sm xl:w-64">
        {/* Search */}
        <div className="border-b border-gray-100 p-3">
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="搜索实体..."
              className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none"
            />
          </div>
        </div>

        {/* Type tree + Recent changes */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <TypeTree
            counts={typeCounts}
            total={typeTotal}
            selectedTypeKey={selectedTypeKey}
            onSelect={handleTypeSelect}
          />
          <RecentChanges items={items} />
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            共 <span className="font-semibold text-gray-800">{total}</span>{' '}
            条实体
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              title="刷新"
              onClick={handleRefresh}
              className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <div className="flex items-center rounded-lg border border-gray-200 bg-white">
              <button
                type="button"
                title="表格视图"
                onClick={() => setView('table')}
                className={cn(
                  'rounded-l-lg p-1.5 transition-colors',
                  view === 'table'
                    ? 'bg-violet-50 text-violet-700'
                    : 'text-gray-500 hover:bg-gray-50'
                )}
              >
                <LayoutList className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="卡片视图"
                onClick={() => setView('card')}
                className={cn(
                  'rounded-r-lg p-1.5 transition-colors',
                  view === 'card'
                    ? 'bg-violet-50 text-violet-700'
                    : 'text-gray-500 hover:bg-gray-50'
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        {error ? (
          <ErrorState error={error} onRetry={handleRefresh} />
        ) : loading ? (
          <LoadingState size="lg" text="加载实体中..." />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Network className="h-12 w-12" />}
            title="暂无实体数据"
            description="当前范围内尚未提取到知识本体实体"
          />
        ) : view === 'table' ? (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <DataTable
              data={items}
              columns={columns}
              onRowClick={(row) => onEntityClick(row)}
              getRowId={(row) => row.id}
              emptyState={{
                title: '暂无实体',
                description: '调整筛选条件后重试',
              }}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((entity) => (
              <EntityCard
                key={entity.id}
                entity={entity}
                onClick={() => onEntityClick(entity)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Merge modal ──────────────────────────────────────────────────────────────

interface MergeModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (
    sourceIds: string[],
    targetId: string,
    reason: string
  ) => Promise<void>;
  entity: OntologyObjectView | null;
}

function MergeModal({ open, onClose, onSubmit, entity }: MergeModalProps) {
  const [sourceIdsText, setSourceIdsText] = useState('');
  const [reason, setReason] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handlePrepare = () => {
    if (!entity || !sourceIdsText.trim()) return;
    setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    if (!entity) return;
    const sourceIds = sourceIdsText
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    setSubmitting(true);
    try {
      await onSubmit(sourceIds, entity.id, reason.trim());
      setSourceIdsText('');
      setReason('');
      setConfirmOpen(false);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="合并对象"
        subtitle={entity?.label ?? ''}
        size="sm"
        closeButtonDisabled={submitting}
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={submitting}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handlePrepare}
              disabled={submitting || !sourceIdsText.trim()}
            >
              合并（不可逆）
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            将以下来源对象合并到当前对象（
            <span className="font-medium text-gray-900">{entity?.label}</span>
            ）。此操作<strong className="text-red-600">不可逆</strong>
            ，请谨慎操作。
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              来源对象 ID（多个用逗号或换行分隔）
            </label>
            <textarea
              value={sourceIdsText}
              onChange={(e) => setSourceIdsText(e.target.value)}
              placeholder="id1, id2, id3"
              rows={3}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              合并原因（可选）
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="如：重复实体去重"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
            />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
        title="确认合并对象？"
        description="此操作不可逆，来源对象将被永久合并。请确认。"
        type="danger"
        confirmText="确认合并"
        loading={submitting}
      />
    </>
  );
}

// ─── Backfill modal ───────────────────────────────────────────────────────────

interface BackfillModalProps {
  open: boolean;
  onClose: () => void;
  onStart: (params: StartBackfillParams) => Promise<void>;
}

function BackfillModal({ open, onClose, onStart }: BackfillModalProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      // Empty body — backend scopes to the authenticated user automatically
      await onStart({});
      setConfirmOpen(false);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="导入历史报告"
        subtitle="将你的研究/任务报告内容抽取入本体"
        size="sm"
        closeButtonDisabled={submitting}
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={submitting}
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={submitting}
            >
              导入我的全部历史报告
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          将你的研究/任务报告内容抽取入本体，按需触发、不受自动开关限制。系统将在后台异步处理，完成后可在进度条查看结果。
        </p>
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
        title="确认开始回填？"
        description="系统将扫描你的全部历史研究与任务报告，将实体沉淀至本体。任务在后台执行，完成前可查看进度。"
        type="warning"
        confirmText="确认导入"
        loading={submitting}
      />
    </>
  );
}

// ─── Backfill progress display ────────────────────────────────────────────────

interface BackfillProgressProps {
  taskId: string;
  onDone: () => void;
}

function BackfillProgress({ taskId, onDone }: BackfillProgressProps) {
  const { getBackfillStatus } = useOntology();
  const [status, setStatus] = useState<BackfillStatus | null>(null);
  const [pollError, setPollError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = () => {
      getBackfillStatus(taskId)
        .then((s) => {
          if (cancelled) return;
          setStatus(s);
          if (s.status === 'done' || s.status === 'failed') {
            onDone();
          } else {
            setTimeout(poll, 2000);
          }
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          const err = e instanceof Error ? e : new Error(String(e));
          setPollError(err);
        });
    };

    poll();

    return () => {
      cancelled = true;
    };
  }, [taskId, getBackfillStatus, onDone]);

  if (pollError) {
    return (
      <span className="text-xs text-red-600">
        进度查询失败: {pollError.message}
      </span>
    );
  }

  if (!status) {
    return <LoadingState size="sm" text="查询进度..." />;
  }

  return (
    <div className="flex items-center gap-2 text-sm text-gray-700">
      <RefreshCw className="h-3.5 w-3.5 animate-spin text-violet-500" />
      <span>
        回填中：{status.processed}/{status.total}
        {status.errors.length > 0 && (
          <span className="ml-1 text-red-500">
            ({status.errors.length} 错误)
          </span>
        )}
      </span>
      {(status.status === 'done' || status.status === 'failed') && (
        <Tag
          className={
            status.status === 'done'
              ? 'bg-green-50 text-green-700 ring-1 ring-green-200'
              : 'bg-red-50 text-red-700 ring-1 ring-red-200'
          }
        >
          {status.status === 'done' ? '完成' : '失败'}
        </Tag>
      )}
    </div>
  );
}

// ─── Settings / toolbar bar ───────────────────────────────────────────────────

interface OntologySettingsBarProps {
  topicId?: string;
}

function OntologySettingsBar({ topicId }: OntologySettingsBarProps) {
  const { getAutoIngest, setAutoIngest, startBackfill } = useOntology();

  // auto-ingest switch state (only relevant when topicId present)
  const [autoIngestEnabled, setAutoIngestEnabled] = useState(false);
  const [switchLoading, setSwitchLoading] = useState(false);
  const [switchInitialized, setSwitchInitialized] = useState(false);

  // backfill modal + progress
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // Load initial auto-ingest state when topicId is available
  useEffect(() => {
    if (!topicId) return;
    setSwitchInitialized(false);
    getAutoIngest(topicId)
      .then((cfg) => {
        setAutoIngestEnabled(cfg.enabled);
        setSwitchInitialized(true);
      })
      .catch((e: unknown) => {
        logger.error('[OntologySettingsBar] getAutoIngest failed', {
          topicId,
          error: String(e),
        });
        setSwitchInitialized(true);
      });
  }, [topicId, getAutoIngest]);

  const handleSwitchChange = useCallback(
    async (checked: boolean) => {
      if (!topicId || switchLoading) return;
      setSwitchLoading(true);
      const prev = autoIngestEnabled;
      setAutoIngestEnabled(checked);
      try {
        await setAutoIngest(topicId, checked);
      } catch (e: unknown) {
        // rollback on error
        setAutoIngestEnabled(prev);
        logger.error('[OntologySettingsBar] setAutoIngest failed', {
          topicId,
          error: String(e),
        });
      } finally {
        setSwitchLoading(false);
      }
    },
    [topicId, switchLoading, autoIngestEnabled, setAutoIngest]
  );

  const handleBackfillStart = useCallback(
    async (params: StartBackfillParams) => {
      const result = await startBackfill(params);
      setActiveTaskId(result.taskId);
    },
    [startBackfill]
  );

  const handleProgressDone = useCallback(() => {
    // keep taskId visible so user can see final status; clear after 5s
    setTimeout(() => setActiveTaskId(null), 5000);
  }, []);

  // When no topicId: render only the inline button group (parent row positions it)
  if (!topicId) {
    return (
      <div className="flex shrink-0 items-center gap-3">
        {activeTaskId && (
          <BackfillProgress taskId={activeTaskId} onDone={handleProgressDone} />
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setBackfillOpen(true)}
          className="flex shrink-0 items-center gap-1.5"
        >
          <History className="h-3.5 w-3.5" />
          导入历史报告
        </Button>
        <BackfillModal
          open={backfillOpen}
          onClose={() => setBackfillOpen(false)}
          onStart={handleBackfillStart}
        />
      </div>
    );
  }

  // With topicId: show the auto-ingest switch + backfill button in one compact bar
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-6">
        {/* Auto-ingest switch */}
        <div className="flex items-center gap-2.5">
          <Switch
            checked={autoIngestEnabled}
            onCheckedChange={(checked) => void handleSwitchChange(checked)}
            disabled={switchLoading || !switchInitialized}
            aria-label="本议题自动沉淀到本体"
          />
          <span className="text-sm font-medium text-gray-700">
            本议题自动沉淀到本体
          </span>
          <span className="text-xs text-gray-400">
            默认关，开启后该议题 mission 完成自动入本体
          </span>
        </div>

        {/* Backfill progress */}
        {activeTaskId && (
          <BackfillProgress taskId={activeTaskId} onDone={handleProgressDone} />
        )}
      </div>

      {/* Import history button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setBackfillOpen(true)}
        className="flex shrink-0 items-center gap-1.5"
      >
        <History className="h-3.5 w-3.5" />
        导入历史报告
      </Button>

      <BackfillModal
        open={backfillOpen}
        onClose={() => setBackfillOpen(false)}
        onStart={handleBackfillStart}
      />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type MainTab = 'objects' | 'metamodel' | 'graph' | 'edits';

interface OntologyTabContentProps {
  /** Optional topic scope for initial load */
  topicId?: string;
}

export default function OntologyTabContent({
  topicId,
}: OntologyTabContentProps) {
  const { setConfidence, editProperty, mergeObjects } = useOntology();

  const [mainTab, setMainTab] = useState<MainTab>('objects');
  const [selectedEntity, setSelectedEntity] =
    useState<OntologyObjectView | null>(null);
  const [related, setRelated] = useState<OntologyObjectView[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);

  // action modals
  const [editPropOpen, setEditPropOpen] = useState(false);
  const [confidenceOpen, setConfidenceOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);

  const { getRelated } = useOntology();

  const handleEntityClick = useCallback(
    async (entity: OntologyObjectView) => {
      setSelectedEntity(entity);
      setRelatedLoading(true);
      try {
        const result = await getRelated(entity.id);
        setRelated(result ?? []);
      } catch {
        setRelated([]);
      } finally {
        setRelatedLoading(false);
      }
    },
    [getRelated]
  );

  const handleEditProperty = useCallback((entity: OntologyObjectView) => {
    setSelectedEntity(entity);
    setEditPropOpen(true);
  }, []);

  const handleSetConfidence = useCallback((entity: OntologyObjectView) => {
    setSelectedEntity(entity);
    setConfidenceOpen(true);
  }, []);

  const handleMerge = useCallback((entity: OntologyObjectView) => {
    setSelectedEntity(entity);
    setMergeOpen(true);
  }, []);

  const handleEditPropertySubmit = useCallback(
    async (key: string, value: string, reason: string) => {
      if (!selectedEntity) return;
      await editProperty(selectedEntity.id, key, value, reason || undefined);
    },
    [selectedEntity, editProperty]
  );

  const handleConfidenceSubmit = useCallback(
    async (value: number, reason: string) => {
      if (!selectedEntity) return;
      await setConfidence(selectedEntity.id, value, reason || undefined);
    },
    [selectedEntity, setConfidence]
  );

  const handleMergeSubmit = useCallback(
    async (sourceIds: string[], targetId: string, reason: string) => {
      await mergeObjects(sourceIds, targetId, reason || undefined);
    },
    [mergeObjects]
  );

  const tabItems: TabItem[] = [
    { key: 'objects', label: '对象', icon: Network },
    { key: 'metamodel', label: '元模型', icon: GitBranch },
    { key: 'graph', label: '图谱', icon: LayoutGrid },
    { key: 'edits', label: 'Edit 流', icon: History },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-50/50 px-8 py-4">
      {/* Auto-ingest toolbar — only meaningful within a topic scope */}
      {topicId && <OntologySettingsBar topicId={topicId} />}

      {/* Top tab bar — import button sits inline on the right when no topic scope */}
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-gray-200">
        <Tabs
          items={tabItems}
          value={mainTab}
          onChange={(key) => setMainTab(key as MainTab)}
          variant="underline"
          className="flex-1 border-b-0"
        />
        {!topicId && <OntologySettingsBar topicId={topicId} />}
      </div>

      {/* Tab content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {mainTab === 'objects' && (
          <ObjectsTab
            topicId={topicId}
            onEntityClick={(entity) => void handleEntityClick(entity)}
          />
        )}
        {mainTab === 'metamodel' && <MetaModelTab topicId={topicId} />}
        {mainTab === 'graph' && <GraphTab topicId={topicId} />}
        {mainTab === 'edits' && <EditFeedTab topicId={topicId} />}
      </div>

      {/* Detail drawer (only relevant in objects tab) */}
      <EntityDetailDrawer
        entity={selectedEntity}
        related={related}
        relatedLoading={relatedLoading}
        onClose={() => setSelectedEntity(null)}
        onEditProperty={handleEditProperty}
        onSetConfidence={handleSetConfidence}
        onMerge={handleMerge}
      />

      {/* Action modals */}
      <EditPropertyModal
        open={editPropOpen}
        onClose={() => setEditPropOpen(false)}
        onSubmit={handleEditPropertySubmit}
        entityLabel={selectedEntity?.label ?? ''}
      />

      <SetConfidenceModal
        open={confidenceOpen}
        onClose={() => setConfidenceOpen(false)}
        onSubmit={handleConfidenceSubmit}
        entityLabel={selectedEntity?.label ?? ''}
        currentConfidence={selectedEntity?.confidence ?? 1}
      />

      <MergeModal
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        onSubmit={handleMergeSubmit}
        entity={selectedEntity}
      />
    </div>
  );
}
