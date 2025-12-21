/**
 * Standards Service - 工程规范管理服务
 *
 * 管理企业软件工程规范，支持上传、解析和同步
 */

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { AiChatService } from "../../ai-core/ai-chat.service";
import {
  AiCodingStandardType,
  AiCodingStandardSource,
  Prisma,
} from "@prisma/client";

export interface StandardRule {
  id: string;
  rule: string;
  severity: "error" | "warning" | "info";
  category: string;
  examples?: {
    good?: string[];
    bad?: string[];
  };
}

export interface UploadStandardDto {
  name: string;
  type: AiCodingStandardType;
  content: string;
  priority?: number;
}

export interface SyncGithubStandardsDto {
  githubRepo: string;
  githubPath: string;
  githubBranch?: string;
}

@Injectable()
export class StandardsService {
  private readonly logger = new Logger(StandardsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiChatService: AiChatService,
  ) {}

  /**
   * 上传并解析规范文档
   */
  async uploadStandard(userId: string, dto: UploadStandardDto) {
    this.logger.log(`Uploading standard: ${dto.name} (${dto.type})`);

    // 使用 AI 解析规范内容为结构化规则
    const rules = await this.parseStandardRules(dto.content, dto.type);

    return this.prisma.aiCodingStandard.create({
      data: {
        userId,
        name: dto.name,
        type: dto.type,
        source: AiCodingStandardSource.UPLOADED,
        content: dto.content,
        rules: rules as unknown as Prisma.InputJsonValue,
        priority: dto.priority ?? 0,
      },
    });
  }

  /**
   * 从内置模板创建规范
   */
  async createFromTemplate(userId: string, templateName: string) {
    const templates = this.getBuiltInTemplates();
    const template = templates.find((t) => t.name === templateName);

    if (!template) {
      throw new NotFoundException(`Template ${templateName} not found`);
    }

    const rules = await this.parseStandardRules(
      template.content,
      template.type,
    );

    return this.prisma.aiCodingStandard.create({
      data: {
        userId,
        name: template.name,
        type: template.type,
        source: AiCodingStandardSource.TEMPLATE,
        content: template.content,
        rules: rules as unknown as Prisma.InputJsonValue,
        priority: template.priority,
      },
    });
  }

  /**
   * 使用 AI 解析规范文档，提取结构化规则
   */
  async parseStandardRules(
    content: string,
    type: AiCodingStandardType,
  ): Promise<StandardRule[]> {
    const systemPrompt = `You are an expert at extracting software engineering rules from documentation.

Given a standards document, extract each rule as a structured object.

Output a JSON array of rules:
[
  {
    "id": "RULE-001",
    "rule": "Use camelCase for variable names",
    "severity": "error",
    "category": "naming",
    "examples": {
      "good": ["const userName = 'John'"],
      "bad": ["const user_name = 'John'"]
    }
  }
]

Severity levels:
- error: Must be followed, violations are blocking
- warning: Should be followed, violations are flagged
- info: Recommendations, nice to have

Extract at most 20 rules from the document. Focus on the most important and actionable ones.`;

    try {
      const result = await this.aiChatService.chat({
        messages: [
          {
            role: "user",
            content: `Parse rules from this ${type} standards document:\n\n${content.substring(0, 8000)}`,
          },
        ],
        systemPrompt,
        maxTokens: 4096,
        temperature: 0.3,
      });

      const jsonMatch = result.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        this.logger.log(`Parsed ${parsed.length} rules from standard`);
        return parsed;
      }
    } catch (e) {
      this.logger.warn("Failed to parse rules from content", e);
    }

