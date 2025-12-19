/**
 * Resource Manager
 * 资源管理器 - 整合多个资源提供者，提供统一的资源访问接口
 */

import { Injectable, Logger } from '@nestjs/common';
import { MCPResource, MCPAdapter } from '../mcp-adapter';
import {
  IResourceProvider,
  ResourceFilter,
  ResourceContent,
  ResourceEvent,
  ResourceEventType,
  ResourceEventCallback,
} from './resource-provider.interface';
import { FileResourceProvider, FileResourceProviderOptions } from './file-resource-provider';

// ============================================================================
// Types
// ============================================================================

/**
 * 资源管理器选项
 */
export interface ResourceManagerOptions {
  /** 是否自动注册到 MCP 适配器 */
  autoRegisterToAdapter?: boolean;
  /** 是否启用缓存 */
  enableCache?: boolean;
  /** 缓存 TTL (毫秒) */
  cacheTtl?: number;
}

/**
 * 缓存的资源
 */
interface CachedResource {
  resource: MCPResource;
  cachedAt: Date;
}

// ============================================================================
// Resource Manager
// ============================================================================

/**
 * 资源管理器
 * 管理多个资源提供者，提供统一的资源发现和访问接口
 *
 * @example
 * ```typescript
 * const manager = new ResourceManager(mcpAdapter);
 *
 * // 添加文件系统提供者
 * manager.addFileProvider({
 *   basePath: '/workspace/docs',
 *   include: ['*.md'],
 * });
 *
 * // 发现资源
 * const resources = await manager.discoverAll();
 *
 * // 读取资源
 * const content = await manager.read('file:///workspace/docs/readme.md');
 * ```
 */
@Injectable()
export class ResourceManager {
  private readonly logger = new Logger(ResourceManager.name);

  /** 资源提供者映射 (scheme -> provider) */
  private providers: Map<string, IResourceProvider> = new Map();

  /** 资源缓存 */
  private cache: Map<string, CachedResource> = new Map();

  /** 配置选项 */
  private options: Required<ResourceManagerOptions>;

  /** 事件监听器 */
  private eventListeners: Set<ResourceEventCallback> = new Set();

  constructor(private readonly mcpAdapter?: MCPAdapter) {
    this.options = {
      autoRegisterToAdapter: true,
      enableCache: true,
      cacheTtl: 60000, // 1 分钟
    };
  }

  // ============================================================================
  // Provider Management
  // ============================================================================

  /**
   * 添加资源提供者
   */
  addProvider(provider: IResourceProvider): void {
    if (this.providers.has(provider.scheme)) {
      this.logger.warn(`Provider for scheme '${provider.scheme}' already exists, replacing`);
    }

    this.providers.set(provider.scheme, provider);
    this.logger.log(`Added resource provider: ${provider.name} (${provider.scheme}://)`);

    // 设置事件监听
    if (provider.watch) {
      provider.watch((event) => this.handleProviderEvent(event));
    }
  }

  /**
   * 添加文件系统资源提供者
   */
  addFileProvider(options: FileResourceProviderOptions): FileResourceProvider {
    const provider = new FileResourceProvider(options);
    this.addProvider(provider);
    return provider;
  }

  /**
   * 移除资源提供者
   */
  removeProvider(scheme: string): boolean {
    const provider = this.providers.get(scheme);
    if (provider) {
      provider.unwatch?.();
      this.providers.delete(scheme);
      this.logger.log(`Removed resource provider: ${scheme}://`);
      return true;
    }
    return false;
  }

  /**
   * 获取资源提供者
   */
  getProvider(scheme: string): IResourceProvider | undefined {
    return this.providers.get(scheme);
  }

  /**
   * 获取所有资源提供者
   */
  getAllProviders(): IResourceProvider[] {
    return Array.from(this.providers.values());
  }

  // ============================================================================
  // Resource Operations
  // ============================================================================

