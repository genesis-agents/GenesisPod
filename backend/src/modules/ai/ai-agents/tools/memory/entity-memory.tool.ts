/**
 * Entity Memory Tool
 * 实体记忆工具 - 存储和检索命名实体（人物、地点、概念等）
 *
 * 功能:
 * - store: 存储实体信息
 * - retrieve: 检索实体详情
 * - addRelation: 添加实体关系
 * - queryRelations: 查询相关实体
 * - search: 搜索实体
 * - update: 更新实体信息
 *
 * 特点:
 * - 支持实体类型分类（PERSON, PLACE, CONCEPT, ORGANIZATION, EVENT）
 * - 实体关系图谱
 * - 上下文追踪
 * - 语义搜索
 */

import { Injectable, Logger } from "@nestjs/common";
import { BaseTool, JSONSchema, ToolContext } from "../../core";
import { ToolType } from "../../core";

// ============================================================================
// Types
// ============================================================================

/**
 * 实体类型
 */
export enum EntityType {
  PERSON = "PERSON",
  PLACE = "PLACE",
  CONCEPT = "CONCEPT",
  ORGANIZATION = "ORGANIZATION",
  EVENT = "EVENT",
  OTHER = "OTHER",
}

/**
 * 实体关系类型
 */
export enum RelationType {
  RELATED_TO = "RELATED_TO",
  PART_OF = "PART_OF",
  LOCATED_IN = "LOCATED_IN",
  WORKS_FOR = "WORKS_FOR",
  CREATED_BY = "CREATED_BY",
  HAPPENED_AT = "HAPPENED_AT",
  KNOWS = "KNOWS",
  SIMILAR_TO = "SIMILAR_TO",
}

/**
 * 实体信息
 */
export interface Entity {
  /**
   * 实体 ID
   */
  id: string;

  /**
   * 实体名称
   */
  name: string;

  /**
   * 实体类型
   */
  type: EntityType;

  /**
   * 实体属性
   */
  properties: Record<string, unknown>;

  /**
   * 提及次数
   */
  mentionCount: number;

  /**
   * 最后提及时间
   */
  lastMentionedAt: Date;

  /**
   * 上下文片段
   */
  contexts: string[];

  /**
   * 元数据
   */
  metadata?: Record<string, unknown>;
}

/**
 * 实体关系
 */
export interface EntityRelation {
  /**
   * 关系 ID
   */
  id: string;

  /**
   * 源实体 ID
   */
  fromEntityId: string;

  /**
   * 目标实体 ID
   */
  toEntityId: string;

  /**
   * 关系类型
   */
  relationType: RelationType;

  /**
   * 关系属性
   */
  properties?: Record<string, unknown>;

  /**
   * 创建时间
   */
  createdAt: Date;
}

/**
 * 操作类型
 */
export enum EntityOperation {
  STORE = "store",
  RETRIEVE = "retrieve",
  ADD_RELATION = "add_relation",
  QUERY_RELATIONS = "query_relations",
  SEARCH = "search",
  UPDATE = "update",
  DELETE = "delete",
}

/**
 * 实体记忆工具输入
 */
export interface EntityMemoryInput {
  /**
   * 操作类型
   */
  operation: EntityOperation;

  /**
   * 实体 ID（用于 retrieve, update, delete, add_relation）
   */
  entityId?: string;

  /**
   * 实体信息（用于 store, update）
   */
  entity?: {
    name: string;
    type: EntityType;
    properties?: Record<string, unknown>;
    context?: string;
  };

  /**
   * 关系信息（用于 add_relation）
   */
  relation?: {
    toEntityId: string;
    relationType: RelationType;
    properties?: Record<string, unknown>;
  };

  /**
   * 搜索查询（用于 search）
   */
  query?: string;

  /**
   * 搜索过滤器（用于 search, query_relations）
   */
  filter?: {
    entityType?: EntityType;
    relationType?: RelationType;
    limit?: number;
  };
}

/**
 * 实体记忆工具输出
 */
export interface EntityMemoryOutput {
  /**
   * 操作是否成功
   */
  success: boolean;

  /**
   * 操作类型
   */
  operation: EntityOperation;

  /**
   * 实体数据（用于 retrieve, store, update）
   */
  entity?: Entity;

  /**
   * 实体列表（用于 search）
   */
  entities?: Entity[];

  /**
   * 关系数据（用于 add_relation）
   */
  relation?: EntityRelation;

