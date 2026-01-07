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
