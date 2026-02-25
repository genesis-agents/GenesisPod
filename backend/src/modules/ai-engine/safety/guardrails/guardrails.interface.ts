/**
 * AI Engine - Guardrails Interface
 * 护栏系统接口定义
 */

/**
 * Guardrail check result
 */
export interface GuardrailResult {
  /**
   * Whether the check passed
   */
  passed: boolean;

  /**
   * Guardrail identifier
   */
  guardrailId: string;

  /**
   * Result message
   */
  message?: string;

  /**
   * Severity level
   */
  severity: "info" | "warning" | "error" | "block";

  /**
   * Additional metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Input guardrail interface
 */
export interface IInputGuardrail {
  /**
   * Unique guardrail identifier
   */
  readonly id: string;

  /**
   * Human-readable name
   */
  readonly name: string;

  /**
   * Whether this guardrail is enabled
   */
  readonly enabled: boolean;

  /**
   * Check input against this guardrail
   */
  check(input: GuardrailInput): Promise<GuardrailResult>;
}

/**
 * Output guardrail interface
 */
export interface IOutputGuardrail {
  /**
   * Unique guardrail identifier
   */
  readonly id: string;

  /**
   * Human-readable name
   */
  readonly name: string;

  /**
   * Whether this guardrail is enabled
   */
  readonly enabled: boolean;

  /**
   * Check output against this guardrail
   */
  check(output: GuardrailOutput): Promise<GuardrailResult>;
}

/**
 * Guardrail input
 */
export interface GuardrailInput {
  /**
   * Input content to validate
   */
  content: string;

  /**
   * User ID (optional)
   */
  userId?: string;

  /**
   * Additional context
   */
  context?: Record<string, unknown>;
}

/**
 * Guardrail output
 */
export interface GuardrailOutput {
  /**
   * Output content to validate
   */
  content: string;

  /**
   * Model ID that generated this output (optional)
   */
  modelId?: string;

  /**
   * Additional context
   */
  context?: Record<string, unknown>;
}

/**
 * Guardrails pipeline result
 */
export interface GuardrailsPipelineResult {
  /**
   * Whether all guardrails passed
   */
  passed: boolean;

  /**
   * Individual guardrail results
   */
  results: GuardrailResult[];

  /**
   * ID of guardrail that blocked (if any)
   */
  blockedBy?: string;
}
