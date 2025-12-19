/**
 * Cloud Storage Tool
 * 云存储工具 - 支持 S3、GCS、Azure Blob 等云存储服务
 */

import { Injectable, Logger } from "@nestjs/common";
import { BaseTool, JSONSchema, ToolContext } from "../../core";
import { ToolType } from "../../core";

// ============================================================================
// Types
// ============================================================================

/**
 * 云存储提供商
 */
export type StorageProvider = "s3" | "gcs" | "azure" | "minio";

/**
 * 存储操作类型
 */
export type StorageOperation = "upload" | "download" | "list" | "delete";

/**
 * 文件访问权限
 */
export type FilePermission = "private" | "public-read" | "public-read-write";

/**
 * S3 特定配置
 */
export interface S3Config {
  /**
   * AWS Region
   */
  region: string;

  /**
   * Bucket 名称
   */
  bucket: string;

  /**
   * Access Key ID
   */
  accessKeyId?: string;

  /**
   * Secret Access Key
   */
  secretAccessKey?: string;

  /**
   * 自定义 Endpoint (for S3-compatible services)
   */
  endpoint?: string;
}

/**
 * GCS 特定配置
 */
export interface GCSConfig {
  /**
   * Project ID
   */
  projectId: string;

  /**
   * Bucket 名称
   */
  bucket: string;

  /**
   * Service Account Key (JSON)
   */
  credentials?: string;
}

/**
 * Azure Blob 特定配置
 */
export interface AzureConfig {
  /**
   * Storage Account 名称
   */
  accountName: string;

  /**
   * Container 名称
   */
  container: string;

  /**
   * Access Key
   */
  accountKey?: string;

  /**
   * SAS Token
   */
  sasToken?: string;
}

/**
 * MinIO 特定配置
 */
export interface MinIOConfig {
  /**
   * Endpoint URL
   */
  endpoint: string;

  /**
   * Bucket 名称
   */
  bucket: string;

  /**
   * Access Key
   */
  accessKey?: string;

  /**
   * Secret Key
   */
  secretKey?: string;

  /**
   * 是否使用 SSL
   */
  useSSL?: boolean;
}

/**
 * 上传文件信息
 */
export interface UploadFileInfo {
  /**
   * 文件名或对象键
   */
  key: string;

  /**
   * 文件内容（Base64 或 URL）
   */
  content: string;

  /**
   * 内容类型（是 base64 还是 url）
   */
  contentType: "base64" | "url";

  /**
   * MIME 类型
   */
  mimeType?: string;

  /**
   * 文件权限
   */
  permission?: FilePermission;

  /**
   * 元数据
   */
  metadata?: Record<string, string>;
}

/**
 * 列表查询选项
 */
export interface ListOptions {
  /**
   * 前缀过滤
   */
  prefix?: string;

  /**
   * 最大结果数
   */
  maxResults?: number;

  /**
   * 分页标记
   */
  pageToken?: string;

  /**
   * 是否递归列出
   */
  recursive?: boolean;
}

/**
 * 云存储输入
 */
export interface CloudStorageInput {
  /**
   * 存储提供商
   */
  provider: StorageProvider;

  /**
   * 操作类型
   */
  operation: StorageOperation;

  /**
   * 提供商特定配置
   */
  config: S3Config | GCSConfig | AzureConfig | MinIOConfig;

  /**
   * 上传操作参数（仅 upload 操作使用）
   */
  uploadParams?: {
    /**
     * 要上传的文件列表
     */
    files: UploadFileInfo[];

    /**
     * 是否覆盖已存在的文件
     */
    overwrite?: boolean;
  };

  /**
   * 下载操作参数（仅 download 操作使用）
   */
  downloadParams?: {
    /**
     * 要下载的文件键列表
     */
    keys: string[];

    /**
     * 预签名 URL 过期时间（秒）
     */
    expiresIn?: number;

    /**
     * 是否直接返回文件内容（小文件）
     */
    returnContent?: boolean;
  };

