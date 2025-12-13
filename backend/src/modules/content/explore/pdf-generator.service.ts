import { Injectable, Logger } from "@nestjs/common";
import * as puppeteer from "puppeteer";
import { TranscriptSegment } from "./youtube.service";
import { Readable } from "stream";

export interface SubtitleExportOptions {
  format:
    | "bilingual-side"
    | "bilingual-stack"
    | "english-only"
    | "chinese-only";
  includeTimestamps: boolean;
  includeVideoUrl: boolean;
  includeMetadata: boolean;
}

export interface VideoMetadata {
  videoId: string;
  title: string;
  url: string;
  exportDate: Date;
}

export interface BilingualTranscript {
  english: TranscriptSegment[];
  chinese: TranscriptSegment[];
}

@Injectable()
export class PdfGeneratorService {
  private readonly logger = new Logger(PdfGeneratorService.name);

  /**
   * Generate PDF from subtitles using Puppeteer
   * @param transcript Bilingual transcript data
   * @param metadata Video metadata
   * @param options Export options
   * @returns PDF document stream
   */
  async generatePdf(
    transcript: BilingualTranscript,
    metadata: VideoMetadata,
    options: SubtitleExportOptions,
  ): Promise<Readable> {
    this.logger.log(`Generating PDF for video: ${metadata.videoId}`);

    const html = this.generateHtml(transcript, metadata, options);
    const pdfBuffer = await this.renderPdfFromHtml(html);

    // Convert buffer to stream
    const stream = new Readable();
    stream.push(pdfBuffer);
    stream.push(null);

    return stream;
  }

  /**
   * Generate HTML for PDF rendering
   */
  private generateHtml(
    transcript: BilingualTranscript,
    metadata: VideoMetadata,
    options: SubtitleExportOptions,
  ): string {
    const styles = this.getCssStyles();
    const contentHtml = this.generateContent(transcript, options);
    const metadataHtml = options.includeMetadata
      ? this.generateMetadata(metadata, options.includeVideoUrl)
      : "";

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>${styles}</style>
      </head>
      <body>
        ${metadataHtml}
        ${contentHtml}
      </body>
      </html>
    `;
  }

  /**
   * Get CSS styles for PDF
   */
  private getCssStyles(): string {
    return `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
        line-height: 1.6;
        color: #333;
        padding: 50px;
      }

      .metadata {
        border-bottom: 2px solid #ccc;
        margin-bottom: 30px;
        padding-bottom: 20px;
        text-align: center;
      }

      .metadata h1 {
        font-size: 24px;
        margin-bottom: 10px;
        word-break: break-word;
      }

      .metadata a {
        color: #0066cc;
        text-decoration: none;
        font-size: 12px;
      }

      .metadata a:hover {
        text-decoration: underline;
      }

      .metadata .export-info {
        font-size: 11px;
        color: #666;
        margin-top: 10px;
        font-style: italic;
      }

      .content-section {
        margin-bottom: 40px;
      }

      .section-title {
        font-size: 16px;
        font-weight: bold;
        margin-bottom: 20px;
        text-align: center;
      }

      .transcript-container {
        display: flex;
        gap: 20px;
      }

      .transcript-column {
        flex: 1;
      }

      .column-header {
        font-size: 12px;
        font-weight: bold;
        margin-bottom: 15px;
        padding-bottom: 10px;
        border-bottom: 1px solid #ddd;
      }

      .segment {
        margin-bottom: 15px;
        page-break-inside: avoid;
      }

      .timestamp {
        font-size: 10px;
        color: #999;
        display: block;
        margin-bottom: 3px;
      }

      .text {
        font-size: 11px;
        line-height: 1.5;
        color: #333;
      }

      .stacked .segment {
        margin-bottom: 20px;
      }

      .stacked .timestamp {
        font-weight: bold;
      }

