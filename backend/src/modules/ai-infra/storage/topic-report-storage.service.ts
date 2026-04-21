import { Injectable, Logger } from "@nestjs/common";
import { R2StorageService } from "./r2-storage.service";
import { PrismaService } from "../../../common/prisma/prisma.service";

/**
 * topic_reports.full_report 正文 off-load 抽象层。
 *
 * 职责：
 * - 写入时：超阈值 → 上传对象存储 → DB 存 URI + 置 fullReport 为空串；失败降级纯 DB
 * - 读取时：有 URI → 从对象存储拉；无 URI → 回落 fullReport 字段（旧数据 / 小文本 / B2 不可用）
 *
 * 对上层（topic-insights / export / social-fetcher）提供"透明"的读接口，
 * 调用方拿到的始终是完整 Markdown；off-load 细节对业务逻辑不可见。
 *
 * 设计要点：
 * 1. 对象存储 provider（B2 / R2）由 R2StorageService 内部决定，此类不感知。
 * 2. Key 规则：`topic-reports/{reportId}/v{version}.md`——按 reportId 组织、版本号区分修订。
 * 3. 阈值 2KB：小于此值上传 + 索引反而比直接读 TOAST 慢，不值。
 * 4. 失败降级而非抛错：R2 挂了也不阻塞用户生成报告。
 */
@Injectable()
export class TopicReportStorageService {
  private readonly logger = new Logger(TopicReportStorageService.name);

  /** 小于此值不 off-load（B2/R2 round-trip 不划算） */
  private static readonly OFFLOAD_THRESHOLD_BYTES = 2048;

  constructor(
    private readonly prisma: PrismaService,
    private readonly objectStorage: R2StorageService,
  ) {}

  /**
   * 写入 fullReport：满足条件时 off-load 到对象存储，否则直接写 DB。
   * 返回 Prisma update 后的 report 对象。
   */
  async writeFullReport(
    reportId: string,
    content: string,
    version = 1,
  ): Promise<void> {
    const byteLen = Buffer.byteLength(content, "utf-8");
    const shouldOffload =
      this.objectStorage.isEnabled() &&
      byteLen > TopicReportStorageService.OFFLOAD_THRESHOLD_BYTES;

    if (shouldOffload) {
      const key = `topic-reports/${reportId}/v${version}.md`;
      const res = await this.objectStorage.uploadText(content, key);
      if (res.success) {
        await this.prisma.topicReport.update({
          where: { id: reportId },
          data: {
            fullReport: "", // 置空串回收 TOAST
            fullReportUri: key,
            fullReportSize: byteLen,
          },
        });
        this.logger.debug(
          `[offload] reportId=${reportId} v${version} → ${key} (${Math.round(byteLen / 1024)}KB)`,
        );
        return;
      }
      // 上传失败降级 DB
      this.logger.warn(
        `[offload] upload failed for ${reportId}, fallback to DB: ${res.error}`,
      );
    }

    // 未启用对象存储 / 内容过短 / 上传失败 → 直接存 DB
    await this.prisma.topicReport.update({
      where: { id: reportId },
      data: {
        fullReport: content,
        fullReportUri: null,
        fullReportSize: byteLen,
      },
    });
  }

  /**
   * 读 fullReport：根据 URI 决定从哪里取。
   *
   * @param report - 至少包含 fullReport / fullReportUri 两字段的 TopicReport 片段
   * @returns 完整 Markdown 内容；对象存储不可达时返回 DB 字段（可能为空串）
   */
  async readFullReport(report: {
    fullReport?: string | null;
    fullReportUri?: string | null;
  }): Promise<string> {
    if (report.fullReportUri) {
      const text = await this.objectStorage.downloadText(report.fullReportUri);
      if (text !== null) return text;
      this.logger.warn(
        `[read] object storage miss for uri=${report.fullReportUri}, falling back to DB`,
      );
    }
    return report.fullReport ?? "";
  }

  /**
   * 批量读：用 Promise.all 并发拉取多份报告内容。
   * 调用方通常 findMany 后再用此方法一次性 hydrate。
   */
  async readFullReportsBatch<
    T extends {
      id: string;
      fullReport?: string | null;
      fullReportUri?: string | null;
    },
  >(reports: T[]): Promise<Array<T & { fullReport: string }>> {
    return Promise.all(
      reports.map(async (r) => ({
        ...r,
        fullReport: await this.readFullReport(r),
      })),
    );
  }

  /**
   * 删除报告时连带清理对象存储里的正文（best-effort，失败不阻塞）
   */
  async deleteByReportId(reportId: string, version?: number): Promise<void> {
    if (!this.objectStorage.isEnabled()) return;
    try {
      if (version !== undefined) {
        await this.objectStorage.deleteObject(
          `topic-reports/${reportId}/v${version}.md`,
        );
      } else {
        // 版本未知：按前缀枚举需要 ListObjectsV2，代码里未实现。
        // 当前全部 delete 操作依赖 version 明确——调用方传进来即可。
        this.logger.debug(
          `[delete] reportId=${reportId} skipped (version unknown)`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `[delete] failed for ${reportId} v${version}: ${(error as Error).message}`,
      );
    }
  }
}
