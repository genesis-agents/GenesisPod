import { Injectable, Logger } from "@nestjs/common";
import type { Page } from "puppeteer";

interface UploadAttempt {
  endpoint: string;
  ret: number;
  url: string | null;
  errMsg?: string;
}

interface UploadResult {
  url: string | null;
  attempts: UploadAttempt[];
}

interface CoverUploadAttempt {
  endpoint: string;
  ret: number;
  mediaId: string | null;
  cdnUrl: string | null;
  errMsg?: string;
}

interface CoverUploadResult {
  mediaId: string | null;
  cdnUrl: string | null;
  attempts: CoverUploadAttempt[];
}

export interface CoverUpload {
  mediaId: string;
  cdnUrl: string;
}

interface RewriteStats {
  rewritten: string;
  uploaded: number;
  failed: number;
  skipped: number;
}

const WECHAT_HOSTED_DOMAINS = [
  "mmbiz.qpic.cn",
  "mmbiz.qlogo.cn",
  "mp.weixin.qq.com",
];

const MMBIZ_URL_PATTERN = /^https:\/\/mmbiz\.qpic\.cn\//i;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;
const UPLOAD_CONCURRENCY = 3;

// Reviewer 共识 C3：用 matchAll 避免全局正则 lastIndex 状态泄漏
// 同时收紧字符类不允许换行/空白（防止 URL 跨行注入）
const IMG_TAG_REGEX =
  /<img\b([^>\n]*?)\bsrc\s*=\s*(["'])([^"'\s<>]+)\2([^>\n]*?)\/?>/gi;

/**
 * SSRF 防护：拒绝非 https 协议 + 私网/回环/链路本地 IP。
 *
 * 简化版（不做 DNS resolution）：只看 URL 字面值，把明显的内网字面地址
 * 拦掉。完整 SSRF（含 DNS rebinding）走 ai-engine ContentFetchService，
 * 但封面图发布前没必要拉 facade 整套——这里轻量门禁即可。
 */
function isUrlSsrfSafe(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host === "0.0.0.0") return false;
    // IPv4 私网 / 回环 / 链路本地 / 元数据端点
    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
      const [, a, b] = ipv4.map(Number);
      if (a === 10 || a === 127) return false;
      if (a === 172 && b >= 16 && b <= 31) return false;
      if (a === 192 && b === 168) return false;
      if (a === 169 && b === 254) return false; // AWS / GCP metadata
      if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    }
    // IPv6 回环 / 链路本地（最宽松判定，不解 host）
    if (host === "[::1]" || host.startsWith("[fe80:")) return false;
    return true;
  } catch {
    return false;
  }
}


/**
 * 上传外部图片到微信公众号 CDN，重写正文 <img src>。
 *
 * 微信对外链图片会做防盗链拦截，必须先把图传到 mmbiz.qpic.cn 域。
 * 走 mp.weixin.qq.com 编辑器自身的上传接口（同域 fetch + cookie 鉴权）。
 *
 * 失败策略：单张图上传失败 → 保留原 URL + 警告日志，不阻塞整体发布。
 */
@Injectable()
export class WechatImageUploaderService {
  private readonly logger = new Logger(WechatImageUploaderService.name);

  async rewriteImagesInHtml(
    page: Page,
    html: string,
    token: string,
  ): Promise<RewriteStats> {
    const matches: Array<{ full: string; src: string }> = [];
    for (const m of html.matchAll(IMG_TAG_REGEX)) {
      matches.push({ full: m[0], src: m[3] });
    }

    // 同源去重 (Reviewer A2)：同一外链 URL 在文章里出现多次只传一次。
    // 并发上传 (Reviewer C2)：unique URL 并行 UPLOAD_CONCURRENCY 路上传。
    const uniqueSrcs = new Set<string>();
    let skipped = 0;
    for (const { src } of matches) {
      if (this.shouldSkip(src)) {
        skipped += 1;
        continue;
      }
      uniqueSrcs.add(src);
    }

    const urlToNewSrc = await this.uploadConcurrently(
      page,
      Array.from(uniqueSrcs),
      token,
    );

    let uploaded = 0;
    let failed = 0;
    let rewritten = html;

    for (const { full, src } of matches) {
      if (this.shouldSkip(src)) continue;

      const newSrc = urlToNewSrc.get(src);
      if (!newSrc) {
        failed += 1;
        this.logger.warn(
          `Image upload failed, keeping external URL (may be hotlink-blocked by WeChat): ${src.slice(0, 120)}`,
        );
        continue;
      }

      // 防 XSS (Security M1)：微信返回值理论上可能不是预期格式，
      // 拼回 HTML 前严格校验必须是 mmbiz CDN URL。
      if (!MMBIZ_URL_PATTERN.test(newSrc)) {
        failed += 1;
        this.logger.warn(
          `Rejected non-mmbiz upload result, keeping original: ${newSrc.slice(0, 80)}`,
        );
        continue;
      }

      const replaced = full.replace(src, newSrc);
      rewritten = rewritten.replace(full, replaced);
      uploaded += 1;
    }

    this.logger.log(
      `[rewriteImages] total=${matches.length} unique=${uniqueSrcs.size} uploaded=${uploaded} failed=${failed} skipped=${skipped}`,
    );

    return { rewritten, uploaded, failed, skipped };
  }

