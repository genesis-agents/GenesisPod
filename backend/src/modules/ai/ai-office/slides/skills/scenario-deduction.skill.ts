/**
 * Slides Engine v3.2 - Scenario Deduction Skill
 *
 * 场景推导技能：根据给定主题，推导PPT生成流程，预测问题并提出改进建议
 * 用于生成前的预检和生成后的 Review
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  PageTemplateType,
  PageLogicType,
} from "../checkpoint/checkpoint.types";

/**
 * 推导输入
 */
export interface ScenarioDeductionInput {
  /** 主题 */
  topic: string;
  /** 目标受众（可选） */
  targetAudience?: string;
  /** 关键信息点（可选） */
  keyPoints?: string[];
  /** 预期页数（可选） */
  expectedPages?: number;
}

/**
 * 页面推导结果
 */
export interface DeducedPage {
  pageNumber: number;
  /** 推导的观点性标题 */
  viewpoint: string;
  /** 推导的逻辑类型 */
  logicType: PageLogicType;
  /** 推导的模板类型 */
  templateType: PageTemplateType;
  /** 需要的数据类型 */
  requiredData: string[];
  /** 潜在问题 */
  potentialIssues: string[];
  /** 改进建议 */
  suggestions: string[];
}

/**
 * 推导结果
 */
export interface ScenarioDeductionResult {
  /** 主题分析 */
  topicAnalysis: {
    category: string;
    suggestedStructure: string;
    keyInsights: string[];
  };
  /** 推导的页面列表 */
  pages: DeducedPage[];
  /** 全局问题 */
  globalIssues: string[];
  /** 全局建议 */
  globalSuggestions: string[];
  /** 质量预测分数 (0-100) */
  qualityPrediction: number;
}

/**
 * 主题类型分类
 */
type TopicCategory =
  | "geography" // 地理/区域介绍
  | "product" // 产品/项目
  | "analysis" // 分析报告
  | "proposal" // 方案提案
  | "education" // 教育培训
  | "general"; // 通用

@Injectable()
export class ScenarioDeductionSkill {
  private readonly logger = new Logger(ScenarioDeductionSkill.name);

  /**
   * 执行场景推导
   */
  deduce(input: ScenarioDeductionInput): ScenarioDeductionResult {
    this.logger.log(`[deduce] Starting scenario deduction for: ${input.topic}`);

    // 1. 分析主题类型
    const category = this.categorizeTopics(input.topic);

    // 2. 获取推荐的叙事结构
    const structure = this.getRecommendedStructure(category);

    // 3. 推导页面列表
    const pages = this.deducePages(input, category, structure);

    // 4. 检测全局问题
    const globalIssues = this.detectGlobalIssues(pages);

    // 5. 生成全局建议
    const globalSuggestions = this.generateGlobalSuggestions(
      pages,
      category,
      globalIssues,
    );

    // 6. 预测质量分数
    const qualityPrediction = this.predictQuality(pages, globalIssues);

    const result: ScenarioDeductionResult = {
      topicAnalysis: {
        category,
        suggestedStructure: structure.name,
        keyInsights: this.extractKeyInsights(input),
      },
      pages,
      globalIssues,
      globalSuggestions,
      qualityPrediction,
    };

    this.logger.log(
      `[deduce] Completed. Quality prediction: ${qualityPrediction}/100`,
    );

    return result;
  }

  /**
   * 分类主题类型
   */
  private categorizeTopics(topic: string): TopicCategory {
    const topicLower = topic.toLowerCase();

    // 地理/区域关键词
    if (/渥太华|kanata|城市|区域|地区|省|市|县|园区|科技园/.test(topicLower)) {
      return "geography";
    }

    // 产品/项目关键词
    if (/产品|项目|系统|平台|应用|app|软件|工具/.test(topicLower)) {
      return "product";
    }

    // 分析报告关键词
    if (/分析|报告|研究|调研|市场|行业|趋势/.test(topicLower)) {
      return "analysis";
    }

    // 方案提案关键词
    if (/方案|提案|规划|计划|建议|策略/.test(topicLower)) {
      return "proposal";
    }

    // 教育培训关键词
    if (/培训|教程|入门|指南|学习|课程/.test(topicLower)) {
      return "education";
    }

    return "general";
  }

