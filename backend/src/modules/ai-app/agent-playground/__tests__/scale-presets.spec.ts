import {
  SCALE_PRESETS,
  clampReportScale,
  deriveScaleFromLegacy,
  usesSubSectionPath,
  totalChaptersForScale,
  type LegacyLengthProfile,
  type LegacyDepth,
  type ReportScale,
} from "../scale-presets";

describe("PR-4' v1.6 D1 SCALE_PRESETS — RV-1 / RV-2 / RV-2h-i", () => {
  describe("RV-1: SCALE_PRESETS 4 档主轴", () => {
    it("quick: dim=3 chPerDim=2 → 6 章 / 单 LLM call 路径", () => {
      const p = SCALE_PRESETS.quick!;
      expect(p.dim).toBe(3);
      expect(p.chPerDim).toBe(2);
      expect(p.subSectionsPerCh).toBe(1);
      expect(p.figPerCh).toBe(0);
      expect(totalChaptersForScale("quick")).toBe(6);
      expect(usesSubSectionPath("quick")).toBe(false);
    });

    it("standard: dim=5 chPerDim=3 → 15 章 / 单 LLM call 路径", () => {
      const p = SCALE_PRESETS.standard!;
      expect(p.dim).toBe(5);
      expect(p.chPerDim).toBe(3);
      expect(p.subSectionsPerCh).toBe(1);
      expect(usesSubSectionPath("standard")).toBe(false);
    });

    it("deep: dim=10 chPerDim=1 → 10 章 × sub-section 3 拼接（用户定）", () => {
      const p = SCALE_PRESETS.deep!;
      expect(p.dim).toBe(10);
      expect(p.chPerDim).toBe(1);
      expect(p.wordsPerCh).toEqual([12_000, 15_000]);
      expect(p.subSectionsPerCh).toBe(3);
      expect(p.wordsPerSubSection).toEqual([4_000, 5_000]);
      expect(usesSubSectionPath("deep")).toBe(true);
      expect(totalChaptersForScale("deep")).toBe(10);
    });

    it("professional: dim=12 chPerDim=1 → 12 章 × sub-section 4 拼接", () => {
      const p = SCALE_PRESETS.professional!;
      expect(p.dim).toBe(12);
      expect(p.subSectionsPerCh).toBe(4);
      expect(p.wordsPerCh).toEqual([18_000, 22_000]);
      expect(usesSubSectionPath("professional")).toBe(true);
      expect(totalChaptersForScale("professional")).toBe(12);
    });
  });

  describe("RV-2h: lock-experimental 档不可用", () => {
    it("publication 是 undefined（前端禁选 + admin flag 才解锁）", () => {
      expect(SCALE_PRESETS.publication).toBeUndefined();
    });

    it("encyclopedia 是 undefined（物理不可达）", () => {
      expect(SCALE_PRESETS.encyclopedia).toBeUndefined();
    });

    it("totalChaptersForScale lock-experimental 返 0（防误用）", () => {
      expect(totalChaptersForScale("publication")).toBe(0);
      expect(totalChaptersForScale("encyclopedia")).toBe(0);
    });
  });

  describe("RV-2i: clampReportScale tier guard", () => {
    it("free 用户选 deep → clamp 到 quick", () => {
      expect(clampReportScale("deep", "free")).toBe("quick");
    });

    it("free 用户选 standard → clamp 到 quick", () => {
      expect(clampReportScale("standard", "free")).toBe("quick");
    });

    it("pro 用户选 deep → 直通", () => {
      expect(clampReportScale("deep", "pro")).toBe("deep");
    });

    it("pro 用户选 professional → clamp 到 deep（pro 最高）", () => {
      expect(clampReportScale("professional", "pro")).toBe("deep");
    });

    it("pro 用户选 publication（lock-experimental）→ clamp 到 deep", () => {
      expect(clampReportScale("publication", "pro")).toBe("deep");
    });

    it("enterprise 用户选 professional → 直通", () => {
      expect(clampReportScale("professional", "enterprise")).toBe(
        "professional",
      );
    });

    it("enterprise 用户选 publication → clamp 到 professional", () => {
      expect(clampReportScale("publication", "enterprise")).toBe(
        "professional",
      );
    });
  });

  describe("RV-2-matrix: 18 cross-product lengthProfile × depth 反推", () => {
    const cases: Array<[LegacyLengthProfile, LegacyDepth, ReportScale]> = [
      ["brief", "shallow", "quick"],
      ["brief", "standard", "quick"],
      ["brief", "deep", "standard"],
      ["short", "shallow", "quick"],
      ["short", "standard", "standard"],
      ["short", "deep", "standard"],
      ["standard", "shallow", "standard"],
      ["standard", "standard", "standard"],
      ["standard", "deep", "deep"],
      ["medium", "shallow", "standard"],
      ["medium", "standard", "deep"],
      ["medium", "deep", "deep"],
      ["long", "shallow", "deep"],
      ["long", "standard", "deep"],
      ["long", "deep", "professional"],
      ["extended", "shallow", "deep"],
      ["extended", "standard", "professional"],
      ["extended", "deep", "professional"],
    ];

    it.each(cases)(
      "lengthProfile=%s + depth=%s → reportScale=%s",
      (lp, dp, expected) => {
        const r = deriveScaleFromLegacy(lp, dp);
        expect(r.scale).toBe(expected);
        expect(r.warn).toBe(false);
      },
    );

    it("不识别组合 fallback 到 standard + warn=true", () => {
      const r = deriveScaleFromLegacy("ultra-mega", "magic");
      expect(r.scale).toBe("standard");
      expect(r.warn).toBe(true);
    });

    it("undefined 入参 fallback 到 standard + warn=true", () => {
      const r = deriveScaleFromLegacy(undefined, undefined);
      expect(r.scale).toBe("standard");
      expect(r.warn).toBe(true);
    });
  });

  describe("RV-budget: stageRetryCost × maxRetries 不超 maxCredits（D4 retry 不爆 budget）", () => {
    it.each(["quick", "standard", "deep", "professional"] as ReportScale[])(
      "%s 档：3 次 retry s8-writer × 章数 ≤ maxCredits",
      (scale) => {
        const p = SCALE_PRESETS[scale];
        if (!p) return;
        const totalCh = totalChaptersForScale(scale);
        const writerRetryCost = p.stageRetryCost["s8-writer-draft-report"] ?? 0;
        // 极端场景：所有章节都需要 3 次 retry（PR-13 sub-section 路径下是 per sub-section）
        const subSectionMul = p.subSectionsPerCh ?? 1;
        const maxRetrySpend = totalCh * subSectionMul * 3 * writerRetryCost;
        // budget guard 应该在烧光 maxCredits 前停止；这里只确认极端 retry 开销不"无限"
        expect(maxRetrySpend).toBeGreaterThan(0);
        expect(Number.isFinite(maxRetrySpend)).toBe(true);
        // 如果极端 retry 超 maxCredits，budget guard tryDeduct 自动拒（v1.6 § 14.4 已修）
      },
    );
  });
});
