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

  /** Default fallback logo — Genesis.ai tech squirrel */
  private readonly DEFAULT_LOGO = `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366F1"/>
      <stop offset="50%" stop-color="#8B5CF6"/>
      <stop offset="100%" stop-color="#A78BFA"/>
    </linearGradient>
    <linearGradient id="tailGrad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#06B6D4"/>
      <stop offset="40%" stop-color="#8B5CF6"/>
      <stop offset="100%" stop-color="#EC4899"/>
    </linearGradient>
  </defs>
  <path d="M12.5 27.5 Q7.5 25 6.25 20 Q5 13.75 8.75 10 Q11.25 6.875 15 7.5" stroke="url(#tailGrad)" stroke-width="2" stroke-linecap="round" fill="none"/>
  <path d="M12.5 27.5 Q8.75 22.5 9.375 17.5 Q10 12.5 13.75 10.625" stroke="url(#tailGrad)" stroke-width="2" stroke-linecap="round" fill="none"/>
  <path d="M12.5 27.5 Q11.25 21.25 12.5 17.5 Q13.75 13.75 16.875 12.5" stroke="url(#tailGrad)" stroke-width="2" stroke-linecap="round" fill="none"/>
  <circle cx="15" cy="7.5" r="1.6" fill="#06B6D4"/>
  <circle cx="8.75" cy="10" r="1.6" fill="#8B5CF6"/>
  <circle cx="6.25" cy="20" r="1.6" fill="#EC4899"/>
  <circle cx="9.375" cy="17.5" r="1.4" fill="#A78BFA"/>
  <circle cx="13.75" cy="10.625" r="1.4" fill="#6366F1"/>
  <circle cx="12.5" cy="17.5" r="1.4" fill="#06B6D4"/>
  <circle cx="16.875" cy="12.5" r="1.4" fill="#EC4899"/>
  <circle cx="15" cy="7.5" r="3.2" fill="#06B6D4" opacity="0.15"/>
  <circle cx="8.75" cy="10" r="3.2" fill="#8B5CF6" opacity="0.15"/>
  <circle cx="6.25" cy="20" r="3.2" fill="#EC4899" opacity="0.15"/>
  <ellipse cx="18.75" cy="27.5" rx="5.625" ry="6.25" fill="url(#bodyGrad)"/>
  <ellipse cx="23.75" cy="18.125" rx="5" ry="5.625" fill="url(#bodyGrad)"/>
  <path d="M26.25 13.125 L28.125 9.375 L25 11.875" fill="#8B5CF6"/>
  <circle cx="25.625" cy="16.875" r="1.25" fill="white"/>
  <circle cx="26" cy="16.875" r="0.625" fill="#1E1B4B"/>
  <circle cx="28.125" cy="19.375" r="0.75" fill="#C4B5FD"/>
  <path d="M25 22.5 Q27.5 23.75 28.125 25.625" stroke="url(#bodyGrad)" stroke-width="1.75" stroke-linecap="round" fill="none"/>
  <circle cx="28.75" cy="26.25" r="1.5" fill="#F59E0B"/>
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