  /**
   * 获取推荐的叙事结构
   */
  private getRecommendedStructure(category: TopicCategory): {
    name: string;
    phases: Array<{ name: string; logicTypes: PageLogicType[] }>;
  } {
    const structures: Record<
      TopicCategory,
      {
        name: string;
        phases: Array<{ name: string; logicTypes: PageLogicType[] }>;
      }
    > = {
      geography: {
        name: "地理介绍结构",
        phases: [
          { name: "概览", logicTypes: ["data", "case"] },
          { name: "地理区位", logicTypes: ["case", "data"] },
          { name: "自然环境", logicTypes: ["parallel", "data"] },
          { name: "人文经济", logicTypes: ["data", "parallel"] },
          { name: "产业生态", logicTypes: ["parallel", "comparison"] },
          { name: "发展历程", logicTypes: ["temporal"] },
          { name: "展望机遇", logicTypes: ["parallel", "comparison"] },
        ],
      },
      product: {
        name: "产品介绍结构",
        phases: [
          { name: "背景问题", logicTypes: ["data", "case"] },
          { name: "解决方案", logicTypes: ["parallel", "causal"] },
          { name: "核心功能", logicTypes: ["parallel"] },
          { name: "技术架构", logicTypes: ["hierarchical", "causal"] },
          { name: "成功案例", logicTypes: ["case", "data"] },
          { name: "未来规划", logicTypes: ["temporal", "parallel"] },
        ],
      },
      analysis: {
        name: "分析报告结构",
        phases: [
          { name: "行业概述", logicTypes: ["data", "parallel"] },
          { name: "市场分析", logicTypes: ["data", "comparison"] },
          { name: "竞争格局", logicTypes: ["comparison", "parallel"] },
          { name: "趋势预测", logicTypes: ["temporal", "data"] },
          { name: "机会风险", logicTypes: ["comparison"] },
          { name: "战略建议", logicTypes: ["parallel", "hierarchical"] },
        ],
      },
      proposal: {
        name: "方案提案结构",
        phases: [
          { name: "现状问题", logicTypes: ["data", "case"] },
          { name: "目标愿景", logicTypes: ["parallel", "hierarchical"] },
          { name: "解决方案", logicTypes: ["parallel", "causal"] },
          { name: "实施计划", logicTypes: ["temporal", "causal"] },
          { name: "资源需求", logicTypes: ["data", "comparison"] },
          { name: "预期效果", logicTypes: ["data", "comparison"] },
        ],
      },
      education: {
        name: "教育培训结构",
        phases: [
          { name: "学习目标", logicTypes: ["parallel"] },
          { name: "基础概念", logicTypes: ["hierarchical", "parallel"] },
          { name: "核心内容", logicTypes: ["parallel", "causal"] },
          { name: "实践练习", logicTypes: ["case", "causal"] },
          { name: "总结回顾", logicTypes: ["parallel"] },
        ],
      },
      general: {
        name: "通用结构",
        phases: [
          { name: "背景介绍", logicTypes: ["data", "case"] },
          { name: "核心内容", logicTypes: ["parallel"] },
          { name: "详细分析", logicTypes: ["data", "comparison"] },
          { name: "总结建议", logicTypes: ["parallel"] },
        ],
      },
    };

    return structures[category];
  }

  /**
   * 推导页面列表
   */
  private deducePages(
    input: ScenarioDeductionInput,
    _category: TopicCategory,
    structure: {
      name: string;
      phases: Array<{ name: string; logicTypes: PageLogicType[] }>;
    },
  ): DeducedPage[] {
    const pages: DeducedPage[] = [];
    let pageNumber = 1;

    // 1. 封面页
    pages.push({
      pageNumber: pageNumber++,
      viewpoint: `${input.topic}：[需要提炼核心观点]`,
      logicType: "narrative",
      templateType: "cover",
      requiredData: ["标题", "副标题", "日期"],
      potentialIssues: [],
      suggestions: ["确保标题是判断句而非描述性标题"],
    });

    // 2. 目录页
    pages.push({
      pageNumber: pageNumber++,
      viewpoint: "目录",
      logicType: "narrative",
      templateType: "toc",
      requiredData: ["章节列表"],
      potentialIssues: [],
      suggestions: [],
    });

    // 3. 根据结构生成内容页
    for (const phase of structure.phases) {
      const logicType = phase.logicTypes[0];
      const templateType = this.logicToTemplate(logicType);

      const page: DeducedPage = {
        pageNumber: pageNumber++,
        viewpoint: this.generateViewpointForPhase(phase.name, input.topic),
        logicType,
        templateType,
        requiredData: this.getRequiredDataForLogic(logicType),
        potentialIssues: this.detectPageIssues(logicType, templateType, phase),
        suggestions: this.generatePageSuggestions(logicType, phase),
      };

      pages.push(page);
    }

    // 4. 结尾页
    pages.push({
      pageNumber: pageNumber++,
      viewpoint: "总结与行动建议",
      logicType: "parallel",
      templateType: "recommendations",
      requiredData: ["核心结论", "行动建议"],
      potentialIssues: [],
      suggestions: ["确保建议具体可执行"],
    });

    return pages;
  }

