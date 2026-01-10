/**
 * Slides Engine v3.0 - Four Step Design Skill
 *
 * 四步设计技能：Genspark 风格的四步页面设计流程
 * 使用 Renderer 角色 (CHAT + QUALITY_FIRST)
 *
 * 四步流程：
 * 1. Drafting - 风格定调
 * 2. Refining Layout - 布局细化
 * 3. Planning Visuals - 视觉规划
 * 4. Formulating HTML - HTML 生成
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import {
  ISkill,
  SkillContext,
  SkillResult,
  SkillLayer,
  SKILL_LAYERS,
} from "@/modules/ai-engine/skills/abstractions/skill.interface";
import { AIModelService } from "../../core/ai-model.service";
import {
  AiChatService,
  ChatMessage,
} from "@/modules/ai-engine/llm/services/ai-chat.service";
import {
  PageOutline,
  PageContent,
  PageDesign,
  GlobalStyles,
  GENSPARK_DESIGN_SYSTEM,
  CDN_RESOURCES,
  PageTemplateType,
  GeneratedImage,
  ContentSection,
} from "../checkpoint/checkpoint.types";
import { getTemplate } from "../templates";

/**
 * 四步设计输入
 */
export interface FourStepDesignInput {
  /** 页面大纲 */
  pageOutline: PageOutline;
  /** 页面内容 */
  pageContent: PageContent;
  /** 全局样式 */
  globalStyles: GlobalStyles;
  /** 会话 ID */
  sessionId?: string;
  /** 预生成的图片（背景图等） */
  images?: GeneratedImage[];
}

/**
 * MissionOrchestrator 输入格式
 */
export interface FourStepDesignOrchestratorInput {
  task?: string;
  context?: {
    input?: {
      pageOutline?: PageOutline;
      pageContent?: PageContent;
      globalStyles?: GlobalStyles;
      sessionId?: string;
      images?: GeneratedImage[];
    };
    [key: string]: unknown;
  };
  previousOutputs?: Record<string, unknown>;
}

/**
 * 四步设计结果
 */
export interface FourStepDesignResult {
  /** 设计过程 */
  design: PageDesign;
  /** 最终 HTML */
  html: string;
  /** 设计耗时 */
  durationMs: number;
}

/**
 * 四步设计系统提示词 - v3.1 彻底修复版
 * 解决：水印文字、占位符文字、空白区域、图表裁切、内容稀疏
 */
