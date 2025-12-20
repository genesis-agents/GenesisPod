/**
 * AI Office 3.0 - PPT 生成核心类型定义
 *
 * 基于双模型架构：
 * - 文本模型：内容生成、大纲规划、演讲稿
 * - 图像模型：配图生成、背景图像
 *
 * 复用 AI-Image 模块的能力：
 * - ContentExtractorService: 多源内容提取
 * - DataFetchingService: 智能数据获取
 * - InfographicTemplateService: HTML 渲染
 */

// Import types from ai-image for use in this file
import type {
  BackgroundType as AIImageBackgroundType,
  BackgroundDecision as AIImageBackgroundDecision,
  DesignStyle as AIImageDesignStyle,
} from "../../ai-image/core/engine.types";

// Re-export types for use by PPT services
export type BackgroundType = AIImageBackgroundType;
export type BackgroundDecision = AIImageBackgroundDecision;
export type DesignStyle = AIImageDesignStyle;

// ============================================
// 幻灯片目的类型
// ============================================

export type SlidePurpose =
  | "title" // 标题页
  | "agenda" // 议程/目录
  | "section_header" // 章节标题
  | "content" // 常规内容
  | "comparison" // 对比
  | "timeline" // 时间线
  | "statistics" // 数据统计
  | "quote" // 引用
  | "team" // 团队介绍
  | "image_focus" // 图片为主
  | "chart" // 图表
  | "closing" // 结束页
  | "qna"; // Q&A

// ============================================
// 幻灯片布局类型
// ============================================

export type SlideLayoutType =
  | "title_center" // 标题居中
  | "title_subtitle" // 标题+副标题
  | "text_only" // 纯文本
  | "text_image_left" // 左图右文
  | "text_image_right" // 左文右图
  | "image_full" // 全屏图片
  | "image_top" // 上图下文
  | "image_bottom" // 上文下图
  | "two_columns" // 双栏
  | "three_columns" // 三栏
  | "cards_grid" // 卡片网格
  | "bullet_points" // 要点列表
  | "numbered_list" // 编号列表
  | "comparison_split" // 对比分割
  | "timeline_horizontal" // 水平时间线
  | "timeline_vertical" // 垂直时间线
  | "statistics_cards" // 统计卡片
  | "chart_with_text" // 图表+文字
  | "quote_highlight" // 引用高亮
  | "team_grid"; // 团队网格

// ============================================
// 幻灯片规格定义（规划阶段输出）
// ============================================

export interface SlideSpec {
  id: string;
  index: number; // 页码（从0开始）

  // 内容规划
  purpose: SlidePurpose;
  title: string;
  contentOutline: string[]; // 内容大纲要点
  speakerNotesOutline?: string; // 演讲者备注概要

  // 布局决策
  layoutType: SlideLayoutType;
  layoutReasoning: string; // 为什么选择这个布局

  // 背景决策（复用 AI-Image 的类型）
  backgroundDecision: BackgroundDecision;

  // 图像规划（如果需要）
  imageSpec?: SlideImageSpec;

  // 图表规划（如果需要）
  chartSpec?: SlideChartSpec;

  // 预估生成时间（毫秒）
  estimatedGenerationTime?: number;
}

export interface SlideImageSpec {
  prompt: string; // 图像生成提示词
  promptZh?: string; // 中文提示词（用于显示）
  position:
    | "background"
    | "left"
    | "right"
    | "top"
    | "bottom"
    | "center"
    | "grid";
  style: string; // 风格要求
  aspectRatio: "16:9" | "4:3" | "1:1" | "9:16";
  negativePrompt?: string;
}

export interface SlideChartSpec {
  type:
    | "bar"
    | "line"
    | "pie"
    | "donut"
    | "radar"
    | "funnel"
    | "timeline"
    | "area";
  title: string;
  data: ChartDataPoint[];
  config?: Record<string, unknown>;
}

export interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
  comparison?: string;
}

// ============================================
// 生成的幻灯片内容
// ============================================

export interface GeneratedSlideContent {
  title: string;
  subtitle?: string;
  bodyText?: string;
  bulletPoints?: string[];
  numberedItems?: string[];
  speakerNotes?: string;
  highlightText?: string; // 需要强调的关键词或数字
  quote?: {
    text: string;
    author?: string;
    source?: string;
  };
  statistics?: Array<{
    label: string;
    value: string;
    comparison?: string;
    trend?: "up" | "down" | "stable";
  }>;
  teamMembers?: Array<{
    name: string;
    role: string;
    avatar?: string;
  }>;
}

export interface GeneratedSlideImage {
  url: string;
  prompt: string;
  modelUsed: string;
  position: string;
  width: number;
  height: number;
  generatedAt: string;
}

// ============================================
// 完整的生成幻灯片
// ============================================

export interface GeneratedSlide {
  id: string;
  index: number;
  spec: SlideSpec; // 原始规格

  // 生成的内容
  content: GeneratedSlideContent;

  // 生成的图像（可能有多个）
  images: GeneratedSlideImage[];

  // 渲染后的 HTML（用于预览）
  renderedHtml?: string;

  // 编辑状态
  isEdited: boolean;
  editHistory: SlideEdit[];

  // 生成元数据
  generationMetadata: {
    textModelUsed: string;
    imageModelUsed?: string;
    contentGeneratedAt: string;
    imagesGeneratedAt?: string;
    renderTime?: number;
  };
}

export interface SlideEdit {
  id: string;
  timestamp: string;
  type: "content" | "layout" | "image" | "style";
  before: unknown;
  after: unknown;
  userId?: string;
}

// ============================================
// PPT 大纲
// ============================================

export interface PPTOutline {
  title: string;
  subtitle?: string;
  estimatedDuration: number; // 预计演讲时长（分钟）
  targetAudience?: string;
  slides: SlideOutlineItem[];
  suggestedTheme?: string;
}

export interface SlideOutlineItem {
  index: number;
  purpose: SlidePurpose;
  title: string;
  keyPoints: string[];
  needsImage: boolean;
  needsChart: boolean;
  // 新增：专业设计师视角的字段
  visualIntent?: string; // 视觉设计意图
  imageHint?: string; // 图像类型提示（如 'abstract tech pattern', 'team collaboration photo'）
  emphasis?: "high" | "medium" | "low"; // 视觉强调程度（用于确定是否为"hero"幻灯片）
}

// 扩展的大纲信息（AI返回的完整结构）
export interface PPTOutlineExtended extends PPTOutline {
  narrativeArc?: string; // 叙事弧线描述
}

// ============================================
// PPT 主题
// ============================================

export interface PPTTheme {
  id: string;
  name: string;
  nameZh: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    backgroundSecondary: string;
    text: string;
    textLight: string;
    textMuted: string;
  };
  fonts: {
    heading: string;
    body: string;
    mono?: string;
  };
  style: DesignStyle;
  borderRadius: "none" | "small" | "medium" | "large";
  shadowStyle: "none" | "subtle" | "medium" | "strong";
}

