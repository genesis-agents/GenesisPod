'use client';

/**
 * /custom-agents/[id]  (R-CA 2026-05-05)
 *
 * 每个 published custom agent 自己的主页 —— 与 Playground 主页风格 100% 一致
 * （共享 MissionGalleryView 组件），但只展示用此 agent 启动过的 mission。
 *
 * - title = agent.displayName
 * - subtitle = agent.purpose
 * - 数据源 = listCustomAgentMissions(id)（custom_agent_launches join playground mission）
 * - "启动 Mission" → /custom-agents/:id/run（既有 topic 输入 + 启动页）
 * - rerun / cancel / edit / delete 复用 playground mission API（mission 本身就是 playground mission）
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  deleteMission,
  updateMission,
  setVisibility,
  type MissionListItem,
} from '@/services/agent-playground/api';
import { listCustomAgentMissions } from '@/services/custom-agents/api';
import { apiClient } from '@/lib/api/client';
import type { CustomAgentRecord } from '@/components/custom-agents/types';
import { LaunchMissionModal } from '@/components/custom-agents/LaunchMissionModal';
import { MissionGalleryView } from '@/components/common/missions/MissionGalleryView';

export default function CustomAgentHomePage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  // Next.js 14 + React 18：params 是同步对象，直接取 id。
  // 历史误区：旧代码用 `use(params)` 或 `params.then(...)`，都基于
  // "params 是 Promise" 的错误前提（那是 Next.js 15 的约定），在 Next 14
  // 必然抛 "c.then is not a function"，整页落 ErrorBoundary。
  const { id } = params;
  const [agent, setAgent] = useState<CustomAgentRecord | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [agentNotFound, setAgentNotFound] = useState(false);
  const [agentLoading, setAgentLoading] = useState(true);
  // ★ R-CA 风险#4 清零：Modal 内联启动，不跳 /run
  const [launchOpen, setLaunchOpen] = useState(false);
  // gallery reload trigger（launch 成功 / rerun 成功后 inc）
  const [galleryReloadKey, setGalleryReloadKey] = useState(0);
  const triggerGalleryReload = () => setGalleryReloadKey((n) => n + 1);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setAgentLoading(true);
    setAgentNotFound(false);
    apiClient
      .get<CustomAgentRecord>(`/user/custom-agents/${id}`)
      .then((data) => {
        if (!cancelled) {
          setAgent(data);
          setAgentError(null);
          setAgentLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          // 404 → friendly not-found UI（Sidebar stale 缓存指向已删 agent 时的兜底）
          const status = (e as { status?: number } | undefined)?.status;
          if (status === 404) {
            setAgentNotFound(true);
          } else {
            setAgentError(e instanceof Error ? e.message : String(e));
          }
          setAgentLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // fetchMissions 必须 stable reference 否则 MissionGalleryView useEffect 死循环
  const fetchMissions = useCallback(() => listCustomAgentMissions(id), [id]);

  const handleEdit = async (mission: MissionListItem) => {
    // eslint-disable-next-line no-alert
    const next = window.prompt('重命名 Mission topic：', mission.topic);
    if (!next || !next.trim() || next === mission.topic) return;
    try {
      await updateMission(mission.id, { topic: next.trim() });
    } catch (e) {
      alert(`重命名失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleDelete = async (mission: MissionListItem) => {
    if (!confirm(`确定删除「${mission.topic}」？此操作不可恢复。`)) return;
    try {
      await deleteMission(mission.id);
    } catch (e) {
      alert(`删除失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleVisibilityChange = async (
    mission: MissionListItem,
    next: 'PRIVATE' | 'SHARED' | 'PUBLIC'
  ) => {
    try {
      await setVisibility(mission.id, next);
      triggerGalleryReload();
    } catch (e) {
      alert(`切换权限失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  if (agentLoading) {
    return (
      <div className="h-full overflow-auto bg-gray-50 px-8 py-6">
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
          加载 agent 信息…
        </div>
      </div>
    );
  }
  if (agentNotFound) {
    return (
      <div className="h-full overflow-auto bg-gray-50 px-8 py-6">
        <div className="mx-auto max-w-lg rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <h2 className="text-lg font-semibold text-amber-900">
            Agent 不存在或已删除
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            这个 agent 可能已被删除或归档。请前往「管理 Agent」选择有效的
            agent。
          </p>
          <button
            type="button"
            onClick={() => router.push('/me/agents')}
            className="mt-4 inline-flex items-center rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
          >
            管理 Agent
          </button>
        </div>
      </div>
    );
  }
  if (agentError || !agent) {
    return (
      <div className="h-full overflow-auto bg-gray-50 px-8 py-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          加载 agent 失败：{agentError ?? '未知错误'}
        </div>
      </div>
    );
  }

  const purpose = agent.config?.basicInfo?.purpose;

  return (
    <>
      <MissionGalleryView
        title={agent.displayName}
        subtitle={
          purpose ? purpose : `自定义 Agent · ${agent.slug} · v${agent.version}`
        }
        iconGradient="from-rose-500 to-pink-600"
        iconShadowClass="shadow-rose-500/25"
        createButtonLabel="启动 Mission"
        // ★ R-CA 风险#4 清零：内联 Modal 启动，不跳 /run 独立页
        onCreateMission={() => setLaunchOpen(true)}
        fetchMissions={fetchMissions}
        onMissionClick={(m) => router.push(`/agent-playground/team/${m.id}`)}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onVisibilityChange={(m, next) => void handleVisibilityChange(m, next)}
        emptyState={{
          title: '还没用这个 Agent 启动过 Mission',
          hint: `点击「启动 Mission」用「${agent.displayName}」做你的第一次研究`,
          ctaLabel: '启动 Mission',
        }}
        searchPlaceholder={`在「${agent.displayName}」的 Mission 历史中搜索…`}
        reloadKey={galleryReloadKey}
      />
      <LaunchMissionModal
        agent={agent}
        open={launchOpen}
        onClose={() => setLaunchOpen(false)}
        onLaunched={() => triggerGalleryReload()}
      />
    </>
  );
}
