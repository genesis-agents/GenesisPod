/**
 * Policy Search Adapter
 *
 * Aggregates results from three U.S. policy data sources in parallel:
 *   - Federal Register (executive orders, regulations)
 *   - Congress.gov (legislation, bills)
 *   - White House News (statements, briefings)
 *
 * Uses ToolRegistry to execute each policy tool via the facade pattern.
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { CircuitBreakerService } from "@/modules/ai-engine/facade";
import { SessionLatencyTrackerService } from "@/modules/ai-engine/facade";
import { ToolRegistry, type ToolContext } from "@/modules/ai-engine/facade";
import { DataSourceType } from "@/modules/ai-app/topic-insights/shared/types/data-source.types";
import type { DataSourceResult } from "@/modules/ai-app/topic-insights/shared/types/data-source.types";
import type { AdapterSearchRequest } from "../types";
import { SearchAdapterBase } from "./base.adapter";
import { GlobalSourceThrottleService } from "../global-source-throttle.service";
import { subSourceThrottleKey } from "../throttle-key.util";

function makeToolContext(toolId: string): ToolContext {
  return {
    executionId: `topic-insights-${toolId}-${Date.now()}`,
    toolId,
    callerType: "orchestrator",
    createdAt: new Date(),
  };
}

/**
 * Policy sub-tool descriptors — table-driven so new policy sources can be
 * added without touching doSearch control flow. Each entry declares:
 *   toolId   — the ai-engine ToolRegistry id
 *   domain   — published-at / metadata origin
 *   destType — DataSourceType tag for fused results
 *   buildInput / parse — per-tool adaptation
 * Throttle bucket is derived as `${sourceId}.${toolId}` by subSourceThrottleKey.
 */
interface PolicySubTool {
  readonly toolId: string;
  readonly domain: string;
  readonly destType: DataSourceType;
  readonly buildInput: (
    query: string,
    perSource: number,
  ) => Record<string, unknown>;
  readonly parse: (data: Record<string, unknown>) => DataSourceResult[];
}

@Injectable()
export class PolicySearchAdapter extends SearchAdapterBase {
  protected readonly logger = new Logger(PolicySearchAdapter.name);

  readonly sourceId = "policy";
  readonly sourceType = DataSourceType.FEDERAL_REGISTER;
  readonly additionalTypes = [
    DataSourceType.CONGRESS,
    DataSourceType.WHITEHOUSE,
  ];
  readonly concurrency = 3;
  readonly defaultTimeoutMs = 15000;

