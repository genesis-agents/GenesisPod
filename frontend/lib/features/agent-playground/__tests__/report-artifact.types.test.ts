import { describe, expect, it } from 'vitest';
import { isReportArtifact } from '../report-artifact.types';

const full = {
  content: 'x',
  sections: [],
  citations: [],
  figures: [],
  quickView: {},
  metadata: {},
  quality: {},
};

describe('isReportArtifact', () => {
  it('returns false for null / non-object', () => {
    expect(isReportArtifact(null)).toBe(false);
    expect(isReportArtifact(undefined)).toBe(false);
    expect(isReportArtifact('str')).toBe(false);
    expect(isReportArtifact(42)).toBe(false);
  });
  it('returns true for a complete v2 artifact', () => {
    expect(isReportArtifact(full)).toBe(true);
  });
  it('returns false when any required key is missing', () => {
    for (const key of Object.keys(full)) {
      const partial = { ...full } as Record<string, unknown>;
      delete partial[key];
      expect(isReportArtifact(partial)).toBe(false);
    }
  });
});
