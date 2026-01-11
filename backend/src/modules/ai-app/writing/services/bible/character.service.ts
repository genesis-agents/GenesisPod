import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import {
  CreateCharacterDto,
  UpdateCharacterDto,
} from "../../dto/character.dto";

@Injectable()
export class CharacterService {
  private readonly logger = new Logger(CharacterService.name);

  constructor(private readonly prisma: PrismaService) {
    void this.logger;
  }

  async create(projectId: string, userId: string, dto: CreateCharacterDto) {
    const bible = await this.getBibleByProject(projectId, userId);

    return this.prisma.writingCharacter.create({
      data: {
        bibleId: bible.id,
        name: dto.name,
        aliases: dto.aliases || [],
        role: dto.role || "SUPPORTING",
        appearance: dto.appearance || {},
        personality: dto.personality || {},
        background: dto.background,
        abilities: dto.abilities || [],
        currentState: dto.currentState || {},
      },
    });
  }

  async findAll(projectId: string, userId: string) {
    const bible = await this.getBibleByProject(projectId, userId);

    return this.prisma.writingCharacter.findMany({
      where: { bibleId: bible.id },
      orderBy: { createdAt: "asc" },
    });
  }

  async findOne(id: string, projectId: string, userId: string) {
    const bible = await this.getBibleByProject(projectId, userId);

    const character = await this.prisma.writingCharacter.findFirst({
      where: { id, bibleId: bible.id },
      include: {
        relationships: {
          include: {
            targetCharacter: {
              select: { id: true, name: true },
            },
          },
        },
        appearances: {
          include: {
            scene: {
              select: { id: true, sceneNumber: true, chapterId: true },
            },
          },
        },
      },
    });

    if (!character) {
      throw new NotFoundException("Character not found");
    }

    return character;
  }

  async update(
    id: string,
    projectId: string,
    userId: string,
    dto: UpdateCharacterDto,
  ) {
    const bible = await this.getBibleByProject(projectId, userId);

    const character = await this.prisma.writingCharacter.findFirst({
      where: { id, bibleId: bible.id },
    });

    if (!character) {
      throw new NotFoundException("Character not found");
    }

    // If currentState is being updated, add to stateTimeline
    const updateData: any = { ...dto };
    if (dto.currentState) {
      updateData.stateTimeline = {
        push: {
          state: dto.currentState,
          timestamp: new Date().toISOString(),
        },
      };
    }

    return this.prisma.writingCharacter.update({
      where: { id },
      data: updateData,
    });
  }

  async delete(id: string, projectId: string, userId: string) {
    const bible = await this.getBibleByProject(projectId, userId);

    const character = await this.prisma.writingCharacter.findFirst({
      where: { id, bibleId: bible.id },
    });

    if (!character) {
      throw new NotFoundException("Character not found");
    }

    return this.prisma.writingCharacter.delete({
      where: { id },
    });
  }

