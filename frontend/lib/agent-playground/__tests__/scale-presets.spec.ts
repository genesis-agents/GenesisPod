// PR-8 v1.6 D1 frontend SCALE_PRESET_CARDS — 与 backend 对齐验证

import {
  SCALE_PRESET_CARDS,
  isScaleAllowedForTier,
  type ReportScale,
} from '../scale-presets';
import { describe, it, expect } from 'vitest';

describe('PR-8 frontend SCALE_PRESET_CARDS', () => {
  describe('4 档可达 + 2 档 lock-experimental', () => {
    const reachable: ReportScale[] = [
      'quick',
      'standard',
      'deep',
      'professional',
    ];
    it.each(reachable)('%s 档不锁定', (s) => {
      expect(SCALE_PRESET_CARDS[s].locked).toBeFalsy();
    });

    const locked: ReportScale[] = ['publication', 'encyclopedia'];
    it.each(locked)('%s 档锁定 + tooltip', (s) => {
      expect(SCALE_PRESET_CARDS[s].locked).toBe(true);
      expect(SCALE_PRESET_CARDS[s].lockedTooltip).toContain('实验中');
    });
  });

  describe('数字与 backend SCALE_PRESETS 对齐（防双源漂移）', () => {
    it('deep: 10 章 / 12-15K 字/章 / 12-15 万字总（用户定）', () => {
      const c = SCALE_PRESET_CARDS.deep;
      expect(c.totalChapters).toBe(10);
      expect(c.wordsPerChapter).toEqual([12_000, 15_000]);
      expect(c.totalWordsEstimate).toContain('12-15 万');
      expect(c.figPerCh).toBe(3);
      expect(c.maxCredits).toBe(10);
    });

    it('quick: 6 章 / 800-1200 字/章', () => {
      const c = SCALE_PRESET_CARDS.quick;
      expect(c.totalChapters).toBe(6);
      expect(c.wordsPerChapter).toEqual([800, 1200]);
      expect(c.figPerCh).toBe(0);
    });

    it('professional: 12 章 / 18-22K 字/章 / 4 图', () => {
      const c = SCALE_PRESET_CARDS.professional;
      expect(c.totalChapters).toBe(12);
      expect(c.wordsPerChapter).toEqual([18_000, 22_000]);
      expect(c.figPerCh).toBe(4);
    });
  });

  describe('isScaleAllowedForTier', () => {
    it('free 仅 quick', () => {
      expect(isScaleAllowedForTier('quick', 'free')).toBe(true);
      expect(isScaleAllowedForTier('standard', 'free')).toBe(false);
      expect(isScaleAllowedForTier('deep', 'free')).toBe(false);
    });

    it('pro 不含 professional', () => {
      expect(isScaleAllowedForTier('deep', 'pro')).toBe(true);
      expect(isScaleAllowedForTier('professional', 'pro')).toBe(false);
    });

    it('enterprise 含 professional 不含 publication（lock-experimental）', () => {
      expect(isScaleAllowedForTier('professional', 'enterprise')).toBe(true);
      expect(isScaleAllowedForTier('publication', 'enterprise')).toBe(false);
      expect(isScaleAllowedForTier('encyclopedia', 'enterprise')).toBe(false);
    });
  });
});
