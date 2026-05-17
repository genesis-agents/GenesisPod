'use client';

/**
 * ContentDetailDrawer —— 内容详情抽屉（PR-4 UI 候选 A 核心组件）
 *
 * 替代旧 MissionsTab 长表单 + ContentsTab 旧 publish modal 的双轨入口。
 * Row 点开 → 右 480px slide-over，三段：
 *   1. 状态段：内容元信息 + 当前 status
 *   2. 发布表单：平台多选 + 智能档位（业务化文案）+ advanced budget 折叠
 *   3. 进度时间线：mission 启动后实时事件流（WebSocket）
 *
 * 设计稿：docs/architecture/ai-app/social/ui-redesign-2026-05-17.md 候选 A
 * 单源后端：runSocialMission (POST /ai-social/mission/run)，按 depth 派 13/4 stage pipeline
 */

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Loader2,
  PlayCircle,
  Rocket,
  Settings2,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  runSocialMission,
  type SocialContent,
  type SocialPlatformConnection,
  type SocialPlatformType,
} from '@/services/ai-social/api';
import { useSocialMissionStream } from '@/hooks/useSocialMissionStream';

type Depth = 'quick' | 'standard' | 'deep';
type BudgetProfile = 'lean' | 'standard' | 'rich';

const PLATFORM_LABEL: Record<SocialPlatformType, string> = {
  WECHAT_MP: '微信公众号',
  XIAOHONGSHU: '小红书',
};

/**
 * 业务化档位文案（PR-5 i18n 痛点 5 修复）：
 * 用户不需要看到 "quick · 15 min"，他们想知道 "AI 改不改写、要花多久"
 */
const DEPTH_OPTIONS: Array<{
  value: Depth;
  label: string;
  hint: string;
  icon: JSX.Element;
}> = [
  {
    value: 'quick',
    label: '快速发',
    hint: '原文不改写 · 1-3 分钟',
    icon: <Zap className="h-3.5 w-3.5" />,
  },
  {
    value: 'standard',
    label: '标准发',
    hint: 'AI 优化标题封面 · 5-15 分钟',
    icon: <Rocket className="h-3.5 w-3.5" />,
  },
  {
    value: 'deep',
    label: '深度发',
    hint: '正文重写 + 多平台适配 · 10-30 分钟',
    icon: <Settings2 className="h-3.5 w-3.5" />,
  },
];

const BUDGET_OPTIONS: Array<{
  value: BudgetProfile;
  label: string;
}> = [
  { value: 'lean', label: '省（自动跳过非必要 LLM 调用）' },
  { value: 'standard', label: '标准（按需调用）' },
  { value: 'rich', label: '丰（多路并发 + 重写多版本）' },
];

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  DRAFT: { label: '草稿', color: 'bg-gray-100 text-gray-700' },
  PENDING: { label: '待发布', color: 'bg-amber-50 text-amber-700' },
  SCHEDULED: { label: '已排期', color: 'bg-blue-50 text-blue-700' },
  PUBLISHED: { label: '已发布', color: 'bg-emerald-50 text-emerald-700' },
  FAILED: { label: '失败', color: 'bg-red-50 text-red-700' },
  ARCHIVED: { label: '已归档', color: 'bg-gray-100 text-gray-500' },
};

interface ContentDetailDrawerProps {
  content: SocialContent;
  connections: SocialPlatformConnection[];
  onClose: () => void;
  /** mission 启动成功后回调（用于触发列表刷新） */
  onMissionStarted?: (missionId: string) => void;
}

