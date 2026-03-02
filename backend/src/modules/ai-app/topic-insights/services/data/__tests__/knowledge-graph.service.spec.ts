import { Test, TestingModule } from "@nestjs/testing";
import { KnowledgeGraphService } from "../knowledge-graph.service";
import { ChatFacade } from "@/modules/ai-engine/facade";
import {
  EntityType,
  RelationType,
  KnowledgeEntity,
  KnowledgeRelation,
} from "../../../types/knowledge-graph.types";

const mockAiFacade = {
  chat: jest.fn(),
};

const makeEntity = (
  id: string,
  name: string,
  type: EntityType = EntityType.TECHNOLOGY,
  topicIds: string[] = ["t1"],
): KnowledgeEntity => ({
  id,
  name,
  type,
  description: `Description of ${name}`,
  aliases: [],
  properties: {},
  sourceTopicIds: topicIds,
  evidenceIds: [],
  confidence: 0.9,
  firstSeen: new Date(),
  lastUpdated: new Date(),
  referenceCount: 1,
});

const makeRelation = (
  id: string,
  sourceId: string,
  targetId: string,
  type: RelationType = RelationType.RELATED_TO,
): KnowledgeRelation => ({
  id,
  sourceEntityId: sourceId,
  targetEntityId: targetId,
  type,
  description: "Related",
  strength: 0.8,
  sourceTopicId: "t1",
  evidenceIds: [],
  confidence: 0.85,
  createdAt: new Date(),
});

