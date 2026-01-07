import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../../common/prisma/prisma.service";

@Injectable()
export class TerminologyService {
  private readonly logger = new Logger(TerminologyService.name);

  constructor(private readonly prisma: PrismaService) {
    void this.logger;
  }

  async create(bibleId: string, data: any) {
    return this.prisma.terminology.create({
      data: {
        bibleId,
        term: data.term,
        definition: data.definition,
        category: data.category,
        variants: data.variants || [],
        usage: data.usage,
      },
    });
  }

  async findAll(bibleId: string) {
    return this.prisma.terminology.findMany({
      where: { bibleId },
      orderBy: { term: "asc" },
    });
  }

  async findByCategory(bibleId: string, category: string) {
    return this.prisma.terminology.findMany({
      where: { bibleId, category },
    });
  }

  async search(bibleId: string, query: string) {
    return this.prisma.terminology.findMany({
      where: {
        bibleId,
        OR: [
          { term: { contains: query, mode: "insensitive" } },
          { variants: { has: query } },
        ],
      },
    });
  }

  async update(id: string, data: any) {
    return this.prisma.terminology.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    return this.prisma.terminology.delete({
      where: { id },
    });
  }
}
