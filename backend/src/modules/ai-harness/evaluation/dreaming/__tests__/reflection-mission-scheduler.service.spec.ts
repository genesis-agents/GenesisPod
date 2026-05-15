/**
 * ReflectionMissionScheduler 骨架 spec — PR-I.1 2026-05-15
 *
 * 当前只覆盖骨架行为（config / shouldInjectRules / stub returns）。
 * PR-I.2/I.3 实现后将扩展到 cron 触发 / 抽样 / RuleBase 持久化 / 注入 hook。
 */

import { ReflectionMissionScheduler } from "../reflection-mission-scheduler.service";
import {
  DEFAULT_DREAMING_CONFIG,
  type DreamingTrigger,
} from "../dreaming.types";

describe("ReflectionMissionScheduler (skeleton)", () => {
  let svc: ReflectionMissionScheduler;

  beforeEach(() => {
    svc = new ReflectionMissionScheduler();
  });

  it("starts with DEFAULT_DREAMING_CONFIG", () => {
    expect(svc.getConfig()).toEqual(DEFAULT_DREAMING_CONFIG);
  });

  it("setConfig merges updates", () => {
    svc.setConfig({ sampleSize: 50, enabled: false });
    const cfg = svc.getConfig();
    expect(cfg.sampleSize).toBe(50);
    expect(cfg.enabled).toBe(false);
    // unchanged keys preserved
    expect(cfg.cronExpression).toBe(DEFAULT_DREAMING_CONFIG.cronExpression);
    expect(cfg.tokenBudget).toBe(DEFAULT_DREAMING_CONFIG.tokenBudget);
  });

  it("runOnce returns an empty placeholder result (no rules yet)", async () => {
    const trigger: DreamingTrigger = {
      kind: "manual",
      detail: "spec",
      triggeredAt: new Date(),
    };
    const result = await svc.runOnce(trigger);
    expect(result.trigger).toBe(trigger);
    expect(result.newRules).toEqual([]);
    expect(result.rejectedCandidates).toBe(0);
    expect(result.tokensUsed).toBe(0);
  });

  it("getRulesForMission returns empty InjectedRuleSet (no rules yet)", async () => {
    const set = await svc.getRulesForMission(["BUDGET_EXHAUST", "TIMEOUT"]);
    expect(set.rules).toEqual([]);
    expect(set.promptSnippet).toBe("");
  });

  describe("shouldInjectRules", () => {
    it("returns false for undefined context", () => {
      expect(ReflectionMissionScheduler.shouldInjectRules(undefined)).toBe(
        false,
      );
    });

    it("returns true only for deep missions that are not reruns", () => {
      expect(
        ReflectionMissionScheduler.shouldInjectRules({ depth: "deep" }),
      ).toBe(true);
      expect(
        ReflectionMissionScheduler.shouldInjectRules({
          depth: "deep",
          isRerun: false,
        }),
      ).toBe(true);
    });

    it("returns false for shallow / rerun / missing depth", () => {
      expect(
        ReflectionMissionScheduler.shouldInjectRules({ depth: "shallow" }),
      ).toBe(false);
      expect(
        ReflectionMissionScheduler.shouldInjectRules({
          depth: "deep",
          isRerun: true,
        }),
      ).toBe(false);
      expect(ReflectionMissionScheduler.shouldInjectRules({})).toBe(false);
    });
  });

  it("recordRuleApplication / disableRule are stub no-ops in skeleton", async () => {
    await expect(
      svc.recordRuleApplication("r1", true),
    ).resolves.toBeUndefined();
    await expect(svc.disableRule("r1")).resolves.toBeUndefined();
  });
});