describe("KnowledgeGraphService", () => {
  let service: KnowledgeGraphService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KnowledgeGraphService,
        { provide: ChatFacade, useValue: mockAiFacade },
      ],
    }).compile();

    service = module.get<KnowledgeGraphService>(KnowledgeGraphService);
    service.clear(); // ensure clean state
  });

  // ============================================================
  // addEntity
  // ============================================================

  describe("addEntity", () => {
    it("should add a new entity and return its ID", () => {
      const entity = makeEntity("e1", "OpenAI");
      const id = service.addEntity(entity);
      expect(id).toBe("e1");
    });

    it("should return existing entity ID when same name is added again", () => {
      const entity1 = makeEntity("e1", "OpenAI");
      const entity2 = makeEntity("e2", "OpenAI"); // same name, different id

      service.addEntity(entity1);
      const id = service.addEntity(entity2);

      expect(id).toBe("e1"); // merges into existing
    });

    it("should merge entities - combine sourceTopicIds", () => {
      const entity1 = makeEntity("e1", "GPT-4", EntityType.PRODUCT, ["t1"]);
      const entity2 = makeEntity("e2", "GPT-4", EntityType.PRODUCT, ["t2"]);

      service.addEntity(entity1);
      service.addEntity(entity2);

      const result = service.query({});
      const gpt4 = result.entities.find((e) => e.name === "GPT-4");
      expect(gpt4?.sourceTopicIds).toContain("t1");
      expect(gpt4?.sourceTopicIds).toContain("t2");
    });

    it("should match by alias", () => {
      const entity1 = makeEntity("e1", "OpenAI");
      entity1.aliases = ["Open AI", "OAI"];
      service.addEntity(entity1);

      const entity2 = makeEntity("e2", "Open AI");
      const id = service.addEntity(entity2);

      expect(id).toBe("e1");
    });

    it("should take the higher confidence value when merging", () => {
      const entity1 = makeEntity("e1", "TensorFlow");
      entity1.confidence = 0.7;
      const entity2 = makeEntity("e2", "TensorFlow");
      entity2.confidence = 0.95;

      service.addEntity(entity1);
      service.addEntity(entity2);

      const result = service.query({});
      const tf = result.entities.find((e) => e.name === "TensorFlow");
      expect(tf?.confidence).toBe(0.95);
    });
  });

  // ============================================================
  // addRelation
  // ============================================================

  describe("addRelation", () => {
    it("should add a new relation", () => {
      service.addEntity(makeEntity("e1", "Python"));
      service.addEntity(makeEntity("e2", "TensorFlow"));

      const relation = makeRelation("r1", "e1", "e2");
      service.addRelation(relation);

      const result = service.query({});
      expect(result.relations).toHaveLength(1);
    });

    it("should not add duplicate relations (same source, target, type)", () => {
      service.addEntity(makeEntity("e1", "Python"));
      service.addEntity(makeEntity("e2", "TensorFlow"));

      const relation1 = makeRelation("r1", "e1", "e2");
      const relation2 = makeRelation("r2", "e1", "e2"); // same src/target/type

      service.addRelation(relation1);
      service.addRelation(relation2);

      const result = service.query({});
      expect(result.relations).toHaveLength(1);
    });

    it("should allow relations with different types between same entities", () => {
      service.addEntity(makeEntity("e1", "OpenAI"));
      service.addEntity(makeEntity("e2", "Microsoft"));

      service.addRelation(
        makeRelation("r1", "e1", "e2", RelationType.COLLABORATES_WITH),
      );
      service.addRelation(
        makeRelation("r2", "e1", "e2", RelationType.DEPENDS_ON),
      );

      const result = service.query({});
      expect(result.relations).toHaveLength(2);
    });
  });

  // ============================================================
  // query
  // ============================================================

  describe("query", () => {
    beforeEach(() => {
      service.addEntity(
        makeEntity("e1", "OpenAI", EntityType.ORGANIZATION, ["t1"]),
      );
      service.addEntity(makeEntity("e2", "GPT-4", EntityType.PRODUCT, ["t1"]));
      service.addEntity(
        makeEntity("e3", "Transformer", EntityType.CONCEPT, ["t2"]),
      );
      service.addRelation(
        makeRelation("r1", "e1", "e2", RelationType.PRODUCES),
      );
      service.addRelation(makeRelation("r2", "e2", "e3", RelationType.USES));
    });

    it("should return all entities and relations with empty options", () => {
      const result = service.query({});
      expect(result.entities).toHaveLength(3);
      expect(result.relations).toHaveLength(2);
    });

    it("should filter by entity types", () => {
      const result = service.query({ entityTypes: [EntityType.ORGANIZATION] });
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe("OpenAI");
    });

    it("should filter by minimum confidence", () => {
      const lowConf = makeEntity("e4", "Beta AI");
      lowConf.confidence = 0.3;
      service.addEntity(lowConf);

      const result = service.query({ minConfidence: 0.8 });
      expect(result.entities.every((e) => e.confidence >= 0.8)).toBe(true);
    });

    it("should filter by topicIds", () => {
      const result = service.query({ topicIds: ["t2"] });
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe("Transformer");
    });

    it("should filter relations by type", () => {
      const result = service.query({ relationTypes: [RelationType.PRODUCES] });
      expect(result.relations).toHaveLength(1);
      expect(result.relations[0].type).toBe(RelationType.PRODUCES);
    });

    it("should respect the limit option", () => {
      const result = service.query({ limit: 2 });
      expect(result.entities).toHaveLength(2);
    });

    it("should include metadata with counts", () => {
      const result = service.query({});
      expect(result.metadata.totalEntities).toBe(3);
      expect(result.metadata.totalRelations).toBe(2);
    });
  });

  // ============================================================
  // findRelatedKnowledge
  // ============================================================

  describe("findRelatedKnowledge", () => {
    beforeEach(() => {
      service.addEntity(
        makeEntity("e1", "OpenAI GPT models", EntityType.TECHNOLOGY, ["t1"]),
      );
      service.addEntity(
        makeEntity("e2", "Microsoft Azure", EntityType.ORGANIZATION, ["t2"]),
      );
      service.addRelation(makeRelation("r1", "e1", "e2"));
    });

    it("should find entities matching query terms", () => {
      const result = service.findRelatedKnowledge("OpenAI");
      expect(result.entities.length).toBeGreaterThan(0);
      expect(result.entities[0].name).toContain("OpenAI");
    });

    it("should exclude entities belonging only to current topic", () => {
      const result = service.findRelatedKnowledge("OpenAI", "t1");
      // e1 is only in t1, should be excluded
      const hasE1 = result.entities.some((e) => e.id === "e1");
      expect(hasE1).toBe(false);
    });

    it("should include entities from cross-project topics", () => {
      // e2 belongs to t2, so it should appear for any topic query
      const result = service.findRelatedKnowledge("Microsoft", "t1");
      const hasE2 = result.entities.some((e) => e.id === "e2");
      expect(hasE2).toBe(true);
    });

    it("should return empty subgraph when no match", () => {
      const result = service.findRelatedKnowledge("blockchain quantum zebra");
      expect(result.entities).toHaveLength(0);
    });
  });

  // ============================================================
  // getStats
  // ============================================================

  describe("getStats", () => {
    it("should return correct stats for populated graph", () => {
      service.addEntity(makeEntity("e1", "OpenAI", EntityType.ORGANIZATION));
      service.addEntity(makeEntity("e2", "GPT-4", EntityType.PRODUCT));
      service.addRelation(
        makeRelation("r1", "e1", "e2", RelationType.PRODUCES),
      );

      const stats = service.getStats();

      expect(stats.totalEntities).toBe(2);
      expect(stats.totalRelations).toBe(1);
      expect(stats.entityTypeDistribution[EntityType.ORGANIZATION]).toBe(1);
      expect(stats.entityTypeDistribution[EntityType.PRODUCT]).toBe(1);
      expect(stats.relationTypeDistribution[RelationType.PRODUCES]).toBe(1);
      expect(stats.topConnectedEntities.length).toBeGreaterThan(0);
    });

    it("should return zeroed stats for empty graph", () => {
      const stats = service.getStats();
      expect(stats.totalEntities).toBe(0);
      expect(stats.totalRelations).toBe(0);
    });
  });

  // ============================================================
  // extractEntities
  // ============================================================

  describe("extractEntities", () => {
    it("should extract entities from AI response and persist them", async () => {
      mockAiFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          entities: [
            {
              name: "OpenAI",
              type: "organization",
              description: "AI research company",
              confidence: 0.95,
              aliases: ["Open AI"],
              properties: {},
            },
          ],
          relations: [],
        }),
      });

      const result = await service.extractEntities({
        content: "OpenAI is an AI research company.",
        topicId: "t1",
      });

      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe("OpenAI");

      // Entity should be persisted in the graph
      const graphResult = service.query({});
      expect(graphResult.entities.some((e) => e.name === "OpenAI")).toBe(true);
    });

    it("should return empty result on AI error", async () => {
      mockAiFacade.chat.mockRejectedValue(new Error("LLM error"));

      const result = await service.extractEntities({
        content: "Some content",
        topicId: "t1",
      });

      expect(result.entities).toHaveLength(0);
      expect(result.relations).toHaveLength(0);
    });

    it("should return empty result when AI response has no JSON", async () => {
      mockAiFacade.chat.mockResolvedValue({ content: "No JSON here" });

      const result = await service.extractEntities({
        content: "Some content",
        topicId: "t1",
      });

      expect(result.entities).toHaveLength(0);
    });

    it("should extract relations and link entities", async () => {
      mockAiFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          entities: [
            {
              name: "Google",
              type: "organization",
              description: "Tech giant",
              confidence: 0.9,
              aliases: [],
              properties: {},
            },
            {
              name: "Gemini",
              type: "product",
              description: "AI model",
              confidence: 0.9,
              aliases: [],
              properties: {},
            },
          ],
          relations: [
            {
              sourceName: "Google",
              targetName: "Gemini",
              type: "produces",
              description: "Google produces Gemini",
              strength: 0.9,
              confidence: 0.85,
            },
          ],
        }),
      });

      const result = await service.extractEntities({
        content: "Google produces Gemini AI model.",
        topicId: "t1",
      });

      expect(result.entities).toHaveLength(2);
      expect(result.relations).toHaveLength(1);

      const graphResult = service.query({});
      expect(graphResult.relations).toHaveLength(1);
    });
  });

  // ============================================================
  // clear
  // ============================================================

  describe("clear", () => {
    it("should remove all entities and relations", () => {
      service.addEntity(makeEntity("e1", "Test Entity"));
      service.addRelation(makeRelation("r1", "e1", "e1"));

      service.clear();

      const stats = service.getStats();
      expect(stats.totalEntities).toBe(0);
      expect(stats.totalRelations).toBe(0);
    });
  });
});
