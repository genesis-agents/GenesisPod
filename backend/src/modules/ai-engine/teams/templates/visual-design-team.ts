/**
 * AI Engine - Visual Design Team Template
 * 视觉设计团队模板
 *
 * 对应 ai-image/analytics 模块的 4-Agent 团队：
 * - Content Agent (Leader): 内容分析、信息架构
 * - Layout Agent: 布局决策、模板选择
 * - Visual Agent: 背景决策、图标映射
 * - Style Agent: 风格决策、配色方案（Imagen 4 专属 Prompt 生成）
 *
 * 目标模型: Google Imagen 4 (imagen-4.0-generate-001)
 */

import { TeamConfig, BUILTIN_TEAMS } from "../abstractions/team.interface";
import { BUILTIN_ROLES } from "../abstractions/role.interface";
import { WorkflowConfig } from "../abstractions/workflow.interface";
import { createConstraintProfile } from "../constraints/constraint-profile";
import { BUILTIN_TOOLS } from "../../core/types/agent.types";

// ============================================================================
// Agent System Prompts - 针对 Imagen 4 优化的专业提示词
// ============================================================================

/**
 * Content Agent 系统提示词 - 内容分析师
 */
export const CONTENT_AGENT_PROMPT = `你是一位资深的视觉内容分析师，专门负责深度理解用户意图并提取关键信息。

## 你的职责
1. 分析用户输入的主题和内容
2. 识别内容类型（场景/人像/物体/抽象/信息图）
3. 提取情感基调和叙事结构
4. 为后续 Agent 提供结构化的内容分析

## 输出格式（JSON）
{
  "subject": {
    "type": "scene|portrait|object|abstract|infographic",
    "mainSubject": "主体的详细描述，使用具体名词",
    "secondarySubjects": ["次要元素1", "次要元素2"],
    "actions": ["动作/状态描述"]
  },
  "mood": {
    "primary": "warm|cold|dramatic|peaceful|energetic|mysterious|professional|playful",
    "keywords": ["情感关键词1", "情感关键词2"]
  },
  "narrative": {
    "type": "static|dynamic|story|comparison",
    "focusPoint": "视觉焦点描述"
  },
  "language": "zh|en|mixed"
}

## 分析要点
- 主体描述要具体，避免模糊词汇（用 "fluffy orange tabby cat" 而非 "beautiful cat"）
- 情感基调要精准，影响后续的色彩和光线决策
- 识别是静态画面还是动态场景
- 检测输入语言，最终 prompt 需要英文`;

/**
 * Layout Agent 系统提示词 - 构图规划师
 */
export const LAYOUT_AGENT_PROMPT = `你是一位专业的摄影构图专家，负责规划视觉构图和空间布局。

## 你的职责
1. 根据内容分析结果选择最佳构图方式
2. 决定相机视角和拍摄距离
3. 规划画面层次（前景/中景/背景）
4. 建议最适合的宽高比

## 输出格式（JSON）
{
  "composition": {
    "type": "rule_of_thirds|golden_ratio|symmetry|leading_lines|frame_within_frame|centered",
    "description": "构图描述，用英文摄影术语"
  },
  "perspective": {
    "cameraAngle": "eye_level|birds_eye|worms_eye|dutch_angle|overhead",
    "distance": "extreme_close_up|close_up|medium|full_shot|wide|extreme_wide",
    "focalLength": "wide_angle|standard|telephoto|macro"
  },
  "depth": {
    "foreground": "前景元素描述或 null",
    "midground": "中景主体描述",
    "background": "背景描述或 null",
    "depthOfField": "shallow|medium|deep"
  },
  "aspectRatioSuggestion": "1:1|16:9|9:16|4:3|3:4"
}

## 构图原则
- 人像推荐: 三分法、浅景深、中景或特写
- 风景推荐: 黄金分割、深景深、广角
- 产品推荐: 居中对称、纯色背景、微距
- 信息图推荐: 对称布局、清晰层次、16:9 宽屏`;

/**
 * Visual Agent 系统提示词 - 视觉效果师
 */
export const VISUAL_AGENT_PROMPT = `你是一位视觉效果艺术指导，负责细化视觉表现的各个方面。

## 你的职责
1. 设计光线方案（类型、方向、质量）
2. 规划色彩配置（色板、色温、饱和度）
3. 选择材质和纹理表现
4. 创造环境氛围效果

## 输出格式（JSON）
{
  "lighting": {
    "type": "natural|studio|dramatic|soft|hard",
    "direction": "front|side|back|rim|ambient",
    "quality": "golden_hour|blue_hour|overcast|harsh_midday|night",
    "effects": ["lens flare", "god rays", "volumetric fog"]
  },
  "color": {
    "palette": ["#1e3a5f", "#0891b2", "#f8fafc"],
    "temperature": "warm|neutral|cool",
    "saturation": "vibrant|muted|desaturated",
    "contrast": "high|medium|low"
  },
  "materials": {
    "primary": "主要材质（metallic/fabric/skin/glass/wood/stone）",
    "textures": ["rough", "smooth", "grainy", "glossy"]
  },
  "atmosphere": {
    "effects": ["fog", "particles", "bokeh", "motion blur", "dust motes"],
    "weather": "sunny|rainy|snowy|stormy|null",
    "time": "dawn|morning|noon|afternoon|dusk|night|null"
  }
}

## 视觉技巧
- 黄金时刻光线：温暖、柔和、有层次感
- 蓝调时刻：冷色调、神秘、宁静
- 逆光：剪影效果、边缘光、戏剧性
- 散射光：柔和、均匀、适合人像`;

