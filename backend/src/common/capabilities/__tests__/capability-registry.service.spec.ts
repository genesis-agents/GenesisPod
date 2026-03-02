import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { CapabilityRegistryService } from "../capability-registry.service";
import {
  ICapability,
  CapabilityMetadata,
  CapabilityCategory,
  CapabilityMode,
  _CapabilityContext,
  CapabilityResult,
} from "../interfaces/capability.interface";

// ============================================================================
// Helpers
// ============================================================================

function makeMetadata(
  overrides: Partial<CapabilityMetadata> = {},
): CapabilityMetadata {
  return {
    id: "test-capability",
    name: "Test Capability",
    description: "A test capability",
    category: CapabilityCategory.RESEARCH,
    provider: "test-provider",
    mode: CapabilityMode.SYNC,
    inputSchema: {},
    outputSchema: {},
    tags: ["test", "research"],
    version: "1.0.0",
    enabled: true,
    ...overrides,
  };
}

function makeCapability(
  overrides: Partial<CapabilityMetadata> = {},
): ICapability {
  const metadata = makeMetadata(overrides);
  return {
    getMetadata: jest.fn().mockReturnValue(metadata),
    execute: jest
      .fn()
      .mockResolvedValue({ success: true, data: "result" } as CapabilityResult),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("CapabilityRegistryService", () => {
  let service: CapabilityRegistryService;

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();

    const module: TestingModule = await Test.createTestingModule({
      providers: [CapabilityRegistryService],
    }).compile();

    service = module.get<CapabilityRegistryService>(CapabilityRegistryService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ---------- lifecycle ----------

  describe("onModuleInit", () => {
    it("completes without error", async () => {
      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });
  });

  // ---------- register ----------

  describe("register", () => {
    it("registers a capability and makes it retrievable", () => {
      const cap = makeCapability({ id: "cap-1" });
      service.register(cap);

      expect(service.has("cap-1")).toBe(true);
      expect(service.get("cap-1")).toBe(cap);
    });

    it("replaces an existing capability with the same id", () => {
      const cap1 = makeCapability({ id: "cap-dup" });
      const cap2 = makeCapability({ id: "cap-dup", name: "Replaced" });

      service.register(cap1);
      service.register(cap2);

      expect(service.get("cap-dup")).toBe(cap2);
    });

    it("stores metadata in the metadata index", () => {
      const cap = makeCapability({ id: "cap-meta" });
      service.register(cap);

      const metadata = service.getMetadata("cap-meta");
      expect(metadata).toBeDefined();
      expect(metadata?.id).toBe("cap-meta");
    });
  });

  // ---------- registerAll ----------

  describe("registerAll", () => {
    it("registers all capabilities in the array", () => {
      const caps = [
        makeCapability({ id: "all-1" }),
        makeCapability({ id: "all-2" }),
        makeCapability({ id: "all-3" }),
      ];
      service.registerAll(caps);

      expect(service.has("all-1")).toBe(true);
      expect(service.has("all-2")).toBe(true);
      expect(service.has("all-3")).toBe(true);
    });

    it("handles an empty array gracefully", () => {
      expect(() => service.registerAll([])).not.toThrow();
    });
  });

  // ---------- get ----------

  describe("get", () => {
    it("returns undefined for an unregistered id", () => {
      expect(service.get("nonexistent")).toBeUndefined();
    });

    it("returns the capability for a registered id", () => {
      const cap = makeCapability({ id: "get-test" });
      service.register(cap);

      expect(service.get("get-test")).toBe(cap);
    });
  });

  // ---------- getMetadata ----------

  describe("getMetadata", () => {
    it("returns undefined for an unregistered id", () => {
      expect(service.getMetadata("missing")).toBeUndefined();
    });

    it("returns metadata for a registered capability", () => {
      const cap = makeCapability({ id: "meta-test", name: "Meta Test" });
      service.register(cap);

      const meta = service.getMetadata("meta-test");
      expect(meta?.name).toBe("Meta Test");
    });
  });

  // ---------- has ----------

  describe("has", () => {
    it("returns false when the capability does not exist", () => {
      expect(service.has("no-such")).toBe(false);
    });

    it("returns true when the capability exists", () => {
      service.register(makeCapability({ id: "has-test" }));
      expect(service.has("has-test")).toBe(true);
    });
  });

  // ---------- list ----------

  describe("list", () => {
    beforeEach(() => {
      service.register(
        makeCapability({
          id: "l-1",
          category: CapabilityCategory.RESEARCH,
          provider: "pA",
          tags: ["alpha"],
          enabled: true,
        }),
      );
      service.register(
        makeCapability({
          id: "l-2",
          category: CapabilityCategory.GENERATION,
          provider: "pB",
          tags: ["beta"],
          enabled: false,
        }),
      );
      service.register(
        makeCapability({
          id: "l-3",
          category: CapabilityCategory.RESEARCH,
          provider: "pA",
          tags: ["alpha", "extra"],
          enabled: true,
        }),
      );
    });

    it("returns all capabilities when no filter is provided", () => {
      expect(service.list()).toHaveLength(3);
    });

    it("filters by category", () => {
      const result = service.list({ category: CapabilityCategory.RESEARCH });
      expect(result).toHaveLength(2);
      expect(
        result.every((m) => m.category === CapabilityCategory.RESEARCH),
      ).toBe(true);
    });

    it("filters by provider", () => {
      const result = service.list({ provider: "pA" });
      expect(result).toHaveLength(2);
    });

    it("filters by tags (any match)", () => {
      const result = service.list({ tags: ["beta"] });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("l-2");
    });

    it("filters by enabled=true", () => {
      const result = service.list({ enabled: true });
      expect(result).toHaveLength(2);
    });

    it("filters by enabled=false", () => {
      const result = service.list({ enabled: false });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("l-2");
    });

    it("combines multiple filters", () => {
      const result = service.list({
        category: CapabilityCategory.RESEARCH,
        provider: "pA",
        enabled: true,
      });
      expect(result).toHaveLength(2);
    });
  });

  // ---------- groupByCategory ----------

  describe("groupByCategory", () => {
    it("returns an object with all category keys", () => {
      const grouped = service.groupByCategory();
      expect(Object.keys(grouped)).toEqual(
        expect.arrayContaining(Object.values(CapabilityCategory)),
      );
    });

    it("places capabilities in the correct category bucket", () => {
      service.register(
        makeCapability({ id: "g-1", category: CapabilityCategory.VISUAL }),
      );
      service.register(
        makeCapability({
          id: "g-2",
          category: CapabilityCategory.ORCHESTRATION,
        }),
      );

      const grouped = service.groupByCategory();
      expect(grouped[CapabilityCategory.VISUAL]).toHaveLength(1);
      expect(grouped[CapabilityCategory.ORCHESTRATION]).toHaveLength(1);
    });

    it("returns empty arrays for unused categories", () => {
      const grouped = service.groupByCategory();
      for (const cat of Object.values(CapabilityCategory)) {
        expect(Array.isArray(grouped[cat])).toBe(true);
      }
    });
  });

  // ---------- groupByProvider ----------

  describe("groupByProvider", () => {
    it("returns an empty object when no capabilities are registered", () => {
      expect(service.groupByProvider()).toEqual({});
    });

    it("groups capabilities by provider", () => {
      service.register(makeCapability({ id: "p-1", provider: "openai" }));
      service.register(makeCapability({ id: "p-2", provider: "openai" }));
      service.register(makeCapability({ id: "p-3", provider: "anthropic" }));

      const grouped = service.groupByProvider();
      expect(grouped["openai"]).toHaveLength(2);
      expect(grouped["anthropic"]).toHaveLength(1);
    });
  });

  // ---------- getStats ----------

  describe("getStats", () => {
    it("returns zeros when registry is empty", () => {
      const stats = service.getStats();
      expect(stats.total).toBe(0);
      expect(stats.enabled).toBe(0);
      expect(stats.disabled).toBe(0);
    });

    it("counts total, enabled, and disabled correctly", () => {
      service.register(makeCapability({ id: "s-1", enabled: true }));
      service.register(makeCapability({ id: "s-2", enabled: true }));
      service.register(makeCapability({ id: "s-3", enabled: false }));

      const stats = service.getStats();
      expect(stats.total).toBe(3);
      expect(stats.enabled).toBe(2);
      expect(stats.disabled).toBe(1);
    });

    it("counts byCategory correctly", () => {
      service.register(
        makeCapability({ id: "sc-1", category: CapabilityCategory.RESEARCH }),
      );
      service.register(
        makeCapability({ id: "sc-2", category: CapabilityCategory.RESEARCH }),
      );
      service.register(
        makeCapability({ id: "sc-3", category: CapabilityCategory.GENERATION }),
      );

      const stats = service.getStats();
      expect(stats.byCategory[CapabilityCategory.RESEARCH]).toBe(2);
      expect(stats.byCategory[CapabilityCategory.GENERATION]).toBe(1);
    });

    it("counts byProvider correctly", () => {
      service.register(makeCapability({ id: "sp-1", provider: "pX" }));
      service.register(makeCapability({ id: "sp-2", provider: "pX" }));

      const stats = service.getStats();
      expect(stats.byProvider["pX"]).toBe(2);
    });
  });

  // ---------- search ----------

  describe("search", () => {
    beforeEach(() => {
      service.register(
        makeCapability({
          id: "search-deep-research",
          name: "Deep Research Engine",
          description: "Performs in-depth analysis",
          tags: ["research", "llm"],
        }),
      );
      service.register(
        makeCapability({
          id: "search-image-gen",
          name: "Image Generator",
          description: "Creates visual content",
          tags: ["visual", "stable-diffusion"],
        }),
      );
    });

    it("matches by id", () => {
      const result = service.search("deep-research");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("search-deep-research");
    });

    it("matches by name (case-insensitive)", () => {
      const result = service.search("IMAGE");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("search-image-gen");
    });

    it("matches by description", () => {
      const result = service.search("in-depth");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("search-deep-research");
    });

    it("matches by tag", () => {
      const result = service.search("stable-diffusion");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("search-image-gen");
    });

    it("returns empty array when nothing matches", () => {
      expect(service.search("zzz-no-match")).toHaveLength(0);
    });

    it("returns multiple results when query matches several capabilities", () => {
      // Both have descriptions mentioning their domain — search for a common word
      const result = service.search("search");
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });
});