  /**
   * 逻辑类型转模板类型
   */
  private logicToTemplate(logicType: PageLogicType): PageTemplateType {
    const mapping: Record<PageLogicType, PageTemplateType> = {
      parallel: "pillars",
      temporal: "timeline",
      comparison: "comparison",
      data: "dashboard",
      causal: "framework",
      hierarchical: "maturityModel",
      case: "splitLayout",
      narrative: "cover",
    };
    return mapping[logicType];
  }

  /**
   * 为阶段生成观点性标题
   */
  private generateViewpointForPhase(phaseName: string, topic: string): string {
    const viewpointTemplates: Record<string, string> = {
      概览: `${topic}已成为[领域]的[地位]`,
      地理区位: `地理区位决定${topic}的战略价值`,
      自然环境: `独特的自然条件为${topic}创造优势`,
      人文经济: `人才与经济基础支撑${topic}发展`,
      产业生态: `[N]大支柱产业构建完整生态`,
      发展历程: `从[起点]到[现状]的演进之路`,
      展望机遇: `[N]大机遇值得关注`,
      背景问题: `[问题描述]亟待解决`,
      解决方案: `${topic}提供了有效解决方案`,
      核心功能: `[N]大核心功能满足需求`,
      技术架构: `先进架构确保系统稳定`,
      成功案例: `[案例名]验证了方案有效性`,
      未来规划: `[N]个阶段实现愿景目标`,
      行业概述: `${topic}市场规模达[数字]`,
      市场分析: `市场呈现[趋势]态势`,
      竞争格局: `[N]大玩家主导市场格局`,
      趋势预测: `未来[时间]将迎来[变化]`,
      机会风险: `机遇与风险并存`,
      战略建议: `[N]条建议把握机遇`,
    };

    return viewpointTemplates[phaseName] || `${phaseName}：[需要提炼核心观点]`;
  }

  /**
   * 获取逻辑类型需要的数据
   */
  private getRequiredDataForLogic(logicType: PageLogicType): string[] {
    const dataRequirements: Record<PageLogicType, string[]> = {
      parallel: ["2-5个并列要点", "每个要点的标题和描述"],
      temporal: ["时间节点", "每个节点的事件描述"],
      comparison: ["对比对象A", "对比对象B", "对比维度"],
      data: ["核心数字", "数字说明", "趋势或变化"],
      causal: ["原因/输入", "过程/步骤", "结果/输出"],
      hierarchical: ["层级结构", "各层级描述"],
      case: ["案例背景", "挑战", "解决方案", "成果"],
      narrative: ["标题", "副标题"],
    };
    return dataRequirements[logicType];
  }

  /**
   * 检测页面潜在问题
   */
  private detectPageIssues(
    logicType: PageLogicType,
    templateType: PageTemplateType,
    _phase: { name: string; logicTypes: PageLogicType[] },
  ): string[] {
    const issues: string[] = [];

    // 检查逻辑-模板匹配
    const expectedTemplate = this.logicToTemplate(logicType);
    if (templateType !== expectedTemplate) {
      issues.push(`模板类型 ${templateType} 可能不适合 ${logicType} 逻辑`);
    }

    // 检查数据逻辑是否容易获取数据
    if (logicType === "data") {
      issues.push("⚠️ 需要确保有具体的数字数据支撑");
    }

    // 检查时序逻辑是否有足够时间点
    if (logicType === "temporal") {
      issues.push("⚠️ 需要至少3个时间节点");
    }

    // 检查对比逻辑是否有明确对比对象
    if (logicType === "comparison") {
      issues.push("⚠️ 需要明确的对比对象和维度");
    }

    return issues;
  }

  /**
   * 生成页面改进建议
   */
  private generatePageSuggestions(
    logicType: PageLogicType,
    _phase: { name: string; logicTypes: PageLogicType[] },
  ): string[] {
    const suggestions: string[] = [];

    // 通用建议
    suggestions.push("确保标题是判断句，表达明确观点");

    // 逻辑特定建议
    if (logicType === "parallel") {
      suggestions.push("并列要点数量建议3-5个，过多会分散注意力");
    }

    if (logicType === "data") {
      suggestions.push("数字应该具体且有来源，避免模糊表述");
      suggestions.push("考虑添加同比/环比变化增强说服力");
    }

    if (logicType === "comparison") {
      suggestions.push("对比维度应该与观点直接相关");
      suggestions.push("突出差异，避免面面俱到");
    }

    if (logicType === "temporal") {
      suggestions.push("时间节点应该间隔合理，突出关键转折点");
    }

    return suggestions;
  }