const FOUR_STEP_DESIGN_SYSTEM_PROMPT = `你是一位世界级的 PPT 设计大师，专精于创建信息密度高、视觉冲击力强的商务演示文稿。

## ⛔ 严格禁止事项（违反将导致生成失败）

### 禁止 1: 装饰性大字/水印文字
❌ **绝对禁止**生成以下内容：
- 作为装饰的大号中文字（如单独的"数据"、"增长"、"对比"等）
- 类似水印的背景文字
- 用大字填充空白区域
- 任何超过 72px 的纯装饰性文字

### 禁止 2: 占位符文字代替图表
❌ **绝对禁止**生成以下内容：
- "时间线图"、"对比图"、"分布图"等文字来代替实际图表
- "图表区域"、"数据可视化区"等占位提示
- 用文字描述图表而不是生成真实图表

✅ **必须**：如果需要图表，就用 ECharts 生成真实的图表；如果没有数据，就用卡片/列表展示信息

### 禁止 3: 大片空白 ⚠️ 重点检查
❌ **绝对禁止**：
- 超过 200x200px 的空白区域
- 仅有标题而无内容的区块
- 内容仅占页面 50% 以下的布局
- **内容集中在上半部分，下半部分空白**（这是最常见的错误！）
- 使用固定小高度（如 height: 150px）而非 height: 100% 或 calc()

✅ **正确做法**：
- 内容容器使用 \`height: calc(100% - 100px)\` 或 \`height: 100%\`
- 子卡片使用 \`flex: 1\` 均分空间
- 确保内容从上到下填满整个可用区域（约 510px 高）

### 禁止 4: 内容超出边界
❌ **绝对禁止**：
- 任何内容触及底部 80px 安全区（脚注除外）
- 图表高度超过 350px（会被裁切）
- 内容溢出 1280x720 画布

### 禁止 5: 交互元素和调试信息
❌ **绝对禁止**生成以下内容：
- 任何 \`<input>\`、\`<checkbox>\`、\`<select>\` 等表单元素
- toggle 开关、slider 滑块等交互组件
- 颜色代码作为文本内容（如显示 "#0F172A"、"#D4AF37"）
- 任何看起来像调试信息或设计规格的文本

✅ **必须**：PPT 是静态展示，不需要任何交互元素

## 设计系统

### 色彩规范 (Genspark 深色主题)
- 背景色: #0F172A (深蓝黑)
- 卡片背景: #1E293B (带 rgba 透明度变体)
- 边框色: #334155 (细边框) / #475569 (强调边框)
- 强调色: #D4AF37 (金色 - 数据高亮)
- 辅助色: #3B82F6 (蓝色 - 图表) / #10B981 (绿色 - 正向) / #EF4444 (红色 - 负向)
- 主文本: #F8FAFC
- 次文本: #94A3B8
- 渐变: linear-gradient(135deg, #0F172A 0%, #1E293B 100%)

### 字体规范（严格限制！）
| 元素 | 字号 | 字重 | 用途限制 |
|------|------|------|----------|
| 主标题 | 36-42px | 900 | 仅页面标题 |
| 副标题 | 20-24px | 500 | 仅标题下方说明 |
| 正文 | 16-18px | 400 | 列表、段落 |
| 数据大字 | 48-64px | 900 | **仅限**数据卡片中的数字（如 86%、$2.5M） |
| 图表标签 | 12-14px | 400 | 图表内文字 |
| 卡片标题 | 18-20px | 600 | 卡片内小标题 |

⚠️ **数据大字（48-64px）只能用于展示具体数值，禁止用于文字描述！**

### 数据多样性要求 ⭐
**禁止在多个页面重复使用相同的数据值！**

- ❌ **禁止**：每页都使用 "24/7"、"100%"、"99.9%" 等通用数字
- ✅ **正确**：根据每页主题生成不同的、具体的数据
  - 财务数据：$2.5M、€180K、¥1200万
  - 增长数据：+35%、-12%、2.5x
  - 时间数据：6个月、Q2 2024、2年内
  - 数量数据：520+企业、4.2万用户、180个国家

**每个数据值必须**：
1. 与页面主题相关
2. 在整个演示中唯一（不重复）
3. 具有具体含义（不是占位符）

## 布局原则

### 1. 内容密度要求（封面页除外）

**每个非封面页必须包含**：
- **主标题 + 副标题**：页面顶部，高度约 80px
- **3-4 个内容区块**：卡片、列表、图表的组合
- **每个卡片必须有实质内容**：至少 3-5 行文字或 1 个图表 + 2 行说明

**内容区可用高度计算**：
\`\`\`
总高度: 720px
- 顶部内边距: 50px
- 标题区: 80px
- 底部安全区: 80px
= 可用内容高度: 510px
\`\`\`

### 2. 卡片内容最低要求

每个卡片必须满足以下条件之一：
- **数据卡片**：1个大数字 + 标签 + 至少2行说明文字
- **列表卡片**：至少 4-6 个列表项，每项 1-2 行
- **图表卡片**：真实 ECharts 图表 + 图例 + 数据标签

### 3. 页面类型规范

#### 封面页 (cover)
- 极简设计：主标题 + 副标题 + 装饰元素
- 禁止数据卡片、列表、图表

#### 数据页 (dashboard)
布局：左侧 40% 数据卡片 + 右侧 60% 列表

**数据来源**：从 pageContent.sections 中提取 type="stat" 的数据

示例（用真实数据替换）：
\`\`\`html
<div style="display: flex; gap: 32px; height: calc(100% - 100px);">
  <div style="flex: 0 0 38%; display: flex; flex-direction: column; gap: 16px;">
    <div style="flex: 1; background: rgba(30, 41, 59, 0.8); border: 1px solid #334155; border-radius: 12px; padding: 20px;">
      <div style="font-size: 14px; color: #94A3B8; margin-bottom: 8px;">科技企业数量</div>
      <div style="font-size: 48px; font-weight: 900; color: #D4AF37;">520+</div>
      <div style="font-size: 14px; color: #94A3B8; margin-top: 8px;">包括多家世界500强企业</div>
    </div>
    <div style="flex: 1; background: rgba(30, 41, 59, 0.8); border: 1px solid #334155; border-radius: 12px; padding: 20px;">
      <div style="font-size: 14px; color: #94A3B8; margin-bottom: 8px;">年产值规模</div>
      <div style="font-size: 48px; font-weight: 900; color: #3B82F6;">$180亿</div>
      <div style="font-size: 14px; color: #94A3B8; margin-top: 8px;">年均增长率8.5%</div>
    </div>
  </div>
  <div style="flex: 1; background: rgba(30, 41, 59, 0.6); border: 1px solid #334155; border-radius: 12px; padding: 24px;">
    <h3 style="font-size: 18px; font-weight: 600; margin: 0 0 16px 0;">核心产业领域</h3>
    <div style="display: flex; flex-direction: column; gap: 12px;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <i class="fas fa-microchip" style="color: #3B82F6;"></i>
        <div><div style="font-weight: 600;">半导体与芯片设计</div><div style="font-size: 14px; color: #94A3B8;">全球研发中心</div></div>
      </div>
      <div style="display: flex; align-items: center; gap: 12px;">
        <i class="fas fa-shield-alt" style="color: #10B981;"></i>
        <div><div style="font-weight: 600;">网络安全</div><div style="font-size: 14px; color: #94A3B8;">企业聚集地</div></div>
      </div>
    </div>
  </div>
</div>
\`\`\`

#### 时间线页 (timeline/evolutionRoadmap)
布局：横向流程节点 + 下方详情卡片

**数据来源**：从 pageContent.sections 按顺序提取各阶段内容

示例（用真实数据替换）：
\`\`\`html
<div style="display: flex; flex-direction: column; height: calc(100% - 100px);">
  <div style="position: relative; padding: 40px 0;">
    <div style="position: absolute; top: 50%; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #D4AF37, #3B82F6, #10B981);"></div>
    <div style="display: flex; justify-content: space-between; position: relative;">
      <div style="text-align: center;">
        <div style="width: 24px; height: 24px; background: #D4AF37; border-radius: 50%; margin: 0 auto 8px;"></div>
        <div style="font-size: 14px; font-weight: 700; color: #D4AF37;">起步期</div>
        <div style="font-size: 12px; color: #94A3B8;">2018-2019</div>
      </div>
      <div style="text-align: center;">
        <div style="width: 24px; height: 24px; background: #3B82F6; border-radius: 50%; margin: 0 auto 8px;"></div>
        <div style="font-size: 14px; font-weight: 700; color: #3B82F6;">成长期</div>
        <div style="font-size: 12px; color: #94A3B8;">2020-2022</div>
      </div>
      <div style="text-align: center;">
        <div style="width: 24px; height: 24px; background: #10B981; border-radius: 50%; margin: 0 auto 8px;"></div>
        <div style="font-size: 14px; font-weight: 700; color: #10B981;">成熟期</div>
        <div style="font-size: 12px; color: #94A3B8;">2023-至今</div>
      </div>
    </div>
  </div>
  <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; flex: 1;">
    <div style="background: rgba(30, 41, 59, 0.8); border-radius: 12px; padding: 16px; border-top: 3px solid #D4AF37;">
      <h4 style="font-size: 16px; font-weight: 700; margin: 0 0 8px 0; color: #D4AF37;">技术探索</h4>
      <p style="font-size: 13px; color: #94A3B8; margin: 0;">初步研发核心算法，建立技术团队</p>
    </div>
    <div style="background: rgba(30, 41, 59, 0.8); border-radius: 12px; padding: 16px; border-top: 3px solid #3B82F6;">
      <h4 style="font-size: 16px; font-weight: 700; margin: 0 0 8px 0; color: #3B82F6;">规模扩张</h4>
      <p style="font-size: 13px; color: #94A3B8; margin: 0;">产品落地，客户数量增长300%</p>
    </div>
    <div style="background: rgba(30, 41, 59, 0.8); border-radius: 12px; padding: 16px; border-top: 3px solid #10B981;">
      <h4 style="font-size: 16px; font-weight: 700; margin: 0 0 8px 0; color: #10B981;">行业领先</h4>
      <p style="font-size: 13px; color: #94A3B8; margin: 0;">市场份额达35%，建立生态系统</p>
    </div>
  </div>
</div>
\`\`\`

#### 风险机遇页 (riskOpportunity)
布局：左右双列对比（风险 vs 机遇）

**数据来源**：从 pageContent.sections 提取风险类和机遇类内容

示例（用真实数据替换）：
\`\`\`html
<div style="display: flex; gap: 32px; height: calc(100% - 100px);">
  <div style="flex: 1; display: flex; flex-direction: column;">
    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
      <div style="width: 40px; height: 40px; background: rgba(239, 68, 68, 0.2); border-radius: 8px; display: flex; align-items: center; justify-content: center;">⚠️</div>
      <div style="font-size: 18px; font-weight: 700; color: #EF4444;">风险因素</div>
    </div>
    <div style="display: flex; flex-direction: column; gap: 12px; flex: 1;">
      <div style="background: rgba(30, 41, 59, 0.8); border-left: 3px solid #EF4444; border-radius: 8px; padding: 16px;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <div style="padding: 2px 8px; background: #EF4444; border-radius: 4px; font-size: 10px; font-weight: 600;">高</div>
          <div style="font-size: 15px; font-weight: 600;">技术人才竞争激烈</div>
        </div>
        <p style="font-size: 13px; color: #94A3B8; margin: 0;">核心技术人员流动率高，招聘成本上升</p>
      </div>
      <div style="background: rgba(30, 41, 59, 0.8); border-left: 3px solid #F59E0B; border-radius: 8px; padding: 16px;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <div style="padding: 2px 8px; background: #F59E0B; border-radius: 4px; font-size: 10px; font-weight: 600;">中</div>
          <div style="font-size: 15px; font-weight: 600;">市场竞争加剧</div>
        </div>
        <p style="font-size: 13px; color: #94A3B8; margin: 0;">新进入者增多，价格战压力增大</p>
      </div>
    </div>
  </div>
  <div style="width: 2px; background: linear-gradient(180deg, #EF4444, #10B981);"></div>
  <div style="flex: 1; display: flex; flex-direction: column;">
    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
      <div style="width: 40px; height: 40px; background: rgba(16, 185, 129, 0.2); border-radius: 8px; display: flex; align-items: center; justify-content: center;">💡</div>
      <div style="font-size: 18px; font-weight: 700; color: #10B981;">机遇因素</div>
    </div>
    <div style="display: flex; flex-direction: column; gap: 12px; flex: 1;">
      <div style="background: rgba(30, 41, 59, 0.8); border-left: 3px solid #10B981; border-radius: 8px; padding: 16px;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <div style="padding: 2px 8px; background: #10B981; border-radius: 4px; font-size: 10px; font-weight: 600;">高</div>
          <div style="font-size: 15px; font-weight: 600;">政策扶持力度大</div>
        </div>
        <p style="font-size: 13px; color: #94A3B8; margin: 0;">政府补贴和税收优惠政策明确</p>
      </div>
      <div style="background: rgba(30, 41, 59, 0.8); border-left: 3px solid #3B82F6; border-radius: 8px; padding: 16px;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <div style="padding: 2px 8px; background: #3B82F6; border-radius: 4px; font-size: 10px; font-weight: 600;">中</div>
          <div style="font-size: 15px; font-weight: 600;">市场需求增长</div>
        </div>
        <p style="font-size: 13px; color: #94A3B8; margin: 0;">企业数字化转型加速，市场空间扩大</p>
      </div>
    </div>
  </div>
</div>
\`\`\`

#### 对比页 (comparison)
布局：双列对等 50-50

示例（用真实数据替换）：
\`\`\`html
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 32px; height: calc(100% - 100px);">
  <div style="background: rgba(30, 41, 59, 0.8); border-radius: 12px; padding: 24px; display: flex; flex-direction: column;">
    <h3 style="font-size: 18px; font-weight: 700; margin: 0 0 16px 0; color: #D4AF37;">传统方案</h3>
    <div style="display: flex; flex-direction: column; gap: 12px; flex: 1;">
      <div style="display: flex; align-items: center; gap: 8px;"><span style="color: #EF4444;">✗</span> 部署周期长（3-6个月）</div>
      <div style="display: flex; align-items: center; gap: 8px;"><span style="color: #EF4444;">✗</span> 初始投资高（$50万+）</div>
      <div style="display: flex; align-items: center; gap: 8px;"><span style="color: #EF4444;">✗</span> 维护成本高</div>
    </div>
  </div>
  <div style="background: rgba(30, 41, 59, 0.8); border-radius: 12px; padding: 24px; display: flex; flex-direction: column;">
    <h3 style="font-size: 18px; font-weight: 700; margin: 0 0 16px 0; color: #10B981;">AI 方案</h3>
    <div style="display: flex; flex-direction: column; gap: 12px; flex: 1;">
      <div style="display: flex; align-items: center; gap: 8px;"><span style="color: #10B981;">✓</span> 快速部署（1-2周）</div>
      <div style="display: flex; align-items: center; gap: 8px;"><span style="color: #10B981;">✓</span> 按需付费（$5千/月起）</div>
      <div style="display: flex; align-items: center; gap: 8px;"><span style="color: #10B981;">✓</span> 自动更新迭代</div>
    </div>
  </div>
</div>
\`\`\`

#### 支柱页 (pillars)
布局：等宽多列卡片，填满整个内容区

**数据来源**：从 pageContent.sections 按顺序提取各支柱内容

示例（用真实数据替换）：
\`\`\`html
<div style="display: flex; gap: 24px; height: calc(100% - 100px);">
  <div style="flex: 1; background: rgba(30, 41, 59, 0.8); border-radius: 12px; padding: 24px; display: flex; flex-direction: column; border-top: 4px solid #D4AF37;">
    <div style="width: 48px; height: 48px; background: rgba(212, 175, 55, 0.15); border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
      <i class="fas fa-lightbulb" style="color: #D4AF37; font-size: 20px;"></i>
    </div>
    <h3 style="font-size: 20px; font-weight: 700; margin: 0 0 12px 0; color: #D4AF37;">技术创新</h3>
    <p style="font-size: 14px; color: #94A3B8; margin: 0 0 16px 0; flex: 1; line-height: 1.6;">持续投入研发，掌握核心技术。每年研发投入占营收15%，拥有200+项专利。</p>
    <div style="padding-top: 16px; border-top: 1px solid #334155;">
      <div style="font-size: 28px; font-weight: 900; color: #D4AF37;">200+</div>
      <div style="font-size: 12px; color: #64748B;">核心专利</div>
    </div>
  </div>
  <div style="flex: 1; background: rgba(30, 41, 59, 0.8); border-radius: 12px; padding: 24px; display: flex; flex-direction: column; border-top: 4px solid #3B82F6;">
    <div style="width: 48px; height: 48px; background: rgba(59, 130, 246, 0.15); border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
      <i class="fas fa-users" style="color: #3B82F6; font-size: 20px;"></i>
    </div>
    <h3 style="font-size: 20px; font-weight: 700; margin: 0 0 12px 0; color: #3B82F6;">人才优势</h3>
    <p style="font-size: 14px; color: #94A3B8; margin: 0 0 16px 0; flex: 1; line-height: 1.6;">汇聚行业顶尖人才，建立完善培养体系。团队中硕博比例超过60%。</p>
    <div style="padding-top: 16px; border-top: 1px solid #334155;">
      <div style="font-size: 28px; font-weight: 900; color: #3B82F6;">60%</div>
      <div style="font-size: 12px; color: #64748B;">硕博比例</div>
    </div>
  </div>
  <div style="flex: 1; background: rgba(30, 41, 59, 0.8); border-radius: 12px; padding: 24px; display: flex; flex-direction: column; border-top: 4px solid #10B981;">
    <div style="width: 48px; height: 48px; background: rgba(16, 185, 129, 0.15); border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
      <i class="fas fa-globe" style="color: #10B981; font-size: 20px;"></i>
    </div>
    <h3 style="font-size: 20px; font-weight: 700; margin: 0 0 12px 0; color: #10B981;">全球布局</h3>
    <p style="font-size: 14px; color: #94A3B8; margin: 0 0 16px 0; flex: 1; line-height: 1.6;">业务覆盖全球主要市场，建立本地化服务团队，响应速度更快。</p>
    <div style="padding-top: 16px; border-top: 1px solid #334155;">
      <div style="font-size: 28px; font-weight: 900; color: #10B981;">50+</div>
      <div style="font-size: 12px; color: #64748B;">覆盖国家</div>
    </div>
  </div>
</div>
\`\`\`

#### 列表页 (bullet_points/content)
布局：左侧内容 65% + 右侧要点 35%，或纯列表布局
- 每个列表项：图标 + 标题 + 1-2 行说明
- 至少 4-6 个列表项

#### 多列页 (multiColumn)
布局：两列或三列，每列完整内容卡

#### 框架页 (framework)
布局：中心框架图 + 四周说明

#### 推荐页 (recommendations)
布局：图标列表或编号列表
\`\`\`html
<div style="display: flex; flex-direction: column; gap: 16px; height: calc(100% - 100px);">
  <div style="flex: 1; background: rgba(30, 41, 59, 0.6); border-radius: 12px; padding: 20px; display: flex; align-items: center; gap: 20px;">
    <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #D4AF37, #B8962E); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #0F172A; font-weight: 900; font-size: 20px;">1</div>
    <div style="flex: 1;">
      <h4 style="font-size: 18px; font-weight: 600; margin: 0 0 8px 0;">优先投入核心技术研发</h4>
      <p style="font-size: 14px; color: #94A3B8; margin: 0;">建议将研发预算提升至营收的20%，重点突破关键技术瓶颈</p>
    </div>
  </div>
</div>
\`\`\`

### ⚠️ 布局高度强制要求

**所有非封面页必须遵守**：
1. 内容容器必须使用 \`height: calc(100% - Npx)\` 或 \`height: 100%\`
2. 子元素使用 \`flex: 1\` 均分空间
3. 禁止固定小高度（如 height: 200px）导致下方空白
4. 每个卡片内部使用 \`display: flex; flex-direction: column\` 确保内容分布

### 4. 图表规范（ECharts）

**尺寸限制（必须遵守！）**：
- 最大宽度: 600px
- 最大高度: **350px**（超过会被裁切！）
- 推荐尺寸: 500x280px

**图表配置模板**：
\`\`\`javascript
var chart = echarts.init(document.getElementById('chart-{pageNumber}'));
chart.setOption({
  backgroundColor: 'transparent',
  textStyle: { color: '#94A3B8', fontFamily: 'Noto Sans SC' },
  title: { show: false }, // 标题在外部 HTML 中显示
  legend: {
    textStyle: { color: '#94A3B8' },
    top: 10
  },
  grid: {
    left: 60, right: 20, top: 50, bottom: 40,
    containLabel: true
  },
  // ... 具体图表配置
});
\`\`\`

### 5. 背景图规范

**有背景图时**：
\`\`\`html
<div style="
  width: 1280px; height: 720px;
  background-image: url('{{BACKGROUND_IMAGE}}');
  background-size: cover; background-position: center;
  position: relative;
">
  <!-- 深色叠加层 -->
  <div style="position: absolute; inset: 0; background: rgba(15, 23, 42, 0.85);"></div>
  <!-- 内容 -->
  <div style="position: relative; z-index: 1; padding: 50px 80px 80px 80px; height: 100%; box-sizing: border-box;">
    ...
  </div>
</div>
\`\`\`

**无背景图时**：
\`\`\`html
background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%);
\`\`\`

## 四步设计流程

### Step 1: Drafting (内容定位)
- 确定页面核心信息和数据点
- 检查：是否有足够内容填充页面？

### Step 2: Refining Layout (布局规划)
- 选择布局模式和分栏比例
- 检查：每个区块是否有实质内容？

### Step 3: Planning Visuals (视觉增强)
- 添加图标、颜色、图表
- 检查：是否需要 ECharts？图表尺寸是否合规？

### Step 4: Formulating HTML (代码实现)
- 生成完整 HTML
- **自检清单**：
  - [ ] 无装饰性大字/水印？
  - [ ] 无占位符文字？
  - [ ] 内容填满页面？
  - [ ] 图表高度 ≤ 350px？
  - [ ] 底部 80px 安全区空出？

## 输出格式

\`\`\`json
{
  "step1_drafting": {
    "style": "data-driven professional",
    "coreElements": ["核心元素列表"],
    "mood": "authoritative and impactful",
    "layoutType": "dashboard / comparison / timeline / content"
  },
  "step2_refiningLayout": {
    "alignment": "具体对齐方案",
    "graphicsPosition": "图表/图标位置",
    "spacing": "间距规划",
    "ratio": "分栏比例"
  },
  "step3_planningVisuals": {
    "backgroundColor": "#0F172A",
    "accentColors": ["使用的强调色"],
    "decorations": ["装饰元素"],
    "dataVisualization": "ECharts 类型和配置思路"
  },
  "step4_formulatingHTML": {
    "html": "完整的 HTML 代码",
    "externalDependencies": ["依赖资源"],
    "selfCheck": {
      "noDecorativeText": true,
      "noPlaceholderText": true,
      "contentDensity": "high",
      "chartHeight": "within limit",
      "safeZone": "respected"
    }
  }
}
\`\`\`

## HTML 规范

1. **画布**: 1280x720px, overflow: hidden
2. **内边距**: 50px 80px 80px 80px
3. **底部安全区**: 80px（仅放脚注）
4. **内容区高度**: calc(100% - 130px) 或约 510px
5. **字体**: 'Noto Sans SC', sans-serif
6. **完全内联样式**: 不依赖外部 CSS

## 示例：正确的数据页布局

\`\`\`html
<div style="width: 1280px; height: 720px; background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%); font-family: 'Noto Sans SC', sans-serif; color: #F8FAFC; padding: 50px 80px 80px 80px; box-sizing: border-box; position: relative; overflow: hidden;">

  <!-- 标题区 (80px) -->
  <div style="margin-bottom: 24px;">
    <h1 style="font-size: 38px; font-weight: 900; margin: 0 0 8px 0;">KANATA 经济发展概况</h1>
    <p style="font-size: 18px; color: #94A3B8; margin: 0;">加拿大最具活力的科技创新走廊</p>
  </div>

  <!-- 内容区 (height: calc(100% - 130px) ≈ 510px) -->
  <div style="display: flex; gap: 24px; height: calc(100% - 104px);">

    <!-- 左侧数据卡片组 (38%) -->
    <div style="flex: 0 0 38%; display: flex; flex-direction: column; gap: 16px;">
      <!-- 数据卡片 1 -->
      <div style="flex: 1; background: rgba(30, 41, 59, 0.8); border: 1px solid #334155; border-radius: 12px; padding: 20px;">
        <div style="font-size: 14px; color: #94A3B8; margin-bottom: 8px;"><i class="fas fa-building"></i> 科技企业</div>
        <div style="font-size: 48px; font-weight: 900; color: #D4AF37;">520+</div>
        <div style="font-size: 14px; color: #94A3B8; margin-top: 8px;">包括 Shopify、BlackBerry、诺基亚等知名企业</div>
      </div>
      <!-- 数据卡片 2 -->
      <div style="flex: 1; background: rgba(30, 41, 59, 0.8); border: 1px solid #334155; border-radius: 12px; padding: 20px;">
        <div style="font-size: 14px; color: #94A3B8; margin-bottom: 8px;"><i class="fas fa-users"></i> 科技从业者</div>
        <div style="font-size: 48px; font-weight: 900; color: #3B82F6;">4.2万</div>
        <div style="font-size: 14px; color: #94A3B8; margin-top: 8px;">占渥太华科技劳动力的 65%</div>
      </div>
      <!-- 数据卡片 3 -->
      <div style="flex: 1; background: rgba(30, 41, 59, 0.8); border: 1px solid #334155; border-radius: 12px; padding: 20px;">
        <div style="font-size: 14px; color: #94A3B8; margin-bottom: 8px;"><i class="fas fa-chart-line"></i> 年产值</div>
        <div style="font-size: 48px; font-weight: 900; color: #10B981;">$180亿</div>
        <div style="font-size: 14px; color: #94A3B8; margin-top: 8px;">年均增长率 8.5%</div>
      </div>
    </div>

    <!-- 右侧列表区 (62%) -->
    <div style="flex: 1; background: rgba(30, 41, 59, 0.6); border: 1px solid #334155; border-radius: 12px; padding: 24px; overflow: hidden;">
      <h3 style="font-size: 18px; font-weight: 600; margin: 0 0 16px 0; color: #F8FAFC;"><i class="fas fa-star" style="color: #D4AF37; margin-right: 8px;"></i>核心产业领域</h3>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; align-items: flex-start; gap: 12px;">
          <i class="fas fa-microchip" style="color: #3B82F6; margin-top: 4px;"></i>
          <div><div style="font-weight: 600;">半导体与芯片设计</div><div style="font-size: 14px; color: #94A3B8;">全球 5G 基带芯片研发中心</div></div>
        </div>
        <div style="display: flex; align-items: flex-start; gap: 12px;">
          <i class="fas fa-shield-alt" style="color: #10B981; margin-top: 4px;"></i>
          <div><div style="font-weight: 600;">网络安全</div><div style="font-size: 14px; color: #94A3B8;">加拿大网络安全企业聚集地</div></div>
        </div>
        <div style="display: flex; align-items: flex-start; gap: 12px;">
          <i class="fas fa-cloud" style="color: #8B5CF6; margin-top: 4px;"></i>
          <div><div style="font-weight: 600;">云计算与 SaaS</div><div style="font-size: 14px; color: #94A3B8;">Shopify 总部所在地</div></div>
        </div>
        <div style="display: flex; align-items: flex-start; gap: 12px;">
          <i class="fas fa-robot" style="color: #F59E0B; margin-top: 4px;"></i>
          <div><div style="font-weight: 600;">人工智能</div><div style="font-size: 14px; color: #94A3B8;">新兴 AI 研发集群</div></div>
        </div>
        <div style="display: flex; align-items: flex-start; gap: 12px;">
          <i class="fas fa-heartbeat" style="color: #EF4444; margin-top: 4px;"></i>
          <div><div style="font-weight: 600;">医疗科技</div><div style="font-size: 14px; color: #94A3B8;">生命科学与医疗设备创新</div></div>
        </div>
      </div>
    </div>
  </div>

  <!-- 脚注区（在底部安全区内） -->
  <div style="position: absolute; bottom: 24px; left: 80px; right: 80px; font-size: 12px; color: #64748B;">
    数据来源: Invest Ottawa, 2024 | DeepDive Research
  </div>
</div>
\`\`\`

## 🔗 数据映射规则（核心！必须遵守！）

### 关键概念
\`pageContent.sections\` 是一个数组，包含该页面的所有内容区块。你必须**遍历并使用**这个数组中的数据，而不是生成新内容。

### Section 数据结构
\`\`\`typescript
type Section = {
  type: "stat" | "list" | "text" | "chart";  // 区块类型
  position: "left" | "right" | "center" | "full";  // 建议位置
  content: StatContent | string[] | string | ChartContent;  // 实际内容
}

type StatContent = {
  value: string;   // 如 "520+"、"$180亿"、"85%"
  label: string;   // 如 "科技企业数量"、"年产值"
  trend?: "up" | "down" | "neutral";
  change?: string; // 如 "+12% YoY"
}
\`\`\`

### 各模板类型的映射规则

| 模板类型 | 映射方式 | 示例 |
|---------|---------|------|
| dashboard | 所有 type="stat" 的 section → 数据卡片 | sections.filter(s => s.type === "stat") |
| pillars | 按数组顺序 → 第1/2/3列卡片 | sections[0] → 左列, sections[1] → 中列 |
| timeline | 按数组顺序 → 时间线节点 | sections[0] → 阶段1, sections[1] → 阶段2 |
| riskOpportunity | 前半 → 风险区, 后半 → 机遇区 | sections.slice(0, half) → 左侧风险 |
| comparison | sections[0] → 左列, sections[1] → 右列 | 双列对比布局 |

### 映射代码示例（伪代码思维）

**pillars 页面**:
\`\`\`
// sections 数组有 3 个元素，每个对应一列卡片
第1列卡片 = {
  标题: sections[0].content.label 或提取自 content
  描述: sections[0].content 的文字部分
  数据: sections[0].content.value（如果是 stat 类型）
}
第2列卡片 = sections[1] 同理
第3列卡片 = sections[2] 同理
\`\`\`

**dashboard 页面**:
\`\`\`
// 所有 stat 类型的 section 生成数据卡片
数据卡片组 = sections
  .filter(s => s.type === "stat")
  .map(s => ({
    大数字: s.content.value,
    标签: s.content.label,
    趋势: s.content.trend
  }))

// list 类型的 section 生成列表区
列表区 = sections.find(s => s.type === "list")?.content
\`\`\`

### ⛔ 严禁行为

1. **禁止忽略 sections 数据**：你必须使用 pageContent.sections 中的内容，不能自己编造
2. **禁止使用示例数据**：示例中的 "520+"、"$180亿" 是演示用的，你必须用 sections 中的真实值替换
3. **禁止留空**：如果 sections 没有足够数据，用已有数据的合理扩展，但不能留空白区域

## ⚠️ 最终检查清单（必须全部满足！）

### 内容完整性检查
- [ ] 每个卡片/区块都有实际内容（从 pageContent.sections 获取）
- [ ] 支柱页 (pillars)：每个支柱卡片都有标题+描述+数据
- [ ] 时间线页 (timeline/evolutionRoadmap)：每个阶段都有标题+时间+描述
- [ ] 仪表板页 (dashboard)：每个数据卡片都有真实数字和标签
- [ ] 风险机遇页 (riskOpportunity)：风险区和机遇区都有 2-3 个实际内容项

### 布局检查
- [ ] 使用 height: calc(100% - 100px) 确保内容填满
- [ ] 使用 flex: 1 让卡片等分空间
- [ ] 没有超过 200px 的空白区域

### 禁止项检查
- [ ] 无水印式装饰大字
- [ ] 无占位符文字（如"时间线图"、"对比图"）
- [ ] 无未替换的模板变量（如 {{PILLAR1_TITLE}}）
- [ ] 无颜色代码作为文本内容（如 #D4AF37）
- [ ] 无空的 div 容器

记住：**每一页都必须信息密实、布局饱满、视觉专业。所有内容必须来自 pageContent.sections，禁止空白区域！**`;

