/**
 * Report Generator - produces structured JSON reports from patrol results
 */

import * as fs from "fs";
import * as path from "path";
import type { PageDiagnostics } from "./diagnostics-collector";
import type { DetectionThresholds } from "./config";
import { DEFAULT_THRESHOLDS } from "./config";

export type IssueSeverity = "critical" | "major" | "minor" | "info";
export type IssueCategory =
  | "BLANK_PAGE"
  | "CONSOLE_ERROR"
  | "NETWORK_ERROR"
  | "OVERFLOW"
  | "RAW_DATA_DISPLAY"
  | "FORBIDDEN_PATTERN"
  | "A11Y"
  | "PERFORMANCE";

export interface PatrolIssue {
  id: string;
  url: string;
  viewport: string;
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  description: string;
  evidence: string;
  /** Estimated code location if determinable */
  codeHint?: string;
}

export interface PatrolReport {
  timestamp: string;
  duration: number;
  config: {
    baseUrl: string;
    viewports: string[];
    totalRoutes: number;
  };
  summary: {
    totalPages: number;
    totalIssues: number;
    bySeverity: Record<IssueSeverity, number>;
    byCategory: Record<string, number>;
    passedPages: number;
    failedPages: number;
  };
  issues: PatrolIssue[];
  pages: Array<{
    url: string;
    viewport: string;
    status: "pass" | "fail";
    loadTime: number;
    issueCount: number;
    screenshotPath?: string;
  }>;
}

let issueCounter = 0;

/** Reset issue counter between patrol runs */
export function resetIssueCounter(): void {
  issueCounter = 0;
}

function nextIssueId(): string {
  issueCounter++;
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `UI-${date}-${String(issueCounter).padStart(3, "0")}`;
}

/**
 * Analyze diagnostics and generate issues
 */
export function analyzePageDiagnostics(
  diagnostics: PageDiagnostics,
  thresholds: DetectionThresholds = DEFAULT_THRESHOLDS,
): PatrolIssue[] {
  const issues: PatrolIssue[] = [];
  const { url, viewport } = diagnostics;

  // Check for blank page
  if (diagnostics.dom.isBlank) {
    issues.push({
      id: nextIssueId(),
      url,
      viewport,
      category: "BLANK_PAGE",
      severity: "critical",
      title: "Blank or nearly empty page",
      description: `Page has only ${diagnostics.dom.nodeCount} DOM nodes and minimal text content`,
      evidence: `DOM nodes: ${diagnostics.dom.nodeCount}, visible text length: ${diagnostics.dom.visibleText.length}`,
    });
  }

  // Check console errors
  const consoleErrors = diagnostics.console.filter((c) => c.type === "error");
  for (const error of consoleErrors) {
    issues.push({
      id: nextIssueId(),
      url,
      viewport,
      category: "CONSOLE_ERROR",
      severity: "major",
      title: "Console error detected",
      description: error.text.substring(0, 500),
      evidence: `Source: ${error.url || "unknown"}:${error.lineNumber || "?"}`,
      codeHint: error.url,
    });
  }

  // Check network errors (only local/API requests)
  for (const netError of diagnostics.networkErrors) {
    const isLocal =
      netError.url.includes("localhost") ||
      netError.url.includes("127.0.0.1") ||
      netError.url.includes("host.docker.internal") ||
      netError.url.startsWith(diagnostics.url.split("/").slice(0, 3).join("/"));
    if (!isLocal) {
      continue;
    }
    const severity: IssueSeverity =
      netError.status >= 500 ? "critical" : "major";
    issues.push({
      id: nextIssueId(),
      url,
      viewport,
      category: "NETWORK_ERROR",
      severity,
      title: `API request failed: ${netError.status}`,
      description: `${netError.method} ${netError.url} returned ${netError.status}`,
      evidence: `Status: ${netError.status}, Type: ${netError.resourceType}`,
    });
  }

  // Check overflow issues
  for (const overflow of diagnostics.styles.overflowIssues) {
    issues.push({
      id: nextIssueId(),
      url,
      viewport,
      category: "OVERFLOW",
      severity: "minor",
      title: "Horizontal overflow detected",
      description: `Element ${overflow.selector} overflows by ${overflow.scrollWidth - overflow.clientWidth}px`,
      evidence: `scrollWidth: ${overflow.scrollWidth}, clientWidth: ${overflow.clientWidth}`,
    });
  }

  // Check forbidden patterns in visible text
  for (const pattern of thresholds.forbiddenPatterns) {
    const match = diagnostics.dom.visibleText.match(pattern);
    if (match) {
      issues.push({
        id: nextIssueId(),
        url,
        viewport,
        category: "FORBIDDEN_PATTERN",
        severity: "major",
        title: `Forbidden pattern found: "${match[0]}"`,
        description: `Page text contains "${match[0]}" which indicates raw/unprocessed data display`,
        evidence: getContextAround(
          diagnostics.dom.visibleText,
          match.index || 0,
          100,
        ),
      });
    }
  }

  // Check a11y issues
  if (diagnostics.a11y.missingAltTexts > 0) {
    issues.push({
      id: nextIssueId(),
      url,
      viewport,
      category: "A11Y",
      severity: "minor",
      title: `${diagnostics.a11y.missingAltTexts} images missing alt text`,
      description: "Images without alt text are inaccessible to screen readers",
      evidence: `Count: ${diagnostics.a11y.missingAltTexts}`,
    });
  }

  // Check performance
  if (diagnostics.loadTime > 10000) {
    issues.push({
      id: nextIssueId(),
      url,
      viewport,
      category: "PERFORMANCE",
      severity: "minor",
      title: "Slow page load",
      description: `Page took ${(diagnostics.loadTime / 1000).toFixed(1)}s to load`,
      evidence: `Load time: ${diagnostics.loadTime}ms`,
    });
  }

  return issues;
}

function getContextAround(text: string, index: number, radius: number): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  return `...${text.slice(start, end)}...`;
}

/**
 * Generate a full patrol report
 */
export function generateReport(
  allDiagnostics: PageDiagnostics[],
  allIssues: PatrolIssue[],
  startTime: number,
  config: { baseUrl: string; viewports: string[]; totalRoutes: number },
): PatrolReport {
  const bySeverity: Record<IssueSeverity, number> = {
    critical: 0,
    major: 0,
    minor: 0,
    info: 0,
  };
  const byCategory: Record<string, number> = {};

  for (const issue of allIssues) {
    bySeverity[issue.severity]++;
    byCategory[issue.category] = (byCategory[issue.category] || 0) + 1;
  }

  const pages = allDiagnostics.map((d) => {
    const pageIssues = allIssues.filter(
      (i) => i.url === d.url && i.viewport === d.viewport,
    );
    return {
      url: d.url,
      viewport: d.viewport,
      status: pageIssues.length === 0 ? ("pass" as const) : ("fail" as const),
      loadTime: d.loadTime,
      issueCount: pageIssues.length,
      screenshotPath: d.screenshotPath,
    };
  });

  return {
    timestamp: new Date().toISOString(),
    duration: Date.now() - startTime,
    config,
    summary: {
      totalPages: allDiagnostics.length,
      totalIssues: allIssues.length,
      bySeverity,
      byCategory,
      passedPages: pages.filter((p) => p.status === "pass").length,
      failedPages: pages.filter((p) => p.status === "fail").length,
    },
    issues: allIssues,
    pages,
  };
}

/**
 * Save report to disk
 */
export function saveReport(report: PatrolReport, outputDir: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(outputDir, `${timestamp}.json`);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  return reportPath;
}
