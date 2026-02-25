/**
 * AI Engine - Content Safety Filter
 * 内容安全过滤器
 */

import { Injectable } from "@nestjs/common";
import {
  IInputGuardrail,
  GuardrailInput,
  GuardrailResult,
} from "../guardrails.interface";

/**
 * PII pattern
 */
interface PIIPattern {
  pattern: RegExp;
  name: string;
  type: string;
}

/**
 * Content Safety Filter
 * Detects PII and sensitive information in input
 */
@Injectable()
export class ContentSafetyFilter implements IInputGuardrail {
  readonly id = "content-safety-filter";
  readonly name = "Content Safety Filter";
  readonly enabled = true;

  private readonly piiPatterns: PIIPattern[] = [
    // Email addresses
    {
      pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      name: "Email Address",
      type: "email",
    },
    // Phone numbers (international and US formats)
    {
      pattern:
        /(?:\+?86)?1[3-9]\d{9}|\+?1?\s*\(?[0-9]{3}\)?[-.\s]*[0-9]{3}[-.\s]*[0-9]{4}/g,
      name: "Phone Number",
      type: "phone",
    },
    // Credit card numbers (basic pattern)
    {
      pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
      name: "Credit Card Number",
      type: "credit_card",
    },
    // Social Security Numbers (US)
    {
      pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
      name: "Social Security Number",
      type: "ssn",
    },
    // Chinese ID card numbers
    {
      pattern: /\b\d{17}[\dXx]\b|\b\d{15}\b/g,
      name: "ID Card Number",
      type: "id_card",
    },
    // IP addresses
    {
      pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
      name: "IP Address",
      type: "ip_address",
    },
    // API keys (simple pattern for common formats)
    {
      pattern: /\b[A-Za-z0-9_-]{32,}\b/g,
      name: "Potential API Key",
      type: "api_key",
    },
  ];

  /**
   * Check input for PII and sensitive information
   */
  async check(input: GuardrailInput): Promise<GuardrailResult> {
    const detections: Array<{ type: string; name: string; count: number }> = [];

    for (const { pattern, name, type } of this.piiPatterns) {
      // Reset lastIndex for global regex
      pattern.lastIndex = 0;

      const matches = input.content.match(pattern);
      if (matches && matches.length > 0) {
        // Filter out false positives for API keys (too short or common words)
        if (type === "api_key") {
          const validMatches = matches.filter(
            (m) => m.length >= 32 && !/^[a-zA-Z]+$/.test(m),
          );
          if (validMatches.length > 0) {
            detections.push({ type, name, count: validMatches.length });
          }
        } else {
          detections.push({ type, name, count: matches.length });
        }
      }
    }

    // No detections
    if (detections.length === 0) {
      return {
        passed: true,
        guardrailId: this.id,
        severity: "info",
        message: "No PII or sensitive information detected",
      };
    }

    // PII detected - return warning
    const totalCount = detections.reduce((sum, d) => sum + d.count, 0);
    return {
      passed: true,
      guardrailId: this.id,
      severity: "warning",
      message: `Detected ${totalCount} potential PII instances: ${detections.map((d) => `${d.name} (${d.count})`).join(", ")}`,
      metadata: {
        detections: detections.map((d) => ({
          type: d.type,
          name: d.name,
          count: d.count,
        })),
        totalCount,
      },
    };
  }
}
