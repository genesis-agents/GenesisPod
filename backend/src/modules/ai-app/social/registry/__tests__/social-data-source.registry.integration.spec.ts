/**
 * SocialDataSourceRegistry — REAL NestJS DI integration spec
 *
 * 2026-05-19：用户报告 prod 上 7 个 provider 一个都没发现。
 * 用真实 NestJS Test 模块 + DiscoveryModule + 真实 provider 类（带 @SocialDataSourceProvider
 * 装饰器）—— 验证完整链路：
 *   class metadata → DiscoveryService.getProviders({metadataKey}) → registry.list()
 *
 * 如果本测试通过但 prod 仍空，则问题在部署 / 模块加载顺序。
 */

import { Test, TestingModule } from "@nestjs/testing";
import { DiscoveryModule } from "@nestjs/core";
import { Injectable } from "@nestjs/common";
import { SocialDataSourceRegistry } from "../social-data-source.registry";
import {
  SocialDataSource,
  SocialDataSourceProvider,
  SourceContentBundle,
  SourceListFilter,
  SourceListResult,
} from "../../../contracts/social-data-source";

@Injectable()
@SocialDataSourceProvider()
class FakeWritingProvider implements SocialDataSource {
  readonly id = "AI_WRITING_FAKE";
  readonly displayName = { "zh-CN": "写作 Fake", "en-US": "Writing Fake" };
  readonly icon = "PenLine";
  readonly description = { "zh-CN": "写作", "en-US": "Writing" };
  readonly contentKinds = ["article"] as const;
  listItems(
    _userId: string,
    _filter: SourceListFilter,
  ): Promise<SourceListResult> {
    return Promise.resolve({ items: [] });
  }
  fetchBundle(_ids: string[], _userId: string): Promise<SourceContentBundle[]> {
    return Promise.resolve([]);
  }
}

@Injectable()
@SocialDataSourceProvider()
class FakeResearchProvider implements SocialDataSource {
  readonly id = "AI_RESEARCH_FAKE";
  readonly displayName = { "zh-CN": "研究 Fake", "en-US": "Research Fake" };
  readonly icon = "FlaskConical";
  readonly description = { "zh-CN": "研究", "en-US": "Research" };
  readonly contentKinds = ["report"] as const;
  listItems(): Promise<SourceListResult> {
    return Promise.resolve({ items: [] });
  }
  fetchBundle(): Promise<SourceContentBundle[]> {
    return Promise.resolve([]);
  }
}

@Injectable()
class UnrelatedProvider {
  doSomething() {
    return "I am NOT a social data source";
  }
}

describe("SocialDataSourceRegistry — real NestJS DI integration", () => {
  let module: TestingModule;
  let registry: SocialDataSourceRegistry;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [DiscoveryModule],
      providers: [
        SocialDataSourceRegistry,
        FakeWritingProvider,
        FakeResearchProvider,
        UnrelatedProvider,
      ],
    }).compile();

    await module.init(); // triggers onModuleInit
    // Test 模块默认不调 onApplicationBootstrap — 手动 trigger
    registry = module.get(SocialDataSourceRegistry);

    // DEBUG: inspect what DiscoveryService sees
    const { DiscoveryService } = await import("@nestjs/core");
    const discovery = module.get(DiscoveryService);
    const allProviders = discovery.getProviders();
    // eslint-disable-next-line no-console
    console.log(
      "[DEBUG] DiscoveryService.getProviders() count:",
      allProviders.length,
    );
    for (const w of allProviders) {
      const name = w.metatype?.name ?? "(anonymous)";
      const hasMeta = w.metatype
        ? Reflect.getMetadata("genesis:social-data-source", w.metatype)
        : false;
      // eslint-disable-next-line no-console
      console.log(
        `[DEBUG]  - ${name} instance=${!!w.instance} metaSocial=${hasMeta}`,
      );
    }

    // Manually call bootstrap (Test framework doesn't auto-fire it)
    registry.onApplicationBootstrap();
  });

  afterAll(async () => {
    await module.close();
  });

  it("discovers exactly the providers decorated with @SocialDataSourceProvider", () => {
    const ids = registry
      .list()
      .map((s) => s.id)
      .sort();
    expect(ids).toEqual(["AI_RESEARCH_FAKE", "AI_WRITING_FAKE"]);
  });

  it("listDescriptors() strips listItems/fetchBundle but keeps metadata", () => {
    const descriptors = registry.listDescriptors();
    expect(descriptors).toHaveLength(2);
    for (const d of descriptors) {
      expect(d).not.toHaveProperty("listItems");
      expect(d).not.toHaveProperty("fetchBundle");
      expect(d.icon).toBeDefined();
      expect(d.displayName).toBeDefined();
    }
  });

  it("ignores UnrelatedProvider (no @SocialDataSourceProvider decorator)", () => {
    const ids = registry.list().map((s) => s.id);
    expect(ids).not.toContain("UnrelatedProvider");
    expect(ids).not.toContain(undefined);
  });

  it("get() returns the actual instance with working methods", async () => {
    const writing = registry.get("AI_WRITING_FAKE");
    expect(writing).toBeDefined();
    const result = await writing!.listItems("user-1", {});
    expect(result.items).toEqual([]);
  });
});
