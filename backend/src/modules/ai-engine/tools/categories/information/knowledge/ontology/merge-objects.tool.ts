/**
 * Ontology Merge Objects Tool
 * Action tool: merge multiple source OntologyObjects into a single target.
 *
 * sideEffect = 'destructive' — source objects are marked deleted after merge.
 * This operation cannot be undone (the audit trail allows manual recovery, but
 * the service does not provide a split/undo method).
 *
 * requiredEntitlements = ['ontology.edit', 'ontology.admin'] — declared for the
 * harness ToolACL layer. The 'ontology.admin' entitlement gates destructive merge
 * operations. Entitlement enforcement is the harness runner's responsibility.
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
  OntologyMergeObjectsInput,
  OntologyObjectView,
} from "@/modules/ai-engine/facade";

// ─── I/O Types ────────────────────────────────────────────────────────────────

export interface OntologyMergeObjectsInput_Tool {
  /** UUIDs of the source OntologyObjects to absorb (will be marked deleted) */
  sourceIds: string[];
  /** UUID of the surviving target OntologyObject */
  targetId: string;
  /** Audit: who is performing this action ("human" | "agent" | "import" | "system") */
  actorType: string;
  /** Audit: actor ID */
  actorId: string;
  /** Audit: optional reason */
  reason?: string;
}

export type OntologyMergeObjectsOutput = OntologyObjectView;

// ─── Tool ─────────────────────────────────────────────────────────────────────

@Injectable()
export class OntologyMergeObjectsTool extends BaseTool<
  OntologyMergeObjectsInput_Tool,
  OntologyMergeObjectsOutput
> {
  private readonly logger = new Logger(OntologyMergeObjectsTool.name);

  readonly id = "ontology-merge-objects";
  readonly name = "本体节点合并";
  readonly description =
    "将多个源节点（OntologyObject）合并到指定目标节点：重定向所有入边/出边到目标，合并别名，并将源节点标记为已删除。该操作不可逆（破坏性），需要 ontology.admin 权限。适用于实体去重、消歧后的图谱整理。";
  readonly category: ToolCategory = "execution";
  readonly tags = [
    "ontology",
    "knowledge",
    "graph",
    "merge",
    "write",
    "destructive",
  ];
  readonly sideEffect = "destructive" as const;
  readonly requiredEntitlements = ["ontology.edit", "ontology.admin"] as const;

  readonly inputSchema: JSONSchema = {
    type: "object",
    required: ["sourceIds", "targetId", "actorType", "actorId"],
    properties: {
      sourceIds: {
        type: "array",
        description: "要被吸收的源节点 UUID 列表（这些节点将被标记为已删除）",
        items: { type: "string", minLength: 1 },
        minItems: 1,
      },
      targetId: {
        type: "string",
        description: "合并目标（存活）节点的 UUID",
        minLength: 1,
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
        description: "审计：合并原因说明（可选，建议填写以便后续审查）",
      },
    },
  };

  readonly outputSchema: JSONSchema = {
    type: "object",
    description: "合并后的目标 OntologyObject 视图（已包含合并后的别名）",
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
    input: OntologyMergeObjectsInput_Tool,
    _context: ToolContext,
  ): Promise<OntologyMergeObjectsOutput> {
    const serviceInput: OntologyMergeObjectsInput = {
      sourceIds: input.sourceIds,
      targetId: input.targetId,
    };

    const audit: OntologyAuditContext = {
      actorType: input.actorType,
      actorId: input.actorId,
      reason: input.reason,
    };

    this.logger.debug(
      `[OntologyMergeObjectsTool] targetId=${input.targetId} sourceIds=${input.sourceIds.join(",")}`,
    );

    return this.ontologyService.mergeObjects(serviceInput, audit);
  }
}
