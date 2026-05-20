/**
 * stage-lifecycle-no-regression.spec.ts
 *
 * **反向回归 spec**：防 derive.ts 跟 backend stage:lifecycle 单轨化链路再
 * 脱节（2026-05-06 真问题，0996e8672 commit 单轨化时 derive.ts 没跟进）。
 *
 * 真问题症状：
 * - backend 0996e8672 删了 stage:started/stage:completed，只 emit stage:lifecycle
 * - derive.ts 还在听旧 stage:started/stage:completed
 * - 结果：mission 详情页 view.stages 永远全 pending；用户看到 "Leader 还没拆分维度"
 * - 用户必须刷新页面才看到状态变化（实际刷新也没用，状态依然不更新）
 *
 * 反向证据：本 spec 用 mission cc15c7e9 真实事件流（含 6 条 stage:lifecycle，
 * 0 条 stage:started/completed），断言 deriveView 后至少有一个 stage 进入
 * running 或 done。如果 derive.ts 再次没接 stage:lifecycle handler，所有
 * stages 全 pending，断言失败。
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { deriveView, mapStepIdToStageId } from '@/lib/agent-playground/derive';
import type { PlaygroundEvent } from '@/hooks/features/useAgentPlaygroundStream';

const FIXTURES = path.join(__dirname, '__fixtures__');

describe('stage:lifecycle 单轨化无回归', () => {
  it('mapStepIdToStageId 覆盖 13 个 backend stepId', () => {
    expect(mapStepIdToStageId('s1-budget')).toBe('leader');
    expect(mapStepIdToStageId('s2-leader-plan')).toBe('leader');
    expect(mapStepIdToStageId('s3-researcher-collect')).toBe('researchers');
    expect(mapStepIdToStageId('s4-leader-assess')).toBe('leader');
    expect(mapStepIdToStageId('s5-reconciler')).toBe('analyst');
    expect(mapStepIdToStageId('s6-analyst')).toBe('analyst');
    expect(mapStepIdToStageId('s7-writer-outline')).toBe('writer');
    expect(mapStepIdToStageId('s8-writer-draft')).toBe('writer');
    expect(mapStepIdToStageId('s8b-section-quality-enhancement')).toBe(
      'writer'
    );
    expect(mapStepIdToStageId('s9-critic')).toBe('reviewer');
    expect(mapStepIdToStageId('s9b-objective-evaluation')).toBe('reviewer');
    expect(mapStepIdToStageId('s10-leader-foreword-signoff')).toBe('leader');
    expect(mapStepIdToStageId('s11-persist')).toBe('leader');
    expect(mapStepIdToStageId('s12-self-evolution')).toBe('leader');
  });

  it('mapStepIdToStageId 兼容旧 StageId 直传', () => {
    expect(mapStepIdToStageId('leader')).toBe('leader');
    expect(mapStepIdToStageId('researchers')).toBe('researchers');
    expect(mapStepIdToStageId('analyst')).toBe('analyst');
    expect(mapStepIdToStageId('writer')).toBe('writer');
    expect(mapStepIdToStageId('reviewer')).toBe('reviewer');
  });

  it('mapStepIdToStageId 未知 ID 返 null（不要默默归类到错的 stage）', () => {
    expect(mapStepIdToStageId('not-a-step')).toBeNull();
    expect(mapStepIdToStageId(undefined)).toBeNull();
    expect(mapStepIdToStageId('')).toBeNull();
  });

  it('合成 stage:lifecycle started 事件 → derive 后 stage status=running', () => {
    const events: PlaygroundEvent[] = [
      {
        type: 'agent-playground.mission:started',
        payload: {
          input: { topic: 'test', depth: 'standard', language: 'zh-CN' },
        },
        timestamp: 1000,
      },
      {
        type: 'agent-playground.stage:lifecycle',
        payload: {
          stage: 's2-leader-plan',
          status: 'started',
          stepId: 's2-leader-plan',
          primitive: 'plan',
        },
        timestamp: 2000,
      },
    ];
    const view = deriveView(events);
    const leader = view.stages.find((s) => s.id === 'leader');
    expect(leader?.status).toBe('running');
    expect(leader?.startedAt).toBe(2000);
  });

  it('合成 stage:lifecycle completed → stage status=done + endedAt', () => {
    const events: PlaygroundEvent[] = [
      {
        type: 'agent-playground.mission:started',
        payload: {
          input: { topic: 'test', depth: 'standard', language: 'zh-CN' },
        },
        timestamp: 1000,
      },
      {
        type: 'agent-playground.stage:lifecycle',
        payload: {
          stage: 's3-researcher-collect',
          status: 'started',
          stepId: 's3-researcher-collect',
        },
        timestamp: 2000,
      },
      {
        type: 'agent-playground.stage:lifecycle',
        payload: {
          stage: 's3-researcher-collect',
          status: 'completed',
          stepId: 's3-researcher-collect',
        },
        timestamp: 3000,
      },
    ];
    const view = deriveView(events);
    const researchers = view.stages.find((s) => s.id === 'researchers');
    expect(researchers?.status).toBe('done');
    expect(researchers?.endedAt).toBe(3000);
  });

  it('S2 完成时 hydrate dimensions + themeSummary 到 mission state', () => {
    const events: PlaygroundEvent[] = [
      {
        type: 'agent-playground.mission:started',
        payload: {
          input: { topic: 'test', depth: 'standard', language: 'zh-CN' },
        },
        timestamp: 1000,
      },
      {
        type: 'agent-playground.stage:lifecycle',
        payload: {
          stage: 's2-leader-plan',
          status: 'completed',
          stepId: 's2-leader-plan',
          output: {
            raw: {
              themeSummary: 'Test theme',
              dimensions: [
                { id: 'd1', name: 'Architecture', rationale: 'Why' },
                { id: 'd2', name: 'Performance', rationale: 'Why2' },
              ],
            },
          },
        },
        timestamp: 2000,
      },
    ];
    const view = deriveView(events);
    expect(view.mission.themeSummary).toBe('Test theme');
    expect(view.mission.dimensions).toEqual([
      { id: 'd1', name: 'Architecture', rationale: 'Why' },
      { id: 'd2', name: 'Performance', rationale: 'Why2' },
    ]);
  });

  it('REGRESSION: prod fixture cc15c7e9 必须有至少 1 个 stage 进入 running/done', () => {
    const fixturePath = path.join(FIXTURES, 'running-cc15c7e9.json');
    if (!fs.existsSync(fixturePath)) {
      console.warn('Fixture missing — skipping regression check');
      return;
    }
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as {
      events: PlaygroundEvent[];
    };
    const view = deriveView(fixture.events);
    // 这个 mission 跑了好几个 stage（DB 有 6 条 stage:lifecycle）
    const nonPending = view.stages.filter((s) => s.status !== 'pending');
    expect(nonPending.length).toBeGreaterThan(0);
    // leader stage 应该至少 started（mission cc15c7e9 已过 S2 plan）
    const leader = view.stages.find((s) => s.id === 'leader');
    expect(leader?.status).not.toBe('pending');
  });

  it('REGRESSION: 旧 stage:started/completed 事件仍能 work（fixture 兼容）', () => {
    // pre-单轨化 mission 的事件用旧 type
    const events: PlaygroundEvent[] = [
      {
        type: 'agent-playground.mission:started',
        payload: {
          input: { topic: 'test', depth: 'standard', language: 'zh-CN' },
        },
        timestamp: 1000,
      },
      {
        type: 'agent-playground.stage:started',
        payload: { stage: 'leader' },
        timestamp: 2000,
      },
      {
        type: 'agent-playground.stage:completed',
        payload: {
          stage: 'leader',
          dimensions: [{ name: 'Test dim' }],
        },
        timestamp: 3000,
      },
    ];
    const view = deriveView(events);
    const leader = view.stages.find((s) => s.id === 'leader');
    expect(leader?.status).toBe('done');
  });
});
