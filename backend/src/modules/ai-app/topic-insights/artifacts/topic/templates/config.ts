/**
 * Dimension templates · per-topicType defaults.
 *
 * F1 · Restores the per-type default dimension sets deleted by H6 step 11.
 * `queryTemplates` uses `{topicName}` placeholders that are substituted by
 * DimensionTemplatesRepository when `createFromTemplate` materializes a topic.
 *
 * Design notes:
 * - Each topicType has at least one "default" template. Add more for niche
 *   variants without breaking the shape.
 * - `dataSources` use generic source category names that align with
 *   `DataSourceConnectorRegistry` and SearchOrchestrator adapters.
 * - `minSources` scaled to the dimension's research depth expectation.
 */

import { ResearchTopicType } from "@prisma/client";

import type { DimensionTemplate } from "./types";

const MACRO_DEFAULT: DimensionTemplate = {
  id: "macro-default",
  topicType: ResearchTopicType.MACRO,
  name: "宏观洞察（默认）",
  description:
    "面向国家 / 行业 / 领域的宏观研究模板，覆盖政策、市场、竞争、技术、资本与风险 6 个维度。",
  defaultLanguage: "zh",
  defaultIcon: "🌐",
  defaultColor: "#2563EB",
  dimensions: [
    {
      id: "macro-policy",
      name: "政策法规",
      description: "追踪相关政策、监管动态与合规要求",
      purpose:
        "识别影响目标领域的关键政策、法规变更及监管立场，评估合规风险与利好窗口。",
      queryTemplates: [
        "{topicName} 政策法规",
        "{topicName} 监管动态",
        "{topicName} 合规要求",
      ],
      dataSources: ["policy-search", "web-search", "news-search"],
      minSources: 5,
      sortOrder: 1,
    },
    {
      id: "macro-market-size",
      name: "市场规模",
      description: "市场容量、增长速率与细分结构",
      purpose: "量化目标领域的当前规模、增长曲线与细分市场占比。",
      queryTemplates: [
        "{topicName} 市场规模",
        "{topicName} market size forecast",
        "{topicName} 产业报告",
      ],
      dataSources: ["industry-report", "academic-search", "finance-search"],
      minSources: 5,
      sortOrder: 2,
    },
    {
      id: "macro-competition",
      name: "竞争格局",
      description: "主要玩家、市场份额与竞争动态",
      purpose: "映射头部玩家、份额分布与近期竞争事件。",
      queryTemplates: [
        "{topicName} 竞争格局",
        "{topicName} 市场份额",
        "{topicName} 主要企业",
      ],
      dataSources: ["web-search", "finance-search", "industry-report"],
      minSources: 5,
      sortOrder: 3,
    },
    {
      id: "macro-tech-trends",
      name: "技术趋势",
      description: "技术演进路线、关键突破与研发焦点",
      purpose: "梳理对目标领域影响最大的技术演进方向与 R&D 投入热点。",
      queryTemplates: [
        "{topicName} 技术趋势",
        "{topicName} R&D",
        "{topicName} 技术路线",
      ],
      dataSources: ["academic-search", "web-search", "github-search"],
      minSources: 4,
      sortOrder: 4,
    },
    {
      id: "macro-capital",
      name: "投融资动向",
      description: "VC/PE 投资、并购与资本市场信号",
      purpose: "识别近 12-24 个月的资本流向、重大融资与 M&A 事件。",
      queryTemplates: [
        "{topicName} 投融资",
        "{topicName} 融资事件",
        "{topicName} 并购",
      ],
      dataSources: ["finance-search", "news-search", "web-search"],
      minSources: 5,
      sortOrder: 5,
    },
    {
      id: "macro-risks",
      name: "关键风险",
      description: "地缘政治、供应链、监管与技术卡点",
      purpose: "盘点可能影响行业稳定的宏观风险因子与缓解手段。",
      queryTemplates: [
        "{topicName} 风险",
        "{topicName} 不确定性",
        "{topicName} 挑战",
      ],
      dataSources: ["news-search", "policy-search", "web-search"],
      minSources: 4,
      sortOrder: 6,
    },
  ],
};

