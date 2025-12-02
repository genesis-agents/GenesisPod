import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";

export interface UploadResult {
  success: boolean;
  url?: string;
  key?: string;
  error?: string;
}

/**
 * 对象存储服务（支持 Backblaze B2 / Cloudflare R2）
 *
 * 使用私有 Bucket + 预签名 URL，完全免费无需信用卡
 *
 * Backblaze B2 免费额度：
 * - 10GB 存储
 * - 1GB/天 出站流量
 * - 私有 Bucket 免费
 */
@Injectable()
export class R2StorageService implements OnModuleInit {
  private readonly logger = new Logger(R2StorageService.name);
  private s3Client: S3Client | null = null;
  private bucketName: string;
  private isConfigured = false;
  private provider: "b2" | "r2" | "none" = "none";
  // 预签名 URL 有效期（秒）- 7天
  private readonly PRESIGN_EXPIRES = 7 * 24 * 60 * 60;

  constructor(private readonly configService: ConfigService) {
    this.bucketName =
      this.configService.get<string>("B2_BUCKET_NAME") ||
      this.configService.get<string>("R2_BUCKET_NAME") ||
      "deepdive-images";
  }

  onModuleInit() {
    // 优先检查 Backblaze B2 配置
    const b2KeyId = this.configService.get<string>("B2_KEY_ID");
    const b2AppKey = this.configService.get<string>("B2_APP_KEY");
    const b2Endpoint = this.configService.get<string>("B2_ENDPOINT");

    if (b2KeyId && b2AppKey && b2Endpoint) {
      // 从 endpoint 提取 region（如 s3.us-west-004.backblazeb2.com -> us-west-004）
      const regionMatch = b2Endpoint.match(/s3\.([^.]+)\.backblazeb2\.com/);
      const region = regionMatch ? regionMatch[1] : "us-west-004";

      this.s3Client = new S3Client({
        region,
        endpoint: b2Endpoint,
        credentials: {
          accessKeyId: b2KeyId,
          secretAccessKey: b2AppKey,
        },
      });
      this.isConfigured = true;
      this.provider = "b2";
      this.logger.log(
        `Backblaze B2 Storage configured (bucket: ${this.bucketName}, region: ${region})`,
      );
      return;
    }

    // 其次检查 Cloudflare R2 配置
    const r2AccountId = this.configService.get<string>("R2_ACCOUNT_ID");
    const r2AccessKeyId = this.configService.get<string>("R2_ACCESS_KEY_ID");
    const r2SecretAccessKey = this.configService.get<string>(
      "R2_SECRET_ACCESS_KEY",
    );

    if (r2AccountId && r2AccessKeyId && r2SecretAccessKey) {
      this.s3Client = new S3Client({
        region: "auto",
        endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: r2AccessKeyId,
          secretAccessKey: r2SecretAccessKey,
        },
      });
      this.isConfigured = true;
      this.provider = "r2";
      this.logger.log("Cloudflare R2 Storage configured successfully");
      return;
    }

    this.logger.warn(
      "Object Storage not configured - missing credentials. Images will be stored as base64 in database.",
    );
  }

  /**
   * 检查存储是否已配置
   */
  isEnabled(): boolean {
    return this.isConfigured;
  }

  /**
   * 获取当前使用的存储提供商
   */
  getProvider(): "b2" | "r2" | "none" {
    return this.provider;
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
   * 获取图片的预签名 URL
   * 用于私有 Bucket 的临时访问
   */
  async getPresignedUrl(key: string): Promise<string> {
    if (!this.s3Client) {
      throw new Error("Storage not configured");
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
   * 批量上传图片
   */
  async uploadMultiple(
    images: Array<{ base64: string; prefix?: string }>,
  ): Promise<UploadResult[]> {
    return Promise.all(
      images.map((img) => this.uploadBase64Image(img.base64, img.prefix)),
    );
  }
}
