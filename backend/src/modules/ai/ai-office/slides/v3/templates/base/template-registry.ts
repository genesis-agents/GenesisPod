/**
 * Slides Engine v3.0 - Template Registry
 *
 * 模板注册器 - 管理所有可用模板，支持智能选择
 */

import { PageTemplateType } from "../../checkpoint/checkpoint.types";

// ============================================================================
// Template Metadata Interface
// ============================================================================

/**
 * 模板情感基调
 */
export type TemplateTone =
  | "positive"
  | "neutral"
  | "analytical"
  | "warning"
  | "inspiring";

/**
 * 位置适配度配置
 */
export interface PositionFit {
  /** 适合开头 (0-1) */
  opening: number;
  /** 适合中间 (0-1) */
  middle: number;
  /** 适合结尾 (0-1) */
  closing: number;
}

/**
 * 模板兼容性配置
 */
export interface TemplateCompatibility {
  /** 此模板前推荐的模板 ID */
  goodBefore: string[];
  /** 此模板后推荐的模板 ID */
  goodAfter: string[];
  /** 避免相邻的模板 ID */
  avoidNear: string[];
}

/**
 * 模板元数据 - 用于智能选择和匹配
 */
export interface TemplateMetadata {
  /** 模板唯一标识 */
  id: string;

  /** 模板类型 */
  type: PageTemplateType;

  /** 模板名称 */
  name: string;

  /** 模板描述 */
  description: string;

  /** 适用场景 */
  useCases: string[];

  /** 内容密度: low(简洁) | medium(适中) | high(丰富) */
  contentDensity: "low" | "medium" | "high";

  /** 视觉风格: professional(专业) | creative(创意) | data-driven(数据驱动) */
  visualStyle: "professional" | "creative" | "data-driven";

  /** 推荐内容类型 */
  recommendedFor: string[];

  /** 最大内容块数量 */
  maxContentBlocks: number;

  /** 支持的变量列表 */
  variables: string[];

  // ========== v3.0 新增字段 ==========

  /** 语义匹配关键词 */
  keywords: string[];

  /** 位置适配度 (0-1) */
  positionFit: PositionFit;

  /** 上下文兼容性 */
  compatibility: TemplateCompatibility;

  /** 情感基调 */
  tone: TemplateTone;
}

/**
 * 完整模板定义
 */
export interface SlideTemplate {
  /** 元数据 */
  metadata: TemplateMetadata;

  /** HTML 模板内容 */
  html: string;

  /** 可选的脚本（如 ECharts） */
  script?: string;
}

// ============================================================================
// Template Registry
// ============================================================================

class TemplateRegistry {
  private templates: Map<string, SlideTemplate> = new Map();
  private typeIndex: Map<PageTemplateType, string[]> = new Map();

  /**
   * 注册模板
   */
  register(template: SlideTemplate): void {
    const { id, type } = template.metadata;

    // 注册到主映射
    this.templates.set(id, template);

    // 更新类型索引
    const typeTemplates = this.typeIndex.get(type) || [];
    if (!typeTemplates.includes(id)) {
      typeTemplates.push(id);
      this.typeIndex.set(type, typeTemplates);
    }
  }

  /**
   * 获取指定 ID 的模板
   */
  get(id: string): SlideTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * 获取指定类型的所有模板
   */
  getByType(type: PageTemplateType): SlideTemplate[] {
    const ids = this.typeIndex.get(type) || [];
    return ids.map((id) => this.templates.get(id)!).filter(Boolean);
  }

  /**
   * 智能选择最佳模板
   */
  selectBest(criteria: TemplateSelectionCriteria): SlideTemplate | null {
    const candidates = this.getByType(criteria.type);

    if (candidates.length === 0) {
      return null;
    }

    if (candidates.length === 1) {
      return candidates[0];
    }

    // 评分选择
    let bestTemplate = candidates[0];
    let bestScore = 0;

    for (const template of candidates) {
      const score = this.calculateMatchScore(template, criteria);
      if (score > bestScore) {
        bestScore = score;
        bestTemplate = template;
      }
    }

    return bestTemplate;
  }

  /**
   * 计算模板匹配分数
   */
  private calculateMatchScore(
    template: SlideTemplate,
    criteria: TemplateSelectionCriteria,
  ): number {
    let score = 0;
    const meta = template.metadata;

    // 内容密度匹配 (+10)
    if (
      criteria.contentDensity &&
      meta.contentDensity === criteria.contentDensity
    ) {
      score += 10;
    }

    // 视觉风格匹配 (+10)
    if (criteria.visualStyle && meta.visualStyle === criteria.visualStyle) {
      score += 10;
    }

    // 使用场景匹配 (+5 per match)
    if (criteria.useCase) {
      for (const uc of meta.useCases) {
        if (uc.toLowerCase().includes(criteria.useCase.toLowerCase())) {
          score += 5;
        }
      }
    }

    // 内容块数量适配 (+5)
    if (
      criteria.contentBlockCount &&
      criteria.contentBlockCount <= meta.maxContentBlocks
    ) {
      score += 5;
    }

    return score;
  }

  /**
   * 获取所有已注册的模板
   */
  getAll(): SlideTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * 获取所有可用类型
   */
  getAvailableTypes(): PageTemplateType[] {
    return Array.from(this.typeIndex.keys());
  }
}

/**
 * 模板选择条件
 */
export interface TemplateSelectionCriteria {
  /** 模板类型（必需） */
  type: PageTemplateType;

  /** 内容密度偏好 */
  contentDensity?: "low" | "medium" | "high";

  /** 视觉风格偏好 */
  visualStyle?: "professional" | "creative" | "data-driven";

  /** 使用场景描述 */
  useCase?: string;

  /** 内容块数量 */
  contentBlockCount?: number;
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const templateRegistry = new TemplateRegistry();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 替换模板变量
 */
export function applyVariables(
  template: SlideTemplate,
  variables: Record<string, string>,
): string {
  let html = template.html;
  for (const [key, value] of Object.entries(variables)) {
    html = html.replace(new RegExp(`{{${key}}}`, "g"), value);
  }
  return html;
}

/**
 * 获取模板的完整 HTML（包含脚本）
 */
export function getFullHtml(template: SlideTemplate): string {
  if (template.script) {
    return `${template.html}\n<script>\n${template.script}\n</script>`;
  }
  return template.html;
}