// 预设主题
export const PPT_THEMES: Record<string, PPTTheme> = {
  professional: {
    id: "professional",
    name: "Professional",
    nameZh: "专业商务",
    colors: {
      primary: "#1e3a5f",
      secondary: "#0891b2",
      accent: "#f59e0b",
      background: "#ffffff",
      backgroundSecondary: "#f8fafc",
      text: "#1e293b",
      textLight: "#475569",
      textMuted: "#94a3b8",
    },
    fonts: {
      heading: "'Noto Sans SC', sans-serif",
      body: "'Noto Sans SC', sans-serif",
    },
    style: "consulting",
    borderRadius: "medium",
    shadowStyle: "subtle",
  },
  modern: {
    id: "modern",
    name: "Modern Tech",
    nameZh: "现代科技",
    colors: {
      primary: "#6366f1",
      secondary: "#8b5cf6",
      accent: "#22d3ee",
      background: "#0f172a",
      backgroundSecondary: "#1e293b",
      text: "#f1f5f9",
      textLight: "#cbd5e1",
      textMuted: "#64748b",
    },
    fonts: {
      heading: "'Inter', sans-serif",
      body: "'Inter', sans-serif",
    },
    style: "tech_gradient",
    borderRadius: "large",
    shadowStyle: "strong",
  },
  minimal: {
    id: "minimal",
    name: "Minimal",
    nameZh: "极简风格",
    colors: {
      primary: "#18181b",
      secondary: "#3f3f46",
      accent: "#ef4444",
      background: "#ffffff",
      backgroundSecondary: "#fafafa",
      text: "#18181b",
      textLight: "#52525b",
      textMuted: "#a1a1aa",
    },
    fonts: {
      heading: "'Inter', sans-serif",
      body: "'Inter', sans-serif",
    },
    style: "minimal",
    borderRadius: "small",
    shadowStyle: "none",
  },
  creative: {
    id: "creative",
    name: "Creative",
    nameZh: "创意活力",
    colors: {
      primary: "#ec4899",
      secondary: "#8b5cf6",
      accent: "#f59e0b",
      background: "#fdf4ff",
      backgroundSecondary: "#fae8ff",
      text: "#581c87",
      textLight: "#7c3aed",
      textMuted: "#c084fc",
    },
    fonts: {
      heading: "'Poppins', sans-serif",
      body: "'Noto Sans SC', sans-serif",
    },
    style: "creative",
    borderRadius: "large",
    shadowStyle: "medium",
  },
  doraemon: {
    id: "doraemon",
    name: "Doraemon",
    nameZh: "机器猫",
    colors: {
      primary: "#0EA5E9", // 哆啦A梦蓝
      secondary: "#38BDF8", // 天空蓝
      accent: "#EF4444", // 铃铛红/鼻子红
      background: "#F0F9FF", // 浅蓝背景
      backgroundSecondary: "#E0F2FE",
      text: "#0C4A6E", // 深蓝文字
      textLight: "#0284C7",
      textMuted: "#7DD3FC",
    },
    fonts: {
      heading: "'Comic Sans MS', 'Noto Sans SC', cursive",
      body: "'Noto Sans SC', sans-serif",
    },
    style: "creative", // playful/childlike aesthetic
    borderRadius: "large",
    shadowStyle: "medium",
  },
  genspark: {
    id: "genspark",
    name: "Genspark",
    nameZh: "深蓝专业",
    colors: {
      primary: "#0A2B4E",
      secondary: "#1e4976",
      accent: "#3B82F6",
      background: "#0A2B4E",
      backgroundSecondary: "#0d3a66",
      text: "#E5E7EB",
      textLight: "#9CA3AF",
      textMuted: "#6B7280",
    },
    fonts: {
      heading: "'Inter', sans-serif",
      body: "'Noto Sans SC', sans-serif",
    },
    style: "genspark",
    borderRadius: "medium",
    shadowStyle: "strong",
  },

  // ═══════════════════════════════════════════════════════════════════
  // 🌟 PREMIUM THEMES - 高级主题（对标 Genspark 专业级设计）
  // ═══════════════════════════════════════════════════════════════════

  "genspark-pro": {
    id: "genspark-pro",
    name: "Genspark Pro",
    nameZh: "专业深蓝",
    colors: {
      primary: "#0A1628", // 深海军蓝
      secondary: "#1E3A5F", // 中蓝
      accent: "#00D4FF", // 青色高亮
      background: "#0A1628", // 深色背景
      backgroundSecondary: "#1A1A2E", // 渐变过渡色
      text: "#E5E7EB", // 浅灰正文
      textLight: "#FFFFFF", // 白色标题
      textMuted: "#00D4FF", // 青色强调
    },
    fonts: {
      heading: "'Inter', 'SF Pro Display', sans-serif",
      body: "'Inter', 'Noto Sans SC', sans-serif",
    },
    style: "genspark_pro",
    borderRadius: "large",
    shadowStyle: "strong",
  },

  "executive-white": {
    id: "executive-white",
    name: "Executive White",
    nameZh: "商务简约",
    colors: {
      primary: "#1A1A1A", // 纯黑
      secondary: "#374151", // 深灰
      accent: "#0066FF", // 商务蓝
      background: "#FFFFFF", // 纯白背景
      backgroundSecondary: "#F8F9FA", // 浅灰
      text: "#1A1A1A", // 深黑
      textLight: "#6B7280", // 中灰
      textMuted: "#0066FF", // 蓝色强调
    },
    fonts: {
      heading: "'Inter', 'SF Pro Display', sans-serif",
      body: "'Inter', 'Noto Sans SC', sans-serif",
    },
    style: "executive",
    borderRadius: "medium",
    shadowStyle: "subtle",
  },

  "tech-purple": {
    id: "tech-purple",
    name: "Tech Purple",
    nameZh: "科技紫",
    colors: {
      primary: "#1E1B4B", // 深紫
      secondary: "#312E81", // 中紫
      accent: "#A855F7", // 亮紫
      background: "#0F0A1A", // 深紫黑
      backgroundSecondary: "#1E1B4B", // 渐变过渡
      text: "#E5E7EB", // 浅灰
      textLight: "#FFFFFF", // 白色
      textMuted: "#A855F7", // 紫色强调
    },
    fonts: {
      heading: "'Inter', 'SF Pro Display', sans-serif",
      body: "'Inter', 'Noto Sans SC', sans-serif",
    },
    style: "tech_purple",
    borderRadius: "large",
    shadowStyle: "strong",
  },

  "sunset-gradient": {
    id: "sunset-gradient",
    name: "Sunset Gradient",
    nameZh: "日落渐变",
    colors: {
      primary: "#1F1135", // 深紫红
      secondary: "#2D1B4E", // 中紫
      accent: "#F97316", // 橙色
      background: "#1F1135", // 深紫红背景
      backgroundSecondary: "#2D1B4E", // 渐变过渡
      text: "#F3E8FF", // 浅紫白
      textLight: "#FFFFFF", // 白色
      textMuted: "#EC4899", // 粉色强调
    },
    fonts: {
      heading: "'Inter', 'SF Pro Display', sans-serif",
      body: "'Inter', 'Noto Sans SC', sans-serif",
    },
    style: "sunset",
    borderRadius: "large",
    shadowStyle: "strong",
  },
};

