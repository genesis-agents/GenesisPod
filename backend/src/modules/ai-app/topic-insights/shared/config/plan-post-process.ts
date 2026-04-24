/**
 * Plan Post-Process
 *
 * baseline `38347e2a7:services/core/leader/leader-planning.service.ts:L358-L527`
 * 原 `planResearch` 方法的后处理段完整迁移。
 *
 * 用途：Leader 规划后处理 16 项业务不变量。LLM 产出 `LeaderPlan` 后、
 * 落 DB 前必须跑一遍本函数，否则：
 *   - LLM 产出的 model name（如 "Doubao"）不会反解为 modelId（"ep-xxx"）
 *   - LLM 产出的幻觉 skill（白名单外）不会被过滤
 *   - 缺失的 modelId 不会轮询分配
 *   - 研究员缺失的 skills/tools/assignmentReason 不会补齐
 *   - 审核员 debate skills 不会按 topicType 注入
 *
 * baseline 原行号标注在每步注释。
 */
import type { AgentAssignment, LeaderPlan } from "../../agents/specs/schemas";
import {
  resolveFrameworkSkills,
  DEBATE_SKILLS_BY_TOPIC_TYPE,
} from "./framework-skills.config";
import { filterValidSkills } from "./valid-skills.config";
import { selectDefaultSkillsForDimension } from "./default-skills.utils";

type TopicType = "MACRO" | "TECHNOLOGY" | "COMPANY" | "EVENT";

/**
 * 日志 sink — 方便 Stage 注入 Logger 实例（可选）。
 * 不注入时默认 no-op（单测环境安静）。
 */
export interface PlanPostProcessLogger {
  log(msg: string): void;
  debug(msg: string): void;
}

const NOOP_LOGGER: PlanPostProcessLogger = {
  log: () => undefined,
  debug: () => undefined,
};

/**
 * 执行 baseline 16 项后处理业务不变量。
 *
 * 保证输入 plan 就地修改（Zod schema 校验已在 spec.outputSchema 保证字段存在）。
 *
 * @param plan      Leader LLM 产出的 plan（后处理将 in-place 修改）
 * @param topicType 主题类型，影响 framework skills 和 debate skills 注入
 * @param availableModels 可用的 modelId 列表，缺 modelId 时轮询分配用
 * @param logger    可选日志器
 */
