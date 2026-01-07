import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../../common/prisma/prisma.service";

@Injectable()
export class WorldSettingService {
  private readonly logger = new Logger(WorldSettingService.name);

  constructor(private readonly prisma: PrismaService) {
    void this.logger;
  }

  async create(bibleId: string, data: any) {
    return this.prisma.worldSetting.create({
      data: {
        bibleId,
        category: data.category,
        name: data.name,
        description: data.description,
        rules: data.rules || [],
        references: data.references,
      },
    });
  }

  async findAll(bibleId: string) {
    return this.prisma.worldSetting.findMany({
      where: { bibleId },
      orderBy: { category: "asc" },
    });
  }

  async findByCategory(bibleId: string, category: string) {
    return this.prisma.worldSetting.findMany({
      where: { bibleId, category },
    });
  }

  async update(id: string, data: any) {
    return this.prisma.worldSetting.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    return this.prisma.worldSetting.delete({
      where: { id },
    });
  }
}
