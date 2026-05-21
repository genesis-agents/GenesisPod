/**
 * deriveSocialView — social mission 事件 → social 视图（纯函数，可重放幂等）。
 *
 * social 不是 research：用它自己的 12-13 阶段流水线当任务分解（业务定内容），
 * 不复用 agent-playground 的 research 专属 deriveView（维度/researcher）。
 * 渲染由 SocialMissionPage 用 canonical 原语（DataTable/卡片）完成（平台定风格）。
 *
 * 消费事件（namespace 剥离后）：
 *   - stage:lifecycle  { stepId, status: started|completed|failed, primitive?, error? }
 *   - mission:completed / mission:failed / mission:aborted
 */

import type { MissionEvent } from '@/hooks/features/useMissionStream';

export type SocialStageStatus = 'pending' | 'running' | 'done' | 'failed';
export type SocialMissionStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';
export type SocialRoleStatus = 'idle' | 'working' | 'done' | 'failed';

export interface SocialStageView {
  stepId: string;
  label: string;
  /** 一句说明（该阶段做什么）*/
  desc?: string;
  role?: string;
  status: SocialStageStatus;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface SocialRoleView {
  role: string;
  label: string;
  status: SocialRoleStatus;
}

export interface SocialMissionView {
  status: SocialMissionStatus;
  startedAt?: number;
  completedAt?: number;
  failedAt?: number;
  failedMessage?: string;
  cancelledAt?: number;
  progress: { done: number; total: number };
  stages: SocialStageView[];
  roles: SocialRoleView[];
}

/** stepId → 中文 label + 角色 + 一句说明（与后端 13 阶段对齐；未知 stepId 走 humanize 兜底） */
const STEP_META: Record<
  string,
  { label: string; role?: string; desc?: string }
> = {
  's1-mission-budget-eval': { label: '预算评估', role: 'Steward', desc: '评估预算与配额闸门' }, // prettier-ignore
  's2-platform-probe': { label: '平台探测', role: 'PlatformProbe', desc: '探测目标平台规则与限制' }, // prettier-ignore
  's3-content-transform': { label: '内容转换', role: 'ContentTransformer', desc: '把素材改写适配各平台' }, // prettier-ignore
  's4-leader-assess-transform': { label: 'Leader 评估', role: 'Leader', desc: 'Leader 审核转换结果' }, // prettier-ignore
  's5-cover-craft': {
    label: '封面制作',
    role: 'CoverArtist',
    desc: '生成封面图',
  },
  's6-body-compose': { label: '正文撰写', role: 'Composer', desc: '编排正文 HTML/排版' }, // prettier-ignore
  's7-polish-review': { label: '润色审核', role: 'PolishReviewer', desc: '润色 + 质量复审' }, // prettier-ignore
  's8-publish-execute': { label: '发布执行', role: 'PublishExecutor', desc: '推送到平台草稿箱' }, // prettier-ignore
  's8b-publish-retry': { label: '发布重试', role: 'PublishExecutor', desc: '发布失败后重试' }, // prettier-ignore
  's9-publish-verify': { label: '发布验证', role: 'PublishVerifier', desc: '验证发布结果' }, // prettier-ignore
  's10-leader-signoff': { label: 'Leader 签收', role: 'Leader', desc: 'Leader 终审签收' }, // prettier-ignore
  's11-mission-persist': { label: '结果持久化', desc: '落库归档轨迹' },
  's12-self-evolution': { label: '自进化复盘', desc: '复盘与自进化' },
};

const ROLE_LABEL: Record<string, string> = {
  Steward: '预算管家',
  PlatformProbe: '平台探测',
  ContentTransformer: '内容转换',
  Leader: 'Leader',
  CoverArtist: '封面师',
  Composer: '撰稿',
  PolishReviewer: '润色审核',
  PublishExecutor: '发布执行',
  PublishVerifier: '发布验证',
};

function stripNamespace(type: string): string {
  const i = type.indexOf('.');
  return i >= 0 ? type.slice(i + 1) : type;
}

function humanize(stepId: string): string {
  return (
    stepId
      .replace(/^s\d+[a-z]?-/i, '')
      .replace(/-/g, ' ')
      .trim() || stepId
  );
}

export function deriveSocialView(events: MissionEvent[]): SocialMissionView {
  const stageMap = new Map<string, SocialStageView>();

  // 预置全部阶段（pending）——任务列表一开始就是完整列表（而非只有已发事件的几行）；
  // 事件到来后在原位更新状态。
  for (const [stepId, meta] of Object.entries(STEP_META)) {
    stageMap.set(stepId, {
      stepId,
      label: meta.label,
      desc: meta.desc,
      role: meta.role,
      status: 'pending',
    });
  }

  let status: SocialMissionStatus = 'idle';
  let startedAt: number | undefined;
  let completedAt: number | undefined;
  let failedAt: number | undefined;
  let failedMessage: string | undefined;
  let cancelledAt: number | undefined;

  for (const ev of events) {
    const type = stripNamespace(ev.type ?? '');
    const p = (ev.payload ?? {}) as Record<string, unknown>;

    if (type === 'stage:lifecycle') {
      const stepId = String(p.stepId ?? p.stage ?? 'unknown');
      const meta = STEP_META[stepId];
      const primitive =
        typeof p.primitive === 'string' ? p.primitive : undefined;
      // 角色优先用 stepId 映射（语义明确：Steward/PlatformProbe…），
      // primitive 是后端泛值（如 'persist'），仅在无映射时兜底。
      const resolvedRole = meta?.role ?? primitive;
      const stage: SocialStageView = stageMap.get(stepId) ?? {
        stepId,
        label: meta?.label ?? humanize(stepId),
        desc: meta?.desc,
        role: resolvedRole,
        status: 'pending',
      };
      if (resolvedRole) stage.role = resolvedRole;

      const evStatus = String(p.status ?? '');
      if (evStatus === 'started') {
        if (stage.status !== 'done' && stage.status !== 'failed') {
          stage.status = 'running';
        }
        stage.startedAt = stage.startedAt ?? ev.timestamp;
      } else if (evStatus === 'completed') {
        stage.status = 'done';
        stage.completedAt = ev.timestamp;
      } else if (evStatus === 'failed') {
        stage.status = 'failed';
        stage.completedAt = ev.timestamp;
        stage.error = typeof p.error === 'string' ? p.error : undefined;
      }
      stageMap.set(stepId, stage);

      if (status === 'idle') status = 'running';
      startedAt = startedAt ?? ev.timestamp;
    } else if (type === 'mission:completed') {
      status = 'completed';
      completedAt = ev.timestamp;
    } else if (type === 'mission:failed') {
      status = 'failed';
      failedAt = ev.timestamp;
      failedMessage = typeof p.message === 'string' ? p.message : undefined;
    } else if (type === 'mission:aborted') {
      status = 'cancelled';
      cancelledAt = ev.timestamp;
    }
  }

  const stages = [...stageMap.values()];
  const done = stages.filter((s) => s.status === 'done').length;

  const roleMap = new Map<string, SocialRoleView>();
  for (const s of stages) {
    if (!s.role) continue;
    const role = roleMap.get(s.role) ?? {
      role: s.role,
      label: ROLE_LABEL[s.role] ?? s.role,
      status: 'idle' as SocialRoleStatus,
    };
    if (s.status === 'failed') role.status = 'failed';
    else if (s.status === 'running' && role.status !== 'failed')
      role.status = 'working';
    else if (s.status === 'done' && role.status === 'idle')
      role.status = 'done';
    roleMap.set(s.role, role);
  }

  return {
    status,
    startedAt,
    completedAt,
    failedAt,
    failedMessage,
    cancelledAt,
    progress: { done, total: stages.length },
    stages,
    roles: [...roleMap.values()],
  };
}
