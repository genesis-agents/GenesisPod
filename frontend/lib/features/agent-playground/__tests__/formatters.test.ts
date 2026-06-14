import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fmtUsd,
  fmtTokens,
  fmtLatency,
  fmtDuration,
  fmtWallTime,
  fmtTimestamp,
  fmtRelative,
  scoreColor,
  scoreBgColor,
  scoreBgLight,
  STAGE_LABEL,
  ROLE_LABEL,
} from '../formatters';

describe('fmtUsd', () => {
  it('returns $0 for exactly zero', () => {
    expect(fmtUsd(0)).toBe('$0');
  });
  it('uses 5 decimals below 0.001', () => {
    expect(fmtUsd(0.0001)).toBe('$0.00010');
    expect(fmtUsd(0.00009)).toBe('$0.00009');
  });
  it('uses 4 decimals below 0.01', () => {
    expect(fmtUsd(0.001)).toBe('$0.0010');
    expect(fmtUsd(0.009)).toBe('$0.0090');
  });
  it('uses 3 decimals at/above 0.01', () => {
    expect(fmtUsd(0.01)).toBe('$0.010');
    expect(fmtUsd(1.2345)).toBe('$1.234');
  });
});

describe('fmtTokens', () => {
  it('returns raw number below 1000', () => {
    expect(fmtTokens(0)).toBe('0');
    expect(fmtTokens(999)).toBe('999');
  });
  it('uses k suffix below 1M', () => {
    expect(fmtTokens(1234)).toBe('1.2k');
    expect(fmtTokens(999999)).toBe('1000.0k');
  });
  it('uses M suffix at/above 1M', () => {
    expect(fmtTokens(1_234_567)).toBe('1.23M');
    expect(fmtTokens(1_000_000)).toBe('1.00M');
  });
});

describe('fmtLatency', () => {
  it('returns em-dash for 0 / negative / falsy', () => {
    expect(fmtLatency(0)).toBe('—');
    expect(fmtLatency(-5)).toBe('—');
    expect(fmtLatency(NaN)).toBe('—');
  });
  it('uses ms below 1s', () => {
    expect(fmtLatency(123)).toBe('123ms');
    expect(fmtLatency(123.7)).toBe('124ms');
  });
  it('uses s below 1min', () => {
    expect(fmtLatency(1500)).toBe('1.5s');
  });
  it('uses m/s at/above 1min', () => {
    expect(fmtLatency(83000)).toBe('1m 23s');
  });
});

describe('fmtDuration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:10.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('returns em-dash with no startedAt', () => {
    expect(fmtDuration(undefined)).toBe('—');
  });
  it('uses Date.now() when endedAt missing', () => {
    const start = new Date('2026-01-01T00:00:05.000Z').getTime();
    expect(fmtDuration(start)).toBe('5s');
  });
  it('returns em-dash when negative duration', () => {
    expect(fmtDuration(2000, 1000)).toBe('—');
  });
  it('returns em-dash when startedAt is falsy (0)', () => {
    expect(fmtDuration(0, 45000)).toBe('—');
  });
  it('formats seconds', () => {
    expect(fmtDuration(1000, 46000)).toBe('45s');
  });
  it('formats minutes + seconds', () => {
    expect(fmtDuration(1000, 84000)).toBe('1m 23s');
  });
});

describe('fmtWallTime', () => {
  it('ms below 1s', () => {
    expect(fmtWallTime(500)).toBe('500ms');
  });
  it('s below 1min', () => {
    expect(fmtWallTime(1500)).toBe('1.5s');
  });
  it('m/s at/above 1min', () => {
    expect(fmtWallTime(83000)).toBe('1m 23s');
  });
});

describe('fmtTimestamp', () => {
  it('formats HH:MM:SS zero-padded', () => {
    const d = new Date(2026, 0, 1, 3, 5, 9);
    expect(fmtTimestamp(d.getTime())).toBe('03:05:09');
  });
});

describe('fmtRelative', () => {
  it('falls back to absolute timestamp when before anchor', () => {
    const ts = new Date(2026, 0, 1, 3, 5, 9).getTime();
    const anchor = ts + 1000;
    expect(fmtRelative(ts, anchor)).toBe('03:05:09');
  });
  it('uses +ms below 1s', () => {
    expect(fmtRelative(1500, 1000)).toBe('+500ms');
  });
  it('uses +s below 1min', () => {
    expect(fmtRelative(6000, 1000)).toBe('+5s');
  });
  it('uses +m s at/above 1min', () => {
    expect(fmtRelative(84000, 1000)).toBe('+1m 23s');
  });
});

describe('score color helpers', () => {
  it('scoreColor thresholds', () => {
    expect(scoreColor(80)).toBe('text-emerald-600');
    expect(scoreColor(60)).toBe('text-amber-600');
    expect(scoreColor(59)).toBe('text-red-600');
  });
  it('scoreBgColor thresholds', () => {
    expect(scoreBgColor(80)).toBe('bg-emerald-400');
    expect(scoreBgColor(60)).toBe('bg-amber-400');
    expect(scoreBgColor(0)).toBe('bg-red-400');
  });
  it('scoreBgLight thresholds', () => {
    expect(scoreBgLight(100)).toBe('bg-emerald-100');
    expect(scoreBgLight(70)).toBe('bg-amber-100');
    expect(scoreBgLight(10)).toBe('bg-red-100');
  });
});

describe('label maps', () => {
  it('STAGE_LABEL has canonical stages', () => {
    expect(STAGE_LABEL.leader).toBe('Leader');
    expect(STAGE_LABEL.writer).toBe('Writer');
  });
  it('ROLE_LABEL has canonical roles', () => {
    expect(ROLE_LABEL.researcher).toBe('Researcher');
    expect(ROLE_LABEL.mission).toBe('Mission');
  });
});
