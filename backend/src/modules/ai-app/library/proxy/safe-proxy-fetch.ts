/**
 * safeProxyGet — SSRF-safe axios GET for the proxy controller.
 *
 * The proxy endpoints fetch arbitrary user-supplied URLs server-side. The old
 * inline `isBlockedAddress()` only string-matched the literal hostname, so a
 * public domain that resolves to an internal/metadata IP (DNS rebinding) sailed
 * through, and redirects were followed with zero re-validation.
 *
 * This helper routes every outbound hop through the canonical SSRF gate
 * (`assertUrlSafe`, exported from ai-engine/facade): it resolves DNS and checks
 * EVERY resolved A/AAAA record against private / loopback / link-local / CGNAT /
 * cloud-metadata / reserved ranges, then follows redirects manually
 * (`maxRedirects: 0`), re-validating each `Location` hop — closing both initial
 * and redirect-based rebinding.
 *
 * It preserves the caller's axios config (responseType / headers / timeout), so
 * call sites change only from `axios.get(url, cfg)` to `safeProxyGet(url, cfg)`.
 * 4xx/5xx still reject like axios (so existing 403 fallback chains keep working).
 */

import { HttpException, HttpStatus } from "@nestjs/common";
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import { assertUrlSafe } from "../../../ai-engine/facade";

const MAX_REDIRECT_HOPS = 5;

export async function safeProxyGet(
  url: string,
  config: AxiosRequestConfig = {},
  maxHops: number = MAX_REDIRECT_HOPS,
): Promise<AxiosResponse> {
  let currentUrl = url;

  for (let hop = 0; hop <= maxHops; hop++) {
    // Throws BadRequestException (HTTP 400) on any unsafe target. Done before
    // every hop so redirect targets are validated too.
    await assertUrlSafe(currentUrl);

    const response = await axios.get(currentUrl, {
      ...config,
      // Disable axios' built-in redirect following so we can re-validate each
      // hop ourselves; accept 3xx as a resolved response to read Location.
      maxRedirects: 0,
      validateStatus: (status) => status < 400,
    });

    // Non-redirect (2xx) → done.
    if (response.status < 300) {
      return response;
    }

    const location = response.headers?.["location"];
    if (!location) {
      // 3xx without a Location — nothing safe to follow; return as-is.
      return response;
    }

    // Resolve relative redirects against the current URL, then loop to
    // re-validate the new target before fetching it.
    currentUrl = new URL(String(location), currentUrl).toString();
  }

  throw new HttpException(
    `Too many redirects (>${MAX_REDIRECT_HOPS}); possible redirect loop or SSRF`,
    HttpStatus.BAD_GATEWAY,
  );
}
