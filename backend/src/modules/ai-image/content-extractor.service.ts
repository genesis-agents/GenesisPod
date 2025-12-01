import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { YoutubeService } from "../youtube/youtube.service";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import * as pdfjsLib from "pdfjs-dist";

/**
 * 内容提取服务
 * 支持从多种来源提取文本内容：
 * - URL（网页、文章）
 * - 文件（PDF、Word、TXT、Markdown）
 * - 视频（YouTube、Bilibili 字幕）
 * - 图片（OCR 文字识别）
 */
@Injectable()
export class ContentExtractorService {
  private readonly logger = new Logger(ContentExtractorService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly youtubeService: YoutubeService,
  ) { }

  /**
   * 从URL提取内容
   */
  async extractFromUrl(url: string): Promise<string> {
    this.logger.log(`Extracting content from URL: ${url}`);

    // 检测URL类型
    if (this.isYouTubeUrl(url)) {
      return this.extractYouTubeSubtitles(url);
    }

    if (this.isBilibiliUrl(url)) {
      return this.extractBilibiliSubtitles(url);
    }

    // 检查是否是 PDF URL
    if (url.toLowerCase().endsWith(".pdf")) {
      return this.extractPdfFromUrl(url);
    }

    // 普通网页内容提取
    return this.extractWebPageContent(url);
  }

  /**
   * 从文件内容提取文本
   */
  async extractFromFile(
    buffer: Buffer,
    mimeType: string,
    filename: string,
  ): Promise<string> {
    this.logger.log(`Extracting content from file: ${filename} (${mimeType})`);

    // 文本文件
    if (
      mimeType === "text/plain" ||
      mimeType === "text/markdown" ||
      filename.endsWith(".txt") ||
      filename.endsWith(".md")
    ) {
      return buffer.toString("utf-8");
    }

    // JSON 文件
    if (mimeType === "application/json" || filename.endsWith(".json")) {
      try {
        const json = JSON.parse(buffer.toString("utf-8"));
        return this.flattenJson(json);
      } catch {
        return buffer.toString("utf-8");
      }
    }

    // HTML 文件
    if (mimeType === "text/html" || filename.endsWith(".html")) {
      return this.extractHtmlContent(buffer.toString("utf-8"), filename);
    }

    // PDF 文件 - 简单文本提取
    if (mimeType === "application/pdf" || filename.endsWith(".pdf")) {
      return this.extractPdfText(buffer);
    }

    // 字幕文件 (SRT, VTT)
    if (
      filename.endsWith(".srt") ||
      filename.endsWith(".vtt") ||
      mimeType === "text/vtt"
    ) {
      return this.extractSubtitleText(buffer.toString("utf-8"));
    }

    // 默认尝试作为文本处理
    try {
      return buffer.toString("utf-8");
    } catch {
      return `[Binary file: ${filename}]`;
    }
  }