@Injectable()
export class FourStepDesignSkill
  implements ISkill<FourStepDesignInput, FourStepDesignResult>
{
  readonly id = "slides-four-step-design";
  readonly name = "四步设计";
  readonly description = "执行四步设计流程生成幻灯片内容";
  readonly layer: SkillLayer = SKILL_LAYERS.DESIGN;
  readonly domain = "slides";
  readonly tags = ["slides", "design", "four-step"];
  readonly version = "4.0.0";

  private readonly logger = new Logger(FourStepDesignSkill.name);

  constructor(
    @Optional() private readonly aiModelService: AIModelService,
    @Optional() private readonly aiChatService: AiChatService,
  ) {}

  /**
   * 将 MissionOrchestrator 输入格式转换为直接输入格式
   */
  private normalizeInput(
    input: FourStepDesignInput | FourStepDesignOrchestratorInput,
  ): FourStepDesignInput | null {
    // 如果已经是直接格式，直接返回
    if (
      "pageOutline" in input &&
      "pageContent" in input &&
      "globalStyles" in input
    ) {
      return input as FourStepDesignInput;
    }

    // 尝试从 orchestrator 格式提取
    const orchestratorInput = input as FourStepDesignOrchestratorInput;
    const contextInput = orchestratorInput.context?.input;

    if (
      !contextInput?.pageOutline ||
      !contextInput?.pageContent ||
      !contextInput?.globalStyles
    ) {
      this.logger.warn(
        "[normalizeInput] Missing required fields in orchestrator input: " +
          `pageOutline=${!!contextInput?.pageOutline}, ` +
          `pageContent=${!!contextInput?.pageContent}, ` +
          `globalStyles=${!!contextInput?.globalStyles}`,
      );
      return null;
    }

    return {
      pageOutline: contextInput.pageOutline,
      pageContent: contextInput.pageContent,
      globalStyles: contextInput.globalStyles,
      sessionId: contextInput.sessionId,
      images: contextInput.images,
    };
  }

  /**
   * 执行四步设计
   */
  async execute(
    input: FourStepDesignInput | FourStepDesignOrchestratorInput,
    context: SkillContext,
  ): Promise<SkillResult<FourStepDesignResult>> {
    const startTime = new Date();

    // Normalize input from orchestrator format if needed
    const normalizedInput = this.normalizeInput(input);
    if (!normalizedInput) {
      return {
        success: false,
        error: {
          code: "INVALID_INPUT",
          message:
            "Failed to normalize input: missing required fields (pageOutline, pageContent, globalStyles)",
          retryable: false,
        },
        metadata: {
          executionId: context.executionId,
          startTime,
          endTime: new Date(),
          duration: Date.now() - startTime.getTime(),
        },
      };
    }

    this.logger.log(
      `[execute] Starting four-step design for page ${normalizedInput.pageOutline.pageNumber}`,
    );

    const userMessage = this.buildUserMessage(normalizedInput);

    // 使用数据库配置的模型（严禁硬编码模型名！）
    if (!this.aiModelService || !this.aiChatService) {
      return {
        success: false,
        error: {
          code: "SERVICE_NOT_AVAILABLE",
          message:
            "AIModelService or AiChatService not available. Please check module configuration.",
          retryable: false,
        },
        metadata: {
          executionId: context.executionId,
          startTime,
          endTime: new Date(),
          duration: Date.now() - startTime.getTime(),
        },
      };
    }

    const model = await this.aiModelService.getDefaultTextModel();
    this.logger.debug(
      `[execute] Using model: ${model.displayName} (${model.modelId})`,
    );

    const messages: ChatMessage[] = [{ role: "user", content: userMessage }];

    const llmResponse = await this.aiChatService.chat({
      provider: model.provider,
      model: model.modelId,
      apiKey: model.apiKey || "",
      apiEndpoint: model.apiEndpoint || undefined,
      systemPrompt: FOUR_STEP_DESIGN_SYSTEM_PROMPT,
      messages,
      maxTokens: model.maxTokens || 8192,
      temperature: model.temperature || 0.2,
    });

    if (!llmResponse) {
      this.logger.error("[execute] AI call failed: no content returned");
      return {
        success: false,
        error: {
          code: "LLM_NO_CONTENT",
          message: "Four-step design failed: no content returned from LLM",
          retryable: true,
        },
        metadata: {
          executionId: context.executionId,
          startTime,
          endTime: new Date(),
          duration: Date.now() - startTime.getTime(),
        },
      };
    }

    const { design, html: rawHtml } = this.parseResponse(
      llmResponse.content,
      normalizedInput,
    );

    // 记录完整的 Prompt 和 AI 响应到 design 对象
    // 这样前端 Thinking 视图可以展示完整的思考过程
    design.systemPrompt = FOUR_STEP_DESIGN_SYSTEM_PROMPT;
    design.userPrompt = userMessage;
    design.rawResponse = llmResponse.content;

    // 修复误用的图片占位符（AI 可能将占位符作为文本输出）
    const fixedHtml = this.fixMisusedImagePlaceholders(rawHtml);

    // 后处理：检测并修复水印文字、占位符、超大字号等问题
    const { html: postProcessedHtml, fixes } = this.postProcessHtml(
      fixedHtml,
      normalizedInput.pageOutline,
    );

    if (fixes.length > 0) {
      this.logger.log(
        `[execute] Post-processing fixes for page ${normalizedInput.pageOutline.pageNumber}: ${fixes.join(", ")}`,
      );
    }

    // 替换图片占位符为真实 URL
    const html = this.replaceImagePlaceholders(
      postProcessedHtml,
      normalizedInput.images,
    );

    const endTime = new Date();
    const durationMs = endTime.getTime() - startTime.getTime();

    this.logger.log(
      `[execute] Four-step design complete for page ${normalizedInput.pageOutline.pageNumber} in ${durationMs}ms`,
    );

    return {
      success: true,
      data: { design, html, durationMs },
      metadata: {
        executionId: context.executionId,
        startTime,
        endTime,
        duration: durationMs,
        tokensUsed: llmResponse.usage?.totalTokens || 0,
      },
    };
  }

  /**
   * 替换 HTML 中的图片占位符为真实 URL
   */
  private replaceImagePlaceholders(
    html: string,
    images?: GeneratedImage[],
  ): string {
    let result = html;

    // 替换背景图占位符
    const backgroundImage = images?.find(
      (img) => img.position === "background",
    );
    if (backgroundImage?.url) {
      result = result.replace(/\{\{BACKGROUND_IMAGE\}\}/g, backgroundImage.url);
    } else {
      // 如果没有背景图，移除 url('{{BACKGROUND_IMAGE}}') 相关的样式
      result = result.replace(
        /background-image:\s*url\(['"]?\{\{BACKGROUND_IMAGE\}\}['"]?\);?\s*/gi,
        "",
      );
      // 移除残留的占位符
      result = result.replace(/\{\{BACKGROUND_IMAGE\}\}/g, "");
    }

    // 替换内联图片占位符
    const inlineImages =
      images?.filter((img) => img.position !== "background") || [];
    inlineImages.forEach((img, index) => {
      if (img.url) {
        const placeholder = `{{INLINE_IMAGE_${index + 1}}}`;
        result = result.replace(
          new RegExp(placeholder.replace(/[{}]/g, "\\$&"), "g"),
          img.url,
        );
      }
    });

    // 清理未替换的内联图片占位符
    // 将包含未替换占位符的 img 标签替换为空
    result = result.replace(
      /<img[^>]*src\s*=\s*["']\{\{INLINE_IMAGE_\d+\}\}["'][^>]*\/?>/gi,
      "",
    );
    // 移除任何残留的内联图片占位符文本
    result = result.replace(/\{\{INLINE_IMAGE_\d+\}\}/g, "");

    return result;
  }

  /**
   * 构建用户消息
   * 重要：不要将 base64 图片数据发送给 AI，否则会导致 token 爆炸（100KB 图片 = 25000+ tokens）
   * 使用占位符 {{BACKGROUND_IMAGE}} 和 {{INLINE_IMAGE_N}}，之后替换为真实 URL
   */
  private buildUserMessage(input: FourStepDesignInput): string {
    const { pageOutline, pageContent, globalStyles, images } = input;

    // 获取背景图信息（但不包含 base64 数据）
    const backgroundImage = images?.find(
      (img) => img.position === "background",
    );
    const inlineImages =
      images?.filter((img) => img.position !== "background") || [];

    return `## 页面信息

### 页码
${pageOutline.pageNumber}

### 页面类型
${pageOutline.templateType}

### 标题
${pageOutline.title}

### 副标题
${pageOutline.subtitle || "无"}

### 内容简述
${pageOutline.contentBrief}

### 关键元素
${pageOutline.keyElements.join("\n- ")}

## 页面内容

### 主标题
${pageContent.title}

### 副标题
${pageContent.subtitle || "无"}

### 内容区块（⚠️ 必须使用以下数据填充 HTML！）

${this.formatSectionsForTemplate(pageOutline.templateType, pageContent.sections)}

### 脚注
${pageContent.footer || "无"}

## 全局样式

${JSON.stringify(globalStyles, null, 2)}

## ⭐ 图片资源（必须使用！）

${
  backgroundImage
    ? `### 背景图（必须使用！）
已预生成背景图，语义：${backgroundImage.semanticContext || "专业背景"}

**使用方式**：在 HTML 中使用占位符 \`{{BACKGROUND_IMAGE}}\` 作为 background-image 的 URL，系统会自动替换为真实图片。

示例：
\`\`\`html
background-image: url('{{BACKGROUND_IMAGE}}');
\`\`\`

请添加半透明叠加层确保文字可读。
`
    : `### 背景图
无预生成背景图，请使用纯色渐变背景：linear-gradient(135deg, #0F172A 0%, #1E293B 100%)
`
}

${
  inlineImages.length > 0
    ? `### 内联图片（必须正确使用！）

⚠️ **重要**：内联图片占位符必须放在 \`<img>\` 标签的 \`src\` 属性中，**绝对不要作为文本内容输出**！

${inlineImages.map((img, i) => `- 图片${i + 1}: 占位符 \`{{INLINE_IMAGE_${i + 1}}}\` (语义: ${img.semanticContext || "无"})`).join("\n")}

**正确使用方式**：
\`\`\`html
<img src="{{INLINE_IMAGE_1}}" style="width: 100%; height: auto; border-radius: 8px;" alt="描述" />
\`\`\`

**错误用法（禁止！）**：
\`\`\`html
<!-- 禁止！这会导致图片 URL 显示为文本 -->
<p>{{INLINE_IMAGE_1}}</p>
<span>图片：{{INLINE_IMAGE_1}}</span>
\`\`\`
`
    : ""
}

## CDN 资源

- Tailwind: ${CDN_RESOURCES.tailwind}
- Font Awesome: ${CDN_RESOURCES.fontAwesome}
- ECharts: ${CDN_RESOURCES.echarts}
- Noto Sans SC: ${CDN_RESOURCES.notoSansSC}

## 参考模板

以下是该页面类型的参考模板，请参考其布局结构和设计风格，但要根据实际内容进行调整和创新：

\`\`\`html
${this.getTemplateReference(pageOutline.templateType)}
\`\`\`

## 请求

请执行四步设计流程，生成该页面的设计方案和 HTML 代码。
注意：
1. 参考模板的结构和风格，但要根据实际内容进行调整
2. 所有内容必须来自"页面内容"部分，不要使用模板中的占位符
3. 确保生成的 HTML 完整、独立，可以直接渲染
4. **⭐ 使用图片占位符 {{BACKGROUND_IMAGE}} 或 {{INLINE_IMAGE_N}}**，系统会自动替换为真实图片 URL`;
  }

  /**
   * 获取模板参考
   */
  private getTemplateReference(templateType: PageTemplateType): string {
    const template = getTemplate(templateType);
    // 截取模板核心结构，避免过长
    const html = template.html;
    if (html.length > 3000) {
      return html.substring(0, 3000) + "\n<!-- 模板已截断，请参考结构 -->";
    }
    return html;
  }

  /**
   * 根据模板类型格式化 sections 数据为明确的插槽指令
   * 这样 AI 就知道哪个数据应该放在 HTML 的哪个位置
   */
  private formatSectionsForTemplate(
    templateType: string,
    sections: ContentSection[],
  ): string {
    if (!sections || sections.length === 0) {
      return "⚠️ 无内容区块数据，请根据页面标题和简述生成合理内容";
    }

    // 通用 JSON 格式
    const jsonData = JSON.stringify(sections, null, 2);

    // 根据模板类型提供具体的映射指令
    switch (templateType) {
      case "pillars":
        return this.formatPillarsData(sections, jsonData);
      case "dashboard":
        return this.formatDashboardData(sections, jsonData);
      case "timeline":
      case "evolutionRoadmap":
        return this.formatTimelineData(sections, jsonData);
      case "riskOpportunity":
        return this.formatRiskOpportunityData(sections, jsonData);
      case "comparison":
        return this.formatComparisonData(sections, jsonData);
      default:
        return `原始数据：\n${jsonData}\n\n请根据数据类型（stat/list/text/chart）合理布局到页面中。`;
    }
  }

  /**
   * 格式化 pillars 模板数据
   */
  private formatPillarsData(
    sections: ContentSection[],
    jsonData: string,
  ): string {
    const pillars = sections.slice(0, 3);
    let result = `**Pillars 三列布局 - 每列必须填充以下内容：**\n\n`;

    pillars.forEach((section, index) => {
      const colors = ["#D4AF37（金色）", "#3B82F6（蓝色）", "#10B981（绿色）"];
      result += `**第${index + 1}列卡片** (颜色: ${colors[index]}):\n`;

      if (
        section.type === "stat" &&
        typeof section.content === "object" &&
        "value" in section.content
      ) {
        const stat = section.content as {
          value: string;
          label: string;
          change?: string;
        };
        result += `- 大数字: ${stat.value}\n`;
        result += `- 标签: ${stat.label}\n`;
        if (stat.change) result += `- 变化: ${stat.change}\n`;
      } else if (section.type === "list" && Array.isArray(section.content)) {
        result += `- 标题: ${section.content[0] || "无"}\n`;
        result += `- 要点列表:\n`;
        section.content.slice(1).forEach((item) => {
          result += `  • ${item}\n`;
        });
      } else if (
        section.type === "text" &&
        typeof section.content === "string"
      ) {
        result += `- 内容: ${section.content}\n`;
      }
      result += "\n";
    });

    result += `\n原始 JSON（备用）：\n${jsonData}`;
    return result;
  }

  /**
   * 格式化 dashboard 模板数据
   */
  private formatDashboardData(
    sections: ContentSection[],
    jsonData: string,
  ): string {
    const stats = sections.filter(
      (s) =>
        s.type === "stat" &&
        typeof s.content === "object" &&
        "value" in s.content,
    );
    const lists = sections.filter((s) => s.type === "list");

    let result = `**Dashboard 布局 - 左侧数据卡片 + 右侧列表：**\n\n`;

    result += `**左侧数据卡片区（需要 ${stats.length} 个数据卡）：**\n`;
    stats.forEach((stat, index) => {
      const content = stat.content as {
        value: string;
        label: string;
        trend?: string;
      };
      result += `卡片${index + 1}: 数字="${content.value}" 标签="${content.label}"`;
      if (content.trend) result += ` 趋势="${content.trend}"`;
      result += "\n";
    });

    if (lists.length > 0) {
      result += `\n**右侧列表区：**\n`;
      lists.forEach((list) => {
        if (Array.isArray(list.content)) {
          list.content.forEach((item) => {
            result += `• ${item}\n`;
          });
        }
      });
    }

    result += `\n原始 JSON（备用）：\n${jsonData}`;
    return result;
  }

  /**
   * 格式化 timeline 模板数据
   */
  private formatTimelineData(
    sections: ContentSection[],
    jsonData: string,
  ): string {
    let result = `**Timeline 布局 - 横向时间线 + 下方卡片：**\n\n`;
    result += `**时间线节点（从左到右）：**\n`;

    sections.forEach((section, index) => {
      const colors = ["#D4AF37", "#3B82F6", "#10B981", "#8B5CF6"];
      result += `\n**节点${index + 1}** (颜色: ${colors[index % 4]}):\n`;

      if (
        section.type === "stat" &&
        typeof section.content === "object" &&
        "value" in section.content
      ) {
        const stat = section.content as { value: string; label: string };
        result += `- 阶段名: ${stat.label}\n- 时间/数据: ${stat.value}\n`;
      } else if (
        section.type === "text" &&
        typeof section.content === "string"
      ) {
        result += `- 内容: ${section.content}\n`;
      } else if (section.type === "list" && Array.isArray(section.content)) {
        result += `- 阶段: ${section.content[0] || "阶段" + (index + 1)}\n`;
        if (section.content.length > 1) {
          result += `- 描述: ${section.content.slice(1).join("; ")}\n`;
        }
      }
    });

    result += `\n原始 JSON（备用）：\n${jsonData}`;
    return result;
  }

  /**
   * 格式化 riskOpportunity 模板数据
   */
  private formatRiskOpportunityData(
    sections: ContentSection[],
    jsonData: string,
  ): string {
    const half = Math.ceil(sections.length / 2);
    const risks = sections.slice(0, half);
    const opportunities = sections.slice(half);

    let result = `**RiskOpportunity 布局 - 左右双列对比：**\n\n`;

    result += `**左侧风险区（红色系）：**\n`;
    risks.forEach((section) => {
      if (section.type === "list" && Array.isArray(section.content)) {
        section.content.forEach((item) => {
          result += `• ${item}\n`;
        });
      } else if (typeof section.content === "string") {
        result += `• ${section.content}\n`;
      }
    });

    result += `\n**右侧机遇区（绿色系）：**\n`;
    opportunities.forEach((section) => {
      if (section.type === "list" && Array.isArray(section.content)) {
        section.content.forEach((item) => {
          result += `• ${item}\n`;
        });
      } else if (typeof section.content === "string") {
        result += `• ${section.content}\n`;
      }
    });

    result += `\n原始 JSON（备用）：\n${jsonData}`;
    return result;
  }

  /**
   * 格式化 comparison 模板数据
   */
  private formatComparisonData(
    sections: ContentSection[],
    jsonData: string,
  ): string {
    let result = `**Comparison 布局 - 左右对比：**\n\n`;

    if (sections.length >= 2) {
      result += `**左列（方案A）：**\n`;
      const left = sections[0];
      if (left.type === "list" && Array.isArray(left.content)) {
        left.content.forEach((item) => {
          result += `• ${item}\n`;
        });
      }

      result += `\n**右列（方案B）：**\n`;
      const right = sections[1];
      if (right.type === "list" && Array.isArray(right.content)) {
        right.content.forEach((item) => {
          result += `• ${item}\n`;
        });
      }
    }

    result += `\n原始 JSON（备用）：\n${jsonData}`;
    return result;
  }

  /**
   * 解析 AI 响应
   */
  private parseResponse(
    content: string,
    input: FourStepDesignInput,
  ): { design: PageDesign; html: string } {
    // 尝试多种方式提取 JSON
    let jsonStr = content;

    // 方式1: 匹配 ```json ... ``` 代码块
    const jsonCodeBlockMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonCodeBlockMatch) {
      jsonStr = jsonCodeBlockMatch[1].trim();
    } else {
      // 方式2: 匹配 ``` ... ``` 代码块（无语言标记）
      const codeBlockMatch = content.match(/```\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
      } else {
        // 方式3: 尝试找到第一个 { 和最后一个 }
        const firstBrace = content.indexOf("{");
        const lastBrace = content.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          jsonStr = content.slice(firstBrace, lastBrace + 1);
        }
      }
    }

    // 尝试解析 JSON
    try {
      const parsed = JSON.parse(jsonStr);
      const design = this.normalizeDesign(parsed);
      const html = this.extractHtml(parsed, input);
      return { design, html };
    } catch (error) {
      this.logger.warn(
        "[parseResponse] First JSON parse attempt failed, trying repair...",
      );
    }

    // 尝试修复常见的 JSON 问题
    try {
      const repairedJson = this.repairJson(jsonStr);
      const parsed = JSON.parse(repairedJson);
      const design = this.normalizeDesign(parsed);
      const html = this.extractHtml(parsed, input);
      this.logger.log("[parseResponse] JSON repaired successfully");
      return { design, html };
    } catch (error) {
      this.logger.warn(
        "[parseResponse] JSON repair failed, trying to extract HTML directly...",
      );
    }

    // 最后尝试：直接从响应中提取 HTML
    const directHtml = this.extractHtmlDirect(content);
    if (directHtml) {
      this.logger.log("[parseResponse] Extracted HTML directly from response");
      return {
        design: this.createFallbackDesign(),
        html: this.wrapHtmlWithContainer(directHtml, input.globalStyles),
      };
    }

    // 最终降级
    this.logger.error("[parseResponse] All parsing methods failed");
    this.logger.debug(
      `[parseResponse] Raw content (first 500 chars): ${content.substring(0, 500)}`,
    );
    return {
      design: this.createFallbackDesign(),
      html: this.createFallbackHtml(input),
    };
  }

  /**
   * 尝试修复常见的 JSON 问题
   */
  private repairJson(jsonStr: string): string {
    let repaired = jsonStr;

    // 1. 移除 JSON 中的控制字符（除了 \n, \r, \t）
    repaired = repaired.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");

    // 2. 修复 HTML 字符串中的未转义换行符
    // 找到 "html": "..." 模式并修复其中的换行符
    repaired = repaired.replace(
      /"html"\s*:\s*"([\s\S]*?)"/g,
      (_match, htmlContent) => {
        // 转义 HTML 内容中的换行符和特殊字符
        const escaped = htmlContent
          .replace(/\\/g, "\\\\")
          .replace(/\n/g, "\\n")
          .replace(/\r/g, "\\r")
          .replace(/\t/g, "\\t")
          .replace(/"/g, '\\"');
        return `"html": "${escaped}"`;
      },
    );

    // 3. 移除尾随逗号
    repaired = repaired.replace(/,(\s*[}\]])/g, "$1");

    return repaired;
  }

  /**
   * 直接从响应中提取 HTML（当 JSON 解析失败时）
   */
  private extractHtmlDirect(content: string): string | null {
    // 尝试匹配 HTML 代码块
    const htmlBlockMatch = content.match(/```html\s*([\s\S]*?)\s*```/);
    if (htmlBlockMatch) {
      return htmlBlockMatch[1].trim();
    }

    // 尝试匹配 "html": 后面的内容
    const htmlFieldMatch = content.match(
      /"html"\s*:\s*"([\s\S]*?)(?:"\s*[,}]|$)/,
    );
    if (htmlFieldMatch) {
      // 解码转义的字符
      return htmlFieldMatch[1]
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }

    // 尝试匹配完整的 HTML 结构
    const fullHtmlMatch = content.match(
      /<div\s+style="[^"]*width:\s*1280px[\s\S]*?<\/div>\s*$/,
    );
    if (fullHtmlMatch) {
      return fullHtmlMatch[0];
    }

    return null;
  }

  /**
   * 规范化设计结果
   */
  private normalizeDesign(parsed: Record<string, unknown>): PageDesign {
    const step1 = parsed.step1_drafting as Record<string, unknown> | undefined;
    const step2 = parsed.step2_refiningLayout as
      | Record<string, unknown>
      | undefined;
    const step3 = parsed.step3_planningVisuals as
      | Record<string, unknown>
      | undefined;
    const step4 = parsed.step4_formulatingHTML as
      | Record<string, unknown>
      | undefined;

    return {
      step1_drafting: {
        style: String(step1?.style || "professional"),
        coreElements: Array.isArray(step1?.coreElements)
          ? step1.coreElements.map(String)
          : [],
        mood: String(step1?.mood || "professional"),
      },
      step2_refiningLayout: {
        alignment: String(step2?.alignment || "left-aligned"),
        graphicsPosition: String(step2?.graphicsPosition || "right"),
        spacing: String(step2?.spacing || "standard"),
        ratio: step2?.ratio ? String(step2.ratio) : undefined,
      },
      step3_planningVisuals: {
        backgroundColor: String(
          step3?.backgroundColor || GENSPARK_DESIGN_SYSTEM.backgroundColor,
        ),
        accentColors: Array.isArray(step3?.accentColors)
          ? step3.accentColors.map(String)
          : [GENSPARK_DESIGN_SYSTEM.accentColor],
        decorations: Array.isArray(step3?.decorations)
          ? step3.decorations.map(String)
          : [],
        shadows: step3?.shadows ? String(step3.shadows) : undefined,
      },
      step4_formulatingHTML: {
        html: String(step4?.html || ""),
        css: step4?.css ? String(step4.css) : undefined,
        externalDependencies: Array.isArray(step4?.externalDependencies)
          ? step4.externalDependencies.map(String)
          : [],
      },
    };
  }

  /**
   * 提取 HTML
   */
  private extractHtml(
    parsed: Record<string, unknown>,
    input: FourStepDesignInput,
  ): string {
    const step4 = parsed.step4_formulatingHTML as
      | Record<string, unknown>
      | undefined;

    if (step4?.html && typeof step4.html === "string") {
      return this.wrapHtmlWithContainer(step4.html, input.globalStyles);
    }

    return this.createFallbackHtml(input);
  }

  /**
   * 用容器包装 HTML
   * 注意：使用 100% 尺寸以适应 iframe 容器，由 iframe 的 body 控制实际尺寸
   */
  private wrapHtmlWithContainer(
    html: string,
    globalStyles: GlobalStyles,
  ): string {
    let processedHtml = html;

    // 将固定尺寸替换为 100%，让 HTML 填满 iframe body（1280x720）
    // AI 生成的 HTML 通常包含固定的 1280x720 尺寸，需要转换为相对尺寸
    processedHtml = processedHtml
      .replace(/width:\s*1280px/gi, "width: 100%")
      .replace(/height:\s*720px/gi, "height: 100%");

    // 如果 HTML 已经包含容器样式，直接返回处理后的 HTML
    if (
      processedHtml.includes("width: 100%") ||
      processedHtml.includes("width:100%")
    ) {
      return processedHtml;
    }

    // 否则用容器包装
    return `
<div style="
  width: 100%;
  height: 100%;
  background-color: ${globalStyles.backgroundColor};
  font-family: ${globalStyles.fontFamily};
  color: ${globalStyles.textPrimary};
  padding: 50px 80px;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
">
  ${processedHtml}
</div>`.trim();
  }

  /**
   * 创建降级设计
   */
  private createFallbackDesign(): PageDesign {
    return {
      step1_drafting: {
        style: "professional",
        coreElements: ["title", "content"],
        mood: "professional",
      },
      step2_refiningLayout: {
        alignment: "left-aligned",
        graphicsPosition: "right",
        spacing: "standard",
      },
      step3_planningVisuals: {
        backgroundColor: GENSPARK_DESIGN_SYSTEM.backgroundColor,
        accentColors: [GENSPARK_DESIGN_SYSTEM.accentColor],
        decorations: [],
      },
      step4_formulatingHTML: {
        html: "",
        externalDependencies: [],
      },
    };
  }

  /**
   * 创建降级 HTML
   * 注意：使用 100% 尺寸以适应 iframe 容器
   */
  private createFallbackHtml(input: FourStepDesignInput): string {
    const { pageContent, globalStyles } = input;

    return `
<div style="
  width: 100%;
  height: 100%;
  background-color: ${globalStyles.backgroundColor};
  font-family: ${globalStyles.fontFamily};
  color: ${globalStyles.textPrimary};
  padding: 50px 80px;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
">
  <h1 style="
    font-size: 36px;
    font-weight: 900;
    color: ${globalStyles.textPrimary};
    margin-bottom: 16px;
  ">${pageContent.title}</h1>

  ${
    pageContent.subtitle
      ? `
  <h2 style="
    font-size: 20px;
    font-weight: 400;
    color: ${globalStyles.textSecondary};
    margin-bottom: 32px;
  ">${pageContent.subtitle}</h2>
  `
      : ""
  }

  <div style="
    display: flex;
    gap: 24px;
    margin-top: 32px;
  ">
    ${pageContent.sections
      .map(
        (section) => `
    <div style="
      flex: 1;
      background: ${globalStyles.cardBackground};
      border: 1px solid ${globalStyles.borderColor};
      border-radius: 12px;
      padding: 24px;
    ">
      ${typeof section.content === "string" ? section.content : JSON.stringify(section.content)}
    </div>
    `,
      )
      .join("")}
  </div>

  ${
    pageContent.footer
      ? `
  <div style="
    position: absolute;
    bottom: 24px;
    left: 80px;
    right: 80px;
    font-size: 12px;
    color: ${globalStyles.textSecondary};
  ">${pageContent.footer}</div>
  `
      : ""
  }
</div>`.trim();
  }

  /**
   * 验证 HTML 质量
   */
  validateHtml(html: string): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // 检查基本结构
    if (!html.includes("width: 1280") && !html.includes("width:1280")) {
      issues.push("Missing canvas width (1280px)");
    }

    if (!html.includes("height: 720") && !html.includes("height:720")) {
      issues.push("Missing canvas height (720px)");
    }

    // 检查必要样式
    if (!html.includes("font-family")) {
      issues.push("Missing font-family declaration");
    }

    // 检查底部安全区
    if (html.includes("bottom: 0") || html.includes("bottom:0")) {
      issues.push("Content may violate bottom safe zone");
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * 后处理：检测并修复常见布局问题
   * v3.1: 自动修复水印文字、占位符、超大字号等问题
   */
  private postProcessHtml(
    html: string,
    pageOutline: PageOutline,
  ): { html: string; fixes: string[] } {
    let result = html;
    const fixes: string[] = [];

    // 封面页跳过大部分后处理（允许大标题）
    const isCoverPage = pageOutline.templateType === "cover";

    // 1. 检测并移除水印式装饰大字（封面页跳过）
    // 匹配：font-size >= 80px 的纯中文文字（非数字）
    if (!isCoverPage) {
      const watermarkPattern =
        /<(?:div|span|p)[^>]*style="[^"]*font-size:\s*([89]\d|[1-9]\d{2,})px[^"]*"[^>]*>([^<]*[\u4e00-\u9fa5]+[^<]*)<\/(?:div|span|p)>/gi;

      result = result.replace(watermarkPattern, (match, fontSize, text) => {
        // 如果文字不包含数字（不是数据展示），则可能是装饰性水印
        if (!/[\d%$¥€]/.test(text) && text.length <= 10) {
          this.logger.warn(
            `[postProcessHtml] Removing watermark text: "${text}" with font-size ${fontSize}px`,
          );
          fixes.push(`移除水印文字: "${text}"`);
          return ""; // 直接移除
        }
        return match;
      });
    }

    // 2. 检测并替换占位符文字（如"时间线图"、"对比图"）
    const placeholderPatterns = [
      /时间线图/g,
      /对比图/g,
      /分布图/g,
      /增长图/g,
      /趋势图/g,
      /图表区域/g,
      /数据可视化/g,
      /柱状图/g,
      /饼图/g,
      /折线图/g,
    ];

    for (const pattern of placeholderPatterns) {
      if (pattern.test(result)) {
        // 检查是否在有效的图表容器内（ECharts）
        const hasECharts =
          result.includes("echarts.init") || result.includes("chart.setOption");
        if (!hasECharts) {
          // 将占位符文字替换为更通用的说明
          result = result.replace(pattern, (match) => {
            this.logger.warn(
              `[postProcessHtml] Found placeholder text without ECharts: "${match}"`,
            );
            fixes.push(`检测到占位符文字: "${match}" (未生成真实图表)`);
            return ""; // 暂时移除，后续可考虑用卡片替代
          });
        }
      }
    }

    // 3. 检测超大字号（>72px）的非数字文字并缩小
    const oversizedTextPattern =
      /<(?:div|span|p|h\d)[^>]*style="[^"]*font-size:\s*(7[3-9]|[89]\d|[1-9]\d{2,})px[^"]*"[^>]*>([^<]+)<\/(?:div|span|p|h\d)>/gi;

    result = result.replace(oversizedTextPattern, (match, fontSize, text) => {
      // 如果文字是纯数字/数据，可以保留大字号
      if (/^[\d,.%$¥€+\-\s]+$/.test(text.trim())) {
        return match;
      }
      // 否则缩小字号
      this.logger.warn(
        `[postProcessHtml] Reducing oversized text "${text}" from ${fontSize}px to 48px`,
      );
      fixes.push(
        `缩小超大文字: "${text.substring(0, 20)}..." (${fontSize}px → 48px)`,
      );
      return match.replace(`font-size: ${fontSize}px`, "font-size: 48px");
    });

    // 4. 检测并限制图表容器高度（max 350px）
    const chartHeightPattern = /height:\s*(\d+)px/gi;
    let hasChartHeightIssue = false;

    result = result.replace(chartHeightPattern, (match, height) => {
      const h = parseInt(height, 10);
      if (h > 350 && result.includes("echarts")) {
        hasChartHeightIssue = true;
        this.logger.warn(
          `[postProcessHtml] Reducing chart height from ${h}px to 350px`,
        );
        return "height: 350px";
      }
      return match;
    });

    if (hasChartHeightIssue) {
      fixes.push("缩小图表高度至 350px（防止裁切）");
    }

    // 5. 确保底部安全区 - 检测 bottom: 0 的内容（脚注除外）
    if (
      result.includes("bottom: 0") &&
      !result.includes("脚注") &&
      !result.includes("footer") &&
      !result.includes("数据来源")
    ) {
      this.logger.warn(
        "[postProcessHtml] Detected content at bottom: 0 (may violate safe zone)",
      );
      fixes.push("警告：检测到内容触及底部（可能违反安全区）");
    }

    // 6. 移除 input/checkbox/toggle 表单元素（幻灯片中不应该有交互元素）
    const originalForFormCheck = result;
    result = result.replace(
      /<input[^>]*(?:type\s*=\s*["']?(?:checkbox|radio|text|range)[^>]*)?\/?>/gi,
      "",
    );
    if (result !== originalForFormCheck) {
      this.logger.warn(
        "[postProcessHtml] Removing form elements (inputs/checkboxes)",
      );
      fixes.push("移除交互表单元素");
    }

    // 6b. 移除误生成的菜单图标（hamburger menu icon）
    const originalForMenuCheck = result;
    // 移除三条横线的 hamburger 图标 SVG
    result = result.replace(
      /<svg[^>]*>[\s\S]*?(?:<line[^>]*\/>[\s\S]*?){2,3}<\/svg>/gi,
      (match) => {
        // 检测是否是 hamburger menu 模式（3条平行线）
        if ((match.match(/<line/gi) || []).length >= 3) {
          this.logger.warn("[postProcessHtml] Removing hamburger menu icon");
          return "";
        }
        return match;
      },
    );
    // 移除包含 menu/hamburger class 的元素
    result = result.replace(
      /<(?:div|span|button)[^>]*class\s*=\s*["'][^"']*(?:hamburger|menu-icon|menu-btn)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|span|button)>/gi,
      "",
    );
    if (result !== originalForMenuCheck) {
      fixes.push("移除菜单图标");
    }

    // 6c. 确保图标容器不被截断
    // 为图标/emoji 添加 flex-shrink: 0 防止被压缩
    result = result.replace(
      /(<(?:span|div)[^>]*style="[^"]*font-size:\s*(?:2[4-9]|[3-9]\d|\d{3,})px[^"]*")([^>]*>[\s\S]*?(?:🏥|💼|📈|🎮|📚|🏭|🔬|💡|⚠️|✅|❌|🎯|📊|🌐|🤖|💻|🔧|⚙️|📱|🎨))/gi,
      (match, prefix, suffix) => {
        if (prefix.includes("flex-shrink")) {
          return match;
        }
        return (
          prefix.replace(/style="([^"]*)"/, 'style="$1; flex-shrink: 0"') +
          suffix
        );
      },
    );

    // 7. 移除独立显示的颜色代码文本（如 #0F172A, #D4AF37, #051, #D4F37）
    // 这是最常见的 AI 输出错误 - 将设计规范中的颜色代码作为文本输出
    const originalForColorCheck = result;

    // 7a. 移除标签之间独立的颜色代码
    result = result.replace(/>(\s*#[0-9A-Fa-f]{6}\s*)</g, "><");
    result = result.replace(/>(\s*#[0-9A-Fa-f]{3,5}\s*)</g, "><");

    // 7b. 移除文本内容中的颜色代码（保留 style 属性中的）
    // 先保护 style 属性中的颜色代码
    const styleProtected = result.replace(/style="([^"]*)"/g, (match) =>
      match.replace(/#/g, "___HASH___"),
    );
    // 移除文本中的颜色代码
    let cleaned = styleProtected.replace(
      /#[0-9A-Fa-f]{3,6}(?![0-9A-Fa-f])/g,
      "",
    );
    // 恢复 style 中的颜色代码
    result = cleaned.replace(/___HASH___/g, "#");

    // 7c. 移除颜色代码后跟着色块的模式（如 "#D4AF37" + 小方块）
    result = result.replace(
      /#[0-9A-Fa-f]{3,6}\s*<(?:div|span)[^>]*style="[^"]*(?:background|background-color)[^"]*"[^>]*>[\s\S]*?<\/(?:div|span)>/gi,
      "",
    );

    // 7d. 移除常见的错误颜色代码变体
    const colorPatterns = [
      /#D4F37/gi, // 缺少一位的金色
      /#D44F37/gi, // 多了一位的变体
      /#0F172/gi, // 缺少一位的背景色
    ];
    for (const pattern of colorPatterns) {
      result = result.replace(pattern, "");
    }

    if (result !== originalForColorCheck) {
      this.logger.warn("[postProcessHtml] Removing standalone color code text");
      fixes.push("移除颜色代码文本");
    }

    // 7e. 移除包含颜色代码的调试信息 div（如图片占位符调试信息）
    const originalForDebugCheck = result;
    result = result.replace(
      /<(?:div|span)[^>]*>(?:\s*#[0-9A-Fa-f]{3,6}\s*)+<\/(?:div|span)>/gi,
      "",
    );
    // 移除包含颜色代码+色块的容器
    result = result.replace(
      /<(?:div|span)[^>]*>\s*#[0-9A-Fa-f]{3,6}\s*<(?:div|span)[^>]*>[\s\S]*?<\/(?:div|span)>\s*<\/(?:div|span)>/gi,
      "",
    );
    // 移除纯色块元素（小尺寸背景色方块，10-30px）
    result = result.replace(
      /<(?:div|span)[^>]*style="[^"]*(?:width|height):\s*(?:[1-2][0-9]|30)px[^"]*background(?:-color)?:\s*#[0-9A-Fa-f]{3,6}[^"]*"[^>]*>[\s\S]*?<\/(?:div|span)>/gi,
      "",
    );
    // 移除空的或只包含空白的 flex 子元素（可能是色块残留）
    result = result.replace(
      /<(?:div|span)[^>]*style="[^"]*(?:flex-shrink|width:\s*(?:1[5-9]|2[0-9])px)[^"]*"[^>]*>\s*<\/(?:div|span)>/gi,
      "",
    );
    if (result !== originalForDebugCheck) {
      this.logger.warn("[postProcessHtml] Removing color code debug elements");
      fixes.push("移除颜色调试元素");
    }

    // 7c. 修复常见拼写错误和乱码
    const originalForTypoCheck = result;
    // 修复 ABBSERTATION -> PRESENTATION 或移除
    result = result.replace(/ABBSERTATION/gi, "PRESENTATION");
    // 修复 PRESNETATION -> PRESENTATION
    result = result.replace(/PRESNETATION/gi, "PRESENTATION");
    // 移除看起来像调试占位符的文本
    result = result.replace(/>(\s*PRESENTATION\s*)</gi, "><");
    // 移除乱码字符（非标准 ASCII 控制字符）
    result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
    if (result !== originalForTypoCheck) {
      this.logger.warn(
        "[postProcessHtml] Fixed typos and removed garbled text",
      );
      fixes.push("修复拼写错误和乱码");
    }

    // 8. 移除 label 包裹的 toggle/switch 样式元素
    const originalForToggleCheck = result;
    result = result.replace(
      /<label[^>]*class\s*=\s*["'][^"']*(?:toggle|switch)[^"']*["'][^>]*>[\s\S]*?<\/label>/gi,
      "",
    );
    if (result !== originalForToggleCheck) {
      this.logger.warn("[postProcessHtml] Removing toggle/switch labels");
      fixes.push("移除 toggle 开关");
    }

    // 8b. 移除任何包含 toggle/switch 类名的元素
    const originalForToggle2Check = result;
    result = result.replace(
      /<(?:div|span)[^>]*class\s*=\s*["'][^"']*(?:toggle|switch|slider)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|span)>/gi,
      "",
    );
    if (result !== originalForToggle2Check) {
      this.logger.warn(
        "[postProcessHtml] Removing toggle/switch styled elements",
      );
      fixes.push("移除 toggle 样式元素");
    }

    // 9. 移除空的 div 容器（可能导致布局空白）
    // 匹配：只包含空白的 div
    let emptyDivCount = 0;
    result = result.replace(/<div[^>]*>\s*<\/div>/g, () => {
      emptyDivCount++;
      return "";
    });
    if (emptyDivCount > 0) {
      this.logger.warn(
        `[postProcessHtml] Removed ${emptyDivCount} empty div containers`,
      );
      fixes.push(`移除 ${emptyDivCount} 个空容器`);
    }

    // 10. 为 flex/grid 容器添加溢出保护
    // 检测 flex 布局容器并添加 min-height: 0 防止子元素溢出
    const originalForFlexCheck = result;
    result = result.replace(
      /(<div[^>]*style="[^"]*display:\s*flex[^"]*")([^>]*>)/gi,
      (match, prefix, suffix) => {
        // 如果已有 min-height，不重复添加
        if (prefix.includes("min-height")) {
          return match;
        }
        // 在 style 末尾添加 min-height: 0
        const newPrefix = prefix.replace(
          /style="([^"]*)"/,
          'style="$1; min-height: 0; overflow: hidden"',
        );
        return newPrefix + suffix;
      },
    );
    if (result !== originalForFlexCheck) {
      fixes.push("为 flex 容器添加溢出保护");
    }

    // 11. 修复可能导致文字重叠的绝对定位元素
    // 将 position: absolute 元素的容器设置为 relative 并添加 overflow 控制
    const originalForPositionCheck = result;
    result = result.replace(
      /<div([^>]*style="[^"]*position:\s*absolute[^"]*"[^>]*)>/gi,
      (match, attrs) => {
        // 如果已有 overflow，不重复添加
        if (attrs.includes("overflow")) {
          return match;
        }
        return match.replace(/style="([^"]*)"/, 'style="$1; overflow: hidden"');
      },
    );
    if (result !== originalForPositionCheck) {
      fixes.push("为绝对定位元素添加溢出保护");
    }

    // 12. 检测并修复未替换的模板变量（如 {{PILLAR1_TITLE}}、{{RISK1_DESC}}）
    const originalForPlaceholderCheck = result;
    // 移除未替换的模板变量占位符
    result = result.replace(/\{\{[A-Z0-9_]+\}\}/g, "");
    // 移除只包含空白或未替换占位符的卡片内容
    result = result.replace(
      /<(?:p|div|span|h[1-6])[^>]*>\s*<\/(?:p|div|span|h[1-6])>/g,
      "",
    );
    if (result !== originalForPlaceholderCheck) {
      this.logger.warn(
        "[postProcessHtml] Removing unreplaced template variables",
      );
      fixes.push("移除未替换的模板变量");
    }

    // 13. 修复支柱/卡片模板的空内容问题
    // 检测 flex: 1 的卡片容器是否有实质内容
    const pillarCardPattern =
      /<div[^>]*style="[^"]*flex:\s*1[^"]*border-top:\s*\d+px\s+solid[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;

    let pillarMatches = result.match(pillarCardPattern);
    if (pillarMatches) {
      pillarMatches.forEach((match) => {
        // 检查卡片内部是否有实质内容（至少需要有标题文字）
        const contentCheck = match.replace(/<[^>]+>/g, "").trim();
        if (contentCheck.length < 20) {
          this.logger.warn(
            `[postProcessHtml] Found empty pillar card, content length: ${contentCheck.length}`,
          );
          fixes.push("检测到空白支柱卡片");
        }
      });
    }

    // 14. 确保时间线/路线图模板有阶段内容
    // 检测 evolutionRoadmap 类型是否有阶段标记
    if (
      pageOutline.templateType === "evolutionRoadmap" ||
      pageOutline.templateType === "timeline"
    ) {
      const hasStageContent =
        result.includes("阶段") ||
        result.includes("Stage") ||
        result.includes("Phase") ||
        result.includes("里程碑") ||
        result.includes("Milestone");

      if (!hasStageContent) {
        this.logger.warn(
          "[postProcessHtml] evolutionRoadmap/timeline template missing stage content",
        );
        fixes.push("时间线模板缺少阶段内容");
      }
    }

    // 15. 确保 dashboard 模板有数据展示
    if (pageOutline.templateType === "dashboard") {
      // 检查是否有数字数据（至少需要有 1 个带数字的数据卡片）
      const numberPattern =
        /(?:font-size:\s*(?:[3-9]\d|1\d{2})px)[^>]*>[\s\S]*?[\d%$¥€]/;
      const hasNumberData = numberPattern.test(result);

      if (!hasNumberData) {
        this.logger.warn(
          "[postProcessHtml] dashboard template missing number data",
        );
        fixes.push("仪表板模板缺少数据展示");
      }
    }

    // 16. 修复 riskOpportunity 模板的空内容
    if (pageOutline.templateType === "riskOpportunity") {
      const hasRiskContent =
        result.includes("风险") ||
        result.includes("Risk") ||
        result.includes("机遇") ||
        result.includes("Opportunity") ||
        result.includes("挑战") ||
        result.includes("机会");

      if (!hasRiskContent) {
        this.logger.warn(
          "[postProcessHtml] riskOpportunity template missing content",
        );
        fixes.push("风险机遇模板缺少内容");
      }
    }

    // 17. 强制最小字体尺寸（P1: 字体过小问题）
    // 将 10px, 11px 的字体提升到 12px
    const originalForFontCheck = result;
    result = result.replace(/font-size:\s*(10|11)px/gi, "font-size: 12px");
    // 将正文内容中 12px 提升到 13px（确保可读性）
    result = result.replace(
      /(<p[^>]*style="[^"]*font-size:\s*)12px/gi,
      "$113px",
    );
    if (result !== originalForFontCheck) {
      this.logger.warn("[postProcessHtml] Enforcing minimum font size");
      fixes.push("强制最小字体尺寸");
    }

    // 18. 检测并修复固定小高度布局（导致空白区域）
    // 检测 height: 150px, height: 200px 等固定小高度
    const originalForHeightCheck = result;
    result = result.replace(
      /(<div[^>]*style="[^"]*height:\s*)(1[0-4]\d|1[5-9]\d|200)px([^"]*"[^>]*>)/gi,
      (match, prefix, height, suffix) => {
        // 如果是图标容器或小元素，不修改
        if (match.includes("width:") && parseInt(height) < 80) {
          return match;
        }
        // 将固定小高度替换为 flex: 1
        this.logger.warn(
          `[postProcessHtml] Replacing fixed small height ${height}px with flex: 1`,
        );
        // 如果已有 flex，不重复添加
        if (prefix.includes("flex:")) {
          return match;
        }
        return `${prefix}auto; flex: 1${suffix}`;
      },
    );
    if (result !== originalForHeightCheck) {
      fixes.push("修复固定小高度布局");
    }

    // 19. 确保主内容容器使用 calc(100% - Npx) 或 flex: 1
    // 检测顶层 flex 容器是否有 height: 100%
    const hasFullHeightLayout =
      result.includes("height: calc(100%") ||
      result.includes("height:calc(100%") ||
      (result.includes("height: 100%") && result.includes("flex: 1"));

    if (!isCoverPage && !hasFullHeightLayout) {
      // 尝试修复主内容容器
      const contentContainerPattern =
        /(<div[^>]*style="[^"]*display:\s*(?:flex|grid)[^"]*")([^>]*>)(?=[\s\S]*?<div[^>]*style="[^"]*flex:\s*1)/gi;

      result = result.replace(
        contentContainerPattern,
        (match, prefix, suffix) => {
          if (prefix.includes("height:") || prefix.includes("calc(100%")) {
            return match;
          }
          this.logger.warn(
            "[postProcessHtml] Adding calc height to content container",
          );
          return (
            prefix.replace(
              /style="([^"]*)"/,
              'style="$1; height: calc(100% - 100px)"',
            ) + suffix
          );
        },
      );

      if (result !== html) {
        fixes.push("为内容容器添加 calc 高度");
      }
    }

    return { html: result, fixes };
  }

  /**
   * 修复 HTML 中误用的图片占位符
   * 当 AI 将图片占位符作为文本输出时，尝试将其转换为 img 标签
   */
  private fixMisusedImagePlaceholders(html: string): string {
    let result = html;

    // 检测并修复被作为文本输出的内联图片占位符
    // 匹配 >{{INLINE_IMAGE_N}}< 或 纯文本 {{INLINE_IMAGE_N}}
    const inlinePlaceholderPattern =
      /(?<=>|\s)(\{\{INLINE_IMAGE_(\d+)\}\})(?=<|[^"']|\s|$)/g;

    result = result.replace(inlinePlaceholderPattern, (_match, placeholder) => {
      this.logger.warn(
        `[fixMisusedImagePlaceholders] Found misused placeholder: ${placeholder}, converting to img tag`,
      );
      return `<img src="${placeholder}" style="max-width: 100%; height: auto; border-radius: 8px;" alt="图片" />`;
    });

    // 检测并修复被作为文本输出的背景图占位符
    const bgPlaceholderPattern =
      /(?<=>|\s)(\{\{BACKGROUND_IMAGE\}\})(?=<|[^"']|\s|$)/g;

    result = result.replace(bgPlaceholderPattern, (_match, placeholder) => {
      this.logger.warn(
        `[fixMisusedImagePlaceholders] Found misused background placeholder: ${placeholder}`,
      );
      // 对于背景图，我们不能简单转换，只记录警告
      return "";
    });

    return result;
  }
}