  /**
   * 获取角色关系图谱数据
   * 返回所有角色及其关系，用于可视化
   */
  async getRelationshipGraph(projectId: string, userId: string) {
    const bible = await this.getBibleByProject(projectId, userId);

    // 获取所有角色及其关系
    const characters = await this.prisma.writingCharacter.findMany({
      where: { bibleId: bible.id },
      select: {
        id: true,
        name: true,
        role: true,
        aliases: true,
        personality: true,
        relationships: {
          select: {
            id: true,
            targetCharacterId: true,
            relationshipType: true,
            description: true,
            targetCharacter: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // ★ 去重：合并相似名称的角色（处理 "王昭儿"、"王美人"、"王昭儿（王美人）" 等情况）
    const seenNames = new Map<
      string,
      { id: string; name: string; role: string; aliases: string[] }
    >();
    const deduplicatedCharacters = characters.filter((char) => {
      // 解析 "王昭儿（王美人）" 格式
      const aliasMatch = char.name.match(/^(.+?)（(.+?)）$/);
      const namesToCheck = [char.name.toLowerCase()];
      if (aliasMatch) {
        namesToCheck.push(aliasMatch[1].toLowerCase());
        namesToCheck.push(aliasMatch[2].toLowerCase());
      }
      // 也检查别名
      for (const alias of char.aliases || []) {
        namesToCheck.push((alias as string).toLowerCase());
      }

      // 检查是否已有相似名称的角色
      for (const [key, existing] of seenNames) {
        if (namesToCheck.includes(key)) {
          // 已存在，跳过此角色（合并到已存在的角色）
          this.logger.debug(
            `Deduplicating character: ${char.name} (duplicate of ${existing.name})`,
          );
          return false;
        }
        // 检查现有角色的名字是否在当前角色的名字列表中
        if (namesToCheck.some((n) => existing.name.toLowerCase().includes(n))) {
          return false;
        }
      }

      // 记录此角色的所有名字变体
      for (const name of namesToCheck) {
        seenNames.set(name, {
          id: char.id,
          name: char.name,
          role: char.role,
          aliases: char.aliases,
        });
      }
      return true;
    });

    // 构建节点和边
    const nodes = deduplicatedCharacters.map((char) => ({
      id: char.id,
      name: char.name,
      role: char.role,
      aliases: char.aliases,
      // 从 personality 中提取 traits
      traits:
        typeof char.personality === "object" && char.personality
          ? (char.personality as any).traits || []
          : [],
    }));

    const edges: Array<{
      id: string;
      source: string;
      target: string;
      type: string;
      label: string;
      description?: string;
    }> = [];

    // 只包含去重后角色的关系，并且目标也在去重后的列表中
    const validNodeIds = new Set(deduplicatedCharacters.map((c) => c.id));
    // 创建角色名到ID的映射，用于从 personality.relationships 中查找
    const nameToId = new Map<string, string>();
    for (const char of deduplicatedCharacters) {
      nameToId.set(char.name.toLowerCase(), char.id);
      // 也添加解析后的名字
      const aliasMatch = char.name.match(/^(.+?)（(.+?)）$/);
      if (aliasMatch) {
        nameToId.set(aliasMatch[1].toLowerCase(), char.id);
        nameToId.set(aliasMatch[2].toLowerCase(), char.id);
      }
      for (const alias of char.aliases || []) {
        nameToId.set((alias as string).toLowerCase(), char.id);
      }
    }

    // 已添加的边的集合，用于去重
    const addedEdges = new Set<string>();

    for (const char of deduplicatedCharacters) {
      // 1. 从数据库关系表添加边
      for (const rel of char.relationships) {
        // 只添加目标角色也在有效列表中的边
        if (validNodeIds.has(rel.targetCharacterId)) {
          const edgeKey = `${char.id}-${rel.targetCharacterId}`;
          if (!addedEdges.has(edgeKey)) {
            edges.push({
              id: rel.id,
              source: char.id,
              target: rel.targetCharacterId,
              type: rel.relationshipType,
              label: rel.relationshipType,
              description: rel.description || undefined,
            });
            addedEdges.add(edgeKey);
          }
        }
      }

      // 2. ★ 从 personality.relationships 中提取关系（用于未显式添加关系的角色）
      const personality = char.personality as any;
      if (personality?.relationships) {
        const relationshipsData = personality.relationships;
        // relationships 可能是字符串数组 ["与苏清婉为主仆关系"] 或对象
        if (Array.isArray(relationshipsData)) {
          for (const relStr of relationshipsData) {
            // 解析 "与苏清婉为主仆关系" 或 "苏清婉: 主仆关系" 格式
            const match = String(relStr).match(
              /(?:与|和)?(.+?)(?:为|是|：|:)(.+?)(?:关系)?$/,
            );
            if (match) {
              const targetName = match[1].trim().toLowerCase();
              const relationType = match[2].trim();
              const targetId = nameToId.get(targetName);
              if (targetId && targetId !== char.id) {
                const edgeKey = `${char.id}-${targetId}`;
                const reverseKey = `${targetId}-${char.id}`;
                // 避免重复添加（包括反向边）
                if (!addedEdges.has(edgeKey) && !addedEdges.has(reverseKey)) {
                  edges.push({
                    id: `auto-${char.id}-${targetId}`,
                    source: char.id,
                    target: targetId,
                    type: relationType,
                    label: relationType,
                    description: String(relStr),
                  });
                  addedEdges.add(edgeKey);
                }
              }
            }
          }
        } else if (typeof relationshipsData === "object") {
          // 对象格式: { "苏清婉": "主仆关系" }
          for (const [targetName, relationType] of Object.entries(
            relationshipsData,
          )) {
            const targetId = nameToId.get(targetName.toLowerCase());
            if (targetId && targetId !== char.id) {
              const edgeKey = `${char.id}-${targetId}`;
              const reverseKey = `${targetId}-${char.id}`;
              if (!addedEdges.has(edgeKey) && !addedEdges.has(reverseKey)) {
                edges.push({
                  id: `auto-${char.id}-${targetId}`,
                  source: char.id,
                  target: targetId,
                  type: String(relationType),
                  label: String(relationType),
                });
                addedEdges.add(edgeKey);
              }
            }
          }
        }
      }
    }

    return { nodes, edges };
  }

  /**
   * 添加角色关系
   */
  async addRelationship(
    characterId: string,
    projectId: string,
    userId: string,
    dto: {
      targetCharacterId: string;
      relationshipType: string;
      description?: string;
    },
  ) {
    const bible = await this.getBibleByProject(projectId, userId);

    // 验证源角色
    const character = await this.prisma.writingCharacter.findFirst({
      where: { id: characterId, bibleId: bible.id },
    });
    if (!character) {
      throw new NotFoundException("Character not found");
    }

    // 验证目标角色
    const targetCharacter = await this.prisma.writingCharacter.findFirst({
      where: { id: dto.targetCharacterId, bibleId: bible.id },
    });
    if (!targetCharacter) {
      throw new NotFoundException("Target character not found");
    }

    // 创建关系
    return this.prisma.characterRelationship.create({
      data: {
        characterId,
        targetCharacterId: dto.targetCharacterId,
        relationshipType: dto.relationshipType,
        description: dto.description,
      },
      include: {
        targetCharacter: {
          select: { id: true, name: true },
        },
      },
    });
  }

  /**
   * 删除角色关系
   */
  async deleteRelationship(
    relationshipId: string,
    projectId: string,
    userId: string,
  ) {
    const bible = await this.getBibleByProject(projectId, userId);

    const relationship = await this.prisma.characterRelationship.findFirst({
      where: { id: relationshipId },
      include: {
        character: {
          select: { bibleId: true },
        },
      },
    });

    if (!relationship || relationship.character.bibleId !== bible.id) {
      throw new NotFoundException("Relationship not found");
    }

    return this.prisma.characterRelationship.delete({
      where: { id: relationshipId },
    });
  }

  private async getBibleByProject(projectId: string, userId: string) {
    const project = await this.prisma.writingProject.findFirst({
      where: { id: projectId, ownerId: userId },
      include: { storyBible: true },
    });

    if (!project) {
      throw new ForbiddenException("Project not found or access denied");
    }

    if (!project.storyBible) {
      throw new NotFoundException("Story Bible not found");
    }

    return project.storyBible;
  }
}