  /**
   * 列表操作参数（仅 list 操作使用）
   */
  listParams?: ListOptions;

  /**
   * 删除操作参数（仅 delete 操作使用）
   */
  deleteParams?: {
    /**
     * 要删除的文件键列表
     */
    keys: string[];

    /**
     * 是否强制删除（忽略错误）
     */
    force?: boolean;
  };
}

/**
 * 文件对象信息
 */
export interface FileObject {
  /**
   * 对象键/文件名
   */
  key: string;

  /**
   * 文件大小（字节）
   */
  size: number;

  /**
   * 最后修改时间
   */
  lastModified: Date;

  /**
   * ETag
   */
  etag?: string;

  /**
   * 存储类型
   */
  storageClass?: string;

  /**
   * 公开 URL（如果是公开文件）
   */
  publicUrl?: string;

  /**
   * 预签名 URL（临时访问）
   */
  presignedUrl?: string;

  /**
   * 元数据
   */
  metadata?: Record<string, string>;
}

/**
 * 云存储输出
 */
export interface CloudStorageOutput {
  /**
   * 操作是否成功
   */
  success: boolean;

  /**
   * 操作类型
   */
  operation: StorageOperation;

  /**
   * 上传结果（仅 upload 操作）
   */
  uploadResult?: {
    /**
     * 成功上传的文件列表
     */
    uploaded: FileObject[];

    /**
     * 失败的文件列表
     */
    failed?: Array<{
      key: string;
      error: string;
    }>;

    /**
     * 总上传大小（字节）
     */
    totalSize: number;
  };

  /**
   * 下载结果（仅 download 操作）
   */
  downloadResult?: {
    /**
     * 可下载的文件列表
     */
    files: FileObject[];

    /**
     * 失败的文件列表
     */
    failed?: Array<{
      key: string;
      error: string;
    }>;
  };

  /**
   * 列表结果（仅 list 操作）
   */
  listResult?: {
    /**
     * 文件对象列表
     */
    objects: FileObject[];

    /**
     * 总数量
     */
    totalCount: number;

    /**
     * 下一页标记
     */
    nextPageToken?: string;

    /**
     * 是否有更多结果
     */
    hasMore: boolean;
  };

  /**
   * 删除结果（仅 delete 操作）
   */
  deleteResult?: {
    /**
     * 成功删除的键列表
     */
    deleted: string[];

    /**
     * 失败的文件列表
     */
    failed?: Array<{
      key: string;
      error: string;
    }>;
  };

  /**
   * 错误信息
   */
  error?: string;

  /**
   * 操作元数据
   */
  metadata?: {
    /**
     * 存储提供商
     */
    provider: StorageProvider;

    /**
     * Bucket/Container 名称
     */
    bucket: string;

    /**
     * 操作耗时（毫秒）
     */
    duration: number;

    /**
     * 请求 ID（如果可用）
     */
    requestId?: string;
  };
}

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * 云存储工具
 *
 * 支持多个云存储提供商的文件操作：
 * - AWS S3
 * - Google Cloud Storage (GCS)
 * - Azure Blob Storage
 * - MinIO (S3-compatible)
 *
 * 支持的操作：
 * - upload: 上传文件到云存储
 * - download: 下载文件或生成预签名 URL
 * - list: 列出文件
 * - delete: 删除文件
 *
 * @example
 * ```typescript
 * // 上传文件到 S3
 * {
 *   provider: "s3",
 *   operation: "upload",
 *   config: {
 *     region: "us-east-1",
 *     bucket: "my-bucket"
 *   },
 *   uploadParams: {
 *     files: [{
 *       key: "reports/2024/report.pdf",
 *       content: "base64-encoded-content",
 *       contentType: "base64",
 *       mimeType: "application/pdf",
 *       permission: "private"
 *     }]
 *   }
 * }
 *
 * // 生成预签名下载 URL
 * {
 *   provider: "s3",
 *   operation: "download",
 *   config: {
 *     region: "us-east-1",
 *     bucket: "my-bucket"
 *   },
 *   downloadParams: {
 *     keys: ["reports/2024/report.pdf"],
 *     expiresIn: 3600
 *   }
 * }
 * ```
 */
