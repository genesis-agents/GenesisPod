import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  ICapability,
  CapabilityMetadata,
  CapabilityCategory,
} from "./interfaces/capability.interface";

@Injectable()
export class CapabilityRegistryService implements OnModuleInit {
  private readonly logger = new Logger(CapabilityRegistryService.name);
  private readonly capabilities = new Map<string, ICapability>();
  private readonly metadataIndex = new Map<string, CapabilityMetadata>();

  async onModuleInit() {
    this.logger.log("CapabilityRegistry initialized");
  }

  /**
   * 注册能力
   */
  register(capability: ICapability): void {
    const metadata = capability.getMetadata();

    if (this.capabilities.has(metadata.id)) {
      this.logger.warn(
        `Capability ${metadata.id} already registered, replacing...`,
      );
    }

    this.capabilities.set(metadata.id, capability);
    this.metadataIndex.set(metadata.id, metadata);

    this.logger.log(`Registered capability: ${metadata.id} (${metadata.name})`);
  }

  /**
   * 批量注册
   */
  registerAll(capabilities: ICapability[]): void {
    capabilities.forEach((cap) => this.register(cap));
  }

  /**
   * 获取能力
   */
  get<TInput = unknown, TOutput = unknown>(
    id: string,
  ): ICapability<TInput, TOutput> | undefined {
    return this.capabilities.get(id) as
      | ICapability<TInput, TOutput>
      | undefined;
  }

  /**
   * 获取元数据
   */
  getMetadata(id: string): CapabilityMetadata | undefined {
    return this.metadataIndex.get(id);
  }

  /**
   * 列出所有能力
   */
  list(filter?: {
    category?: CapabilityCategory;
    provider?: string;
    tags?: string[];
    enabled?: boolean;
  }): CapabilityMetadata[] {
    let result = Array.from(this.metadataIndex.values());

    if (filter?.category) {
      result = result.filter((m) => m.category === filter.category);
    }
    if (filter?.provider) {
      result = result.filter((m) => m.provider === filter.provider);
    }
    if (filter?.tags?.length) {
      result = result.filter((m) =>
        filter.tags!.some((tag) => m.tags.includes(tag)),
      );
    }
    if (filter?.enabled !== undefined) {
      result = result.filter((m) => m.enabled === filter.enabled);
    }

    return result;
  }

  /**
   * 按分类分组
   */
  groupByCategory(): Record<CapabilityCategory, CapabilityMetadata[]> {
    const grouped: Record<CapabilityCategory, CapabilityMetadata[]> = {
      [CapabilityCategory.RESEARCH]: [],
      [CapabilityCategory.GENERATION]: [],
      [CapabilityCategory.COLLABORATION]: [],
      [CapabilityCategory.VISUAL]: [],
      [CapabilityCategory.ORCHESTRATION]: [],
    };

    for (const metadata of this.metadataIndex.values()) {
      grouped[metadata.category].push(metadata);
    }

    return grouped;
  }

  /**
   * 按提供者分组
   */
  groupByProvider(): Record<string, CapabilityMetadata[]> {
    const grouped: Record<string, CapabilityMetadata[]> = {};

    for (const metadata of this.metadataIndex.values()) {
      if (!grouped[metadata.provider]) {
        grouped[metadata.provider] = [];
      }
      grouped[metadata.provider].push(metadata);
    }

    return grouped;
  }

  /**
   * 检查能力是否存在
   */
  has(id: string): boolean {
    return this.capabilities.has(id);
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    total: number;
    byCategory: Record<CapabilityCategory, number>;
    byProvider: Record<string, number>;
    enabled: number;
    disabled: number;
  } {
    const byCategory: Record<CapabilityCategory, number> = {
      [CapabilityCategory.RESEARCH]: 0,
      [CapabilityCategory.GENERATION]: 0,
      [CapabilityCategory.COLLABORATION]: 0,
      [CapabilityCategory.VISUAL]: 0,
      [CapabilityCategory.ORCHESTRATION]: 0,
    };
    const byProvider: Record<string, number> = {};
    let enabled = 0;
    let disabled = 0;

    for (const metadata of this.metadataIndex.values()) {
      byCategory[metadata.category]++;
      byProvider[metadata.provider] = (byProvider[metadata.provider] || 0) + 1;
      if (metadata.enabled) {
        enabled++;
      } else {
        disabled++;
      }
    }

    return {
      total: this.capabilities.size,
      byCategory,
      byProvider,
      enabled,
      disabled,
    };
  }

  /**
   * 搜索能力
   */
  search(query: string): CapabilityMetadata[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.metadataIndex.values()).filter(
      (m) =>
        m.id.toLowerCase().includes(lowerQuery) ||
        m.name.toLowerCase().includes(lowerQuery) ||
        m.description.toLowerCase().includes(lowerQuery) ||
        m.tags.some((tag) => tag.toLowerCase().includes(lowerQuery)),
    );
  }
}
