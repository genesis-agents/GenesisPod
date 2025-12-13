import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Headers,
  Res,
  Logger,
  HttpStatus,
} from "@nestjs/common";
import { Response } from "express";
import { WechatWorkService } from "./wechat-work.service";
import { WechatWorkCryptoService } from "./wechat-work-crypto.service";

/**
 * 企业微信机器人回调控制器
 *
 * 配置步骤：
 * 1. 在企业微信管理后台创建自建应用
 * 2. 设置 API 接收消息的 URL 为: https://your-domain/api/v1/wechat-work/callback
 * 3. 配置 Token 和 EncodingAESKey
 * 4. 将应用添加到可信 IP 列表
 */
@Controller("wechat-work")
export class WechatWorkController {
  private readonly logger = new Logger(WechatWorkController.name);

  constructor(
    private readonly wechatWorkService: WechatWorkService,
    private readonly cryptoService: WechatWorkCryptoService,
  ) {}

  /**
   * 企业微信回调 URL 验证（GET 请求）
   * 当在企业微信后台配置回调 URL 时，企业微信会发送 GET 请求验证 URL 有效性
   *
   * @param msg_signature 消息签名
   * @param timestamp 时间戳
   * @param nonce 随机字符串
   * @param echostr 加密的随机字符串，需要解密后返回
   */
  @Get("callback")
  async verifyUrl(
    @Query("msg_signature") msgSignature: string,
    @Query("timestamp") timestamp: string,
    @Query("nonce") nonce: string,
    @Query("echostr") echostr: string,
    @Res() res: Response,
  ) {
    this.logger.log(
      `URL verification request: timestamp=${timestamp}, nonce=${nonce}`,
    );

    if (!this.cryptoService.isConfigured()) {
      this.logger.error("WeChat Work credentials not configured");
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .send("Not configured");
    }

    // 验证签名
    const isValid = this.cryptoService.verifySignature(
      msgSignature,
      timestamp,
      nonce,
      echostr,
    );

    if (!isValid) {
      this.logger.warn("Signature verification failed");
      return res.status(HttpStatus.FORBIDDEN).send("Invalid signature");
    }

    // 解密 echostr 并返回明文
    try {
      const decryptedEchostr = this.cryptoService.decrypt(echostr);
      this.logger.log("URL verification successful");
      return res.status(HttpStatus.OK).send(decryptedEchostr);
    } catch (error) {
      this.logger.error(`Failed to decrypt echostr: ${error}`);
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .send("Decrypt failed");
    }
  }

  /**
   * 接收企业微信消息（POST 请求）
   * 处理来自企业微信的各类消息和事件
   *
   * @param msg_signature 消息签名
   * @param timestamp 时间戳
   * @param nonce 随机字符串
   * @param body XML 格式的加密消息体
   */
  @Post("callback")
  async handleMessage(
    @Query("msg_signature") msgSignature: string,
    @Query("timestamp") timestamp: string,
    @Query("nonce") nonce: string,
    @Body() body: string,
    @Headers("content-type") contentType: string,
    @Res() res: Response,
  ) {
    this.logger.log(
      `Received message callback: timestamp=${timestamp}, contentType=${contentType}`,
    );

    if (!this.cryptoService.isConfigured()) {
      this.logger.error("WeChat Work credentials not configured");
      return res.status(HttpStatus.OK).send("success");
    }

    try {
      // 解析 XML 获取加密消息
      const xmlData = await this.cryptoService.parseXml(body);
      const encryptedMsg = xmlData.Encrypt;

      if (!encryptedMsg) {
        this.logger.warn("No encrypted message in request body");
        return res.status(HttpStatus.OK).send("success");
      }

      // 验证签名
      const isValid = this.cryptoService.verifySignature(
        msgSignature,
        timestamp,
        nonce,
        encryptedMsg,
      );

      if (!isValid) {
        this.logger.warn("Message signature verification failed");
        return res.status(HttpStatus.OK).send("success");
      }

      // 解密消息
      const decryptedXml = this.cryptoService.decrypt(encryptedMsg);
      const message = await this.cryptoService.parseXml(decryptedXml);

      this.logger.log(
        `Received message: MsgType=${message.MsgType}, From=${message.FromUserName}`,
      );

      // 异步处理消息，立即返回 success
      // 企业微信要求 5 秒内响应，否则会重试
      this.wechatWorkService.handleMessage(message).catch((error) => {
        this.logger.error(`Error processing message: ${error}`);
      });

      // 返回 success 表示已接收
      return res.status(HttpStatus.OK).send("success");
    } catch (error) {
      this.logger.error(`Error handling callback: ${error}`);
      // 即使出错也返回 success，避免企业微信重试
      return res.status(HttpStatus.OK).send("success");
    }
  }

  /**
   * 健康检查接口
   */
  @Get("health")
  healthCheck() {
    const isConfigured = this.cryptoService.isConfigured();
    return {
      status: isConfigured ? "ready" : "not_configured",
      corpId: isConfigured
        ? `${this.cryptoService.getCorpId().substring(0, 4)}****`
        : null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 主动发送消息接口（供内部调用）
   */
  @Post("send")
  async sendMessage(
    @Body()
    body: {
      toUser?: string;
      toParty?: string;
      toTag?: string;
      msgType: "text" | "markdown" | "textcard";
      content: string;
      title?: string;
      description?: string;
      url?: string;
    },
  ) {
    this.logger.log(`Send message request: msgType=${body.msgType}`);

    try {
      const result = await this.wechatWorkService.sendMessage(body);
      return {
        success: true,
        ...result,
      };
    } catch (error) {
      this.logger.error(`Failed to send message: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
