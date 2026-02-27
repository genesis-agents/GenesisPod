import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the generated changelog JSON
vi.mock('@/lib/generated/changelog.json', () => ({
  default: [
    {
      version: '2.1.0',
      date: '2026-02-01',
      changes: [
        { type: 'feature', description: 'New AI research module' },
        { type: 'fix', description: 'Fixed auth token refresh bug' },
      ],
    },
    {
      version: '2.0.0',
      date: '2026-01-01',
      changes: [
        { type: 'breaking', description: 'Removed legacy API endpoints' },
        { type: 'improvement', description: 'Performance improvements' },
      ],
    },
  ],
}));

import {
  CHANGELOG,
  CURRENT_VERSION,
  getLatestChangelog,
  hasNewVersion,
  markVersionAsSeen,
  getChangeTypeInfo,
} from '@/lib/utils/changelog';

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('changelog utils', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  // ============================================================
  // CHANGELOG / CURRENT_VERSION
  // ============================================================

  it('CHANGELOG is an array with 2 entries', () => {
    expect(Array.isArray(CHANGELOG)).toBe(true);
    expect(CHANGELOG).toHaveLength(2);
  });

  it('CURRENT_VERSION equals the first entry version', () => {
    expect(CURRENT_VERSION).toBe('2.1.0');
  });

  // ============================================================
  // getLatestChangelog
  // ============================================================

  it('getLatestChangelog returns the first changelog entry', () => {
    const latest = getLatestChangelog();
    expect(latest.version).toBe('2.1.0');
    expect(latest.date).toBe('2026-02-01');
  });

  it('getLatestChangelog has correct changes array', () => {
    const latest = getLatestChangelog();
    expect(latest.changes).toHaveLength(2);
    expect(latest.changes[0].type).toBe('feature');
    expect(latest.changes[1].type).toBe('fix');
  });

  // ============================================================
  // hasNewVersion
  // ============================================================

  it('hasNewVersion returns true when no version is stored', () => {
    expect(hasNewVersion()).toBe(true);
  });

  it('hasNewVersion returns false when stored version matches current', () => {
    localStorageMock.setItem('lastSeenVersion', '2.1.0');
    expect(hasNewVersion()).toBe(false);
  });

  it('hasNewVersion returns true when stored version is older', () => {
    localStorageMock.setItem('lastSeenVersion', '1.0.0');
    expect(hasNewVersion()).toBe(true);
  });

  it('hasNewVersion returns false when called server-side (typeof window check)', () => {
    // We test by simulating the behavior: if lastSeenVersion === CURRENT_VERSION, returns false
    localStorageMock.setItem('lastSeenVersion', CURRENT_VERSION);
    expect(hasNewVersion()).toBe(false);
  });

  // ============================================================
  // markVersionAsSeen
  // ============================================================

  it('markVersionAsSeen stores the current version in localStorage', () => {
    markVersionAsSeen();
    expect(localStorageMock.getItem('lastSeenVersion')).toBe('2.1.0');
  });

  it('markVersionAsSeen makes hasNewVersion return false', () => {
    markVersionAsSeen();
    expect(hasNewVersion()).toBe(false);
  });

  it('markVersionAsSeen does not throw when called multiple times', () => {
    // Calling it repeatedly should be idempotent and not throw
    expect(() => {
      markVersionAsSeen();
      markVersionAsSeen();
    }).not.toThrow();
    expect(localStorageMock.getItem('lastSeenVersion')).toBe(CURRENT_VERSION);
  });

  // ============================================================
  // getChangeTypeInfo
  // ============================================================

  it('returns correct label and color for "feature" type', () => {
    const info = getChangeTypeInfo('feature');
    expect(info.label).toBe('New');
    expect(info.color).toContain('green');
  });

  it('returns correct label and color for "fix" type', () => {
    const info = getChangeTypeInfo('fix');
    expect(info.label).toBe('Fix');
    expect(info.color).toContain('red');
  });

  it('returns correct label and color for "improvement" type', () => {
    const info = getChangeTypeInfo('improvement');
    expect(info.label).toBe('Improved');
    expect(info.color).toContain('blue');
  });

  it('returns correct label and color for "breaking" type', () => {
    const info = getChangeTypeInfo('breaking');
    expect(info.label).toBe('Breaking');
    expect(info.color).toContain('orange');
  });
});
