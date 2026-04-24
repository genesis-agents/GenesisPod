import { Test } from "@nestjs/testing";
import { ResearchTopicType } from "@prisma/client";

import {
  DIMENSION_TEMPLATES_SEED,
  DimensionTemplatesRepository,
} from "../repository";
import type { DimensionTemplate } from "../types";

const SEED: readonly DimensionTemplate[] = [
  {
    id: "t1",
    topicType: ResearchTopicType.MACRO,
    name: "t1-name",
    description: "t1-desc",
    defaultLanguage: "zh",
    dimensions: [
      {
        id: "t1-d1",
        name: "政策",
        description: "政策描述",
        purpose: "识别政策",
        queryTemplates: ["{topicName} 政策", "{topicName} 法规"],
        dataSources: ["policy-search", "web-search"],
        minSources: 4,
        sortOrder: 1,
      },
    ],
  },
  {
    id: "t2",
    topicType: ResearchTopicType.MACRO,
    name: "t2-name",
    description: "t2-desc",
    defaultLanguage: "en",
    dimensions: [],
  },
  {
    id: "t3",
    topicType: ResearchTopicType.TECHNOLOGY,
    name: "t3-name",
    description: "t3-desc",
    defaultLanguage: "zh",
    dimensions: [],
  },
];

async function buildWithSeed(
  seed: readonly DimensionTemplate[],
): Promise<DimensionTemplatesRepository> {
  const mod = await Test.createTestingModule({
    providers: [
      DimensionTemplatesRepository,
      { provide: DIMENSION_TEMPLATES_SEED, useValue: seed },
    ],
  }).compile();
  return mod.get(DimensionTemplatesRepository);
}

async function buildDefault(): Promise<DimensionTemplatesRepository> {
  const mod = await Test.createTestingModule({
    providers: [DimensionTemplatesRepository],
  }).compile();
  return mod.get(DimensionTemplatesRepository);
}

describe("DimensionTemplatesRepository", () => {
  describe("listByType", () => {
    it("returns templates matching the topicType in declaration order", async () => {
      const repo = await buildWithSeed(SEED);
      const macro = repo.listByType(ResearchTopicType.MACRO);
      expect(macro.map((t) => t.id)).toEqual(["t1", "t2"]);
    });

    it("returns empty list for a topicType with no templates", async () => {
      const repo = await buildWithSeed(SEED);
      expect(repo.listByType(ResearchTopicType.COMPANY)).toEqual([]);
    });
  });

  describe("getDefaultForType", () => {
    it("returns the first template for the topicType", async () => {
      const repo = await buildWithSeed(SEED);
      expect(repo.getDefaultForType(ResearchTopicType.MACRO)?.id).toBe("t1");
    });

    it("returns null when no templates exist for the type", async () => {
      const repo = await buildWithSeed(SEED);
      expect(repo.getDefaultForType(ResearchTopicType.EVENT)).toBeNull();
    });
  });

  describe("getById", () => {
    it("returns the matching template", async () => {
      const repo = await buildWithSeed(SEED);
      expect(repo.getById("t3")?.topicType).toBe(ResearchTopicType.TECHNOLOGY);
    });

    it("returns null for unknown id", async () => {
      const repo = await buildWithSeed(SEED);
      expect(repo.getById("nope")).toBeNull();
    });
  });

  describe("renderDimension", () => {
    it("substitutes {topicName} in every query template and trims input", async () => {
      const repo = await buildWithSeed(SEED);
      const template = repo.getById("t1")!;
      const rendered = repo.renderDimension(
        template.dimensions[0],
        "  OpenAI  ",
      );
      expect(rendered.searchQueries).toEqual(["OpenAI 政策", "OpenAI 法规"]);
      expect(rendered.searchSources).toEqual(["policy-search", "web-search"]);
      expect(rendered.minSources).toBe(4);
      expect(rendered.sortOrder).toBe(1);
      expect(rendered.name).toBe("政策");
    });

    it("returns a fresh array for searchSources (safe to mutate)", async () => {
      const repo = await buildWithSeed(SEED);
      const template = repo.getById("t1")!;
      const rendered = repo.renderDimension(template.dimensions[0], "X");
      expect(rendered.searchSources).not.toBe(
        template.dimensions[0].dataSources,
      );
    });
  });

  describe("renderTemplate", () => {
    it("renders every dimension in order", async () => {
      const repo = await buildWithSeed(SEED);
      const template = repo.getById("t1")!;
      const dims = repo.renderTemplate(template, "AI");
      expect(dims).toHaveLength(1);
      expect(dims[0].searchQueries[0]).toBe("AI 政策");
    });
  });

  describe("default seed (no DI override)", () => {
    it("falls back to DIMENSION_TEMPLATES when seed is not provided", async () => {
      const repo = await buildDefault();
      for (const type of Object.values(ResearchTopicType)) {
        expect(repo.listByType(type).length).toBeGreaterThan(0);
      }
    });
  });
});