// ============================================
// PPT 文档
// ============================================

export interface PPTDocument {
  id: string;
  userId: string;

  // 基本信息
  title: string;
  subtitle?: string;
  theme: PPTTheme;
  aspectRatio: "16:9" | "4:3";
  language: "zh" | "en" | "mixed";

  // 原始输入
  originalInput: {
    prompt?: string;
    urls?: string[];
    files?: string[]; // 文件名列表
    extractedContent?: string;
  };

  // 大纲
  outline: PPTOutline;

  // 幻灯片内容
  slides: GeneratedSlide[];

  // 生成配置
  generationConfig: {
    textModelId: string;
    textModelName: string;
    imageModelId?: string;
    imageModelName?: string;
    includeImages: boolean;
    includeSpeakerNotes: boolean;
    style: string;
  };

  // 版本管理
  versions: PPTVersion[];
  currentVersionId: string;

  // 状态
  status: "draft" | "generating" | "completed" | "failed";
  progress?: {
    phase: "outline" | "planning" | "content" | "images" | "rendering";
    currentSlide?: number;
    totalSlides?: number;
    percentage: number;
    message: string;
  };

  // 元数据
  metadata: {
    slideCount: number;
    wordCount: number;
    imageCount: number;
    estimatedDuration: number;
    createdAt: string;
    updatedAt: string;
    generatedAt?: string;
  };
}

