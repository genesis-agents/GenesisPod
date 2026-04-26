'use client';

/**
 * Agent Playground Index Page — 完全照搬 ai-insights 主页结构
 *
 * - sticky header with gradient icon + title + subtitle + actions
 * - search bar (gens.team style)
 * - mission card grid (mirror TopicCard 风格)
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n';
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  XCircle,
  Activity,
  Coins,
  Trophy,
} from 'lucide-react';
import { listMissions, type MissionListItem } from '@/lib/api/agent-playground';
import { AssetCard, type AssetCardBadge } from '@/components/common/asset-card';

// Status visual config — TI style
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
  failed: {
    label: '失败',
    color: 'bg-red-50 text-red-700',
    icon: XCircle,
  },
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
};

const DEPTH_GRADIENT: Record<string, string> = {
  quick: 'from-emerald-500 to-teal-600',
  standard: 'from-violet-500 to-purple-600',
  deep: 'from-rose-500 to-pink-600',
};

function MissionCard({
  mission,
  onClick,
}: {
  mission: MissionListItem;
  onClick: () => void;
}) {
  const status = STATUS_CONFIG[mission.status] ?? STATUS_CONFIG.running;
  const StatusIcon = status.icon;
  const gradient = DEPTH_GRADIENT[mission.depth] ?? DEPTH_GRADIENT.standard;

  const badges: AssetCardBadge[] = [
    {
      key: 'depth',
      label: mission.depth.toUpperCase(),
      className: 'bg-gray-100 text-gray-600 uppercase tracking-wide',
    },
    {
      key: 'language',
      label: mission.language,
      className: 'bg-gray-100 text-gray-600',
    },
    {
      key: 'status',
      label: status.label,
      className: status.color,
      icon: (
        <StatusIcon
          className={`h-3 w-3 ${mission.status === 'running' ? 'animate-spin' : ''}`}
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

  return (
    <AssetCard
      title={mission.topic}
      description={description}
      icon={<Sparkles className="h-6 w-6 text-white" />}
      gradient={gradient}
      badges={badges}
      onClick={onClick}
      stats={stats}
      timestamp={mission.startedAt}
    />
  );
}

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

export default function PlaygroundIndexPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [missions, setMissions] = useState<MissionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listMissions()
      .then((items) => {
        if (!cancelled) {
          setMissions(items);
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
  }, []);

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

  return (
    <div className="h-full overflow-auto bg-gray-50">
      {/* Header — 完全照搬 ai-insights/page.tsx 结构 */}
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/50 backdrop-blur-sm">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/25">
                <Sparkles className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {t('nav.playground') || 'Agent Playground'}
                </h1>
                <p className="text-sm text-gray-500">
                  基于 Harness runtime 的多智能体协作演示
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.push('/agent-playground/research-team')}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-500/25 transition-all hover:shadow-xl hover:shadow-violet-500/30"
              >
                <PlusIcon className="h-5 w-5" />
                新建 Mission
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
                placeholder="按 topic 或报告内容搜索…"
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
              {missions.length === 0 ? '还没有 Mission' : '没有匹配项'}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {missions.length === 0
                ? '基于 Harness runtime 启动你的第一个研究 mission'
                : '换个关键字试试'}
            </p>
            {missions.length === 0 && (
              <button
                type="button"
                onClick={() => router.push('/agent-playground/research-team')}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-500/25"
              >
                <PlusIcon className="h-5 w-5" />
                启动研究 Mission
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
                  onClick={() =>
                    router.push(`/agent-playground/research-team/${m.id}`)
                  }
                />
              ))}

              {/* Create New Card — TI 风格末尾 dashed 占位 */}
              <button
                type="button"
                onClick={() => router.push('/agent-playground/research-team')}
                className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white p-6 transition-colors hover:border-violet-400 hover:bg-violet-50"
              >
                <PlusIcon className="h-10 w-10 text-gray-400" />
                <span className="mt-2 text-sm font-medium text-gray-600">
                  新建一个 Mission
                </span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