const TECHNOLOGY_DEFAULT: DimensionTemplate = {
  id: "technology-default",
  topicType: ResearchTopicType.TECHNOLOGY,
  name: "技术深度（默认）",
  description:
    "面向单一技术的深度分析模板，覆盖原理、成熟度、应用、标准、玩家与未来 6 个维度。",
  defaultLanguage: "zh",
  defaultIcon: "🔬",
  defaultColor: "#7C3AED",
  dimensions: [
    {
      id: "technology-principles",
      name: "技术原理",
      description: "核心机制、关键技术指标与物理 / 算法约束",
      purpose: "解释目标技术的工作原理、关键指标与原理性上限。",
      queryTemplates: [
        "{topicName} 技术原理",
        "{topicName} how it works",
        "{topicName} 核心机制",
      ],
      dataSources: ["academic-search", "web-search", "github-search"],
      minSources: 5,
      sortOrder: 1,
    },
    {
      id: "technology-maturity",
      name: "成熟度曲线",
      description: "TRL / Gartner Hype Cycle 定位与产业化进展",
      purpose: "判断当前所处成熟阶段与距离大规模商用的 gap。",
      queryTemplates: [
        "{topicName} 成熟度",
        "{topicName} Gartner Hype Cycle",
        "{topicName} TRL",
      ],
      dataSources: ["industry-report", "academic-search", "web-search"],
      minSources: 4,
      sortOrder: 2,
    },
    {
      id: "technology-applications",
      name: "应用场景",
      description: "已落地场景、落地企业与商业模式",
      purpose: "枚举代表性落地案例与对应商业价值。",
      queryTemplates: [
        "{topicName} 应用场景",
        "{topicName} case study",
        "{topicName} 商业落地",
      ],
      dataSources: ["web-search", "news-search", "industry-report"],
      minSources: 5,
      sortOrder: 3,
    },
    {
      id: "technology-standards",
      name: "标准与专利",
      description: "国际 / 国内标准、专利布局与关键 IP",
      purpose: "识别标准化进展与专利护城河的分布。",
      queryTemplates: [
        "{topicName} 标准",
        "{topicName} patent",
        "{topicName} IEEE ISO",
      ],
      dataSources: ["academic-search", "policy-search", "web-search"],
      minSources: 4,
      sortOrder: 4,
    },
    {
      id: "technology-players",
      name: "主要玩家",
      description: "头部企业、研究机构与开源社区",
      purpose: "列出在该技术上有决定性影响力的实体。",
      queryTemplates: [
        "{topicName} 主要企业",
        "{topicName} leader companies",
        "{topicName} 开源社区",
      ],
      dataSources: ["web-search", "github-search", "academic-search"],
      minSources: 5,
      sortOrder: 5,
    },
    {
      id: "technology-future",
      name: "未来演进",
      description: "研究前沿、工程卡点与 3-5 年展望",
      purpose: "综合研究前沿与工程约束给出技术 roadmap 展望。",
      queryTemplates: [
        "{topicName} 未来展望",
        "{topicName} roadmap",
        "{topicName} 下一代",
      ],
      dataSources: ["academic-search", "web-search", "industry-report"],
      minSources: 4,
      sortOrder: 6,
    },
  ],
};

const COMPANY_DEFAULT: DimensionTemplate = {
  id: "company-default",
  topicType: ResearchTopicType.COMPANY,
  name: "企业全景（默认）",
  description:
    "面向单家企业的全景分析模板，覆盖概览、产品、财务、竞争、战略与人才 6 个维度。",
  defaultLanguage: "zh",
  defaultIcon: "🏢",
  defaultColor: "#0891B2",
  dimensions: [
    {
      id: "company-overview",
      name: "公司概览",
      description: "业务定位、历史沿革与股权结构",
      purpose: "建立对目标企业基本面的 360° 认知。",
      queryTemplates: [
        "{topicName} 公司介绍",
        "{topicName} 业务范围",
        "{topicName} 股权结构",
      ],
      dataSources: ["web-search", "finance-search", "news-search"],
      minSources: 5,
      sortOrder: 1,
    },
    {
      id: "company-products",
      name: "产品矩阵",
      description: "主要产品线、差异化与客户反馈",
      purpose: "盘点产品组合、核心差异化与用户侧口碑。",
      queryTemplates: [
        "{topicName} 产品",
        "{topicName} product line",
        "{topicName} 用户评价",
      ],
      dataSources: ["web-search", "news-search", "social-search"],
      minSources: 5,
      sortOrder: 2,
    },
    {
      id: "company-financials",
      name: "财务表现",
      description: "收入 / 利润 / 现金流 / 估值",
      purpose: "用最近 3 年财务数据评估经营质量与估值水平。",
      queryTemplates: [
        "{topicName} 财报",
        "{topicName} revenue profit",
        "{topicName} 估值",
      ],
      dataSources: ["finance-search", "industry-report", "web-search"],
      minSources: 4,
      sortOrder: 3,
    },
    {
      id: "company-competition",
      name: "竞争定位",
      description: "直接竞争者、替代品与差异化优势",
      purpose: "定位目标企业在行业中的相对优势与短板。",
      queryTemplates: [
        "{topicName} 竞争对手",
        "{topicName} vs",
        "{topicName} market position",
      ],
      dataSources: ["web-search", "industry-report", "finance-search"],
      minSources: 4,
      sortOrder: 4,
    },
    {
      id: "company-strategy",
      name: "战略方向",
      description: "重大战略、资本动作与关键押注",
      purpose: "追踪近 12 个月内的关键战略动作与未来押注方向。",
      queryTemplates: [
        "{topicName} 战略",
        "{topicName} strategy",
        "{topicName} 收购",
      ],
      dataSources: ["news-search", "web-search", "finance-search"],
      minSources: 4,
      sortOrder: 5,
    },
    {
      id: "company-culture",
      name: "人才与文化",
      description: "领导团队、员工评价与组织文化",
      purpose: "从 people 视角评估企业韧性与吸引力。",
      queryTemplates: [
        "{topicName} 领导团队",
        "{topicName} culture",
        "{topicName} Glassdoor",
      ],
      dataSources: ["web-search", "social-search", "news-search"],
      minSources: 3,
      sortOrder: 6,
    },
  ],
};

