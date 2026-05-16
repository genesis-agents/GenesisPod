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

const IMG_TAG_REGEX = /<img\b([^>]*?)\bsrc\s*=\s*(["'])([^"']+)\2([^>]*?)\/?>/gi;

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
    let m: RegExpExecArray | null;
    IMG_TAG_REGEX.lastIndex = 0;
    while ((m = IMG_TAG_REGEX.exec(html)) !== null) {
      matches.push({ full: m[0], src: m[3] });
    }

    let uploaded = 0;
    let failed = 0;
    let skipped = 0;
    let rewritten = html;

    for (const { full, src } of matches) {
      if (this.shouldSkip(src)) {
        skipped += 1;
        continue;
      }

      const newSrc = await this.uploadOne(page, src, token);
      if (!newSrc) {
        failed += 1;
        this.logger.warn(
          `Image upload failed, keeping external URL (may be hotlink-blocked by WeChat): ${src.slice(0, 120)}`,
        );
        continue;
      }

      const replaced = full.replace(src, newSrc);
      rewritten = rewritten.replace(full, replaced);
      uploaded += 1;
    }

    this.logger.log(
      `[rewriteImages] total=${matches.length} uploaded=${uploaded} failed=${failed} skipped=${skipped}`,
    );

    return { rewritten, uploaded, failed, skipped };
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
    let base64: string;
    let mimeType: string;
    try {
      const fetched = await this.fetchImage(externalUrl);
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
    const normalized = url.startsWith("//") ? `https:${url}` : url;
    const response = await fetch(normalized);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching image`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
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
  const ext = mimeType.split("/")[1] || "jpg";
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
