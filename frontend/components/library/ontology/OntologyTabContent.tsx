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
  HelpCircle,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import {
  useOntology,
  type OntologyObjectView,
  type ListEntitiesParams,
} from '@/hooks/domain/useOntology';
import { LoadingState, EmptyState, ErrorState } from '@/components/ui/states';
import { Tag } from '@/components/ui/tag/Tag';
import { AssetCard } from '@/components/ui/cards/asset-card';
import { SideDrawer } from '@/components/common/drawers/SideDrawer';
import DataTable, {
  type ColumnDef,
} from '@/components/common/tables/DataTable';
import { entityToken, type EntityKey } from '@/lib/design/tokens';
import { logger } from '@/lib/utils/logger';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const KNOWN_ENTITY_KEYS: EntityKey[] = [
  'org',
  'person',
  'technology',
  'product',
  'event',
];

const ENTITY_ICON_MAP: Record<EntityKey, React.ElementType> = {
  org: Building2,
  person: User,
  technology: Cpu,
  product: Package,
  event: Calendar,
};

function normalizeTypeKey(typeKey: string): EntityKey | null {
  const lower = typeKey.toLowerCase();
  // common aliases
  if (lower === 'organization' || lower === 'company') return 'org';
  if (lower === 'person' || lower === 'individual') return 'person';
  if (lower === 'technology' || lower === 'tech') return 'technology';
  if (lower === 'product') return 'product';
  if (lower === 'event') return 'event';
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

// ─── Left sidebar ─────────────────────────────────────────────────────────────

interface TypeTreeProps {
  items: OntologyObjectView[];
  selectedTypeKey: string | null;
  onSelect: (typeKey: string | null) => void;
}

function TypeTree({ items, selectedTypeKey, onSelect }: TypeTreeProps) {
  const [open, setOpen] = useState(true);

  const countByType = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.typeKey] = (acc[item.typeKey] ?? 0) + 1;
    return acc;
  }, {});

  const allTypes = Object.keys(countByType).sort();

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
              <span className="text-xs text-gray-400">{items.length}</span>
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

// ─── Detail Drawer ────────────────────────────────────────────────────────────

interface EntityDetailDrawerProps {
  entity: OntologyObjectView | null;
  related: OntologyObjectView[];
  relatedLoading: boolean;
  onClose: () => void;
}

function EntityDetailDrawer({
  entity,
  related,
  relatedLoading,
  onClose,
}: EntityDetailDrawerProps) {
  return (
    <SideDrawer
      open={entity !== null}
      onClose={onClose}
      title={entity?.label ?? ''}
      widthPx={420}
    >
      {entity && (
        <div className="space-y-5 p-4">
          {/* Type + confidence */}
          <div className="flex items-center gap-2">
            <EntityTypeBadge typeKey={entity.typeKey} />
            <span className="text-xs text-gray-400">
              置信度 {Math.round(entity.confidence * 100)}%
            </span>
          </div>

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

// ─── Main component ───────────────────────────────────────────────────────────

interface OntologyTabContentProps {
  /** Optional topic scope for initial load */
  topicId?: string;
}

export default function OntologyTabContent({
  topicId,
}: OntologyTabContentProps) {
  const { items, loading, error, listEntities, getRelated } = useOntology();
  const [search, setSearch] = useState('');
  const [selectedTypeKey, setSelectedTypeKey] = useState<string | null>(null);
  const [view, setView] = useState<'table' | 'card'>('table');
  const [selectedEntity, setSelectedEntity] =
    useState<OntologyObjectView | null>(null);
  const [related, setRelated] = useState<OntologyObjectView[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);

  // Initial load
  useEffect(() => {
    const params: ListEntitiesParams = {};
    if (topicId) params.topicId = topicId;
    void listEntities(params).catch((e: unknown) => {
      logger.error('[OntologyTabContent] initial load failed', {
        error: String(e),
      });
    });
  }, [topicId, listEntities]);

  const handleSearch = useCallback(
    (value: string) => {
      setSearch(value);
      const params: ListEntitiesParams = { search: value };
      if (topicId) params.topicId = topicId;
      if (selectedTypeKey) params.typeKey = selectedTypeKey;
      void listEntities(params).catch(() => undefined);
    },
    [topicId, selectedTypeKey, listEntities]
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

  const handleRefresh = useCallback(() => {
    const params: ListEntitiesParams = {};
    if (topicId) params.topicId = topicId;
    if (selectedTypeKey) params.typeKey = selectedTypeKey;
    if (search) params.search = search;
    void listEntities(params).catch(() => undefined);
  }, [topicId, selectedTypeKey, search, listEntities]);

  // DataTable columns
  const columns: ColumnDef<OntologyObjectView>[] = [
    {
      id: 'label',
      header: '名称',
      accessorKey: 'label',
      sortable: true,
      cell: ({ row }) => (
        <span className="font-medium text-gray-900">{row.label}</span>
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
      accessorFn: (row) => row.aliases.join(', '),
      cell: ({ row }) =>
        row.aliases.length > 0 ? (
          <span className="text-sm text-gray-500">
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
    <div className="flex h-full min-h-0 bg-gray-50/50 px-6 py-6">
      <div className="grid min-h-0 w-full gap-6 md:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
        {/* ── Left sidebar ── */}
        <aside className="flex min-h-0 flex-col rounded-xl border border-gray-200 bg-white shadow-sm">
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
              items={items}
              selectedTypeKey={selectedTypeKey}
              onSelect={handleTypeSelect}
            />
            <RecentChanges items={items} />
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="flex min-h-0 min-w-0 flex-col gap-4">
          {/* Toolbar */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              共{' '}
              <span className="font-semibold text-gray-800">
                {items.length}
              </span>{' '}
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
                onRowClick={(row) => void handleEntityClick(row)}
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
                  onClick={() => void handleEntityClick(entity)}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Detail drawer */}
      <EntityDetailDrawer
        entity={selectedEntity}
        related={related}
        relatedLoading={relatedLoading}
        onClose={() => setSelectedEntity(null)}
      />
    </div>
  );
}
