import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import {
  mapWithConcurrency,
  ConcurrencyLimits,
} from "../../../../common/utils/concurrency.utils";

export interface UploadResult {
  success: boolean;
  url?: string;
  key?: string;
  error?: string;
}

/**
 * 对象存储服务 — Cloudflare R2（S3 API 兼容）
 *
 * 2026-04-22: 全面切换 R2，彻底废弃 B2。
 * R2 免费档：10GB 存储 + 1000 万 Class A ops/月 + 1 亿 Class B ops/月 + 零 egress。
 *
 * 环境变量：
 * - R2_ACCOUNT_ID       Cloudflare 账号 ID
 * - R2_ACCESS_KEY_ID    API Token 的 Access Key
 * - R2_SECRET_ACCESS_KEY API Token 的 Secret
 * - R2_BUCKET_NAME      bucket 名
 */
@Injectable()
export class R2StorageService implements OnModuleInit {
  private readonly logger = new Logger(R2StorageService.name);
  private s3Client: S3Client | null = null;
  private bucketName: string;
  private isConfigured = false;
  private readonly provider = "r2" as const;
  // 预签名 URL 有效期（秒）- 7 天
  private readonly PRESIGN_EXPIRES = 7 * 24 * 60 * 60;

  constructor(private readonly configService: ConfigService) {
    this.bucketName =
      this.configService.get<string>("R2_BUCKET_NAME") || "genesis-reports";
  }

  onModuleInit() {
    const r2AccountId = this.configService.get<string>("R2_ACCOUNT_ID");
    const r2AccessKeyId = this.configService.get<string>("R2_ACCESS_KEY_ID");
    const r2SecretAccessKey = this.configService.get<string>(
      "R2_SECRET_ACCESS_KEY",
    );

    if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey) {
      this.logger.warn(
        "R2 Storage not configured — set R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY",
      );
      return;
    }

