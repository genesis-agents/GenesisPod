import { describe, expect, it } from 'vitest';
import { deriveLayerBreadcrumb } from '../mission-todo.types';
import type { MissionTodo, SystemStageId } from '../mission-todo.types';

function todo(partial: Partial<MissionTodo>): MissionTodo {
  return {
    id: 't',
    origin: 'system-stage',
    createdBy: 'system',
    createdAt: 0,
    reasonText: '',
    scope: 'system',
    title: '',
    assignee: 'leader' as MissionTodo['assignee'],
    status: 'pending',
    artifacts: [],
    narrativeLog: [],
    ...partial,
  };
}

describe('deriveLayerBreadcrumb', () => {
  it('always returns the 4 architecture layers in order', () => {
    const layers = deriveLayerBreadcrumb(todo({ scope: 'mission' }));
    expect(layers.map((l) => l.id)).toEqual([
      'AI-APP',
      'AI-HARNESS',
      'AI-ENGINE',
      'AI-INFRA',
    ]);
  });

  const harnessCases: [SystemStageId, string][] = [
    ['s2-leader-plan', 'Leader-Replanner-Lite'],
    ['s4-leader-assess', 'Leader-Replanner-Lite'],
    ['s10-leader-signoff', 'Leader-Replanner-Lite'],
    ['s3-researchers', 'ReAct + 自愈'],
    ['s5-reconciler', 'Judge'],
    ['s9-critic-l4', 'Judge'],
    ['s6-analyst', 'Reflexion'],
    ['s7-writer-outline', 'Planning'],
    ['s8-writer-draft', 'ReAct (自愈)'],
    ['s1-budget', '—'],
    ['s11-persist', '—'],
    ['s12-self-evolution', 'FailureLearner + VectorMemory'],
  ];
  it.each(harnessCases)(
    'harness loop for system stage %s',
    (stageId, expected) => {
      const l = deriveLayerBreadcrumb(
        todo({ scope: 'system', systemStageId: stageId })
      );
      expect(l[1].detail).toBe(expected);
    }
  );

  const engineCases: [SystemStageId, string][] = [
    ['s2-leader-plan', 'TaskProfile · Leader prompt'],
    ['s3-researchers', 'Tools · web-search / arxiv / scrape'],
    ['s4-leader-assess', 'TaskProfile · 决策提示'],
    ['s5-reconciler', 'Skills · 实体抽取 / 冲突检测'],
    ['s6-analyst', 'TaskProfile · 综合提示'],
    ['s7-writer-outline', 'Skills · 写作 + 引用规范化'],
    ['s8-writer-draft', 'Skills · 写作 + 引用规范化'],
    ['s9-critic-l4', 'TaskProfile · 独立复审'],
    ['s10-leader-signoff', 'TaskProfile · 签字提示'],
    ['s1-budget', 'modelRouting · 预估'],
    ['s11-persist', 'memory · trajectory'],
  ];
  it.each(engineCases)(
    'engine capability for system stage %s',
    (stageId, expected) => {
      const l = deriveLayerBreadcrumb(
        todo({ scope: 'system', systemStageId: stageId })
      );
      expect(l[2].detail).toBe(expected);
    }
  );

  it('falls back by scope when not a system stage (dimension)', () => {
    const l = deriveLayerBreadcrumb(todo({ scope: 'dimension' }));
    expect(l[1].detail).toBe('ReAct + 自愈');
    expect(l[2].detail).toBe('Tools · web-search / arxiv');
  });
  it('falls back by scope (chapter)', () => {
    const l = deriveLayerBreadcrumb(todo({ scope: 'chapter' }));
    expect(l[1].detail).toBe('Chapter-pipeline');
    expect(l[2].detail).toBe('Skills · 写作');
  });
  it('falls back by scope (review)', () => {
    const l = deriveLayerBreadcrumb(todo({ scope: 'review' }));
    expect(l[1].detail).toBe('Judge');
    expect(l[2].detail).toBe('Skills · 评审');
  });
  it('uses em-dash default for mission scope', () => {
    const l = deriveLayerBreadcrumb(todo({ scope: 'mission' }));
    expect(l[1].detail).toBe('—');
    expect(l[2].detail).toBe('—');
  });
  it('handles system scope without systemStageId (skips switch)', () => {
    const l = deriveLayerBreadcrumb(
      todo({ scope: 'system', systemStageId: undefined })
    );
    expect(l[1].detail).toBe('—');
    expect(l[2].detail).toBe('—');
  });

  it('infra capability: budget gate', () => {
    expect(
      deriveLayerBreadcrumb(todo({ systemStageId: 's1-budget' }))[3].detail
    ).toBe('Credits · 预估 + 闸门');
  });
  it('infra capability: persist storage', () => {
    expect(
      deriveLayerBreadcrumb(todo({ systemStageId: 's11-persist' }))[3].detail
    ).toBe('Storage · DB 落库');
  });
  it('infra capability: default billing context', () => {
    expect(
      deriveLayerBreadcrumb(todo({ systemStageId: 's6-analyst' }))[3].detail
    ).toBe('Credits · BillingContext + tickCost');
  });
});
