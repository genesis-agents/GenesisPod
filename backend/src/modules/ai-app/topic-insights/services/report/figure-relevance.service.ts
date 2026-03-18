/**
 * Figure Relevance Service
 *
 * 使用多模态 LLM（Vision）对候选图片进行内容审查：
 * 1. 图片是否可辨识（非损坏、非纯色占位符、非模糊不清）
 * 2. 图片是否与研究主题有直接信息关联（不仅是主题词匹配，需内容实质相关）
 * 3. 排除：纯装饰、横幅广告、stock photo、模糊/低质量、与主题无实质关联的配图
 *
 * ★ v6.0 根因修复：旧 prompt 要求"必须是信息图(chart/diagram/table)"，
 *   导致有价值的新闻照片、产品截图、技术演示图全被杀。
 *   新原则："有信息价值就保留" — photo 类型不再自动拒绝。
 *
 * ★ v8.0 强化：detail "low" → "auto"，增加模糊/质量检测指令，
 *   API 失败时仅保留 chart/diagram/table 类型（不再全部放行）。
 *
 * ★ v9.0 根因修复：v8 的"宁缺毋滥"prompt 导致 Vision LLM 过度保守，
 *   8 个维度 393 条证据仅存活 3 张图片。根因：4 项审查"任一不通过即拒绝" +
 *   "如果不确定请拒绝" 双重保守指令 → 大量有价值图片被杀。
 *   新原则："只拒绝明确不合格的图片" — 倾向保留，让后续 Leader 分配环节做相关性筛选。
 *
 * ★ v10.0 根因修复：v9 的"全类型倾向保留"导致大量装饰性新闻配图（文章头图、
 *   新闻缩略图、stock photo）通过审查，最终报告图片与内容无关。
 *   新原则：按图片类型分层审核 — chart/table/diagram 保持倾向保留，
 *   photo 类型要求图片本身包含可辨识的信息元素（数据、文字、产品细节、技术内容）。
 *   纯场景照、文章头图、新闻配图等装饰性照片予以拒绝。
 *
 * ★ v11.0 根因修复：v10 大面积 "Invalid response structure" 错误。
 *   根因：8 维度并发 Vision API 调用触发内部 rate limiter → chatStructured
 *   收到 isError=true 后立即重试（不等待）→ 再次被限流 → 返回空对象 {} as T。
 *   修复：(1) chatStructured 检测 rate limit 错误并 await retryAfter 后重试；
 *   (2) evaluateBatch 改 throwOnParseError=true + maxRetries=2，
 *   所有失败直接走 filterRelevantFigures 的 type-based fallback。
 *
 * ★ 通过 ChatFacade（AI Engine Facade）调用 Vision LLM，不直接调用 API。
 */

import { Injectable, Logger } from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { ChatFacade } from "@/modules/ai-engine/facade";
import type {
  ContentPart,
  TextContentPart,
  ImageUrlContentPart,
} from "@/modules/ai-engine/facade";
import type { ExtractedFigure } from "../../types/research.types";

/**
 * ★ v13: Vision 单批外部超时（30s）
 * 根因：Vision 需要下载每张图片 URL，慢速/受限 CDN 导致整 batch 挂起 150s（chatStructured 内部超时）。
 * 8 维度并发 × 多 batch × 3 次重试 = 潜在 450s/batch，引发 rate limit 连锁超时。
 * 外部 Promise.race 30s 截断：失败快速走 v13 fallback，不阻塞整个 dimension pipeline。
 *
 * ★ v14: 代理下载 base64 — 根治 CDN 封锁问题
 * 根因：OpenAI Vision 服务器直接下载图片 URL，被中国 CDN / 签名 CDN 封锁或超时。
 * 新方案：Railway 先下载图片（8s timeout），转 base64 data URI 再发给 Vision。
 * OpenAI 收到内联数据，不需要自己访问外部 CDN，彻底绕过所有 CDN 封锁。
 * fetch 失败（Railway 也访问不到）→ 直接 type-based fallback，不浪费 Vision 调用。
 */
const VISION_BATCH_TIMEOUT_MS = 30_000;
const FETCH_IMAGE_TIMEOUT_MS = 8_000;

/** ★ v10: 信息性图片类型（fallback 时仅保留这些类型，photo 需要 Vision LLM 验证） */
const INFORMATIONAL_FIGURE_TYPES = new Set(["chart", "table", "diagram"]);

/** Vision API 不支持的格式（SVG/BMP/TIFF 等无法被 Vision 解析） */
const VISION_UNSUPPORTED_EXTENSIONS = /\.(?:svg|bmp|tiff?|ico|eps|ai)(?:\?|$)/i;

