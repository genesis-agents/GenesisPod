/**
 * AI Designer 类型定义
 */

export type DesignType =
  | "infographic"
  | "poster"
  | "data_viz"
  | "process_flow"
  | "comparison"
  | "timeline";
export type DesignStyle =
  | "consulting"
  | "tech"
  | "minimal"
  | "creative"
  | "dark"
  | "colorful";
export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:3" | "A4";
export type LayoutType =
  | "cards"
  | "center_visual"
  | "timeline"
  | "comparison"
  | "statistics"
  | "pyramid"
  | "flow";

export interface DesignerGenerationInput {
  userId?: string;
  prompt: string;
  title?: string;
  designType?: DesignType;
  style?: DesignStyle;
  aspectRatio?: AspectRatio;
  layout?: LayoutType;
  language?: "zh-CN" | "en-US" | "auto";
  urls?: string[];
  files?: Array<{
    filename: string;
    mimeType: string;
    buffer: Buffer;
  }>;
  resourceIds?: string[];
  textModelId?: string;
  imageModelId?: string;
  includeImages?: boolean;
  colorScheme?: string[];
}

export interface DesignSpec {
  title: string;
  subtitle?: string;
  layout: LayoutType;
  style: DesignStyle;
  aspectRatio: AspectRatio;
  colorScheme: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  sections: DesignSection[];
  metadata: {
    dataPoints?: number;
    hasChart?: boolean;
    hasIcons?: boolean;
  };
}

export interface DesignSection {
  id: string;
  type:
    | "header"
    | "stat"
    | "chart"
    | "text"
    | "image"
    | "icon_list"
    | "comparison"
    | "timeline_item"
    | "cta";
  title?: string;
  content?: string;
  data?: any; // 图表数据等
  position?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  style?: {
    fontSize?: string;
    fontWeight?: string;
    color?: string;
    backgroundColor?: string;
  };
}

export interface GeneratedDesign {
  id: string;
  spec: DesignSpec;
  renderedHtml: string;
  renderedSvg?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
}

export interface DesignDocument {
  id: string;
  userId: string;
  title: string;
  designType: DesignType;
  spec: DesignSpec;
  design: GeneratedDesign;
  metadata: {
    width: number;
    height: number;
    createdAt: string;
    updatedAt: string;
    generatedAt: string;
    textModelUsed: string;
    imageModelUsed?: string;
  };
  status: "draft" | "generating" | "completed" | "failed";
}

export interface DesignerStreamEvent {
  type:
    | "progress"
    | "spec_complete"
    | "render_start"
    | "render_complete"
    | "complete"
    | "error";
  timestamp: string;
  progress?: {
    phase: string;
    percentage: number;
    message: string;
  };
  spec?: DesignSpec;
  design?: {
    html?: string;
    svg?: string;
    imageUrl?: string;
  };
  result?: {
    designId: string;
    imageUrl: string;
    duration: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

// 设计模板
export interface DesignerTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  designType: DesignType;
  defaultLayout: LayoutType;
  defaultStyle: DesignStyle;
  defaultAspectRatio: AspectRatio;
  examplePrompt: string;
}

export const DESIGNER_TEMPLATES: DesignerTemplate[] = [
  {
    id: "infographic",
    name: "信息图",
    description: "数据驱动的专业信息图",
    icon: "📊",
    designType: "infographic",
    defaultLayout: "statistics",
    defaultStyle: "consulting",
    defaultAspectRatio: "9:16",
    examplePrompt: "创建关于[主题]的信息图，展示关键数据和统计",
  },
  {
    id: "data-viz",
    name: "数据可视化",
    description: "图表和统计数据展示",
    icon: "📈",
    designType: "data_viz",
    defaultLayout: "cards",
    defaultStyle: "tech",
    defaultAspectRatio: "16:9",
    examplePrompt: "可视化[数据类型]数据，使用图表展示趋势",
  },
  {
    id: "process-flow",
    name: "流程图",
    description: "业务流程和步骤说明",
    icon: "🔄",
    designType: "process_flow",
    defaultLayout: "flow",
    defaultStyle: "minimal",
    defaultAspectRatio: "16:9",
    examplePrompt: "绘制[流程名称]的流程图，清晰展示各步骤",
  },
  {
    id: "comparison",
    name: "对比图",
    description: "方案对比和优劣分析",
    icon: "⚖️",
    designType: "comparison",
    defaultLayout: "comparison",
    defaultStyle: "consulting",
    defaultAspectRatio: "16:9",
    examplePrompt: "对比[选项A]和[选项B]的优缺点",
  },
  {
    id: "poster",
    name: "海报设计",
    description: "活动海报和宣传图",
    icon: "🎨",
    designType: "poster",
    defaultLayout: "center_visual",
    defaultStyle: "creative",
    defaultAspectRatio: "9:16",
    examplePrompt: "设计[活动/产品]的宣传海报",
  },
  {
    id: "timeline",
    name: "时间轴",
    description: "历史进程和里程碑",
    icon: "📅",
    designType: "timeline",
    defaultLayout: "timeline",
    defaultStyle: "minimal",
    defaultAspectRatio: "16:9",
    examplePrompt: "创建[主题]的发展时间轴",
  },
];

// 颜色方案预设
export const COLOR_SCHEMES: Record<DesignStyle, DesignSpec["colorScheme"]> = {
  consulting: {
    primary: "#1e3a5f",
    secondary: "#3d6e9e",
    accent: "#e8b84a",
    background: "#ffffff",
    text: "#1a1a1a",
  },
  tech: {
    primary: "#6366f1",
    secondary: "#8b5cf6",
    accent: "#22d3ee",
    background: "#0f172a",
    text: "#f8fafc",
  },
  minimal: {
    primary: "#18181b",
    secondary: "#71717a",
    accent: "#3b82f6",
    background: "#fafafa",
    text: "#18181b",
  },
  creative: {
    primary: "#ec4899",
    secondary: "#f472b6",
    accent: "#fbbf24",
    background: "#fdf2f8",
    text: "#1f2937",
  },
  dark: {
    primary: "#f8fafc",
    secondary: "#94a3b8",
    accent: "#22d3ee",
    background: "#0f172a",
    text: "#f8fafc",
  },
  colorful: {
    primary: "#8b5cf6",
    secondary: "#ec4899",
    accent: "#22d3ee",
    background: "#ffffff",
    text: "#1f2937",
  },
};

// 尺寸配置
export const ASPECT_RATIO_SIZES: Record<
  AspectRatio,
  { width: number; height: number }
> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "4:3": { width: 1440, height: 1080 },
  A4: { width: 794, height: 1123 }, // 96 DPI
};
