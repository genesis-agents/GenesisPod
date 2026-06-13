/**
 * Ontology Add Link Tool
 * Action tool: add (or upsert) a directed edge between two OntologyObject nodes.
 *
 * sideEffect = 'none' — declared per ITool interface convention for edges
 * because addLink uses upsert semantics internally (idempotent on the triple
 * fromId/toId/linkTypeKey). Callers should treat re-runs as safe.
 *
 * Note: the task spec declares sideEffect='none' for this tool explicitly.
 *
 * requiredEntitlements = ['ontology.edit'] — declared for harness ToolACL layer;
 * entitlement decision is NOT made inside this tool.
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
  AddLinkInput,
  OntologyLinkView,
} from "@/modules/ai-engine/facade";

// ─── I/O Types ────────────────────────────────────────────────────────────────

export interface OntologyAddLinkInput {
  /** Optional topic scope */
  topicId?: string;
  /** Relationship type key, e.g. "depends_on", "related_to", "parent_of" */
  linkTypeKey: string;
  /** UUID of the source OntologyObject */
  fromId: string;
  /** UUID of the target OntologyObject */
  toId: string;
  /** Arbitrary edge properties */
  properties?: Record<string, unknown>;
  /** Confidence score 0–1 (default 1.0) */
  confidence?: number;
  /** Audit: who is performing this action ("human" | "agent" | "import" | "system") */
  actorType: string;
  /** Audit: actor ID */
  actorId: string;
  /** Audit: optional reason for the operation */
  reason?: string;
}

export type OntologyAddLinkOutput = OntologyLinkView;

// ─── Tool ─────────────────────────────────────────────────────────────────────

@Injectable()
export class OntologyAddLinkTool extends BaseTool<
  OntologyAddLinkInput,
  OntologyAddLinkOutput
> {
  private readonly logger = new Logger(OntologyAddLinkTool.name);

  readonly id = "ontology.addLink";
  readonly name = "本体关系写入";
  readonly description =
    "在知识本体图谱中写入两个节点之间的有向关系（OntologyLink）。相同 (fromId, toId, linkTypeKey) 三元组时合并属性与置信度，不重复创建边。适用于从文档或 Agent 推断中积累结构化关系。";
  readonly category: ToolCategory = "information";
  readonly tags = ["ontology", "knowledge", "graph", "write", "link", "edge"];
  readonly sideEffect = "idempotent" as const;
  readonly requiredEntitlements = ["ontology.edit"] as const;

  readonly inputSchema: JSONSchema = {
    type: "object",
    required: ["linkTypeKey", "fromId", "toId", "actorType", "actorId"],
    properties: {
      topicId: {
        type: "string",
        description: "话题/会话 ID，用于将关系限定在特定研究范围内（可选）",
      },
      linkTypeKey: {
        type: "string",
        description:
          '关系类型键，如 "depends_on"、"related_to"、"parent_of"、"competes_with"',
        minLength: 1,
      },
      fromId: {
        type: "string",
        description: "源节点的 OntologyObject UUID",
        minLength: 1,
      },
      toId: {
        type: "string",
        description: "目标节点的 OntologyObject UUID",
        minLength: 1,
      },
      properties: {
        type: "object",
        description: "边上的任意结构化属性，如 { weight: 0.8, since: '2023' }",
        additionalProperties: true,
      },
      confidence: {
        type: "number",
        description: "置信度 0–1，默认 1.0",
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
        description: "审计：本次写入的原因说明（可选）",
      },
    },
  };

  readonly outputSchema: JSONSchema = {
    type: "object",
    description: "写入后的 OntologyLink 视图",
    properties: {
      id: { type: "string", description: "关系 UUID" },
      topicId: { type: ["string", "null"], description: "话题 ID" },
      linkTypeKey: { type: "string", description: "关系类型键" },
      fromId: { type: "string", description: "源节点 UUID" },
      toId: { type: "string", description: "目标节点 UUID" },
      properties: {
        type: "object",
        description: "边属性",
        additionalProperties: true,
      },
      confidence: { type: "number", description: "置信度 0–1" },
      createdAt: {
        type: "string",
        format: "date-time",
        description: "创建时间",
      },
    },
  };

  constructor(private readonly ontologyService: OntologyService) {
    super();
  }

  protected async doExecute(
    input: OntologyAddLinkInput,
    _context: ToolContext,
  ): Promise<OntologyAddLinkOutput> {
    const addLinkInput: AddLinkInput = {
      topicId: input.topicId,
      linkTypeKey: input.linkTypeKey,
      fromId: input.fromId,
      toId: input.toId,
      properties: input.properties,
      confidence: input.confidence,
    };

    const audit: OntologyAuditContext = {
      actorType: input.actorType,
      actorId: input.actorId,
      reason: input.reason,
    };

    this.logger.debug(
      `[OntologyAddLinkTool] ${input.fromId}->[${input.linkTypeKey}]->${input.toId} actor=${input.actorId}`,
    );

    return this.ontologyService.addLink(addLinkInput, audit);
  }
}
