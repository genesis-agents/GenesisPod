/**
 * Email Service - 邮件发送服务
 *
 * 支持两种邮件提供商:
 * 1. SMTP (使用 nodemailer)
 * 2. Resend (使用 Resend API)
 *
 * 从数据库设置或环境变量读取配置
 */

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";
import { Resend } from "resend";
import { SettingsService } from "../settings/settings.service";

export type EmailProvider = "smtp" | "resend";

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
  private smtpTransporter: nodemailer.Transporter | null = null;
  private resendClient: Resend | null = null;
  private provider: EmailProvider = "smtp";
  private isConfigured = false;
  private emailFrom = "DeepDive <noreply@deepdive.ai>";
  private adminEmail = "hello.junjie.duan@gmail.com";

  constructor(
    private configService: ConfigService,
    private settingsService: SettingsService,
  ) {}

  async onModuleInit() {
    await this.initializeEmailProvider();
  }

  /**
   * Initialize email provider from database settings or env vars
   */
  private async initializeEmailProvider() {
    try {
      const emailSettings = await this.settingsService.getEmailSettings();

      this.provider = emailSettings.provider;
      this.emailFrom = emailSettings.from;
      this.adminEmail = emailSettings.adminEmail || this.adminEmail;

      this.logger.log(`Email provider: ${this.provider}`);

      if (!emailSettings.enabled) {
        this.logger.warn(
          "Email service is disabled. Enable it in Admin > Settings > Email.",
        );
        return;
      }

      if (this.provider === "resend") {
        await this.initializeResend(emailSettings.resendApiKey);
      } else {
        await this.initializeSmtp(emailSettings);
      }
    } catch (error) {
      this.logger.error("Failed to initialize email provider", error);
    }
  }

  /**
   * Initialize Resend client
   */
  private async initializeResend(apiKey: string | null) {
    if (!apiKey) {
      this.logger.warn(
        "Resend API key not configured. Configure it in Admin > Settings > Email.",
      );
      return;
    }

    try {
      this.resendClient = new Resend(apiKey);
      this.isConfigured = true;
      this.logger.log("Resend email client initialized successfully");
    } catch (error) {
      this.logger.error("Failed to initialize Resend client", error);
    }
  }

  /**
   * Initialize SMTP transporter
   */
  private async initializeSmtp(settings: {
    host: string | null;
    port: number;
    user: string | null;
    pass: string | null;
  }) {
    const { host, port, user, pass } = settings;

    this.logger.log(
      `SMTP Config check: host=${host ? "set" : "missing"}, user=${user ? "set" : "missing"}, pass=${pass ? "set" : "missing"}`,
    );

    if (!host || !user || !pass) {
      this.logger.warn(
        "SMTP settings incomplete. Configure in Admin > Settings > Email.",
      );
      return;
    }

    try {
      this.smtpTransporter = nodemailer.createTransport({
        host,
        port: port || 587,
        secure: port === 465,
        auth: { user, pass },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 30000,
      });

      this.isConfigured = true;
      this.logger.log("SMTP email transporter initialized successfully");
    } catch (error) {
      this.logger.error("Failed to initialize SMTP transporter", error);
    }
  }

  /**
   * Check if email service is configured
   */
  isEnabled(): boolean {
    return this.isConfigured;
  }

  /**
   * Get current provider
   */
  getProvider(): EmailProvider {
    return this.provider;
  }

  /**
   * Send an email using the configured provider
   */
  async sendEmail(options: SendEmailOptions): Promise<boolean> {
    if (!this.isEnabled()) {
      this.logger.warn(
        "Email service not configured. Skipping email send.",
        options.subject,
      );
      return false;
    }

    const to = Array.isArray(options.to) ? options.to : [options.to];

    this.logger.log(
      `Sending email via ${this.provider} to: ${to.join(", ")}, subject: ${options.subject}`,
    );

    try {
      if (this.provider === "resend") {
        return await this.sendViaResend(options, to);
      } else {
        return await this.sendViaSmtp(options, to);
      }
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${to.join(", ")}: ${(error as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Send email via Resend API
   */
  private async sendViaResend(
    options: SendEmailOptions,
    to: string[],
  ): Promise<boolean> {
    if (!this.resendClient) {
      this.logger.error("Resend client not initialized");
      return false;
    }

    try {
      // Build email options - use any to avoid complex Resend SDK typing
      const emailOptions: any = {
        from: this.emailFrom,
        to,
        subject: options.subject,
      };

      // Add content (html takes priority)
      if (options.html) {
        emailOptions.html = options.html;
      } else if (options.text) {
        emailOptions.text = options.text;
      }

      // Add optional fields
      if (options.replyTo) {
        emailOptions.replyTo = options.replyTo;
      }

      // Add attachments if present
      if (options.attachments && options.attachments.length > 0) {
        emailOptions.attachments = options.attachments.map((att) => ({
          filename: att.filename,
          content:
            typeof att.content === "string"
              ? Buffer.from(att.content)
              : att.content,
        }));
      }

      const response = await this.resendClient.emails.send(emailOptions);

      if (response.error) {
        this.logger.error(`Resend error: ${response.error.message}`);
        return false;
      }

      this.logger.log(`Email sent via Resend: ${response.data?.id}`);
      return true;
    } catch (error) {
      this.logger.error(`Resend send error: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Send email via SMTP
   */
  private async sendViaSmtp(
    options: SendEmailOptions,
    to: string[],
  ): Promise<boolean> {
    if (!this.smtpTransporter) {
      this.logger.error("SMTP transporter not initialized");
      return false;
    }

    const mailOptions: nodemailer.SendMailOptions = {
      from: this.emailFrom,
      to: to.join(", "),
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
    const sendMailPromise = this.smtpTransporter.sendMail(mailOptions);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error("Email send timeout after 30s")),
        30000,
      );
    });

    const info = await Promise.race([sendMailPromise, timeoutPromise]);
    this.logger.log(`Email sent via SMTP: ${info.messageId}`);
    return true;
  }

  /**
   * Reinitialize provider (useful when settings are updated)
   */
  async reinitialize(): Promise<void> {
    this.logger.log("Reinitializing email provider...");
    this.smtpTransporter = null;
    this.resendClient = null;
    this.isConfigured = false;
    await this.initializeEmailProvider();
  }

  /**
   * Test email connection
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.isEnabled()) {
      return {
        success: false,
        message: "Email service not configured",
      };
    }

    if (this.provider === "resend") {
      return this.testResendConnection();
    } else {
      return this.testSmtpConnection();
    }
  }

  /**
   * Test Resend connection by sending a test email
   */
  private async testResendConnection(): Promise<{
    success: boolean;
    message: string;
  }> {
    if (!this.resendClient) {
      return { success: false, message: "Resend client not initialized" };
    }

    try {
      // Test by checking API key validity via a minimal API call
      const result = await this.resendClient.emails.send({
        from: this.emailFrom,
        to: this.adminEmail,
        subject: "DeepDive Email Test (Resend)",
        text: "This is a test email from DeepDive using Resend. If you received this, your email configuration is working!",
        html: `
          <div style="font-family: sans-serif; padding: 20px;">
            <h2>DeepDive Email Test</h2>
            <p>This is a test email sent via <strong>Resend</strong>.</p>
            <p>If you received this, your email configuration is working correctly!</p>
            <hr>
            <p style="color: #666; font-size: 12px;">Sent at: ${new Date().toISOString()}</p>
          </div>
        `,
      });

      if (result.error) {
        return {
          success: false,
          message: `Resend error: ${result.error.message}`,
        };
      }

      return {
        success: true,
        message: `Test email sent successfully via Resend to ${this.adminEmail}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Resend test failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Test SMTP connection
   */
  private async testSmtpConnection(): Promise<{
    success: boolean;
    message: string;
  }> {
    if (!this.smtpTransporter) {
      return { success: false, message: "SMTP transporter not initialized" };
    }

    try {
      await this.smtpTransporter.verify();

      // Send a test email
      await this.smtpTransporter.sendMail({
        from: this.emailFrom,
        to: this.adminEmail,
        subject: "DeepDive Email Test (SMTP)",
        text: "This is a test email from DeepDive using SMTP. If you received this, your email configuration is working!",
        html: `
          <div style="font-family: sans-serif; padding: 20px;">
            <h2>DeepDive Email Test</h2>
            <p>This is a test email sent via <strong>SMTP</strong>.</p>
            <p>If you received this, your email configuration is working correctly!</p>
            <hr>
            <p style="color: #666; font-size: 12px;">Sent at: ${new Date().toISOString()}</p>
          </div>
        `,
      });

      return {
        success: true,
        message: `Test email sent successfully via SMTP to ${this.adminEmail}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `SMTP test failed: ${(error as Error).message}`,
      };
    }
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
      to: this.adminEmail,
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
