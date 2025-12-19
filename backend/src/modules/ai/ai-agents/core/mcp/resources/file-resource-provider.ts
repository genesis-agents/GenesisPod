/**
 * File Resource Provider
 * 文件系统资源提供者 - 从文件系统发现和读取资源
 */

import { Logger } from '@nestjs/common';
import { MCPResource } from '../mcp-adapter';
import {
  BaseResourceProvider,
  ResourceFilter,
  ResourceContent,
  ResourceEventType,
} from './resource-provider.interface';
import * as fs from 'fs/promises';
import * as path from 'path';
import { watch, FSWatcher } from 'fs';

// ============================================================================
// Types
// ============================================================================

/**
 * 文件资源提供者选项
 */
export interface FileResourceProviderOptions {
  /** 基础路径 */
  basePath: string;
  /** 包含的文件模式 */
  include?: string[];
  /** 排除的文件模式 */
  exclude?: string[];
  /** 是否递归扫描 */
  recursive?: boolean;
  /** 最大文件大小 (字节) */
  maxFileSize?: number;
  /** 是否启用监听 */
  enableWatch?: boolean;
}

/**
 * MIME 类型映射
 */
const MIME_TYPES: Record<string, string> = {
  // 文档
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
  '.html': 'text/html',
  '.css': 'text/css',

  // 代码
  '.js': 'application/javascript',
  '.ts': 'application/typescript',
  '.py': 'text/x-python',
  '.java': 'text/x-java',
  '.go': 'text/x-go',
  '.rs': 'text/x-rust',
  '.c': 'text/x-c',
  '.cpp': 'text/x-c++',
  '.h': 'text/x-c',

  // 数据
  '.csv': 'text/csv',
  '.sql': 'application/sql',

  // 二进制
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.zip': 'application/zip',
};

// ============================================================================
// File Resource Provider
// ============================================================================

/**
 * 文件系统资源提供者
 * 从文件系统发现和读取资源
 *
 * @example
 * ```typescript
 * const provider = new FileResourceProvider({
 *   basePath: '/workspace/docs',
 *   include: ['*.md', '*.txt'],
 *   recursive: true,
 * });
 *
 * for await (const resource of provider.discover()) {
 *   console.log(resource.uri, resource.name);
 * }
 * ```
 */
export class FileResourceProvider extends BaseResourceProvider {
  readonly name = 'file';
  readonly scheme = 'file';

  private readonly logger = new Logger(FileResourceProvider.name);
  private readonly options: Required<FileResourceProviderOptions>;
  private fsWatcher?: FSWatcher;

  constructor(options: FileResourceProviderOptions) {
    super();
    this.options = {
      basePath: options.basePath,
      include: options.include || ['*'],
      exclude: options.exclude || ['node_modules', '.git', '.DS_Store'],
      recursive: options.recursive ?? true,
      maxFileSize: options.maxFileSize || 10 * 1024 * 1024, // 10MB
      enableWatch: options.enableWatch ?? false,
    };
  }

  /**
   * 发现资源
   */
  async *discover(filter?: ResourceFilter): AsyncGenerator<MCPResource> {
    let count = 0;
    const limit = filter?.limit || Infinity;

    yield* this.scanDirectory(this.options.basePath, filter, count, limit);
  }

