/**
 * AI Office 3.0 - PPT 前端类型定义
 *
 * 与后端 ppt.types.ts 保持同步
 */

// ============================================
// 幻灯片目的类型
// ============================================

export type SlidePurpose =
  | 'title'
  | 'agenda'
  | 'section_header'
  | 'content'
  | 'comparison'
  | 'timeline'
  | 'statistics'
  | 'quote'
  | 'team'
  | 'image_focus'
  | 'chart'
  | 'closing'
  | 'qna';

// ============================================
// 幻灯片布局类型
// ============================================

export type SlideLayoutType =
  | 'title_center'
  | 'title_subtitle'
  | 'text_only'
  | 'text_image_left'
  | 'text_image_right'
  | 'image_full'
  | 'image_top'
  | 'image_bottom'
  | 'two_columns'
  | 'three_columns'
  | 'cards_grid'
  | 'bullet_points'
  | 'numbered_list'
  | 'comparison_split'
  | 'timeline_horizontal'
  | 'timeline_vertical'
  | 'statistics_cards'
  | 'chart_with_text'
  | 'quote_highlight'
  | 'team_grid';

// ============================================
// 背景类型
// ============================================

export type BackgroundType = 'solid' | 'gradient' | 'ai_generated';

export interface BackgroundDecision {
  type: BackgroundType;
  reasoning: string;
  colors?: {
    primary: string;
    secondary?: string;
    direction?: 'horizontal' | 'vertical' | 'diagonal' | 'radial';
  };
  aiConfig?: {
    prompt: string;
    style: string;
    colorTone: string;
    complexity: 'minimal' | 'moderate' | 'detailed';
  };
}

// ============================================
// 幻灯片规格
// ============================================

export interface SlideSpec {
  id: string;
  index: number;
  purpose: SlidePurpose;
  title: string;
  contentOutline: string[];
  speakerNotesOutline?: string;
  layoutType: SlideLayoutType;
  layoutReasoning: string;
  backgroundDecision: BackgroundDecision;
  imageSpec?: SlideImageSpec;
  chartSpec?: SlideChartSpec;
  estimatedGenerationTime?: number;
}

export interface SlideImageSpec {
  prompt: string;
  promptZh?: string;
  position:
    | 'background'
    | 'left'
    | 'right'
    | 'top'
    | 'bottom'
    | 'center'
    | 'grid';
  style: string;
  aspectRatio: '16:9' | '4:3' | '1:1' | '9:16';
  negativePrompt?: string;
}

export interface SlideChartSpec {
  type:
    | 'bar'
    | 'line'
    | 'pie'
    | 'donut'
    | 'radar'
    | 'funnel'
    | 'timeline'
    | 'area';
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
  highlightText?: string;
  quote?: {
    text: string;
    author?: string;
    source?: string;
  };
  statistics?: Array<{
    label: string;
    value: string;
    comparison?: string;
    trend?: 'up' | 'down' | 'stable';
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
  spec: SlideSpec;
  content: GeneratedSlideContent;
  images: GeneratedSlideImage[];
  renderedHtml?: string;
  isEdited: boolean;
  editHistory: SlideEdit[];
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
  type: 'content' | 'layout' | 'image' | 'style';
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
  estimatedDuration: number;
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
}

// ============================================
// PPT 主题
// ============================================

export type DesignStyle =
  | 'consulting'
  | 'tech'
  | 'minimal'
  | 'creative'
  | 'dark'
  | 'academic'
  | 'business'
  | 'genspark'
  | 'tech_gradient';

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
  borderRadius: 'none' | 'small' | 'medium' | 'large';
  shadowStyle: 'none' | 'subtle' | 'medium' | 'strong';
}

// ============================================
// PPT 文档
// ============================================

export interface PPTDocument {
  id: string;
  userId: string;
  title: string;
  subtitle?: string;
  theme: PPTTheme;
  aspectRatio: '16:9' | '4:3';
  language: 'zh' | 'en' | 'mixed';
  originalInput: {
    prompt?: string;
    urls?: string[];
    files?: string[];
    extractedContent?: string;
  };
  outline: PPTOutline;
  slides: GeneratedSlide[];
  generationConfig: {
    textModelId: string;
    textModelName: string;
    imageModelId?: string;
    imageModelName?: string;
    includeImages: boolean;
    includeSpeakerNotes: boolean;
    style: string;
  };
  versions: PPTVersion[];
  currentVersionId: string;
  status: 'draft' | 'generating' | 'completed' | 'failed';
  progress?: {
    phase: 'outline' | 'planning' | 'content' | 'images' | 'rendering';
    currentSlide?: number;
    totalSlides?: number;
    percentage: number;
    message: string;
  };
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
  type: 'auto' | 'manual';
  trigger: 'ai_generation' | 'user_edit' | 'manual_save' | 'layout_change';
  description?: string;
  slides: GeneratedSlide[];
  metadata: {
    slideCount: number;
    wordCount: number;
  };
}

// ============================================
// 生成选项
// ============================================