/**
 * ★ v14: 代理下载图片并转为 base64 data URI
 * 由 Railway 服务器下载图片，规避 OpenAI Vision 服务器被 CDN 封锁的问题。
 * 返回 null 表示无法访问（直接走 type-based fallback）。
 */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB 上限，防止超大图片占用内存

async function fetchImageAsBase64(url: string): Promise<string | null> {
  if (VISION_UNSUPPORTED_EXTENSIONS.test(url)) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_IMAGE_TIMEOUT_MS);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; research-bot/1.0)" },
    });
    clearTimeout(timer);
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "image/jpeg";
    const mimeType = contentType.split(";")[0].trim();
    if (!mimeType.startsWith("image/")) return null;
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_BYTES)
      return null;
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_IMAGE_BYTES) return null;
    const base64 = Buffer.from(buffer).toString("base64");
    return `data:${mimeType};base64,${base64}`;
  } catch {
    return null;
  }
}

/**
 * ★ v13: 全局并发信号量 — 限制同时进行的 Vision API 调用数
 * 根因：8 维度并发各自发起 Vision batch → 大量并发请求 → rate limit / 超时连锁
 * 限制全局最大并发数，防止 Vision provider 被同时轰炸
 */
const MAX_CONCURRENT_VISION_CALLS = 3;

@Injectable()
export class FigureRelevanceService {
  private readonly logger = new Logger(FigureRelevanceService.name);
  /** 当前正在进行的 Vision API 调用数（实例级信号量） */
  private visionConcurrency = 0;

  constructor(private readonly chatFacade: ChatFacade) {}

  /**
   * 信号量：等待当前并发数低于上限后执行 fn
   */
  private async withVisionSemaphore<T>(fn: () => Promise<T>): Promise<T> {
    while (this.visionConcurrency >= MAX_CONCURRENT_VISION_CALLS) {
      await new Promise<void>((r) => setTimeout(r, 200));
    }
    this.visionConcurrency++;
    try {
      return await fn();
    } finally {
      this.visionConcurrency--;
    }
  }

  /**
   * 对候选图片列表进行多模态 LLM 相关性审查
   *
   * @param figures - 经过 validateAndUpgradeFigures 后的候选图片
   * @param topicTitle - 研究主题标题（用于判断相关性）
   * @returns 通过审查的图片子集
   */
  async filterRelevantFigures(
    figures: ExtractedFigure[],
    topicTitle: string,
  ): Promise<ExtractedFigure[]> {
    if (figures.length === 0) return [];

    // ★ 前置检查：是否有可用的 MULTIMODAL 模型，没有则直接走 type-based fallback
    const multimodalModel = await this.chatFacade.getDefaultModelByType(
      AIModelType.MULTIMODAL,
    );
    if (!multimodalModel?.modelId) {
      // ★ v13: 无 Vision 模型时，保留 chart/table/diagram + 有描述性 caption/alt 的 photo
      const filtered = figures.filter((f) => {
        if (INFORMATIONAL_FIGURE_TYPES.has(f.type)) return true;
        if (f.type === "photo") {
          return (
            (f.caption?.trim().length ?? 0) > 0 ||
            (f.alt?.trim().length ?? 0) > 0
          );
        }
        return false;
      });
      this.logger.warn(
        `[filterRelevantFigures] No MULTIMODAL model configured, ` +
          `keeping ${filtered.length}/${figures.length} figures (v13: informational + captioned photos)`,
      );
      return filtered;
    }

    // ★ v13: 逐张评估 + 全局并发控制
    // 根因：batch 模式下单张坏图（慢速 CDN / 403）导致整批 8 张图全部失败。
    // 改为逐张处理：每张图独立调用 Vision，失败只影响自身，其他图正常处理。
    // 并发控制（MAX_CONCURRENT_VISION_CALLS=3）防止 8 维度同时轰炸 Vision provider。

    const evalPromises = figures.map((fig, idx) =>
      this.withVisionSemaphore(
        async (): Promise<{
          fig: ExtractedFigure;
          accepted: boolean;
          reason?: string;
        }> => {
          try {
            const result = await this.evaluateSingle(fig, topicTitle);
            return { fig, accepted: result.accepted, reason: result.reason };
          } catch (error) {
            // 单张失败 → type-based fallback（不影响其他图）
            const fallback = this.typeBasedFallback(fig);
            this.logger.warn(
              `[filterRelevantFigures] [${idx}] ${fig.imageUrl.substring(0, 60)}... Vision failed, fallback=${fallback} (v13): ` +
                `${error instanceof Error ? error.message : error}`,
            );
            return { fig, accepted: fallback };
          }
        },
      ),
    );

    const results = await Promise.all(evalPromises);

    const allAccepted = results.filter((r) => r.accepted).map((r) => r.fig);
    const rejected = results.filter((r) => !r.accepted);
    if (rejected.length > 0) {
      this.logger.log(
        `[filterRelevantFigures] Rejected ${rejected.length}/${figures.length} figures for "${topicTitle}":\n` +
          rejected
            .map(
              (r) =>
                `  ${r.fig.imageUrl.substring(0, 60)}... → ${r.reason ?? "fallback rejected"}`,
            )
            .join("\n"),
      );
    }

    return allAccepted;
  }

