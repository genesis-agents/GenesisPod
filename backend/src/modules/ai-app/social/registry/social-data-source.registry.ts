import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  Optional,
} from "@nestjs/common";
import { DiscoveryService } from "@nestjs/core";
import {
  SOCIAL_DATA_SOURCE_METADATA,
  SOCIAL_DATA_SOURCE_TOKEN,
  SocialDataSource,
  SocialDataSourceDescriptor,
} from "../../contracts/social-data-source";

@Injectable()
export class SocialDataSourceRegistry implements OnApplicationBootstrap {
  private readonly logger = new Logger(SocialDataSourceRegistry.name);
  private readonly sources = new Map<string, SocialDataSource>();

  constructor(
    @Optional()
    @Inject(SOCIAL_DATA_SOURCE_TOKEN)
    injected?: SocialDataSource[],
    @Optional()
    private readonly discoveryService?: DiscoveryService,
  ) {
    if (injected) {
      for (const src of injected) {
        this.register(src);
      }
    }
  }

  /**
   * 2026-05-19 修：onModuleInit → onApplicationBootstrap
   *   onModuleInit 在本模块依赖就绪时触发，跨模块的兄弟 provider 不保证已实例化，
   *   DiscoveryService.getProviders() 可能返回未就绪的 wrapper（instance=undefined）
   *   ——这正是 prod 上"数据源全部选不了"的根因（7 个 provider 全被过滤掉）。
   *   onApplicationBootstrap 在所有 module 的 onModuleInit 全部完成后触发，
   *   此时所有 @Injectable provider 都已实例化完毕，扫描结果可靠。
   */
  onApplicationBootstrap(): void {
    if (!this.discoveryService) {
      this.logger.debug(
        "DiscoveryService not available — only explicit/constructor-injected sources active",
      );
      return;
    }
    const providers = this.discoveryService.getProviders({
      metadataKey: SOCIAL_DATA_SOURCE_METADATA,
    });
    let discovered = 0;
    let skipped = 0;
    for (const wrapper of providers) {
      const instance = wrapper.instance;
      if (!instance || typeof instance !== "object") {
        skipped++;
        continue;
      }
      const candidate = instance as SocialDataSource;
      if (!candidate.id || typeof candidate.listItems !== "function") {
        skipped++;
        continue;
      }
      if (this.sources.has(candidate.id)) continue;
      this.register(candidate);
      discovered++;
    }
    this.logger.log(
      `Auto-discovered ${discovered} social data source(s) (${skipped} skipped); total registered: ${this.sources.size}`,
    );
  }

  register(source: SocialDataSource): void {
    if (this.sources.has(source.id)) {
      throw new Error(`Duplicate social data source id: ${source.id}`);
    }
    this.sources.set(source.id, source);
    this.logger.log(`Registered social data source: ${source.id}`);
  }

  get(id: string): SocialDataSource | undefined {
    return this.sources.get(id);
  }

  list(): SocialDataSource[] {
    return Array.from(this.sources.values());
  }

  listDescriptors(): SocialDataSourceDescriptor[] {
    return this.list().map(
      ({ listItems: _l, fetchBundle: _f, ...desc }) => desc,
    );
  }
}