    return [];
  }

  /**
   * 获取用户所有激活的规范
   */
  async getUserStandards(userId: string) {
    return this.prisma.aiCodingStandard.findMany({
      where: {
        userId,
        isActive: true,
      },
      orderBy: [{ priority: "desc" }, { type: "asc" }],
    });
  }

  /**
   * 获取单个规范详情
   */
  async getStandardById(id: string, userId: string) {
    const standard = await this.prisma.aiCodingStandard.findFirst({
      where: { id, userId },
    });

    if (!standard) {
      throw new NotFoundException("Standard not found");
    }

    return standard;
  }

  /**
   * 更新规范
   */
  async updateStandard(
    id: string,
    userId: string,
    dto: Partial<UploadStandardDto>,
  ) {
    const standard = await this.getStandardById(id, userId);

    let rules: Prisma.InputJsonValue = standard.rules as Prisma.InputJsonValue;
    if (dto.content && dto.content !== standard.content) {
      const parsedRules = await this.parseStandardRules(
        dto.content,
        dto.type || standard.type,
      );
      rules = parsedRules as unknown as Prisma.InputJsonValue;
    }

    const updateData: Prisma.AiCodingStandardUpdateInput = {};
    if (dto.name) updateData.name = dto.name;
    if (dto.type) updateData.type = dto.type;
    if (dto.content) {
      updateData.content = dto.content;
      updateData.rules = rules;
    }
    if (dto.priority !== undefined) updateData.priority = dto.priority;

    return this.prisma.aiCodingStandard.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * 删除规范
   */
  async deleteStandard(id: string, userId: string) {
    await this.getStandardById(id, userId);
    return this.prisma.aiCodingStandard.delete({
      where: { id },
    });
  }

  /**
   * 切换规范激活状态
   */
  async toggleStandard(id: string, userId: string, isActive: boolean) {
    await this.getStandardById(id, userId);
    return this.prisma.aiCodingStandard.update({
      where: { id },
      data: { isActive },
    });
  }

  /**
   * 获取格式化的规范内容，用于注入到 Agent Prompt
   */
  async getStandardsForAgent(
    userId: string,
    agentType:
      | "pm"
      | "architect"
      | "engineer"
      | "qa"
      | "se_expert" = "engineer",
  ): Promise<string> {
    const standards = await this.getUserStandards(userId);

    // 根据 Agent 类型筛选相关规范
    const relevantTypes = this.getRelevantStandardTypes(agentType);
    const filtered = standards.filter((s) => relevantTypes.includes(s.type));

    if (filtered.length === 0) {
      return "";
    }

    // 格式化为 Prompt 部分
    let prompt = "\n\n## 工程规范要求\n\n";
    prompt += "以下是必须遵循的工程规范，请确保所有产出符合这些标准：\n\n";

    for (const standard of filtered) {
      prompt += `### ${standard.name}\n\n`;
      const rules = (standard.rules || []) as unknown as StandardRule[];

      for (const rule of rules) {
        const severity =
          rule.severity === "error"
            ? "【必须】"
            : rule.severity === "warning"
              ? "【应该】"
              : "【建议】";
        prompt += `- ${severity} ${rule.rule}\n`;
        if (rule.examples?.good && rule.examples.good.length > 0) {
          prompt += `  ✓ 正确: \`${rule.examples.good[0]}\`\n`;
        }
        if (rule.examples?.bad && rule.examples.bad.length > 0) {
          prompt += `  ✗ 错误: \`${rule.examples.bad[0]}\`\n`;
        }
      }
      prompt += "\n";
    }

    return prompt;
  }

  /**
   * 根据 Agent 类型获取相关规范类型
   */
  private getRelevantStandardTypes(
    agentType: "pm" | "architect" | "engineer" | "qa" | "se_expert",
  ): AiCodingStandardType[] {
    const mapping: Record<string, AiCodingStandardType[]> = {
      pm: [AiCodingStandardType.DOCUMENTATION, AiCodingStandardType.GENERAL],
      architect: [
        AiCodingStandardType.DIRECTORY_STRUCTURE,
        AiCodingStandardType.API_DESIGN,
        AiCodingStandardType.DATABASE_DESIGN,
        AiCodingStandardType.DOCUMENTATION,
        AiCodingStandardType.SECURITY,
      ],
      engineer: [
        AiCodingStandardType.DIRECTORY_STRUCTURE,
        AiCodingStandardType.NAMING_CONVENTIONS,
        AiCodingStandardType.CODE_STYLE,
        AiCodingStandardType.API_DESIGN,
        AiCodingStandardType.DATABASE_DESIGN,
        AiCodingStandardType.TESTING_STANDARDS,
        AiCodingStandardType.GIT_WORKFLOW,
        AiCodingStandardType.SECURITY,
      ],
      qa: [
        AiCodingStandardType.TESTING_STANDARDS,
        AiCodingStandardType.CODE_STYLE,
        AiCodingStandardType.SECURITY,
      ],
      se_expert: Object.values(AiCodingStandardType),
    };

    return mapping[agentType] || [];
  }

  /**
   * 获取内置规范模板
   */
  getBuiltInTemplates() {
    return [
      {
        name: "API 设计规范",
        type: AiCodingStandardType.API_DESIGN,
        priority: 10,
        content: `# API 设计规范

## URL 命名
- 使用 kebab-case: \`/api/v1/user-profiles\`
- 使用复数名词: \`/users\`, \`/posts\`
- 版本号放在 URL 中: \`/api/v1/...\`

## HTTP 方法
- GET: 获取资源
- POST: 创建资源
- PUT/PATCH: 更新资源
- DELETE: 删除资源

## 响应格式
\`\`\`json
{
  "success": true,
  "data": {},
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
\`\`\`

## 错误格式
\`\`\`json
{
  "success": false,
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "User with ID xxx not found"
  }
}
\`\`\`
`,
      },
      {
        name: "命名规范",
        type: AiCodingStandardType.NAMING_CONVENTIONS,
        priority: 10,
        content: `# 命名规范

## 变量命名
- 使用 camelCase: \`userName\`, \`isActive\`
- 布尔值使用 is/has/can 前缀: \`isLoading\`, \`hasPermission\`

## 常量命名
- 使用 UPPER_SNAKE_CASE: \`MAX_RETRY_COUNT\`, \`API_BASE_URL\`

## 函数命名
- 使用 camelCase
- 动词开头: \`getUserById\`, \`calculateTotal\`

## 类/组件命名
- 使用 PascalCase: \`UserProfile\`, \`TodoList\`

## 文件命名
- 组件文件: PascalCase \`UserProfile.tsx\`
- 工具文件: kebab-case \`string-utils.ts\`
`,
      },
      {
        name: "代码风格规范",
        type: AiCodingStandardType.CODE_STYLE,
        priority: 8,
        content: `# 代码风格规范

## 缩进
- 使用 2 空格缩进
- 不使用 Tab

## 行宽
- 最大行宽 100 字符

## 分号
- 总是使用分号

## 引号
- 优先使用单引号
- JSX 属性使用双引号

## 注释
- 公共 API 必须有 JSDoc 注释
- 复杂逻辑需要行内注释
- TODO 注释格式: \`// TODO: description\`

## 空行
- 函数之间空一行
- 逻辑块之间空一行
`,
      },
      {
        name: "测试标准",
        type: AiCodingStandardType.TESTING_STANDARDS,
        priority: 7,
        content: `# 测试标准

## 测试覆盖率
- 单元测试覆盖率 > 80%
- 关键路径覆盖率 100%

## 测试命名
- 使用描述性名称
- 格式: \`should [expected behavior] when [condition]\`

## 测试结构
- Arrange: 准备测试数据
- Act: 执行被测代码
- Assert: 验证结果

## Mock 规范
- 只 Mock 外部依赖
- 避免过度 Mock
`,
      },
      {
        name: "安全规范",
        type: AiCodingStandardType.SECURITY,
        priority: 10,
        content: `# 安全规范

## 认证
- 使用 JWT 或 Session
- Token 过期时间不超过 24 小时

## 密码
- 使用 bcrypt 加密
- 最小长度 8 位

## 输入验证
- 所有用户输入必须验证
- 使用白名单而非黑名单

## SQL 注入防护
- 使用参数化查询
- 禁止字符串拼接 SQL

## XSS 防护
- 转义所有用户输入
- 使用 Content Security Policy
`,
      },
    ];
  }

  /**
   * 获取可用的内置模板列表
   */
  getAvailableTemplates() {
    return this.getBuiltInTemplates().map((t) => ({
      name: t.name,
      type: t.type,
      priority: t.priority,
    }));
  }

  /**
   * 获取模板列表 (Controller 接口)
   */
  getTemplates() {
    return this.getAvailableTemplates();
  }

  /**
   * 创建规范 (Controller 接口)
   */
  async createStandard(
    userId: string,
    dto: {
      name: string;
      type?: string;
      description?: string;
      content?: string;
      source?: string;
      sourceUrl?: string;
    },
  ) {
    const type =
      (dto.type as AiCodingStandardType) || AiCodingStandardType.GENERAL;
    const content = dto.content || dto.description || "";

    // 使用 AI 解析规范内容为结构化规则
    const rules = content ? await this.parseStandardRules(content, type) : [];

    return this.prisma.aiCodingStandard.create({
      data: {
        userId,
        name: dto.name,
        type,
        source:
          (dto.source as AiCodingStandardSource) ||
          AiCodingStandardSource.UPLOADED,
        content,
        rules: rules as unknown as Prisma.InputJsonValue,
        priority: 0,
      },
    });
  }

  /**
   * 应用模板 (Controller 接口)
   */
  async applyTemplate(userId: string, templateId: string) {
    return this.createFromTemplate(userId, templateId);
  }
}
