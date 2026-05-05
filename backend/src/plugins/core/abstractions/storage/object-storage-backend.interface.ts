/**
 * IObjectStorageBackend — 对象存储端口（v5.1 R0.5-E W2-A）
 *
 * 部署平台差异驱动的真 plugin 候选（满足 §〇.1 三条充要条件）：
 *   - Cloudflare R2（S3-API endpoint）
 *   - AWS S3 native
 *   - GCS S3-mode
 *   - Azure Blob native API（结构差异，非 S3）
 *   - 本地 fs（dev / self-hosted）
 *   - IPFS / Arweave 等去中心化方案
 *
 * 由 plugins/storage/object-storage.module 通过 OBJECT_STORAGE_BACKEND_TOKEN
 * 注入给 ai-infra/storage 的 ObjectStorageService（orchestrator）。
 */

export interface ObjectMetadata {
  readonly [key: string]: string;
}

export interface PutObjectOptions {
  readonly contentType?: string;
  readonly metadata?: ObjectMetadata;
}

export interface IObjectStorageBackend {
  /** Backend 唯一标识（"r2" / "s3" / "gcs" / "local-fs" 等） */
  readonly id: string;

  /** 启动期初始化 */
  init?(): Promise<void>;

  /** Backend 是否可用（凭据齐全 + 连通） */
  isAvailable(): boolean;

  /** 写入对象（覆盖语义） */
  putObject(
    key: string,
    body: Buffer,
    options?: PutObjectOptions,
  ): Promise<void>;

  /** 读取对象。不存在返回 null */
  getObject(key: string): Promise<Buffer | null>;

  /** 删除对象。返回 true=删成功 / false=不存在或失败 */
  deleteObject(key: string): Promise<boolean>;

  /**
   * 生成可下载的预签名 URL（私有 bucket / 临时访问）。
   * 不支持 signed URL 的 backend（如 local-fs）应返回直链。
   */
  getSignedUrl(key: string, expiresInSec: number): Promise<string>;

  /** Bucket / namespace 名（用于 URL 解析等） */
  getBucketName(): string;

  /**
   * 列对象（用于存储治理 / inventory）
   */
  listObjects(options?: {
    continuationToken?: string;
    maxKeys?: number;
  }): Promise<{
    objects: Array<{ key: string; size: number }>;
    nextContinuationToken?: string;
    isTruncated: boolean;
  }>;
}

/** DI token：注入 IObjectStorageBackend 实例（仅一个 active backend） */
export const OBJECT_STORAGE_BACKEND_TOKEN = "OBJECT_STORAGE_BACKEND_TOKEN";
