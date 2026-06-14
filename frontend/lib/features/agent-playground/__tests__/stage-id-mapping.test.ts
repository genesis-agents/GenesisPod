import { describe, expect, it } from 'vitest';
import { FRONTEND_STAGE_TO_STEP_ID } from '../stage-id-mapping';

describe('FRONTEND_STAGE_TO_STEP_ID', () => {
  it('maps researcher stage to backend collect step id', () => {
    expect(FRONTEND_STAGE_TO_STEP_ID['s3-researchers']).toBe(
      's3-researcher-collect'
    );
  });

  it('maps writer draft stage to backend writer step id', () => {
    expect(FRONTEND_STAGE_TO_STEP_ID['s8-writer-draft']).toBe('s8-writer');
  });

  it('maps leader signoff to foreword-signoff step id', () => {
    expect(FRONTEND_STAGE_TO_STEP_ID['s10-leader-signoff']).toBe(
      's10-leader-foreword-signoff'
    );
  });

  it('does NOT include removed s12-self-evolution (P0-A1)', () => {
    expect(FRONTEND_STAGE_TO_STEP_ID['s12-self-evolution']).toBeUndefined();
  });

  it('has every value non-empty and keys self-consistent', () => {
    const entries = Object.entries(FRONTEND_STAGE_TO_STEP_ID);
    expect(entries.length).toBe(13);
    for (const [k, v] of entries) {
      expect(k).toMatch(/^s\d/);
      expect(v.length).toBeGreaterThan(0);
    }
  });
});
