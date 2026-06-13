/**
 * Ontology Set Confidence Tool
 * Action tool: update the confidence score on an OntologyObject or OntologyLink.
 *
 * sideEffect = 'idempotent' — calling with the same (objectId|linkId, value) twice
 * produces the same DB state (only the createdAt of the audit row differs).
 *
 * requiredEntitlements = ['ontology.edit'] — declared for the harness ToolACL layer;
 * entitlement enforcement is the harness runner's responsibility, not this tool's.
 */

import { Injectable, Logger } from "@nestjs/common";
import { BaseTool } from "../../../../base/base-tool";
import {
  ToolContext,
  JSONSchema,
  ToolCategory,
} from "../../../../abstractions/tool.interface";
import {
  OntologyService,
  OntologyAuditContext,
  OntologySetConfidenceInput,
} from "@/modules/ai-engine/facade";

// ─── I/O Types ────────────────────────────────────────────────────────────────

export interface OntologySetConfidenceInput_Tool {
  /** ID of the OntologyObject to update (mutually exclusive with linkId) */
  objectId?: string;
  /** ID of the OntologyLink to update (mutually exclusive with objectId) */
  linkId?: string;
  /** New confidence value, 0–1 */
  value: number;
  /** Audit: who is performing this action ("human" | "agent" | "import" | "system") */
  actorType: string;
  /** Audit: actor ID */
  actorId: string;
  /** Audit: optional reason */
  reason?: string;
}

export interface OntologySetConfidenceOutput {
  success: true;
  target: "object" | "link";
  id: string;
  newConfidence: number;
}

// ─── Tool ─────────────────────────────────────────────────────────────────────

@Injectable()
export class OntologySetConfidenceTool extends BaseTool<
  OntologySetConfidenceInput_Tool,
  OntologySetConfidenceOutput
> {
  private readonly logger = new Logger(OntologySetConfidenceTool.name);

  readonly id = "ontology.setConfidence";
  readonly name = "本体置信度更新";
  readonly description =
    "更新知识本体节点（OntologyObject）或关系（OntologyLink）的置信度得分（0–1）。操作幂等，会写入审计轨迹。适用于 Agent 推断质量评估后的置信度校正。";
  readonly category: ToolCategory = "information";
  readonly tags = ["ontology", "knowledge", "graph", "confidence", "write"];
  readonly sideEffect = "idempotent" as const;
  readonly requiredEntitlements = ["ontology.edit"] as const;

  readonly inputSchema: JSONSchema = {
    type: "object",
    required: ["value", "actorType", "actorId"],
    properties: {
      objectId: {
        type: "string",
        description: "要更新的 OntologyObject UUID（与 linkId 二选一）",
        minLength: 1,
      },
      linkId: {
        type: "string",
        description: "要更新的 OntologyLink UUID（与 objectId 二选一）",
        minLength: 1,
      },
      value: {
        type: "number",
        description: "新的置信度得分，范围 0–1",
        minimum: 0,
        maximum: 1,
      },
      actorType: {
        type: "string",
        description:
          '审计：操作者类型，如 "human"、"agent"、"import"、"system"',
        enum: ["human", "agent", "import", "system"],
      },
      actorId: {
        type: "string",
        description: "审计：操作者 ID",
        minLength: 1,
      },
      reason: {
        type: "string",
        description: "审计：本次操作的原因说明（可选）",
      },
    },
  };

  readonly outputSchema: JSONSchema = {
    type: "object",
    properties: {
      success: { type: "boolean" },
      target: {
        type: "string",
        enum: ["object", "link"],
        description: "更新目标类型",
      },
      id: { type: "string", description: "被更新的节点或关系 UUID" },
      newConfidence: { type: "number", description: "更新后的置信度" },
    },
  };

  constructor(private readonly ontologyService: OntologyService) {
    super();
  }

  protected async doExecute(
    input: OntologySetConfidenceInput_Tool,
    _context: ToolContext,
  ): Promise<OntologySetConfidenceOutput> {
    const serviceInput: OntologySetConfidenceInput = {
      objectId: input.objectId,
      linkId: input.linkId,
      value: input.value,
    };

    const audit: OntologyAuditContext = {
      actorType: input.actorType,
      actorId: input.actorId,
      reason: input.reason,
    };

    this.logger.debug(
      `[OntologySetConfidenceTool] objectId=${input.objectId ?? "-"} linkId=${input.linkId ?? "-"} value=${input.value}`,
    );

    await this.ontologyService.setConfidence(serviceInput, audit);

    const target = input.objectId !== undefined ? "object" : "link";
    const id = (input.objectId ?? input.linkId) as string;

    return { success: true, target, id, newConfidence: input.value };
  }
}
