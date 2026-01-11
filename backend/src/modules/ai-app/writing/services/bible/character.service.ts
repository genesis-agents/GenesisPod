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

    // 构建节点和边
    const nodes = characters.map((char) => ({
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

    for (const char of characters) {
      for (const rel of char.relationships) {
        edges.push({
          id: rel.id,
          source: char.id,
          target: rel.targetCharacterId,
          type: rel.relationshipType,
          label: rel.relationshipType,
          description: rel.description || undefined,
        });
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
