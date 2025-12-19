/**
 * Resource Provider Interface
 * 资源提供者接口 - 用于动态发现和管理资源
 */

import { MCPResource } from '../mcp-adapter';

// ============================================================================
// Types
// ============================================================================

/**
 * 资源事件类型
 */
export enum ResourceEventType {
  ADDED = 'added',
  REMOVED = 'removed',
  UPDATED = 'updated',
}

/**
 * 资源事件
 */
export interface ResourceEvent {
  type: ResourceEventType;
  resource: MCPResource;
  timestamp: Date;
}

/**
 * 资源过滤器
 */
export interface ResourceFilter {
  /** URI 模式 (glob) */
  uriPattern?: string;
  /** MIME 类型 */
  mimeType?: string;
  /** 名称包含 */
  nameContains?: string;
  /** 最大数量 */
  limit?: number;
}

/**
 * 资源内容
 */
export interface ResourceContent {
  /** 资源 URI */
  uri: string;
  /** MIME 类型 */
  mimeType: string;
  /** 文本内容 (文本类型) */
  text?: string;
  /** 二进制内容 (Base64) */
  blob?: string;
}

/**
 * 资源事件回调
 */
export type ResourceEventCallback = (event: ResourceEvent) => void;

// ============================================================================
// Resource Provider Interface
// ============================================================================

/**
 * 资源提供者接口
 * 用于实现自定义资源发现和管理
 */
export interface IResourceProvider {
  /** 提供者名称 */
  readonly name: string;

  /** 支持的 URI scheme (如 file://, db://) */
  readonly scheme: string;

  /**
   * 发现资源
   * 返回异步生成器，支持大量资源的懒加载
   *
   * @param filter 过滤条件
   */
  discover(filter?: ResourceFilter): AsyncGenerator<MCPResource>;

  /**
   * 读取资源内容
   *
   * @param uri 资源 URI
   */
  read(uri: string): Promise<ResourceContent>;

  /**
   * 检查资源是否存在
   *
   * @param uri 资源 URI
   */
  exists(uri: string): Promise<boolean>;

  /**
   * 监听资源变化
   *
   * @param callback 事件回调
   */
  watch?(callback: ResourceEventCallback): void;

  /**
   * 停止监听
   */
  unwatch?(): void;
}

// ============================================================================
// Base Resource Provider
// ============================================================================

/**
 * 资源提供者基类
 */
export abstract class BaseResourceProvider implements IResourceProvider {
  abstract readonly name: string;
  abstract readonly scheme: string;

  protected watchers: Set<ResourceEventCallback> = new Set();

  abstract discover(filter?: ResourceFilter): AsyncGenerator<MCPResource>;
  abstract read(uri: string): Promise<ResourceContent>;
  abstract exists(uri: string): Promise<boolean>;

  watch(callback: ResourceEventCallback): void {
    this.watchers.add(callback);
  }

  unwatch(): void {
    this.watchers.clear();
  }

  protected emit(event: ResourceEvent): void {
    for (const callback of this.watchers) {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in resource event callback:', error);
      }
    }
  }

  /**
   * 匹配 glob 模式
   */
  protected matchGlob(uri: string, pattern: string): boolean {
    // 简单的 glob 匹配实现
    const regexPattern = pattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '.');
    return new RegExp(`^${regexPattern}$`).test(uri);
  }
}