export interface PPTVersion {
  id: string;
  timestamp: string;
  type: "auto" | "manual";
  trigger: "ai_generation" | "user_edit" | "manual_save" | "layout_change";
  description?: string;
  slides: GeneratedSlide[];
  metadata: {
    slideCount: number;
    wordCount: number;
  };
}

// ============================================
// 生成选项（API 输入）
// ============================================

export interface PPTGenerationInput {
  // 输入内容 - 支持多种形式
  prompt?: string; // 直接提示词
  urls?: string[]; // URL 列表
  files?: Array<{
    buffer: Buffer;
    mimeType: string;
    filename: string;
  }>;
  referenceImages?: string[]; // 参考图片（风格参考）

  // 生成配置
  slideCount?: number; // 期望页数（默认自动）
  themeId?: string; // 主题ID
  aspectRatio?: "16:9" | "4:3";
  language?: "zh" | "en" | "auto";

  // 模型选择
  textModelId?: string;
  imageModelId?: string;

  // 高级选项
  includeImages?: boolean; // 是否生成配图（默认true）
  includeSpeakerNotes?: boolean; // 是否生成演讲稿（默认true）
  targetAudience?: string; // 目标受众
  presentationStyle?: "formal" | "casual" | "educational" | "persuasive";

  // 用户信息
  userId?: string;
}

// ============================================
// 单页编辑请求
// ============================================

export interface SlideEditRequest {
  slideId: string;
  action:
    | "regenerate_content" // 重新生成内容
    | "regenerate_image" // 重新生成图像
    | "change_layout" // 更换布局
    | "edit_content" // 直接编辑内容
    | "change_background"; // 更换背景

  // 重新生成内容
  newPrompt?: string;

  // 更换布局
  newLayout?: SlideLayoutType;

  // 重新生成图像
  newImagePrompt?: string;
  newImageStyle?: string;

  // 更换背景
  newBackgroundDecision?: BackgroundDecision;

  // 直接编辑内容
  editedContent?: Partial<GeneratedSlideContent>;
}

// ============================================
// 流式生成事件
// ============================================

export type PPTStreamEventType =
  | "progress" // 进度更新
  | "outline_complete" // 大纲完成
  | "slide_planned" // 单页规划完成
  | "slide_content_complete" // 单页内容完成
  | "slide_image_complete" // 单页图像完成
  | "slide_complete" // 单页全部完成
  | "complete" // 全部完成
  | "error"; // 错误

export interface PPTStreamEvent {
  type: PPTStreamEventType;
  timestamp: string;

  // 进度信息
  progress?: {
    phase: string;
    percentage: number;
    message: string;
    currentSlide?: number;
    totalSlides?: number;
  };

  // 大纲数据
  outline?: PPTOutline;

  // 单页数据
  slide?: {
    index: number;
    spec?: SlideSpec;
    content?: GeneratedSlideContent;
    images?: GeneratedSlideImage[];
    renderedHtml?: string;
  };

  // 完成数据
  result?: {
    pptId: string;
    totalSlides: number;
    duration: number;
  };

  // 错误信息
  error?: {
    code: string;
    message: string;
    slideIndex?: number;
  };
}

// ============================================
// 导出选项
// ============================================

export interface PPTExportOptions {
  format: "pptx" | "pdf" | "png" | "html";
  includeNotes?: boolean;
  quality?: "standard" | "high";
  watermark?: string;
}

export interface PPTExportResult {
  success: boolean;
  url?: string;
  buffer?: Buffer;
  format: string;
  fileSize?: number;
  error?: string;
}
