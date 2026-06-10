import { describe, it, expect } from 'vitest';
import { buildLegacyDerivedView } from '../useMissionLegacyView';
import type { MissionDetailView } from '@/services/agent-playground/api';
import type { PlaygroundEvent } from '@/hooks/features/useAgentPlaygroundStream';

/**
 * 回归焊死（2026-06-10 playground parity restoration）：
 * 1. 后端 resolvePublicStatus 发 6 值（含 failed/cancelled）——isTerminalFailure
 *    此前只看 failedAt/cancelledAt 时间戳，status='failed' 且无时间戳时
 *    terminal sweep 失效（stage/agent 残留"运行中"）。
 * 2. 能力轨 cost:tick.stage 发 recipe stepId（s3-researcher-collect 等），
 *    必须归一到 5 阶段词表后聚合，否则成本柱图恒 0。
 */

function makeView(
  mission: Record<string, unknown>,
  extra: Record<string, unknown> = {}
): MissionDetailView {
  return {
    mission: {
      id: 'm1',
      status: 'running',
      resumable: false,
      canCancel: false,
      rerunnableStages: [],
      ...mission,
    },
    stages: [],
    agents: [],
    timelineVersion: 1,
    snapshotVersion: 1,
    references: [],
    reportVersions: [],
    ...extra,
  } as unknown as MissionDetailView;
}

function costTick(stage: string, deltaTokens: number): PlaygroundEvent {
  return {
    type: 'playground.cost:tick',
    payload: { stage, deltaTokens, deltaCostUsd: 0.01 },
    timestamp: 1,
  };
}

describe('isTerminalFailure — status 6 值终态判定', () => {
  it("status='failed'（无 failedAt 时间戳）→ running stage 被扫成 failed", () => {
    const view = makeView(
      { status: 'failed' },
      {
        stages: [
          { id: 's3-researcher-collect', label: '采集', status: 'running' },
        ],
      }
    );
    const dv = buildLegacyDerivedView(view, []);
    const researchers = dv.stages.find((s) => s.id === 'researchers');
    expect(researchers?.status).toBe('failed');
  });

  it("status='cancelled'（无 cancelledAt 时间戳）→ running stage 被扫成 failed", () => {
    const view = makeView(
      { status: 'cancelled' },
      {
        stages: [{ id: 's2-leader-plan', label: '规划', status: 'running' }],
      }
    );
    const dv = buildLegacyDerivedView(view, []);
    const leader = dv.stages.find((s) => s.id === 'leader');
    expect(leader?.status).toBe('failed');
  });

  it("status='failed' → running agent 被扫成 failed（不再残留运行中）", () => {
    const view = makeView(
      { status: 'failed' },
      {
        agents: [
          { id: 'researcher#dim-a', role: 'researcher', phase: 'running' },
        ],
      }
    );
    const dv = buildLegacyDerivedView(view, []);
    expect(dv.agents[0]?.phase).toBe('failed');
  });

  it("status='running' 时不误扫（running stage 保持 running）", () => {
    const view = makeView(
      { status: 'running' },
      {
        stages: [
          { id: 's3-researcher-collect', label: '采集', status: 'running' },
        ],
      }
    );
    const dv = buildLegacyDerivedView(view, []);
    const researchers = dv.stages.find((s) => s.id === 'researchers');
    expect(researchers?.status).toBe('running');
  });
});

