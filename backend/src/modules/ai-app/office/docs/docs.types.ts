/**
 * AI Docs 类型定义
 */

export type DocsType =
  | "ARTICLE"
  | "RESEARCH"
  | "PROPOSAL"
  | "REPORT"
  | "MEETING_MINUTES";

export type DocsDetailLevel = 1 | 2 | 3; // 1=简洁, 2=适中, 3=详细

export interface DocsGenerationInput {
  userId?: string;
  prompt: string;
  title?: string;
  documentType?: DocsType;
  detailLevel?: DocsDetailLevel;
  language?: "zh-CN" | "en-US" | "auto";
  urls?: string[];
  files?: Array<{
    filename: string;
    mimeType: string;
    buffer: Buffer;
  }>;
  resourceIds?: string[];
  textModelId?: string;
  exportFormat?: "docx" | "pdf" | "markdown" | "html";
}

export interface DocsOutline {
  title: string;
  abstract: string;
  sections: Array<{
    id: string;
    title: string;
    level: number;
    description: string;
    subsections?: Array<{
      id: string;
      title: string;
      description: string;
    }>;
  }>;
  estimatedWordCount: number;
  suggestedStyle: string;
}

export interface DocsSection {
  id: string;
  title: string;
  level: number;
  content: string;
  wordCount: number;
}

export interface DocsDocument {
  id: string;
  userId: string;
  title: string;
  documentType: DocsType;
  outline: DocsOutline;
  sections: DocsSection[];
  fullMarkdown: string;
  metadata: {
    wordCount: number;
    sectionCount: number;
    createdAt: string;
    updatedAt: string;
    generatedAt: string;
    textModelUsed: string;
  };
  status: "draft" | "generating" | "completed" | "failed";
}

export interface DocsStreamEvent {
  type:
    | "progress"
    | "outline_complete"
    | "section_start"
    | "section_content"
    | "section_complete"
    | "complete"
    | "error";
  timestamp: string;
  progress?: {
    phase: string;
    percentage: number;
    message: string;
    currentSection?: number;
    totalSections?: number;
  };
  outline?: DocsOutline;
  section?: {
    index: number;
    title: string;
    content?: string;
  };
  result?: {
    docId: string;
    totalSections: number;
    wordCount: number;
    duration: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

// 文档模板
export interface DocsTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  documentType: DocsType;
  outlinePrompt: string;
  sectionPrompts: Record<string, string>;
}

export const DOCS_TEMPLATES: DocsTemplate[] = [
  {
    id: "research-report",
    name: "研究报告",
    description: "深度研究分析报告",
    icon: "📊",
    documentType: "RESEARCH",
    outlinePrompt:
      "生成一份专业的研究报告大纲，包含摘要、背景、方法论、发现、分析和结论",
    sectionPrompts: {
      abstract: "撰写研究摘要，概述研究目的、方法和主要发现",
      background: "介绍研究背景和相关文献回顾",
      methodology: "描述研究方法和数据来源",
      findings: "详细阐述研究发现和数据分析",
      conclusion: "总结研究结论和建议",
    },
  },
  {
    id: "business-proposal",
    name: "商业提案",
    description: "商业计划和提案文档",
    icon: "💼",
    documentType: "PROPOSAL",
    outlinePrompt:
      "生成一份商业提案大纲，包含执行摘要、问题分析、解决方案、实施计划和预算",
    sectionPrompts: {
      executive_summary: "撰写执行摘要，简要说明提案核心内容",
      problem_statement: "分析当前问题和痛点",
      solution: "详细描述解决方案",
      implementation: "制定实施计划和时间表",
      budget: "提供预算和投资回报分析",
    },
  },
  {
    id: "technical-doc",
    name: "技术文档",
    description: "技术规范和说明文档",
    icon: "📖",
    documentType: "ARTICLE",
    outlinePrompt:
      "生成技术文档大纲，包含概述、架构设计、实现细节、API说明和部署指南",
    sectionPrompts: {
      overview: "概述系统或功能的目的和范围",
      architecture: "描述系统架构和设计决策",
      implementation: "详细说明实现细节",
      api: "提供API文档和使用示例",
      deployment: "编写部署和配置指南",
    },
  },
  {
    id: "meeting-minutes",
    name: "会议纪要",
    description: "会议记录和行动项",
    icon: "📝",
    documentType: "MEETING_MINUTES",
    outlinePrompt:
      "生成会议纪要大纲，包含会议信息、议程、讨论要点、决议和行动项",
    sectionPrompts: {
      info: "记录会议基本信息（时间、地点、参会人）",
      agenda: "列出会议议程",
      discussion: "记录讨论要点",
      decisions: "总结会议决议",
      action_items: "列出行动项和负责人",
    },
  },
  {
    id: "article",
    name: "文章创作",
    description: "各类文章和博客",
    icon: "✍️",
    documentType: "ARTICLE",
    outlinePrompt: "生成文章大纲，包含引言、主体段落和结论",
    sectionPrompts: {
      introduction: "撰写引人入胜的引言",
      body: "展开主题的详细论述",
      conclusion: "总结要点并提出思考",
    },
  },
];
