/**
 * AgentPlaygroundController — 后端 REST 入口
 */

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import type { RequestWithUser } from "../../../common/types/express-request.types";
import { ResearchTeamOrchestrator } from "./services/research-team.orchestrator";
import {
  RunMissionInputSchema,
  type RunMissionInput,
} from "./dto/run-mission.dto";
import { MissionOwnershipRegistry } from "./services/mission/mission-ownership.registry";
import { MissionEventBuffer } from "./services/mission/mission-event-buffer.service";
import { MissionStore } from "./services/mission/mission-store.service";
import { LeaderChatService } from "./services/chat/leader-chat.service";
import { MissionAbortRegistry } from "./services/mission/mission-abort.registry";

@Controller("agent-playground")
@UseGuards(JwtAuthGuard)
export class AgentPlaygroundController {
  private readonly log = new Logger(AgentPlaygroundController.name);

  constructor(
    private readonly orchestrator: ResearchTeamOrchestrator,
    private readonly buffer: MissionEventBuffer,
    private readonly ownership: MissionOwnershipRegistry,
    private readonly store: MissionStore,
    private readonly leaderChat: LeaderChatService,
    private readonly abortRegistry: MissionAbortRegistry,
  ) {}

  /**
   * GET /api/v1/agent-playground/missions
   * 当前用户的 mission 列表（所有历史，按 startedAt 倒序）
   */
  @Get("missions")
  async listMissions(
    @Request() req: RequestWithUser,
  ): Promise<{ items: unknown[] }> {
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException("Authentication required");
    const items = await this.store.listByUser(userId, 100);
    return { items };
  }

  /**
   * GET /api/v1/agent-playground/missions/:id
   * 单个 mission 完整 detail（含 reportFull / dimensions / verdicts）
   */
  @Get("missions/:id")
  async getMission(
    @Param("id") id: string,
    @Request() req: RequestWithUser,
  ): Promise<{ mission: unknown }> {
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException("Authentication required");
    const mission = await this.store.getById(id, userId);
    if (!mission) throw new ForbiddenException("Mission not found");
    return { mission };
  }

