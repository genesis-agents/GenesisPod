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

  /** Default fallback logo — Genesis.ai tech squirrel (simple SVG) */
  private readonly DEFAULT_LOGO = `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M16.25 30 Q8.75 27.5 6.875 21.25 Q5 15 8.125 10.625 Q10.625 6.875 14.375 6.25" stroke="#1E293B" stroke-width="1.5" stroke-linecap="round" fill="none"/>
  <path d="M16.25 30 Q10.625 25 10 19.375 Q9.375 13.75 12.5 10" stroke="#1E293B" stroke-width="1.5" stroke-linecap="round" fill="none"/>
  <path d="M16.25 30 Q13.125 24.375 13.75 19.375 Q14.375 15 17.5 12.5" stroke="#1E293B" stroke-width="1.5" stroke-linecap="round" fill="none"/>
  <circle cx="14.375" cy="6.25" r="1.5" fill="#06B6D4"/>
  <circle cx="8.125" cy="10.625" r="1.5" fill="#8B5CF6"/>
  <circle cx="6.875" cy="21.25" r="1.5" fill="#EC4899"/>
  <ellipse cx="20" cy="28.75" rx="5" ry="6" stroke="#1E293B" stroke-width="1.5" fill="none"/>
  <ellipse cx="25.625" cy="20" rx="4.75" ry="5" stroke="#1E293B" stroke-width="1.5" fill="none"/>
  <path d="M27.5 15.625 L29.375 11.875 L26.25 14.375" stroke="#1E293B" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <circle cx="27.5" cy="18.75" r="1" fill="#1E293B"/>
  <circle cx="30" cy="21.25" r="0.625" fill="#1E293B"/>
  <path d="M26.875 24.375 Q28.75 25.625 29.375 27.5" stroke="#1E293B" stroke-width="1.375" stroke-linecap="round" fill="none"/>
  <circle cx="30" cy="28.125" r="1.25" stroke="#1E293B" stroke-width="1" fill="none"/>
</svg>`;

  /** Get brand name for watermarks and footers */
  getBrandName(): string {
    return APP_CONFIG.brand.name;
  }

  /** Get brand full name for watermarks and footers */
  getBrandFullName(): string {
    return APP_CONFIG.brand.fullName;
  }
}
