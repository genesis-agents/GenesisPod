import { describe, expect, it } from 'vitest';
import {
  mapStepIdToStageId,
  aggregateStageStatus,
  STAGE_STEPS,
} from '../mission-presentation.types';
import type { StepStatus } from '../mission-presentation.types';

describe('mapStepIdToStageId', () => {
  it('returns null for undefined/empty', () => {
    expect(mapStepIdToStageId(undefined)).toBeNull();
    expect(mapStepIdToStageId('')).toBeNull();
  });
  it('maps canonical stage ids to themselves', () => {
    for (const s of [
      'leader',
      'researchers',
      'analyst',
      'writer',
      'reviewer',
    ]) {
      expect(mapStepIdToStageId(s)).toBe(s);
    }
  });
  it('maps leader step ids to leader', () => {
    for (const s of [
      's1-budget',
      's2-leader-plan',
      's4-leader-assess',
      's10-leader-foreword-signoff',
      's11-persist',
      's12-self-evolution',
    ]) {
      expect(mapStepIdToStageId(s)).toBe('leader');
    }
  });
  it('maps researcher step ids', () => {
    expect(mapStepIdToStageId('s3-researchers')).toBe('researchers');
    expect(mapStepIdToStageId('s3-researcher-collect')).toBe('researchers');
  });
  it('maps analyst step ids', () => {
    expect(mapStepIdToStageId('s5-reconciler')).toBe('analyst');
    expect(mapStepIdToStageId('s6-analyst')).toBe('analyst');
  });
  it('maps writer step ids', () => {
    for (const s of [
      's7-writer-outline',
      's8-writer',
      's8-writer-draft',
      's8b-section-quality-enhancement',
      's8b-quality-enhancement',
    ]) {
      expect(mapStepIdToStageId(s)).toBe('writer');
    }
  });
  it('maps reviewer step ids', () => {
    for (const s of [
      's9-critic',
      's9-reviewer-critic-l4',
      's9b-objective-evaluation',
      's9b-objective-eval',
    ]) {
      expect(mapStepIdToStageId(s)).toBe('reviewer');
    }
  });
  it('returns null for unknown step id', () => {
    expect(mapStepIdToStageId('totally-unknown')).toBeNull();
  });
});

describe('aggregateStageStatus', () => {
  const m = (entries: [string, StepStatus][]) => new Map(entries);

  it('returns pending when no steps are known', () => {
    expect(aggregateStageStatus('leader', m([]))).toBe('pending');
  });
  it('returns failed when any step failed (precedence over running)', () => {
    expect(
      aggregateStageStatus(
        'analyst',
        m([
          ['s5-reconciler', 'failed'],
          ['s6-analyst', 'running'],
        ])
      )
    ).toBe('failed');
  });
  it('returns done when all steps done', () => {
    expect(
      aggregateStageStatus(
        'analyst',
        m([
          ['s5-reconciler', 'done'],
          ['s6-analyst', 'done'],
        ])
      )
    ).toBe('done');
  });
  it('returns running when a step is running', () => {
    expect(
      aggregateStageStatus('analyst', m([['s5-reconciler', 'running']]))
    ).toBe('running');
  });
  it('returns running on partial done (doneCount>0 but not all)', () => {
    expect(
      aggregateStageStatus('analyst', m([['s5-reconciler', 'done']]))
    ).toBe('running');
  });
  it('returns pending when known steps are all pending', () => {
    expect(
      aggregateStageStatus('analyst', m([['s5-reconciler', 'pending']]))
    ).toBe('pending');
  });
  it('skips unknown (null) step entries', () => {
    const map = m([['s6-analyst', 'done']]);
    // s5-reconciler absent → null branch (continue)
    expect(aggregateStageStatus('analyst', map)).toBe('running');
  });
});

describe('STAGE_STEPS', () => {
  it('covers the 5 canonical stages', () => {
    expect(Object.keys(STAGE_STEPS).sort()).toEqual(
      ['analyst', 'leader', 'researchers', 'reviewer', 'writer'].sort()
    );
    expect(STAGE_STEPS.researchers).toContain('s3-researcher-collect');
  });
});
