'use client';

/**
 * MissionsTab —— SocialPublishMission（W4 Agent Team）入口
 *
 * UI 流程：
 *   1. 用户选一份 Content（status=PENDING / DRAFT 都允许；列表来自 getContents）
 *   2. 选目标平台（多选；列表来自 getConnections 中已连接的平台）
 *   3. 选 depth / budgetProfile 档位
 *   4. 点 "启动 Mission" → POST /ai-social/mission/run → 拿 missionId
 *   5. 立即订阅 WebSocket social.* 流，左侧 timeline 展示 stage:lifecycle / agent:narrative
 *      / mission:completed / mission:failed 事件
 *
 * v1 只支持单 mission 在场（多 mission 历史列表留 W5+）。
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Rocket,
  Loader2,
  CheckCircle2,
  AlertCircle,
  PlayCircle,
  XCircle,
  Clock,
} from 'lucide-react';
import {
  getConnections,
  getContents,
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

export default function MissionsTab() {
  const [contents, setContents] = useState<SocialContent[]>([]);
  const [connections, setConnections] = useState<SocialPlatformConnection[]>(
    []
  );
  const [loadingContents, setLoadingContents] = useState(true);
  const [loadingConnections, setLoadingConnections] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const resp = (await getContents()) as {
          items?: SocialContent[];
          contents?: SocialContent[];
        };
        setContents(resp.items ?? resp.contents ?? []);
      } catch (err) {
        console.warn('getContents failed:', err);
      } finally {
        setLoadingContents(false);
      }
    })();
    void (async () => {
      try {
        const resp = (await getConnections()) as
          | SocialPlatformConnection[]
          | { connections: SocialPlatformConnection[] };
        const list = Array.isArray(resp) ? resp : (resp.connections ?? []);
        setConnections(list.filter((c) => c.isActive));
      } catch (err) {
        console.warn('getConnections failed:', err);
      } finally {
        setLoadingConnections(false);
      }
    })();
  }, []);

  // ── 表单状态 ────────────────────────────────────────────
  const [selectedContentId, setSelectedContentId] = useState<string>('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<
    SocialPlatformType[]
  >([]);
  const [depth, setDepth] = useState<Depth>('standard');
  const [budgetProfile, setBudgetProfile] = useState<BudgetProfile>('standard');

  // ── mission 启动状态 ────────────────────────────────────
  const [currentMissionId, setCurrentMissionId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const platformToConnectionId = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of connections) m[c.platformType] = c.id;
    return m;
  }, [connections]);

  const availablePlatforms = useMemo(
    () => connections.map((c) => c.platformType),
    [connections]
  );

  const canStart =
    !!selectedContentId &&
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
        contentId: selectedContentId,
        platforms: selectedPlatforms,
        connectionIds: Object.fromEntries(
          selectedPlatforms.map((p) => [p, platformToConnectionId[p]])
        ),
        depth,
        budgetProfile,
        language: 'zh-CN',
      });
      setCurrentMissionId(resp.missionId);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {/* 左：启动表单 */}
      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Rocket className="h-5 w-5 text-rose-500" />
          <h2 className="text-lg font-semibold text-gray-900">启动 Mission</h2>
        </div>

        {/* 内容选择 */}
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            选择内容
          </label>
          {loadingContents ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中…
            </div>
          ) : contents.length === 0 ? (
            <p className="text-sm text-gray-400">
              暂无内容，先到「内容管理」创建一份
            </p>
          ) : (
            <select
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-rose-500 focus:outline-none"
              value={selectedContentId}
              onChange={(e) => setSelectedContentId(e.target.value)}
            >
              <option value="">— 选一份内容 —</option>
              {contents.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title.slice(0, 60)} ({c.status})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* 平台多选 */}
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            目标平台
          </label>
          {loadingConnections ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中…
            </div>
          ) : availablePlatforms.length === 0 ? (
            <p className="text-sm text-gray-400">
              暂无已连接的平台，先到「平台连接」绑定账号
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
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
        </div>

        {/* 档位 */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              质量档位
            </label>
            <select
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-rose-500 focus:outline-none"
              value={depth}
              onChange={(e) => setDepth(e.target.value as Depth)}
            >
              <option value="quick">quick · 15 min</option>
              <option value="standard">standard · 30 min</option>
              <option value="deep">deep · 60 min</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              预算档位
            </label>
            <select
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-rose-500 focus:outline-none"
              value={budgetProfile}
              onChange={(e) =>
                setBudgetProfile(e.target.value as BudgetProfile)
              }
            >
              <option value="lean">lean · 8 USD</option>
              <option value="standard">standard · 20 USD</option>
              <option value="rich">rich · 50 USD</option>
            </select>
          </div>
        </div>

        <button
          type="button"
          disabled={!canStart}
          onClick={handleStart}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-500/25 transition-all hover:shadow-xl hover:shadow-rose-500/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {starting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <PlayCircle className="h-4 w-4" />
          )}
          {starting ? '启动中…' : '启动 Mission'}
        </button>

        {startError && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{startError}</span>
          </div>
        )}
      </section>

      {/* 右：mission 事件流 */}
      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Clock className="h-5 w-5 text-rose-500" />
          <h2 className="text-lg font-semibold text-gray-900">Mission 进度</h2>
        </div>
        {currentMissionId ? (
          <MissionEventLog missionId={currentMissionId} />
        ) : (
          <div className="flex h-48 items-center justify-center text-sm text-gray-400">
            选择内容 + 平台后点「启动 Mission」
          </div>
        )}
      </section>
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

      <div className="font-mono h-72 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs">
        {events.length === 0 ? (
          <div className="flex h-full items-center justify-center text-gray-400">
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
          ? `Mission 完成 · ${payload.publishedCount ?? 0} 平台 PUBLISHED · ${
              payload.wallTimeMs ? (payload.wallTimeMs / 1000).toFixed(1) : '?'
            }s`
          : isMissionFailed
            ? `Mission 失败 · ${payload.failureCode ?? 'UNKNOWN'} · ${payload.message ?? ''}`
            : type.replace(/^social\./, '');

  return (
    <li className={`flex items-start gap-2 ${color}`}>
      {icon}
      <span className="break-all">{text}</span>
    </li>
  );
}
