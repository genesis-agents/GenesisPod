/**
 * Ontology Builder Skill - Round-trip Integration Test (Knowledge Ontology v1)
 *
 * Two-phase integration test validating the full "write -> read" chain:
 *
 * Phase A (Mission A semantic): OntologyBuilderSkill receives a text passage.
 *   Mocked LLM returns 2 entities + 1 relation. Skill writes them via the
 *   ontology-upsert-object / ontology-add-link tools -> OntologyService -> in-memory
 *   Prisma mock. Asserts: OntologyObject/Link/Edit rows persisted.
 *
 * Phase B (Mission B semantic): OntologyService.querySubgraphByTopic() reads the
 *   same topic. mapSubgraphToContextPackage() produces a MissionContextPackage.
 *   Asserts: entities list contains both written nodes with correct relations,
 *   proving "accumulated knowledge becomes mission context" (compound value loop).
 *
 * Design:
 * - Zero real I/O: Prisma mocked via in-memory Maps, LLM mocked with fixed JSON,
 *   EmbeddingService mocked with orthogonal unit vectors (no cross-entity merging).
 * - Services instantiated directly (no NestJS Test module) for clarity.
 * - ToolRegistry wired manually so BaseSkill.callTool() works end-to-end.
 * - Test file lives in __tests__/ so it is excluded from architecture boundary
 *   scans (listTsFiles in layer-boundaries.spec.ts skips __tests__/ directories).
 */

import { OntologyService } from "../ontology.service";
import {
  OntologyBuilderSkill,
  OntologyBuilderInput,
} from "../skills/ontology-builder.skill";
import { EntityResolutionService } from "../../entity-resolution/entity-resolution.service";
import { OntologyUpsertObjectTool } from "@/modules/ai-engine/tools/categories/information/knowledge/ontology/upsert-object.tool";
import { OntologyAddLinkTool } from "@/modules/ai-engine/tools/categories/information/knowledge/ontology/add-link.tool";
import { ToolRegistry } from "@/modules/ai-engine/tools/registry";
import { mapSubgraphToContextPackage } from "@/modules/ai-app/teams/services/collaboration/mission/ontology-context.mapper";
import type { EmbeddingService } from "@/modules/ai-engine/rag/embedding";
import type { AiChatService } from "@/modules/ai-engine/facade";
import type { PrismaService } from "@/common/prisma/prisma.service";
import type { SkillContext } from "@/modules/ai-engine/skills/abstractions/skill.interface";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOPIC_ID = "topic-test-roundtrip-001";
const SOURCE_ID = "source-test-001";

// ---------------------------------------------------------------------------
// Mocked LLM extraction payload
// The skill's AiChatService.chat() mock returns this JSON string.
// OntologyBuilderSkill.parseJsonResponse parses it into LLMExtractionResult.
// ---------------------------------------------------------------------------

const LLM_EXTRACTION_JSON = JSON.stringify({
  entities: [
    {
      typeKey: "company",
      label: "OpenAI",
      aliases: [],
      properties: { industry: "AI" },
      confidence: 0.95,
    },
    {
      typeKey: "technology",
      label: "GPT-4",
      aliases: [],
      properties: { type: "LLM" },
      confidence: 0.9,
    },
  ],
  relations: [
    {
      fromLabel: "OpenAI",
      toLabel: "GPT-4",
      linkTypeKey: "developed",
      properties: {},
      confidence: 0.92,
    },
  ],
});

// ---------------------------------------------------------------------------
// In-memory Prisma mock
// Implements the subset of PrismaClient used by OntologyService.
// ---------------------------------------------------------------------------

