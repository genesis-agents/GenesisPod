/**
 * Execution Metrics Collector Tests
 */

import {
  ExecutionMetricsCollector,
  ToolExecutionRecord,
  AgentExecutionRecord,
} from "../execution/execution-metrics";
import { ToolType, AgentType } from "../agent/agent.types";

describe("ExecutionMetricsCollector", () => {
  let collector: ExecutionMetricsCollector;

  beforeEach(() => {
    collector = new ExecutionMetricsCollector();
  });

  describe("recordToolExecution", () => {
    it("should record tool execution", () => {
      const record: ToolExecutionRecord = {
        tool: ToolType.WEB_SEARCH,
        taskId: "task-1",
        startTime: new Date(),
        endTime: new Date(),
        duration: 1000,
        success: true,
        retries: 0,
      };

      collector.recordToolExecution(record);

      const stats = collector.getToolStats(ToolType.WEB_SEARCH);
      expect(stats.totalCalls).toBe(1);
      expect(stats.successCount).toBe(1);
    });

    it("should record failed execution", () => {
      const record: ToolExecutionRecord = {
        tool: ToolType.WEB_SCRAPER,
        taskId: "task-2",
        startTime: new Date(),
        endTime: new Date(),
        duration: 500,
        success: false,
        error: "Connection failed",
        retries: 2,
      };

      collector.recordToolExecution(record);

      const stats = collector.getToolStats(ToolType.WEB_SCRAPER);
      expect(stats.totalCalls).toBe(1);
      expect(stats.failureCount).toBe(1);
      expect(stats.totalRetries).toBe(2);
    });
  });

  describe("getToolStats", () => {
    beforeEach(() => {
      // 添加多条记录
      const durations = [100, 200, 300, 400, 500];
      durations.forEach((duration, i) => {
        collector.recordToolExecution({
          tool: ToolType.TEXT_GENERATION,
          taskId: `task-${i}`,
          startTime: new Date(),
          endTime: new Date(),
          duration,
          success: i < 4, // 前4个成功，最后1个失败
          retries: i === 4 ? 1 : 0,
        });
      });
    });

    it("should calculate correct statistics", () => {
      const stats = collector.getToolStats(ToolType.TEXT_GENERATION);

      expect(stats.totalCalls).toBe(5);
      expect(stats.successCount).toBe(4);
      expect(stats.failureCount).toBe(1);
      expect(stats.successRate).toBe(0.8);
    });

    it("should calculate correct duration metrics", () => {
      const stats = collector.getToolStats(ToolType.TEXT_GENERATION);

      expect(stats.minDuration).toBe(100);
      expect(stats.maxDuration).toBe(500);
      expect(stats.avgDuration).toBe(300);
    });

    it("should calculate percentiles", () => {
      const stats = collector.getToolStats(ToolType.TEXT_GENERATION);

      expect(stats.p50Duration).toBe(300);
      expect(stats.p95Duration).toBe(500);
      expect(stats.p99Duration).toBe(500);
    });

    it("should return zero stats for unknown tool", () => {
      const stats = collector.getToolStats(ToolType.IMAGE_GENERATION);

      expect(stats.totalCalls).toBe(0);
      expect(stats.successRate).toBe(0);
    });
  });

  describe("recordAgentExecution", () => {
    it("should record agent execution", () => {
      const record: AgentExecutionRecord = {
        agent: AgentType.DOCS,
        taskId: "agent-task-1",
        startTime: new Date(),
        endTime: new Date(),
        duration: 5000,
        success: true,
        toolCalls: 3,
        tokensUsed: 1000,
        iterations: 2,
      };

      collector.recordAgentExecution(record);

      const metrics = collector.getSystemMetrics();
      expect(metrics.totalTasks).toBe(1);
      expect(metrics.successfulTasks).toBe(1);
      expect(metrics.totalTokensUsed).toBe(1000);
    });
  });

  describe("getSystemMetrics", () => {
    beforeEach(() => {
      // 添加 Agent 记录
      collector.recordAgentExecution({
        agent: AgentType.SLIDES,
        taskId: "task-1",
        startTime: new Date(),
        endTime: new Date(),
        duration: 3000,
        success: true,
        toolCalls: 5,
        tokensUsed: 500,
        iterations: 3,
      });

      collector.recordAgentExecution({
        agent: AgentType.DOCS,
        taskId: "task-2",
        startTime: new Date(),
        endTime: new Date(),
        duration: 2000,
        success: false,
        toolCalls: 2,
        tokensUsed: 200,
        iterations: 1,
      });

      // 添加工具记录
      collector.recordToolExecution({
        tool: ToolType.WEB_SEARCH,
        taskId: "task-1",
        startTime: new Date(),
        endTime: new Date(),
        duration: 500,
        success: true,
        retries: 0,
      });
    });

    it("should return correct system metrics", () => {
      const metrics = collector.getSystemMetrics();

      expect(metrics.totalTasks).toBe(2);
      expect(metrics.successfulTasks).toBe(1);
      expect(metrics.failedTasks).toBe(1);
      expect(metrics.totalToolCalls).toBe(1);
      expect(metrics.totalTokensUsed).toBe(700);
      expect(metrics.avgTaskDuration).toBe(2500);
      expect(metrics.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getRecentErrors", () => {
    it("should return recent failed executions", () => {
      // 添加失败记录
      for (let i = 0; i < 15; i++) {
        collector.recordToolExecution({
          tool: ToolType.WEB_SEARCH,
          taskId: `task-${i}`,
          startTime: new Date(),
          endTime: new Date(),
          duration: 100,
          success: false,
          error: `Error ${i}`,
          retries: 0,
        });
      }

      const errors = collector.getRecentErrors(10);

      expect(errors).toHaveLength(10);
      // 应该是最近的错误（倒序）
      expect(errors[0].error).toBe("Error 14");
      expect(errors[9].error).toBe("Error 5");
    });

    it("should return all errors if less than limit", () => {
      collector.recordToolExecution({
        tool: ToolType.WEB_SEARCH,
        taskId: "task-1",
        startTime: new Date(),
        endTime: new Date(),
        duration: 100,
        success: false,
        error: "Error 1",
        retries: 0,
      });

      const errors = collector.getRecentErrors(10);
      expect(errors).toHaveLength(1);
    });
  });

  describe("getSlowestTools", () => {
    beforeEach(() => {
      // 添加不同工具的记录
      [
        { tool: ToolType.WEB_SEARCH, duration: 1000 },
        { tool: ToolType.TEXT_GENERATION, duration: 3000 },
        { tool: ToolType.IMAGE_GENERATION, duration: 5000 },
        { tool: ToolType.CODE_GENERATION, duration: 2000 },
      ].forEach(({ tool, duration }) => {
        collector.recordToolExecution({
          tool,
          taskId: "task-1",
          startTime: new Date(),
          endTime: new Date(),
          duration,
          success: true,
          retries: 0,
        });
      });
    });

    it("should return tools sorted by average duration", () => {
      const slowest = collector.getSlowestTools(3);

      expect(slowest).toHaveLength(3);
      expect(slowest[0].tool).toBe(ToolType.IMAGE_GENERATION);
      expect(slowest[1].tool).toBe(ToolType.TEXT_GENERATION);
      expect(slowest[2].tool).toBe(ToolType.CODE_GENERATION);
    });
  });

  describe("getMostFailingTools", () => {
    beforeEach(() => {
      // 添加不同失败率的工具记录
      // Tool A: 2/4 failures = 50%
      for (let i = 0; i < 4; i++) {
        collector.recordToolExecution({
          tool: ToolType.WEB_SEARCH,
          taskId: `task-${i}`,
          startTime: new Date(),
          endTime: new Date(),
          duration: 100,
          success: i < 2,
          retries: 0,
        });
      }

      // Tool B: 1/4 failures = 25%
      for (let i = 0; i < 4; i++) {
        collector.recordToolExecution({
          tool: ToolType.TEXT_GENERATION,
          taskId: `task-${i}`,
          startTime: new Date(),
          endTime: new Date(),
          duration: 100,
          success: i < 3,
          retries: 0,
        });
      }
    });

    it("should return tools sorted by failure rate", () => {
      const failing = collector.getMostFailingTools(2);

      expect(failing).toHaveLength(2);
      expect(failing[0].tool).toBe(ToolType.WEB_SEARCH);
      expect(failing[0].successRate).toBe(0.5);
    });
  });

  describe("clear", () => {
    it("should clear all records", () => {
      collector.recordToolExecution({
        tool: ToolType.WEB_SEARCH,
        taskId: "task-1",
        startTime: new Date(),
        endTime: new Date(),
        duration: 100,
        success: true,
        retries: 0,
      });

      collector.recordAgentExecution({
        agent: AgentType.DOCS,
        taskId: "task-1",
        startTime: new Date(),
        endTime: new Date(),
        duration: 1000,
        success: true,
        toolCalls: 1,
        tokensUsed: 100,
        iterations: 1,
      });

      collector.clear();

      const metrics = collector.getSystemMetrics();
      expect(metrics.totalTasks).toBe(0);
      expect(metrics.totalToolCalls).toBe(0);
    });
  });

  describe("exportMetrics", () => {
    it("should export all metrics data", () => {
      collector.recordToolExecution({
        tool: ToolType.WEB_SEARCH,
        taskId: "task-1",
        startTime: new Date(),
        endTime: new Date(),
        duration: 100,
        success: true,
        retries: 0,
      });

      const exported = collector.exportMetrics();

      expect(exported.systemMetrics).toBeDefined();
      expect(exported.toolStats).toBeDefined();
      expect(exported.recentErrors).toBeDefined();
      expect(exported.toolRecords).toHaveLength(1);
      expect(exported.agentRecords).toHaveLength(0);
    });
  });
});
