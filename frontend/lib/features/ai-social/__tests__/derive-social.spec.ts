import { describe, it, expect } from 'vitest';
import { deriveSocialView } from '../derive-social';
import type { MissionEvent } from '@/hooks/features/useMissionStream';

function ev(
  type: string,
  payload: Record<string, unknown>,
  timestamp: number
): MissionEvent {
  return { type, payload, timestamp };
}

const find = (v: ReturnType<typeof deriveSocialView>, stepId: string) =>
  v.stages.find((s) => s.stepId === stepId);

// 13 个预置阶段（s1..s12 + s8b）
const SEEDED = 13;

describe('deriveSocialView', () => {
  it('空事件 → idle，预置完整阶段列表（全 pending）', () => {
    const v = deriveSocialView([]);
    expect(v.status).toBe('idle');
    expect(v.stages).toHaveLength(SEEDED);
    expect(v.stages.every((s) => s.status === 'pending')).toBe(true);
    expect(v.progress).toEqual({ done: 0, total: SEEDED });
  });

  it('running 中间态：s1 完成 + s2 运行中 → done 1，状态 running', () => {
    const v = deriveSocialView([
      ev(
        'social.stage:lifecycle',
        { stepId: 's1-mission-budget-eval', status: 'started' },
        1
      ),
      ev(
        'social.stage:lifecycle',
        { stepId: 's1-mission-budget-eval', status: 'completed' },
        2
      ),
      ev(
        'social.stage:lifecycle',
        { stepId: 's2-platform-probe', status: 'started' },
        3
      ),
    ]);
    expect(v.status).toBe('running');
    expect(v.stages).toHaveLength(SEEDED);
    expect(find(v, 's1-mission-budget-eval')).toMatchObject({
      label: '预算评估',
      status: 'done',
    });
    expect(find(v, 's2-platform-probe')).toMatchObject({
      label: '平台探测',
      status: 'running',
    });
    expect(v.progress).toEqual({ done: 1, total: SEEDED });
  });

  it('completed：mission:completed → 状态 completed', () => {
    const v = deriveSocialView([
      ev(
        'social.stage:lifecycle',
        { stepId: 's6-body-compose', status: 'completed' },
        1
      ),
      ev('social.mission:completed', { wallTimeMs: 1000 }, 2),
    ]);
    expect(v.status).toBe('completed');
    expect(v.completedAt).toBe(2);
    expect(find(v, 's6-body-compose')?.status).toBe('done');
  });

  it('failed：stage failed + mission:failed → 阶段失败 + mission 失败信息', () => {
    const v = deriveSocialView([
      ev(
        'social.stage:lifecycle',
        { stepId: 's8-publish-execute', status: 'failed', error: '账号未授权' },
        1
      ),
      ev('social.mission:failed', { message: '发布失败' }, 2),
    ]);
    expect(v.status).toBe('failed');
    expect(v.failedMessage).toBe('发布失败');
    expect(find(v, 's8-publish-execute')).toMatchObject({
      status: 'failed',
      error: '账号未授权',
    });
  });

  it('未知 stepId → humanize 兜底 + 追加到列表', () => {
    const v = deriveSocialView([
      ev(
        'social.stage:lifecycle',
        { stepId: 's99-some-new-stage', status: 'started' },
        1
      ),
    ]);
    expect(v.stages).toHaveLength(SEEDED + 1);
    expect(find(v, 's99-some-new-stage')?.label).toBe('some new stage');
  });

  it('roles 聚合：按阶段角色汇总状态', () => {
    const v = deriveSocialView([
      ev(
        'social.stage:lifecycle',
        { stepId: 's2-platform-probe', status: 'completed' },
        1
      ),
      ev(
        'social.stage:lifecycle',
        { stepId: 's6-body-compose', status: 'started' },
        2
      ),
    ]);
    expect(v.roles.find((r) => r.role === 'PlatformProbe')?.status).toBe(
      'done'
    );
    expect(v.roles.find((r) => r.role === 'Composer')?.status).toBe('working');
  });

  it('幂等：重复事件不重复建阶段', () => {
    const events = [
      ev(
        'social.stage:lifecycle',
        { stepId: 's1-mission-budget-eval', status: 'started' },
        1
      ),
      ev(
        'social.stage:lifecycle',
        { stepId: 's1-mission-budget-eval', status: 'started' },
        1
      ),
    ];
    expect(deriveSocialView(events).stages).toHaveLength(SEEDED);
  });
});