  /**
   * 并发上传：限制同时活跃 UPLOAD_CONCURRENCY 个 page.evaluate + Node fetch。
   * 微信端单 page 同时跑太多 fetch 会触发限流，3 路是经验上限。
   */
  private async uploadConcurrently(
    page: Page,
    srcs: string[],
    token: string,
  ): Promise<Map<string, string | null>> {
    const result = new Map<string, string | null>();
    let cursor = 0;

    const worker = async (): Promise<void> => {
      while (cursor < srcs.length) {
        const idx = cursor++;
        const src = srcs[idx];
        const newSrc = await this.uploadOne(page, src, token);
        result.set(src, newSrc);
      }
    };

    const workers = Array.from(
      { length: Math.min(UPLOAD_CONCURRENCY, srcs.length) },
      () => worker(),
    );
    await Promise.all(workers);
    return result;
  }

  /**
   * 上传封面图到微信素材库，返回 mediaId + cdnUrl。
   * mediaId 用作 saveDraft 的 thumb_media_id，cdnUrl 用作 cdn_url_1_1。
   * 失败返回 null，由调用方决定回退（保存无封面草稿）。
   */
  async uploadCover(
    page: Page,
    externalUrl: string,
    token: string,
  ): Promise<CoverUpload | null> {
    // 与 body 图不同：封面必须拿到 file_id 才能填 thumb_media_id，
    // 即便 URL 已经在 mmbiz 域，也得重传一次进素材库。
    // 仅过滤明显非法（data: / 协议 / 内网）。
    if (!externalUrl || externalUrl.startsWith("data:")) return null;
    const normalized = externalUrl.startsWith("//")
      ? `https:${externalUrl}`
      : externalUrl;
    if (!isUrlSsrfSafe(normalized)) {
      this.logger.warn(
        `[uploadCover] Rejected SSRF-unsafe URL: ${normalized.slice(0, 80)}`,
      );
      return null;
    }

    let base64: string;
    let mimeType: string;
    try {
      const fetched = await this.fetchImage(normalized);
      base64 = fetched.base64;
      mimeType = fetched.mimeType;
    } catch (err) {
      this.logger.warn(
        `Failed to fetch cover image ${externalUrl}: ${(err as Error).message}`,
      );
      return null;
    }

    const result = await page.evaluate(
      runCoverUploadAttempts,
      base64,
      mimeType,
      token,
    );

    this.logger.log(
      `[uploadCover] ${externalUrl.slice(0, 80)} → attempts=${JSON.stringify(
        result.attempts,
      ).slice(0, 600)}`,
    );

    if (!result.mediaId || !result.cdnUrl) {
      return null;
    }
    return { mediaId: result.mediaId, cdnUrl: result.cdnUrl };
  }

  private shouldSkip(src: string): boolean {
    if (!src || src.startsWith("data:")) return true;
    if (src.startsWith("//")) src = `https:${src}`;
    try {
      const { hostname } = new URL(src);
      return WECHAT_HOSTED_DOMAINS.some((d) => hostname.endsWith(d));
    } catch {
      return true;
    }
  }

  private async uploadOne(
    page: Page,
    externalUrl: string,
    token: string,
  ): Promise<string | null> {
    const normalized = externalUrl.startsWith("//")
      ? `https:${externalUrl}`
      : externalUrl;
    if (!isUrlSsrfSafe(normalized)) {
      this.logger.warn(
        `[uploadImage] Rejected SSRF-unsafe URL: ${normalized.slice(0, 80)}`,
      );
      return null;
    }

    let base64: string;
    let mimeType: string;
    try {
      const fetched = await this.fetchImage(normalized);
      base64 = fetched.base64;
      mimeType = fetched.mimeType;
    } catch (err) {
      this.logger.warn(
        `Failed to fetch external image ${externalUrl}: ${(err as Error).message}`,
      );
      return null;
    }

    const result = await page.evaluate(
      runUploadAttempts,
      base64,
      mimeType,
      token,
    );

    this.logger.log(
      `[uploadImage] ${externalUrl.slice(0, 80)} → attempts=${JSON.stringify(
        result.attempts,
      ).slice(0, 600)}`,
    );

    return result.url;
  }