describe('dvProjectCost byStage — stepId 归一到 5 阶段词表', () => {
  it("stage='s3-researcher-collect' 聚合进「researchers」桶", () => {
    const dv = buildLegacyDerivedView(makeView({}), [
      costTick('s3-researcher-collect', 100),
      costTick('s3-researcher-collect', 50),
    ]);
    expect(dv.cost.byStage).toEqual([
      { stage: 'researchers', tokensUsed: 150, costUsd: 0.02 },
    ]);
  });

  it('s2/s5/s8/s9b 等 stepId 各归一到 leader/analyst/writer/reviewer', () => {
    const dv = buildLegacyDerivedView(makeView({}), [
      costTick('s2-leader-plan', 10),
      costTick('s5-reconciler', 20),
      costTick('s8-writer-draft', 30),
      costTick('s9b-objective-eval', 40),
    ]);
    const byStage = Object.fromEntries(
      dv.cost.byStage.map((b) => [b.stage, b.tokensUsed])
    );
    expect(byStage).toEqual({
      leader: 10,
      analyst: 20,
      writer: 30,
      reviewer: 40,
    });
  });

  it('已是业务词 / 未知值原样保留（基线兼容）', () => {
    const dv = buildLegacyDerivedView(makeView({}), [
      costTick('researchers', 100),
      costTick('reconciler', 5),
    ]);
    const stages = dv.cost.byStage.map((b) => b.stage).sort();
    expect(stages).toEqual(['reconciler', 'researchers']);
  });
});

describe('dvProjectMission — cancelled / quality-failed 原因字段路由', () => {
  it('cancelled mission 写 cancelledMessage（不写 failedMessage，不触发主页红色失败横幅）', () => {
    const view = makeView({
      status: 'cancelled',
      finishedAt: '2026-06-10T00:00:00.000Z',
      failureMessage: '额度耗尽，已自动取消',
    });
    const dv = buildLegacyDerivedView(view, []);
    expect(dv.mission.cancelledMessage).toBe('额度耗尽，已自动取消');
    // 关键：不写 failedMessage，否则主页门控会误判为「Mission 失败」红色横幅
    expect(dv.mission.failedMessage).toBeUndefined();
    expect(dv.mission.cancelledAt).toBeDefined();
  });

  it('quality-failed mission 写 rejectedMessage（主页拒签 amber 横幅门控读它）', () => {
    const view = makeView({
      status: 'quality-failed',
      finishedAt: '2026-06-10T00:00:00.000Z',
      failureMessage: 'Leader 拒签：覆盖度不足',
      failureCode: 'QUALITY_GATE',
    });
    const dv = buildLegacyDerivedView(view, []);
    expect(dv.mission.rejectedMessage).toBe('Leader 拒签：覆盖度不足');
    expect(dv.mission.failedMessage).toBeUndefined();
    // showFailedBanner 门控为 failedMessage ?? rejectedMessage → 此处非空即放行 amber 横幅
    expect(dv.mission.failedMessage ?? dv.mission.rejectedMessage).toBeTruthy();
  });
});

describe('dvProjectStages — skipped 阶段保形（灰色「跳过」拓扑节点的数据源）', () => {
  it('某高层 stage 全部 backend step 为 skipped → stage 状态聚合为 skipped（非绿色 done）', () => {
    const view = makeView(
      { status: 'running' },
      {
        // reviewer = s9-critic + s9b-objective-eval；两者都 skipped → reviewer stage skipped
        stages: [
          { id: 's9-critic', label: '评审', status: 'skipped' },
          { id: 's9b-objective-eval', label: '客观评估', status: 'skipped' },
        ],
      }
    );
    const dv = buildLegacyDerivedView(view, []);
    const reviewer = dv.stages.find((s) => s.id === 'reviewer');
    expect(reviewer?.status).toBe('skipped');
    // 回归焊死：skipped 不得被降格成 'done'（否则拓扑显绿色已完成）
    expect(reviewer?.status).not.toBe('done');
  });

  it('done + skipped 混合 stage → 聚合为 done（skipped 计入完成度）', () => {
    const view = makeView(
      { status: 'running' },
      {
        // analyst = s5-reconciler + s6-analyst
        stages: [
          { id: 's5-reconciler', label: '对账', status: 'skipped' },
          { id: 's6-analyst', label: '分析', status: 'done' },
        ],
      }
    );
    const dv = buildLegacyDerivedView(view, []);
    const analyst = dv.stages.find((s) => s.id === 'analyst');
    expect(analyst?.status).toBe('done');
  });
});
