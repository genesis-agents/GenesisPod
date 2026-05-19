import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import {
  SOCIAL_DATA_SOURCE_METADATA,
  SOCIAL_DATA_SOURCE_TOKEN,
  SocialDataSource,
  SocialDataSourceDescriptor,
} from '../../contracts/social-data-source';

@Injectable()
export class SocialDataSourceRegistry implements OnModuleInit {
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

  onModuleInit(): void {
    if (!this.discoveryService) {
      this.logger.debug(
        'DiscoveryService not available — only explicit/constructor-injected sources active',
      );
      return;
    }
    const providers = this.discoveryService.getProviders({
      metadataKey: SOCIAL_DATA_SOURCE_METADATA,
    });
    let discovered = 0;
    for (const wrapper of providers) {
      const instance = wrapper.instance;
      if (!instance || typeof instance !== 'object') continue;
      const candidate = instance as SocialDataSource;
      if (!candidate.id || typeof candidate.listItems !== 'function') continue;
      if (this.sources.has(candidate.id)) continue;
      this.register(candidate);
      discovered++;
    }
    this.logger.log(
      `Auto-discovered ${discovered} social data source(s); total registered: ${this.sources.size}`,
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