  private async fetchImage(
    url: string,
  ): Promise<{ base64: string; mimeType: string }> {
    // 调用方已做 SSRF + 协议规范化，这里只做 timeout + size cap。
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching image`);
    }
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > MAX_IMAGE_BYTES) {
      throw new Error(
        `Image too large (declared ${declaredLength} bytes, limit ${MAX_IMAGE_BYTES})`,
      );
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      throw new Error(
        `Image too large (got ${buffer.byteLength} bytes, limit ${MAX_IMAGE_BYTES})`,
      );
    }
    const mimeType =
      response.headers.get("content-type")?.split(";")[0].trim() ||
      "image/jpeg";
    return { base64: buffer.toString("base64"), mimeType };
  }
}

/**
 * 在 puppeteer page context 内执行的上传逻辑。
 * 同域 fetch 自动携带 mp.weixin.qq.com 的 session cookie。
 *
 * 多 endpoint 候选 —— 微信前端漂移时按顺序回退：
 * - misc/uploadimg2：编辑器正文插图常用接口
 * - cgi-bin/filetransfer：素材库上传（更稳但响应字段不同）
 */
async function runUploadAttempts(
  base64: string,
  mimeType: string,
  token: string,
): Promise<UploadResult> {
  const byteArray = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const rawExt = mimeType.split(";")[0].split("/")[1] || "jpg";
  const ext = rawExt.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || "jpg";
  const filename = `image_${Date.now()}.${ext}`;
  const blob = new Blob([byteArray], { type: mimeType });

  const endpoints: Array<{
    name: string;
    url: string;
    parse: (data: unknown) => { ret: number; url: string | null; err?: string };
  }> = [
    {
      name: "misc-uploadimg2",
      url: `/misc/uploadimg2?t=ajax-editor-upload-img&token=${token}&lang=zh_CN`,
      parse: (data) => {
        const d = data as {
          base_resp?: { ret?: number; err_msg?: string };
          content?: string;
          url?: string;
        };
        const ret = d.base_resp?.ret ?? -1;
        return {
          ret,
          url: ret === 0 ? d.content || d.url || null : null,
          err: d.base_resp?.err_msg,
        };
      },
    },
    {
      name: "filetransfer-upload-material",
      url: `/cgi-bin/filetransfer?action=upload_material&f=json&scene=8&writetype=doublewrite&groupid=1&token=${token}&lang=zh_CN`,
      parse: (data) => {
        const d = data as {
          base_resp?: { ret?: number; err_msg?: string };
          cdn_url?: string;
          url?: string;
        };
        const ret = d.base_resp?.ret ?? -1;
        return {
          ret,
          url: ret === 0 ? d.cdn_url || d.url || null : null,
          err: d.base_resp?.err_msg,
        };
      },
    },
  ];

  const attempts: UploadAttempt[] = [];
  for (const ep of endpoints) {
    try {
      const form = new FormData();
      form.append("file", blob, filename);
      const resp = await fetch(ep.url, {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const data = (await resp.json().catch(() => ({}))) as unknown;
      const parsed = ep.parse(data);
      attempts.push({
        endpoint: ep.name,
        ret: parsed.ret,
        url: parsed.url,
        errMsg: parsed.err,
      });
      if (parsed.url) {
        return { url: parsed.url, attempts };
      }
    } catch (err) {
      attempts.push({
        endpoint: ep.name,
        ret: -999,
        url: null,
        errMsg: (err as Error).message,
      });
    }
  }
  return { url: null, attempts };
}

/**
 * 封面图上传：必须走素材库 endpoint 才能拿到 file_id（作为 thumb_media_id）。
 * 比正文图多一项 file_id 解析。
 */
async function runCoverUploadAttempts(
  base64: string,
  mimeType: string,
  token: string,
): Promise<CoverUploadResult> {
  const byteArray = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const rawExt = mimeType.split(";")[0].split("/")[1] || "jpg";
  const ext = rawExt.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || "jpg";
  const filename = `cover_${Date.now()}.${ext}`;
  const blob = new Blob([byteArray], { type: mimeType });

  const endpoints: Array<{ name: string; url: string }> = [
    {
      name: "filetransfer-upload-material",
      url: `/cgi-bin/filetransfer?action=upload_material&f=json&scene=8&writetype=doublewrite&groupid=1&token=${token}&lang=zh_CN`,
    },
    {
      name: "filetransfer-upload-img",
      url: `/cgi-bin/filetransfer?action=upload_img&token=${token}&lang=zh_CN`,
    },
  ];

  const attempts: CoverUploadAttempt[] = [];
  for (const ep of endpoints) {
    try {
      const form = new FormData();
      form.append("file", blob, filename);
      const resp = await fetch(ep.url, {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const data = (await resp.json().catch(() => ({}))) as {
        base_resp?: { ret?: number; err_msg?: string };
        content_url?: string;
        cdn_url?: string;
        url?: string;
        file_id?: string | number;
        content?: string;
      };
      const ret = data.base_resp?.ret ?? -1;
      const cdnUrl =
        typeof data.content_url === "string"
          ? data.content_url
          : typeof data.cdn_url === "string"
            ? data.cdn_url
            : typeof data.url === "string"
              ? data.url
              : typeof data.content === "string"
                ? data.content
                : null;
      const fileId =
        data.file_id != null ? String(data.file_id) : null;
      attempts.push({
        endpoint: ep.name,
        ret,
        mediaId: fileId,
        cdnUrl,
        errMsg: data.base_resp?.err_msg,
      });
      if (ret === 0 && fileId && cdnUrl) {
        return { mediaId: fileId, cdnUrl, attempts };
      }
    } catch (err) {
      attempts.push({
        endpoint: ep.name,
        ret: -999,
        mediaId: null,
        cdnUrl: null,
        errMsg: (err as Error).message,
      });
    }
  }
  return { mediaId: null, cdnUrl: null, attempts };
}
