/**
 * Stage S8B — Section Quality Enhancement (沉淀消费 v3, 2026-04-29)
 *
 * 在 S8 装配出 reportArtifact 后、S9 critic L4 之前，对每个 section 跑：
 *   1) SectionSelfEvalService.evaluateSection —— 4 维写中自评，分数 1-10
 *   2) 弱维度 (score < 7) → SectionRemediationService.remediate —— 单次 LLM 合并
 *      补救（自动 STRONG tier 升级）
 *   3) 重新自评，记录补救前/后/delta
 *   4) 把 trace 推入 ctx.qualityTraceCtx（消费方）
 *
 * 跳过条件：
 *   - !reportArtifact 或 sections 为空
 *   - input.auditLayers === "minimal"（用户明确关掉深度审阅）
 *
 * 失败处理：每个 section 独立 try-catch，单 section 失败不影响其它。
 *   补救失败保留原内容（SectionRemediation 内部已做防退化校验）。
 *
 * NOTE: ArtifactSection 没有独立 body 字段，section 内容用 fullMarkdown.slice(startOffset, endOffset)
 * 取得；补救后的内容回写到 fullMarkdown（更新对应区间）。
 */

import type { MissionContext } from "../mission-context";
import type { MissionDeps } from "../mission-deps";
import { narrate } from "../helpers/narrative.util";
import type {
  SelfEvalDimension,
  RemediationAction,
  RemediationActionType,
} from "../../../../../../ai-harness/facade";

const REMEDIATION_GUIDANCE: Record<SelfEvalDimension, string> = {
  analytical_depth:
    "深化因果推理：在每个观点后增加 1-2 句对'为什么'的展开，引用证据支撑结论，避免单纯陈述事实。",
  evidence_coverage:
    "扩充证据覆盖：补充至少 2 个不同来源的引用支持核心论断，对关键数据标注 [N] 引用。",
  actionability:
    "增强可操作性：补充明确的建议、优先级排序、风险提示和后续行动指引。",
  writing_quality:
    "提升专业写作：消除 AI 痕迹（'我们认为'、'值得关注'类表达），段落结构合理，结论与论据对应。",
};

const ACTION_TYPE_BY_DIM: Record<SelfEvalDimension, RemediationActionType> = {
  analytical_depth: "deepen_analysis",
  evidence_coverage: "inject_evidence",
  actionability: "add_recommendations",
  writing_quality: "improve_style",
};

