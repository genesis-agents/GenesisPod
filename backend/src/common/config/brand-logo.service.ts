import { Injectable, Logger } from "@nestjs/common";
import { APP_CONFIG } from "./app.config";
import * as fs from "fs";
import * as path from "path";

/**
 * Brand Logo Service
 * Provides centralized access to brand logo SVG for backend rendering
 * (Puppeteer infographics, PDF generation, etc.)
 */
@Injectable()
export class BrandLogoService {
  private readonly logger = new Logger(BrandLogoService.name);
  private cachedSvg: string | null = null;

  /** Default fallback logo (same as infographic.constants.ts DEEPDIVE_LOGO) */
  private readonly DEFAULT_LOGO = `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#8B5CF6"/>
      <stop offset="50%" style="stop-color:#6366F1"/>
      <stop offset="100%" style="stop-color:#3B82F6"/>
    </linearGradient>
  </defs>
  <path d="M8 10 L20 30 L32 10" stroke="url(#logoGradient)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M14 10 L20 22 L26 10" stroke="url(#logoGradient)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.6"/>
</svg>`;

  /**
   * Get the brand logo SVG string.
   * Tries to load from configured file path, falls back to built-in default.
   */
  getLogoSvg(): string {
    if (this.cachedSvg !== null) {
      return this.cachedSvg;
    }

    const svgPath = APP_CONFIG.brand.logo.svgPath;
    try {
      const absolutePath = path.resolve(process.cwd(), svgPath);
      if (fs.existsSync(absolutePath)) {
        this.cachedSvg = fs.readFileSync(absolutePath, "utf-8");
        this.logger.log(`Brand logo loaded from ${absolutePath}`);
        return this.cachedSvg;
      }
    } catch (err) {
      this.logger.warn(
        `Failed to load brand logo from ${svgPath}: ${err instanceof Error ? err.message : err}`,
      );
    }

    this.cachedSvg = this.DEFAULT_LOGO;
    this.logger.log("Using default built-in brand logo");
    return this.cachedSvg;
  }

  /** Get brand name for watermarks and footers */
  getBrandName(): string {
    return APP_CONFIG.brand.name;
  }

  /** Get brand full name for watermarks and footers */
  getBrandFullName(): string {
    return APP_CONFIG.brand.fullName;
  }
}
