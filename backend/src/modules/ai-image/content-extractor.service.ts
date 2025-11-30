import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";

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

  constructor(private readonly httpService: HttpService) {}

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
      return this.stripHtmlTags(buffer.toString("utf-8"));
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
   * 使用多种方法尝试获取字幕
   */
  private async extractYouTubeSubtitles(url: string): Promise<string> {
    try {
      // 提取视频 ID
      const videoId = this.extractYouTubeVideoId(url);
      if (!videoId) {
        return `[YouTube video: ${url}]`;
      }

      this.logger.log(`Extracting YouTube subtitles for video: ${videoId}`);

      // 首先获取视频基本信息
      let videoInfo = { title: "", author: "" };
      try {
        const infoUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        const infoResponse = await firstValueFrom(
          this.httpService.get(infoUrl, { timeout: 10000 }),
        );
        if (infoResponse.data) {
          videoInfo = {
            title: infoResponse.data.title || "",
            author: infoResponse.data.author_name || "",
          };
        }
      } catch {
        this.logger.warn(`Failed to get video info for ${videoId}`);
      }

      // 方法1: 尝试从视频页面获取字幕 URL
      const subtitles = await this.fetchYouTubeSubtitlesFromPage(videoId);
      if (subtitles && subtitles.length > 100) {
        this.logger.log(
          `Successfully extracted ${subtitles.length} chars of subtitles`,
        );
        return `[YouTube Video]\nTitle: ${videoInfo.title}\nAuthor: ${videoInfo.author}\n\n[Subtitles]\n${subtitles}`;
      }

      // 方法2: 尝试多种语言的字幕 API
      const languages = [
        "en",
        "en-US",
        "en-GB",
        "zh",
        "zh-CN",
        "zh-TW",
        "auto",
      ];
      for (const lang of languages) {
        try {
          const captionUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=srv3`;
          const response = await firstValueFrom(
            this.httpService.get(captionUrl, {
              timeout: 5000,
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              },
            }),
          );

          if (response.data && typeof response.data === "string") {
            const parsed = this.parseYouTubeSubtitles(response.data);
            if (parsed && parsed.length > 100) {
              this.logger.log(
                `Got subtitles with lang=${lang}, length=${parsed.length}`,
              );
              return `[YouTube Video]\nTitle: ${videoInfo.title}\nAuthor: ${videoInfo.author}\n\n[Subtitles (${lang})]\n${parsed}`;
            }
          }
        } catch {
          // 继续尝试下一种语言
        }
      }

      // 如果都失败，返回视频信息（但加入更多上下文）
      this.logger.warn(
        `Could not extract subtitles for ${videoId}, using title only`,
      );
      return `[YouTube Video]\nTitle: ${videoInfo.title}\nAuthor: ${videoInfo.author}\nURL: ${url}\n\nNote: Could not extract subtitles. Please generate an image based on the video title and context.`;
    } catch (error) {
      this.logger.warn(`Failed to extract YouTube content: ${url}`, error);
      return `[YouTube video: ${url}]`;
    }
  }

  /**
   * 从 YouTube 页面获取字幕 URL 并提取字幕
   */
  private async fetchYouTubeSubtitlesFromPage(
    videoId: string,
  ): Promise<string | null> {
    try {
      // 获取视频页面
      const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const pageResponse = await firstValueFrom(
        this.httpService.get(pageUrl, {
          timeout: 15000,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
          },
        }),
      );

      const html = pageResponse.data;

      // 尝试从页面中提取字幕 URL
      const captionMatch = html.match(/"captionTracks":\s*\[([^\]]+)\]/);
      if (captionMatch) {
        // 解析字幕轨道信息
        const tracksStr = captionMatch[1];
        const urlMatch = tracksStr.match(/"baseUrl":\s*"([^"]+)"/);
        if (urlMatch) {
          const captionUrl = urlMatch[1]
            .replace(/\\u0026/g, "&")
            .replace(/\\\//g, "/");

          // 获取字幕内容
          const captionResponse = await firstValueFrom(
            this.httpService.get(captionUrl, { timeout: 10000 }),
          );

          if (captionResponse.data) {
            return this.parseYouTubeSubtitles(captionResponse.data);
          }
        }
      }

      // 尝试从 ytInitialPlayerResponse 获取
      const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
      if (playerMatch) {
        try {
          const playerData = JSON.parse(playerMatch[1]);
          const captions =
            playerData?.captions?.playerCaptionsTracklistRenderer
              ?.captionTracks;
          if (captions && captions.length > 0) {
            // 优先选择英文或第一个可用的字幕
            const track =
              captions.find((t: any) => t.languageCode?.startsWith("en")) ||
              captions[0];
            if (track?.baseUrl) {
              const captionResponse = await firstValueFrom(
                this.httpService.get(track.baseUrl, { timeout: 10000 }),
              );
              if (captionResponse.data) {
                return this.parseYouTubeSubtitles(captionResponse.data);
              }
            }
          }
        } catch {
          // JSON 解析失败
        }
      }

      return null;
    } catch (error) {
      this.logger.warn(`Failed to fetch subtitles from page: ${error}`);
      return null;
    }
  }

  /**
   * 提取 YouTube 视频 ID
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
   * 解析 YouTube 字幕 XML
   */
  private parseYouTubeSubtitles(xml: string): string {
    try {
      // 简单的 XML 解析，提取文本内容
      const textMatches = xml.match(/<text[^>]*>([^<]*)<\/text>/g);
      if (textMatches) {
        return textMatches
          .map((match) => {
            const text = match.replace(/<[^>]+>/g, "");
            return this.decodeHtmlEntities(text);
          })
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
      }
    } catch {
      // 解析失败
    }
    return "";
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
   * 提取网页内容
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

      let content = response.data;

      if (typeof content === "string") {
        // 提取标题
        const titleMatch = content.match(/<title[^>]*>([^<]*)<\/title>/i);
        const title = titleMatch
          ? this.decodeHtmlEntities(titleMatch[1].trim())
          : "";

        // 提取 meta description
        const descMatch = content.match(
          /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i,
        );
        const description = descMatch
          ? this.decodeHtmlEntities(descMatch[1].trim())
          : "";

        // 提取正文内容
        const bodyContent = this.stripHtmlTags(content);

        let result = "";
        if (title) result += `Title: ${title}\n\n`;
        if (description) result += `Description: ${description}\n\n`;
        result += `Content:\n${bodyContent}`;

        return result.slice(0, 8000); // 限制长度
      } else if (typeof content === "object") {
        return JSON.stringify(content, null, 2).slice(0, 8000);
      }

      return `[Content from: ${url}]`;
    } catch (error) {
      this.logger.warn(`Failed to fetch URL content: ${url}`, error);
      return `[Unable to fetch content from: ${url}]`;
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
   * 解码 HTML 实体
   */
  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
      .replace(/&#x([a-fA-F0-9]+);/g, (_, code) =>
        String.fromCharCode(parseInt(code, 16)),
      );
  }

  /**
   * 提取 PDF 文本（简单实现）
   */
  private extractPdfText(buffer: Buffer): string {
    try {
      // 简单的 PDF 文本提取 - 查找文本流
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
        return `[PDF Content]\n${textMatches.join("\n").slice(0, 5000)}`;
      }

      return "[PDF file - text extraction limited]";
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
