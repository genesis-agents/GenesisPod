/**
 * AI Engine - Guardrails Pipeline Service
 * 护栏管道服务
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import {
  IInputGuardrail,
  IOutputGuardrail,
  GuardrailInput,
  GuardrailOutput,
  GuardrailsPipelineResult,
  GuardrailResult,
} from "./guardrails.interface";

/**
 * Guardrails Pipeline Service
 * Runs input/output through registered guardrails
 */
@Injectable()
export class GuardrailsPipelineService {
  private readonly logger = new Logger(GuardrailsPipelineService.name);
  private inputGuardrails: IInputGuardrail[] = [];
  private outputGuardrails: IOutputGuardrail[] = [];

  /** B (2026-05-05): SAFETY_INPUT/OUTPUT plugin hook seam */
  constructor(
    @Optional()
    private readonly hookBus?: import("@/plugins/core/hook-bus").HookBus,
  ) {}

  /**
   * Register an input guardrail
   */
  registerInputGuardrail(guardrail: IInputGuardrail): void {
    this.logger.log(
      `Registering input guardrail: ${guardrail.id} (${guardrail.name})`,
    );
    this.inputGuardrails.push(guardrail);
  }

  /**
   * Register an output guardrail
   */
  registerOutputGuardrail(guardrail: IOutputGuardrail): void {
    this.logger.log(
      `Registering output guardrail: ${guardrail.id} (${guardrail.name})`,
    );
    this.outputGuardrails.push(guardrail);
  }

  /**
   * Process input through all registered input guardrails
   * Short-circuits on 'block' severity
   */
  async processInput(input: GuardrailInput): Promise<GuardrailsPipelineResult> {
    // B (2026-05-05): SAFETY_INPUT plugin hook fire-and-forget（PII/审核 plugin 用）
    // ★ 全覆盖审计修 (2026-05-06): hook 失败必须可见，改 warn 而非吞错
    if (this.hookBus) {
      void this.hookBus
        .fire(
          "engine.safety.input",
          {
            text: typeof input === "string" ? input : JSON.stringify(input),
            source: "user" as const,
          },
          async () => undefined,
        )
        .catch((err) =>
          this.logger.warn("[safety hook] input hook error", err),
        );
    }
    const results: GuardrailResult[] = [];
    let blockedBy: string | undefined;

    for (const guardrail of this.inputGuardrails) {
      // Skip disabled guardrails
      if (!guardrail.enabled) {
        this.logger.debug(`Skipping disabled input guardrail: ${guardrail.id}`);
        continue;
      }

      try {
        const result = await guardrail.check(input);
        results.push(result);

        // Short-circuit on 'block' severity
        if (result.severity === "block" && !result.passed) {
          blockedBy = guardrail.id;
          this.logger.warn(
            `Input blocked by guardrail: ${guardrail.id} - ${result.message}`,
          );
          break;
        }

        // Log non-passing results
        if (!result.passed) {
          this.logger.warn(
            `Input guardrail ${guardrail.id} failed with severity ${result.severity}: ${result.message}`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Error running input guardrail ${guardrail.id}: ${error instanceof Error ? error.message : error}`,
        );
        // Continue with other guardrails on error
        results.push({
          passed: false,
          guardrailId: guardrail.id,
          severity: "error",
          message: `Guardrail execution error: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }

    const passed =
      !blockedBy &&
      results.every(
        (r) => r.passed || r.severity === "info" || r.severity === "warning",
      );

    return {
      passed,
      results,
      blockedBy,
    };
  }

  /**
   * Process output through all registered output guardrails
   * Short-circuits on 'block' severity
   */
  async processOutput(
    output: GuardrailOutput,
  ): Promise<GuardrailsPipelineResult> {
    // B (2026-05-05): SAFETY_OUTPUT plugin hook fire-and-forget
    // ★ 全覆盖审计修 (2026-05-06): hook 失败必须可见，改 warn 而非吞错
    if (this.hookBus) {
      void this.hookBus
        .fire(
          "engine.safety.output",
          {
            text: typeof output === "string" ? output : JSON.stringify(output),
            producedBy: "agent",
          },
          async () => undefined,
        )
        .catch((err) =>
          this.logger.warn("[safety hook] output hook error", err),
        );
    }
    const results: GuardrailResult[] = [];
    let blockedBy: string | undefined;

    for (const guardrail of this.outputGuardrails) {
      // Skip disabled guardrails
      if (!guardrail.enabled) {
        this.logger.debug(
          `Skipping disabled output guardrail: ${guardrail.id}`,
        );
        continue;
      }

      try {
        const result = await guardrail.check(output);
        results.push(result);

        // Short-circuit on 'block' severity
        if (result.severity === "block" && !result.passed) {
          blockedBy = guardrail.id;
          this.logger.warn(
            `Output blocked by guardrail: ${guardrail.id} - ${result.message}`,
          );
          break;
        }

        // Log non-passing results
        if (!result.passed) {
          this.logger.warn(
            `Output guardrail ${guardrail.id} failed with severity ${result.severity}: ${result.message}`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Error running output guardrail ${guardrail.id}: ${error instanceof Error ? error.message : error}`,
        );
        // Continue with other guardrails on error
        results.push({
          passed: false,
          guardrailId: guardrail.id,
          severity: "error",
          message: `Guardrail execution error: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }

    const passed =
      !blockedBy &&
      results.every(
        (r) => r.passed || r.severity === "info" || r.severity === "warning",
      );

    return {
      passed,
      results,
      blockedBy,
    };
  }

  /**
   * Get pipeline status
   */
  getStatus(): {
    inputGuardrails: string[];
    outputGuardrails: string[];
  } {
    return {
      inputGuardrails: this.inputGuardrails.map(
        (g) => `${g.id} (enabled: ${g.enabled})`,
      ),
      outputGuardrails: this.outputGuardrails.map(
        (g) => `${g.id} (enabled: ${g.enabled})`,
      ),
    };
  }

  /**
   * Get detailed guardrail list for admin display
   */
  getRegisteredGuardrails(): {
    input: Array<{ id: string; name: string; enabled: boolean }>;
    output: Array<{ id: string; name: string; enabled: boolean }>;
    totalRules: number;
  } {
    return {
      input: this.inputGuardrails.map((g) => ({
        id: g.id,
        name: g.name,
        enabled: g.enabled,
      })),
      output: this.outputGuardrails.map((g) => ({
        id: g.id,
        name: g.name,
        enabled: g.enabled,
      })),
      totalRules: this.inputGuardrails.length + this.outputGuardrails.length,
    };
  }

  /**
   * Get count of registered guardrails
   */
  getCount(): { input: number; output: number } {
    return {
      input: this.inputGuardrails.length,
      output: this.outputGuardrails.length,
    };
  }
}
