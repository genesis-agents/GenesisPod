/**
 * ProviderProbeService —— admin SecretKey + 用户 BYOK 共享的"上游 API Key 健康探测"。
 *
 * ★ 2026-05-06: 之前 SecretKeysService.testKey 只做 AES 解密检查，
 *   user-api-keys.service 才有真上游探测但内部私有。这里把探测能力提到共享层，
 *   两侧"测试连接"按钮都走它，"OK / Failed" 状态从此真正反映上游可用性。
 *
 * errorCode 用 KeyErrorReason 同款命名（AUTH_FAILED / RATE_LIMIT_KEY /
 * PROVIDER_DOWN / TIMEOUT / NETWORK_ERROR），跟 KeyErrorClassifier 体系一致，
 * 业务侧 markFailure / fallback chain 与手动 probe 共享同一份字符串语义。
 *
 * UI 拿 errorCode 出语义化 badge（"未授权" / "限流" / 等）。
 */
import { Injectable, Logger } from "@nestjs/common";
import { PROVIDER_DEFAULTS } from "./provider-defaults";

const ANTHROPIC_VALIDATION_MODEL = "claude-3-haiku-20240307";
const PROBE_TIMEOUT_MS = 15_000;

/** 与 KeyErrorReason 对齐 + 几个 probe 专属（DECRYPTION_FAILED / NETWORK_ERROR） */
export type ProbeErrorCode =
  | "AUTH_FAILED" // 401 / 403
  | "RATE_LIMIT_KEY" // 429
  | "QUOTA_EXCEEDED" // 402
  | "PROVIDER_DOWN" // 5xx
  | "TIMEOUT" // AbortError / fetch timeout
  | "NETWORK_ERROR" // ECONNREFUSED / ENOTFOUND / fetch failed
  | "DECRYPTION_FAILED" // AES 解密失败（KEY 已损坏）
  | "UNKNOWN";

export interface ProviderProbeResult {
  ok: boolean;
  errorCode?: ProbeErrorCode;
  /** 简短错误描述（不含敏感数据），<=200 chars，用于 UI tooltip */
  errorMessage?: string;
  /** 原始 HTTP status（仅 HTTP 失败时有值，便于上层细分） */
  statusCode?: number;
}

@Injectable()
export class ProviderProbeService {
  private readonly log = new Logger(ProviderProbeService.name);

  /**
   * 通过 provider slug 探测（推荐入口，自动查 endpoint / apiFormat）。
   *
   * 不认识的 provider 且没传 endpointOverride / apiFormatOverride 时返回
   * UNKNOWN（admin 自定义 provider 必须传 override）。
   */
  async probeByProvider(args: {
    provider: string;
    apiKey: string;
    endpointOverride?: string;
    apiFormatOverride?: string;
  }): Promise<ProviderProbeResult> {
    const slug = args.provider.toLowerCase();
    const defaults = PROVIDER_DEFAULTS[slug];
    const endpoint = args.endpointOverride ?? defaults?.endpoint;
    const apiFormat = args.apiFormatOverride ?? defaults?.apiFormat;
    if (!endpoint || !apiFormat) {
      return {
        ok: false,
        errorCode: "UNKNOWN",
        errorMessage: `Unknown provider '${slug}' (no default endpoint, override not provided)`,
      };
    }
    return this.probe({
      apiFormat,
      apiKey: args.apiKey,
      endpoint,
      providerLabel: slug,
    });
  }

  /**
   * 直接探测 (apiFormat, apiKey, endpoint) 组合（底层入口）。
   *
   * 不做高代价请求：openai/cohere/groq/qwen 等 → GET /models（基本免费）；
   * anthropic → max_tokens=1 的 messages（最便宜）；google → list models。
   */
  async probe(args: {
    apiFormat: string;
    apiKey: string;
    endpoint: string;
    /** 仅用于日志，便于排查 */
    providerLabel?: string;
  }): Promise<ProviderProbeResult> {
    const { apiFormat, apiKey, endpoint, providerLabel } = args;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      let response: Response;
      if (apiFormat === "anthropic") {
        response = await fetch(`${endpoint}/messages`, {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: ANTHROPIC_VALIDATION_MODEL,
            max_tokens: 1,
            messages: [{ role: "user", content: "." }],
          }),
          signal: controller.signal,
        });
      } else if (apiFormat === "google") {
        response = await fetch(`${endpoint}/models?key=${apiKey}&pageSize=1`, {
          signal: controller.signal,
        });
      } else {
        // openai-compatible default：GET /models
        response = await fetch(`${endpoint}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
        });
      }

      const status = response.status;
      if (status >= 200 && status < 300) {
        return { ok: true };
      }
      // 拿一段 body 做 errorMessage（先 text 再截 200 char，避免吞 OOM）
      let snippet = "";
      try {
        const text = await response.text();
        snippet = text.slice(0, 200);
      } catch {
        // ignore body read failure
      }
      const errorCode = this.classifyHttp(status);
      return {
        ok: false,
        errorCode,
        errorMessage: snippet || `HTTP ${status}`,
        statusCode: status,
      };
    } catch (err) {
      const errorCode = this.classifyError(err);
      const msg = err instanceof Error ? err.message : String(err);
      this.log.warn(
        `[probe ${providerLabel ?? apiFormat}] ${errorCode}: ${msg}`,
      );
      return {
        ok: false,
        errorCode,
        errorMessage: msg.slice(0, 200),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private classifyHttp(status: number): ProbeErrorCode {
    if (status === 401 || status === 403) return "AUTH_FAILED";
    if (status === 402) return "QUOTA_EXCEEDED";
    if (status === 429) return "RATE_LIMIT_KEY";
    if (status >= 500 && status < 600) return "PROVIDER_DOWN";
    return "UNKNOWN";
  }

  private classifyError(err: unknown): ProbeErrorCode {
    if (err instanceof Error) {
      if (err.name === "AbortError") return "TIMEOUT";
      const msg = err.message.toLowerCase();
      if (msg.includes("timeout") || msg.includes("etimedout"))
        return "TIMEOUT";
      if (
        msg.includes("fetch failed") ||
        msg.includes("econnrefused") ||
        msg.includes("enotfound") ||
        msg.includes("dns")
      ) {
        return "NETWORK_ERROR";
      }
    }
    return "NETWORK_ERROR";
  }
}