const EVENT_DEFAULT: DimensionTemplate = {
  id: "event-default",
  topicType: ResearchTopicType.EVENT,
  name: "事件深挖（默认）",
  description:
    "面向单次事件的来龙去脉分析模板，覆盖经过、参与方、影响、历史对比与走向 5 个维度。",
  defaultLanguage: "zh",
  defaultIcon: "📰",
  defaultColor: "#DC2626",
  dimensions: [
    {
      id: "event-timeline",
      name: "事件经过",
      description: "关键节点、时间线与触发因素",
      purpose: "以时间线形式还原事件全过程。",
      queryTemplates: [
        "{topicName} 时间线",
        "{topicName} 事件经过",
        "{topicName} 起因",
      ],
      dataSources: ["news-search", "web-search"],
      minSources: 5,
      sortOrder: 1,
    },
    {
      id: "event-parties",
      name: "关键参与方",
      description: "各方诉求、立场与动机",
      purpose: "列出事件相关的所有关键方及其立场差异。",
      queryTemplates: [
        "{topicName} 参与方",
        "{topicName} key parties",
        "{topicName} 立场",
      ],
      dataSources: ["news-search", "web-search", "social-search"],
      minSources: 5,
      sortOrder: 2,
    },
    {
      id: "event-impact",
      name: "影响分析",
      description: "短中长期影响、利益相关方与次级效应",
      purpose: "从短中长期三个时间维度量化事件后果。",
      queryTemplates: [
        "{topicName} 影响",
        "{topicName} impact analysis",
        "{topicName} 后果",
      ],
      dataSources: ["news-search", "industry-report", "web-search"],
      minSources: 5,
      sortOrder: 3,
    },
    {
      id: "event-history",
      name: "历史对比",
      description: "类似事件、历史模式与差异点",
      purpose: "用历史相似事件校准预测。",
      queryTemplates: [
        "{topicName} 类似事件",
        "{topicName} 历史案例",
        "similar event {topicName}",
      ],
      dataSources: ["web-search", "academic-search", "news-search"],
      minSources: 4,
      sortOrder: 4,
    },
    {
      id: "event-trajectory",
      name: "后续走向",
      description: "各方下一步、情景推演与关键观察指标",
      purpose: "针对不同情景给出 3-6 个月观察 checklist。",
      queryTemplates: [
        "{topicName} 后续",
        "{topicName} outlook",
        "{topicName} 走向",
      ],
      dataSources: ["news-search", "web-search", "policy-search"],
      minSources: 4,
      sortOrder: 5,
    },
  ],
};

/**
 * All built-in dimension templates. Additional templates can be appended here
 * without touching the repository; the id is the stable key.
 */
export const DIMENSION_TEMPLATES: readonly DimensionTemplate[] = [
  MACRO_DEFAULT,
  TECHNOLOGY_DEFAULT,
  COMPANY_DEFAULT,
  EVENT_DEFAULT,
];
