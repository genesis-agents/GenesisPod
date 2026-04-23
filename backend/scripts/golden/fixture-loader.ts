/**
 * Fixture loader — 把 baseline fixture 的 5 个文件组装成 BaselineFixture。
 */

import * as fs from "fs";
import * as path from "path";
import type { BaselineFixture } from "./types";

export function listBaselineTags(fixturesDir: string): string[] {
  if (!fs.existsSync(fixturesDir)) return [];
  return fs
    .readdirSync(fixturesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

export function loadBaselineFixture(
  fixturesDir: string,
  tag: string,
): BaselineFixture {
  const dir = path.join(fixturesDir, tag);
  const mustExist = (f: string) => {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) {
      throw new Error(`[golden-runner] fixture missing: ${tag}/${f}`);
    }
    return p;
  };

  const llmCallsPath = mustExist("llm-calls.ndjson");
  const eventsPath = mustExist("events.ndjson");
  const dbSnapshotPath = mustExist("db-snapshot.json");
  const metricsPath = mustExist("metrics.json");
  const reportPath = mustExist("final-report.md");

  const llmCalls = fs
    .readFileSync(llmCallsPath, "utf8")
    .trim()
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);

  const events = fs
    .readFileSync(eventsPath, "utf8")
    .trim()
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);

  const dbSnapshot = JSON.parse(
    fs.readFileSync(dbSnapshotPath, "utf8"),
  ) as BaselineFixture["dbSnapshot"];

  const metrics = JSON.parse(
    fs.readFileSync(metricsPath, "utf8"),
  ) as BaselineFixture["metrics"];

  const finalReportMd = fs.readFileSync(reportPath, "utf8");

  // Derive topic info from dbSnapshot
  const report = dbSnapshot.report as Record<string, unknown> | null;
  const mission = (
    dbSnapshot as unknown as { mission?: Record<string, unknown> }
  ).mission;

  return {
    baselineTag: tag,
    missionId: dbSnapshot.missionId,
    topicId: dbSnapshot.topicId,
    topicName:
      (report?.versionLabel as string) ||
      (mission?.topicName as string) ||
      dbSnapshot.topicId,
    llmCalls,
    events,
    dbSnapshot,
    metrics,
    finalReportMd,
  };
}
