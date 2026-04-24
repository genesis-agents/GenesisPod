/**
 * FrameworkSkillPolicyRepository — behaviour tests.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ResearchTopicType } from "@prisma/client";

import { SkillLoaderService } from "@/modules/ai-engine/facade";

import { FRAMEWORK_SKILL_POLICIES } from "../policy.config";
import {
  FRAMEWORK_SKILL_POLICY_SEED,
  FrameworkSkillPolicyRepository,
} from "../policy.repository";
import type { FrameworkSkillPolicyEntry } from "../policy.types";

function makeSkill(id: string, content = `# ${id}\nbody`) {
  return {
    metadata: { id },
    content,
  } as unknown as { metadata: { id: string }; content: string };
}

async function buildWithSeed(
  seed: readonly FrameworkSkillPolicyEntry[],
  loader: Partial<SkillLoaderService> = {
    getSkillById: jest.fn().mockResolvedValue(null),
  },
): Promise<{
  repo: FrameworkSkillPolicyRepository;
  loader: Partial<SkillLoaderService>;
}> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      FrameworkSkillPolicyRepository,
      { provide: SkillLoaderService, useValue: loader },
      { provide: FRAMEWORK_SKILL_POLICY_SEED, useValue: seed },
    ],
  }).compile();
  return { repo: module.get(FrameworkSkillPolicyRepository), loader };
}

describe("FrameworkSkillPolicyRepository", () => {
  describe("getSkillIds", () => {
    it("returns the base entry ids when no eventSubtype is supplied", async () => {
      const { repo } = await buildWithSeed([
        { topicType: ResearchTopicType.MACRO, skillIds: ["macro-analysis"] },
      ]);
      expect(repo.getSkillIds(ResearchTopicType.MACRO)).toEqual([
        "macro-analysis",
      ]);
    });

    it("prefers a specific (topicType, eventSubtype) match over the base entry", async () => {
      const { repo } = await buildWithSeed([
        { topicType: ResearchTopicType.EVENT, skillIds: ["event-analysis"] },
        {
          topicType: ResearchTopicType.EVENT,
          eventSubtype: "crisis",
          skillIds: ["event-analysis", "event-crisis"],
        },
      ]);
      expect(repo.getSkillIds(ResearchTopicType.EVENT, "crisis")).toEqual([
        "event-analysis",
        "event-crisis",
      ]);
    });

    it("falls back to the base entry when subtype has no refinement", async () => {
      const { repo } = await buildWithSeed([
        { topicType: ResearchTopicType.EVENT, skillIds: ["event-analysis"] },
      ]);
      expect(
        repo.getSkillIds(ResearchTopicType.EVENT, "tech-breakthrough"),
      ).toEqual(["event-analysis"]);
    });

    it("returns empty list when topicType has no policy", async () => {
      const { repo } = await buildWithSeed([]);
      expect(repo.getSkillIds(ResearchTopicType.COMPANY)).toEqual([]);
    });
  });

  describe("loadFrameworks", () => {
    it("returns loaded markdown in policy order", async () => {
      const getSkillById = jest.fn(async (id: string) => makeSkill(id));
      const { repo } = await buildWithSeed(
        [
          {
            topicType: ResearchTopicType.EVENT,
            eventSubtype: "ma",
            skillIds: ["event-analysis", "event-ma"],
          },
        ],
        { getSkillById } as Partial<SkillLoaderService>,
      );
      const out = await repo.loadFrameworks(ResearchTopicType.EVENT, "ma");
      expect(out.map((l) => l.skillId)).toEqual(["event-analysis", "event-ma"]);
      expect(out[0].content).toContain("event-analysis");
      expect(getSkillById).toHaveBeenCalledTimes(2);
    });

    it("skips missing skills and keeps the rest", async () => {
      const getSkillById = jest
        .fn()
        .mockImplementation(async (id: string) =>
          id === "missing" ? null : makeSkill(id),
        );
      const { repo } = await buildWithSeed(
        [
          {
            topicType: ResearchTopicType.MACRO,
            skillIds: ["macro-analysis", "missing"],
          },
        ],
        { getSkillById } as Partial<SkillLoaderService>,
      );
      const out = await repo.loadFrameworks(ResearchTopicType.MACRO);
      expect(out.map((l) => l.skillId)).toEqual(["macro-analysis"]);
    });
  });

  describe("built-in FRAMEWORK_SKILL_POLICIES data integrity", () => {
    it("has exactly one base entry per ResearchTopicType", () => {
      const baseEntries = FRAMEWORK_SKILL_POLICIES.filter(
        (p) => p.eventSubtype === undefined,
      );
      const baseTypes = baseEntries.map((p) => p.topicType);
      expect(new Set(baseTypes).size).toBe(baseTypes.length);
      for (const type of Object.values(ResearchTopicType)) {
        expect(baseTypes).toContain(type);
      }
    });

    it("every refinement entry includes its base topicType's primary skill", () => {
      const baseByType = new Map(
        FRAMEWORK_SKILL_POLICIES.filter(
          (p) => p.eventSubtype === undefined,
        ).map((p) => [p.topicType, p.skillIds[0]] as const),
      );
      for (const entry of FRAMEWORK_SKILL_POLICIES) {
        if (!entry.eventSubtype) continue;
        const primary = baseByType.get(entry.topicType);
        expect(entry.skillIds[0]).toBe(primary);
      }
    });

    it("has no empty skillIds arrays", () => {
      for (const entry of FRAMEWORK_SKILL_POLICIES) {
        expect(entry.skillIds.length).toBeGreaterThan(0);
      }
    });
  });
});
