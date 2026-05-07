'use client';

/**
 * Agent Playground Index Page
 *
 * 2026-05-05 R-CA: 重构为 MissionGalleryView 公共组件的薄壳。
 * UI 不变；与 /custom-agents/:id 主页（每个用户自定义 agent 自己的主页）共用同一组件。
 */

import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n';
import {
  listMissions,
  rerunMissionWithIntent,
  cancelMission,
  deleteMission,
  updateMission,
  type MissionListItem,
} from '@/services/agent-playground/api';
import { MissionGalleryView } from '@/components/missions/MissionGalleryView';

export default function PlaygroundIndexPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const handleRerun = async (mission: MissionListItem) => {
    if (!confirm(`重新运行「${mission.topic}」？将创建一个新的 Mission。`)) {
      return;
    }
    try {
      // PR-8 v1.6 D5：列表快捷重跑 = fresh-research 意图（创建新 mission，原 mission 保留）
      // 单源端口（与 mission detail 重跑 modal 共用 rerunMissionWithIntent）。
      const result = await rerunMissionWithIntent(mission.id, 'fresh-research');
      router.push(`/agent-playground/team/${result.runMissionId}`);
    } catch (e) {
      alert(`Rerun 失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleCancel = async (mission: MissionListItem) => {
    if (!confirm(`取消「${mission.topic}」运行？`)) return;
    try {
      await cancelMission(mission.id);
    } catch (e) {
      alert(`取消失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

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

  return (
    <MissionGalleryView
      title={t('nav.playground') || 'Agent Playground'}
      subtitle="基于 Harness runtime 的多智能体协作演示"
      iconGradient="from-violet-500 to-purple-600"
      createButtonLabel="新建 Mission"
      onCreateMission={() => router.push('/agent-playground/team')}
      fetchMissions={listMissions}
      onMissionClick={(m) => router.push(`/agent-playground/team/${m.id}`)}
      onRerun={handleRerun}
      onCancel={handleCancel}
      onEdit={handleEdit}
      onDelete={handleDelete}
      emptyState={{
        title: '还没有 Mission',
        hint: '基于 Harness runtime 启动你的第一个研究 mission',
        ctaLabel: '启动研究 Mission',
      }}
    />
  );
}