  /**
   * 发现所有资源
   */
  async discoverAll(filter?: ResourceFilter): Promise<MCPResource[]> {
    const resources: MCPResource[] = [];

    for (const provider of this.providers.values()) {
      try {
        for await (const resource of provider.discover(filter)) {
          resources.push(resource);

          // 缓存资源
          if (this.options.enableCache) {
            this.cache.set(resource.uri, {
              resource,
              cachedAt: new Date(),
            });
          }

          // 自动注册到适配器
          if (this.options.autoRegisterToAdapter && this.mcpAdapter) {
            this.mcpAdapter.registerResource(resource);
          }

          // 检查数量限制
          if (filter?.limit && resources.length >= filter.limit) {
            return resources;
          }
        }
      } catch (error) {
        this.logger.error(`Error discovering resources from ${provider.name}:`, error);
      }
    }

    return resources;
  }

  /**
   * 从特定提供者发现资源
   */
  async discoverFromProvider(
    scheme: string,
    filter?: ResourceFilter,
  ): Promise<MCPResource[]> {
    const provider = this.providers.get(scheme);
    if (!provider) {
      throw new Error(`No provider for scheme: ${scheme}`);
    }

    const resources: MCPResource[] = [];
    for await (const resource of provider.discover(filter)) {
      resources.push(resource);

      if (this.options.enableCache) {
        this.cache.set(resource.uri, {
          resource,
          cachedAt: new Date(),
        });
      }

      if (this.options.autoRegisterToAdapter && this.mcpAdapter) {
        this.mcpAdapter.registerResource(resource);
      }
    }

    return resources;
  }

  /**
   * 读取资源内容
   */
  async read(uri: string): Promise<ResourceContent> {
    const scheme = this.getScheme(uri);
    const provider = this.providers.get(scheme);

    if (!provider) {
      throw new Error(`No provider for URI: ${uri}`);
    }

    return provider.read(uri);
  }

  /**
   * 检查资源是否存在
   */
  async exists(uri: string): Promise<boolean> {
    const scheme = this.getScheme(uri);
    const provider = this.providers.get(scheme);

    if (!provider) {
      return false;
    }

    return provider.exists(uri);
  }

  /**
   * 获取缓存的资源
   */
  getCached(uri: string): MCPResource | undefined {
    const cached = this.cache.get(uri);
    if (!cached) return undefined;

    // 检查缓存是否过期
    const age = Date.now() - cached.cachedAt.getTime();
    if (age > this.options.cacheTtl) {
      this.cache.delete(uri);
      return undefined;
    }

    return cached.resource;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.log('Resource cache cleared');
  }

  // ============================================================================
  // Event Management
  // ============================================================================

  /**
   * 添加事件监听器
   */
  onResourceEvent(callback: ResourceEventCallback): void {
    this.eventListeners.add(callback);
  }

  /**
   * 移除事件监听器
   */
  offResourceEvent(callback: ResourceEventCallback): void {
    this.eventListeners.delete(callback);
  }

  /**
   * 处理提供者事件
   */
  private handleProviderEvent(event: ResourceEvent): void {
    // 更新缓存
    if (event.type === ResourceEventType.REMOVED) {
      this.cache.delete(event.resource.uri);
      if (this.mcpAdapter) {
        this.mcpAdapter.unregisterResource(event.resource.uri);
      }
    } else {
      if (this.options.enableCache) {
        this.cache.set(event.resource.uri, {
          resource: event.resource,
          cachedAt: new Date(),
        });
      }
      if (this.options.autoRegisterToAdapter && this.mcpAdapter) {
        this.mcpAdapter.registerResource(event.resource);
      }
    }

    // 通知监听器
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (error) {
        this.logger.error('Error in resource event listener:', error);
      }
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * 从 URI 提取 scheme
   */
  private getScheme(uri: string): string {
    const match = uri.match(/^([a-z][a-z0-9+.-]*):\/\//i);
    return match ? match[1].toLowerCase() : 'file';
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    providers: number;
    cachedResources: number;
    providerDetails: Array<{ name: string; scheme: string }>;
  } {
    return {
      providers: this.providers.size,
      cachedResources: this.cache.size,
      providerDetails: Array.from(this.providers.values()).map((p) => ({
        name: p.name,
        scheme: p.scheme,
      })),
    };
  }
}
