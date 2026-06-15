/**
 * Ontology Edit Property Tool
 * Action tool: update a single property key on an OntologyObject.
 *
 * sideEffect = 'idempotent' — setting the same key to the same value twice
 * produces the same DB state (only the audit timestamp differs).
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
  OntologyEditPropertyInput,
  OntologyObjectView,
} from "@/modules/ai-engine/facade";

// ─── I/O Types ────────────────────────────────────────────────────────────────

export interface OntologyEditPropertyInput_Tool {
  /** ID of the OntologyObject to update */
  objectId: string;
  /** Property key to set or remove */
  key: string;
  /** New value for the property. Pass null to remove the key. */
  value: unknown;
  /** Audit: who is performing this action ("human" | "agent" | "import" | "system") */
  actorType: string;
  /** Audit: actor ID */
  actorId: string;
  /** Audit: optional reason */
  reason?: string;
}

export type OntologyEditPropertyOutput = OntologyObjectView;

// ─── Tool ─────────────────────────────────────────────────────────────────────

@Injectable()
export class OntologyEditPropertyTool extends BaseTool<
  OntologyEditPropertyInput_Tool,
  OntologyEditPropertyOutput
> {
  private readonly logger = new Logger(OntologyEditPropertyTool.name);

  readonly id = "ontology-edit-property";
  readonly name = "本体属性编辑";
  readonly description =
    "更新知识本体节点（OntologyObject）的单个属性键值对。传入 null 值可删除该键。操作幂等，会写入审计轨迹。适用于 Agent 对已有节点的结构化属性补充或修正。";
  readonly category: ToolCategory = "execution";
  readonly tags = ["ontology", "knowledge", "graph", "property", "write"];
  readonly sideEffect = "idempotent" as const;
  readonly requiredEntitlements = ["ontology.edit"] as const;

  readonly inputSchema: JSONSchema = {
    type: "object",
    required: ["objectId", "key", "actorType", "actorId"],
    properties: {
      objectId: {
        type: "string",
        description: "要更新的 OntologyObject UUID",
        minLength: 1,
      },
      key: {
        type: "string",
        description: "要设置或删除的属性键名",
        minLength: 1,
      },
      value: {
        description: "属性新值（任意 JSON 类型；传入 null 则删除该键）",
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
    description: "更新后的 OntologyObject 视图",
    properties: {
      id: { type: "string" },
      topicId: { type: ["string", "null"] },
      typeKey: { type: "string" },
      label: { type: "string" },
      aliases: { type: "array", items: { type: "string" } },
      properties: { type: "object", additionalProperties: true },
      confidence: { type: "number" },
      createdBy: { type: "string" },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
    },
  };

  constructor(private readonly ontologyService: OntologyService) {
    super();
  }

  protected async doExecute(
    input: OntologyEditPropertyInput_Tool,
    _context: ToolContext,
  ): Promise<OntologyEditPropertyOutput> {
    const serviceInput: OntologyEditPropertyInput = {
      objectId: input.objectId,
      key: input.key,
      value: input.value,
    };

    const audit: OntologyAuditContext = {
      actorType: input.actorType,
      actorId: input.actorId,
      reason: input.reason,
    };

    this.logger.debug(
      `[OntologyEditPropertyTool] objectId=${input.objectId} key="${input.key}"`,
    );

    return this.ontologyService.editProperty(serviceInput, audit);
  }
}
