'use client';

/**
 * Agent Playground Index Page
 *
 * 2026-05-05 R-CA: 重构为 MissionGalleryView 公共组件的薄壳。
 * 2026-05-10: 创建入口由 /agent-playground/team 全页 launcher 改为内联 modal
 *             （PlaygroundMissionDialog + 共享 MissionDialogShell），与 Topic
 *             Insight / Custom Agents 视觉一致。
 */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n';
import {
  listMissions,
  listResumableMissions,
  rerunMission,
  cancelMission,
  deleteMission,
  updateMission,
  type MissionListItem,
} from '@/services/agent-playground/api';
import { MissionGalleryView } from '@/components/missions/MissionGalleryView';
import { PlaygroundMissionDialog } from '@/components/agent-playground';

export default function PlaygroundIndexPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [galleryReloadKey, setGalleryReloadKey] = useState(0);

  const fetchResumableIds = useCallback(async (): Promise<Set<string>> => {
    const items = await listResumableMissions();
    return new Set(items.map((i) => i.missionId));
  }, []);

  const handleRerun = async (mission: MissionListItem) => {
    if (
      !confirm(
        `重新运行「${mission.topic}」？将从头创建一个新的 Mission（清 checkpoint）。`
      )
    ) {
      return;
    }
    try {
      const result = await rerunMission(mission.id, 'fresh');
      router.push(`/agent-playground/team/${result.missionId}`);
    } catch (e) {
      alert(`Rerun 失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleResume = async (mission: MissionListItem) => {
    if (
      !confirm(
        `从 checkpoint 继续「${mission.topic}」？将跳过已完成 stage，复用上次进度。`
      )
    ) {
      return;
    }
    try {
      const result = await rerunMission(mission.id, 'incremental');
      router.push(`/agent-playground/team/${result.missionId}`);
    } catch (e) {
      alert(`继续失败：${e instanceof Error ? e.message : String(e)}`);
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
    <>
      <MissionGalleryView
        title={t('nav.playground') || 'Agent Playground'}
        subtitle="基于 Harness runtime 的多智能体协作演示"
        iconGradient="from-violet-500 to-purple-600"
        createButtonLabel="新建 Mission"
        onCreateMission={() => setCreateOpen(true)}
        fetchMissions={listMissions}
        fetchResumableIds={fetchResumableIds}
        onMissionClick={(m) => router.push(`/agent-playground/team/${m.id}`)}
        onRerun={handleRerun}
        onResume={handleResume}
        onCancel={handleCancel}
        onEdit={handleEdit}
        onDelete={handleDelete}
        reloadKey={galleryReloadKey}
        emptyState={{
          title: '还没有 Mission',
          hint: '基于 Harness runtime 启动你的第一个研究 mission',
          ctaLabel: '启动研究 Mission',
        }}
      />
      <PlaygroundMissionDialog
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(missionId) => {
          setGalleryReloadKey((n) => n + 1);
          router.push(`/agent-playground/team/${missionId}`);
        }}
      />
    </>
  );
}