export interface PPTGenerationInput {
  prompt?: string;
  urls?: string[];
  files?: File[];
  referenceImages?: string[];
  slideCount?: number;
  themeId?: string;
  aspectRatio?: '16:9' | '4:3';
  language?: 'zh' | 'en' | 'auto';
  textModelId?: string;
  imageModelId?: string;
  includeImages?: boolean;
  includeSpeakerNotes?: boolean;
  targetAudience?: string;
  presentationStyle?: 'formal' | 'casual' | 'educational' | 'persuasive';
}

// ============================================
// 流式生成事件
// ============================================

export type PPTStreamEventType =
  | 'progress'
  | 'outline_complete'
  | 'slide_planned'
  | 'slide_content_complete'
  | 'slide_image_complete'
  | 'slide_complete'
  | 'complete'
  | 'error';

export interface PPTStreamEvent {
  type: PPTStreamEventType;
  timestamp: string;
  progress?: {
    phase: string;
    percentage: number;
    message: string;
    currentSlide?: number;
    totalSlides?: number;
  };
  outline?: PPTOutline;
  slide?: {
    index: number;
    spec?: SlideSpec;
    content?: GeneratedSlideContent;
    images?: GeneratedSlideImage[];
    renderedHtml?: string;
  };
  result?: {
    pptId: string;
    totalSlides: number;
    duration: number;
  };
  error?: {
    code: string;
    message: string;
    slideIndex?: number;
  };
}

// ============================================
// 编辑请求
// ============================================

export interface SlideEditRequest {
  slideId: string;
  action:
    | 'regenerate_content'
    | 'regenerate_image'
    | 'change_layout'
    | 'edit_content'
    | 'change_background';
  newPrompt?: string;
  newLayout?: SlideLayoutType;
  newImagePrompt?: string;
  newImageStyle?: string;
  newBackgroundDecision?: BackgroundDecision;
  editedContent?: Partial<GeneratedSlideContent>;
}

// ============================================
// 导出选项
// ============================================

export interface PPTExportOptions {
  format: 'pptx' | 'pdf' | 'png' | 'html';
  includeNotes?: boolean;
  quality?: 'standard' | 'high';
  watermark?: string;
}

// ============================================
// 预设主题列表
// ============================================

export const PPT_THEME_LIST: Array<{
  id: string;
  name: string;
  nameZh: string;
  style: DesignStyle;
  preview: string; // 预览颜色
}> = [
  {
    id: 'professional',
    name: 'Professional',
    nameZh: '专业商务',
    style: 'consulting',
    preview: '#1e3a5f',
  },
  {
    id: 'modern',
    name: 'Modern Tech',
    nameZh: '现代科技',
    style: 'tech_gradient',
    preview: '#6366f1',
  },
  {
    id: 'minimal',
    name: 'Minimal',
    nameZh: '极简风格',
    style: 'minimal',
    preview: '#18181b',
  },
  {
    id: 'creative',
    name: 'Creative',
    nameZh: '创意活力',
    style: 'creative',
    preview: '#ec4899',
  },
  {
    id: 'genspark',
    name: 'Genspark',
    nameZh: '深蓝专业',
    style: 'genspark',
    preview: '#0A2B4E',
  },
];

// ============================================
// 布局选项列表
// ============================================

export const LAYOUT_OPTIONS: Array<{
  value: SlideLayoutType;
  label: string;
  labelZh: string;
  description: string;
  icon: string;
}> = [
  {
    value: 'title_center',
    label: 'Title Center',
    labelZh: '标题居中',
    description: 'Centered title for title slides',
    icon: 'layout',
  },
  {
    value: 'text_image_right',
    label: 'Text + Image Right',
    labelZh: '左文右图',
    description: 'Text on left, image on right',
    icon: 'layout-sidebar-right',
  },
  {
    value: 'text_image_left',
    label: 'Text + Image Left',
    labelZh: '左图右文',
    description: 'Image on left, text on right',
    icon: 'layout-sidebar',
  },
  {
    value: 'bullet_points',
    label: 'Bullet Points',
    labelZh: '要点列表',
    description: 'Simple bullet point list',
    icon: 'list',
  },
  {
    value: 'two_columns',
    label: 'Two Columns',
    labelZh: '双栏布局',
    description: 'Content split into two columns',
    icon: 'columns',
  },
  {
    value: 'statistics_cards',
    label: 'Statistics',
    labelZh: '数据统计',
    description: 'Cards showing key metrics',
    icon: 'bar-chart',
  },
  {
    value: 'comparison_split',
    label: 'Comparison',
    labelZh: '对比布局',
    description: 'Side by side comparison',
    icon: 'git-compare',
  },
  {
    value: 'timeline_horizontal',
    label: 'Timeline',
    labelZh: '时间线',
    description: 'Horizontal timeline layout',
    icon: 'git-branch',
  },
  {
    value: 'quote_highlight',
    label: 'Quote',
    labelZh: '引用高亮',
    description: 'Highlighted quote',
    icon: 'quote',
  },
  {
    value: 'image_full',
    label: 'Full Image',
    labelZh: '全屏图片',
    description: 'Full screen image with text overlay',
    icon: 'image',
  },
];
