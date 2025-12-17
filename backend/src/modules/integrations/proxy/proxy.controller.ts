import {
  Controller,
  Get,
  Query,
  Res,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Response } from "express";
import axios from "axios";
import {
  isDomainAllowed,
  WHITELISTED_DOMAINS,
} from "../../../config/domain-whitelist.config";
import { AdvancedExtractorService } from "./advanced-extractor.service";
import { NewsExtractorService } from "./news-extractor.service";

/**
 * 代理控制器 - 用于代理外部资源（如 PDF），绕过 CORS 和 X-Frame-Options 限制
 */
@Controller("proxy")
export class ProxyController {
  private readonly logger = new Logger(ProxyController.name);

  constructor(
    private advancedExtractor: AdvancedExtractorService,
    private newsExtractor: NewsExtractorService,
  ) {}
  /**
   * 代理 PDF 文件
   *
   * 解决问题：
   * 1. arXiv 等网站的 X-Frame-Options: DENY 阻止 iframe 嵌入
   * 2. CORS 跨域限制
   *
   * 使用方式：
   * http://localhost:4000/api/v1/proxy/pdf?url=https://arxiv.org/pdf/2511.04676v1
   */
  @Get("pdf")
  async proxyPdf(
    @Query("url") url: string,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`PDF proxy request received for URL: ${url}`);

    if (!url) {
      this.logger.warn("PDF proxy request missing URL parameter");
      throw new HttpException(
        "URL parameter is required",
        HttpStatus.BAD_REQUEST,
      );
    }