interface OntologyObjectRow {
  id: string;
  topicId: string | null;
  typeKey: string;
  label: string;
  aliases: unknown; // Prisma.JsonValue stored as string[]
  properties: unknown; // Prisma.JsonValue stored as Record<string, unknown>
  confidence: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface OntologyLinkRow {
  id: string;
  topicId: string | null;
  linkTypeKey: string;
  fromId: string;
  toId: string;
  properties: unknown;
  confidence: number;
  createdAt: Date;
}

interface OntologyEditRow {
  id: string;
  objectId: string | null;
  linkId: string | null;
  action: string;
  actorType: string;
  actorId: string;
  before: unknown;
  after: unknown;
  reason: string | null;
  evidenceId: string | null;
  createdAt: Date;
}

let idCounter = 0;
function nextId(): string {
  return `test-id-${++idCounter}`;
}

function buildInMemoryPrisma() {
  const objectStore = new Map<string, OntologyObjectRow>();
  const linkStore = new Map<string, OntologyLinkRow>();
  const editStore: OntologyEditRow[] = [];

  const ontologyObject = {
    findFirst: jest.fn(
      async ({ where }: { where: Record<string, unknown> }) => {
        for (const row of objectStore.values()) {
          const matchTopicId =
            where.topicId === undefined || row.topicId === where.topicId;
          const matchTypeKey =
            where.typeKey === undefined || row.typeKey === where.typeKey;
          const matchLabel =
            where.label === undefined || row.label === where.label;
          if (matchTopicId && matchTypeKey && matchLabel) return row;
        }
        return null;
      },
    ),

    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
      return objectStore.get(where.id) ?? null;
    }),

    findMany: jest.fn(
      async ({
        where,
        take,
      }: {
        where?: { topicId?: string };
        orderBy?: unknown;
        take?: number;
      }) => {
        let rows = Array.from(objectStore.values());
        if (where?.topicId !== undefined) {
          rows = rows.filter((r) => r.topicId === where.topicId);
        }
        if (take !== undefined) rows = rows.slice(0, take);
        return rows;
      },
    ),

    create: jest.fn(async ({ data }: { data: Partial<OntologyObjectRow> }) => {
      const row: OntologyObjectRow = {
        id: nextId(),
        topicId: data.topicId ?? null,
        typeKey: data.typeKey!,
        label: data.label!,
        aliases: data.aliases ?? [],
        properties: data.properties ?? {},
        confidence: data.confidence ?? 1.0,
        createdBy: data.createdBy ?? "",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      objectStore.set(row.id, row);
      return row;
    }),

    update: jest.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<OntologyObjectRow>;
      }) => {
        const existing = objectStore.get(where.id);
        if (!existing) throw new Error(`Object ${where.id} not found`);
        const updated: OntologyObjectRow = {
          ...existing,
          ...(data.aliases !== undefined ? { aliases: data.aliases } : {}),
          ...(data.properties !== undefined
            ? { properties: data.properties }
            : {}),
          ...(data.confidence !== undefined
            ? { confidence: data.confidence }
            : {}),
          updatedAt: data.updatedAt ?? new Date(),
        };
        objectStore.set(where.id, updated);
        return updated;
      },
    ),
  };

  const ontologyLink = {
    findUnique: jest.fn(
      async ({
        where,
      }: {
        where: {
          fromId_toId_linkTypeKey: {
            fromId: string;
            toId: string;
            linkTypeKey: string;
          };
        };
      }) => {
        const { fromId, toId, linkTypeKey } = where.fromId_toId_linkTypeKey;
        for (const row of linkStore.values()) {
          if (
            row.fromId === fromId &&
            row.toId === toId &&
            row.linkTypeKey === linkTypeKey
          ) {
            return row;
          }
        }
        return null;
      },
    ),

    findMany: jest.fn(
      async ({
        where,
      }: {
        where?: {
          fromId?: { in?: string[] };
          toId?: { in?: string[] };
        };
      }) => {
        let rows = Array.from(linkStore.values());
        if (where?.fromId?.in) {
          const fromSet = new Set(where.fromId.in);
          rows = rows.filter((r) => fromSet.has(r.fromId));
        }
        if (where?.toId?.in) {
          const toSet = new Set(where.toId.in);
          rows = rows.filter((r) => toSet.has(r.toId));
        }
        return rows;
      },
    ),

    create: jest.fn(async ({ data }: { data: Partial<OntologyLinkRow> }) => {
      const row: OntologyLinkRow = {
        id: nextId(),
        topicId: data.topicId ?? null,
        linkTypeKey: data.linkTypeKey!,
        fromId: data.fromId!,
        toId: data.toId!,
        properties: data.properties ?? {},
        confidence: data.confidence ?? 1.0,
        createdAt: new Date(),
      };
      linkStore.set(row.id, row);
      return row;
    }),

    update: jest.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<OntologyLinkRow>;
      }) => {
        const existing = linkStore.get(where.id);
        if (!existing) throw new Error(`Link ${where.id} not found`);
        const updated = { ...existing, ...data };
        linkStore.set(where.id, updated);
        return updated;
      },
    ),
  };

  const ontologyEdit = {
    create: jest.fn(async ({ data }: { data: Partial<OntologyEditRow> }) => {
      editStore.push({
        id: nextId(),
        objectId: data.objectId ?? null,
        linkId: data.linkId ?? null,
        action: data.action!,
        actorType: data.actorType!,
        actorId: data.actorId!,
        before: data.before ?? null,
        after: data.after ?? null,
        reason: data.reason ?? null,
        evidenceId: data.evidenceId ?? null,
        createdAt: new Date(),
      });
    }),
  };

  const prismaMock: Record<string, unknown> = {
    ontologyObject,
    ontologyLink,
    ontologyEdit,
  };
  // callback-form $transaction: 用同一内存 client 当 tx 跑回调（service 的 upsertObject 用事务原子化）
  prismaMock.$transaction = async (fn: (tx: unknown) => unknown) =>
    fn(prismaMock);

  return {
    prisma: prismaMock as unknown as PrismaService,
    objectStore,
    linkStore,
    editStore,
  };
}