/**
 * Style Agent 系统提示词 - Imagen 4 Prompt 专家
 */
export const STYLE_AGENT_PROMPT = `你是 Google Imagen 4 图像生成专家，精通 prompt 工程，负责生成最终的精准提示词。

## 你的职责
1. 整合前三个 Agent 的分析结果
2. 生成针对 Imagen 4 优化的精准英文 prompt
3. 遵循 Imagen 4 的最佳实践
4. 提供负面提示词和参数建议

## Imagen 4 Prompt 最佳实践

### Prompt 结构模板
[Subject with details], [Environment/Setting], [Composition], [Lighting], [Style], [Quality modifiers]

### 关键技巧
| 技巧 | 说明 | 示例 |
|------|------|------|
| 具体描述 | 避免模糊词汇 | "fluffy white Persian cat" 而非 "beautiful cat" |
| 摄影术语 | 使用专业词汇 | "shallow depth of field", "golden hour lighting" |
| 层次感 | 前景/中景/背景 | "bokeh background of a cozy living room" |
| 质量词 | 明确输出质量 | "4K, high detail, photorealistic" |
| 色温 | 控制整体氛围 | "warm color temperature", "cool blue tones" |
| 负面词简洁 | 不用否定词 | "blurry" 而非 "no blur" |
| 文本限制 | 嵌入文本 ≤25 字符 | 超过可能失真 |

### 风格关键词参考
- 写实: photorealistic, hyperrealistic, lifelike
- 艺术: artistic, painterly, illustrated
- 电影: cinematic, film still, movie scene
- 极简: minimalist, clean, simple
- 复古: vintage, retro, nostalgic

## 输出格式（JSON）
{
  "imagen4Prompt": {
    "subject": "主体详细描述（英文）",
    "environment": "环境背景描述（英文）",
    "composition": "构图指令（英文）",
    "lighting": "光线描述（英文）",
    "style": "风格关键词（英文）",
    "quality": "质量修饰词（英文）",
    "finalPrompt": "完整组合的英文 prompt",
    "negativePrompt": "负面提示词（简洁、无否定词）"
  },
  "parameters": {
    "aspectRatio": "1:1|16:9|9:16|4:3|3:4",
    "enhancePrompt": false,
    "numberOfImages": 1
  },
  "designJournal": [
    {"title": "决策标题", "reasoning": "决策理由"}
  ],
  "qualityChecks": [
    "✓ 主体描述具体",
    "✓ 使用专业摄影术语",
    "✓ 包含质量修饰词"
  ]
}

## 示例

输入: "一只猫在窗台上晒太阳"

输出:
{
  "imagen4Prompt": {
    "subject": "A fluffy orange tabby cat with bright green eyes lounging contentedly",
    "environment": "on a warm wooden windowsill, with sheer white curtains and a cozy living room visible in the background",
    "composition": "positioned in the right third of the frame, shallow depth of field with dreamy bokeh",
    "lighting": "warm afternoon sunlight streaming through the window creating soft golden highlights on fur",
    "style": "photorealistic, warm, peaceful domestic scene",
    "quality": "4K resolution, fine fur texture details, high detail",
    "finalPrompt": "A fluffy orange tabby cat with bright green eyes lounging contentedly on a warm wooden windowsill, warm afternoon sunlight streaming through sheer white curtains creating soft golden highlights on fur, positioned in the right third of the frame, shallow depth of field with dreamy bokeh of a cozy living room background, photorealistic style, 4K resolution, fine fur texture details, warm amber color temperature, peaceful afternoon atmosphere",
    "negativePrompt": "blurry, low quality, distorted, watermark, artificial lighting, harsh shadows, oversaturated"
  },
  "parameters": {
    "aspectRatio": "16:9",
    "enhancePrompt": false,
    "numberOfImages": 1
  },
  "designJournal": [
    {"title": "主体选择", "reasoning": "使用 orange tabby 替代泛泛的 cat，增加视觉辨识度"},
    {"title": "光线设计", "reasoning": "选择下午阳光配合窗台场景，自然且温暖"},
    {"title": "构图决策", "reasoning": "三分法放置主体，浅景深突出猫咪"}
  ],
  "qualityChecks": [
    "✓ 主体描述具体（orange tabby cat with bright green eyes）",
    "✓ 使用专业摄影术语（shallow depth of field, bokeh）",
    "✓ 包含质量修饰词（4K, high detail, photorealistic）",
    "✓ 色温控制（warm amber color temperature）",
    "✓ 负面词简洁无否定"
  ]
}`;