export default function ContentDetailDrawer({
  content,
  connections,
  onClose,
  onMissionStarted,
}: ContentDetailDrawerProps) {
  const platformToConnectionId = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of connections) if (c.isActive) m[c.platformType] = c.id;
    return m;
  }, [connections]);

  const availablePlatforms = useMemo(
    () => connections.filter((c) => c.isActive).map((c) => c.platformType),
    [connections]
  );

  // 平台初始：内容原有 connection 对应的平台（如果有）
  const initialPlatform = useMemo<SocialPlatformType[]>(() => {
    if (content.connection?.platformType) {
      return [content.connection.platformType];
    }
    return [];
  }, [content.connection]);

  const [selectedPlatforms, setSelectedPlatforms] =
    useState<SocialPlatformType[]>(initialPlatform);
  const [depth, setDepth] = useState<Depth>('quick'); // PR-4 默认 quick（4-stage fast pipeline）
  const [budgetProfile, setBudgetProfile] = useState<BudgetProfile>('lean');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [currentMissionId, setCurrentMissionId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const canStart =
    selectedPlatforms.length > 0 &&
    selectedPlatforms.every((p) => platformToConnectionId[p]) &&
    !starting;

  const togglePlatform = (p: SocialPlatformType) => {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  const handleStart = async () => {
    if (!canStart) return;
    setStarting(true);
    setStartError(null);
    try {
      const resp = await runSocialMission({
        contentId: content.id,
        platforms: selectedPlatforms,
        connectionIds: Object.fromEntries(
          selectedPlatforms.map((p) => [p, platformToConnectionId[p]])
        ),
        depth,
        budgetProfile,
        language: 'zh-CN',
      });
      setCurrentMissionId(resp.missionId);
      onMissionStarted?.(resp.missionId);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  };

  const statusBadge = STATUS_BADGE[content.status] ?? {
    label: content.status,
    color: 'bg-gray-100 text-gray-700',
  };

  return (
    <div
      role="dialog"
      aria-label="内容发布详情"
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col border-l border-gray-200 bg-white shadow-2xl"
    >
      {/* Header */}
      <header className="border-b border-gray-100 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-rose-500">
              内容详情
            </div>
            <h3 className="truncate text-base font-semibold text-gray-900">
              {content.title}
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              {content.contentType === 'WECHAT_ARTICLE' ? '长文' : '笔记'}
              {' · '}
              {new Date(content.createdAt ?? Date.now()).toLocaleString(
                'zh-CN',
                {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 状态段 */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge.color}`}
          >
            {statusBadge.label}
          </span>
          {content.connection?.platformType && (
            <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-0.5 text-xs text-gray-600">
              {PLATFORM_LABEL[content.connection.platformType] ??
                content.connection.platformType}
              {content.connection.accountName
                ? ` · ${content.connection.accountName}`
                : ''}
            </span>
          )}
          {content.externalUrl && (
            <a
              href={content.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-100"
            >
              <ExternalLink className="h-3 w-3" />
              查看已发布
            </a>
          )}
        </div>
      </header>

      {/* 滚动内容区 */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* 发布表单 */}
        <section className="mb-6">
          <h4 className="mb-3 text-sm font-semibold text-gray-900">发布到</h4>

          {availablePlatforms.length === 0 ? (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
              暂无已连接的平台。请先在
              <a
                href="/ai-social/connections"
                className="ml-1 underline hover:no-underline"
              >
                连接管理
              </a>
              绑定账号。
            </div>
          ) : (
            <div className="mb-4 flex flex-wrap gap-2">
              {availablePlatforms.map((p) => {
                const selected = selectedPlatforms.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePlatform(p)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                      selected
                        ? 'border-rose-500 bg-rose-50 text-rose-700'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {PLATFORM_LABEL[p] ?? p}
                  </button>
                );
              })}
            </div>
          )}

          {/* 智能档位（业务化文案，痛点 5 修复） */}
          <div className="mb-3 space-y-1.5">
            {DEPTH_OPTIONS.map((opt) => {
              const selected = depth === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDepth(opt.value)}
                  className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    selected
                      ? 'border-rose-500 bg-rose-50/50'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${
                      selected
                        ? 'bg-rose-500 text-white'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {opt.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-sm font-medium ${
                        selected ? 'text-rose-700' : 'text-gray-900'
                      }`}
                    >
                      {opt.label}
                    </span>
                    <span className="block text-xs text-gray-500">
                      {opt.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Advanced 折叠：预算档位（痛点 5：高级用户才看 budget） */}
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="mb-2 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            {showAdvanced ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            高级（预算控制）
          </button>
          {showAdvanced && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
              <div className="mb-2 text-xs font-medium text-gray-700">
                预算档位
              </div>
              <div className="space-y-1">
                {BUDGET_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs text-gray-700 hover:bg-white"
                  >
                    <input
                      type="radio"
                      name="budgetProfile"
                      value={opt.value}
                      checked={budgetProfile === opt.value}
                      onChange={() => setBudgetProfile(opt.value)}
                      className="h-3.5 w-3.5 accent-rose-500"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={!canStart}
            onClick={handleStart}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-500/25 transition-all hover:shadow-xl hover:shadow-rose-500/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {starting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="h-4 w-4" />
            )}
            {starting ? '启动中…' : '发起发布'}
          </button>

          {startError && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{startError}</span>
            </div>
          )}
        </section>

        {/* 进度时间线段 */}
        {currentMissionId && (
          <section className="mb-2">
            <div className="mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-rose-500" />
              <h4 className="text-sm font-semibold text-gray-900">发布进度</h4>
            </div>
            <MissionEventLog missionId={currentMissionId} />
          </section>
        )}
      </div>
    </div>
  );
}

interface EventPayload {
  status?: string;
  stage?: string;
  stepId?: string;
  message?: string;
  text?: string;
  role?: string;
  tag?: string;
  failureCode?: string;
  publishedCount?: number;
  wallTimeMs?: number;
}

function MissionEventLog({ missionId }: { missionId: string }) {
  const { events, connState, error } = useSocialMissionStream(missionId);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="font-mono text-xs text-gray-500">
          {missionId.slice(0, 18)}…
        </div>
        <span
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            connState === 'live'
              ? 'bg-emerald-50 text-emerald-700'
              : connState === 'connecting'
                ? 'bg-amber-50 text-amber-700'
                : 'bg-gray-100 text-gray-500'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              connState === 'live'
                ? 'animate-pulse bg-emerald-500'
                : connState === 'connecting'
                  ? 'bg-amber-500'
                  : 'bg-gray-400'
            }`}
          />
          {connState}
        </span>
      </div>

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="font-mono max-h-72 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs">
        {events.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-gray-400">
            等待事件…
          </div>
        ) : (
          <ul className="space-y-1.5">
            {events.map((e, idx) => (
              <EventLine
                key={`${e.timestamp}-${idx}`}
                type={e.type}
                payload={e.payload as EventPayload}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EventLine({ type, payload }: { type: string; payload: EventPayload }) {
  const isMissionCompleted = type === 'social.mission:completed';
  const isMissionFailed = type === 'social.mission:failed';
  const isMissionAborted = type === 'social.mission:aborted';
  const isStageLifecycle = type === 'social.stage:lifecycle';
  const isNarrative = type === 'social.agent:narrative';

  let icon = <Clock className="h-3.5 w-3.5 text-gray-400" />;
  let color = 'text-gray-700';

  if (isMissionCompleted) {
    icon = <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    color = 'text-emerald-700';
  } else if (isMissionFailed) {
    icon = <XCircle className="h-3.5 w-3.5 text-red-500" />;
    color = 'text-red-700';
  } else if (isMissionAborted) {
    icon = <AlertCircle className="h-3.5 w-3.5 text-amber-500" />;
    color = 'text-amber-700';
  } else if (isStageLifecycle && payload.status === 'completed') {
    icon = <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    color = 'text-emerald-700';
  } else if (isStageLifecycle && payload.status === 'failed') {
    icon = <XCircle className="h-3.5 w-3.5 text-red-500" />;
    color = 'text-red-700';
  }

  const text =
    isNarrative && payload.text
      ? payload.text
      : isStageLifecycle
        ? `${payload.stepId} · ${payload.status}`
        : isMissionCompleted
          ? `发布完成 · ${payload.publishedCount ?? 0} 平台 · ${
              payload.wallTimeMs ? (payload.wallTimeMs / 1000).toFixed(1) : '?'
            }s`
          : isMissionFailed
            ? `发布失败 · ${payload.failureCode ?? 'UNKNOWN'} · ${
                payload.message ?? ''
              }`
            : type.replace(/^social\./, '');

  return (
    <li className={`flex items-start gap-2 ${color}`}>
      {icon}
      <span className="break-all">{text}</span>
    </li>
  );
}
