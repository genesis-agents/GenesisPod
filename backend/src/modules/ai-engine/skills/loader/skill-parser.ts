/**
 * AI Engine - SKILL.md Parser
 *
 * 解析 SKILL.md 格式的文件
 * 支持 YAML frontmatter + Markdown 内容
 */

import * as yaml from "js-yaml";
import * as crypto from "crypto";
import { Logger } from "@nestjs/common";
import {
  SkillMdDefinition,
  SkillMdFrontmatter,
  SkillSource,
} from "../types/skill-md.types";

const logger = new Logger("SkillParser");

/**
 * 解析 SKILL.md 文件内容
 *
 * @param content - 文件内容
 * @param filePath - 文件路径（可选，用于调试）
 * @returns 解析后的 SkillMdDefinition
 */
export function parseSkillMd(
  content: string,
  filePath?: string,
): SkillMdDefinition {
  // 1. 检查是否有 YAML frontmatter
  const frontmatterMatch = content.match(
    /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/,
  );

  if (!frontmatterMatch) {
    throw new Error(
      `Invalid SKILL.md format: Missing YAML frontmatter. ${filePath ? `File: ${filePath}` : ""}`,
    );
  }

  const [, frontmatterStr, markdownContent] = frontmatterMatch;

  // 2. 解析 YAML frontmatter
  let frontmatter: Partial<SkillMdFrontmatter>;
  try {
    frontmatter = yaml.load(frontmatterStr) as Partial<SkillMdFrontmatter>;
  } catch (error) {
    throw new Error(
      `Invalid YAML frontmatter: ${(error as Error).message}. ${filePath ? `File: ${filePath}` : ""}`,
    );
  }

  // 3. 验证必填字段
  const validatedFrontmatter = validateFrontmatter(frontmatter, filePath);

  // 4. 计算内容 hash
  const contentHash = crypto.createHash("md5").update(content).digest("hex");

  // 5. 构建完整定义
  const definition: SkillMdDefinition = {
    metadata: validatedFrontmatter,
    content: markdownContent.trim(),
    filePath,
    loadedAt: new Date(),
    contentHash,
  };

  logger.debug(
    `Parsed SKILL.md: ${definition.metadata.id} (${definition.metadata.name})`,
  );

  return definition;
}

/**
 * 验证 frontmatter 必填字段
 */
function validateFrontmatter(
  frontmatter: Partial<SkillMdFrontmatter>,
  filePath?: string,
): SkillMdFrontmatter {
  const requiredFields = [
    "id",
    "name",
    "version",
    "domain",
    "taskTypes",
    "priority",
  ];
  const missingFields: string[] = [];

  for (const field of requiredFields) {
    if (frontmatter[field as keyof SkillMdFrontmatter] === undefined) {
      missingFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    throw new Error(
      `Missing required fields in frontmatter: ${missingFields.join(", ")}. ${filePath ? `File: ${filePath}` : ""}`,
    );
  }

  // 设置默认值
  return {
    id: frontmatter.id!,
    name: frontmatter.name!,
    version: frontmatter.version!,
    domain: frontmatter.domain!,
    tags: frontmatter.tags || [],
    taskTypes: frontmatter.taskTypes!,
    priority: frontmatter.priority!,
    author: frontmatter.author,
    source: frontmatter.source || "local",
    sourceUrl: frontmatter.sourceUrl,
    description: frontmatter.description,
    dependencies: frontmatter.dependencies || [],
    updatedAt: frontmatter.updatedAt,
    enabled: frontmatter.enabled !== false, // 默认启用
    tokenBudget: frontmatter.tokenBudget,
  };
}

/**
 * 序列化 SkillMdDefinition 为 SKILL.md 格式
 *
 * @param definition - Skill 定义
 * @returns SKILL.md 格式的字符串
 */
export function serializeSkillMd(definition: SkillMdDefinition): string {
  const frontmatter = yaml.dump(definition.metadata, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
  });

  return `---\n${frontmatter}---\n\n${definition.content}`;
}

/**
 * 从 Markdown 内容中提取标题（作为 Skill 名称的后备）
 */
export function extractTitleFromContent(content: string): string | null {
  const titleMatch = content.match(/^#\s+(.+)$/m);
  return titleMatch ? titleMatch[1].trim() : null;
}

/**
 * 估算 Skill 内容的 Token 数量
 * 使用简单的估算：中文每字约 2 token，英文每 4 字符约 1 token
 */
export function estimateTokens(content: string): number {
  const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherChars = content.length - chineseChars;
  return Math.ceil(chineseChars * 2 + otherChars / 4);
}

/**
 * 验证 Skill ID 格式
 * 格式：kebab-case，允许字母、数字、连字符
 */
export function isValidSkillId(id: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id);
}

/**
 * 验证 Skill 来源类型
 */
export function isValidSkillSource(source: string): source is SkillSource {
  return ["local", "skillsmp", "custom-url"].includes(source);
}

/**
 * 解析 Skill ID 从文件名
 * 例如：chapter-writing.skill.md -> chapter-writing
 */
export function parseSkillIdFromFilename(filename: string): string | null {
  const match = filename.match(/^(.+)\.skill\.md$/);
  return match ? match[1] : null;
}
