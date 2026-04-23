/**
 * Golden runner 单元测试
 *
 * - 结构验证器：tolerate ±30%；硬违规（terminal event 缺失 / report null）判 FAIL
 * - Self-test 模式：20 tag 全 PASS（验证 runner 自身无 bug）
 * - 注入差异：构造违规 candidate 应判 FAIL
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  compareStructure,
  isPass,
} from "../../../../../../../scripts/golden/structure-validator";
import { runGolden } from "../../../../../../../scripts/golden/runner";
import {
  listBaselineTags,
  loadBaselineFixture,
} from "../../../../../../../scripts/golden/fixture-loader";
import type { BaselineFixture } from "../../../../../../../scripts/golden/types";

const fixturesRoot = path.resolve(process.cwd(), "fixtures/golden");
const hasFixtures = fs.existsSync(fixturesRoot);
const maybeDescribe = hasFixtures ? describe : describe.skip;

/** 深拷贝 fixture 便于修改 */
function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

maybeDescribe("Golden runner · structure validator", () => {
  let baseline: BaselineFixture;

  beforeAll(() => {
    const tag = listBaselineTags(fixturesRoot)[0];
    baseline = loadBaselineFixture(fixturesRoot, tag);
  });

  it("baseline 自比得 0 diff", () => {
    const diffs = compareStructure(baseline, clone(baseline));
    expect(diffs.length).toBe(0);
    expect(isPass(diffs)).toBe(true);
  });

  it("缺失 mission:completed 事件 → FAIL", () => {
    const candidate = clone(baseline);
    candidate.events = candidate.events.filter(
      (e) => (e.event as string) !== "mission:completed",
    );
    const diffs = compareStructure(baseline, candidate);
    expect(isPass(diffs)).toBe(false);
    expect(
      diffs.some(
        (d) =>
          d.severity === "fail" &&
          d.message.includes("missing mission terminal event"),
      ),
    ).toBe(true);
  });

  it("报告长度差 > 80% → FAIL (Group M-1 tolerance widened)", () => {
    const candidate = clone(baseline);
    // 切到 15%（缩减 85%）触发 fail
    candidate.finalReportMd = baseline.finalReportMd.slice(
      0,
      Math.floor(baseline.finalReportMd.length * 0.15),
    );
    const diffs = compareStructure(baseline, candidate);
    expect(isPass(diffs)).toBe(false);
    expect(
      diffs.some(
        (d) => d.severity === "fail" && d.field === "finalReportMd.length",
      ),
    ).toBe(true);
  });

  it("报告长度差 30%-80% → warn（PASS）", () => {
    const candidate = clone(baseline);
    candidate.finalReportMd =
      baseline.finalReportMd +
      "#".repeat(Math.floor(baseline.finalReportMd.length * 0.4));
    const diffs = compareStructure(baseline, candidate);
    expect(isPass(diffs)).toBe(true);
    expect(
      diffs.some(
        (d) => d.severity === "warn" && d.field === "finalReportMd.length",
      ),
    ).toBe(true);
  });

  it("dimensions 数量不同 → FAIL", () => {
    const candidate = clone(baseline);
    candidate.dbSnapshot.dimensions = candidate.dbSnapshot.dimensions.slice(
      0,
      1,
    );
    const diffs = compareStructure(baseline, candidate);
    expect(isPass(diffs)).toBe(false);
    expect(
      diffs.some(
        (d) =>
          d.severity === "fail" && d.field === "dbSnapshot.dimensions.length",
      ),
    ).toBe(true);
  });

  it("tokens 变化 > 30% → warn only（不 FAIL）", () => {
    const candidate = clone(baseline);
    candidate.metrics.totalTokens = Math.floor(
      baseline.metrics.totalTokens * 0.3,
    );
    const diffs = compareStructure(baseline, candidate);
    expect(
      diffs.some(
        (d) => d.severity === "warn" && d.field === "metrics.totalTokens",
      ),
    ).toBe(true);
    expect(isPass(diffs)).toBe(true); // warn only 不 block
  });

  it("status 非 completed → FAIL", () => {
    const candidate = clone(baseline);
    candidate.dbSnapshot.status = "failed";
    const diffs = compareStructure(baseline, candidate);
    expect(isPass(diffs)).toBe(false);
  });
});

maybeDescribe("Golden runner · self-test mode", () => {
  it("self-test 模式对 20 tag 全 PASS", async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "golden-out-"));

    const report = await runGolden({
      fixturesDir: fixturesRoot,
      outDir,
      mode: "self-test",
      judgeEnabled: false,
    });

    expect(report.totalTags).toBe(20);
    expect(report.failed).toBe(0);
    expect(report.passed).toBe(20);
    expect(report.warnedOnly).toBe(0);

    // report 文件写盘
    const files = fs.readdirSync(outDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^golden-report-self-test-.+\.json$/);

    fs.rmSync(outDir, { recursive: true, force: true });
  });

  it("only 过滤 tag 只跑匹配的", async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "golden-out-"));
    const report = await runGolden({
      fixturesDir: fixturesRoot,
      outDir,
      mode: "self-test",
      only: ["macro-*"],
      judgeEnabled: false,
    });

    expect(report.totalTags).toBe(6); // 3 macro × 2 depth
    expect(
      report.tagResults.every((t) => t.baselineTag.startsWith("macro-")),
    ).toBe(true);

    fs.rmSync(outDir, { recursive: true, force: true });
  });

  it("judgeEnabled=false 时 judge.enabled = false", async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "golden-out-"));
    const report = await runGolden({
      fixturesDir: fixturesRoot,
      outDir,
      mode: "self-test",
      only: ["macro-china-econ-2025-standard"],
      judgeEnabled: false,
    });
    expect(report.tagResults[0].judge.enabled).toBe(false);
    expect(report.tagResults[0].judge.skippedReason).toBeDefined();

    fs.rmSync(outDir, { recursive: true, force: true });
  });
});