// ---------------------------------------------------------------------------
// Mocked EmbeddingService
// Each label maps to a distinct orthogonal vector so entity resolution never
// merges distinct entities (cosine similarity = 0 < default threshold 0.85).
// ---------------------------------------------------------------------------

const EMBEDDING_VECTORS: Record<string, number[]> = {
  openai: [1, 0, 0, 0],
  "gpt-4": [0, 1, 0, 0],
};

function buildMockEmbeddingService(): EmbeddingService {
  return {
    generateEmbeddings: jest.fn(async (texts: string[]) => ({
      texts,
      embeddings: texts.map(
        (t) => EMBEDDING_VECTORS[t.toLowerCase()] ?? [0, 0, 0, 1],
      ),
      totalTokens: texts.length,
    })),
  } as unknown as EmbeddingService;
}

// ---------------------------------------------------------------------------
// Mocked AiChatService
// Returns the fixed LLM_EXTRACTION_JSON for any call.
// ---------------------------------------------------------------------------

function buildMockAiChatService(): AiChatService {
  return {
    chat: jest.fn(async () => ({
      content: LLM_EXTRACTION_JSON,
      model: "mock-model",
      tokensUsed: 100,
    })),
  } as unknown as AiChatService;
}

// ---------------------------------------------------------------------------
// Skill context factory
// ---------------------------------------------------------------------------

