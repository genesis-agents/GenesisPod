import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";

/**
 * Task completion types to distinguish between different failure modes
 */
export enum TaskCompletionType {
  SUCCESS = "SUCCESS", // Content generated successfully
  API_ERROR = "API_ERROR", // API call failed (network, server error)
  RATE_LIMITED = "RATE_LIMITED", // Rate limit exceeded
  TIMEOUT = "TIMEOUT", // Request timed out
  CONTENT_ERROR = "CONTENT_ERROR", // Content quality issue
  CONTEXT_OVERFLOW = "CONTEXT_OVERFLOW", // Context too large (non-retryable)
  AUTH_ERROR = "AUTH_ERROR", // Authentication/authorization error (non-retryable)
}

/**
 * Task execution result with type information
 */
export interface TaskResult {
  type: TaskCompletionType;
  content?: string;
  error?: string;
  retryable: boolean;
}

/**
 * Circuit breaker state for an agent
 */
interface AgentCircuitBreaker {
  agentId: string;
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  failureCount: number;
  successCount: number;
  lastFailureTime: Date | null;
  lastSuccessTime: Date | null;
  cooldownUntil: Date | null;
  rateLimitCount: number;
  lastRateLimitTime: Date | null;
  lastActivityTime: Date; // 新增：用于 TTL 清理
}

/**
 * Agent health metrics for load balancing
 */
export interface AgentHealthMetrics {
  agentId: string;
  successRate: number;
  avgResponseTime: number;
  rateLimitHits: number;
  currentLoad: number;
  isAvailable: boolean;
  cooldownRemaining: number; // milliseconds
}

/**
 * Circuit Breaker Service for Agent Health Management
 *
 * This service implements the circuit breaker pattern to:
 * 1. Track agent health and failure rates
 * 2. Automatically disable failing agents (circuit OPEN)
 * 3. Implement cooldown periods for rate-limited agents
 * 4. Provide health metrics for intelligent load balancing
 */
