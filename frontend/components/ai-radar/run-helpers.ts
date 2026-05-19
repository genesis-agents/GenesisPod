/**
 * AI Radar run 详情公用 helpers —— STAGE_GROUPS 定义 + stage 状态计算 +
 * format / status 文案。
 *
 * 由 /ai-radar/topic/[id]/runs/[runId] 页面 和 RunDetailDrawer 共享，
 * 避免 STAGE_GROUPS / stageGroupStatus 在两处复制后 cancelled 修复需要改两处。
 */

import type { RadarRun, RadarRunStatus } from '@/services/ai-radar/types';

// ──────────────────────────────────────────────────────────────────────
// Stage groups (5 visible groups over 8 original stages)
// ──────────────────────────────────────────────────────────────────────

export interface StageGroup {
  id: string;
  label: string;
  hint: string;
  stages: ReadonlyArray<string>;
  stageNumStart: number;
  stageNumEnd: number;
}

export const STAGE_GROUPS: ReadonlyArray<StageGroup> = [
  {
    id: 'collect',
    label: '采集源数据',
    hint: '从每个数据源拉取原始 item（RSS / YouTube / 自定义 URL）',
    stages: ['s1-source-resolve', 's2-collect'],
    stageNumStart: 1,
    stageNumEnd: 2,
  },
  {
    id: 'dedupe',
    label: '去重',
    hint: '相同 URL / 内容哈希的 item 合并，避免重复推送',
    stages: ['s3-dedupe'],
    stageNumStart: 3,
    stageNumEnd: 3,
  },
  {
    id: 'score',
    label: '评分（相关性 + 质量）',
    hint: 'LLM 打两个分：是否相关、质量高低；低分 item 不入候选',
    stages: ['s4-relevance', 's5-quality'],
    stageNumStart: 4,
    stageNumEnd: 5,
  },
  {
    id: 'enrich',
    label: '实体抽取 + 洞察',
    hint: 'LLM 抽出人/公司/产品/事件实体，对照历史生成洞察',
    stages: ['s6-entity', 's7-insight'],
    stageNumStart: 6,
    stageNumEnd: 7,
  },
  {
    id: 'finalize',
    label: '生成精选 + 持久化',
    hint: '从候选挑出 N 条今日精选，写入 daily briefing',
    stages: ['s8-persist'],
    stageNumStart: 8,
    stageNumEnd: 8,
  },
];

export type StageState =
  | 'completed'
  | 'running'
  | 'failed'
  | 'cancelled'
  | 'pending';

/**
 * 计算 stage group 在某次 run 里的视觉状态。
 *
 * - completed: lastCompletedStage >= group.stageNumEnd
 * - running:   run.status==='running' 且 (currentStage 落在 group 内 或 lastDone+1 落在 group 起始)
 * - failed:    run.status==='failed' 且 lastDone+1 落在 group 内（即中断点）
 * - cancelled: run.status==='cancelled' 且 lastDone+1 落在 group 内（中断点视觉同 failed 但配色不同）
 * - pending:   其他
 */
export function stageGroupStatus(
  run: RadarRun,
  group: StageGroup,
  currentStage: string | null
): StageState {
  const lastDone = run.lastCompletedStage ?? 0;
  if (lastDone >= group.stageNumEnd) return 'completed';
  if (run.status === 'failed') {
    if (
      lastDone + 1 >= group.stageNumStart &&
      lastDone + 1 <= group.stageNumEnd
    )
      return 'failed';
    return 'pending';
  }
  if (run.status === 'cancelled') {
    if (
      lastDone + 1 >= group.stageNumStart &&
      lastDone + 1 <= group.stageNumEnd
    )
      return 'cancelled';
    return 'pending';
  }
  if (run.status === 'running') {
    if (currentStage && group.stages.some((s) => currentStage.startsWith(s)))
      return 'running';
    if (
      lastDone < group.stageNumEnd &&
      lastDone + 1 >= group.stageNumStart &&
      lastDone + 1 <= group.stageNumEnd
    )
      return 'running';
  }
  return 'pending';
}

// ──────────────────────────────────────────────────────────────────────
// Format helpers
// ──────────────────────────────────────────────────────────────────────

export function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.floor((ms % 60_000) / 1000);
  return `${min}分${sec}秒`;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  // 避免 toLocaleString —— SSR/CSR hydration 差异
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function statusLabel(s: RadarRunStatus): string {
  switch (s) {
    case 'running':
      return '运行中';
    case 'completed':
      return '已完成';
    case 'failed':
      return '失败';
    case 'cancelled':
      return '已取消';
    case 'rejected':
      return '已拒绝';
  }
}

export function statusBadgeClass(s: RadarRunStatus): string {
  switch (s) {
    case 'running':
      return 'bg-violet-100 text-violet-700 ring-violet-200';
    case 'completed':
      return 'bg-emerald-100 text-emerald-700 ring-emerald-200';
    case 'failed':
      return 'bg-red-100 text-red-700 ring-red-200';
    case 'cancelled':
      return 'bg-slate-100 text-slate-600 ring-slate-200';
    case 'rejected':
      return 'bg-amber-100 text-amber-700 ring-amber-200';
  }
}

export function triggerLabel(t: RadarRun['trigger']): string {
  if (t === 'MANUAL') return '手动';
  if (t === 'SCHEDULED') return '定时';
  return '首次';
}
