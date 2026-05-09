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
   * Default fallback logo — Genesis G monogram (deep navy + warm gold).
   * 与 frontend/public/favicon.svg 保持视觉一致。
   * id 加 `Pdf` 后缀避免与前端 inline SVG 命名冲突（同一 HTML 多次嵌入时）。
   */
  private readonly DEFAULT_LOGO = `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="genesisLogoBgPdf" cx="32%" cy="22%" r="95%"><stop offset="0%" stop-color="#1B3461"/><stop offset="55%" stop-color="#0B1E3F"/><stop offset="100%" stop-color="#050E22"/></radialGradient><linearGradient id="genesisLogoGoldPdf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#E8CE93"/><stop offset="48%" stop-color="#C9A961"/><stop offset="100%" stop-color="#9C7E3D"/></linearGradient></defs><rect x="2" y="2" width="60" height="60" rx="13" ry="13" fill="url(#genesisLogoBgPdf)"/><rect x="2" y="2" width="60" height="60" rx="13" ry="13" fill="none" stroke="url(#genesisLogoGoldPdf)" stroke-width="1.25"/><rect x="5.5" y="5.5" width="53" height="53" rx="9.75" ry="9.75" fill="none" stroke="#C9A961" stroke-width="0.5" opacity="0.4"/><path d="M 45.86 24 A 16 16 0 1 0 45.86 40 L 45.86 32 L 33 32" stroke="url(#genesisLogoGoldPdf)" stroke-width="4.5" stroke-linecap="butt" stroke-linejoin="round" fill="none"/></svg>`;

  /** Get brand name for watermarks and footers */
  getBrandName(): string {
    return APP_CONFIG.brand.name;
  }

  /** Get brand full name for watermarks and footers */
  getBrandFullName(): string {
    return APP_CONFIG.brand.fullName;
  }
}
