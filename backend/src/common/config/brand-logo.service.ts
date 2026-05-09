import { Injectable, Logger } from "@nestjs/common";
import { APP_CONFIG } from "./app.config";
import * as fs from "fs";
import * as path from "path";

/**
 * Brand Logo Service
 * Provides centralized access to brand logo for backend rendering
 * (Puppeteer infographics, PDF generation, etc.)
 *
 * Supports both SVG and PNG logo files.
 * - SVG: returned as raw SVG string (inline-able in HTML)
 * - PNG/other: returned as `<img>` tag with base64 data URI
 */
@Injectable()
export class BrandLogoService {
  private readonly logger = new Logger(BrandLogoService.name);
  private cachedLogoHtml: string | null = null;

  /**
   * Get the brand logo as an HTML string suitable for embedding in Puppeteer templates.
   * For SVG files, returns raw SVG markup.
   * For PNG/other image files, returns an `<img>` tag with base64 data URI.
   */
  getLogoSvg(): string {
    if (this.cachedLogoHtml !== null) {
      return this.cachedLogoHtml;
    }

    const logoPath = APP_CONFIG.brand.logo.svgPath;
    try {
      const absolutePath = path.resolve(process.cwd(), logoPath);
      if (fs.existsSync(absolutePath)) {
        const ext = path.extname(absolutePath).toLowerCase();
        if (ext === ".svg") {
          this.cachedLogoHtml = fs.readFileSync(absolutePath, "utf-8");
        } else {
          // For PNG/JPG/other formats, create <img> with data URI
          const mimeType =
            ext === ".png"
              ? "image/png"
              : ext === ".jpg" || ext === ".jpeg"
                ? "image/jpeg"
                : "image/png";
          const base64 = fs.readFileSync(absolutePath).toString("base64");
          this.cachedLogoHtml = `<img src="data:${mimeType};base64,${base64}" style="width:100%;height:100%;object-fit:contain" />`;
        }
        this.logger.log(`Brand logo loaded from ${absolutePath}`);
        return this.cachedLogoHtml;
      }
    } catch (err) {
      this.logger.warn(
        `Failed to load brand logo from ${logoPath}: ${err instanceof Error ? err.message : err}`,
      );
    }

    // Fallback: try to find logo.png in the brand directory
    try {
      const fallbackPath = path.resolve(process.cwd(), "brand/logo.png");
      if (fs.existsSync(fallbackPath)) {
        const base64 = fs.readFileSync(fallbackPath).toString("base64");
        this.cachedLogoHtml = `<img src="data:image/png;base64,${base64}" style="width:100%;height:100%;object-fit:contain" />`;
        this.logger.log(`Brand logo loaded from fallback ${fallbackPath}`);
        return this.cachedLogoHtml;
      }
    } catch {
      // Ignore fallback errors
    }

    this.cachedLogoHtml = this.DEFAULT_LOGO;
    this.logger.log("Using default built-in brand logo");
    return this.cachedLogoHtml;
  }

  /**
   * Default fallback logo — Genesis Agent Fabric (deep navy + blue→indigo).
   * 菱形 fabric 编织 + 5 个 agent 节点；与 frontend/public/favicon.svg 保持一致。
   * 配色对齐 tailwind primary (blue) + indigo 体系。
   * id 加 `Pdf` 后缀避免与前端 inline SVG 命名冲突。
   */
  private readonly DEFAULT_LOGO = `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="genesisLogoBgPdf" cx="32%" cy="22%" r="95%"><stop offset="0%" stop-color="#1E3A8A"/><stop offset="55%" stop-color="#0F1E47"/><stop offset="100%" stop-color="#050D26"/></radialGradient><linearGradient id="genesisLogoStrokePdf" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#93C5FD"/><stop offset="50%" stop-color="#3B82F6"/><stop offset="100%" stop-color="#6366F1"/></linearGradient><radialGradient id="genesisLogoCorePdf" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#FFFFFF"/><stop offset="55%" stop-color="#93C5FD"/><stop offset="100%" stop-color="#3B82F6"/></radialGradient><radialGradient id="genesisLogoAgentPdf" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#BFDBFE"/><stop offset="55%" stop-color="#3B82F6"/><stop offset="100%" stop-color="#4338CA"/></radialGradient></defs><rect x="2" y="2" width="60" height="60" rx="13" ry="13" fill="url(#genesisLogoBgPdf)"/><rect x="2" y="2" width="60" height="60" rx="13" ry="13" fill="none" stroke="url(#genesisLogoStrokePdf)" stroke-width="1.4"/><g stroke="url(#genesisLogoStrokePdf)" stroke-linecap="round" fill="none"><path d="M 32 14 L 50 32 L 32 50 L 14 32 Z" stroke-width="1" opacity="0.6"/><line x1="32" y1="32" x2="32" y2="14" stroke-width="0.9" opacity="0.4"/><line x1="32" y1="32" x2="50" y2="32" stroke-width="0.9" opacity="0.4"/><line x1="32" y1="32" x2="32" y2="50" stroke-width="0.9" opacity="0.4"/><line x1="32" y1="32" x2="14" y2="32" stroke-width="0.9" opacity="0.4"/></g><circle cx="32" cy="14" r="2.6" fill="url(#genesisLogoAgentPdf)"/><circle cx="50" cy="32" r="2.6" fill="url(#genesisLogoAgentPdf)"/><circle cx="32" cy="50" r="2.6" fill="url(#genesisLogoAgentPdf)"/><circle cx="14" cy="32" r="2.6" fill="url(#genesisLogoAgentPdf)"/><circle cx="32" cy="32" r="4" fill="url(#genesisLogoCorePdf)"/><circle cx="32" cy="32" r="4" fill="none" stroke="#BFDBFE" stroke-width="0.4" opacity="0.6"/></svg>`;

  /** Get brand name for watermarks and footers */
  getBrandName(): string {
    return APP_CONFIG.brand.name;
  }

  /** Get brand full name for watermarks and footers */
  getBrandFullName(): string {
    return APP_CONFIG.brand.fullName;
  }
}