  private readonly subTools: ReadonlyArray<PolicySubTool> = [
    {
      toolId: "federal-register",
      domain: "federalregister.gov",
      destType: DataSourceType.FEDERAL_REGISTER,
      buildInput: (query, n) => ({ query, maxResults: n }),
      parse: (data) => {
        if (!data["success"]) return [];
        const documents = (data["documents"] ?? []) as Array<
          Record<string, unknown>
        >;
        return documents.map((doc) => ({
          sourceType: DataSourceType.FEDERAL_REGISTER,
          title: String(doc["title"] ?? ""),
          url: String(doc["htmlUrl"] ?? ""),
          snippet: String(doc["abstract"] ?? ""),
          publishedAt: doc["publicationDate"]
            ? new Date(String(doc["publicationDate"]))
            : undefined,
          domain: "federalregister.gov",
          metadata: {
            documentNumber: doc["documentNumber"],
            documentType: doc["type"],
            agencies: doc["agencies"],
          },
        }));
      },
    },
    {
      toolId: "congress-gov",
      domain: "congress.gov",
      destType: DataSourceType.CONGRESS,
      buildInput: (query, n) => ({ query, limit: n }),
      parse: (data) => {
        if (!data["success"]) return [];
        const bills = (data["bills"] ?? []) as Array<Record<string, unknown>>;
        return bills.map((bill) => {
          const latestAction = bill["latestAction"] as
            | Record<string, unknown>
            | undefined;
          return {
            sourceType: DataSourceType.CONGRESS,
            title: String(bill["shortTitle"] ?? bill["title"] ?? ""),
            url: String(bill["url"] ?? ""),
            snippet: String(latestAction?.["text"] ?? bill["title"] ?? ""),
            publishedAt: bill["introducedDate"]
              ? new Date(String(bill["introducedDate"]))
              : undefined,
            domain: "congress.gov",
            metadata: {
              billNumber: bill["number"],
              billType: bill["type"],
              congress: bill["congress"],
              policyArea: bill["policyArea"],
              latestActionDate: latestAction?.["actionDate"],
            },
          };
        });
      },
    },
    {
      toolId: "whitehouse-news",
      domain: "whitehouse.gov",
      destType: DataSourceType.WHITEHOUSE,
      buildInput: (query, n) => ({ query, limit: n }),
      parse: (data) => {
        if (!data["success"]) return [];
        const items = (data["items"] ?? []) as Array<Record<string, unknown>>;
        return items.map((item) => ({
          sourceType: DataSourceType.WHITEHOUSE,
          title: String(item["title"] ?? ""),
          url: String(item["url"] ?? ""),
          snippet: String(item["summary"] ?? ""),
          publishedAt: item["date"]
            ? new Date(String(item["date"]))
            : undefined,
          domain: "whitehouse.gov",
          metadata: { contentType: item["type"] },
        }));
      },
    },
  ];

  constructor(
    private readonly toolRegistry: ToolRegistry,
    @Optional() private readonly throttle?: GlobalSourceThrottleService,
    @Optional() circuitBreaker?: CircuitBreakerService,
    @Optional() latencyTracker?: SessionLatencyTrackerService,
  ) {
    super(circuitBreaker, latencyTracker);
  }

  protected async doSearch(
    request: AdapterSearchRequest,
  ): Promise<DataSourceResult[]> {
    const { query, maxResults } = request;
    const perSource = Math.ceil(maxResults / this.subTools.length);

    // F-5 · 每个子工具走独立 throttle bucket（key 由 subSourceThrottleKey 派生：
    //   `${sourceId}.${toolId}` — policy.federal-register / policy.congress-gov / ...)
    // 防止 4 维并行时 12 请求同时打上游 API 触发 429（生产事故 16:04:01）。
    const runSubTool = (sub: PolicySubTool) => {
      const throttleKey = subSourceThrottleKey(this.sourceId, sub.toolId);
      const invoke = () =>
        this.executePolicyTool(sub.toolId, sub.buildInput(query, perSource));
      return this.throttle
        ? this.throttle.execute(throttleKey, invoke, request.signal)
        : invoke();
    };

    const settled = await Promise.allSettled(
      this.subTools.map((sub) => runSubTool(sub)),
    );

    const results: DataSourceResult[] = [];
    settled.forEach((outcome, idx) => {
      const sub = this.subTools[idx];
      if (outcome.status === "rejected") {
        this.logger.warn(`[doSearch] ${sub.toolId} failed: ${outcome.reason}`);
        return;
      }
      if (!outcome.value) return;
      const data = outcome.value as Record<string, unknown>;
      results.push(...sub.parse(data));
    });

    return results;
  }

  /**
   * Execute a policy tool via ToolRegistry.
   * Returns the tool's raw result data, or null if tool is not registered.
   */
  private async executePolicyTool(
    toolId: string,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const tool = this.toolRegistry.tryGet(toolId);
    if (!tool) {
      this.logger.warn(`[executePolicyTool] ${toolId} not registered`);
      return null;
    }

    const context = makeToolContext(toolId);
    const result = await tool.execute(input, context);

    if (!result.success || !result.data) {
      this.logger.warn(
        `[executePolicyTool] ${toolId} returned success=${result.success}`,
      );
      return null;
    }

    return result.data;
  }
}