export async function runSectionQualityEnhancementStage(
  ctx: MissionContext,
  deps: MissionDeps,
): Promise<void> {
  const { reportArtifact, input, missionId, userId } = ctx;
  if (!reportArtifact || reportArtifact.sections.length === 0) return;
  if (input.auditLayers === "minimal") return;

  const language = input.language?.startsWith("en") ? "en" : "zh";

  await narrate(deps.emit, missionId, userId, {
    stage: "s8b-quality-enhancement",
    role: "writer",
    tag: "thinking",
    text: `质量闭环启动：对 ${reportArtifact.sections.length} 个章节进行 4 维自评，弱维度自动补救`,
    agentId: "writer",
  });

  let evaluatedCount = 0;
  let remediatedCount = 0;
  let scoreDeltaSum = 0;
  // 倒序处理 section（offset 漂移避免）：从后往前替换 fullMarkdown
  const sectionsByOffset = [...reportArtifact.sections].sort(
    (a, b) => b.startOffset - a.startOffset,
  );
  let fullMarkdown = reportArtifact.content.fullMarkdown;

  for (const section of sectionsByOffset) {
    const body = fullMarkdown.slice(section.startOffset, section.endOffset);
    if (!body || body.length < 200) continue;

    try {
      // 1) self-eval before
      const evalBefore = await deps.sectionSelfEval.evaluateSection({
        content: body,
        sectionTitle: section.title,
        topicName: input.topic,
        language,
      });
      evaluatedCount++;

      if (evalBefore.overallOk || evalBefore.weakAreas.length === 0) {
        continue;
      }

      // 2) build remediation actions for weak dims
      const actions: RemediationAction[] = evalBefore.weakAreas.map((dim) => ({
        type: ACTION_TYPE_BY_DIM[dim],
        dimension: dim,
        score: evalBefore.scores[dim] ?? 0,
        guidance: REMEDIATION_GUIDANCE[dim],
      }));

      // 3) remediate（外层 runMission 已 wrap withUserContext，credits 自动归集）
      const remediation = await deps.sectionRemediation.remediate({
        content: body,
        sectionTitle: section.title,
        actions,
        language,
      });

      if (remediation.skipped) {
        deps.log.debug(
          `[s8b] Section "${section.title}" remediation skipped: ${remediation.skipReason}`,
        );
        continue;
      }

      // 4) self-eval after — 强制重评
      const evalAfter = await deps.sectionSelfEval.evaluateSection({
        content: remediation.content,
        sectionTitle: section.title,
        topicName: input.topic,
        language,
      });

      const beforeAvg =
        Object.values(evalBefore.scores).reduce((a, b) => a + b, 0) /
        Math.max(1, Object.values(evalBefore.scores).length);
      const afterAvg =
        Object.values(evalAfter.scores).reduce((a, b) => a + b, 0) /
        Math.max(1, Object.values(evalAfter.scores).length);
      const delta = afterAvg - beforeAvg;
      scoreDeltaSum += delta;

      // 5) 应用补救（如果分数没退步），回写 fullMarkdown 区间
      if (delta >= -0.3) {
        fullMarkdown =
          fullMarkdown.slice(0, section.startOffset) +
          remediation.content +
          fullMarkdown.slice(section.endOffset);
        // 这次 section 之后的 offset 受到漂移影响，但因为我们倒序处理，前面 section 还没读
        // 所以漂移不会影响后续读取（已经按 offset 倒序）
        // 但 section.endOffset 需要更新才能让后续算法使用
        const lengthDelta = remediation.content.length - body.length;
        section.endOffset += lengthDelta;
        section.wordCount = remediation.content.replace(/\s/g, "").length;
        remediatedCount++;
        deps.log.log(
          `[s8b] Section "${section.title}" remediated: ${beforeAvg.toFixed(1)} → ${afterAvg.toFixed(1)} (+${delta.toFixed(1)})`,
        );
      } else {
        deps.log.warn(
          `[s8b] Section "${section.title}" remediation regressed (Δ=${delta.toFixed(1)}), keeping original`,
        );
      }

      // 6) push trace to qualityTraceCtx if 已初始化
      if (ctx.qualityTraceCtx) {
        deps.qualityTraceCompute.recordDimensionRemediationLoop(
          ctx.qualityTraceCtx,
          section.id,
          {
            selfEvalScoresBefore: evalBefore.scores,
            selfEvalScoresAfter: evalAfter.scores,
            weakAreasResolved: evalAfter.weakAreas.length === 0,
          },
        );
      }
    } catch (err) {
      deps.log.warn(
        `[s8b] Section "${section.title}" enhancement failed (non-fatal): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  // 回写更新后的 fullMarkdown
  if (remediatedCount > 0) {
    reportArtifact.content.fullMarkdown = fullMarkdown;
    reportArtifact.content.fullReportSize = Buffer.byteLength(
      fullMarkdown,
      "utf8",
    );
    // ★ P1-N (2026-04-29): 补救后 section.startOffset/endOffset 已漂移，
    // 必须根据新的 fullMarkdown 重算每个 section 的 offset，否则 S9B 按错位文本评审
    rebuildSectionOffsets(reportArtifact.sections, fullMarkdown);
  }

  await narrate(deps.emit, missionId, userId, {
    stage: "s8b-quality-enhancement",
    role: "writer",
    tag: "success",
    text: `质量闭环完成：评估 ${evaluatedCount} 个章节，补救 ${remediatedCount} 个，平均提升 ${
      remediatedCount > 0
        ? "+" + (scoreDeltaSum / remediatedCount).toFixed(1)
        : "0"
    } 分`,
    agentId: "writer",
  });
}

/**
 * ★ P1-N (2026-04-29): 补救后 fullMarkdown 变更，重新定位 section offset。
 *
 * ★ P0-NEW-2/3 (round 2 修补)：与 ReportAssemblerService.buildSectionTree 严格对齐
 * 用行级扫描而非正则——只承认 `## ` 二级标题（不含 `### ` 三级），避免补救文本中的
 * 子标题 / 一级标题被误判。title 比较用 trim 严格相等，不放进 regex 避免元字符。
 *
 * 找不到 title 时：把 startOffset/endOffset 标 -1，下游消费方按 >=0 校验后再 slice，
 * 避免保留陈旧 offset 让 S9B 切到错位文本。
 */
function rebuildSectionOffsets(
  sections: { title: string; startOffset: number; endOffset: number }[],
  fullMarkdown: string,
): void {
  // 行级扫描收集所有 `## ` 二级标题（与 buildSectionTree 同规则）
  const headings: { title: string; startOffset: number }[] = [];
  let charOffset = 0;
  for (const line of fullMarkdown.split("\n")) {
    if (line.startsWith("## ") && !line.startsWith("### ")) {
      headings.push({
        title: line.slice(3).trim(),
        startOffset: charOffset,
      });
    }
    charOffset += line.length + 1; // +1 for the "\n"
  }
  // 按原 section 顺序消费 headings —— 同名标题用首个未消费项匹配
  let headingIdx = 0;
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    const wantTitle = sec.title.trim();
    const matchIdx = headings.findIndex(
      (h, idx) => idx >= headingIdx && h.title === wantTitle,
    );
    if (matchIdx < 0) {
      // 标题在补救后被改写或丢失 —— 显式标无效，下游必须校验 >=0
      sec.startOffset = -1;
      sec.endOffset = -1;
      continue;
    }
    sec.startOffset = headings[matchIdx].startOffset;
    // endOffset = 下一个原 section 对应的 heading 起点；若到末尾则文末
    const nextSec = sections[i + 1];
    let endOff = fullMarkdown.length;
    if (nextSec) {
      const nextWant = nextSec.title.trim();
      const nextIdx = headings.findIndex(
        (h, idx) => idx > matchIdx && h.title === nextWant,
      );
      if (nextIdx >= 0) endOff = headings[nextIdx].startOffset;
    }
    sec.endOffset = endOff;
    headingIdx = matchIdx + 1;
  }
}
