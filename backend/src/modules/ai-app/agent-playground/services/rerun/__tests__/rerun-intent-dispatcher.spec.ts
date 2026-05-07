// PR-7 v1.6 RV-9a / RV-9b / RV-9c / RV-10a — rerun intent dispatcher
//
// 关键反向证据：
//   - RV-10a v1.6: ensureRerunable 实际被调用（不是测 flag）
//   - RV-9a: cross-user attack 经 guard 拦截
//   - RV-9b: fresh-research 创建新 mission + parent_mission_id（在 handler 行为里）
//   - RV-9c: change-style/language/audience 各有独立 handler 路径

import {
  RerunIntentDispatcher,
  type RerunGuardLike,
} from "../rerun-intent-dispatcher.service";
import type { RerunIntent } from "../rerun-intents";
import { INTENT_STAGES } from "../rerun-intents";

describe("PR-7 RerunIntentDispatcher", () => {
  let dispatcher: RerunIntentDispatcher;
  let guard: jest.Mocked<RerunGuardLike>;

  beforeEach(() => {
    dispatcher = new RerunIntentDispatcher();
    guard = {
      ensureRerunable: jest.fn().mockResolvedValue(undefined),
      ensureMissionOwnership: jest.fn().mockResolvedValue(undefined),
    };
  });

  describe("RV-10a v1.6: ensureRerunable 实际调用", () => {
    it.each<RerunIntent>([
      "extend-length",
      "add-figures",
      "revise-chapter",
      "extend-research",
      "change-style",
      "change-language",
      "change-audience",
      "publish-only",
    ])(
      "intent=%s → ensureRerunable 被调用 1 次（不是 flag）",
      async (intent) => {
        dispatcher.registerHandler(intent, async () => ({
          runMissionId: "m1",
          intent,
        }));
        await dispatcher.dispatch("m1", "u1", intent, {}, guard);
        expect(guard.ensureRerunable).toHaveBeenCalledTimes(1);
        expect(guard.ensureRerunable).toHaveBeenCalledWith("m1", "u1");
        expect(guard.ensureMissionOwnership).not.toHaveBeenCalled();
      },
    );

    it("intent=fresh-research → ensureMissionOwnership 1 次（不是 ensureRerunable）", async () => {
      dispatcher.registerHandler("fresh-research", async () => ({
        runMissionId: "m-new",
        intent: "fresh-research",
      }));
      await dispatcher.dispatch("m1", "u1", "fresh-research", {}, guard);
      expect(guard.ensureMissionOwnership).toHaveBeenCalledTimes(1);
      expect(guard.ensureRerunable).not.toHaveBeenCalled();
    });
  });

  describe("RV-9a: cross-user attack 拦截", () => {
    it("guard.ensureRerunable 抛错 → handler 不被调用", async () => {
      const handler = jest.fn();
      dispatcher.registerHandler("revise-chapter", handler);
      guard.ensureRerunable.mockRejectedValue(
        new Error("Forbidden: cross-user mission"),
      );
      await expect(
        dispatcher.dispatch("m1", "attacker", "revise-chapter", {}, guard),
      ).rejects.toThrow("Forbidden");
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("非法 intent 拒绝", () => {
    it("未知 intent → BadRequest", async () => {
      await expect(
        dispatcher.dispatch(
          "m1",
          "u1",
          "evil-intent" as RerunIntent,
          {},
          guard,
        ),
      ).rejects.toThrow(/Unknown rerun intent/);
      expect(guard.ensureRerunable).not.toHaveBeenCalled();
    });

    it("intent 已识别但无 handler 注册 → BadRequest", async () => {
      await expect(
        dispatcher.dispatch("m1", "u1", "extend-length", {}, guard),
      ).rejects.toThrow(/No handler registered/);
    });
  });

  describe("RV-9c: 8 意图 INTENT_STAGES 完整性", () => {
    it.each<RerunIntent>([
      "extend-length",
      "add-figures",
      "revise-chapter",
      "extend-research",
      "fresh-research",
      "change-style",
      "change-language",
      "change-audience",
      "publish-only",
    ])("INTENT_STAGES[%s] 非空", (intent) => {
      expect(INTENT_STAGES[intent].length).toBeGreaterThan(0);
    });

    it("revise-chapter 走 s8-5-revise-single-chapter 新 stage（不重写其他章节）", () => {
      expect(INTENT_STAGES["revise-chapter"]).toContain(
        "s8-5-revise-single-chapter",
      );
      // 不应触发 s7-writer-plan-outline（不重新规划大纲）
      expect(INTENT_STAGES["revise-chapter"]).not.toContain(
        "s7-writer-plan-outline",
      );
    });

    it("add-figures 仅跑 figure-curator + persist（不重写 writer）", () => {
      expect(INTENT_STAGES["add-figures"]).toEqual([
        "s3-5-figure-curator",
        "s11-mission-persist",
      ]);
    });

    it("publish-only 仅 s11", () => {
      expect(INTENT_STAGES["publish-only"]).toEqual(["s11-mission-persist"]);
    });

    it("fresh-research 全 pipeline 跑（s1-s11 + s3-5 + s7-5 + s11）", () => {
      expect(INTENT_STAGES["fresh-research"]).toContain(
        "s1-mission-estimate-budget",
      );
      expect(INTENT_STAGES["fresh-research"]).toContain("s11-mission-persist");
      expect(INTENT_STAGES["fresh-research"]).toContain("s3-5-figure-curator");
      expect(INTENT_STAGES["fresh-research"]).toContain(
        "s7-5-sub-section-planner",
      );
    });
  });
});
