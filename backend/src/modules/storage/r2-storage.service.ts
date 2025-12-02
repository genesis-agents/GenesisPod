import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
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
 * 两者都兼容 S3 API，使用 AWS SDK
 *
 * Backblaze B2 免费额度（无需信用卡）：
 * - 10GB 存储
 * - 1GB/天 出站流量
 *
 * Cloudflare R2 免费额度（需信用卡）：
 * - 10GB 存储
 * - 无限出站流量
 */
@Injectable()
export class R2StorageService implements OnModuleInit {
  private readonly logger = new Logger(R2StorageService.name);
  private s3Client: S3Client | null = null;
  private bucketName: string;
  private publicUrl: string;
  private isConfigured = false;
  private provider: "b2" | "r2" | "none" = "none";

  constructor(private readonly configService: ConfigService) {
    this.bucketName =
      this.configService.get<string>("B2_BUCKET_NAME") ||
      this.configService.get<string>("R2_BUCKET_NAME") ||
      "deepdive-images";
    this.publicUrl =
      this.configService.get<string>("B2_PUBLIC_URL") ||
      this.configService.get<string>("R2_PUBLIC_URL") ||
      "";
  }

  onModuleInit() {
    // 优先检查 Backblaze B2 配置
    const b2KeyId = this.configService.get<string>("B2_KEY_ID");
    const b2AppKey = this.configService.get<string>("B2_APP_KEY");
    const b2Endpoint = this.configService.get<string>("B2_ENDPOINT");

    if (b2KeyId && b2AppKey && b2Endpoint) {
      this.s3Client = new S3Client({
        region: "us-west-004", // B2 区域，从 endpoint 获取
        endpoint: b2Endpoint, // 如: https://s3.us-west-004.backblazeb2.com
        credentials: {
          accessKeyId: b2KeyId,
          secretAccessKey: b2AppKey,
        },
      });
      this.isConfigured = true;
      this.provider = "b2";
      this.logger.log("Backblaze B2 Storage configured successfully");
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
   * 上传 base64 图片到 R2
   *
   * @param base64Data - 完整的 data:image/xxx;base64,xxx 字符串
   * @param prefix - 文件前缀，用于组织目录结构
   * @returns 上传结果，包含公开 URL
   */
  async uploadBase64Image(
    base64Data: string,
    prefix: string = "generated",
  ): Promise<UploadResult> {
    if (!this.isConfigured || !this.s3Client) {
      return {
        success: false,
        error: "R2 Storage not configured",
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

      // 上传到 R2
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: `image/${imageType}`,
        // R2 支持的元数据
        Metadata: {
          "uploaded-at": new Date().toISOString(),
          "original-size": buffer.length.toString(),
        },
      });

      await this.s3Client.send(command);

      const url = `${this.publicUrl}/${key}`;

      this.logger.log(
        `Uploaded image to R2: ${key} (${Math.round(buffer.length / 1024)}KB)`,
      );

      return {
        success: true,
        url,
        key,
      };
    } catch (error) {
      this.logger.error("Failed to upload to R2:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Upload failed",
      };
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
      this.logger.log(`Deleted image from R2: ${key}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete from R2: ${key}`, error);
      return false;
    }
  }

  /**
   * 检查图片是否存在
   */
  async imageExists(key: string): Promise<boolean> {
    if (!this.isConfigured || !this.s3Client) {
      return false;
    }

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 从 URL 中提取 R2 key
   */
  extractKeyFromUrl(url: string): string | null {
    if (!url.startsWith(this.publicUrl)) {
      return null;
    }
    return url.replace(`${this.publicUrl}/`, "");
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
