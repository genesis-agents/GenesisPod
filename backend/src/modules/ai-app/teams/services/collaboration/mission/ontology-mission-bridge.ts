/**
 * Ontology ↔ Mission bridge (Knowledge Ontology v1, P4)
 *
 * 从 TeamMissionService 抽出的纯编排 helper，避免 god-class 继续膨胀。无 DI —
 * 调用方传入自己已持有的 engine 依赖。
 *  - loadOntologyIntoPackage：加载本体子图并合并进 contextPackage（Leader 优先）
 *  - writeBackMissionToOntology：mission 完成后 fire-and-forget 回写 finalReport
 *    （受双开关 gate 控制：全局 env 总闸 + 议题级 DB 开关）
 */
import type { Logger } from "@nestjs/common";
import {
  OntologyService,
  OntologyBuilderSkill,
} from "@/modules/ai-engine/facade";
import {
  ToolRegistry,
  MissionContextPackage,
  mergeContextPackages,
} from "@/modules/ai-harness/facade";
import { mapSubgraphToContextPackage } from "./ontology-context.mapper";

/** 回写输入文本上限，与 skill 内部 MAX_INPUT_CHARS(32000) 对齐，尽量覆盖报告新发现 */
const WRITEBACK_MAX_CHARS = 24000;

/**
 * 按 topic 加载本体已有子图，合并到 Leader 产出的 contextPackage（Leader 优先，
 * 本体仅补充未提取的实体/术语）。失败非致命，原样返回传入的 contextPackage。
 */
export async function loadOntologyIntoPackage(
  ontologyService: OntologyService,
  topicId: string | null | undefined,
  contextPackage: MissionContextPackage | null | undefined,
  logger: Logger,
): Promise<MissionContextPackage | null | undefined> {
  if (!topicId) return contextPackage;
  try {
    const subgraph = await ontologyService.querySubgraphByTopic(topicId, {
      maxNodes: 100,
    });
    if (subgraph.nodes.length === 0) return contextPackage;
    const ontologyPkg = mapSubgraphToContextPackage(subgraph, "ontology");
    const merged = contextPackage
      ? mergeContextPackages(contextPackage, ontologyPkg)
      : ontologyPkg;
    logger.log(
      `[ontology] merged subgraph: ${subgraph.nodes.length} nodes (entities: ${merged.entities.length})`,
    );
    return merged;
  } catch (err) {
    logger.warn(
      `[ontology] subgraph load failed (non-fatal): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return contextPackage;
  }
}

/**
 * mission 完成后把 finalReport 的新事实 fire-and-forget 回写本体（不阻塞主流程）。
 *
 * 双开关 gate（默认全关）：
 *   1. 全局 env 总闸：process.env.ENABLE_ONTOLOGY_AUTO_INGEST === "1"
 *   2. 议题级 DB 开关：OntologyTopicSetting.autoIngest === true
 * 两者均为 true 时才执行回写；否则仅打 debug 日志后跳过。
 * 手工回填不走此函数，不受本 gate 约束。
 */
export function writeBackMissionToOntology(
  skill: OntologyBuilderSkill,
  toolRegistry: ToolRegistry,
  ontologyService: OntologyService,
  params: { finalReport: string; topicId?: string | null; missionId: string },
  logger: Logger,
): void {
  // 全局 env 总闸（快路径，同步判断，默认关）
  if (process.env.ENABLE_ONTOLOGY_AUTO_INGEST !== "1") {
    logger.debug(
      `[ontology] write-back skipped: ENABLE_ONTOLOGY_AUTO_INGEST is not set (missionId=${params.missionId})`,
    );
    return;
  }

  // 议题级开关（异步读 DB，gate 通过后执行 skill，保持 fire-and-forget 语义）
  void (async () => {
    try {
      const topicId = params.topicId ?? null;
      const topicEnabled = topicId
        ? await ontologyService.isAutoIngestEnabled(topicId)
        : false;

      if (!topicEnabled) {
        logger.debug(
          `[ontology] write-back skipped: autoIngest disabled for topicId=${topicId ?? "null"} (missionId=${params.missionId})`,
        );
        return;
      }

      const text = params.finalReport.slice(0, WRITEBACK_MAX_CHARS);
      skill.setToolRegistry(toolRegistry);
      const result = await skill.execute(
        {
          text,
          topicId: topicId ?? undefined,
          sourceType: "mission",
          sourceId: params.missionId,
        },
        {
          executionId: `ontology-writeback-${params.missionId}`,
          skillId: skill.id,
          createdAt: new Date(),
        },
      );

      if (result.success && result.data) {
        logger.log(
          `[ontology] write-back: created=${result.data.created} merged=${result.data.merged} linked=${result.data.linked}`,
        );
      }
    } catch (err: unknown) {
      logger.warn(
        `[ontology] write-back failed (non-fatal): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  })();
}
