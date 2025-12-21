/**
 * Email Service - 邮件发送服务
 *
 * 使用 nodemailer 发送邮件通知
 */

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

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
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private isConfigured = false;

  constructor(private configService: ConfigService) {
    this.initializeTransporter();
  }

  /**
   * Initialize email transporter
   */
  private initializeTransporter() {
    const host = this.configService.get<string>("SMTP_HOST");
    const port = this.configService.get<number>("SMTP_PORT");
    const user = this.configService.get<string>("SMTP_USER");
    const pass = this.configService.get<string>("SMTP_PASS");

    if (!host || !user || !pass) {
      this.logger.warn(
        "Email service not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS environment variables.",
      );
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host,
        port: port || 587,
        secure: port === 465, // true for 465, false for other ports
        auth: {
          user,
          pass,
        },
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
   * Send an email
   */
  async sendEmail(options: SendEmailOptions): Promise<boolean> {
    if (!this.isEnabled()) {
      this.logger.warn(
        "Email service not configured. Skipping email send.",
        options.subject,
      );
      return false;
    }

    const from = this.configService.get<string>(
      "SMTP_FROM",
      "DeepDive <noreply@deepdive.ai>",
    );

    try {
      const mailOptions: nodemailer.SendMailOptions = {
        from,
        to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
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

      const info = await this.transporter!.sendMail(mailOptions);
      this.logger.log(`Email sent successfully: ${info.messageId}`);
      return true;
    } catch (error) {
      this.logger.error("Failed to send email", error);
      return false;
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
    // Default to the project owner's email
    const adminEmail = this.configService.get<string>(
      "ADMIN_EMAIL",
      "hello.junjie.duan@gmail.com",
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