@Injectable()
export class AgentCircuitBreakerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AgentCircuitBreakerService.name);

  // Circuit breaker state for each agent
  private readonly breakers = new Map<string, AgentCircuitBreaker>();

  // Response time tracking (sliding window)
  private readonly responseTimes = new Map<string, number[]>();
  private readonly MAX_RESPONSE_SAMPLES = 20;

  // Current task load per agent
  private readonly currentLoad = new Map<string, number>();

  // Cleanup scheduler
  private cleanupInterval: NodeJS.Timeout | null = null;

  // ==================== Configuration ====================

  // Number of consecutive failures to trigger circuit open
  private readonly FAILURE_THRESHOLD = 3;

  // Default cooldown period (3 minutes - reduced for better UX)
  private readonly DEFAULT_COOLDOWN_MS = 3 * 60 * 1000;

  // Rate limit cooldown (5 minutes - reduced from 10 for better responsiveness)
  // ★ 用户反馈：原来 10 分钟太长，Agent 故障后等待太久
  private readonly RATE_LIMIT_COOLDOWN_MS = 5 * 60 * 1000;

  // Half-open state: allow one test request after cooldown
  private readonly HALF_OPEN_SUCCESS_THRESHOLD = 2;

  // TTL for inactive breakers (24 hours)
  // Breakers without activity for this duration will be cleaned up
  private readonly INACTIVE_TTL_MS = 24 * 60 * 60 * 1000;

  // Cleanup interval (1 hour)
  private readonly CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

  // ==================== Lifecycle Hooks ====================

  onModuleInit(): void {
    this.logger.log(
      `[CircuitBreaker] Initializing with TTL=${this.INACTIVE_TTL_MS}ms, cleanup interval=${this.CLEANUP_INTERVAL_MS}ms`,
    );
    this.startCleanupScheduler();
  }

  onModuleDestroy(): void {
    this.logger.log(`[CircuitBreaker] Shutting down`);
    this.stopCleanupScheduler();
  }

  // ==================== Public Methods ====================

  /**
   * Check if an agent is available for task execution
   */
  canExecute(agentId: string): boolean {
    const breaker = this.breakers.get(agentId);

    if (!breaker) {
      return true; // New agent, allow execution
    }

    if (breaker.state === "CLOSED") {
      return true;
    }

    if (breaker.state === "OPEN") {
      // Check if cooldown has expired
      if (
        breaker.cooldownUntil &&
        Date.now() > breaker.cooldownUntil.getTime()
      ) {
        // Transition to half-open state
        breaker.state = "HALF_OPEN";
        breaker.successCount = 0;
        this.logger.log(
          `[CircuitBreaker] Agent ${agentId} transitioning to HALF_OPEN state`,
        );
        return true; // Allow one test request
      }
      return false;
    }

    // HALF_OPEN state: allow limited requests
    return true;
  }

  /**
   * Get cooldown remaining time in milliseconds
   */
  getCooldownRemaining(agentId: string): number {
    const breaker = this.breakers.get(agentId);
    if (!breaker || !breaker.cooldownUntil) {
      return 0;
    }
    return Math.max(0, breaker.cooldownUntil.getTime() - Date.now());
  }

  /**
   * Record a successful task execution
   */
  recordSuccess(agentId: string, responseTimeMs: number): void {
    const breaker = this.getOrCreate(agentId);

    breaker.failureCount = 0;
    breaker.successCount++;
    breaker.lastSuccessTime = new Date();

    // Record response time
    this.recordResponseTime(agentId, responseTimeMs);

    // Transition from HALF_OPEN to CLOSED if enough successes
    if (breaker.state === "HALF_OPEN") {
      if (breaker.successCount >= this.HALF_OPEN_SUCCESS_THRESHOLD) {
        breaker.state = "CLOSED";
        breaker.cooldownUntil = null;
        this.logger.log(
          `[CircuitBreaker] Agent ${agentId} circuit CLOSED after ${breaker.successCount} successful requests`,
        );
      }
    }

    this.breakers.set(agentId, breaker);
  }

  /**
   * Record a failed task execution
   */
  recordFailure(
    agentId: string,
    errorType: TaskCompletionType,
    errorMsg?: string,
  ): void {
    const breaker = this.getOrCreate(agentId);

    breaker.failureCount++;
    breaker.lastFailureTime = new Date();

    // Rate limit: immediate circuit open with longer cooldown
    if (errorType === TaskCompletionType.RATE_LIMITED) {
      breaker.rateLimitCount++;
      breaker.lastRateLimitTime = new Date();
      breaker.state = "OPEN";
      breaker.cooldownUntil = new Date(
        Date.now() + this.RATE_LIMIT_COOLDOWN_MS,
      );
      this.logger.warn(
        `[CircuitBreaker] Agent ${agentId} RATE LIMITED (${breaker.rateLimitCount} times), circuit OPEN for 10 minutes. Error: ${errorMsg}`,
      );
      this.breakers.set(agentId, breaker);
      return;
    }

    // Non-retryable errors: immediate circuit open
    if (
      errorType === TaskCompletionType.CONTEXT_OVERFLOW ||
      errorType === TaskCompletionType.AUTH_ERROR
    ) {
      breaker.state = "OPEN";
      breaker.cooldownUntil = new Date(
        Date.now() + this.DEFAULT_COOLDOWN_MS * 2,
      ); // Longer cooldown for non-retryable
      this.logger.warn(
        `[CircuitBreaker] Agent ${agentId} non-retryable error (${errorType}), circuit OPEN. Error: ${errorMsg}`,
      );
      this.breakers.set(agentId, breaker);
      return;
    }

    // Other errors: check threshold
    if (breaker.failureCount >= this.FAILURE_THRESHOLD) {
      breaker.state = "OPEN";
      breaker.cooldownUntil = new Date(Date.now() + this.DEFAULT_COOLDOWN_MS);
      this.logger.warn(
        `[CircuitBreaker] Agent ${agentId} failed ${breaker.failureCount} times consecutively, circuit OPEN for 5 minutes. Error: ${errorMsg}`,
      );
    }

    // In HALF_OPEN state, any failure should re-open the circuit
    if (breaker.state === "HALF_OPEN") {
      breaker.state = "OPEN";
      breaker.cooldownUntil = new Date(Date.now() + this.DEFAULT_COOLDOWN_MS);
      this.logger.warn(
        `[CircuitBreaker] Agent ${agentId} failed in HALF_OPEN state, circuit re-OPENED`,
      );
    }

    this.breakers.set(agentId, breaker);
  }

  /**
   * Increment current load for an agent (when task starts)
   */
  incrementLoad(agentId: string): void {
    const current = this.currentLoad.get(agentId) || 0;
    this.currentLoad.set(agentId, current + 1);
  }

  /**
   * Decrement current load for an agent (when task completes)
   */
  decrementLoad(agentId: string): void {
    const current = this.currentLoad.get(agentId) || 0;
    this.currentLoad.set(agentId, Math.max(0, current - 1));
  }

  /**
   * Get health metrics for an agent
   */
  getHealthMetrics(agentId: string): AgentHealthMetrics {
    const breaker = this.breakers.get(agentId);
    const responseTimes = this.responseTimes.get(agentId) || [];
    const load = this.currentLoad.get(agentId) || 0;

    if (!breaker) {
      return {
        agentId,
        successRate: 1.0,
        avgResponseTime: 0,
        rateLimitHits: 0,
        currentLoad: load,
        isAvailable: true,
        cooldownRemaining: 0,
      };
    }

    // Calculate success rate (simple ratio based on recent state)
    const totalAttempts = breaker.failureCount + breaker.successCount;
    const successRate =
      totalAttempts > 0 ? breaker.successCount / totalAttempts : 1.0;

    // Calculate average response time
    const avgResponseTime =
      responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 0;

    return {
      agentId,
      successRate,
      avgResponseTime,
      rateLimitHits: breaker.rateLimitCount,
      currentLoad: load,
      isAvailable: this.canExecute(agentId),
      cooldownRemaining: this.getCooldownRemaining(agentId),
    };
  }

  /**
   * Get all agent health metrics
   */
  getAllHealthMetrics(): AgentHealthMetrics[] {
    const metrics: AgentHealthMetrics[] = [];
    for (const agentId of this.breakers.keys()) {
      metrics.push(this.getHealthMetrics(agentId));
    }
    return metrics;
  }

  /**
   * Select the best available agent from a list
   * Considers: availability, success rate, current load, response time
   */
  selectBestAgent(agentIds: string[]): string | null {
    const availableAgents = agentIds.filter((id) => this.canExecute(id));

    if (availableAgents.length === 0) {
      this.logger.warn(
        `[CircuitBreaker] No available agents from ${agentIds.length} candidates`,
      );
      return null;
    }

    // Score each agent (higher is better)
    const scored = availableAgents.map((agentId) => {
      const metrics = this.getHealthMetrics(agentId);
      // Score = successRate * loadFactor * (1 - normalized response time)
      const loadFactor = Math.max(0.1, 1 - metrics.currentLoad / 10);
      const score = metrics.successRate * loadFactor;
      return { agentId, score, metrics };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    this.logger.debug(
      `[CircuitBreaker] Agent selection scores: ${scored.map((s) => `${s.agentId}:${s.score.toFixed(2)}`).join(", ")}`,
    );

    return scored[0].agentId;
  }

  /**
   * Parse error message to determine TaskCompletionType
   */
  parseErrorType(errorMsg: string): TaskCompletionType {
    if (!errorMsg) return TaskCompletionType.API_ERROR;

    const lowerMsg = errorMsg.toLowerCase();

    // Rate limit patterns
    if (
      lowerMsg.includes("rate limit") ||
      lowerMsg.includes("rate_limit") ||
      lowerMsg.includes("too many requests") ||
      lowerMsg.includes("429") ||
      lowerMsg.includes("quota exceeded")
    ) {
      return TaskCompletionType.RATE_LIMITED;
    }

    // Timeout patterns
    if (
      lowerMsg.includes("timeout") ||
      lowerMsg.includes("timed out") ||
      lowerMsg.includes("etimedout")
    ) {
      return TaskCompletionType.TIMEOUT;
    }

    // Context overflow (non-retryable)
    if (
      lowerMsg.includes("context") ||
      lowerMsg.includes("token limit") ||
      lowerMsg.includes("too large") ||
      lowerMsg.includes("maximum context")
    ) {
      return TaskCompletionType.CONTEXT_OVERFLOW;
    }

    // Auth errors (non-retryable)
    if (
      lowerMsg.includes("authentication") ||
      lowerMsg.includes("authorization") ||
      lowerMsg.includes("invalid api key") ||
      lowerMsg.includes("401") ||
      lowerMsg.includes("403")
    ) {
      return TaskCompletionType.AUTH_ERROR;
    }

    return TaskCompletionType.API_ERROR;
  }

  /**
   * Reset circuit breaker for an agent (admin action)
   */
  resetCircuit(agentId: string): void {
    this.breakers.delete(agentId);
    this.responseTimes.delete(agentId);
    this.currentLoad.delete(agentId);
    this.logger.log(`[CircuitBreaker] Reset circuit for agent ${agentId}`);
  }

  /**
   * Reset all circuit breakers (admin action)
   */
  resetAll(): void {
    this.breakers.clear();
    this.responseTimes.clear();
    this.currentLoad.clear();
    this.logger.log(`[CircuitBreaker] Reset all circuits`);
  }

  // ==================== Private Methods ====================

  private getOrCreate(agentId: string): AgentCircuitBreaker {
    let breaker = this.breakers.get(agentId);
    if (!breaker) {
      breaker = {
        agentId,
        state: "CLOSED",
        failureCount: 0,
        successCount: 0,
        lastFailureTime: null,
        lastSuccessTime: null,
        cooldownUntil: null,
        rateLimitCount: 0,
        lastRateLimitTime: null,
        lastActivityTime: new Date(),
      };
      this.breakers.set(agentId, breaker);
    }
    // Update lastActivityTime on every access
    breaker.lastActivityTime = new Date();
    return breaker;
  }

  private recordResponseTime(agentId: string, timeMs: number): void {
    let times = this.responseTimes.get(agentId);
    if (!times) {
      times = [];
      this.responseTimes.set(agentId, times);
    }

    times.push(timeMs);

    // Keep only the last N samples
    if (times.length > this.MAX_RESPONSE_SAMPLES) {
      times.shift();
    }
  }

  // ==================== Cleanup Methods ====================

  /**
   * Start the cleanup scheduler
   */
  private startCleanupScheduler(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveBreakers();
    }, this.CLEANUP_INTERVAL_MS);

    this.logger.log(
      `[CircuitBreaker] Cleanup scheduler started (interval: ${this.CLEANUP_INTERVAL_MS}ms)`,
    );
  }

  /**
   * Stop the cleanup scheduler
   */
  private stopCleanupScheduler(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      this.logger.log(`[CircuitBreaker] Cleanup scheduler stopped`);
    }
  }

  /**
   * Clean up breakers that have been inactive for too long
   */
  private cleanupInactiveBreakers(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [agentId, breaker] of this.breakers) {
      const inactiveTime = now - breaker.lastActivityTime.getTime();
      if (inactiveTime > this.INACTIVE_TTL_MS) {
        this.breakers.delete(agentId);
        this.responseTimes.delete(agentId);
        this.currentLoad.delete(agentId);
        cleanedCount++;
        this.logger.log(
          `[CircuitBreaker] Cleaned inactive breaker: ${agentId} (inactive for ${Math.round(inactiveTime / 1000 / 60 / 60)}h)`,
        );
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(
        `[CircuitBreaker] Cleanup completed: removed ${cleanedCount} inactive breakers. Remaining: ${this.breakers.size}`,
      );
    }
  }

  /**
   * Get cleanup statistics (for admin/debugging)
   */
  getCleanupStats(): {
    totalBreakers: number;
    oldestBreakerAge: number | null;
    nextCleanupIn: number;
  } {
    const now = Date.now();
    let oldestAge: number | null = null;

    for (const breaker of this.breakers.values()) {
      const age = now - breaker.lastActivityTime.getTime();
      if (oldestAge === null || age > oldestAge) {
        oldestAge = age;
      }
    }

    return {
      totalBreakers: this.breakers.size,
      oldestBreakerAge: oldestAge,
      nextCleanupIn: this.CLEANUP_INTERVAL_MS, // Simplified, actual time would require tracking last cleanup
    };
  }

  /**
   * Force cleanup (admin action)
   */
  forceCleanup(): { before: number; after: number } {
    const before = this.breakers.size;
    this.cleanupInactiveBreakers();
    const after = this.breakers.size;
    return { before, after };
  }
}
