/**
 * Email Sender Tool
 * 邮件发送工具 - 支持发送 HTML/纯文本邮件和附件
 */

import { Injectable, Logger } from "@nestjs/common";
import { BaseTool, JSONSchema, ToolContext } from "../../core";
import { ToolType } from "../../core";

// ============================================================================
// Types
// ============================================================================

export interface EmailAttachment {
  /**
   * 文件名
   */
  filename: string;

  /**
   * 文件内容（Base64 编码）
   */
  content: string;

  /**
   * MIME 类型
   */
  contentType?: string;
}

export interface EmailSenderInput {
  /**
   * 收件人（支持多个）
   */
  to: string[];

  /**
   * 抄送
   */
  cc?: string[];

  /**
   * 密送
   */
  bcc?: string[];

  /**
   * 邮件主题
   */
  subject: string;

  /**
   * 邮件正文
   */
  body: string;

  /**
   * 是否为 HTML 格式
   */
  isHtml?: boolean;

  /**
   * 附件列表
   */
  attachments?: EmailAttachment[];

  /**
   * 发件人信息
   */
  from?: {
    /**
     * 发件人邮箱
     */
    email: string;

    /**
     * 发件人名称
     */
    name?: string;
  };

  /**
   * 邮件优先级
   */
  priority?: "high" | "normal" | "low";

  /**
   * 回复地址
   */
  replyTo?: string;

  /**
   * 计划发送时间（ISO 8601 格式）
   */
  scheduledAt?: string;
}

export interface EmailSenderOutput {
  /**
   * 是否发送成功
   */
  success: boolean;

  /**
   * 邮件 ID
   */
  messageId?: string;

  /**
   * 发送状态
   */
  status: "sent" | "queued" | "scheduled" | "failed";

  /**
   * 收件人状态
   */
  recipients?: Array<{
    email: string;
    status: "delivered" | "queued" | "failed";
    error?: string;
  }>;

  /**
   * 发送时间
   */
  sentAt?: string;

  /**
   * 计划发送时间
   */
  scheduledAt?: string;

  /**
   * 错误信息
   */
  error?: string;
}

// ============================================================================
// Tool Implementation
// ============================================================================

@Injectable()
export class EmailSenderTool extends BaseTool<
  EmailSenderInput,
  EmailSenderOutput
> {
  private readonly logger = new Logger(EmailSenderTool.name);

  readonly type = ToolType.EMAIL_SENDER;
  readonly name = "邮件发送";
  readonly description =
    "发送电子邮件，支持 HTML/纯文本格式、多收件人、抄送、附件等功能。适用于通知、报告发送、自动化邮件等场景。";

  readonly inputSchema: JSONSchema = {
    type: "object",
    properties: {
      to: {
        type: "array",
        description: "收件人邮箱列表",
        items: { type: "string", format: "email" },
        minItems: 1,
      },
      cc: {
        type: "array",
        description: "抄送邮箱列表",
        items: { type: "string", format: "email" },
      },
      bcc: {
        type: "array",
        description: "密送邮箱列表",
        items: { type: "string", format: "email" },
      },
      subject: {
        type: "string",
        description: "邮件主题",
        maxLength: 998,
      },
      body: {
        type: "string",
        description: "邮件正文",
      },
      isHtml: {
        type: "boolean",
        description: "是否为 HTML 格式",
        default: false,
      },
      attachments: {
        type: "array",
        description: "附件列表",
        items: {
          type: "object",
          properties: {
            filename: { type: "string", description: "文件名" },
            content: { type: "string", description: "文件内容（Base64）" },
            contentType: { type: "string", description: "MIME 类型" },
          },
          required: ["filename", "content"],
        },
      },
      from: {
        type: "object",
        description: "发件人信息",
        properties: {
          email: { type: "string", format: "email", description: "发件人邮箱" },
          name: { type: "string", description: "发件人名称" },
        },
      },
      priority: {
        type: "string",
        description: "邮件优先级",
        enum: ["high", "normal", "low"],
        default: "normal",
      },
      replyTo: {
        type: "string",
        format: "email",
        description: "回复地址",
      },
      scheduledAt: {
        type: "string",
        format: "date-time",
        description: "计划发送时间",
      },
    },
    required: ["to", "subject", "body"],
  };

  readonly outputSchema: JSONSchema = {
    type: "object",
    properties: {
      success: { type: "boolean", description: "是否发送成功" },
      messageId: { type: "string", description: "邮件 ID" },
      status: {
        type: "string",
        description: "发送状态",
        enum: ["sent", "queued", "scheduled", "failed"],
      },
      recipients: {
        type: "array",
        description: "收件人状态",
        items: {
          type: "object",
          properties: {
            email: { type: "string" },
            status: { type: "string" },
            error: { type: "string" },
          },
        },
      },
      sentAt: { type: "string", description: "发送时间" },
      scheduledAt: { type: "string", description: "计划发送时间" },
      error: { type: "string", description: "错误信息" },
    },
  };

  constructor() {
    super();
    this.defaultTimeout = 60000; // 60 秒超时
  }

  validateInput(input: EmailSenderInput): boolean {
    // 验证收件人
    if (!input.to || input.to.length === 0) {
      return false;
    }

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const email of input.to) {
      if (!emailRegex.test(email)) {
        return false;
      }
    }

    // 验证主题和正文
    if (!input.subject || !input.body) {
      return false;
    }

    return true;
  }

  protected async doExecute(
    input: EmailSenderInput,
    _context: ToolContext,
  ): Promise<EmailSenderOutput> {
    const {
      to,
      cc,
      bcc,
      subject,
      body: _body,
      isHtml: _isHtml,
      attachments: _attachments,
      scheduledAt,
    } = input;

    this.logger.log(
      `[doExecute] Sending email to ${to.length} recipient(s): ${subject}`,
    );

    try {
      // 模拟邮件发送
      // 实际实现时应该使用 nodemailer 或邮件服务 API（如 SendGrid, Mailgun）
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const messageId = `<${Date.now()}.${Math.random().toString(36).substring(7)}@deepdive.ai>`;
      const allRecipients = [...to, ...(cc || []), ...(bcc || [])];

      // 模拟收件人状态
      const recipients = allRecipients.map((email) => ({
        email,
        status: "delivered" as const,
      }));

      // 检查是否为定时发送
      if (scheduledAt && new Date(scheduledAt) > new Date()) {
        return {
          success: true,
          messageId,
          status: "scheduled",
          recipients,
          scheduledAt,
        };
      }

      this.logger.log(`[doExecute] Email sent successfully: ${messageId}`);

      return {
        success: true,
        messageId,
        status: "sent",
        recipients,
        sentAt: new Date().toISOString(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`[doExecute] Email sending failed: ${errorMessage}`);

      return {
        success: false,
        status: "failed",
        error: errorMessage,
      };
    }
  }
}