  /**
   * type-based fallback：Vision 失败时按类型和元数据决定是否保留
   */
  private typeBasedFallback(fig: ExtractedFigure): boolean {
    if (INFORMATIONAL_FIGURE_TYPES.has(fig.type)) return true;
    if (fig.type === "photo") {
      return (
        (fig.caption?.trim().length ?? 0) > 0 ||
        (fig.alt?.trim().length ?? 0) > 0
      );
    }
    return false;
  }

  /**
   * ★ v13: 逐张评估单张图片（替代原来的 evaluateBatch）
   * 每张图片独立调用 Vision，失败只影响本图，不连累同批其他图。
   */
  private async evaluateSingle(
    fig: ExtractedFigure,
    topicTitle: string,
  ): Promise<{ accepted: boolean; reason?: string }> {
    // 不支持的格式（SVG/BMP/ICO 等）Vision 无法解析 → 严格按类型决定，不走 fetch
    if (VISION_UNSUPPORTED_EXTENSIONS.test(fig.imageUrl)) {
      const accepted = INFORMATIONAL_FIGURE_TYPES.has(fig.type);
      return {
        accepted,
        reason: accepted ? undefined : "unsupported image format",
      };
    }

    // ★ v14: 代理下载 — Railway 先 fetch 图片转 base64，规避 OpenAI 服务器 CDN 封锁
    const imageData = await fetchImageAsBase64(fig.imageUrl);
    if (!imageData) {
      // Railway 也访问不到（超时/403）→ type-based fallback
      const accepted = this.typeBasedFallback(fig);
      this.logger.warn(
        `[evaluateSingle] ${fig.imageUrl.substring(0, 80)}... fetch failed, typeBasedFallback=${accepted}`,
      );
      return { accepted, reason: accepted ? undefined : "image fetch failed" };
    }

    const contentParts: ContentPart[] = [
      {
        type: "text",
        text: [
          `请审查以下图片是否适合用于研究报告「${topicTitle}」。`,
          "",
          "★ 核心原则：按类型分层审核。图表类（chart/table/diagram）倾向保留；照片类（photo）需要包含具体信息元素才保留。",
          "",
          "对所有类型都拒绝的情况：损坏/不可用、纯广告横幅、网站UI元素、meme、人物头像照、AI生成装饰图。",
          "",
          "chart/table/diagram → 直接保留（数据图表、趋势图、架构图、系统结构图、网络拓扑图等）。",
          "",
          "photo → 满足以下任一条即保留：图中有可读文字（幻灯片/白板）、产品实物细节、技术演示画面、带信息标注的照片、视觉上呈现架构图/流程图/关系图/框架图的图像（即使被分类为photo类型）。",
          "photo 拒绝：文章头图/封面图、新闻缩略图、Stock photo、纯场景照、泛活动照、人物合照。",
          "",
          `图片信息：Caption="${fig.caption || "(无)"}", Type="${fig.type}", Alt="${fig.alt || "(无)"}"`,
        ].join("\n"),
      } satisfies TextContentPart,
      {
        type: "image_url",
        image_url: { url: imageData, detail: "low" },
      } satisfies ImageUrlContentPart,
      {
        type: "text",
        text: `请以 JSON 格式返回审查结果：{"accepted": true} 或 {"accepted": false, "reason": "具体原因"}`,
      } satisfies TextContentPart,
    ];

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `Vision single timeout after ${VISION_BATCH_TIMEOUT_MS / 1000}s`,
            ),
          ),
        VISION_BATCH_TIMEOUT_MS,
      ),
    );

    const response = await Promise.race([
      this.chatFacade.chatStructured<{ accepted: boolean; reason?: string }>({
        messages: [
          {
            role: "user",
            content: `审查图片是否适合研究报告「${topicTitle}」`,
            contentParts,
          },
        ],
        modelType: AIModelType.MULTIMODAL,
        skipGuardrails: true,
        taskProfile: { creativity: "deterministic", outputLength: "minimal" },
        schema: {
          type: "object",
          required: ["accepted"],
          additionalProperties: false,
          properties: {
            accepted: { type: "boolean" },
            reason: { type: "string" },
          },
        },
        strictMode: false,
        throwOnParseError: true,
        maxRetries: 1,
      }),
      timeoutPromise,
    ]);

    if (response.data == null) {
      throw new Error("Empty response from Vision LLM");
    }
    return { accepted: response.data.accepted, reason: response.data.reason };
  }
}
