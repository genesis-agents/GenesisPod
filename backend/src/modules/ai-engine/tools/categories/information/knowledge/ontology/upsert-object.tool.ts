/**
 * Ontology Upsert Object Tool
 * Action tool: upsert a knowledge ontology node (OntologyObject).
 *
 * sideEffect = 'idempotent' — writing the same (topicId, typeKey, label) twice
 * merges aliases and properties without creating duplicates.
 *
 * requiredEntitlements = ['ontology.edit'] — declared here for the harness
 * ToolACL layer; this tool does NOT perform entitlement checks itself.
 * Decision authority belongs to the harness runner.
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
  UpsertObjectInput,
  OntologyObjectView,
} from "@/modules/ai-engine/facade";

// ─── I/O Types ────────────────────────────────────────────────────────────────

export interface OntologyUpsertObjectInput {
  /** Optional topic scope (foresight topicId, research sessionId, etc.) */
  topicId?: string;
  /** Node type key, e.g. "company", "technology", "person" */
  typeKey: string;
  /** Primary label for this node */
  label: string;
  /** Alternative names / aliases for entity resolution */
  aliases?: string[];
  /** Arbitrary structured properties stored on the node */
  properties?: Record<string, unknown>;
  /** Confidence score 0–1 (default 1.0) */
  confidence?: number;
  /** Caller identity — surfaces in createdBy audit field */
  createdBy: string;
  /** Audit: who is performing this action ("human" | "agent" | "import" | "system") */
  actorType: string;
  /** Audit: actor ID (user ID, agent run ID, import job ID, etc.) */
  actorId: string;
  /** Audit: optional reason for the operation */
  reason?: string;
}

export type OntologyUpsertObjectOutput = OntologyObjectView;

// ─── Tool ─────────────────────────────────────────────────────────────────────

@Injectable()
export class OntologyUpsertObjectTool extends BaseTool<
  OntologyUpsertObjectInput,
  OntologyUpsertObjectOutput
> {
  private readonly logger = new Logger(OntologyUpsertObjectTool.name);

  readonly id = "ontology.upsertObject";
  readonly name = "本体节点写入";
  readonly description =
    "在知识本体图谱中幂等写入（创建或更新）一个节点（OntologyObject）。相同 (topicId, typeKey, label) 三元组时合并别名与属性，不重复创建。适用于从文档、报告或 Agent 推断中积累结构化知识节点。";
  readonly category: ToolCategory = "information";
  readonly tags = ["ontology", "knowledge", "graph", "write", "upsert"];
  readonly sideEffect = "idempotent" as const;
  readonly requiredEntitlements = ["ontology.edit"] as const;

  readonly inputSchema: JSONSchema = {
    type: "object",
    required: ["typeKey", "label", "createdBy", "actorType", "actorId"],
    properties: {
      topicId: {
        type: "string",
        description: "话题/会话 ID，用于将节点限定在特定研究范围内（可选）",
      },
      typeKey: {
        type: "string",
        description: '节点类型键，如 "company"、"technology"、"person"',
        minLength: 1,
      },
      label: {
        type: "string",
        description: "节点的主标签（规范名称）",
        minLength: 1,
      },
      aliases: {
        type: "array",
        description: "该节点的别名列表，用于实体消歧合并",
        items: { type: "string" },
      },
      properties: {
        type: "object",
        description:
          "节点上的任意结构化属性，如 { industry: 'AI', founded: 2015 }",
        additionalProperties: true,
      },
      confidence: {
        type: "number",
        description: "置信度 0–1，默认 1.0",
        minimum: 0,
        maximum: 1,
      },
      createdBy: {
        type: "string",
        description:
          "创建者标识（用户 ID、Agent ID 等），写入 createdBy 审计字段",
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
        description: "审计：本次写入的原因说明（可选）",
      },
    },
  };

  readonly outputSchema: JSONSchema = {
    type: "object",
    description: "写入后的 OntologyObject 视图",
    properties: {
      id: { type: "string", description: "节点 UUID" },
      topicId: { type: ["string", "null"], description: "话题 ID" },
      typeKey: { type: "string", description: "节点类型键" },
      label: { type: "string", description: "规范标签" },
      aliases: {
        type: "array",
        description: "别名列表",
        items: { type: "string" },
      },
      properties: {
        type: "object",
        description: "节点属性",
        additionalProperties: true,
      },
      confidence: { type: "number", description: "置信度 0–1" },
      createdBy: { type: "string", description: "创建者标识" },
      createdAt: {
        type: "string",
        format: "date-time",
        description: "创建时间",
      },
      updatedAt: {
        type: "string",
        format: "date-time",
        description: "更新时间",
      },
    },
  };

  constructor(private readonly ontologyService: OntologyService) {
    super();
  }

  protected async doExecute(
    input: OntologyUpsertObjectInput,
    _context: ToolContext,
  ): Promise<OntologyUpsertObjectOutput> {
    const upsertInput: UpsertObjectInput = {
      topicId: input.topicId,
      typeKey: input.typeKey,
      label: input.label,
      aliases: input.aliases,
      properties: input.properties,
      confidence: input.confidence,
      createdBy: input.createdBy,
    };

    const audit: OntologyAuditContext = {
      actorType: input.actorType,
      actorId: input.actorId,
      reason: input.reason,
    };

    this.logger.debug(
      `[OntologyUpsertObjectTool] typeKey="${input.typeKey}" label="${input.label}" actor=${input.actorId}`,
    );

    return this.ontologyService.upsertObject(upsertInput, audit);
  }
}