    // 安全检查：使用可配置的域名白名单
    try {
      const urlObj = new URL(url);

      if (!isDomainAllowed(urlObj.hostname)) {
        this.logger.warn(
          `PDF proxy blocked - domain not allowed: ${urlObj.hostname}`,
        );
        throw new HttpException(
          `Domain ${urlObj.hostname} is not allowed. Allowed domains: ${WHITELISTED_DOMAINS.join(", ")}`,
          HttpStatus.FORBIDDEN,
        );
      }

      this.logger.log(`Fetching PDF from allowed domain: ${urlObj.hostname}`);

      // 从远程服务器获取 PDF
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 30000, // 30 seconds timeout
        maxRedirects: 5, // 跟随重定向
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Accept-Encoding": "gzip, deflate, br",
          DNT: "1",
          Connection: "keep-alive",
          "Upgrade-Insecure-Requests": "1",
        },
      });

      // 设置响应头，允许在 iframe 中显示
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline");
      // 关键：不设置 X-Frame-Options，允许 iframe 嵌入
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin"); // 允许跨域 iframe 加载
      res.setHeader("Cache-Control", "public, max-age=86400"); // 缓存 24 小时
      // 移除限制性的 CSP 头，允许任何来源的 iframe 嵌入
      res.removeHeader("Content-Security-Policy");
      res.removeHeader("X-Frame-Options");

      this.logger.log(
        `Successfully fetched PDF (${Buffer.from(response.data).length} bytes)`,
      );

      // 发送 PDF 数据
      res.send(Buffer.from(response.data));
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      if (axios.isAxiosError(error)) {
        this.logger.error(
          `Failed to fetch PDF from ${url}: ${error.message}`,
          error.stack,
        );
        throw new HttpException(
          `Failed to fetch PDF: ${error.message}`,
          error.response?.status || HttpStatus.BAD_GATEWAY,
        );
      }

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Internal error while proxying PDF: ${errorMessage}`,
        errorStack,
      );
      throw new HttpException(
        "Internal server error while proxying PDF",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 代理 HTML 页面
   *
   * 解决问题：
   * 1. arXiv 等网站的 X-Frame-Options: SAMEORIGIN 阻止 iframe 嵌入
   * 2. CORS 跨域限制
   *
   * 使用方式：
   * http://localhost:4000/api/v1/proxy/html?url=https://arxiv.org/abs/2511.04675v1
   */
  @Get("html")
  async proxyHtml(
    @Query("url") url: string,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`HTML proxy request received for URL: ${url}`);

    if (!url) {
      this.logger.warn("HTML proxy request missing URL parameter");
      throw new HttpException(
        "URL parameter is required",
        HttpStatus.BAD_REQUEST,
      );
    }

    // 安全检查：使用可配置的域名白名单
    try {
      const urlObj = new URL(url);

      if (!isDomainAllowed(urlObj.hostname)) {
        this.logger.warn(
          `HTML proxy blocked - domain not allowed: ${urlObj.hostname}`,
        );
        throw new HttpException(
          `Domain ${urlObj.hostname} is not allowed. Allowed domains: ${WHITELISTED_DOMAINS.join(", ")}`,
          HttpStatus.FORBIDDEN,
        );
      }

      this.logger.log(`Fetching HTML from allowed domain: ${urlObj.hostname}`);

      // 从远程服务器获取 HTML - 使用真实浏览器特征
      const response = await axios.get(url, {
        responseType: "text",
        timeout: 30000,
        maxRedirects: 5,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
          "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
          "Accept-Encoding": "gzip, deflate, br, zstd",
          "Cache-Control": "max-age=0",
          "sec-ch-ua":
            '"Microsoft Edge";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Upgrade-Insecure-Requests": "1",
          DNT: "1",
          Connection: "keep-alive",
        },
      });

      // 设置响应头，允许在 iframe 中显示
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      // 关键：不设置 X-Frame-Options，允许 iframe 嵌入
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=3600"); // 缓存 1 小时
      // 移除限制性的 CSP 头，允许任何来源的 iframe 嵌入
      res.removeHeader("Content-Security-Policy");
      res.removeHeader("X-Frame-Options");

      // 修改 HTML，移除限制性头部并添加 base 标签
      let html = response.data as string;
      const baseUrl = `${urlObj.protocol}//${urlObj.hostname}`;

      // 移除阻止 iframe 嵌入的 meta 标签
      // 这些标签会阻止内容在 iframe 中显示，即使使用 Blob URL
      html = html.replace(
        /<meta\s+http-equiv=["']?Content-Security-Policy["']?\s+content=["'][^"']*["']\s*\/?>/gi,
        "",
      );
      html = html.replace(
        /<meta\s+http-equiv=["']?X-Frame-Options["']?\s+content=["'][^"']*["']\s*\/?>/gi,
        "",
      );

      // 在 <head> 标签后插入 <base> 标签以正确加载相对路径资源
      if (html.includes("<head>")) {
        html = html.replace("<head>", `<head><base href="${baseUrl}/">`);
      } else if (html.includes("<HEAD>")) {
        html = html.replace("<HEAD>", `<HEAD><base href="${baseUrl}/">`);
      }

      this.logger.log(
        `Successfully processed HTML (${html.length} characters) from ${urlObj.hostname}`,
      );

      // 发送修改后的 HTML 数据
      res.send(html);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      if (axios.isAxiosError(error)) {
        this.logger.error(
          `Failed to fetch HTML from ${url}: ${error.message}`,
          error.stack,
        );
        throw new HttpException(
          `Failed to fetch HTML: ${error.message}`,
          error.response?.status || HttpStatus.BAD_GATEWAY,
        );
      }

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Internal error while proxying HTML: ${errorMessage}`,
        errorStack,
      );
      throw new HttpException(
        "Internal server error while proxying HTML",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Reader Mode - 提取网页主要内容
   *
   * 使用高级4层容错提取机制：
   * Plan A: Readability (70-80% success) - 最优方案，适合新闻/博客
   * Plan B: DOM 节点提取 (60-70% success) - Readability失败时的备选
   * Plan C: 正则表达式提取 (50-60% success) - 结构化内容提取
   * Plan D: 基础HTML降级 (>99% success) - 最后的安全网
   *
   * 完美解决X-Frame-Options、CSP等限制
   * 支持AI完整分析内容
   * 确保提取成功率 >95%
   *
   * 使用方式：
   * http://localhost:4000/api/v1/proxy/html-reader?url=https://example.com
   */
  @Get("html-reader")
  async proxyHtmlReader(@Query("url") url: string): Promise<any> {
    this.logger.log(`Reader Mode request received for URL: ${url}`);

    if (!url) {
      this.logger.warn("Reader Mode request missing URL parameter");
      throw new HttpException(
        "URL parameter is required",
        HttpStatus.BAD_REQUEST,
      );
    }

    // 安全检查：使用可配置的域名白名单
    try {
      const urlObj = new URL(url);

      if (!isDomainAllowed(urlObj.hostname)) {
        this.logger.warn(
          `Reader Mode blocked - domain not allowed: ${urlObj.hostname}`,
        );
        throw new HttpException(
          `Domain ${urlObj.hostname} is not allowed. Allowed domains: ${WHITELISTED_DOMAINS.join(", ")}`,
          HttpStatus.FORBIDDEN,
        );
      }

      this.logger.log(`Fetching HTML for Reader Mode from: ${urlObj.hostname}`);

      // 从远程服务器获取 HTML
      const response = await axios.get(url, {
        responseType: "text",
        timeout: 30000,
        maxRedirects: 5,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
          "Accept-Encoding": "gzip, deflate, br",
        },
      });

      // 使用高级提取服务，实现4层容错机制
      const result = await this.advancedExtractor.extract(
        response.data,
        url,
        30000,
      );

      if (!result.success || result.length === 0) {
        this.logger.warn(
          `Failed to extract content from ${url} (Plan: ${result.plan})`,
        );
        throw new HttpException(
          "Failed to extract content from this page",
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      this.logger.log(
        `Successfully extracted article via Plan ${result.plan.toUpperCase()}: "${result.title}" (${result.length} characters, confidence: ${result.confidence}%)`,
      );

      // 返回提取的内容
      return {
        success: true,
        title: result.title,
        content: result.content,
        textContent: result.textContent,
        excerpt: result.excerpt,
        byline: result.byline,
        siteName: result.siteName,
        length: result.length,
        plan: result.plan,
        confidence: result.confidence,
        sourceUrl: url,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      if (axios.isAxiosError(error)) {
        this.logger.error(
          `Failed to fetch HTML from ${url}: ${error.message}`,
          error.stack,
        );
        throw new HttpException(
          `Failed to fetch HTML: ${error.message}`,
          error.response?.status || HttpStatus.BAD_GATEWAY,
        );
      }

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Internal error in Reader Mode: ${errorMessage}`,
        errorStack,
      );
      throw new HttpException(
        "Internal server error while extracting content",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 新闻内容专用提取器 - 优化提取新闻文章的元数据
   *
   * 实现4层元数据提取层级：
   * 1. Schema.org JSON-LD (95% 置信度) - 最标准的新闻元数据格式
   * 2. Open Graph meta标签 (75% 置信度) - 常见的社交媒体分享标准
   * 3. Twitter Card meta标签 (60% 置信度) - 推特分享标准
   * 4. 通用提取 (50% 置信度) - 启发式备选方案
   *
   * 增强功能：
   * - 自动检测付费墙（subscription, membership, login required等）
   * - 提取发布日期、修改日期、作者等关键元数据
   * - 图片URL提取（og:image, twitter:image等）
   * - 网站名称和域名识别
   *
   * 使用方式：
   * http://localhost:4000/api/v1/proxy/html-reader-news?url=https://example.com/article
   */
  @Get("html-reader-news")
  async proxyHtmlReaderNews(@Query("url") url: string): Promise<any> {
    this.logger.log(`News Reader Mode request received for URL: ${url}`);

    if (!url) {
      this.logger.warn("News Reader Mode request missing URL parameter");
      throw new HttpException(
        "URL parameter is required",
        HttpStatus.BAD_REQUEST,
      );
    }

    // 检查是否为 PDF 文件 - Reader Mode 不应处理 PDF，应直接在 PDF Viewer 中打开
    if (url.toLowerCase().endsWith(".pdf")) {
      this.logger.log(
        `PDF URL detected in News Reader Mode, returning redirect to PDF viewer: ${url}`,
      );
      return {
        isPdf: true,
        pdfUrl: url,
        title: decodeURIComponent(url.split("/").pop() || "PDF Document"),
        content: "",
        error: "This is a PDF file. Please use the PDF viewer instead.",
      };
    }

    // News类别不限制域名，允许访问所有新闻网站
    try {
      let currentUrl = url;
      let html: string;
      const maxMetaRedirects = 3; // 最多跟随3次 meta refresh 重定向

      // 获取 HTML 并处理 meta refresh 重定向
      for (
        let redirectCount = 0;
        redirectCount <= maxMetaRedirects;
        redirectCount++
      ) {
        const urlObj = new URL(currentUrl);

        this.logger.log(
          `Fetching HTML for News Reader Mode from: ${urlObj.hostname} (redirect #${redirectCount})`,
        );

        // 从远程服务器获取 HTML
        const response = await axios.get(currentUrl, {
          responseType: "text",
          timeout: 30000,
          maxRedirects: 5,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
            "Accept-Encoding": "gzip, deflate, br",
          },
        });

        html = response.data;

        // 检测 meta refresh 重定向（如 deepmind.google -> blog.google）
        const redirectCheck = this.newsExtractor.detectMetaRefreshRedirect(
          html,
          currentUrl,
        );

        if (redirectCheck.isRedirect && redirectCheck.redirectUrl) {
          if (redirectCount < maxMetaRedirects) {
            this.logger.log(
              `Following meta refresh redirect: ${currentUrl} -> ${redirectCheck.redirectUrl}`,
            );
            currentUrl = redirectCheck.redirectUrl;
            continue; // 跟随重定向
          } else {
            this.logger.warn(
              `Max meta refresh redirects reached (${maxMetaRedirects}), using current page`,
            );
          }
        }

        // 没有重定向或已达到最大次数，跳出循环
        break;
      }

      // 统一使用 AdvancedExtractorService (Readability) 提取 HTML 内容
      // 这样可以保留图片、表格等富媒体内容
      const contentResult = await this.advancedExtractor.extract(
        html!,
        currentUrl,
        30000,
      );

      // 同时使用 NewsExtractorService 提取元数据（作者、日期等）
      const newsMetadata = await this.newsExtractor.extractNews(
        html!,
        currentUrl,
      );

      // 验证提取结果
      const title = contentResult.title || newsMetadata.title;
      if (!title || title.length < 5) {
        this.logger.warn(`Failed to extract valid title from ${currentUrl}`);
        throw new HttpException(
          "Failed to extract valid article from this page",
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      this.logger.log(
        `Successfully extracted content via ${contentResult.plan}: "${title}" (${contentResult.length} chars, confidence: ${contentResult.confidence}%)`,
      );

      // 返回统一格式的结果：HTML 内容 + 新闻元数据
      return {
        success: true,
        title: title,
        content: contentResult.content, // 保留 HTML 结构（图片、表格等）
        textContent: contentResult.textContent,
        excerpt: contentResult.excerpt || newsMetadata.excerpt,
        byline: contentResult.byline || newsMetadata.author,
        author: newsMetadata.author,
        publishDate: newsMetadata.publishDate,
        modifiedDate: newsMetadata.modifiedDate,
        imageUrl: newsMetadata.imageUrl,
        siteName: contentResult.siteName || newsMetadata.siteName,
        length: contentResult.length,
        plan: contentResult.plan,
        paywalledIndicators: newsMetadata.paywalledIndicators,
        confidence: contentResult.confidence,
        source: newsMetadata.source,
        sourceUrl: url, // 保留原始 URL
        finalUrl: currentUrl, // 添加最终 URL（如果有重定向）
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      if (axios.isAxiosError(error)) {
        this.logger.error(
          `Failed to fetch HTML from ${url}: ${error.message}`,
          error.stack,
        );
        throw new HttpException(
          `Failed to fetch HTML: ${error.message}`,
          error.response?.status || HttpStatus.BAD_GATEWAY,
        );
      }

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Internal error in News Reader Mode: ${errorMessage}`,
        errorStack,
      );
      throw new HttpException(
        "Internal server error while extracting news content",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
