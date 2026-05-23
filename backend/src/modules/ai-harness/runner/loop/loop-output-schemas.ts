/**
 * Native structured-output JSON schemas for harness loop call sites.
 *
 * These are minimal permissive schemas — they constrain the top-level shape
 * and known properties without blocking additionalProperties, so providers
 * that auto-degrade (json_mode, prompt) still fall through gracefully.
 * The manual parse fallbacks in each loop remain as the final safety net.
 *
 * R2-#35: Used by simple-loop and react-loop (non-FC branch) to pass
 * structuredOutputStrategy + outputJsonSchema to AiChatService.chat(),
 * enabling native json_schema / tool_use adapter routing.
 */

/**
 * Schema for SimpleLoop: the loop expects the LLM to return an arbitrary
 * JSON object (or array).  We cannot predict the exact shape here because
 * different agents provide different outputSchemas via outputSchemaValidator.
 * A permissive object schema still signals to the provider that JSON is
 * required, which is better than relying on responseFormat:"json" alone.
 */
export const SIMPLE_LOOP_OUTPUT_JSON_SCHEMA: Record<string, unknown> = {
  oneOf: [{ type: "object", additionalProperties: true }, { type: "array" }],
};

/**
 * Schema for ReActLoop non-FC branch (ParsedDecision).
 *
 * ParsedDecision shape:
 *   { thinking: string; action: { kind: string; [key: string]: unknown } }
 *
 * We make all top-level properties optional (providers differ on whether
 * required is enforced in strict vs non-strict mode) and allow additional
 * properties so dialect variants (e.g. actions[] shorthand) are not rejected.
 */
export const REACT_LOOP_DECISION_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    thinking: { type: "string" },
    action: {
      type: "object",
      properties: {
        kind: { type: "string" },
      },
      required: ["kind"],
      additionalProperties: true,
    },
    // shorthand dialect: some models emit top-level "actions" array
    actions: {
      type: "array",
      items: { type: "object", additionalProperties: true },
    },
  },
  additionalProperties: true,
};