  /**
   * 检测全局问题
   */
  private detectGlobalIssues(pages: DeducedPage[]): string[] {
    const issues: string[] = [];

    // 1. 检查模板多样性
    const templateCounts = new Map<PageTemplateType, number>();
    let consecutiveCount = 1;
    let lastTemplate: PageTemplateType | null = null;

    for (const page of pages) {
      templateCounts.set(
        page.templateType,
        (templateCounts.get(page.templateType) || 0) + 1,
      );

      if (page.templateType === lastTemplate) {
        consecutiveCount++;
        if (consecutiveCount > 2) {
          issues.push(
            `⚠️ 模板 ${page.templateType} 连续使用 ${consecutiveCount} 次，可能造成视觉疲劳`,
          );
        }
      } else {
        consecutiveCount = 1;
      }
      lastTemplate = page.templateType;
    }

    // 2. 检查数据页面比例
    const dataPages = pages.filter((p) => p.logicType === "data").length;
    const contentPages = pages.length - 2; // 减去封面和目录
    if (dataPages / contentPages < 0.2) {
      issues.push("⚠️ 数据页面比例较低，可能缺乏量化支撑");
    }

    // 3. 检查逻辑连贯性
    for (let i = 1; i < pages.length - 1; i++) {
      const prevLogic = pages[i - 1].logicType;
      const currLogic = pages[i].logicType;

      // 连续相同逻辑
      if (prevLogic === currLogic && prevLogic !== "narrative") {
        issues.push(
          `⚠️ 第 ${i} 和 ${i + 1} 页使用相同逻辑类型 ${currLogic}，考虑变化`,
        );
      }
    }

    return issues;
  }

  /**
   * 生成全局建议
   */
  private generateGlobalSuggestions(
    _pages: DeducedPage[],
    category: TopicCategory,
    issues: string[],
  ): string[] {
    const suggestions: string[] = [];

    // 根据主题类型给出建议
    if (category === "geography") {
      suggestions.push("地理主题建议：先区位后人文，最后展望机遇");
      suggestions.push("考虑添加地图或区位示意图增强直观性");
    }

    if (category === "product") {
      suggestions.push("产品主题建议：问题->方案->功能->案例->规划");
      suggestions.push("案例页应该有具体数据支撑");
    }

    if (category === "analysis") {
      suggestions.push("分析报告建议：多使用数据和对比，增强客观性");
      suggestions.push("建议部分应该具体可执行");
    }

    // 根据问题给出建议
    if (issues.some((i) => i.includes("数据页面比例"))) {
      suggestions.push("建议增加 dashboard 或 comparison 类型页面");
    }

    if (issues.some((i) => i.includes("连续使用"))) {
      suggestions.push("建议在相邻页面使用不同模板类型，创造视觉节奏");
    }

    return suggestions;
  }

  /**
   * 预测质量分数
   */
  private predictQuality(pages: DeducedPage[], issues: string[]): number {
    let score = 100;

    // 每个全局问题扣分
    score -= issues.length * 5;

    // 每个页面问题扣分
    for (const page of pages) {
      score -= page.potentialIssues.length * 2;
    }

    // 检查是否有足够的多样性
    const uniqueTemplates = new Set(pages.map((p) => p.templateType)).size;
    if (uniqueTemplates < 4) {
      score -= 10;
    }

    // 检查是否有数据支撑
    const hasDataLogic = pages.some((p) => p.logicType === "data");
    if (!hasDataLogic) {
      score -= 15;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * 提取关键洞察
   */
  private extractKeyInsights(input: ScenarioDeductionInput): string[] {
    const insights: string[] = [];

    if (input.keyPoints && input.keyPoints.length > 0) {
      insights.push(...input.keyPoints);
    }

    // 从主题中提取
    if (input.topic.includes("KANATA") || input.topic.includes("kanata")) {
      insights.push("科技园区/硅谷类主题");
      insights.push("需要产业生态数据");
      insights.push("需要发展历程时间线");
    }

    return insights;
  }

  /**
   * 格式化输出报告（用于日志或展示）
   */
  formatReport(result: ScenarioDeductionResult): string {
    let report = `
# 场景推导报告

## 主题分析
- 类别：${result.topicAnalysis.category}
- 推荐结构：${result.topicAnalysis.suggestedStructure}
- 关键洞察：${result.topicAnalysis.keyInsights.join("、")}

## 页面推导 (${result.pages.length} 页)

| 页码 | 观点 | 逻辑 | 模板 | 问题数 |
|------|------|------|------|--------|
`;

    for (const page of result.pages) {
      const viewpointShort =
        page.viewpoint.length > 20
          ? page.viewpoint.substring(0, 20) + "..."
          : page.viewpoint;
      report += `| ${page.pageNumber} | ${viewpointShort} | ${page.logicType} | ${page.templateType} | ${page.potentialIssues.length} |\n`;
    }

    report += `
## 全局问题 (${result.globalIssues.length})
${result.globalIssues.map((i) => `- ${i}`).join("\n")}

## 改进建议
${result.globalSuggestions.map((s) => `- ${s}`).join("\n")}

## 质量预测：${result.qualityPrediction}/100
`;

    return report;
  }
}