  /**
   * 从 Base64 图片提取文字（使用 AI 模型进行 OCR）
   */
  async extractFromImage(base64Image: string, apiKey: string): Promise<string> {
    this.logger.log("Extracting text from image using AI model");

    try {
      // 使用 Gemini Vision API 进行图片理解
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

      const response = await firstValueFrom(
        this.httpService.post(
          url,
          {
            contents: [
              {
                parts: [
                  {
                    text: "Describe this image in detail. Extract any text visible in the image. Identify the main subjects, colors, mood, and style.",
                  },
                  {
                    inlineData: {
                      mimeType: "image/jpeg",
                      data: base64Image.replace(/^data:image\/\w+;base64,/, ""),
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              maxOutputTokens: 1000,
              temperature: 0.3,
            },
          },
          {
            headers: { "Content-Type": "application/json" },
            timeout: 30000,
          },
        ),
      );

      const candidates = response.data.candidates;
      if (candidates?.[0]?.content?.parts?.[0]?.text) {
        return candidates[0].content.parts[0].text;
      }

      return "[Unable to extract content from image]";
    } catch (error) {
      this.logger.error("Image content extraction failed:", error);
      return "[Image analysis failed]";
    }
  }

  // ============ 私有方法 ============

  /**
   * 检测是否为 YouTube URL
   */
  private isYouTubeUrl(url: string): boolean {
    return (
      url.includes("youtube.com") ||
      url.includes("youtu.be") ||
      url.includes("youtube-nocookie.com")
    );
  }

  /**
   * 检测是否为 Bilibili URL
   */
  private isBilibiliUrl(url: string): boolean {
    return url.includes("bilibili.com") || url.includes("b23.tv");
  }

  /**
   * 提取 YouTube 视频字幕
   * 复用 YoutubeService 的成熟实现（支持 youtubei.js 和 youtube-transcript）
   */
  private async extractYouTubeSubtitles(url: string): Promise<string> {
    try {
      // 使用 YoutubeService 提取视频 ID
      const videoId = this.youtubeService.extractVideoId(url);
      if (!videoId) {
        this.logger.warn(`Could not extract video ID from URL: ${url}`);
        return `[YouTube video: ${url}]`;
      }

      this.logger.log(
        `Extracting YouTube subtitles for video: ${videoId} using YoutubeService`,
      );

      // 调用 YoutubeService 获取字幕（它有完整的多层回退机制）
      const transcriptResponse = await this.youtubeService.getTranscript(
        videoId,
        "en",
      );

      // 将字幕段落合并为文本
      const subtitleText = transcriptResponse.transcript
        .map((segment) => segment.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      this.logger.log(
        `Successfully extracted ${subtitleText.length} chars of subtitles for "${transcriptResponse.title}"`,
      );

      return `[YouTube Video]\nTitle: ${transcriptResponse.title}\n\n[Subtitles]\n${subtitleText}`;
    } catch (error: any) {
      this.logger.warn(
        `Failed to extract YouTube subtitles via YoutubeService: ${error?.message || error}`,
      );

      // 回退：尝试获取视频基本信息
      try {
        const videoId = this.extractYouTubeVideoId(url);
        if (videoId) {
          const infoUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
          const infoResponse = await firstValueFrom(
            this.httpService.get(infoUrl, { timeout: 10000 }),
          );
          if (infoResponse.data) {
            return `[YouTube Video]\nTitle: ${infoResponse.data.title || "Unknown"}\nAuthor: ${infoResponse.data.author_name || "Unknown"}\nURL: ${url}\n\nNote: Could not extract subtitles. Please generate an image based on the video title.`;
          }
        }
      } catch {
        // 忽略回退错误
      }

      return `[YouTube video: ${url}]`;
    }
  }

  /**
   * 提取 YouTube 视频 ID（作为回退使用）
   */
  private extractYouTubeVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }

    return null;
  }

  /**
   * 提取 Bilibili 视频字幕
   */
  private async extractBilibiliSubtitles(url: string): Promise<string> {
    try {
      // 提取视频 BV 号
      const bvMatch = url.match(/BV[a-zA-Z0-9]+/);
      const bvId = bvMatch ? bvMatch[0] : null;

      if (!bvId) {
        return `[Bilibili video: ${url}]`;
      }

      // 获取视频信息
      const infoUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvId}`;
      const infoResponse = await firstValueFrom(
        this.httpService.get(infoUrl, {
          timeout: 10000,
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; DeepDive/1.0)",
            Referer: "https://www.bilibili.com/",
          },
        }),
      );

      if (infoResponse.data?.data) {
        const videoInfo = infoResponse.data.data;
        let content = `[Bilibili Video]\nTitle: ${videoInfo.title}\nDescription: ${videoInfo.desc || "N/A"}\nAuthor: ${videoInfo.owner?.name || "N/A"}`;

        // 尝试获取字幕
        if (videoInfo.subtitle?.list?.length > 0) {
          const subtitleUrl = videoInfo.subtitle.list[0].subtitle_url;
          if (subtitleUrl) {
            try {
              const subtitleResponse = await firstValueFrom(
                this.httpService.get(
                  subtitleUrl.startsWith("//")
                    ? `https:${subtitleUrl}`
                    : subtitleUrl,
                  { timeout: 10000 },
                ),
              );

              if (subtitleResponse.data?.body) {
                const subtitleText = subtitleResponse.data.body
                  .map((item: any) => item.content)
                  .join(" ");
                content += `\n\nSubtitles:\n${subtitleText}`;
              }
            } catch {
              // 字幕获取失败
            }
          }
        }

        return content;
      }

      return `[Bilibili video: ${url}]`;
    } catch (error) {
      this.logger.warn(`Failed to extract Bilibili content: ${url}`, error);
      return `[Bilibili video: ${url}]`;
    }
  }

  /**
   * 提取网页内容（使用 Readability）
   */
  private async extractWebPageContent(url: string): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
          },
          timeout: 15000,
          maxRedirects: 5,
        }),
      );

      const html = typeof response.data === "string" ? response.data : JSON.stringify(response.data);
      return this.extractHtmlContent(html, url);
    } catch (error) {
      this.logger.warn(`Failed to fetch URL content: ${url}`, error);
      return `[Unable to fetch content from: ${url}]`;
    }
  }

  /**
   * 从 HTML 内容中提取正文（使用 Readability）
   */
  private extractHtmlContent(html: string, sourceUrl: string): string {
    try {
      const dom = new JSDOM(html, { url: sourceUrl.startsWith('http') ? sourceUrl : 'http://localhost' });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (article) {
        let result = `Title: ${article.title}\n`;
        if (article.byline) result += `Author: ${article.byline}\n`;
        if (article.siteName) result += `Site: ${article.siteName}\n`;
        result += `\nContent:\n${article.textContent}`;

        // 限制长度，但保留足够多的内容
        return result.slice(0, 15000);
      }

      // Readability 失败，回退到简单的 HTML 标签移除
      this.logger.warn(`Readability failed to parse content from ${sourceUrl}, falling back to simple stripping`);
      return this.stripHtmlTags(html).slice(0, 10000);
    } catch (error) {
      this.logger.error(`Failed to parse HTML from ${sourceUrl}:`, error);
      return this.stripHtmlTags(html).slice(0, 5000);
    }
  }

  /**
   * 从 URL 下载并提取 PDF 内容
   */
  private async extractPdfFromUrl(url: string): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          responseType: 'arraybuffer',
          timeout: 30000,
        }),
      );

      return this.extractPdfText(Buffer.from(response.data));
    } catch (error) {
      this.logger.error(`Failed to download PDF from ${url}:`, error);
      return `[Failed to download PDF from: ${url}]`;
    }
  }

  /**
   * 移除 HTML 标签
   */
  private stripHtmlTags(html: string): string {
    return (
      html
        // 移除 script 和 style
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
        // 移除注释
        .replace(/<!--[\s\S]*?-->/g, "")
        // 移除所有标签
        .replace(/<[^>]+>/g, " ")
        // 解码 HTML 实体
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        // 清理多余空白
        .replace(/\s+/g, " ")
        .trim()
    );
  }



  /**
   * 提取 PDF 文本（使用 pdfjs-dist）
   */
  private async extractPdfText(buffer: Buffer): Promise<string> {
    try {
      // 将 Buffer 转换为 Uint8Array
      const uint8Array = new Uint8Array(buffer);

      // 加载 PDF 文档
      const loadingTask = pdfjsLib.getDocument({
        data: uint8Array,
        useSystemFonts: true,
        disableFontFace: true,
      });

      const pdfDocument = await loadingTask.promise;
      const numPages = pdfDocument.numPages;
      let fullText = `[PDF Document - ${numPages} pages]\n\n`;

      // 限制提取页数，防止过大（例如前 20 页）
      const maxPages = Math.min(numPages, 20);

      for (let i = 1; i <= maxPages; i++) {
        const page = await pdfDocument.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');

        fullText += `--- Page ${i} ---\n${pageText}\n\n`;
      }

      if (numPages > maxPages) {
        fullText += `\n... (Remaining ${numPages - maxPages} pages omitted)`;
      }

      return fullText;
    } catch (error) {
      this.logger.error("Failed to extract PDF text using pdfjs-dist:", error);
      // 回退到旧的简单提取方法
      return this.extractPdfTextSimple(buffer);
    }
  }

  /**
   * 提取 PDF 文本（简单回退实现）
   */
  private extractPdfTextSimple(buffer: Buffer): string {
    try {
      const content = buffer.toString("binary");
      const textMatches: string[] = [];

      // 匹配 PDF 文本对象
      const streamRegex = /stream\s*([\s\S]*?)\s*endstream/g;
      let match;

      while ((match = streamRegex.exec(content)) !== null) {
        const stream = match[1];
        // 提取可打印字符
        const text = stream
          .replace(/[^\x20-\x7E\n\r]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (text.length > 10) {
          textMatches.push(text);
        }
      }

      if (textMatches.length > 0) {
        return `[PDF Content (Simple Extraction)]\n${textMatches.join("\n").slice(0, 5000)}`;
      }

      return "[PDF file - text extraction failed]";
    } catch {
      return "[PDF file - unable to extract text]";
    }
  }

  /**
   * 提取字幕文件文本
   */
  private extractSubtitleText(content: string): string {
    // 移除 SRT/VTT 时间戳和序号
    return content
      .replace(/^\d+\s*$/gm, "") // 序号
      .replace(
        /\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}/g,
        "",
      ) // 时间戳
      .replace(/WEBVTT/g, "")
      .replace(/<[^>]+>/g, "") // HTML 标签
      .replace(/\{[^}]+\}/g, "") // 样式标签
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * 扁平化 JSON 对象为文本
   */
  private flattenJson(obj: any, prefix = ""): string {
    const result: string[] = [];

    if (typeof obj === "string") {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj
        .map((item, i) => this.flattenJson(item, `${prefix}[${i}]`))
        .join("\n");
    }

    if (typeof obj === "object" && obj !== null) {
      for (const key of Object.keys(obj)) {
        const value = obj[key];
        const newPrefix = prefix ? `${prefix}.${key}` : key;

        if (typeof value === "object") {
          result.push(this.flattenJson(value, newPrefix));
        } else {
          result.push(`${newPrefix}: ${value}`);
        }
      }
    }

    return result.join("\n");
  }
}