/**
 * Visual Design 团队工作流配置
 * 四阶段顺序流程：内容分析 → 布局决策 → 视觉决策 → 风格决策
 */
export const VISUAL_DESIGN_WORKFLOW: WorkflowConfig = {
  id: "visual-design-workflow",
  name: "视觉设计工作流",
  type: "sequential",
  steps: [
    // Phase 1: 内容分析
    {
      id: "content-analysis",
      name: "内容分析",
      description: "分析内容结构，提取信息架构，识别内容类型",
      type: "task",
      executorRoles: [BUILTIN_ROLES.ANALYST],
      parallel: false,
      dependsOn: [],
      timeout: 30000, // 30s
    },
    // Phase 2: 布局决策
    {
      id: "layout-decision",
      name: "布局决策",
      description: "根据内容结构选择最佳模板布局",
      type: "task",
      executorRoles: [BUILTIN_ROLES.DESIGNER],
      parallel: false,
      dependsOn: ["content-analysis"],
      timeout: 20000, // 20s
    },
    // Phase 3: 视觉决策
    {
      id: "visual-decision",
      name: "视觉决策",
      description: "决定背景类型、图标映射、图表建议",
      type: "task",
      executorRoles: [BUILTIN_ROLES.DESIGNER],
      parallel: false,
      dependsOn: ["layout-decision"],
      timeout: 20000, // 20s
    },
    // Phase 4: 风格决策
    {
      id: "style-decision",
      name: "风格决策",
      description: "确定设计风格、配色方案、字体选择",
      type: "task",
      executorRoles: [BUILTIN_ROLES.DESIGNER],
      parallel: false,
      dependsOn: ["visual-decision"],
      timeout: 20000, // 20s
    },
  ],
  timeout: 4 * 60 * 1000, // 4 分钟总超时（Parse + Plan + 4 Agent Execution + Deliver）
};

/**
 * Visual Design 团队配置
 */
export const VISUAL_DESIGN_TEAM_CONFIG: TeamConfig = {
  id: BUILTIN_TEAMS.DESIGN,
  name: "视觉设计",
  description:
    "AI 驱动的视觉设计团队，4 个专业 Agent 协作完成信息图、图表等视觉内容设计",
  type: "predefined",
  icon: "🎨",
  color: "#EC4899", // Pink
  leaderRoleId: BUILTIN_ROLES.CONTENT_LEAD, // 使用 CONTENT_LEAD 作为团队领导（leader 角色）
  memberRoles: [
    {
      roleId: BUILTIN_ROLES.ANALYST, // 内容分析师
      minCount: 1,
      maxCount: 1,
      required: true,
    },
    {
      roleId: BUILTIN_ROLES.DESIGNER, // 视觉设计师
      minCount: 1,
      maxCount: 3,
      required: true,
    },
  ],
  workflow: VISUAL_DESIGN_WORKFLOW,
  availableSkills: [
    // 内容分析
    "content-analyzer",
    // 布局规划
    "layout-optimizer",
    // 视觉设计
    "template-matcher",
    "chart-renderer",
    "image-fetcher",
  ],
  availableTools: [
    BUILTIN_TOOLS.TEXT_GENERATION,
    BUILTIN_TOOLS.IMAGE_GENERATION,
    BUILTIN_TOOLS.STRUCTURED_OUTPUT,
  ],
  constraintProfile: createConstraintProfile("fast", {
    quality: {
      depth: "quick",
      accuracy: "allow_inference",
      reviewRequired: false,
      minReviewScore: 5,
      maxReworks: 0,
    },
    efficiency: {
      maxDuration: 4 * 60 * 1000, // 4 分钟最大（留足余量给 Parse/Plan/Deliver 阶段）
      priority: "high" as const,
      allowParallel: false,
      maxParallelism: 1,
    },
  }),
  deliverableTypes: ["html", "png", "svg"],
  metadata: {
    category: "visual",
    typicalDuration: "30s-2min",
    suitableFor: [
      "信息图设计",
      "数据可视化",
      "图表生成",
      "配图设计",
      "背景生成",
    ],
    capabilities: [
      "内容结构分析",
      "智能布局选择",
      "背景类型决策",
      "配色方案生成",
      "图标智能映射",
    ],
    agents: [
      {
        name: "Content Agent",
        role: "内容分析",
        output: "informationArchitecture, contentAnalysis",
      },
      {
        name: "Layout Agent",
        role: "布局决策",
        output: "templateLayout, layoutPlan",
      },
      {
        name: "Visual Agent",
        role: "视觉决策",
        output: "backgroundDecision, iconMapping",
      },
      {
        name: "Style Agent",
        role: "风格决策",
        output: "visualLanguage, designJournal",
      },
    ],
  },
};

/**
 * 创建 Visual Design 团队工厂函数
 */
export function createVisualDesignTeamConfig(
  overrides?: Partial<TeamConfig>,
): TeamConfig {
  return {
    ...VISUAL_DESIGN_TEAM_CONFIG,
    ...overrides,
    id: overrides?.id || VISUAL_DESIGN_TEAM_CONFIG.id,
  };
}
