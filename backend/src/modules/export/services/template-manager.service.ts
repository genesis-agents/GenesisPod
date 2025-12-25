/**
 * 统一导出系统 - 模板管理服务
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ExportFormat, ExportTemplateCategory } from "@prisma/client";
import {
  ThemeConfig,
  LayoutConfig,
  DEFAULT_THEME,
  DEFAULT_LAYOUT,
} from "../types/theme-config";
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  TemplateQueryDto,
  TemplateResponse,
} from "../types/export-options";

@Injectable()
export class TemplateManagerService {
  private readonly logger = new Logger(TemplateManagerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取模板列表
   */
  async getTemplates(
    userId: string,
    query: TemplateQueryDto,
  ): Promise<TemplateResponse[]> {
    const where: any = {
      OR: [
        { userId }, // 用户自己的模板
        { isBuiltIn: true }, // 内置模板
      ],
    };

    // 按类别过滤
    if (query.category) {
      where.category = query.category;
    }

    // 按格式过滤
    if (query.format) {
      where.supportedFormats = { has: query.format };
    }

    // 按源类型过滤
    if (query.sourceType) {
      where.supportedSources = { has: query.sourceType };
    }

    // 包含公开模板
    if (query.includePublic) {
      where.OR.push({ isPublic: true });
    }

    const templates = await this.prisma.exportTemplate.findMany({
      where,
      orderBy: [{ isDefault: "desc" }, { isBuiltIn: "desc" }, { name: "asc" }],
    });

    return templates.map((t) => this.formatTemplate(t));
  }

  /**
   * 获取单个模板
   */
  async getTemplate(
    templateId: string,
    userId: string,
  ): Promise<TemplateResponse> {
    const template = await this.prisma.exportTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException(`Template not found: ${templateId}`);
    }

    // 检查访问权限
    if (
      !template.isBuiltIn &&
      !template.isPublic &&
      template.userId !== userId
    ) {
      throw new ForbiddenException("You do not have access to this template");
    }

    return this.formatTemplate(template);
  }

  /**
   * 获取默认模板
   */
  async getDefaultTemplate(
    category: ExportTemplateCategory,
    format?: ExportFormat,
  ): Promise<TemplateResponse | null> {
    const where: any = {
      category,
      isDefault: true,
    };

    if (format) {
      where.supportedFormats = { has: format };
    }

    const template = await this.prisma.exportTemplate.findFirst({
      where,
    });

    if (!template) {
      // 返回该类别的任意内置模板
      const builtInTemplate = await this.prisma.exportTemplate.findFirst({
        where: {
          category,
          isBuiltIn: true,
          ...(format ? { supportedFormats: { has: format } } : {}),
        },
      });

      if (builtInTemplate) {
        return this.formatTemplate(builtInTemplate);
      }

      return null;
    }

    return this.formatTemplate(template);
  }

  /**
   * 创建自定义模板
   */
  async createTemplate(
    userId: string,
    dto: CreateTemplateDto,
  ): Promise<TemplateResponse> {
    const template = await this.prisma.exportTemplate.create({
      data: {
        name: dto.name,
        description: dto.description,
        category: dto.category,
        themeConfig: dto.themeConfig as any,
        layoutConfig: dto.layoutConfig as any,
        styleConfig: dto.styleConfig as any,
        supportedFormats: dto.supportedFormats,
        supportedSources: dto.supportedSources,
        isPublic: dto.isPublic ?? false,
        previewImage: dto.previewImage,
        userId,
      },
    });

    this.logger.log(`Created template: ${template.id} by user: ${userId}`);

    return this.formatTemplate(template);
  }

  /**
   * 更新模板
   */
  async updateTemplate(
    templateId: string,
    userId: string,
    dto: UpdateTemplateDto,
  ): Promise<TemplateResponse> {
    const existing = await this.prisma.exportTemplate.findUnique({
      where: { id: templateId },
    });

    if (!existing) {
      throw new NotFoundException(`Template not found: ${templateId}`);
    }

    // 不能修改内置模板
    if (existing.isBuiltIn) {
      throw new ForbiddenException("Cannot modify built-in templates");
    }

    // 检查所有权
    if (existing.userId !== userId) {
      throw new ForbiddenException("You do not own this template");
    }

    const template = await this.prisma.exportTemplate.update({
      where: { id: templateId },
      data: {
        name: dto.name,
        description: dto.description,
        themeConfig: dto.themeConfig as any,
        layoutConfig: dto.layoutConfig as any,
        styleConfig: dto.styleConfig as any,
        supportedFormats: dto.supportedFormats,
        supportedSources: dto.supportedSources,
        isPublic: dto.isPublic,
        isDefault: dto.isDefault,
        previewImage: dto.previewImage,
        version: { increment: 1 },
      },
    });

    return this.formatTemplate(template);
  }

  /**
   * 删除模板
   */
  async deleteTemplate(templateId: string, userId: string): Promise<void> {
    const existing = await this.prisma.exportTemplate.findUnique({
      where: { id: templateId },
    });

    if (!existing) {
      throw new NotFoundException(`Template not found: ${templateId}`);
    }

    if (existing.isBuiltIn) {
      throw new ForbiddenException("Cannot delete built-in templates");
    }

    if (existing.userId !== userId) {
      throw new ForbiddenException("You do not own this template");
    }

    await this.prisma.exportTemplate.delete({
      where: { id: templateId },
    });

    this.logger.log(`Deleted template: ${templateId}`);
  }

  /**
   * 复制模板
   */
  async duplicateTemplate(
    templateId: string,
    userId: string,
    newName?: string,
  ): Promise<TemplateResponse> {
    const source = await this.prisma.exportTemplate.findUnique({
      where: { id: templateId },
    });

    if (!source) {
      throw new NotFoundException(`Template not found: ${templateId}`);
    }

    const template = await this.prisma.exportTemplate.create({
      data: {
        name: newName || `${source.name} (副本)`,
        description: source.description,
        category: source.category,
        themeConfig: source.themeConfig as any,
        layoutConfig: source.layoutConfig as any,
        styleConfig: source.styleConfig as any,
        supportedFormats: source.supportedFormats,
        supportedSources: source.supportedSources,
        isPublic: false,
        isBuiltIn: false,
        isDefault: false,
        userId,
      },
    });

    return this.formatTemplate(template);
  }

  /**
   * 获取主题和布局配置
   * 如果提供了模板ID，使用模板配置
   * 否则使用默认配置
   */
  async getThemeAndLayout(
    templateId?: string,
    customTheme?: Partial<ThemeConfig>,
    customLayout?: Partial<LayoutConfig>,
  ): Promise<{ theme: ThemeConfig; layout: LayoutConfig }> {
    let baseTheme = DEFAULT_THEME;
    let baseLayout = DEFAULT_LAYOUT;

    if (templateId) {
      const template = await this.prisma.exportTemplate.findUnique({
        where: { id: templateId },
      });

      if (template) {
        baseTheme = template.themeConfig as unknown as ThemeConfig;
        baseLayout = template.layoutConfig as unknown as LayoutConfig;
      }
    }

    // 合并自定义配置
    const theme = customTheme
      ? this.mergeDeep(baseTheme, customTheme)
      : baseTheme;
    const layout = customLayout
      ? this.mergeDeep(baseLayout, customLayout)
      : baseLayout;

    return { theme, layout };
  }

  /**
   * 格式化模板响应
   */
  private formatTemplate(template: any): TemplateResponse {
    return {
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      themeConfig: template.themeConfig as ThemeConfig,
      layoutConfig: template.layoutConfig as LayoutConfig,
      supportedFormats: template.supportedFormats,
      supportedSources: template.supportedSources,
      isBuiltIn: template.isBuiltIn,
      isDefault: template.isDefault,
      isPublic: template.isPublic,
      previewImage: template.previewImage,
      version: template.version,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };
  }

  /**
   * 深度合并对象
   */
  private mergeDeep<T>(target: T, source: Partial<T>): T {
    const output = { ...target };

    for (const key in source) {
      if (source[key] !== undefined) {
        if (
          typeof source[key] === "object" &&
          source[key] !== null &&
          !Array.isArray(source[key])
        ) {
          output[key] = this.mergeDeep(output[key] as any, source[key] as any);
        } else {
          (output as any)[key] = source[key];
        }
      }
    }

    return output;
  }
}