  /**
   * 关系列表（用于 query_relations）
   */
  relations?: EntityRelation[];

  /**
   * 错误信息
   */
  error?: string;

  /**
   * 元数据
   */
  metadata?: {
    totalCount?: number;
    processingTime?: number;
  };
}

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * 实体记忆工具
 *
 * 用于管理命名实体（人物、地点、概念等）及其关系，支持：
 * - 实体存储和检索
 * - 实体关系管理
 * - 上下文追踪
 * - 语义搜索
 *
 * @example
 * ```typescript
 * // 存储一个人物实体
 * {
 *   operation: "store",
 *   entity: {
 *     name: "Albert Einstein",
 *     type: "PERSON",
 *     properties: {
 *       occupation: "Physicist",
 *       birthYear: 1879
 *     },
 *     context: "Discussed in the context of relativity theory"
 *   }
 * }
 *
 * // 添加关系
 * {
 *   operation: "add_relation",
 *   entityId: "entity-1",
 *   relation: {
 *     toEntityId: "entity-2",
 *     relationType: "CREATED_BY",
 *     properties: { year: 1915 }
 *   }
 * }
 * ```
 */
@Injectable()
export class EntityMemoryTool extends BaseTool<
  EntityMemoryInput,
  EntityMemoryOutput
> {
  private readonly logger = new Logger(EntityMemoryTool.name);

  // NOTE: This ToolType should be added to the ToolType enum in agent.types.ts
  readonly type = "entity_memory" as ToolType;
  readonly name = "实体记忆";
  readonly description =
    "管理和检索命名实体（人物、地点、概念、组织、事件等）及其关系。支持实体存储、关系构建、上下文追踪和语义搜索，适用于构建知识图谱和理解实体间的复杂关系。";

  readonly inputSchema: JSONSchema = {
    type: "object",
    properties: {
      operation: {
        type: "string",
        description: "操作类型",
        enum: Object.values(EntityOperation),
      },
      entityId: {
        type: "string",
        description:
          "实体 ID（用于 retrieve, update, delete, add_relation 操作）",
      },
      entity: {
        type: "object",
        description: "实体信息（用于 store, update 操作）",
        properties: {
          name: {
            type: "string",
            description: "实体名称",
          },
          type: {
            type: "string",
            description: "实体类型",
            enum: Object.values(EntityType),
          },
          properties: {
            type: "object",
            description: "实体属性（任意键值对）",
          },
          context: {
            type: "string",
            description: "提及该实体的上下文",
          },
        },
        required: ["name", "type"],
      },
      relation: {
        type: "object",
        description: "关系信息（用于 add_relation 操作）",
        properties: {
          toEntityId: {
            type: "string",
            description: "目标实体 ID",
          },
          relationType: {
            type: "string",
            description: "关系类型",
            enum: Object.values(RelationType),
          },
          properties: {
            type: "object",
            description: "关系属性",
          },
        },
        required: ["toEntityId", "relationType"],
      },
      query: {
        type: "string",
        description: "搜索查询（用于 search 操作）",
      },
      filter: {
        type: "object",
        description: "过滤条件",
        properties: {
          entityType: {
            type: "string",
            description: "按实体类型过滤",
            enum: Object.values(EntityType),
          },
          relationType: {
            type: "string",
            description: "按关系类型过滤",
            enum: Object.values(RelationType),
          },
          limit: {
            type: "number",
            description: "返回结果数量限制",
            default: 10,
          },
        },
      },
    },
    required: ["operation"],
  };

  readonly outputSchema: JSONSchema = {
    type: "object",
    properties: {
      success: {
        type: "boolean",
        description: "操作是否成功",
      },
      operation: {
        type: "string",
        description: "执行的操作类型",
      },
      entity: {
        type: "object",
        description: "实体数据",
      },
      entities: {
        type: "array",
        description: "实体列表",
        items: {
          type: "object",
        },
      },
      relation: {
        type: "object",
        description: "关系数据",
      },
      relations: {
        type: "array",
        description: "关系列表",
        items: {
          type: "object",
        },
      },
      error: {
        type: "string",
        description: "错误信息",
      },
    },
  };

  // In-memory storage for demo purposes
  // TODO: Replace with actual database storage (Prisma + PostgreSQL)
  private entities: Map<string, Entity> = new Map();
  private relations: Map<string, EntityRelation> = new Map();
  private nameIndex: Map<string, string> = new Map(); // name -> entityId

  constructor() {
    super();
    this.defaultTimeout = 10000; // 10 秒超时
  }

  /**
   * 验证输入
   */
  validateInput(input: EntityMemoryInput): boolean {
    // 验证操作类型
    if (!Object.values(EntityOperation).includes(input.operation)) {
      return false;
    }

    // 验证各操作所需参数
    switch (input.operation) {
      case EntityOperation.STORE:
        return !!input.entity?.name && !!input.entity?.type;

      case EntityOperation.RETRIEVE:
      case EntityOperation.UPDATE:
      case EntityOperation.DELETE:
        return !!input.entityId;

      case EntityOperation.ADD_RELATION:
        return (
          !!input.entityId &&
          !!input.relation?.toEntityId &&
          !!input.relation?.relationType
        );

      case EntityOperation.QUERY_RELATIONS:
        return !!input.entityId;

      case EntityOperation.SEARCH:
        return !!input.query;

      default:
        return false;
    }
  }

  /**
   * 执行实体记忆操作
   */
  protected async doExecute(
    input: EntityMemoryInput,
    context: ToolContext,
  ): Promise<EntityMemoryOutput> {
    const startTime = Date.now();

    try {
      switch (input.operation) {
        case EntityOperation.STORE:
          return await this.storeEntity(input.entity, context);

        case EntityOperation.RETRIEVE:
          return await this.retrieveEntity(input.entityId!);

        case EntityOperation.UPDATE:
          return await this.updateEntity(input.entityId!, input.entity);

        case EntityOperation.DELETE:
          return await this.deleteEntity(input.entityId!);

        case EntityOperation.ADD_RELATION:
          return await this.addRelation(input.entityId!, input.relation);

        case EntityOperation.QUERY_RELATIONS:
          return await this.queryRelations(input.entityId!, input.filter);

        case EntityOperation.SEARCH:
          return await this.searchEntities(input.query!, input.filter);

        default:
          return {
            success: false,
            operation: input.operation,
            error: `Unknown operation: ${input.operation}`,
          };
      }
    } catch (error) {
      this.logger.error(
        `Entity memory operation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );

      return {
        success: false,
        operation: input.operation,
        error: error instanceof Error ? error.message : "Unknown error",
        metadata: {
          processingTime: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * 存储实体
   */
  private async storeEntity(
    entityData: EntityMemoryInput["entity"],
    _context: ToolContext,
  ): Promise<EntityMemoryOutput> {
    const entityId = this.generateEntityId(entityData!.name);

    // 检查是否已存在
    const existingId = this.nameIndex.get(entityData!.name.toLowerCase());
    if (existingId) {
      // 更新现有实体
      const existing = this.entities.get(existingId)!;
      existing.mentionCount++;
      existing.lastMentionedAt = new Date();
      if (entityData!.context) {
        existing.contexts.push(entityData!.context);
      }
      // 合并属性
      existing.properties = {
        ...existing.properties,
        ...entityData!.properties,
      };

      return {
        success: true,
        operation: EntityOperation.STORE,
        entity: existing,
      };
    }

    // 创建新实体
    const entity: Entity = {
      id: entityId,
      name: entityData!.name,
      type: entityData!.type,
      properties: entityData!.properties || {},
      mentionCount: 1,
      lastMentionedAt: new Date(),
      contexts: entityData!.context ? [entityData!.context] : [],
    };

    this.entities.set(entityId, entity);
    this.nameIndex.set(entityData!.name.toLowerCase(), entityId);

    this.logger.log(`Stored entity: ${entity.name} [${entityId}]`);

    return {
      success: true,
      operation: EntityOperation.STORE,
      entity,
    };
  }

  /**
   * 检索实体
   */
  private async retrieveEntity(entityId: string): Promise<EntityMemoryOutput> {
    const entity = this.entities.get(entityId);

    if (!entity) {
      return {
        success: false,
        operation: EntityOperation.RETRIEVE,
        error: `Entity not found: ${entityId}`,
      };
    }

    return {
      success: true,
      operation: EntityOperation.RETRIEVE,
      entity,
    };
  }

  /**
   * 更新实体
   */
  private async updateEntity(
    entityId: string,
    updates: EntityMemoryInput["entity"],
  ): Promise<EntityMemoryOutput> {
    const entity = this.entities.get(entityId);

    if (!entity) {
      return {
        success: false,
        operation: EntityOperation.UPDATE,
        error: `Entity not found: ${entityId}`,
      };
    }

    // 更新属性
    if (updates!.properties) {
      entity.properties = { ...entity.properties, ...updates!.properties };
    }
    if (updates!.context) {
      entity.contexts.push(updates!.context);
    }
    entity.lastMentionedAt = new Date();

    return {
      success: true,
      operation: EntityOperation.UPDATE,
      entity,
    };
  }

  /**
   * 删除实体
   */
  private async deleteEntity(entityId: string): Promise<EntityMemoryOutput> {
    const entity = this.entities.get(entityId);

    if (!entity) {
      return {
        success: false,
        operation: EntityOperation.DELETE,
        error: `Entity not found: ${entityId}`,
      };
    }

    this.entities.delete(entityId);
    this.nameIndex.delete(entity.name.toLowerCase());

    // 删除相关关系
    for (const [relationId, relation] of this.relations.entries()) {
      if (
        relation.fromEntityId === entityId ||
        relation.toEntityId === entityId
      ) {
        this.relations.delete(relationId);
      }
    }

    this.logger.log(`Deleted entity: ${entity.name} [${entityId}]`);

    return {
      success: true,
      operation: EntityOperation.DELETE,
      entity,
    };
  }

  /**
   * 添加关系
   */
  private async addRelation(
    fromEntityId: string,
    relationData: EntityMemoryInput["relation"],
  ): Promise<EntityMemoryOutput> {
    // 验证实体存在
    if (!this.entities.has(fromEntityId)) {
      return {
        success: false,
        operation: EntityOperation.ADD_RELATION,
        error: `Source entity not found: ${fromEntityId}`,
      };
    }

    if (!this.entities.has(relationData!.toEntityId)) {
      return {
        success: false,
        operation: EntityOperation.ADD_RELATION,
        error: `Target entity not found: ${relationData!.toEntityId}`,
      };
    }

    const relationId = `${fromEntityId}-${relationData!.relationType}-${relationData!.toEntityId}`;

    const relation: EntityRelation = {
      id: relationId,
      fromEntityId,
      toEntityId: relationData!.toEntityId,
      relationType: relationData!.relationType,
      properties: relationData!.properties || {},
      createdAt: new Date(),
    };

    this.relations.set(relationId, relation);

    this.logger.log(
      `Added relation: ${fromEntityId} -[${relationData!.relationType}]-> ${relationData!.toEntityId}`,
    );

    return {
      success: true,
      operation: EntityOperation.ADD_RELATION,
      relation,
    };
  }

  /**
   * 查询关系
   */
  private async queryRelations(
    entityId: string,
    filter?: EntityMemoryInput["filter"],
  ): Promise<EntityMemoryOutput> {
    if (!this.entities.has(entityId)) {
      return {
        success: false,
        operation: EntityOperation.QUERY_RELATIONS,
        error: `Entity not found: ${entityId}`,
      };
    }

    let relations = Array.from(this.relations.values()).filter(
      (rel) => rel.fromEntityId === entityId || rel.toEntityId === entityId,
    );

    // 应用过滤器
    if (filter?.relationType) {
      relations = relations.filter(
        (rel) => rel.relationType === filter.relationType,
      );
    }

    // 应用限制
    if (filter?.limit) {
      relations = relations.slice(0, filter.limit);
    }

    return {
      success: true,
      operation: EntityOperation.QUERY_RELATIONS,
      relations,
      metadata: {
        totalCount: relations.length,
      },
    };
  }

  /**
   * 搜索实体
   */
  private async searchEntities(
    query: string,
    filter?: EntityMemoryInput["filter"],
  ): Promise<EntityMemoryOutput> {
    let entities = Array.from(this.entities.values());

    // 按名称模糊搜索
    const lowerQuery = query.toLowerCase();
    entities = entities.filter(
      (entity) =>
        entity.name.toLowerCase().includes(lowerQuery) ||
        entity.contexts.some((ctx) => ctx.toLowerCase().includes(lowerQuery)),
    );

    // 应用类型过滤
    if (filter?.entityType) {
      entities = entities.filter((e) => e.type === filter.entityType);
    }

    // 按提及次数排序
    entities.sort((a, b) => b.mentionCount - a.mentionCount);

    // 应用限制
    if (filter?.limit) {
      entities = entities.slice(0, filter.limit);
    }

    return {
      success: true,
      operation: EntityOperation.SEARCH,
      entities,
      metadata: {
        totalCount: entities.length,
      },
    };
  }

  /**
   * 生成实体 ID
   */
  private generateEntityId(name: string): string {
    return `entity-${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
  }
}
