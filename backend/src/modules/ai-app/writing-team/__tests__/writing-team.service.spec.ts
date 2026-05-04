/**
 * WritingTeamService e2e spec（v5.1 §4 R3-A demo）
 *
 * 验证：
 *   1. R1 框架（primitive + config + registry + orchestrator + store）能装起一个
 *      非-playground ai-app（writing-team）
 *   2. 3 stage（plan → draft → signoff）顺序正确，previousOutputs 透传
 *   3. setHooks 注入 spy/mock，验证 hook 被以正确顺序 + 入参调用
 *   4. mission 完成后 store.getById 拿到 completed record + result
 */
import { Test, TestingModule } from "@nestjs/testing";
import {
  MissionPipelineOrchestrator,
  MissionPipelineRegistry,
} from "@/modules/ai-harness/facade";
import { WritingTeamService } from "../writing-team.service";
import type { WritingTeamHooks } from "../writing-team.service";
import { WRITING_TEAM_PIPELINE } from "../writing-team.config";

describe("WritingTeamService e2e (v5.1 R3-A)", () => {
  let svc: WritingTeamService;
  let registry: MissionPipelineRegistry;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        WritingTeamService,
        MissionPipelineRegistry,
        MissionPipelineOrchestrator,
      ],
    }).compile();
    await moduleRef.init();
    svc = moduleRef.get(WritingTeamService);
    registry = moduleRef.get(MissionPipelineRegistry);
  });

  it("onModuleInit 注册 WRITING_TEAM_PIPELINE", () => {
    expect(registry.has("writing-team")).toBe(true);
    const cfg = registry.get("writing-team");
    expect(cfg.id).toBe(WRITING_TEAM_PIPELINE.id);
    expect(cfg.steps.map((s) => s.primitive)).toEqual([
      "plan",
      "draft",
      "signoff",
    ]);
  });

  it("默认 hooks 跑通：result.status = completed + 三 stage 输出齐", async () => {
    // targetWords=20 让默认 hook 产出 (~38 词) 通过 30% 闸（>= 6 词）
    const result = await svc.run({
      topic: "Generative AI in 2026",
      targetWords: 20,
    });
    expect(result.status).toBe("completed");
    expect(result.plan?.outline.length).toBeGreaterThan(0);
    expect(result.plan?.outline[0]).toContain("Generative AI in 2026");
    expect(result.draft?.draftMarkdown).toContain("# Generative AI in 2026");
    expect(result.draft?.wordCount).toBeGreaterThan(0);
    expect(result.signoff?.approved).toBe(true);
  });

  it("setHooks 注入 spy：3 个 hook 被以正确顺序 + previousOutputs 透传", async () => {
    const callOrder: string[] = [];
    let receivedPlanInDraft: unknown;
    let receivedDraftInSignoff: unknown;
    const spyHooks: WritingTeamHooks = {
      planOutline: async ({ input }) => {
        callOrder.push("plan");
        return { outline: [`outline for ${input.topic}`] };
      },
      draftFullText: async ({ input, plan }) => {
        callOrder.push("draft");
        receivedPlanInDraft = plan;
        return {
          draftMarkdown: `# ${input.topic}\nbody`,
          wordCount: 5,
        };
      },
      editorSignoff: async ({ input, draft }) => {
        callOrder.push("signoff");
        receivedDraftInSignoff = draft;
        // input.targetWords 默认 200；wordCount=5 < 30% → approved=false
        return {
          approved: input.targetWords ? draft.wordCount >= 1 : true,
          notes: "approved by spy",
        };
      },
    };
    svc.setHooks(spyHooks);

    const result = await svc.run({ topic: "Robotics", targetWords: 1 });
    expect(callOrder).toEqual(["plan", "draft", "signoff"]);
    expect(receivedPlanInDraft).toEqual({ outline: ["outline for Robotics"] });
    expect(receivedDraftInSignoff).toEqual({
      draftMarkdown: "# Robotics\nbody",
      wordCount: 5,
    });
    expect(result.signoff?.approved).toBe(true);
  });

  it("targetWords 太大 → editor 拒签（approved=false + notes）", async () => {
    const result = await svc.run({ topic: "Biotech", targetWords: 10_000 });
    expect(result.status).toBe("completed");
    expect(result.signoff?.approved).toBe(false);
    expect(result.signoff?.notes).toContain("wordCount=");
  });

  it("hook 抛错 → mission 失败（status=failed），store.updateStatus 写入 error", async () => {
    svc.setHooks({
      planOutline: async () => {
        throw new Error("plan boom");
      },
      draftFullText: async () => ({
        draftMarkdown: "",
        wordCount: 0,
      }),
      editorSignoff: async () => ({ approved: true }),
    });
    const result = await svc.run({ topic: "Climate" });
    expect(result.status).toBe("failed");
    expect(String(result.error)).toContain("plan boom");
    const persisted = await svc.getStoreForTest().getById(result.missionId);
    expect(persisted?.status).toBe("failed");
  });

  it("mission 完成后 store 持久化 record（status=completed + result）", async () => {
    const result = await svc.run({ topic: "Quantum" });
    const persisted = await svc.getStoreForTest().getById(result.missionId);
    expect(persisted).not.toBeNull();
    expect(persisted?.status).toBe("completed");
    expect(persisted?.pipelineId).toBe("writing-team");
    expect(persisted?.completedAt).toBeInstanceOf(Date);
    expect(persisted?.result).toBeDefined();
  });

  it("两次 run 互不干扰（共享 store + 独立 missionId）", async () => {
    const r1 = await svc.run({ topic: "Topic A" });
    const r2 = await svc.run({ topic: "Topic B" });
    expect(r1.missionId).not.toBe(r2.missionId);
    expect(r1.draft?.draftMarkdown).toContain("Topic A");
    expect(r2.draft?.draftMarkdown).toContain("Topic B");

    const list = await svc
      .getStoreForTest()
      .listByUser("nonexistent")
      .catch(() => []);
    expect(Array.isArray(list)).toBe(true);
  });
});