  /**
   * GET /api/v1/agent-playground/missions/:id/export?format=csv-facts|csv-citations|markdown
   * Phase P1-8: 数据集导出（mission-pipeline-baseline.md §7.9）
   */
  @Get("missions/:id/export")
  async exportMission(
    @Param("id") id: string,
    @Query("format") format: string,
    @Request() req: RequestWithUser,
  ): Promise<{ filename: string; mimeType: string; content: string }> {
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException("Authentication required");
    const mission = await this.store.getById(id, userId);
    if (!mission) throw new ForbiddenException("Mission not found");

    const reportFull = (mission as { reportFull?: unknown }).reportFull as
      | {
          factTable?: {
            entity: string;
            attribute: string;
            value: string;
            sources?: number[];
          }[];
          citations?: {
            index: number;
            title: string;
            url: string;
            domain: string;
            sourceType?: string;
            credibilityScore?: number;
            publishedAt?: string;
          }[];
          content?: { fullMarkdown?: string };
        }
      | null
      | undefined;
    if (!reportFull) {
      throw new BadRequestException("Mission has no report yet");
    }

    const sanitize = (s: string): string =>
      `"${s.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;

    const topic = (reportFull as { metadata?: { topic?: string } }).metadata
      ?.topic;
    const slug = topic
      ? topic
          .replace(/[^\w一-龥-]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 40)
      : id.slice(0, 8);

    if (format === "csv-facts") {
      const facts = reportFull.factTable ?? [];
      const lines = ["entity,attribute,value,source_count,source_indices"];
      for (const f of facts) {
        const sources = f.sources ?? [];
        lines.push(
          `${sanitize(f.entity)},${sanitize(f.attribute)},${sanitize(f.value)},${sources.length},${sanitize(sources.join("|"))}`,
        );
      }
      return {
        filename: `${slug}-facts.csv`,
        mimeType: "text/csv; charset=utf-8",
        content: "﻿" + lines.join("\n"),
      };
    }

    if (format === "csv-citations") {
      const cites = reportFull.citations ?? [];
      const lines = [
        "index,title,url,domain,source_type,credibility_score,published_at",
      ];
      for (const c of cites) {
        lines.push(
          `${c.index},${sanitize(c.title)},${sanitize(c.url)},${sanitize(c.domain)},${sanitize(c.sourceType ?? "")},${c.credibilityScore ?? ""},${sanitize(c.publishedAt ?? "")}`,
        );
      }
      return {
        filename: `${slug}-citations.csv`,
        mimeType: "text/csv; charset=utf-8",
        content: "﻿" + lines.join("\n"),
      };
    }

    // P103-1 / P108-1: 加 reconciliation 到 mission 持久化层读取
    const missionRow = mission as {
      reconciliationReport?: {
        reconciliationReport?: string;
        deduplicationStats?: {
          duplicatesRemoved?: number;
          termVariantsUnified?: number;
          dataInconsistenciesFlagged?: number;
        };
        termGlossary?: { canonical: string; variants: string[] }[];
      } | null;
    };

    if (format === "markdown") {
      // Phase P6-15: 加 YAML frontmatter (mission 元信息)
      const meta = (reportFull as { metadata?: Record<string, unknown> })
        .metadata;
      let md = "";
      if (meta) {
        md += "---\n";
        md += `topic: "${(meta.topic as string)?.replace(/"/g, "'") ?? id}"\n`;
        if (meta.generatedAt) md += `generatedAt: "${meta.generatedAt}"\n`;
        if (meta.wordCount) md += `wordCount: ${meta.wordCount}\n`;
        if (meta.sourceCount) md += `sourceCount: ${meta.sourceCount}\n`;
        if (meta.figureCount) md += `figureCount: ${meta.figureCount}\n`;
        if (meta.factCount) md += `factCount: ${meta.factCount}\n`;
        if (meta.styleProfile) md += `styleProfile: ${meta.styleProfile}\n`;
        if (meta.lengthProfile) md += `lengthProfile: ${meta.lengthProfile}\n`;
        if (meta.audienceProfile)
          md += `audienceProfile: ${meta.audienceProfile}\n`;
        md += "---\n\n";
      }
      // ★ Phase Lead-2: Lead Foreword 放在 fullMarkdown 之前
      const leaderForeword = (
        meta as
          | {
              leaderForeword?: {
                whatWeAnswered?: {
                  criterion: string;
                  addressed: string;
                  evidence: string;
                }[];
                whatRemainsUnclear?: string[];
                howToRead?: string;
                recommendedFollowUp?: string[];
              };
            }
          | undefined
      )?.leaderForeword;
      if (leaderForeword) {
        md += "## Foreword by Lead\n\n";
        if ((leaderForeword.whatWeAnswered ?? []).length > 0) {
          md += "### 我们回答了什么\n\n";
          for (const a of leaderForeword.whatWeAnswered ?? []) {
            const icon =
              a.addressed === "yes"
                ? "✓"
                : a.addressed === "partial"
                  ? "⚠️"
                  : "✗";
            md += `- ${icon} **${a.criterion}** — ${a.evidence}\n`;
          }
          md += "\n";
        }
        if ((leaderForeword.whatRemainsUnclear ?? []).length > 0) {
          md += "### 没回答 / 证据不足\n\n";
          for (const u of leaderForeword.whatRemainsUnclear ?? []) {
            md += `- ${u}\n`;
          }
          md += "\n";
        }
        if (leaderForeword.howToRead) {
          md += "### 如何阅读本报告\n\n";
          md += leaderForeword.howToRead + "\n\n";
        }
        if ((leaderForeword.recommendedFollowUp ?? []).length > 0) {
          md += "### 建议的后续研究方向\n\n";
          for (const r of leaderForeword.recommendedFollowUp ?? []) {
            md += `- ${r}\n`;
          }
          md += "\n";
        }
        md += "---\n\n";
      }

      md += reportFull.content?.fullMarkdown ?? "";
      // Phase P2-8: 末尾追加 references 附录（让导出 .md 自含引用）
      const cites = reportFull.citations ?? [];
      if (cites.length > 0) {
        md += "\n\n---\n\n## 参考文献\n\n";
        for (const c of cites) {
          const tag = c.sourceType ? ` [${c.sourceType}]` : "";
          const credit =
            c.credibilityScore != null
              ? ` ・可信度 ${c.credibilityScore}/100`
              : "";
          md += `[${c.index}]${tag} ${c.title} — ${c.domain}${c.publishedAt ? ` (${c.publishedAt.slice(0, 10)})` : ""}${credit}\n  ${c.url}\n\n`;
        }
      }
      // P103-1 / P108-1: 附 Reconciliation 总览 + dedup 统计 + termGlossary
      const recon = missionRow.reconciliationReport;
      if (recon) {
        md += "\n\n---\n\n## 附录：对账总览\n\n";
        if (recon.deduplicationStats) {
          md += `**去重统计**：去重 ${recon.deduplicationStats.duplicatesRemoved ?? 0} · 术语统一 ${recon.deduplicationStats.termVariantsUnified ?? 0} · 数据冲突 ${recon.deduplicationStats.dataInconsistenciesFlagged ?? 0}\n\n`;
        }
        if (recon.termGlossary && recon.termGlossary.length > 0) {
          md += "**术语对照表**：\n";
          for (const g of recon.termGlossary) {
            md += `- **${g.canonical}** ↔ ${g.variants.join(" / ")}\n`;
          }
          md += "\n";
        }
        if (recon.reconciliationReport) {
          md += recon.reconciliationReport;
        }
      }
      // ★ Critic L4 元审查附录（auditLayers >= thorough 时生成）
      // 让导出 .md 包含独立审查发现，便于复盘 / 二次撰稿。
      const quality = (
        reportFull as {
          quality?: { warnings?: { dimension: string; message: string }[] };
        }
      ).quality;
      const l4Warnings = (quality?.warnings ?? []).filter((w) =>
        w.dimension?.startsWith("l4-"),
      );
      if (l4Warnings.length > 0) {
        const blindspots = l4Warnings.filter(
          (w) => w.dimension === "l4-blindspot",
        );
        const biases = l4Warnings.filter((w) => w.dimension === "l4-bias");
        const suggestions = l4Warnings.filter(
          (w) => w.dimension === "l4-suggestion",
        );
        const critics = l4Warnings.filter((w) => w.dimension === "l4-critic");
        md += "\n\n---\n\n## 附录：独立审查（Critic L4）\n\n";
        if (critics.length > 0) {
          md += "### 整体判定\n";
          for (const w of critics) md += `- ${w.message}\n`;
          md += "\n";
        }
        if (blindspots.length > 0) {
          md += "### 盲点（Blind Spots）\n";
          for (const w of blindspots) md += `- ${w.message}\n`;
          md += "\n";
        }
        if (biases.length > 0) {
          md += "### 潜在偏见（Biases）\n";
          for (const w of biases) md += `- ${w.message}\n`;
          md += "\n";
        }
        if (suggestions.length > 0) {
          md += "### 改进建议（Suggestions）\n";
          for (const w of suggestions) md += `- ${w.message}\n`;
          md += "\n";
        }
      }
      return {
        filename: `${slug}.md`,
        mimeType: "text/markdown; charset=utf-8",
        content: md,
      };
    }

    if (format === "json") {
      // Phase P6-16 / P104-1: 完整 ReportArtifact JSON 导出（机器可读，含 reconciliation）
      return {
        filename: `${slug}.json`,
        mimeType: "application/json; charset=utf-8",
        content: JSON.stringify(
          {
            artifact: reportFull,
            reconciliation: missionRow.reconciliationReport ?? null,
          },
          null,
          2,
        ),
      };
    }

    throw new BadRequestException(
      `Unsupported export format: ${format}. Use csv-facts | csv-citations | markdown | json`,
    );
  }

  /**
   * POST /api/v1/agent-playground/research-team/run
   *
   * fire-and-forget：立刻返回 missionId，mission 在后台跑，前端通过 socket join 监听事件。
   * 同时 /replay 端点提供 polling fallback。
   */
  @Post("research-team/run")
  runResearchTeam(
    @Body() body: unknown,
    @Request() req: RequestWithUser,
  ): { missionId: string; streamNamespace: string } {
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException("Authentication required");

    const parsed = RunMissionInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        `Invalid input: ${parsed.error.issues
          .map((i) => `${i.path.join(".")}:${i.message}`)
          .join("; ")}`,
      );
    }
    const input: RunMissionInput = parsed.data;
    const missionId = randomUUID();

    this.ownership.assign(missionId, userId);

    void this.orchestrator
      .runMission(missionId, input, userId)
      .catch((err: unknown) => {
        this.log.error(
          `mission ${missionId} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    return { missionId, streamNamespace: "agent-playground" };
  }

  /**
   * POST /api/v1/agent-playground/missions/:id/rerun
   * 用相同配置（topic / depth / language / maxCredits）启动一个新 mission，
   * 返回新 missionId 给前端跳转。
   */
  @Post("missions/:id/rerun")
  async rerunMission(
    @Param("id") missionId: string,
    @Request() req: RequestWithUser,
  ): Promise<{ missionId: string; streamNamespace: string }> {
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException("Authentication required");
    await this.assertOwnership(missionId, userId);

    const original = await this.store.getById(missionId, userId);
    if (!original)
      throw new ForbiddenException(`mission ${missionId} not found`);

    // Phase P11-1: rerun 复用原 mission 的 userProfile（如有）
    const originalProfile = (original as { userProfile?: unknown })
      .userProfile as Partial<RunMissionInput> | null | undefined;
    const input: RunMissionInput = {
      topic: original.topic,
      depth: (["quick", "standard", "deep"].includes(
        originalProfile?.depth ?? original.depth,
      )
        ? (originalProfile?.depth ?? original.depth)
        : "deep") as RunMissionInput["depth"],
      language: (originalProfile?.language ??
        (original.language === "en-US"
          ? "en-US"
          : "zh-CN")) as RunMissionInput["language"],
      budgetProfile: originalProfile?.budgetProfile ?? "medium",
      styleProfile: originalProfile?.styleProfile ?? "executive",
      lengthProfile: originalProfile?.lengthProfile ?? "standard",
      audienceProfile: originalProfile?.audienceProfile ?? "domain-expert",
      withFigures: originalProfile?.withFigures ?? true,
      auditLayers: originalProfile?.auditLayers ?? "default",
      concurrency: originalProfile?.concurrency ?? 3,
      viewMode: originalProfile?.viewMode ?? "continuous",
      maxCredits: 300,
    };

    const newMissionId = randomUUID();
    this.ownership.assign(newMissionId, userId);

    void this.orchestrator
      .runMission(newMissionId, input, userId)
      .catch((err: unknown) => {
        this.log.error(
          `mission ${newMissionId} (rerun of ${missionId}) failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    return { missionId: newMissionId, streamNamespace: "agent-playground" };
  }

  /**
   * POST /api/v1/agent-playground/missions/:id/cancel
   * 取消运行中的 mission：DB 状态置为 cancelled，前端停止 polling。
   *
   * 限制：不会 abort 后台正在跑的 orchestrator（in-memory），但其后续写入
   * 会被 markFailed 兜底（写入 cancelled 状态会被 markCompleted 覆盖时
   * 我们在 markCompleted 里加了 guard——见 mission-store.service.ts）。
   */
  @Post("missions/:id/cancel")
  async cancelMission(
    @Param("id") missionId: string,
    @Request() req: RequestWithUser,
  ): Promise<{ ok: true; status: string }> {
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException("Authentication required");
    await this.assertOwnership(missionId, userId);

    const persisted = await this.store.getById(missionId, userId);
    if (!persisted)
      throw new ForbiddenException(`mission ${missionId} not found`);
    if (persisted.status !== "running") {
      throw new BadRequestException(
        `mission ${missionId} status is ${persisted.status}, not running`,
      );
    }
    // ★ Phase P12-1: 真触发 abort signal，让正在跑的 LLM/tool call 立即中断
    this.abortRegistry.abort(missionId, "user_cancelled");
    await this.store.markCancelled(missionId);
    return { ok: true, status: "cancelled" };
  }

  /**
   * DELETE /api/v1/agent-playground/missions/:id
   * 删除当前用户的某个 mission（仅删除 DB 记录，不影响已结束的 in-memory 状态）。
   */
  @Delete("missions/:id")
  async deleteMission(
    @Param("id") missionId: string,
    @Request() req: RequestWithUser,
  ): Promise<{ ok: true }> {
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException("Authentication required");
    const persisted = await this.store.getById(missionId, userId);
    if (!persisted)
      throw new ForbiddenException(`mission ${missionId} not found`);
    await this.store.deleteByUser(missionId, userId);
    this.ownership.release(missionId);
    return { ok: true };
  }

  /**
   * PATCH /api/v1/agent-playground/missions/:id
   * 修改 mission topic（rename）。
   */
  @Patch("missions/:id")
  async updateMission(
    @Param("id") missionId: string,
    @Body() body: { topic?: string },
    @Request() req: RequestWithUser,
  ): Promise<{ ok: true }> {
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException("Authentication required");
    const topic = (body?.topic ?? "").trim();
    if (!topic) throw new BadRequestException("topic is required");
    if (topic.length > 500)
      throw new BadRequestException("topic exceeds 500 chars");
    const persisted = await this.store.getById(missionId, userId);
    if (!persisted)
      throw new ForbiddenException(`mission ${missionId} not found`);
    await this.store.updateTopicByUser(missionId, userId, topic);
    return { ok: true };
  }

  /**
   * GET /api/v1/agent-playground/replay/:missionId?since=<ts>
   *
   * 从 MissionEventBuffer 读取累积事件。前端可：
   *   - 初次进页面用此端点 hydrate（防 socket 断线/掉包）
   *   - WS 失败时 polling 兜底
   */
  @Get("replay/:missionId")
  async replay(
    @Param("missionId") missionId: string,
    @Query("since") since: string | undefined,
    @Request() req: RequestWithUser,
  ): Promise<{ events: readonly unknown[]; serverNow: number }> {
    await this.assertOwnership(missionId, req.user?.id);
    const sinceTs = since ? Number(since) : undefined;
    const ts = Number.isFinite(sinceTs as number)
      ? (sinceTs as number)
      : undefined;
    // Fast path: in-memory buffer
    let events: readonly unknown[] = this.buffer.read(missionId, ts);
    // 兜底：内存空（Railway recycle 后），从 DB 持久化层读
    if (events.length === 0) {
      events = await this.buffer.readPersisted(missionId, ts);
    }
    return { events, serverNow: Date.now() };
  }

  /**
   * GET /api/v1/agent-playground/missions/:id/leader-chat
   * 拉取该 mission 的 Leader 对话历史。
   */
  @Get("missions/:id/leader-chat")
  async listLeaderChat(
    @Param("id") missionId: string,
    @Request() req: RequestWithUser,
  ): Promise<{ messages: unknown[] }> {
    await this.assertOwnership(missionId, req.user?.id);
    const messages = await this.leaderChat.list(missionId);
    return { messages };
  }

  /**
   * POST /api/v1/agent-playground/missions/:id/leader-chat
   * Body: { content: string }
   * 用户向 Leader 提问 → 系统回复（基于 mission 上下文）→ 两条都持久化。
   */
  @Post("missions/:id/leader-chat")
  async sendLeaderChat(
    @Param("id") missionId: string,
    @Body() body: { content?: string },
    @Request() req: RequestWithUser,
  ): Promise<{ user: unknown; assistant: unknown }> {
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException("Authentication required");
    await this.assertOwnership(missionId, userId);
    const content = (body?.content ?? "").toString();
    if (!content.trim()) {
      throw new BadRequestException("content must be a non-empty string");
    }
    if (content.length > 4000) {
      throw new BadRequestException("content exceeds 4000 chars");
    }
    return this.leaderChat.send(missionId, userId, content);
  }

  /**
   * 双层 ownership：先查内存 registry（fast path），miss 时回退查 DB。
   * Railway recycle 后 in-memory registry 清空，但 mission 在 DB 中仍存在，
   * 不应该让用户看不到自己的历史 mission。
   */
  private async assertOwnership(
    missionId: string,
    userId?: string,
  ): Promise<void> {
    if (!userId) throw new ForbiddenException("Authentication required");
    const owner = this.ownership.getOwner(missionId);
    if (owner) {
      if (owner !== userId) {
        throw new ForbiddenException(`mission ${missionId} not owned by you`);
      }
      return;
    }
    // Fallback: registry miss → 查 DB
    const persisted = await this.store.getById(missionId, userId);
    if (!persisted) {
      throw new ForbiddenException(`mission ${missionId} not found`);
    }
    // DB 命中 → 重新登记 in-memory（下次 hot path），保留 ownership
    this.ownership.assign(missionId, userId);
  }
}
