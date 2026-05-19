import { SocialDataSourceRegistry } from "../social-data-source.registry";
import {
  SocialDataSource,
  SourceListFilter,
  SourceListResult,
  SourceContentBundle,
} from "../../../contracts/social-data-source";

function makeSource(id: string): SocialDataSource {
  return {
    id,
    displayName: { "zh-CN": `来源${id}`, "en-US": `Source ${id}` },
    icon: "icon-test",
    description: { "zh-CN": "描述", "en-US": "Description" },
    contentKinds: ["article"],
    maxItemsPerTask: 10,
    listItems: (
      _userId: string,
      _filter: SourceListFilter,
    ): Promise<SourceListResult> => Promise.resolve({ items: [] }),
    fetchBundle: (
      _itemIds: string[],
      _userId: string,
    ): Promise<SourceContentBundle[]> => Promise.resolve([]),
  };
}

describe("SocialDataSourceRegistry", () => {
  describe("single source: register / get / list / listDescriptors", () => {
    let registry: SocialDataSourceRegistry;

    beforeEach(() => {
      registry = new SocialDataSourceRegistry(undefined);
    });

    it("registers a source and retrieves it by id", () => {
      const src = makeSource("library");
      registry.register(src);

      expect(registry.get("library")).toBe(src);
    });

    it("list() returns all registered sources", () => {
      const src = makeSource("library");
      registry.register(src);

      expect(registry.list()).toEqual([src]);
    });

    it("listDescriptors() strips listItems and fetchBundle", () => {
      const src = makeSource("library");
      registry.register(src);

      const descriptors = registry.listDescriptors();
      expect(descriptors).toHaveLength(1);
      expect(descriptors[0]).not.toHaveProperty("listItems");
      expect(descriptors[0]).not.toHaveProperty("fetchBundle");
      expect(descriptors[0].id).toBe("library");
      expect(descriptors[0].displayName["zh-CN"]).toBe("来源library");
    });

    /**
     * 2026-05-19 prod 事故：真实 provider 类用 constructor 注入 PrismaService，
     *   `{...desc}` 把 prismaService 也带出去，JSON.stringify 撞 _originalClient 循环引用。
     *   单测必须模拟"有注入字段"的真实场景。
     */
    it("listDescriptors() only returns the 6 descriptor fields — no injected deps leak", () => {
      const fakePrisma = { _originalClient: null as unknown };
      fakePrisma._originalClient = fakePrisma; // 循环引用
      const srcWithInjected = {
        ...makeSource("real-like"),
        // 模拟真实 provider 类被实例化后会有的字段
        prismaService: fakePrisma,
        logger: { log: () => {} },
      };
      registry.register(srcWithInjected as unknown as SocialDataSource);

      const descriptors = registry.listDescriptors();
      expect(descriptors).toHaveLength(1);

      // 必须只有 SocialDataSourceDescriptor 的字段，不能有任何注入泄漏
      expect(Object.keys(descriptors[0]).sort()).toEqual([
        "contentKinds",
        "description",
        "displayName",
        "icon",
        "id",
        "maxItemsPerTask",
      ]);

      // 必须可以 JSON 序列化（这是 NestJS 自动 serialize 给前端的最终步骤）
      expect(() => JSON.stringify(descriptors)).not.toThrow();
    });

    it("get() returns undefined for unknown id", () => {
      expect(registry.get("nonexistent")).toBeUndefined();
    });

    it("list() returns empty array when no sources registered", () => {
      expect(registry.list()).toEqual([]);
    });
  });

  describe("duplicate id throws", () => {
    it("throws Error when registering duplicate id", () => {
      const registry = new SocialDataSourceRegistry(undefined);
      registry.register(makeSource("dup"));

      expect(() => registry.register(makeSource("dup"))).toThrow(
        "Duplicate social data source id: dup",
      );
    });
  });

  describe("multi-provider injection via constructor", () => {
    it("accepts array of sources injected via constructor", () => {
      const src1 = makeSource("source-a");
      const src2 = makeSource("source-b");

      const registry = new SocialDataSourceRegistry([src1, src2]);

      expect(registry.get("source-a")).toBe(src1);
      expect(registry.get("source-b")).toBe(src2);
      expect(registry.list()).toHaveLength(2);
    });

    it("throws when injected array contains duplicate ids", () => {
      const src1 = makeSource("dup");
      const src2 = makeSource("dup");

      expect(() => new SocialDataSourceRegistry([src1, src2])).toThrow(
        "Duplicate social data source id: dup",
      );
    });
  });

  describe("discovery-based auto-registration (onApplicationBootstrap)", () => {
    // 2026-05-19: registry 改用 Reflect.getMetadata 自己判定（不依赖 NestJS
    //   getProviders({metadataKey}) 因为后者只对 createDecorator 注册过的 key 生效），
    //   所以 mock 中 metatype 必须用 Reflect.defineMetadata 模拟真实装饰器行为。

    function tagSocial<T extends new (...args: never[]) => unknown>(
      metatype: T,
    ): T {
      Reflect.defineMetadata("genesis:social-data-source", true, metatype);
      return metatype;
    }

    it("registers providers found via DiscoveryService at bootstrap", () => {
      const srcA = makeSource("discovered-a");
      const srcB = makeSource("discovered-b");
      const mockDiscovery = {
        getProviders: jest.fn().mockReturnValue([
          { instance: srcA, metatype: tagSocial(class A {}) },
          { instance: srcB, metatype: tagSocial(class B {}) },
        ]),
      };

      const registry = new SocialDataSourceRegistry(
        undefined,
        mockDiscovery as never,
      );
      expect(registry.list()).toHaveLength(0); // not yet bootstrapped

      registry.onApplicationBootstrap();

      expect(registry.list()).toHaveLength(2);
      expect(registry.get("discovered-a")).toBe(srcA);
      expect(registry.get("discovered-b")).toBe(srcB);
    });

    it("skips wrappers whose instance is not yet ready (prod regression — 2026-05-19)", () => {
      const ready = makeSource("ready-one");
      const mockDiscovery = {
        getProviders: jest.fn().mockReturnValue([
          { instance: null, metatype: tagSocial(class A {}) }, // not instantiated yet
          { instance: undefined, metatype: tagSocial(class B {}) }, // same
          { instance: ready, metatype: tagSocial(class C {}) },
        ]),
      };

      const registry = new SocialDataSourceRegistry(
        undefined,
        mockDiscovery as never,
      );
      registry.onApplicationBootstrap();

      expect(registry.list()).toHaveLength(1);
      expect(registry.get("ready-one")).toBe(ready);
    });

    it("ignores providers without @SocialDataSourceProvider decorator", () => {
      const decorated = makeSource("decorated-one");
      const mockDiscovery = {
        getProviders: jest.fn().mockReturnValue([
          {
            instance: { id: "no-decorator", listItems: () => ({}) },
            metatype: class A {},
          }, // not tagged
          { instance: decorated, metatype: tagSocial(class B {}) },
        ]),
      };

      const registry = new SocialDataSourceRegistry(
        undefined,
        mockDiscovery as never,
      );
      registry.onApplicationBootstrap();

      expect(registry.list()).toHaveLength(1);
      expect(registry.get("decorated-one")).toBe(decorated);
    });

    it("ignores tagged objects missing SocialDataSource contract methods", () => {
      const mockDiscovery = {
        getProviders: jest.fn().mockReturnValue([
          {
            instance: { id: "fake", listItems: "not a function" },
            metatype: tagSocial(class A {}),
          },
          {
            instance: { listItems: () => Promise.resolve({ items: [] }) },
            metatype: tagSocial(class B {}),
          }, // no id
        ]),
      };

      const registry = new SocialDataSourceRegistry(
        undefined,
        mockDiscovery as never,
      );
      registry.onApplicationBootstrap();

      expect(registry.list()).toHaveLength(0);
    });

    it("no-ops when DiscoveryService is not provided (test mode)", () => {
      const registry = new SocialDataSourceRegistry(undefined, undefined);
      expect(() => registry.onApplicationBootstrap()).not.toThrow();
      expect(registry.list()).toHaveLength(0);
    });
  });
});