      .stacked .segment-label {
        font-size: 10px;
        font-weight: bold;
        margin-top: 5px;
        color: #666;
      }

      .stacked .english {
        color: #000;
      }

      .stacked .chinese {
        color: #333;
      }

      .single-language {
        max-width: 800px;
        margin: 0 auto;
      }

      .single-language .segment {
        margin-bottom: 12px;
      }

      @media print {
        body {
          padding: 20px;
        }

        .page-break {
          page-break-after: always;
        }
      }
    `;
  }

  /**
   * Generate metadata HTML
   */
  private generateMetadata(
    metadata: VideoMetadata,
    includeUrl: boolean,
  ): string {
    const exportDate = metadata.exportDate.toLocaleString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    return `
      <div class="metadata">
        <h1>${this.escapeHtml(metadata.title)}</h1>
        ${
          includeUrl
            ? `<a href="${metadata.url}" target="_blank">${metadata.url}</a>`
            : ""
        }
        <div class="export-info">
          Exported on: ${exportDate}
          <br>
          Video ID: ${metadata.videoId}
        </div>
      </div>
    `;
  }

  /**
   * Generate content HTML based on format
   */
  private generateContent(
    transcript: BilingualTranscript,
    options: SubtitleExportOptions,
  ): string {
    switch (options.format) {
      case "bilingual-side":
        return this.generateBilingualSideBySide(
          transcript,
          options.includeTimestamps,
        );
      case "bilingual-stack":
        return this.generateBilingualStacked(
          transcript,
          options.includeTimestamps,
        );
      case "english-only":
        return this.generateSingleLanguage(
          transcript.english,
          "EN",
          options.includeTimestamps,
        );
      case "chinese-only":
        return this.generateSingleLanguage(
          transcript.chinese,
          "CN",
          options.includeTimestamps,
        );
      default:
        return "";
    }
  }

  /**
   * Generate bilingual side-by-side HTML
   */
  private generateBilingualSideBySide(
    transcript: BilingualTranscript,
    includeTimestamps: boolean,
  ): string {
    const maxLength = Math.max(
      transcript.english.length,
      transcript.chinese.length,
    );

    let content = `<div class="content-section"><div class="section-title">Bilingual Transcript</div>`;
    content += `<div class="transcript-container">`;
    content += `<div class="transcript-column"><div class="column-header">EN</div>`;

    for (let i = 0; i < maxLength; i++) {
      const english = transcript.english[i];
      if (english) {
        content += `<div class="segment">`;
        if (includeTimestamps) {
          content += `<span class="timestamp">${this.formatTimestamp(english.start)}</span>`;
        }
        content += `<div class="text">${this.escapeHtml(english.text)}</div>`;
        content += `</div>`;
      }
    }

    content += `</div><div class="transcript-column"><div class="column-header">CN</div>`;

    for (let i = 0; i < maxLength; i++) {
      const chinese = transcript.chinese[i];
      if (chinese) {
        content += `<div class="segment">`;
        if (includeTimestamps) {
          content += `<span class="timestamp">${this.formatTimestamp(chinese.start)}</span>`;
        }
        content += `<div class="text">${this.escapeHtml(chinese.text)}</div>`;
        content += `</div>`;
      }
    }

    content += `</div></div></div>`;
    return content;
  }

  /**
   * Generate bilingual stacked HTML
   */
  private generateBilingualStacked(
    transcript: BilingualTranscript,
    includeTimestamps: boolean,
  ): string {
    const maxLength = Math.max(
      transcript.english.length,
      transcript.chinese.length,
    );

    let content = `<div class="content-section stacked"><div class="section-title">Bilingual Transcript</div>`;

    for (let i = 0; i < maxLength; i++) {
      const english = transcript.english[i];
      const chinese = transcript.chinese[i];

      if (english || chinese) {
        const timestamp = english ? english.start : chinese.start;
        content += `<div class="segment">`;

        if (includeTimestamps) {
          content += `<span class="timestamp">${this.formatTimestamp(timestamp)}</span>`;
        }

        if (english) {
          content += `<div class="text english">EN: ${this.escapeHtml(english.text)}</div>`;
        }

        if (chinese) {
          content += `<div class="text chinese">CN: ${this.escapeHtml(chinese.text)}</div>`;
        }

        content += `</div>`;
      }
    }

    content += `</div>`;
    return content;
  }

  /**
   * Generate single language HTML
   */
  private generateSingleLanguage(
    segments: TranscriptSegment[],
    language: string,
    includeTimestamps: boolean,
  ): string {
    let content = `<div class="content-section single-language"><div class="section-title">${language} Transcript</div>`;

    for (const segment of segments) {
      content += `<div class="segment">`;
      if (includeTimestamps) {
        content += `<span class="timestamp">${this.formatTimestamp(segment.start)}</span>`;
      }
      content += `<div class="text">${this.escapeHtml(segment.text)}</div>`;
      content += `</div>`;
    }

    content += `</div>`;
    return content;
  }

  /**
   * Render HTML to PDF using Puppeteer
   */
  private async renderPdfFromHtml(html: string): Promise<Buffer> {
    let browser: puppeteer.Browser | null = null;

    try {
      browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
        ],
      });

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });

      const pdfBuffer = await page.pdf({
        format: "A4",
        margin: { top: 0, bottom: 0, left: 0, right: 0 },
        printBackground: true,
      });

      await page.close();
      return Buffer.from(pdfBuffer);
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Format timestamp in HH:MM:SS format
   */
  private formatTimestamp(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `[${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}]`;
    }
    return `[${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}]`;
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
  }

  /**
   * Align bilingual transcripts by timestamp
   * @param english English transcript segments
   * @param chinese Chinese transcript segments
   * @returns Aligned bilingual transcript
   */
  alignTranscripts(
    english: TranscriptSegment[],
    chinese: TranscriptSegment[],
  ): BilingualTranscript {
    this.logger.log(
      `Aligning transcripts: EN=${english.length}, ZH=${chinese.length}`,
    );

    // Simple alignment based on timestamps
    const aligned: BilingualTranscript = {
      english: [],
      chinese: [],
    };

    let enIndex = 0;
    let zhIndex = 0;

    while (enIndex < english.length || zhIndex < chinese.length) {
      const enSeg = english[enIndex];
      const zhSeg = chinese[zhIndex];

      if (!enSeg && zhSeg) {
        // Only Chinese left
        aligned.english.push({
          text: "",
          start: zhSeg.start,
          duration: zhSeg.duration,
        });
        aligned.chinese.push(zhSeg);
        zhIndex++;
      } else if (enSeg && !zhSeg) {
        // Only English left
        aligned.english.push(enSeg);
        aligned.chinese.push({
          text: "",
          start: enSeg.start,
          duration: enSeg.duration,
        });
        enIndex++;
      } else if (enSeg && zhSeg) {
        // Both available - align by closest timestamp
        const timeDiff = Math.abs(enSeg.start - zhSeg.start);

        if (timeDiff < 1.0) {
          // Close enough - pair them
          aligned.english.push(enSeg);
          aligned.chinese.push(zhSeg);
          enIndex++;
          zhIndex++;
        } else if (enSeg.start < zhSeg.start) {
          // English comes first
          aligned.english.push(enSeg);
          aligned.chinese.push({
            text: "",
            start: enSeg.start,
            duration: enSeg.duration,
          });
          enIndex++;
        } else {
          // Chinese comes first
          aligned.english.push({
            text: "",
            start: zhSeg.start,
            duration: zhSeg.duration,
          });
          aligned.chinese.push(zhSeg);
          zhIndex++;
        }
      }
    }

    this.logger.log(`Alignment complete: ${aligned.english.length} pairs`);
    return aligned;
  }
}