@Injectable()
export class CloudStorageTool extends BaseTool<
  CloudStorageInput,
  CloudStorageOutput
> {
  private readonly logger = new Logger(CloudStorageTool.name);

  readonly type = ToolType.CLOUD_STORAGE;
  readonly name = "云存储";
  readonly description =
    "与云存储服务交互，支持 AWS S3、Google Cloud Storage、Azure Blob 和 MinIO。可执行文件上传、下载、列表查询和删除操作，支持预签名 URL 生成和批量操作。";

  readonly inputSchema: JSONSchema = {
    type: "object",
    properties: {
      provider: {
        type: "string",
        description: "云存储提供商",
        enum: ["s3", "gcs", "azure", "minio"],
      },
      operation: {
        type: "string",
        description: "要执行的操作",
        enum: ["upload", "download", "list", "delete"],
      },
      config: {
        type: "object",
        description: "提供商特定配置（包含 bucket/container 和认证信息）",
      },
      uploadParams: {
        type: "object",
        description: "上传操作参数（仅 upload 操作时需要）",
        properties: {
          files: {
            type: "array",
            description: "要上传的文件列表",
            items: {
              type: "object",
              properties: {
                key: { type: "string", description: "文件键/路径" },
                content: {
                  type: "string",
                  description: "文件内容（Base64 或 URL）",
                },
                contentType: {
                  type: "string",
                  description: "内容类型",
                  enum: ["base64", "url"],
                },
                mimeType: { type: "string", description: "MIME 类型" },
                permission: {
                  type: "string",
                  description: "访问权限",
                  enum: ["private", "public-read", "public-read-write"],
                },
              },
              required: ["key", "content", "contentType"],
            },
          },
          overwrite: {
            type: "boolean",
            description: "是否覆盖已存在的文件",
            default: false,
          },
        },
      },
      downloadParams: {
        type: "object",
        description: "下载操作参数（仅 download 操作时需要）",
        properties: {
          keys: {
            type: "array",
            description: "要下载的文件键列表",
            items: { type: "string" },
          },
          expiresIn: {
            type: "number",
            description: "预签名 URL 过期时间（秒）",
            default: 3600,
          },
          returnContent: {
            type: "boolean",
            description: "是否直接返回文件内容（仅小文件）",
            default: false,
          },
        },
        required: ["keys"],
      },
      listParams: {
        type: "object",
        description: "列表操作参数（仅 list 操作时需要）",
        properties: {
          prefix: { type: "string", description: "前缀过滤" },
          maxResults: {
            type: "number",
            description: "最大结果数",
            default: 100,
          },
          pageToken: { type: "string", description: "分页标记" },
          recursive: {
            type: "boolean",
            description: "是否递归列出",
            default: true,
          },
        },
      },
      deleteParams: {
        type: "object",
        description: "删除操作参数（仅 delete 操作时需要）",
        properties: {
          keys: {
            type: "array",
            description: "要删除的文件键列表",
            items: { type: "string" },
          },
          force: {
            type: "boolean",
            description: "是否强制删除（忽略不存在的文件）",
            default: false,
          },
        },
        required: ["keys"],
      },
    },
    required: ["provider", "operation", "config"],
  };

  readonly outputSchema: JSONSchema = {
    type: "object",
    properties: {
      success: {
        type: "boolean",
        description: "操作是否成功",
      },
      operation: {
        type: "string",
        description: "执行的操作类型",
      },
      uploadResult: {
        type: "object",
        description: "上传操作结果",
      },
      downloadResult: {
        type: "object",
        description: "下载操作结果",
      },
      listResult: {
        type: "object",
        description: "列表查询结果",
      },
      deleteResult: {
        type: "object",
        description: "删除操作结果",
      },
      error: {
        type: "string",
        description: "错误信息",
      },
      metadata: {
        type: "object",
        description: "操作元数据",
      },
    },
  };

  constructor() {
    super();
    this.defaultTimeout = 60000; // 60 秒超时（文件操作可能较慢）
  }

  /**
   * 验证输入
   */
  validateInput(input: CloudStorageInput): boolean {
    // 验证提供商
    const validProviders: StorageProvider[] = ["s3", "gcs", "azure", "minio"];
    if (!validProviders.includes(input.provider)) {
      this.logger.warn(`Invalid provider: ${input.provider}`);
      return false;
    }

    // 验证操作
    const validOperations: StorageOperation[] = [
      "upload",
      "download",
      "list",
      "delete",
    ];
    if (!validOperations.includes(input.operation)) {
      this.logger.warn(`Invalid operation: ${input.operation}`);
      return false;
    }

    // 验证配置
    if (!input.config) {
      this.logger.warn("Provider config is required");
      return false;
    }

    // 验证操作特定参数
    switch (input.operation) {
      case "upload":
        if (
          !input.uploadParams?.files ||
          input.uploadParams.files.length === 0
        ) {
          this.logger.warn("Upload operation requires files");
          return false;
        }
        break;
      case "download":
        if (
          !input.downloadParams?.keys ||
          input.downloadParams.keys.length === 0
        ) {
          this.logger.warn("Download operation requires keys");
          return false;
        }
        break;
      case "delete":
        if (!input.deleteParams?.keys || input.deleteParams.keys.length === 0) {
          this.logger.warn("Delete operation requires keys");
          return false;
        }
        break;
      case "list":
        // List 操作参数都是可选的
        break;
    }

    return true;
  }

  /**
   * 执行云存储操作
   */
  protected async doExecute(
    input: CloudStorageInput,
    context: ToolContext,
  ): Promise<CloudStorageOutput> {
    const startTime = Date.now();

    this.logger.log(
      `Executing ${input.operation} on ${input.provider} [task: ${context.taskId}]`,
    );

    try {
      let result: CloudStorageOutput;

      // 根据操作类型调用相应的方法
      switch (input.operation) {
        case "upload":
          result = await this.executeUpload(input, context);
          break;
        case "download":
          result = await this.executeDownload(input, context);
          break;
        case "list":
          result = await this.executeList(input, context);
          break;
        case "delete":
          result = await this.executeDelete(input, context);
          break;
        default:
          throw new Error(`Unsupported operation: ${input.operation}`);
      }

      // 添加元数据
      result.metadata = {
        ...result.metadata,
        provider: input.provider,
        bucket: this.getBucketName(input.config),
        duration: Date.now() - startTime,
      };

      this.logger.log(
        `${input.operation} operation completed on ${input.provider} in ${result.metadata.duration}ms`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Cloud storage operation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );

      return {
        success: false,
        operation: input.operation,
        error: error instanceof Error ? error.message : "Unknown error",
        metadata: {
          provider: input.provider,
          bucket: this.getBucketName(input.config),
          duration: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * 执行上传操作
   */
  private async executeUpload(
    input: CloudStorageInput,
    _context: ToolContext,
  ): Promise<CloudStorageOutput> {
    const { uploadParams } = input;
    if (!uploadParams) {
      throw new Error("Upload parameters are required");
    }

    // TODO: 实际集成云存储 SDK
    // 当前为模拟实现
    this.logger.debug(
      `Uploading ${uploadParams.files.length} files to ${input.provider}`,
    );

    // 模拟上传延迟
    await this.simulateApiCall();

    const uploaded: FileObject[] = uploadParams.files.map((file) => ({
      key: file.key,
      size: this.estimateFileSize(file.content, file.contentType),
      lastModified: new Date(),
      etag: `etag-${Date.now()}`,
      storageClass: "STANDARD",
      presignedUrl:
        file.permission === "public-read"
          ? `https://${this.getBucketName(input.config)}.s3.amazonaws.com/${file.key}`
          : undefined,
      metadata: file.metadata,
    }));

    const totalSize = uploaded.reduce((sum, file) => sum + file.size, 0);

    return {
      success: true,
      operation: "upload",
      uploadResult: {
        uploaded,
        totalSize,
      },
    };
  }

  /**
   * 执行下载操作
   */
  private async executeDownload(
    input: CloudStorageInput,
    _context: ToolContext,
  ): Promise<CloudStorageOutput> {
    const { downloadParams } = input;
    if (!downloadParams) {
      throw new Error("Download parameters are required");
    }

    // TODO: 实际集成云存储 SDK
    // 当前为模拟实现
    this.logger.debug(
      `Generating download URLs for ${downloadParams.keys.length} files`,
    );

    // 模拟 API 调用
    await this.simulateApiCall();

    const expiresIn = downloadParams.expiresIn || 3600;
    const files: FileObject[] = downloadParams.keys.map((key) => ({
      key,
      size: 1024 * 100, // 模拟 100KB
      lastModified: new Date(Date.now() - 86400000), // 1天前
      etag: `etag-${key}`,
      presignedUrl: `https://${this.getBucketName(input.config)}.s3.amazonaws.com/${key}?expires=${expiresIn}`,
    }));

    return {
      success: true,
      operation: "download",
      downloadResult: {
        files,
      },
    };
  }

  /**
   * 执行列表操作
   */
  private async executeList(
    input: CloudStorageInput,
    _context: ToolContext,
  ): Promise<CloudStorageOutput> {
    const { listParams = {} } = input;

    // TODO: 实际集成云存储 SDK
    // 当前为模拟实现
    this.logger.debug(`Listing objects in ${input.provider}`);

    // 模拟 API 调用
    await this.simulateApiCall();

    // TODO: Use maxResults in actual implementation
    // const maxResults = Math.min(listParams.maxResults || 100, 1000);
    const objects: FileObject[] = Array.from({ length: 5 }, (_, i) => ({
      key: `${listParams.prefix || ""}file-${i + 1}.txt`,
      size: 1024 * (i + 1),
      lastModified: new Date(Date.now() - i * 86400000),
      etag: `etag-${i}`,
      storageClass: "STANDARD",
    }));

    return {
      success: true,
      operation: "list",
      listResult: {
        objects,
        totalCount: objects.length,
        hasMore: false,
      },
    };
  }

  /**
   * 执行删除操作
   */
  private async executeDelete(
    input: CloudStorageInput,
    _context: ToolContext,
  ): Promise<CloudStorageOutput> {
    const { deleteParams } = input;
    if (!deleteParams) {
      throw new Error("Delete parameters are required");
    }

    // TODO: 实际集成云存储 SDK
    // 当前为模拟实现
    this.logger.debug(
      `Deleting ${deleteParams.keys.length} objects from ${input.provider}`,
    );

    // 模拟 API 调用
    await this.simulateApiCall();

    return {
      success: true,
      operation: "delete",
      deleteResult: {
        deleted: deleteParams.keys,
      },
    };
  }

  /**
   * 获取 Bucket/Container 名称
   */
  private getBucketName(
    config: S3Config | GCSConfig | AzureConfig | MinIOConfig,
  ): string {
    if ("bucket" in config) {
      return config.bucket;
    }
    if ("container" in config) {
      return config.container;
    }
    return "unknown";
  }

  /**
   * 估算文件大小
   */
  private estimateFileSize(
    content: string,
    contentType: "base64" | "url",
  ): number {
    if (contentType === "base64") {
      // Base64 解码后的大小约为原始大小的 3/4
      return Math.floor((content.length * 3) / 4);
    }
    // URL 类型假设为 1MB（实际需要获取）
    return 1024 * 1024;
  }

  /**
   * 模拟 API 调用延迟
   */
  private async simulateApiCall(): Promise<void> {
    // 模拟 200-1000ms 的网络和处理延迟
    const delay = 200 + Math.random() * 800;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