function buildSkillContext(): SkillContext {
  return {
    executionId: "test-exec-roundtrip",
    skillId: "knowledge.ontology-builder",
    createdAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Ontology Builder Round-trip Integration (write -> read -> context)", () => {
  // Shared in-memory DB: persists across Phase A and Phase B tests.
  let ontologyService: OntologyService;
  let skill: OntologyBuilderSkill;
  let storeRef: ReturnType<typeof buildInMemoryPrisma>;

  beforeAll(() => {
    idCounter = 0; // reset ID counter for this suite

    storeRef = buildInMemoryPrisma();
    const embeddingService = buildMockEmbeddingService();
    const mockChatService = buildMockAiChatService();

    // Wire EntityResolutionService with mocked embeddings
    const entityResolution = new EntityResolutionService(embeddingService);

    // Wire OntologyService with in-memory Prisma + entity resolution
    ontologyService = new OntologyService(storeRef.prisma, entityResolution);

    // Wire action tools with the OntologyService
    const upsertTool = new OntologyUpsertObjectTool(ontologyService);
    const addLinkTool = new OntologyAddLinkTool(ontologyService);

    // Register tools in ToolRegistry so BaseSkill.callTool() can resolve them
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(upsertTool);
    toolRegistry.register(addLinkTool);

    // Wire skill with mock chat service + entity resolution + tool registry
    skill = new OntologyBuilderSkill(mockChatService, entityResolution);
    skill.setToolRegistry(toolRegistry);
  });

  // ==========================================================================
  // Phase A: Mission A - LLM extraction -> write ontology objects + links
  // ==========================================================================

  describe("Phase A: OntologyBuilderSkill writes entities + relation to DB", () => {
    let skillResult: Awaited<ReturnType<typeof skill.execute>>;

    beforeAll(async () => {
      const input: OntologyBuilderInput = {
        text: "OpenAI developed GPT-4, a state-of-the-art large language model.",
        topicId: TOPIC_ID,
        sourceType: "manual",
        sourceId: SOURCE_ID,
      };
      skillResult = await skill.execute(input, buildSkillContext());
    });

    it("skill execution succeeds", () => {
      expect(skillResult.success).toBe(true);
    });

    it("created count is 2 (one per extracted entity)", () => {
      expect(skillResult.data?.created).toBe(2);
    });

    it("linked count is 1 (one extracted relation)", () => {
      expect(skillResult.data?.linked).toBe(1);
    });

    it("returned node views include both entity labels", () => {
      const labels = (skillResult.data?.nodes ?? []).map((n) => n.label);
      expect(labels).toContain("OpenAI");
      expect(labels).toContain("GPT-4");
    });

    it("returned edge view has correct linkTypeKey 'developed'", () => {
      const edges = skillResult.data?.edges ?? [];
      expect(edges).toHaveLength(1);
      expect(edges[0].linkTypeKey).toBe("developed");
    });

    it("2 OntologyObject rows persisted in the in-memory store", () => {
      expect(storeRef.objectStore.size).toBe(2);
    });

    it("1 OntologyLink row persisted in the in-memory store", () => {
      expect(storeRef.linkStore.size).toBe(1);
    });

    it("3 OntologyEdit audit rows written (2 object creates + 1 link create)", () => {
      expect(storeRef.editStore.length).toBe(3);
    });

    it("all OntologyEdit actions are 'create'", () => {
      const actions = storeRef.editStore.map((e) => e.action);
      expect(actions.every((a) => a === "create")).toBe(true);
    });

    it("persisted node topicIds match the input topicId", () => {
      const topicIds = Array.from(storeRef.objectStore.values()).map(
        (o) => o.topicId,
      );
      expect(topicIds.every((t) => t === TOPIC_ID)).toBe(true);
    });

    it("OntologyLink connects OpenAI node (from) to GPT-4 node (to)", () => {
      const [link] = Array.from(storeRef.linkStore.values());
      const fromNode = storeRef.objectStore.get(link.fromId);
      const toNode = storeRef.objectStore.get(link.toId);
      expect(fromNode?.label).toBe("OpenAI");
      expect(toNode?.label).toBe("GPT-4");
    });
  });

  // ==========================================================================
  // Phase B: Mission B - read subgraph -> MissionContextPackage (compound read-back)
  // ==========================================================================

  describe("Phase B: querySubgraphByTopic -> mapSubgraphToContextPackage", () => {
    let pkg: ReturnType<typeof mapSubgraphToContextPackage>;

    beforeAll(async () => {
      // Phase B reads from the same in-memory store written in Phase A.
      const subgraph = await ontologyService.querySubgraphByTopic(TOPIC_ID);
      pkg = mapSubgraphToContextPackage(subgraph);
    });

    it("MissionContextPackage version is '1.0'", () => {
      expect(pkg.version).toBe("1.0");
    });

    it("entities list has 2 entries (both nodes pass MIN_NODE_CONFIDENCE 0.6)", () => {
      // OpenAI confidence = 0.95; GPT-4 confidence = 0.90 -- both >= 0.6
      expect(pkg.entities).toHaveLength(2);
    });

    it("entities contain an OpenAI entry with type 'company'", () => {
      const openai = pkg.entities.find((e) => e.name === "OpenAI");
      expect(openai).toBeDefined();
      expect(openai?.type).toBe("company");
    });

    it("entities contain a GPT-4 entry with type 'technology'", () => {
      const gpt4 = pkg.entities.find((e) => e.name === "GPT-4");
      expect(gpt4).toBeDefined();
      expect(gpt4?.type).toBe("technology");
    });

    it("OpenAI entity has a 'developed' relation pointing to GPT-4 (link confidence 0.92 >= 0.7)", () => {
      const openai = pkg.entities.find((e) => e.name === "OpenAI");
      const devRel = openai?.relations?.find((r) => r.relation === "developed");
      expect(devRel).toBeDefined();
      expect(devRel?.target).toBe("GPT-4");
    });

    it("package extensions.provenance equals 'ontology'", () => {
      expect(pkg.extensions?.["provenance"]).toBe("ontology");
    });

    it("both high-confidence nodes (>= 0.85) contribute EstablishedFacts (2 facts)", () => {
      // OpenAI: 0.95 >= 0.85; GPT-4: 0.90 >= 0.85
      expect(pkg.establishedFacts).toHaveLength(2);
    });
  });
});
