import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { parseStringPromise, Builder } from "xml2js";

/**
 * 企业微信消息加解密服务
 * 实现企业微信回调消息的加解密逻辑
 * 文档: https://developer.work.weixin.qq.com/document/path/90968
 */
@Injectable()
export class WechatWorkCryptoService {
  private readonly logger = new Logger(WechatWorkCryptoService.name);

  private corpId: string;
  private token: string;
  private encodingAESKey: string;
  private aesKey: Buffer | null = null;
  private iv: Buffer | null = null;

  constructor(private configService: ConfigService) {
    this.corpId = this.configService.get("WECHAT_WORK_CORP_ID", "");
    this.token = this.configService.get("WECHAT_WORK_TOKEN", "");
    this.encodingAESKey = this.configService.get(
      "WECHAT_WORK_ENCODING_AES_KEY",
      "",
    );

    if (this.encodingAESKey) {
      // AES Key = Base64_Decode(EncodingAESKey + "=")
      this.aesKey = Buffer.from(this.encodingAESKey + "=", "base64");
      // IV = AES Key 的前16字节
      this.iv = this.aesKey.subarray(0, 16);
    }
  }

  /**
   * 验证消息签名
   * @param signature 消息签名
   * @param timestamp 时间戳
   * @param nonce 随机字符串
   * @param echostr 加密的随机字符串（仅用于URL验证）
   */
  verifySignature(
    signature: string,
    timestamp: string,
    nonce: string,
    echostr?: string,
  ): boolean {
    const arr = [this.token, timestamp, nonce];
    if (echostr) {
      arr.push(echostr);
    }

    // 字典序排序后 SHA1 签名
    arr.sort();
    const str = arr.join("");
    const sha1 = crypto.createHash("sha1").update(str).digest("hex");

    return sha1 === signature;
  }

  /**
   * 解密消息
   * @param encryptedMsg 加密的消息内容
   * @returns 解密后的明文消息
   */
  decrypt(encryptedMsg: string): string {
    if (!this.aesKey || !this.iv) {
      throw new Error("EncodingAESKey not configured, cannot decrypt messages");
    }

    try {
      // AES-256-CBC 解密
      const decipher = crypto.createDecipheriv(
        "aes-256-cbc",
        this.aesKey,
        this.iv,
      );
      decipher.setAutoPadding(false);

      const encrypted = Buffer.from(encryptedMsg, "base64");
      let decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);

      // 去除 PKCS#7 填充
      const pad = decrypted[decrypted.length - 1];
      decrypted = decrypted.subarray(0, decrypted.length - pad);

      // 解密后的内容格式: random(16B) + msg_len(4B) + msg + corp_id
      // 跳过前16字节随机数
      const msgLen = decrypted.readUInt32BE(16);
      const msg = decrypted.subarray(20, 20 + msgLen).toString("utf8");

      // 验证 CorpID
      const receivedCorpId = decrypted.subarray(20 + msgLen).toString("utf8");
      if (receivedCorpId !== this.corpId) {
        this.logger.warn(
          `CorpID mismatch: expected ${this.corpId}, got ${receivedCorpId}`,
        );
      }

      return msg;
    } catch (error) {
      this.logger.error(`Decrypt error: ${error}`);
      throw new Error("Failed to decrypt message");
    }
  }

  /**
   * 加密消息
   * @param msg 明文消息
   * @returns 加密后的消息
   */
  encrypt(msg: string): string {
    if (!this.aesKey || !this.iv) {
      throw new Error("EncodingAESKey not configured, cannot encrypt messages");
    }

    try {
      // 生成16字节随机数
      const random = crypto.randomBytes(16);

      // 构造明文: random(16B) + msg_len(4B) + msg + corp_id
      const msgBuffer = Buffer.from(msg, "utf8");
      const corpIdBuffer = Buffer.from(this.corpId, "utf8");

      const msgLen = Buffer.alloc(4);
      msgLen.writeUInt32BE(msgBuffer.length, 0);

      const plaintext = Buffer.concat([
        random,
        msgLen,
        msgBuffer,
        corpIdBuffer,
      ]);

      // PKCS#7 填充
      const blockSize = 32;
      const padLen = blockSize - (plaintext.length % blockSize);
      const padding = Buffer.alloc(padLen, padLen);
      const padded = Buffer.concat([plaintext, padding]);

      // AES-256-CBC 加密
      const cipher = crypto.createCipheriv("aes-256-cbc", this.aesKey, this.iv);
      cipher.setAutoPadding(false);

      const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);

      return encrypted.toString("base64");
    } catch (error) {
      this.logger.error(`Encrypt error: ${error}`);
      throw new Error("Failed to encrypt message");
    }
  }

  /**
   * 生成消息签名
   * @param timestamp 时间戳
   * @param nonce 随机字符串
   * @param encryptedMsg 加密的消息
   */
  generateSignature(
    timestamp: string,
    nonce: string,
    encryptedMsg: string,
  ): string {
    const arr = [this.token, timestamp, nonce, encryptedMsg];
    arr.sort();
    const str = arr.join("");
    return crypto.createHash("sha1").update(str).digest("hex");
  }

  /**
   * 解析 XML 消息
   * @param xml XML 字符串
   */
  async parseXml(xml: string): Promise<any> {
    try {
      const result = await parseStringPromise(xml, {
        explicitArray: false,
        ignoreAttrs: true,
      });
      return result.xml || result;
    } catch (error) {
      this.logger.error(`Parse XML error: ${error}`);
      throw new Error("Failed to parse XML");
    }
  }

  /**
   * 构建加密的 XML 响应
   * @param msg 明文消息
   */
  buildEncryptedXml(msg: string): string {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(8).toString("hex");

    const encryptedMsg = this.encrypt(msg);
    const signature = this.generateSignature(timestamp, nonce, encryptedMsg);

    const builder = new Builder({
      rootName: "xml",
      headless: true,
      cdata: true,
    });

    return builder.buildObject({
      Encrypt: encryptedMsg,
      MsgSignature: signature,
      TimeStamp: timestamp,
      Nonce: nonce,
    });
  }

  /**
   * 构建文本回复消息
   * @param toUser 接收方用户ID
   * @param fromUser 发送方（应用）
   * @param content 文本内容
   */
  buildTextReplyXml(toUser: string, fromUser: string, content: string): string {
    const timestamp = Math.floor(Date.now() / 1000);

    const builder = new Builder({
      rootName: "xml",
      headless: true,
      cdata: true,
    });

    return builder.buildObject({
      ToUserName: toUser,
      FromUserName: fromUser,
      CreateTime: timestamp,
      MsgType: "text",
      Content: content,
    });
  }

  /**
   * 检查配置是否完整
   */
  isConfigured(): boolean {
    return !!(this.corpId && this.token && this.encodingAESKey);
  }

  /**
   * 获取 CorpID
   */
  getCorpId(): string {
    return this.corpId;
  }
}
