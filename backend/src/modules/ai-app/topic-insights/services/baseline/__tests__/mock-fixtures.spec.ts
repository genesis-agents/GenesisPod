/**
 * 验证 `scripts/fixtures/generate-mock-fixtures.ts` 产出的 20 份 fixtures
 * 结构符合 BaselineRecorder 消费口径。
 *
 * 若本地 fixtures 缺失，测试标记为 skip（CI 环境需要先 run fixtures:generate）。
 */

import * as fs from "fs";
import * as path from "path";

const fixturesRoot = path.resolve(process.cwd(), "fixtures/golden");

const EXPECTED_TAGS = [
  "macro-china-econ-2025-standard",
  "macro-china-econ-2025-thorough",
  "macro-ai-chip-global-standard",
  "macro-ai-chip-global-thorough",
  "macro-energy-transition-standard",
  "macro-energy-transition-thorough",
  "tech-llm-training-cost-standard",
  "tech-llm-training-cost-thorough",
  "tech-ai-agent-stack-2026-standard",
  "tech-ai-agent-stack-2026-thorough",
  "tech-quantum-computing-progress-standard",
  "tech-quantum-computing-progress-thorough",
  "company-openai-strategy-standard",
  "company-openai-strategy-thorough",
  "company-nvidia-datacenter-standard",
  "company-nvidia-datacenter-thorough",
  "event-apple-vision-pro-2-standard",
  "event-apple-vision-pro-2-thorough",
  "event-company-q3-earnings-standard",
  "event-company-q3-earnings-thorough",
];

const hasFixtures = fs.existsSync(fixturesRoot);

const maybeDescribe = hasFixtures ? describe : describe.skip;

maybeDescribe("Mock fixtures schema", () => {
  it("所有 20 个 tag 都存在", () => {
    for (const tag of EXPECTED_TAGS) {
      expect(fs.existsSync(path.join(fixturesRoot, tag))).toBe(true);
    }
  });

  it("每个 fixture 目录含完整 5 个文件", () => {
    for (const tag of EXPECTED_TAGS) {
      const dir = path.join(fixturesRoot, tag);
      expect(fs.existsSync(path.join(dir, "llm-calls.ndjson"))).toBe(true);
      expect(fs.existsSync(path.join(dir, "events.ndjson"))).toBe(true);
      expect(fs.existsSync(path.join(dir, "db-snapshot.json"))).toBe(true);
      expect(fs.existsSync(path.join(dir, "metrics.json"))).toBe(true);
      expect(fs.existsSync(path.join(dir, "final-report.md"))).toBe(true);
    }
  });

  it("每个 fixture 的 JSON 可 parse、ndjson 每行可 parse", () => {
    for (const tag of EXPECTED_TAGS) {
      const dir = path.join(fixturesRoot, tag);
      const dbSnapshot = JSON.parse(
        fs.readFileSync(path.join(dir, "db-snapshot.json"), "utf8"),
      ) as Record<string, unknown>;
      const metrics = JSON.parse(
        fs.readFileSync(path.join(dir, "metrics.json"), "utf8"),
      ) as Record<string, unknown>;

      expect(dbSnapshot.missionId).toBeDefined();
      expect(dbSnapshot.report).toBeDefined();
      expect(dbSnapshot.status).toBe("completed");

      expect(metrics.llmCallCount).toBeGreaterThan(0);
      expect(metrics.totalTokens).toBeGreaterThan(0);

      const llmLines = fs
        .readFileSync(path.join(dir, "llm-calls.ndjson"), "utf8")
        .trim()
        .split("\n");
      expect(llmLines.length).toBe(metrics.llmCallCount);
      for (const line of llmLines) {
        const rec = JSON.parse(line) as Record<string, unknown>;
        expect(rec.model).toBeDefined();
        expect(rec.messages).toBeDefined();
        expect(rec.content).toBeDefined();
      }

      const evLines = fs
        .readFileSync(path.join(dir, "events.ndjson"), "utf8")
        .trim()
        .split("\n");
      expect(evLines.length).toBeGreaterThan(0);
      for (const line of evLines) {
        const rec = JSON.parse(line) as Record<string, unknown>;
        expect(rec.event).toBeDefined();
        expect(rec.topicId).toBeDefined();
      }
    }
  });

  it("final-report.md 非空且为合理大小", () => {
    for (const tag of EXPECTED_TAGS) {
      const content = fs.readFileSync(
        path.join(fixturesRoot, tag, "final-report.md"),
        "utf8",
      );
      expect(content.length).toBeGreaterThan(500);
      expect(content.length).toBeLessThan(20000);
    }
  });

  it("thorough fixtures 的 LLM 调用数 > standard 同 topic", () => {
    // 只检查 MACRO 类（standard 走 macro 模板，thorough 走 tech 模板）
    const standardTag = "macro-china-econ-2025-standard";
    const thoroughTag = "macro-china-econ-2025-thorough";
    const stdMetrics = JSON.parse(
      fs.readFileSync(
        path.join(fixturesRoot, standardTag, "metrics.json"),
        "utf8",
      ),
    ) as { llmCallCount: number };
    const thMetrics = JSON.parse(
      fs.readFileSync(
        path.join(fixturesRoot, thoroughTag, "metrics.json"),
        "utf8",
      ),
    ) as { llmCallCount: number };
    expect(thMetrics.llmCallCount).toBeGreaterThan(stdMetrics.llmCallCount);
  });
});