  /**
   * 递归扫描目录
   */
  private async *scanDirectory(
    dirPath: string,
    filter: ResourceFilter | undefined,
    count: number,
    limit: number,
  ): AsyncGenerator<MCPResource> {
    if (count >= limit) return;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (count >= limit) return;

        const fullPath = path.join(dirPath, entry.name);

        // 检查排除模式
        if (this.isExcluded(entry.name)) {
          continue;
        }

        if (entry.isDirectory() && this.options.recursive) {
          yield* this.scanDirectory(fullPath, filter, count, limit);
        } else if (entry.isFile()) {
          // 检查包含模式
          if (!this.matchesIncludePatterns(entry.name)) {
            continue;
          }

          // 获取文件信息
          const stats = await fs.stat(fullPath);

          // 检查文件大小
          if (stats.size > this.options.maxFileSize) {
            continue;
          }

          const resource = this.createResource(fullPath, stats);

          // 应用过滤器
          if (this.matchesFilter(resource, filter)) {
            count++;
            yield resource;
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error scanning directory ${dirPath}:`, error);
    }
  }

  /**
   * 读取资源内容
   */
  async read(uri: string): Promise<ResourceContent> {
    const filePath = this.uriToPath(uri);

    // 检查文件存在
    if (!(await this.exists(uri))) {
      throw new Error(`Resource not found: ${uri}`);
    }

    const stats = await fs.stat(filePath);

    // 检查文件大小
    if (stats.size > this.options.maxFileSize) {
      throw new Error(`File too large: ${stats.size} bytes`);
    }

    const mimeType = this.getMimeType(filePath);
    const isText = this.isTextMimeType(mimeType);

    if (isText) {
      const text = await fs.readFile(filePath, 'utf-8');
      return { uri, mimeType, text };
    } else {
      const buffer = await fs.readFile(filePath);
      const blob = buffer.toString('base64');
      return { uri, mimeType, blob };
    }
  }

  /**
   * 检查资源是否存在
   */
  async exists(uri: string): Promise<boolean> {
    try {
      const filePath = this.uriToPath(uri);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 启动监听
   */
  watch(callback: (event: any) => void): void {
    super.watch(callback);

    if (this.options.enableWatch && !this.fsWatcher) {
      this.startWatching();
    }
  }

  /**
   * 停止监听
   */
  unwatch(): void {
    super.unwatch();

    if (this.fsWatcher) {
      this.fsWatcher.close();
      this.fsWatcher = undefined;
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * 启动文件系统监听
   */
  private startWatching(): void {
    try {
      this.fsWatcher = watch(
        this.options.basePath,
        { recursive: this.options.recursive },
        async (eventType, filename) => {
          if (!filename) return;

          const fullPath = path.join(this.options.basePath, filename);

          // 检查排除
          if (this.isExcluded(path.basename(fullPath))) {
            return;
          }

          try {
            const exists = await this.pathExists(fullPath);
            const stats = exists ? await fs.stat(fullPath) : null;

            if (exists && stats?.isFile()) {
              const resource = this.createResource(fullPath, stats);

              if (eventType === 'rename') {
                this.emit({
                  type: ResourceEventType.ADDED,
                  resource,
                  timestamp: new Date(),
                });
              } else {
                this.emit({
                  type: ResourceEventType.UPDATED,
                  resource,
                  timestamp: new Date(),
                });
              }
            } else {
              this.emit({
                type: ResourceEventType.REMOVED,
                resource: {
                  uri: this.pathToUri(fullPath),
                  name: path.basename(fullPath),
                },
                timestamp: new Date(),
              });
            }
          } catch (error) {
            this.logger.error(`Error processing file event for ${fullPath}:`, error);
          }
        },
      );

      this.logger.log(`Started watching: ${this.options.basePath}`);
    } catch (error) {
      this.logger.error('Error starting file watcher:', error);
    }
  }

  /**
   * 创建资源对象
   */
  private createResource(filePath: string, stats: fs.Stats): MCPResource {
    return {
      uri: this.pathToUri(filePath),
      name: path.basename(filePath),
      description: `File: ${path.relative(this.options.basePath, filePath)}`,
      mimeType: this.getMimeType(filePath),
      size: stats.size,
      metadata: {
        created: stats.birthtime,
        modified: stats.mtime,
        path: filePath,
      },
    };
  }

  /**
   * 路径转 URI
   */
  private pathToUri(filePath: string): string {
    return `file://${filePath}`;
  }

  /**
   * URI 转路径
   */
  private uriToPath(uri: string): string {
    if (uri.startsWith('file://')) {
      return uri.slice(7);
    }
    return uri;
  }

  /**
   * 获取 MIME 类型
   */
  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    return MIME_TYPES[ext] || 'application/octet-stream';
  }

  /**
   * 判断是否为文本 MIME 类型
   */
  private isTextMimeType(mimeType: string): boolean {
    return (
      mimeType.startsWith('text/') ||
      mimeType === 'application/json' ||
      mimeType === 'application/xml' ||
      mimeType === 'application/yaml' ||
      mimeType === 'application/javascript' ||
      mimeType === 'application/typescript' ||
      mimeType === 'application/sql'
    );
  }

  /**
   * 检查是否被排除
   */
  private isExcluded(name: string): boolean {
    return this.options.exclude.some((pattern) => {
      if (pattern.includes('*')) {
        return this.matchGlob(name, pattern);
      }
      return name === pattern;
    });
  }

  /**
   * 检查是否匹配包含模式
   */
  private matchesIncludePatterns(name: string): boolean {
    if (this.options.include.length === 0) return true;
    if (this.options.include.includes('*')) return true;

    return this.options.include.some((pattern) => this.matchGlob(name, pattern));
  }

  /**
   * 检查是否匹配过滤器
   */
  private matchesFilter(resource: MCPResource, filter?: ResourceFilter): boolean {
    if (!filter) return true;

    if (filter.uriPattern && !this.matchGlob(resource.uri, filter.uriPattern)) {
      return false;
    }

    if (filter.mimeType && resource.mimeType !== filter.mimeType) {
      return false;
    }

    if (filter.nameContains && !resource.name.includes(filter.nameContains)) {
      return false;
    }

    return true;
  }

  /**
   * 检查路径是否存在
   */
  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
