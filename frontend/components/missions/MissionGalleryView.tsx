'use client';

/**
 * MissionGalleryView (R-CA 2026-05-05)
 *
 * Playground 主页 + 每个 custom agent 主页共享的 mission 网格视图。
 * 抽自 frontend/app/agent-playground/page.tsx，让 /agent-playground 和
 * /custom-agents/:id 两个入口 UI 100% 一致，差别只在数据源 + header。
 *
 * 调用方传入：
 *   - 数据源（fetchMissions） + mission 操作 callbacks（rerun/cancel/edit/delete）
 *   - header 配置（icon gradient、title、subtitle、createButtonLabel + onCreate）
 *   - emptyState 文案（首次为空时引导）
 *
 * 内部封装：搜索 / 卡片网格 / dashed 占位卡 / 加载态 / 错误态。
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Coins,
  Loader2,
  RefreshCw,
  Sparkles,
  StopCircle,
  Trophy,
  XCircle,
} from 'lucide-react';
import {
  AssetCard,
  type AssetCardAction,
  type AssetCardBadge,
} from '@/components/common/asset-card';
import type { MissionListItem } from '@/services/agent-playground/api';

// ─── 共享 status / depth 视觉配置 ──────────────────────────────────────────
const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    color: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  completed: {
    label: '已完成',
    color: 'bg-emerald-50 text-emerald-700',
    icon: CheckCircle2,
  },
  failed: { label: '失败', color: 'bg-red-50 text-red-700', icon: XCircle },
  running: {
    label: '进行中',
    color: 'bg-blue-50 text-blue-700',
    icon: Loader2,
  },
  rejected: {
    label: '已拒绝',
    color: 'bg-amber-50 text-amber-700',
    icon: XCircle,
  },
  cancelled: {
    label: '已取消',
    color: 'bg-gray-100 text-gray-700',
    icon: XCircle,
  },
  'quality-failed': {
    label: '质量未达标',
    color: 'bg-amber-50 text-amber-700',
    icon: XCircle,
  },
};

const DEPTH_GRADIENT: Record<string, string> = {
  quick: 'from-emerald-500 to-teal-600',
  standard: 'from-violet-500 to-purple-600',
  deep: 'from-rose-500 to-pink-600',
};

const SearchIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
    />
  </svg>
);

const PlusIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 4v16m8-8H4"
    />
  </svg>
);

// ─── MissionCard（抽自 PlaygroundIndexPage）────────────────────────────────
function MissionCard({
  mission,
  onClick,
  onRerun,
  onCancel,
  onEdit,
  onDelete,
}: {
  mission: MissionListItem;
  onClick: () => void;
  onRerun: (mission: MissionListItem) => void;
  onCancel: (mission: MissionListItem) => void;
  onEdit: (mission: MissionListItem) => void;
  onDelete: (mission: MissionListItem) => void;
}) {
  // ★ 2026-05-06: 后端字段可能为 null（DB 老数据 / mission 启动失败 partial）→ 防 toUpperCase / DEPTH_GRADIENT[null] 触发 ErrorBoundary
  const safeStatus = mission.status || 'running';
  const safeDepth = mission.depth || 'standard';
  const safeLanguage = mission.language || 'zh';
  const status = STATUS_CONFIG[safeStatus] ?? STATUS_CONFIG.running;
  const StatusIcon = status.icon;
  const gradient = DEPTH_GRADIENT[safeDepth] ?? DEPTH_GRADIENT.standard;

  const badges: AssetCardBadge[] = [
    {
      key: 'depth',
      label: safeDepth.toUpperCase(),
      className: 'bg-gray-100 text-gray-600 uppercase tracking-wide',
    },
    {
      key: 'language',
      label: safeLanguage,
      className: 'bg-gray-100 text-gray-600',
    },
    {
      key: 'status',
      label: status.label,
      className: status.color,
      icon: (
        <StatusIcon
          className={`h-3 w-3 ${safeStatus === 'running' ? 'animate-spin' : ''}`}
        />
      ),
    },
  ];

  const description = mission.reportSummary
    ? mission.reportSummary
    : mission.errorMessage
      ? mission.errorMessage
      : mission.status === 'running'
        ? 'Mission 进行中…'
        : '暂无报告';

  const stats = [];
  if (mission.tokensUsed != null && mission.tokensUsed > 0) {
    stats.push({
      key: 'tokens',
      icon: <Coins className="h-3.5 w-3.5" />,
      text:
        mission.tokensUsed >= 1000
          ? `${(mission.tokensUsed / 1000).toFixed(1)}k tk`
          : `${mission.tokensUsed} tk`,
    });
  }
  if (mission.finalScore != null) {
    stats.push({
      key: 'score',
      icon: <Trophy className="h-3.5 w-3.5" />,
      text: (
        <span
          className={
            mission.finalScore >= 80
              ? 'text-emerald-600'
              : mission.finalScore >= 60
                ? 'text-amber-600'
                : 'text-red-600'
          }
        >
          {mission.finalScore} / 100
        </span>
      ),
    });
  }
  if (mission.wallTimeMs != null) {
    stats.push({
      key: 'time',
      icon: <Activity className="h-3.5 w-3.5" />,
      text: `${(mission.wallTimeMs / 1000).toFixed(1)}s`,
    });
  }

  const extraActions: AssetCardAction[] = [
    {
      key: 'rerun',
      title: '重新运行',
      tone: 'info',
      icon: <RefreshCw className="h-4 w-4" />,
      onClick: () => onRerun(mission),
    },
  ];
  if (mission.status === 'running') {
    extraActions.unshift({
      key: 'cancel',
      title: '取消运行',
      tone: 'warning',
      icon: <StopCircle className="h-4 w-4" />,
      onClick: () => onCancel(mission),
    });
  }

  return (
    <AssetCard
      title={mission.topic}
      description={description}
      icon={<Sparkles className="h-6 w-6 text-white" />}
      gradient={gradient}
      badges={badges}
      isOwner
      extraActions={extraActions}
      onEdit={() => onEdit(mission)}
      onDelete={() => onDelete(mission)}
      onClick={onClick}
      stats={stats}
      timestamp={mission.startedAt}
      labels={{ edit: '重命名', delete: '删除' }}
    />
  );
}

// ─── 主组件 ──────────────────────────────────────────────────────────────
export interface MissionGalleryViewProps {
  /** Header 标题（"Agent Playground" / agent.displayName） */
  title: string;
  /** Header 副标题 */
  subtitle: string;
  /** Header icon 渐变（默认 violet→purple） */
  iconGradient?: string;
  /** "新建 Mission" 按钮文案 */
  createButtonLabel?: string;
  /** 点 "新建 Mission" 触发 */
  onCreateMission: () => void;
  /** 数据源：返回 mission 列表 */
  fetchMissions: () => Promise<MissionListItem[]>;
  /** mission 卡片点击：跳详情 */
  onMissionClick: (mission: MissionListItem) => void;
  /** 重跑 / 取消 / 重命名 / 删除 callback */
  onRerun: (mission: MissionListItem) => Promise<void> | void;
  onCancel: (mission: MissionListItem) => Promise<void> | void;
  onEdit: (mission: MissionListItem) => Promise<void> | void;
  onDelete: (mission: MissionListItem) => Promise<void> | void;
  /** Empty state 文案 */
  emptyState?: {
    title: string;
    hint: string;
    ctaLabel: string;
  };
  /** 列表为空时显示给用户的 "用什么标签搜索" 占位（默认按 topic / 报告内容搜） */
  searchPlaceholder?: string;
  /** 强制 reload 触发器（外部 inc 后组件 re-fetch）*/
  reloadKey?: number;
}