export function postProcessLeaderPlan(
  plan: LeaderPlan,
  topicType: TopicType,
  availableModels: ReadonlyArray<string>,
  logger: PlanPostProcessLogger = NOOP_LOGGER,
): void {
  if (!plan.agentAssignments || plan.agentAssignments.length === 0) return;

  // baseline L223-L241 的 modelNameToIdMap 构建在 harness 场景下简化：
  // harness 传入的 availableModels 已经是 modelId 列表，map 直接建 id→id。
  // 仍保留 lower-case key 以支持大小写不敏感匹配。
  const modelNameToIdMap = new Map<string, string>();
  for (const id of availableModels) {
    modelNameToIdMap.set(id.toLowerCase(), id);
  }

  let modelIndex = 0; // baseline L360

  for (const assignment of plan.agentAssignments) {
    const who = assignment.agentName || assignment.agentId;

    // 步骤 0: modelId 反解（baseline L363-L389）
    //   lower-case 查表 → 找不到就最长前缀模糊匹配。
    //   避免 "gpt" 误匹配 "gpt-4o" 而非 "gpt-5.1" — 取 matchLen 最长者。
    if (assignment.modelId) {
      const aiModelId = assignment.modelId.toLowerCase();
      let realId = modelNameToIdMap.get(aiModelId);

      if (!realId) {
        let bestMatchLen = 0;
        for (const [key, id] of modelNameToIdMap.entries()) {
          if (key.startsWith(aiModelId) || aiModelId.startsWith(key)) {
            const matchLen = Math.min(key.length, aiModelId.length);
            if (matchLen > bestMatchLen) {
              bestMatchLen = matchLen;
              realId = id;
            }
          }
        }
      }

      if (realId && realId !== assignment.modelId) {
        logger.log(
          `[postProcess] Resolved model name "${assignment.modelId}" → "${realId}" for ${who}`,
        );
        assignment.modelId = realId;
      }
    }

    // 步骤 0.5: skills 白名单过滤（baseline L391-L408）
    if (assignment.skills && assignment.skills.length > 0) {
      const { valid, invalid } = filterValidSkills(assignment.skills);
      if (invalid.length > 0) {
        logger.debug(
          `[postProcess] Filtered out LLM-hallucinated skills for ${who}: ${invalid.join(", ")}`,
        );
      }
      assignment.skills = valid;
    }

    // 步骤 1: modelId 轮询分配（baseline L410-L418）
    if (
      (!assignment.modelId || assignment.modelId === "") &&
      availableModels.length > 0
    ) {
      const id = availableModels[modelIndex % availableModels.length];
      assignment.modelId = id;
      logger.log(`[postProcess] Auto-assigned model ${id} to ${who}`);
      modelIndex++;
    }

    // 步骤 2: dimension_researcher 专属（baseline L420-L479）
    if (assignment.agentType === "dimension_researcher") {
      // 2.1 前置 framework skills
      const frameworkSkills = resolveFrameworkSkills(topicType);
      if (frameworkSkills.length > 0) {
        const existing = assignment.skills ?? [];
        assignment.skills = [...new Set([...frameworkSkills, ...existing])];
        logger.debug(
          `[postProcess] Injected framework skills [${frameworkSkills.join(",")}] for ${who}`,
        );
      }

      // 2.2 skills 为空 → 关键词智能选择
      if (!assignment.skills || assignment.skills.length === 0) {
        assignment.skills = selectDefaultSkillsForDimension(
          assignment.assignedDimensions ?? [],
          plan.dimensions,
        );
        logger.debug(
          `[postProcess] Auto-assigned skills [${assignment.skills.join(",")}] to ${who}`,
        );
      }

      // 2.3 tools 为空 → ["web-search"]
      if (!assignment.tools || assignment.tools.length === 0) {
        assignment.tools = ["web-search"];
        logger.debug(`[postProcess] Auto-assigned default tools to ${who}`);
      }

      // 2.4 assignmentReason
      const dimensionNames =
        assignment.assignedDimensions
          ?.map((dimId) => {
            const dim = plan.dimensions.find((d) => d.id === dimId);
            return dim?.name || dimId;
          })
          .join("、") || "相关领域";

      if (!assignment.assignmentReason) {
        assignment.assignmentReason = {
          agentReason: `${assignment.agentName || "研究员"}专注于「${dimensionNames}」领域的深度调研，具备该领域的信息收集和分析能力`,
          modelReason: assignment.modelId
            ? `选择 ${assignment.modelId} 模型，因为其具备出色的信息检索、内容分析和逻辑推理能力`
            : "使用擅长信息检索和内容分析的模型",
        };
        logger.debug(
          `[postProcess] Auto-assigned default assignmentReason to ${who}`,
        );
      } else if (!assignment.assignmentReason.agentReason) {
        assignment.assignmentReason.agentReason = `${assignment.agentName || "研究员"}专注于「${dimensionNames}」领域的深度调研`;
      }

      // 2.5 强制覆盖 modelReason（避免通用 AI 回答）
      if (assignment.modelId) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- 2.4 已保证 assignmentReason 存在
        assignment.assignmentReason.modelReason = `选择 ${assignment.modelId} 模型，因为其具备出色的信息检索、内容分析和逻辑推理能力`;
      }
    }

    // 步骤 3: quality_reviewer 专属（baseline L481-L505）
    if (assignment.agentType === "quality_reviewer") {
      const debateSkills = DEBATE_SKILLS_BY_TOPIC_TYPE[topicType];
      if (debateSkills && debateSkills.length > 0) {
        const existing = assignment.skills ?? [];
        assignment.skills = [...new Set([...debateSkills, ...existing])];
      }
      if (!assignment.skills || assignment.skills.length === 0) {
        assignment.skills = ["critical-thinking", "synthesis"];
      }
      if (!assignment.assignmentReason) {
        assignment.assignmentReason = {
          agentReason: `${assignment.agentName || "质量审核员"}负责全面审核研究成果，确保内容准确性、逻辑一致性和完整性`,
          modelReason: "使用擅长一致性检查和质量评估的模型",
        };
      } else if (!assignment.assignmentReason.agentReason) {
        assignment.assignmentReason.agentReason = `${assignment.agentName || "质量审核员"}负责全面审核研究成果，确保内容准确性、逻辑一致性和完整性`;
      }
      if (assignment.modelId) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        assignment.assignmentReason.modelReason = `选择 ${assignment.modelId} 模型，因为其擅长一致性检查、事实核验和质量评估`;
      }
    }

    // 步骤 4: report_writer 专属（baseline L507-L525）
    if (assignment.agentType === "report_writer") {
      if (!assignment.skills || assignment.skills.length === 0) {
        assignment.skills = ["synthesis"];
      }
      if (!assignment.assignmentReason) {
        assignment.assignmentReason = {
          agentReason: `${assignment.agentName || "报告撰写员"}负责整合多维度研究成果，生成结构清晰、逻辑连贯的专业报告`,
          modelReason: "使用具有强大语言生成和内容整合能力的模型",
        };
      } else if (!assignment.assignmentReason.agentReason) {
        assignment.assignmentReason.agentReason = `${assignment.agentName || "报告撰写员"}负责整合多维度研究成果，生成结构清晰、逻辑连贯的专业报告`;
      }
      if (assignment.modelId) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        assignment.assignmentReason.modelReason = `选择 ${assignment.modelId} 模型，因为其具备强大的语言生成、内容整合和篇章组织能力`;
      }
    }
  }
}

/**
 * Summary 工具（方便 Stage 打印研究员分配概览）。
 * baseline L534-L543。
 */
export function summarizeResearcherAssignments(
  assignments: ReadonlyArray<AgentAssignment>,
): string {
  return assignments
    .filter((a) => a.agentType === "dimension_researcher")
    .map((a) => {
      const parts: string[] = [a.agentName || a.agentId];
      if (a.modelId) parts.push(`model=${a.modelId}`);
      if (a.skills?.length) parts.push(`skills=[${a.skills.join(",")}]`);
      if (a.tools?.length) parts.push(`tools=[${a.tools.join(",")}]`);
      return parts.join(" ");
    })
    .join(" | ");
}
