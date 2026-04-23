/**
 * Mock Fixture Generator — Topic Insights Harness Phase 0 · PR-0.2
 *
 * 零成本生成 20 份 baseline fixtures，供 Golden runner / Judge 测试
 * 基础设施链路使用。真 prod 录制（PR-0.4）再覆盖。
 *
 * 输出：backend/fixtures/golden/<baselineTag>/{llm-calls.ndjson, events.ndjson,
 *       db-snapshot.json, metrics.json, final-report.md}
 *
 * 运行：npx tsx scripts/fixtures/generate-mock-fixtures.ts
 *     or npm run fixtures:generate
 */

import * as fs from "fs";
import * as path from "path";
import { macroStandardTemplate } from "./templates/macro-standard";
import { companyStandardTemplate } from "./templates/company-standard";
import { eventStandardTemplate } from "./templates/event-standard";
import { technologyThoroughTemplate } from "./templates/technology-thorough";
import type { MissionFixture, TemplateFn, TemplateInput } from "./types";

interface TopicSpec {
  topicId: string;
  topicName: string;
  depths: Array<{
    depth: "standard" | "thorough";
    template: TemplateFn;
  }>;
}

/**
 * 10 个 topic × 2 depth = 20 fixtures
 *
 * standard 走各自 type 的 standard template。
 * thorough 目前统一走 technology-thorough 模板（结构更深），
 * 但通过 topicName 注入保证对不同 type 有内容差异。
 */
const TOPICS: TopicSpec[] = [
  // MACRO × 3
  {
    topicId: "macro-china-econ-2025",
    topicName: "中国经济 2025 年展望",
    depths: [
      { depth: "standard", template: macroStandardTemplate },
      { depth: "thorough", template: technologyThoroughTemplate },
    ],
  },
  {
    topicId: "macro-ai-chip-global",
    topicName: "全球 AI 芯片竞争格局",
    depths: [
      { depth: "standard", template: macroStandardTemplate },
      { depth: "thorough", template: technologyThoroughTemplate },
    ],
  },
  {
    topicId: "macro-energy-transition",
    topicName: "全球能源转型 2026 路径",
    depths: [
      { depth: "standard", template: macroStandardTemplate },
      { depth: "thorough", template: technologyThoroughTemplate },
    ],
  },
  // TECHNOLOGY × 3
  {
    topicId: "tech-llm-training-cost",
    topicName: "大模型训练成本下降趋势",
    depths: [
      { depth: "standard", template: macroStandardTemplate },
      { depth: "thorough", template: technologyThoroughTemplate },
    ],
  },
  {
    topicId: "tech-ai-agent-stack-2026",
    topicName: "AI Agent 技术栈 2026",
    depths: [
      { depth: "standard", template: macroStandardTemplate },
      { depth: "thorough", template: technologyThoroughTemplate },
    ],
  },
  {
    topicId: "tech-quantum-computing-progress",
    topicName: "量子计算 2026 进展",
    depths: [
      { depth: "standard", template: macroStandardTemplate },
      { depth: "thorough", template: technologyThoroughTemplate },
    ],
  },
  // COMPANY × 2
  {
    topicId: "company-openai-strategy",
    topicName: "OpenAI 商业化策略分析",
    depths: [
      { depth: "standard", template: companyStandardTemplate },
      { depth: "thorough", template: technologyThoroughTemplate },
    ],
  },
  {
    topicId: "company-nvidia-datacenter",
    topicName: "NVIDIA 数据中心业务",
    depths: [
      { depth: "standard", template: companyStandardTemplate },
      { depth: "thorough", template: technologyThoroughTemplate },
    ],
  },
  // EVENT × 2
  {
    topicId: "event-apple-vision-pro-2",
    topicName: "Apple Vision Pro 2 发布影响",
    depths: [
      { depth: "standard", template: eventStandardTemplate },
      { depth: "thorough", template: technologyThoroughTemplate },
    ],
  },
  {
    topicId: "event-company-q3-earnings",
    topicName: "某代表公司 Q3 财报分析",
    depths: [
      { depth: "standard", template: eventStandardTemplate },
      { depth: "thorough", template: technologyThoroughTemplate },
    ],
  },
];

function writeFixture(outDir: string, fixture: MissionFixture): void {
  const tag = fixture.baselineTag.replace(/[^\w.-]/g, "_");
  const dir = path.join(outDir, tag);
  fs.mkdirSync(dir, { recursive: true });

  // llm-calls.ndjson
  const ndjsonLlm =
    fixture.llmCalls.map((c) => JSON.stringify(c)).join("\n") + "\n";
  fs.writeFileSync(path.join(dir, "llm-calls.ndjson"), ndjsonLlm, "utf8");

  // events.ndjson
  const ndjsonEvents =
    fixture.events.map((e) => JSON.stringify(e)).join("\n") + "\n";
  fs.writeFileSync(path.join(dir, "events.ndjson"), ndjsonEvents, "utf8");

  // db-snapshot.json
  fs.writeFileSync(
    path.join(dir, "db-snapshot.json"),
    JSON.stringify(fixture.dbSnapshot, null, 2),
    "utf8",
  );

  // metrics.json
  fs.writeFileSync(
    path.join(dir, "metrics.json"),
    JSON.stringify(fixture.metrics, null, 2),
    "utf8",
  );

  // final-report.md
  fs.writeFileSync(
    path.join(dir, "final-report.md"),
    fixture.finalReportMd,
    "utf8",
  );

  console.log(
    `[${tag}] llm=${fixture.llmCalls.length} events=${fixture.events.length} ` +
      `tokens=${fixture.metrics.totalTokens} cost=$${fixture.metrics.estimatedCostUsd} ` +
      `report=${fixture.finalReportMd.length}B`,
  );
}

function main(): void {
  const outDir = path.resolve(process.cwd(), "backend/fixtures/golden");
  // 若在 backend/ 下运行，cwd 已是 backend，兼容一下：
  const realOutDir =
    path.basename(process.cwd()) === "backend"
      ? path.resolve(process.cwd(), "fixtures/golden")
      : outDir;

  fs.mkdirSync(realOutDir, { recursive: true });

  const baseTimestampMs = Date.UTC(2026, 3, 22, 10, 0, 0); // 2026-04-22 10:00 UTC
  let seed = 100;

  for (const topic of TOPICS) {
    for (const depthSpec of topic.depths) {
      const baselineTag = `${topic.topicId}-${depthSpec.depth}`;
      const templateInput: TemplateInput = {
        baselineTag,
        missionId: `mock-mission-${seed}`,
        topicId: topic.topicId,
        topicName: topic.topicName,
        baseTimestampMs: baseTimestampMs + seed * 1000,
        seed,
      };
      seed += 1;

      const fixture = depthSpec.template(templateInput);
      // 修复 depth 与 template 不对齐的情况：mock 中 thorough 用的是 tech 模板，
      // 输出的 depth 字段需与 spec 对齐，dbSnapshot.mission.researchDepth 亦然。
      if (fixture.depth !== depthSpec.depth) {
        fixture.depth = depthSpec.depth;
        (
          fixture.dbSnapshot.mission as { researchDepth: string }
        ).researchDepth = depthSpec.depth;
      }

      writeFixture(realOutDir, fixture);
    }
  }

  console.log(`\nGenerated ${TOPICS.length * 2} fixtures at ${realOutDir}`);
}

main();
