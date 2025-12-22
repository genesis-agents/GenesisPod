/**
 * Email Service - 邮件发送服务
 *
 * 使用 nodemailer 发送邮件通知
 * 从数据库设置或环境变量读取 SMTP 配置
 */

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";
import { SettingsService } from "../settings/settings.service";

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: EmailAttachment[];
  replyTo?: string;
}

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private isConfigured = false;
  private smtpFrom = "DeepDive <noreply@deepdive.ai>";
  private adminEmail = "hello.junjie.duan@gmail.com";

  constructor(
    private configService: ConfigService,
    private settingsService: SettingsService,
  ) {}

  async onModuleInit() {
    await this.initializeTransporter();
  }

  /**
   * Initialize email transporter from database settings or env vars
   */
  private async initializeTransporter() {
    try {
      // Get SMTP settings from database (with env fallback)
      const smtpSettings = await this.settingsService.getSmtpSettings();

      const host = smtpSettings.host;
      const port = smtpSettings.port;
      const user = smtpSettings.user;
      const pass = smtpSettings.pass;

      // Store from address and admin email for later use
      this.smtpFrom = smtpSettings.from;
      this.adminEmail = smtpSettings.adminEmail || this.adminEmail;

      this.logger.log(
        `SMTP Config check: host=${host ? "set" : "missing"}, user=${user ? "set" : "missing"}, pass=${pass ? "set" : "missing"}, enabled=${smtpSettings.enabled}`,
      );

      // Check if SMTP is enabled and configured
      if (!smtpSettings.enabled) {
        this.logger.warn(
          "Email service is disabled in settings. Enable it in Admin > Settings > Email.",
        );
        return;
      }

      if (!host || !user || !pass) {
        this.logger.warn(
          "Email service not configured. Configure SMTP in Admin > Settings > Email.",
        );
        return;
      }

      this.transporter = nodemailer.createTransport({
        host,
        port: port || 587,
        secure: port === 465, // true for 465, false for other ports
        auth: {
          user,
          pass,
        },
        // Add connection timeout
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 30000,
      });

      this.isConfigured = true;
      this.logger.log("Email transporter initialized successfully");
    } catch (error) {
      this.logger.error("Failed to initialize email transporter", error);
    }
  }

  /**
   * Check if email service is configured
   */
  isEnabled(): boolean {
    return this.isConfigured && this.transporter !== null;
  }

  /**
   * Send an email with timeout
   */
  async sendEmail(options: SendEmailOptions): Promise<boolean> {
    if (!this.isEnabled()) {
      this.logger.warn(
        "Email service not configured. Skipping email send.",
        options.subject,
      );
      return false;
    }

    const from = this.smtpFrom;
    const to = Array.isArray(options.to) ? options.to.join(", ") : options.to;

    this.logger.log(
      `Attempting to send email to: ${to}, subject: ${options.subject}`,
    );

    try {
      const mailOptions: nodemailer.SendMailOptions = {
        from,
        to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        replyTo: options.replyTo,
        attachments: options.attachments?.map((att) => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType,
        })),
      };

      // Add timeout to prevent hanging
      const sendMailPromise = this.transporter!.sendMail(mailOptions);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("Email send timeout after 30s")),
          30000,
        );
      });

      const info = await Promise.race([sendMailPromise, timeoutPromise]);
      this.logger.log(`Email sent successfully: ${info.messageId}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${to}: ${(error as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Reinitialize transporter (useful when settings are updated)
   */
  async reinitialize(): Promise<void> {
    this.logger.log("Reinitializing email transporter...");
    this.transporter = null;
    this.isConfigured = false;
    await this.initializeTransporter();
  }

  /**
   * Send feedback notification to admin
   */
  async sendFeedbackNotification(feedback: {
    id: string;
    type: string;
    title: string;
    description: string;
    userEmail?: string;
    pageUrl?: string;
    userAgent?: string;
    attachments?: Array<{ filename: string; content: Buffer }>;
  }): Promise<boolean> {
    this.logger.log(
      `Sending feedback notification for: ${feedback.id} (Email enabled: ${this.isEnabled()})`,
    );
    // Use admin email from settings
    const adminEmail = this.adminEmail;

    const typeColors: Record<string, string> = {
      BUG: "#dc2626",
      FEATURE: "#f59e0b",
      IMPROVEMENT: "#3b82f6",
      OTHER: "#6b7280",
    };

    const typeLabels: Record<string, string> = {
      BUG: "Bug Report",
      FEATURE: "Feature Request",
      IMPROVEMENT: "Improvement",
      OTHER: "Other Feedback",
    };

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">New Feedback Received</h1>
        </div>

        <div style="background: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px;">
          <div style="margin-bottom: 20px;">
            <span style="display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; color: white; background-color: ${typeColors[feedback.type] || "#6b7280"};">
              ${typeLabels[feedback.type] || feedback.type}
            </span>
          </div>

          <h2 style="color: #1e293b; margin: 0 0 15px 0; font-size: 20px;">
            ${feedback.title}
          </h2>

          <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 20px;">
            <p style="margin: 0; white-space: pre-wrap;">${feedback.description}</p>
          </div>

          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 8px 0; color: #64748b; width: 120px;">Feedback ID:</td>
              <td style="padding: 8px 0; color: #1e293b; font-family: monospace;">${feedback.id}</td>
            </tr>
            ${
              feedback.userEmail
                ? `
            <tr>
              <td style="padding: 8px 0; color: #64748b;">User Email:</td>
              <td style="padding: 8px 0;"><a href="mailto:${feedback.userEmail}" style="color: #3b82f6;">${feedback.userEmail}</a></td>
            </tr>
            `
                : ""
            }
            ${
              feedback.pageUrl
                ? `
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Page URL:</td>
              <td style="padding: 8px 0;"><a href="${feedback.pageUrl}" style="color: #3b82f6; word-break: break-all;">${feedback.pageUrl}</a></td>
            </tr>
            `
                : ""
            }
            ${
              feedback.attachments && feedback.attachments.length > 0
                ? `
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Attachments:</td>
              <td style="padding: 8px 0;">${feedback.attachments.length} file(s) attached</td>
            </tr>
            `
                : ""
            }
          </table>

          <div style="margin-top: 25px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center;">
            <a href="${this.configService.get("APP_URL", "http://localhost:3000")}/admin/feedback"
               style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
              View in Dashboard
            </a>
          </div>
        </div>

        <div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 12px;">
          <p style="margin: 0;">This is an automated notification from DeepDive</p>
        </div>
      </body>
      </html>
    `;

    const text = `
New Feedback Received

Type: ${typeLabels[feedback.type] || feedback.type}
Title: ${feedback.title}

Description:
${feedback.description}

Feedback ID: ${feedback.id}
${feedback.userEmail ? `User Email: ${feedback.userEmail}` : ""}
${feedback.pageUrl ? `Page URL: ${feedback.pageUrl}` : ""}
${feedback.attachments?.length ? `Attachments: ${feedback.attachments.length} file(s)` : ""}

---
DeepDive Feedback Notification
    `;

    return this.sendEmail({
      to: adminEmail,
      subject: `[DeepDive] New ${typeLabels[feedback.type] || "Feedback"}: ${feedback.title}`,
      html,
      text,
      replyTo: feedback.userEmail,
      attachments: feedback.attachments?.map((att) => ({
        filename: att.filename,
        content: att.content,
      })),
    });
  }
}
