import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AiChatService, ChatMessage } from "../../ai/ai-core/ai-chat.service";
import { WechatImportService } from "../../ai/rag/services/wechat-import.service";

/**
 * 企业微信消息类型
 */
interface WechatWorkMessage {
  ToUserName: string; // 企业微信CorpID
  FromUserName: string; // 成员UserID
  CreateTime: number; // 消息创建时间（时间戳）
  MsgType: string; // 消息类型：text, image, voice, video, location, link, event
  Content?: string; // 文本消息内容
  MsgId?: string; // 消息ID
  AgentID?: string; // 企业应用ID
  PicUrl?: string; // 图片消息图片链接
  MediaId?: string; // 媒体文件ID
  Title?: string; // 链接消息标题
  Description?: string; // 链接消息描述
  Url?: string; // 链接消息URL
  Event?: string; // 事件类型：subscribe, enter_agent, click, view
  EventKey?: string; // 事件KEY值
}

/**
 * 企业微信机器人服务
 * 处理消息接收和发送逻辑
 */
@Injectable()
export class WechatWorkService {
  private readonly logger = new Logger(WechatWorkService.name);

  private corpId: string;
  private agentId: string;
  private secret: string;
  private accessToken: string = "";
  private tokenExpiresAt: number = 0;

  // 触发 AI 分析的关键词前缀
  private readonly AI_TRIGGER_PREFIXES = [
    "@AI",
    "@ai",
    "@助手",
    "@DeepDive",
    "@deepdive",
    "/ai",
    "/分析",
    "/总结",
    "/翻译",
  ];

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
    private prisma: PrismaService,
    private aiChatService: AiChatService,
    private wechatImportService: WechatImportService,
  ) {
    this.corpId = this.configService.get("WECHAT_WORK_CORP_ID", "");
    this.agentId = this.configService.get("WECHAT_WORK_AGENT_ID", "");
    this.secret = this.configService.get("WECHAT_WORK_SECRET", "");
  }

  /**
   * 处理接收到的消息
   */
  async handleMessage(message: WechatWorkMessage): Promise<void> {
    this.logger.log(
      `Processing message: type=${message.MsgType}, from=${message.FromUserName}`,
    );

    switch (message.MsgType) {
      case "text":
        await this.handleTextMessage(message);
        break;
      case "link":
        await this.handleLinkMessage(message);
        break;
      case "event":
        await this.handleEventMessage(message);
        break;
      default:
        this.logger.log(`Unsupported message type: ${message.MsgType}`);
        await this.sendTextMessage(
          message.FromUserName,
          `抱歉，暂时不支持 ${message.MsgType} 类型的消息。\n\n支持的消息类型：\n- 文本消息（@AI 开头触发分析）\n- 链接消息（自动分析网页内容）`,
        );
    }
  }

  /**
   * 处理文本消息
   */
  private async handleTextMessage(message: WechatWorkMessage): Promise<void> {
    const content = message.Content?.trim() || "";
    const fromUser = message.FromUserName;

    this.logger.log(
      `Text message from ${fromUser}: ${content.substring(0, 50)}...`,
    );

    // 检查是否触发 AI 分析
    const aiTrigger = this.AI_TRIGGER_PREFIXES.find((prefix) =>
      content.startsWith(prefix),
    );

    if (aiTrigger) {
      // 移除触发前缀，获取实际内容
      const query = content.substring(aiTrigger.length).trim();

      if (!query) {
        await this.sendTextMessage(fromUser, this.getHelpMessage());
        return;
      }

      // 提取 URL（如果有）
      const urlMatch = query.match(/https?:\/\/[^\s]+/);
      const url = urlMatch ? urlMatch[0] : null;

      // 调用 AI 分析
      await this.sendTextMessage(fromUser, "正在分析中，请稍候...");

      try {
        const aiResponse = await this.callAiAnalysis(query, url);
        await this.sendMarkdownMessage(fromUser, aiResponse);
      } catch (error) {
        this.logger.error(`AI analysis failed: ${error}`);
        await this.sendTextMessage(
          fromUser,
          "抱歉，AI 分析过程中出现错误，请稍后再试。",
        );
      }
    } else {
      // 非 AI 触发消息，返回帮助信息
      await this.sendTextMessage(fromUser, this.getHelpMessage());
    }
  }

  /**
   * 处理链接消息
   * 自动同步到 RAG 知识库，并提供 AI 分析
   */
  private async handleLinkMessage(message: WechatWorkMessage): Promise<void> {
    const fromUser = message.FromUserName;
    const url = message.Url;
    const title = message.Title || "";
    const description = message.Description || "";

    this.logger.log(`Link message from ${fromUser}: ${url}`);

    if (!url) {
      await this.sendTextMessage(fromUser, "未能识别链接内容，请重新发送。");
      return;
    }

    // 发送处理中提示
    await this.sendTextMessage(
      fromUser,
      `正在同步: ${title || url}\n请稍候...`,
    );

    // 1. 同步到 RAG 知识库
    try {
      // 获取用户映射（企业微信 UserID -> 平台 UserID）
      const platformUserId = await this.getUserIdFromWechatWork(fromUser);

      if (platformUserId) {
        const importResult = await this.wechatImportService.importWechatUrl({
          url,
          title,
          description,
          userId: platformUserId,
        });

        // 发送成功消息
        const linkType = this.wechatImportService.identifyLinkType(url);
        const typeLabel =
          linkType === "article"
            ? "公众号文章"
            : linkType === "video"
              ? "视频号视频"
              : "链接";

        await this.sendMarkdownMessage(
          fromUser,
          `**已同步到知识库**\n\n` +
            `**${importResult.title}**\n` +
            `类型: ${typeLabel}\n` +
            `知识库: ${importResult.knowledgeBaseName}\n\n` +
            `[查看详情](${this.getWebUrl()}${importResult.detailUrl})`,
        );
      } else {
        // 用户未绑定，仅进行 AI 分析
        this.logger.warn(
          `User ${fromUser} not mapped to platform user, skipping RAG import`,
        );
        await this.sendTextMessage(
          fromUser,
          `提示: 您尚未绑定平台账号，内容暂未同步到知识库。\n正在进行 AI 分析...`,
        );

        // Fallback to AI analysis
        const aiResponse = await this.callAiAnalysis(
          `请分析这篇文章的内容，给出主要观点、关键信息和总结：${title}`,
          url,
        );
        await this.sendMarkdownMessage(fromUser, aiResponse);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Link import failed: ${errorMessage}`);

      // 检查是否是重复内容
      if (errorMessage.includes("已存在")) {
        await this.sendTextMessage(fromUser, `提示: ${errorMessage}`);
      } else {
        // 导入失败，尝试 AI 分析
        await this.sendTextMessage(
          fromUser,
          `同步失败，正在进行 AI 分析...\n(${errorMessage})`,
        );

        try {
          const aiResponse = await this.callAiAnalysis(
            `请分析这篇文章的内容，给出主要观点、关键信息和总结：${title}`,
            url,
          );
          await this.sendMarkdownMessage(fromUser, aiResponse);
        } catch (aiError) {
          this.logger.error(`AI analysis also failed: ${aiError}`);
          await this.sendTextMessage(
            fromUser,
            "抱歉，内容处理过程中出现错误，请稍后再试。",
          );
        }
      }
    }
  }

  /**
   * 获取平台用户 ID（从企业微信 UserID 映射）
   */
  private async getUserIdFromWechatWork(
    wechatWorkUserId: string,
  ): Promise<string | null> {
    // 方式1: 查找用户表中的 preferences 字段
    const user = await this.prisma.user.findFirst({
      where: {
        preferences: {
          path: ["wechatWorkUserId"],
          equals: wechatWorkUserId,
        },
      },
      select: { id: true },
    });

    if (user) {
      return user.id;
    }

    // 方式2: 如果只有一个用户，直接使用（开发/个人使用场景）
    const userCount = await this.prisma.user.count();
    if (userCount === 1) {
      const singleUser = await this.prisma.user.findFirst({
        select: { id: true },
      });
      return singleUser?.id || null;
    }

    return null;
  }

  /**
   * 获取 Web 应用 URL
   */
  private getWebUrl(): string {
    return this.configService.get("FRONTEND_URL", "https://deepdive.app");
  }

  /**
   * 处理事件消息
   */
  private async handleEventMessage(message: WechatWorkMessage): Promise<void> {
    const fromUser = message.FromUserName;
    const event = message.Event;

    this.logger.log(`Event from ${fromUser}: ${event}`);

    switch (event) {
      case "subscribe":
      case "enter_agent":
        // 用户关注或进入应用
        await this.sendTextMessage(
          fromUser,
          `欢迎使用 DeepDive AI 助手！\n\n${this.getHelpMessage()}`,
        );
        break;
      case "click":
        // 菜单点击事件
        await this.handleMenuClick(fromUser, message.EventKey || "");
        break;
      default:
        this.logger.log(`Unhandled event: ${event}`);
    }
  }

  /**
   * 处理菜单点击
   */
  private async handleMenuClick(
    userId: string,
    eventKey: string,
  ): Promise<void> {
    switch (eventKey) {
      case "help":
        await this.sendTextMessage(userId, this.getHelpMessage());
        break;
      default:
        this.logger.log(`Unknown menu event key: ${eventKey}`);
    }
  }

  /**
   * 调用 AI 分析
   */
  private async callAiAnalysis(
    query: string,
    url?: string | null,
  ): Promise<string> {
    // 获取默认 CHAT 模型配置（企业微信分析需要强模型）
    let defaultModel = await this.prisma.aIModel.findFirst({
      where: {
        isEnabled: true,
        isDefault: true,
        modelType: "CHAT",
      },
    });

    // Fallback: 任意 CHAT 模型
    if (!defaultModel) {
      defaultModel = await this.prisma.aIModel.findFirst({
        where: {
          isEnabled: true,
          modelType: "CHAT",
        },
        orderBy: { createdAt: "desc" },
      });
    }

    if (!defaultModel) {
      throw new Error("No CHAT AI model configured");
    }

    this.logger.log(
      `[WechatWork] Using model: ${defaultModel.name} (${defaultModel.modelId})`,
    );

    // 构建系统提示词
    const systemPrompt = `你是 DeepDive AI 助手，一个智能知识分析助手。
你的任务是帮助用户分析内容、回答问题、提取关键信息。

回复要求：
1. 使用简洁清晰的中文回复
2. 如果是分析网页内容，请提取关键观点和总结
3. 如果是问答，请给出准确、有帮助的回答
4. 适当使用 Markdown 格式使内容更易读
5. 回复长度适中，不要太冗长`;

    // 构建用户消息
    let userContent = query;
    if (url) {
      userContent = `${query}\n\n链接: ${url}`;
    }

    const messages: ChatMessage[] = [{ role: "user", content: userContent }];

    // 调用 AI 服务
    const result = await this.aiChatService.generateChatCompletionWithKey({
      provider: defaultModel.provider,
      modelId: defaultModel.modelId,
      apiKey: defaultModel.apiKey ?? "",
      apiEndpoint: defaultModel.apiEndpoint ?? undefined,
      systemPrompt,
      messages,
      maxTokens: 2000,
      temperature: 0.7,
    });

    return result.content;
  }

  /**
   * 获取 Access Token
   */
  private async getAccessToken(): Promise<string> {
    // 如果 token 未过期，直接返回
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    if (!this.corpId || !this.secret) {
      throw new Error("WeChat Work credentials not configured");
    }

    try {
      const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${this.corpId}&corpsecret=${this.secret}`;
      const response = await firstValueFrom(this.httpService.get(url));

      if (response.data.errcode !== 0) {
        throw new Error(`Failed to get access token: ${response.data.errmsg}`);
      }

      this.accessToken = response.data.access_token;
      // Token 有效期 2 小时，提前 5 分钟刷新
      this.tokenExpiresAt =
        Date.now() + (response.data.expires_in - 300) * 1000;

      this.logger.log("Access token refreshed successfully");
      return this.accessToken;
    } catch (error) {
      this.logger.error(`Failed to get access token: ${error}`);
      throw error;
    }
  }

  /**
   * 发送文本消息
   */
  async sendTextMessage(toUser: string, content: string): Promise<any> {
    return this.sendMessage({
      toUser,
      msgType: "text",
      content,
    });
  }

  /**
   * 发送 Markdown 消息
   */
  async sendMarkdownMessage(toUser: string, content: string): Promise<any> {
    return this.sendMessage({
      toUser,
      msgType: "markdown",
      content,
    });
  }

  /**
   * 发送消息
   */
  async sendMessage(options: {
    toUser?: string;
    toParty?: string;
    toTag?: string;
    msgType: "text" | "markdown" | "textcard";
    content: string;
    title?: string;
    description?: string;
    url?: string;
  }): Promise<any> {
    const accessToken = await this.getAccessToken();

    const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${accessToken}`;

    // 构建消息体
    const body: any = {
      touser: options.toUser || "@all",
      toparty: options.toParty,
      totag: options.toTag,
      msgtype: options.msgType,
      agentid: parseInt(this.agentId),
    };

    // 根据消息类型设置内容
    switch (options.msgType) {
      case "text":
        body.text = { content: options.content };
        break;
      case "markdown":
        body.markdown = { content: options.content };
        break;
      case "textcard":
        body.textcard = {
          title: options.title || "通知",
          description: options.description || options.content,
          url: options.url || "",
          btntxt: "详情",
        };
        break;
    }

    try {
      const response = await firstValueFrom(this.httpService.post(url, body));

      if (response.data.errcode !== 0) {
        throw new Error(`Failed to send message: ${response.data.errmsg}`);
      }

      this.logger.log(`Message sent successfully to ${options.toUser}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to send message: ${error}`);
      throw error;
    }
  }

  /**
   * 获取帮助信息
   */
  private getHelpMessage(): string {
    return `DeepDive AI 助手使用指南

**内容同步功能**
直接转发公众号文章、视频号视频或网页链接到本群，将自动同步到您的 RAG 知识库。

**AI 分析功能**
- @AI + 问题：AI 将回答你的问题
- @AI + 链接：AI 将分析链接内容
- /分析 + 内容：分析指定内容
- /总结 + 内容：总结指定内容
- /翻译 + 内容：翻译指定内容

**使用示例**
- 转发任意链接：自动同步到知识库
- @AI 什么是人工智能？
- /分析 这篇文章的主要观点是什么？`;
  }
}
