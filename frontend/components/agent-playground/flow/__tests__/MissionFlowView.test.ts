import { describe, it, expect } from 'vitest';
import { buildFlowEvents } from '../MissionFlowView';
import type { PlaygroundEvent } from '@/hooks/features/useAgentPlaygroundStream';

/**
 * 回归焊死（2026-06-10 playground parity restoration）：
 * 1. verifier:verdict 缺 verifierId/score 守卫——能力轨 payload 可能缺字段，
 *    此前直接渲染 'Judge "undefined" 评分 undefined/100'。
 * 2. agent:lifecycle degraded:true 旁标——降级产出不再渲染成完全成功（全绿）。
 * 3. dimension:research:completed reused:true ——「复用缓存」chip 信号透传。
 */

function ev(
  type: string,
  payload: Record<string, unknown>,
  timestamp = 1
): PlaygroundEvent {
  return { type, payload, timestamp };
}

describe('buildFlowEvents — verifier:verdict 守卫', () => {
  it('payload 缺 score → 不产出评分卡（不渲染 undefined 文案）', () => {
    const flow = buildFlowEvents([
      ev('playground.verifier:verdict', { verifierId: 'critic-eval' }),
    ]);
    expect(flow.filter((f) => f.kind === 'verdict')).toHaveLength(0);
  });

  it('payload 缺 verifierId 有 score → 中性文案，无 "undefined"', () => {
    const flow = buildFlowEvents([
      ev('playground.verifier:verdict', { score: 77 }),
    ]);
    expect(flow).toHaveLength(1);
    expect(flow[0].text).toBe('评审评分 77/100');
    expect(flow[0].text).not.toContain('undefined');
  });

  it('完整 payload → Judge 文案保持基线格式', () => {
    const flow = buildFlowEvents([
      ev('playground.verifier:verdict', {
        verifierId: 'critic-eval',
        score: 85,
      }),
    ]);
    expect(flow[0].text).toBe('Judge "critic-eval" 评分 85/100');
    expect(flow[0].tone).toBe('success');
  });
});

describe('buildFlowEvents — agent:lifecycle degraded 旁标', () => {
  it('completed + degraded:true → warn tone + degraded 标记', () => {
    const flow = buildFlowEvents([
      ev('playground.agent:lifecycle', {
        phase: 'completed',
        role: 'researcher',
        degraded: true,
      }),
    ]);
    expect(flow[0].tone).toBe('warn');
    expect(flow[0].degraded).toBe(true);
  });

  it('completed 无 degraded → 仍是 success（不误标）', () => {
    const flow = buildFlowEvents([
      ev('playground.agent:lifecycle', { phase: 'completed', role: 'writer' }),
    ]);
    expect(flow[0].tone).toBe('success');
    expect(flow[0].degraded).toBeUndefined();
  });
});

describe('buildFlowEvents — dimension:research:completed reused 透传', () => {
  it('reused:true → reused 标记（「复用缓存」chip）', () => {
    const flow = buildFlowEvents([
      ev('playground.dimension:research:completed', {
        dimension: '市场格局',
        findingsCount: 6,
        reused: true,
      }),
    ]);
    expect(flow[0].reused).toBe(true);
    expect(flow[0].text).toContain('采集完成');
  });

  it('无 reused 字段 → 退化到现状（无标记）', () => {
    const flow = buildFlowEvents([
      ev('playground.dimension:research:completed', {
        dimension: '市场格局',
        findingsCount: 6,
      }),
    ]);
    expect(flow[0].reused).toBeUndefined();
  });
});