export function MissionGalleryView({
  title,
  subtitle,
  iconGradient = 'from-violet-500 to-purple-600',
  createButtonLabel = '新建 Mission',
  onCreateMission,
  fetchMissions,
  onMissionClick,
  onRerun,
  onCancel,
  onEdit,
  onDelete,
  emptyState,
  searchPlaceholder = '按 topic 或报告内容搜索…',
  reloadKey = 0,
}: MissionGalleryViewProps) {
  const [missions, setMissions] = useState<MissionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [internalReload, setInternalReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMissions()
      .then((items) => {
        if (!cancelled) {
          setMissions(items);
          setError(null);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fetchMissions, reloadKey, internalReload]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return missions;
    const q = searchQuery.toLowerCase();
    return missions.filter(
      (m) =>
        m.topic.toLowerCase().includes(q) ||
        m.reportSummary?.toLowerCase().includes(q) ||
        m.reportTitle?.toLowerCase().includes(q)
    );
  }, [missions, searchQuery]);

  const triggerReload = () => setInternalReload((n) => n + 1);

  const wrapAction =
    (fn: (m: MissionListItem) => Promise<void> | void) =>
    async (m: MissionListItem) => {
      await fn(m);
      triggerReload();
    };

  const handleRerun = wrapAction(onRerun);
  const handleCancel = wrapAction(onCancel);
  const handleEdit = wrapAction(onEdit);
  const handleDelete = wrapAction(onDelete);

  return (
    <div className="h-full overflow-auto bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/50 backdrop-blur-sm">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div
                className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${iconGradient} shadow-lg shadow-violet-500/25`}
              >
                <Sparkles className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
                <p className="text-sm text-gray-500">{subtitle}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onCreateMission}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-500/25 transition-all hover:shadow-xl hover:shadow-violet-500/30"
              >
                <PlusIcon className="h-5 w-5" />
                {createButtonLabel}
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="mt-6">
            <div className="relative">
              <SearchIcon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-4 text-sm outline-none transition-all focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-8 py-6">
        {loading ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center">
            <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin text-gray-400" />
            <p className="text-sm text-gray-500">加载 mission 历史…</p>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            加载失败：{error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center">
            <Sparkles className="mx-auto mb-3 h-10 w-10 text-violet-300" />
            <h3 className="text-lg font-semibold text-gray-900">
              {missions.length === 0
                ? (emptyState?.title ?? '还没有 Mission')
                : '没有匹配项'}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {missions.length === 0
                ? (emptyState?.hint ??
                  '基于 Harness runtime 启动你的第一个研究 mission')
                : '换个关键字试试'}
            </p>
            {missions.length === 0 && (
              <button
                type="button"
                onClick={onCreateMission}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-500/25"
              >
                <PlusIcon className="h-5 w-5" />
                {emptyState?.ctaLabel ?? '启动研究 Mission'}
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-base font-semibold text-gray-900">
                {searchQuery ? '搜索结果' : '我的 Mission'}
              </h2>
              <span className="text-xs text-gray-500">
                共 {filtered.length} 个
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((m) => (
                <MissionCard
                  key={m.id}
                  mission={m}
                  onClick={() => onMissionClick(m)}
                  onRerun={(mm) => void handleRerun(mm)}
                  onCancel={(mm) => void handleCancel(mm)}
                  onEdit={(mm) => void handleEdit(mm)}
                  onDelete={(mm) => void handleDelete(mm)}
                />
              ))}
              <button
                type="button"
                onClick={onCreateMission}
                className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white p-6 transition-colors hover:border-violet-400 hover:bg-violet-50"
              >
                <PlusIcon className="h-10 w-10 text-gray-400" />
                <span className="mt-2 text-sm font-medium text-gray-600">
                  {createButtonLabel}
                </span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
