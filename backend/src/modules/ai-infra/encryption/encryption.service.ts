import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";

export interface EncryptionResult {
  encryptedValue: string;
  iv: string;
}

/**
 * 统一的加密服务，供所有存储敏感凭据的模块复用。
 *
 * 算法: AES-256-CBC
 * 密钥派生: PBKDF2-SHA256, 100,000 次迭代, 静态 salt "deepdive-secrets-salt-v1"
 * IV: 每次加密生成 16 字节随机 IV，以 hex 编码与密文分离存储
 *
 * 提取自原 UserApiKeysService 和 SecretsService，加密参数完全一致，
 * 老数据可用新 Service 直接解密，无需迁移。
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly encryptionKey: string;
  /**
   * PBKDF2 输出的完整 32 字节高熵材质，仅供 HKDF per-user 子密钥派生（IKM）使用。
   * 区别于 `encryptionKey`（hex 截断的 32 ASCII 字符，仅 16 字节有效熵）。
   */
  private readonly userKeyMaterial: Buffer;
  readonly currentKeyVersion: number = 1;

  constructor(private readonly configService: ConfigService) {
    const key = this.configService.get<string>("SETTINGS_ENCRYPTION_KEY");
    let password: string;
    if (!key) {
      const nodeEnv = this.configService.get<string>("NODE_ENV");
      if (nodeEnv === "production") {
        throw new InternalServerErrorException(
          "CRITICAL: SETTINGS_ENCRYPTION_KEY environment variable is required in production. " +
            "Generate a secure 32-byte key using: openssl rand -hex 32",
        );
      }
      this.logger.warn(
        "WARNING: Using default encryption key. Set SETTINGS_ENCRYPTION_KEY in production!",
      );
      password = "deepdive-dev-only-key";
    } else {
      password = key;
    }
    // PBKDF2 输出的完整 32 字节做两用：
    //  - admin/系统路径（encrypt/decrypt）沿用历史的 hex 截断 32 字符作 AES key，
    //    保证历史密文可解（不可改，改则旧数据全部解不开）。
    //  - 用户 BYOK 路径（HKDF per-user 子密钥）用完整 32 字节高熵材质作 IKM，
    //    而非截断后的 ASCII 字符。用户路径为新增能力、迁移尚未 apply、无历史密文，
    //    可安全使用全熵材质。
    const material = crypto.pbkdf2Sync(
      password,
      "deepdive-secrets-salt-v1",
      100000,
      32,
      "sha256",
    );
    this.userKeyMaterial = material;
    this.encryptionKey = material.toString("hex").substring(0, 32);
  }

  /**
   * 2026-05-27 BYOK 安全关键-1：用户私有 Secret 用 per-user 子密钥加密。
   * HKDF-SHA256 从 master key 派生 `info = "user:<userId>"` 的 32 字节子密钥，
   * 使 master key 泄露不等于一次性解开全部用户 Key（按用户隔离爆炸半径）。
   * admin/系统 Secret 仍走 encrypt/decrypt（master key），两条路径互不影响。
   */
  private deriveUserKey(userId: string): Buffer {
    const ikm = this.userKeyMaterial;
    const salt = Buffer.from("byok-user-secret-salt-v1");
    const info = Buffer.from(`user:${userId}`);
    return Buffer.from(crypto.hkdfSync("sha256", ikm, salt, info, 32));
  }

  /** 用 per-user 子密钥加密用户私有 Secret 明文。 */
  encryptForUser(plaintext: string, userId: string): EncryptionResult {
    const key = this.deriveUserKey(userId);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");
    return { encryptedValue: encrypted, iv: iv.toString("hex") };
  }

  /** 用 per-user 子密钥解密用户私有 Secret，失败返回 null。 */
  decryptForUser(
    encryptedValue: string,
    ivHex: string,
    userId: string,
  ): string | null {
    if (!encryptedValue || !ivHex) return null;
    try {
      const key = this.deriveUserKey(userId);
      const iv = Buffer.from(ivHex, "hex");
      const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
      let decrypted = decipher.update(encryptedValue, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch (error) {
      this.logger.error(
        `User-scoped decryption failed: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * 加密明文，返回密文和 IV。密文和 IV 应分别存储到数据库不同字段。
   */
  encrypt(plaintext: string): EncryptionResult {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      "aes-256-cbc",
      Buffer.from(this.encryptionKey),
      iv,
    );
    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");
    return { encryptedValue: encrypted, iv: iv.toString("hex") };
  }

  /**
   * 解密密文。失败时返回 null（而非抛错），调用方据此决定是否视为 Key 不可用。
   */
  decrypt(encryptedValue: string, ivHex: string): string | null {
    if (!encryptedValue || !ivHex) return null;
    try {
      const iv = Buffer.from(ivHex, "hex");
      const decipher = crypto.createDecipheriv(
        "aes-256-cbc",
        Buffer.from(this.encryptionKey),
        iv,
      );
      let decrypted = decipher.update(encryptedValue, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch (error) {
      this.logger.error(`Decryption failed: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * 老格式兼容：`<iv-hex>:<ciphertext-hex>` 拼在同一字段。
   * 仅用于从 ai_models.api_key 等历史字段读取，新代码不要使用。
   */
  decryptLegacy(encryptedText: string | null): string | null {
    if (!encryptedText) return null;
    try {
      const parts = encryptedText.split(":");
      if (parts.length !== 2) return encryptedText;
      const iv = Buffer.from(parts[0], "hex");
      const encrypted = parts[1];
      const decipher = crypto.createDecipheriv(
        "aes-256-cbc",
        Buffer.from(this.encryptionKey),
        iv,
      );
      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch (error) {
      this.logger.error(
        `Legacy decryption failed: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * 计算值的 SHA-256 哈希，用于审计对比和变更检测（不参与加解密）。
   */
  hashValue(value: string): string {
    return crypto.createHash("sha256").update(value).digest("hex");
  }

  /**
   * 生成 Key 的脱敏展示，如 "sk-...a3f8"。前 3 位 + "..." + 后 4 位。
   */
  createKeyHint(plaintext: string): string {
    if (!plaintext || plaintext.length < 10) return "***";
    return `${plaintext.slice(0, 3)}...${plaintext.slice(-4)}`;
  }
}