    this.s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2AccessKeyId,
        secretAccessKey: r2SecretAccessKey,
      },
    });
    this.isConfigured = true;
    this.logger.log(
      `Cloudflare R2 Storage configured (bucket: ${this.bucketName})`,
    );
  }

  /**
   * 检查存储是否已配置
   */
  isEnabled(): boolean {
    return this.isConfigured;
  }

  /**
   * 获取当前使用的存储提供商（历史接口，保留返回 "r2"/"none"）
   */
  getProvider(): "r2" | "none" {
    return this.isConfigured ? this.provider : "none";
  }

  /** 对外暴露底层 S3 client（仅给同模块 service 用，避免破坏封装） */
  getS3Client(): S3Client | null {
    return this.s3Client;
  }

  getBucketName(): string {
    return this.bucketName;
  }

  /**
   * 上传 base64 图片并返回预签名 URL
   *
   * @param base64Data - 完整的 data:image/xxx;base64,xxx 字符串
   * @param prefix - 文件前缀，用于组织目录结构
   * @returns 上传结果，包含预签名 URL（有效期7天）
   */
  async uploadBase64Image(
    base64Data: string,
    prefix: string = "generated",
  ): Promise<UploadResult> {
    if (!this.isConfigured || !this.s3Client) {
      return {
        success: false,
        error: "Object Storage not configured",
      };
    }

    try {
      // 解析 base64 数据
      const matches = base64Data.match(
        /^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/,
      );
      if (!matches) {
        return {
          success: false,
          error: "Invalid base64 image format",
        };
      }

      const imageType = matches[1];
      const base64Content = matches[2];
      const buffer = Buffer.from(base64Content, "base64");

      // 生成唯一文件名
      const hash = crypto
        .createHash("md5")
        .update(base64Content.slice(0, 1000))
        .digest("hex")
        .slice(0, 8);
      const timestamp = Date.now();
      const key = `${prefix}/${timestamp}-${hash}.${imageType}`;

      // 上传到存储
      const putCommand = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: `image/${imageType}`,
        Metadata: {
          "uploaded-at": new Date().toISOString(),
          "original-size": buffer.length.toString(),
        },
      });

      await this.s3Client.send(putCommand);

      // 生成预签名 URL（有效期7天）
      const url = await this.getPresignedUrl(key);

      this.logger.log(
        `Uploaded image: ${key} (${Math.round(buffer.length / 1024)}KB) - URL valid for 7 days`,
      );

      return {
        success: true,
        url,
        key,
      };
    } catch (error) {
      this.logger.error("Failed to upload:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Upload failed",
      };
    }
  }

  /**
   * 上传 Buffer 数据（支持任意文件类型）
   * Genesis.ai v2.1 新增 - 用于 SVG/PDF/PPTX 等导出
   *
   * @param buffer - 文件数据 Buffer
   * @param prefix - 文件前缀，用于组织目录结构
   * @param filename - 文件名
   * @param contentType - MIME 类型
   * @returns 上传结果，包含预签名 URL
   */
  async uploadBuffer(
    buffer: Buffer,
    prefix: string,
    filename: string,
    contentType: string,
  ): Promise<UploadResult> {
    if (!this.isConfigured || !this.s3Client) {
      return {
        success: false,
        error: "Object Storage not configured",
      };
    }

    try {
      // 生成唯一文件名
      const hash = crypto
        .createHash("md5")
        .update(buffer.slice(0, 1000))
        .digest("hex")
        .slice(0, 8);
      const timestamp = Date.now();
      const ext = filename.split(".").pop() || "bin";
      const key = `${prefix}/${timestamp}-${hash}.${ext}`;

      // 上传到存储
      const putCommand = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        Metadata: {
          "uploaded-at": new Date().toISOString(),
          "original-size": buffer.length.toString(),
          "original-filename": filename,
        },
      });

      await this.s3Client.send(putCommand);

      // 生成预签名 URL（有效期7天）
      const url = await this.getPresignedUrl(key);

      this.logger.log(
        `Uploaded file: ${key} (${Math.round(buffer.length / 1024)}KB) - URL valid for 7 days`,
      );

      return {
        success: true,
        url,
        key,
      };
    } catch (error) {
      this.logger.error("Failed to upload buffer:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Upload failed",
      };
    }
  }

  /**
   * 获取图片的预签名 URL
   * 用于私有 Bucket 的临时访问
   */
  async getPresignedUrl(key: string): Promise<string> {
    if (!this.s3Client) {
      throw new ServiceUnavailableException("Storage not configured");
    }

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return getSignedUrl(this.s3Client, command, {
      expiresIn: this.PRESIGN_EXPIRES,
    });
  }

  /**
   * 刷新图片 URL（当旧 URL 即将过期时调用）
   * 从数据库中的 key 生成新的预签名 URL
   */
  async refreshImageUrl(oldUrl: string): Promise<string | null> {
    const key = this.extractKeyFromUrl(oldUrl);
    if (!key) {
      return null;
    }

    try {
      return await this.getPresignedUrl(key);
    } catch (error) {
      this.logger.error(`Failed to refresh URL for key: ${key}`, error);
      return null;
    }
  }

  /**
   * 从 R2 删除图片
   */
  async deleteImage(key: string): Promise<boolean> {
    if (!this.isConfigured || !this.s3Client) {
      return false;
    }

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      this.logger.log(`Deleted image: ${key}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete: ${key}`, error);
      return false;
    }
  }

  /**
   * 从预签名 URL 中提取 key
   * URL 格式: https://xxx.backblazeb2.com/bucket/prefix/timestamp-hash.png?签名参数
   */
  extractKeyFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      // 移除开头的 /bucket-name/
      const path = urlObj.pathname;
      const bucketPrefix = `/${this.bucketName}/`;
      if (path.startsWith(bucketPrefix)) {
        return path.slice(bucketPrefix.length);
      }
      // 有些 URL 格式可能不同，尝试直接返回路径
      return path.startsWith("/") ? path.slice(1) : path;
    } catch {
      return null;
    }
  }

  /**
   * 上传文本内容（markdown / JSON / HTML）并返回存储 key。
   * 专为 topic_reports / dimension_analyses 等大文本字段 off-load 设计。
   *
   * 与图片方法的两个差异：
   * 1. 不返回 presigned URL（文本内容走后端代理下载，避免 7 天过期问题）
   * 2. 允许调用方指定 key（带语义路径如 `topic-reports/{id}/{timestamp}.md`），
   *    而非按 hash 自动生成——便于"按资源组织"和删除/版本化
   */
  async uploadText(
    content: string,
    key: string,
    contentType = "text/markdown; charset=utf-8",
  ): Promise<UploadResult> {
    if (!this.isConfigured || !this.s3Client) {
      return { success: false, error: "Object Storage not configured" };
    }
    try {
      const buffer = Buffer.from(content, "utf-8");
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          Metadata: {
            "uploaded-at": new Date().toISOString(),
            "original-size": buffer.length.toString(),
          },
        }),
      );
      this.logger.log(
        `Uploaded text: ${key} (${Math.round(buffer.length / 1024)}KB)`,
      );
      return { success: true, key };
    } catch (error) {
      this.logger.error(`Failed to upload text ${key}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Upload failed",
      };
    }
  }

  /**
   * 按 key 下载文本。找不到时返回 null（调用方通常 fallback 到 DB）。
   */
  async downloadText(key: string): Promise<string | null> {
    if (!this.isConfigured || !this.s3Client) return null;
    try {
      const res = await this.s3Client.send(
        new GetObjectCommand({ Bucket: this.bucketName, Key: key }),
      );
      if (!res.Body) return null;
      // Body 在 Node 下是 Readable；用 SDK 提供的 transformToString 避免手写流拼接
      return await res.Body.transformToString("utf-8");
    } catch (error) {
      const code = (error as { name?: string })?.name;
      if (code === "NoSuchKey") return null;
      this.logger.warn(
        `Failed to download ${key}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * 删除任意 key（与 deleteImage 功能一致，命名更通用；供文本/报告清理使用）
   */
  async deleteObject(key: string): Promise<boolean> {
    return this.deleteImage(key);
  }

  /**
   * 批量上传图片（带并发限制）
   */
  async uploadMultiple(
    images: Array<{ base64: string; prefix?: string }>,
  ): Promise<UploadResult[]> {
    return mapWithConcurrency(
      images,
      (img) => this.uploadBase64Image(img.base64, img.prefix),
      ConcurrencyLimits.FILE,
    );
  }
}
