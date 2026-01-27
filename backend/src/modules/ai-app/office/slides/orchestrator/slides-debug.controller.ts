/**
 * Slides Debug Controller (TEMPORARY)
 *
 * 临时诊断控制器，用于调试检查点数据
 * TODO: 调试完成后删除此文件
 */

import { Controller, Get, Param, Logger } from "@nestjs/common";
import { Public } from "../../../../../common/decorators/public.decorator";
import { CheckpointService } from "../checkpoint/checkpoint.service";

@Controller("internal/slides-debug")
@Public()
export class SlidesDebugController {
  private readonly logger = new Logger(SlidesDebugController.name);

  constructor(private readonly checkpointService: CheckpointService) {}

  /**
   * 检查点诊断端点 - 无需认证
   */
  @Get("checkpoints")
  async debugCheckpoints(): Promise<object> {
    this.logger.log("[debugCheckpoints] Fetching checkpoint diagnostics");

    const checkpoints = await this.checkpointService.list({});
    const latest15 = checkpoints.slice(0, 15);

    return {
      total: checkpoints.length,
      timestamp: new Date().toISOString(),
      checkpoints: latest15.map((cp) => ({
        id: cp.id.slice(0, 8),
        sessionId: cp.sessionId.slice(0, 8),
        name: cp.name?.slice(0, 50),
        type: cp.type,
        pagesCount: cp.state?.pages?.length || 0,
        pagesWithHtml:
          cp.state?.pages?.filter((p) => p.html && p.html.length > 0).length ||
          0,
        firstPageHtmlLength: cp.state?.pages?.[0]?.html?.length || 0,
        hasOutlinePlan: !!cp.state?.outlinePlan,
        outlineTitle: cp.state?.outlinePlan?.title?.slice(0, 40) || null,
        stateKeys: Object.keys(cp.state || {}),
        timestamp: cp.timestamp,
      })),
    };
  }

  /**
   * 搜索特定会话的检查点
   */
  @Get("search/:keyword")
  async searchCheckpoints(@Param("keyword") keyword: string): Promise<object> {
    this.logger.log(`[searchCheckpoints] Searching for: ${keyword}`);

    const checkpoints = await this.checkpointService.list({});
    const filtered = checkpoints.filter(
      (cp) =>
        cp.name?.toLowerCase().includes(keyword.toLowerCase()) ||
        cp.state?.outlinePlan?.title
          ?.toLowerCase()
          .includes(keyword.toLowerCase()),
    );

    return {
      keyword,
      total: filtered.length,
      checkpoints: filtered.slice(0, 20).map((cp) => ({
        id: cp.id,
        sessionId: cp.sessionId,
        name: cp.name,
        type: cp.type,
        pagesCount: cp.state?.pages?.length || 0,
        pagesWithHtml:
          cp.state?.pages?.filter((p) => p.html && p.html.length > 0).length ||
          0,
        outlineTitle: cp.state?.outlinePlan?.title || null,
        stateKeys: Object.keys(cp.state || {}),
      })),
    };
  }

  /**
   * 获取单个检查点的详细信息（包括页面数据摘要）
   */
  @Get("checkpoint/:id")
  async getCheckpointDetail(@Param("id") id: string): Promise<object> {
    this.logger.log(`[getCheckpointDetail] Fetching checkpoint: ${id}`);

    const checkpoints = await this.checkpointService.list({});
    const cp = checkpoints.find((c) => c.id === id || c.id.startsWith(id));

    if (!cp) {
      return { error: "Checkpoint not found", id };
    }

    const state = cp.state || {};
    const pages = state.pages || [];

    return {
      id: cp.id,
      sessionId: cp.sessionId,
      name: cp.name,
      type: cp.type,
      timestamp: cp.timestamp,
      stateKeys: Object.keys(state),
      pagesCount: pages.length,
      pages: pages.map((p: unknown, i: number) => {
        const page = p as Record<string, unknown>;
        return {
          index: i,
          id: (page.id as string)?.slice(0, 8),
          pageNumber: page.pageNumber || page.index,
          title:
            (page.title as string)?.slice(0, 50) ||
            (page.spec as { title?: string })?.title?.slice(0, 50),
          htmlLength: (page.html as string)?.length || 0,
          renderedHtmlLength: (page.renderedHtml as string)?.length || 0,
          status: page.status,
          hasDesign: !!page.design,
          hasSpec: !!page.spec,
          hasContent: !!page.content,
          keys: Object.keys(page),
        };
      }),
      outlinePlan: state.outlinePlan
        ? {
            title: state.outlinePlan.title,
            pagesCount: state.outlinePlan.pages?.length || 0,
            pagesTitles: state.outlinePlan.pages?.map(
              (p: { title?: string }) => p.title,
            ),
          }
        : null,
      taskDecomposition: state.taskDecomposition
        ? {
            totalPages: (state.taskDecomposition as { totalPages?: number })
              .totalPages,
            sectionsCount: (state.taskDecomposition as { sections?: unknown[] })
              .sections?.length,
          }
        : null,
      rawStatePreview: JSON.stringify(state).slice(0, 500),
    };
  }

  /**
   * 获取会话的所有检查点
   */
  @Get("session/:sessionId")
  async getSessionCheckpoints(
    @Param("sessionId") sessionId: string,
  ): Promise<object> {
    this.logger.log(
      `[getSessionCheckpoints] Fetching for session: ${sessionId}`,
    );

    const checkpoints = await this.checkpointService.list({});
    const filtered = checkpoints.filter(
      (cp) => cp.sessionId === sessionId || cp.sessionId.startsWith(sessionId),
    );

    return {
      sessionId,
      total: filtered.length,
      checkpoints: filtered.map((cp) => ({
        id: cp.id,
        name: cp.name,
        type: cp.type,
        pagesCount: cp.state?.pages?.length || 0,
        pagesWithHtml:
          cp.state?.pages?.filter(
            (p: { html?: string }) => p.html && p.html.length > 0,
          ).length || 0,
        hasOutlinePlan: !!cp.state?.outlinePlan,
        timestamp: cp.timestamp,
        stateKeys: Object.keys(cp.state || {}),
      })),
    };
  }
}
