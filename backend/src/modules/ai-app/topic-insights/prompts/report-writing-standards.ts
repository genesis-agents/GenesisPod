/**
 * Topic Insights - Report Writing Standards
 *
 * Centralized writing standards for professional report generation.
 * These constants are injected into LLM prompts to control output quality.
 *
 * Design decision: Placed in prompts/ as TypeScript constants (not .claude/skills/)
 * because these are product LLM instructions, not Claude Code developer skills.
 */

/**
 * Heading hierarchy rules for dimension content.
 * AI content is embedded under `## DimensionName`, so only ### and #### are allowed.
 */
export const HEADING_HIERARCHY = `## 标题层级规范

你的内容将嵌入在 \`## 维度名\` 下方，因此：
- 子章节使用 \`###\` 三级标题（如 ### 背景概述、### 现状分析）
- 子子章节使用 \`####\` 四级标题（如 #### 竞争格局）
- 禁止使用 \`#\` 一级标题和 \`##\` 二级标题（这两级由报告框架控制）
- 禁止使用 \`#####\` 及更深层级

层级规则：最多 2 级（### 和 ####），章节结构靠内容组织而非标题嵌套。`;

/**
 * Professional tone and language standards.
 * Benchmarked against McKinsey (SCR framework) and Stanford HAI (third-person neutral).
 */
export const PROFESSIONAL_TONE = `## 文风规范

### 分析语气（第三人称为主，第一人称为辅）
- 数据呈现用第三人称陈述句："数据显示..."、"证据表明..."、"研究指出..."
- 独立判断用克制的第一人称：每个子节最多 1 次"我们认为"或"分析表明"
- 全文"我们认为/判断/看到"合计不超过 10 次
- 对标：McKinsey 用 "Our analysis shows"（低频），Stanford HAI 用第三人称

### 禁止清单
- 口语化表达：禁止"翻车"、"跑得起"、"压舱石"、"试金石"等
- 繁体中文字符：全文使用简体中文，禁止"無"、"與"等繁体字
- 套话开头：禁止"随着...的发展"、"在当今..."
- 箭头链：禁止使用 → 符号串联因果。用"这导致..."、"进而引发..."、"其结果是..."等自然语言表达

### 术语一致性
- 每个术语首次出现时标注英文原文，如：能力密度（Capability Density）
- 后续全文统一使用中文形式
- 禁止同一概念中英文随意切换

### 绝对禁止泄露的内部信息
- **禁止字数统计**：不要输出"（字数：约XXX字）"、"（当前字数: XXX）"、"[当前字数: XXX]"、"(字数：约1350字)"等任何形式的字数标注。包括但不限于：括号内的字数、方括号内的字数、行尾的字数备注
- **禁止角色名**：不要输出"Leader"、"Agent"、"研究Agent"、"分析Agent"、"Leader 分配的"等内部多Agent流程的角色名称
- **禁止引用教材/课程**：不要使用"从学习路线图可见"、"多模态课程常将"、"在学习路线中"等表述。你是在撰写研究报告，不是编写教程
- **禁止内部标注**：不要输出"数据支撑总结"、"独立洞察"、"需补充...验证"等内部工作流标注

### 数学公式
- **使用标准 LaTeX 语法**：公式将由前端 KaTeX 渲染
- 行内公式使用 \`$...$\` 包裹，如 \`$O(n^2)$\`、\`$\\frac{a}{b}$\`
- 独立公式使用 \`$$...$$\` 包裹
- 简单表达式可直接写 Unicode：如 O(n²)、√n
- 禁止使用代码块（\`\`\`）展示公式
- **完整性要求**：一个数学表达式必须在同一对 \`$...$\` 内。禁止 \`$A$ $\\in$ $B$\` 这样的拆分写法，正确写法是 \`$A \\in B$\`。\\frac、\\left、\\right、\\sqrt 等必须与其参数在同一 $ 块内`;

/**
 * Hard limits on formatting elements.
 * Benchmarked against McKinsey (3-5 bold/page) and Nature Reviews (max 7 display items).
 */
export const FORMATTING_LIMITS = `## 格式元素限额（硬性约束）

对标来源：McKinsey 3-5 bold/页，Nature Reviews max 7 展示项/篇

### 加粗（**bold**）
- 每个子节（### 标题下）最多 2 处加粗
- 仅加粗核心判断性语句（如"开源模型已逼近闭源 90% 性能"）
- 禁止加粗：单独的数字/百分比/倍数（如 ~~**68倍**~~、~~**25%**~~）
- 禁止加粗：整句（超过 30 字的内容不应整体加粗）
- 加粗文本应构成"扫描层"：读者仅看加粗内容即可获取核心论点

### 引用块（> blockquote）
- 全文（含所有维度）最多 10-15 个引用块
- 每个维度最多 2 个引用块
- 每个引用块不超过 150 字
- 仅用于：该维度最核心的 1 个判断 + 该维度最关键的 1 个数据发现
- 禁止每段结尾都加引用块总结

### 分割线（---）
- 禁止在 detailedContent 中使用 ---
- 章节分隔由标题层级自动实现

### 列表
- 有序列表统一 1. 2. 3.（阿拉伯数字），禁止中文数字
- 无序列表统一 - （短横线）
- 列表项不超过 2 层嵌套
- **每条列表项不超过 100 字**：超长列表项应拆分为多条，或改用段落展开
- 列表不是段落的替代品：每条列表项应是独立的点，不要把结论性段落放在列表末尾`;

/**
 * Flexible analysis depth requirement (replaces rigid 4-layer framework).
 */
export const ANALYSIS_DEPTH = `## 分析深度要求

每个关键论点必须回答"为什么"至少深入两层，但不要套用固定模板。

可选分析框架（根据内容特点灵活选择，不必每个论点都套用）：
- 现象-机制-影响：适用于技术趋势分析
- 数据-对比-判断：适用于市场格局分析
- 现状-瓶颈-路径：适用于挑战与机会分析

禁止：对每个话题都机械套用"现象层→机制层→结构层→启示层"四层结构。`;

/**
 * Citation quality standards.
 */
export const CITATION_STANDARDS = `## 引用规范

### 引用分布
- 每个子节应引用至少 2 个不同来源
- 单一来源在全文中被引用不超过 5 次
- 如发现某来源被反复使用，检查是否有替代来源

### 引用密度
- 对标：学术综述 ~25 引用/千字，行业报告 ~10 引用/千字
- 目标：每千字 10-15 处引用，均匀分布
- 禁止连续引用 3 个以上相同来源编号

### 来源权威性
- 优先引用：学术期刊、官方技术博客、权威行业报告
- 谨慎引用：新闻转载、社区讨论、个人博客
- 数据类引用必须标注具体来源页码或章节`;

/**
 * Chart data standards, differentiated by chart type.
 * Benchmarked against McKinsey (1 exhibit per 1.5-2 pages) and Nature (max 5-6 exhibits).
 */
export const CHART_STANDARDS = `## 图表规范

对标来源：McKinsey 1 展示项/1.5-2 页，Nature max 5-6 展示项/篇，APA/IEEE 图表就近原则

### 位置规范（最重要）
- **紧跟首次提及**：图表必须放在讨论该数据的段落之后（after_paragraph_N），禁止集中在章节末尾
- **图文对应**：在引用图表的段落中，必须用自然语言引述图表内容，如"从数据可以看出..."、"上述图表揭示了..."
- **禁止集中堆放**：禁止在章节末尾或报告末尾集中放置所有图表
- position 字段首选 after_paragraph_N（N 为与图表最相关的段落序号），其次 after_heading_N

### 数据点要求（按图表类型区分）
- 柱状图（bar）：最少 3 个数据点
- 折线图（line/area）：最少 5 个数据点
- 饼图（pie）：最少 3 个扇区
- 散点图/雷达图（radar）：最少 10 个数据点
- 2 个数据点的对比改用行内文字或表格呈现

### 图表标题
- 标题必须是完整的发现性句子（对标 McKinsey 标准）
  - 正确："开源模型参数规模在 2024-2026 年稳定在 120B-235B 区间"
  - 错误："典型LLM参数规模演进（示意）"
- 禁止标题中出现"示意"、"概念"、"定性对比"等弱化词

### 数量限制
- 每个维度最多 2 个图表
- 全文最多 12-14 个图表（含引用图 + 生成图）`;

/**
 * Chapter highlights format (Stanford HAI Chapter Highlights pattern).
 */
export const CHAPTER_HIGHLIGHTS = `## 章节要点速览（每个维度 detailedContent 开头必须包含）

在 detailedContent 最开头，第一个 ### 标题之前，插入一个引用块作为本章要点速览：

> **本章要点**
> - 要点 1：一句话核心发现（含关键数据）
> - 要点 2：一句话核心发现
> - 要点 3：一句话核心发现

约束（严格执行）：
- 3-5 条要点，每条**严格不超过 30 字**（含标点）
- 要点必须是完整句子，不能半截结尾。如果发现自己要写超过 30 字，就缩短描述
- 不要在要点中包含数学公式或技术细节，只写结论性判断
- 这是全文中该维度唯一允许的"开头引用块"
- 对标 Stanford HAI 的 Chapter Highlights 模式`;

/**
 * Executive summary format (McKinsey SCR framework).
 */
export const EXECUTIVE_SUMMARY_FORMAT = `## 执行摘要（对标 McKinsey SCR 框架）

### 结构（严格按顺序）
1. **核心论断**（1 句话，30 字以内，加粗）：全文最重要的单一结论
2. **背景**（2-3 句）：研究范围和时间窗口
3. **核心发现**（3-5 条，编号列表）：每条 1-2 句话，加粗要点句
4. **关键指标**（表格）：指标名 | 数值 | 来源
5. **风险预警**（2-3 条，编号列表）：每条 1 句话
6. **行动建议**（3 条，按角色）：每条 1 句话

### 约束
- 总长度 400-600 字
- 核心发现每条加粗第一句（判断句），第二句不加粗（数据支撑）
- 必须独立可读：不读全文也能获取核心信息
- 禁止使用引用块`;

/**
 * Formatting standards for report synthesis (supplementary sections).
 * Replaces the permissive "use bold and blockquotes" instructions.
 */
export const SYNTHESIS_FORMATTING = `## 格式要求
- 使用 Markdown 格式
- 用表格呈现结构化数据（如风险矩阵、关键指标）
- 加粗仅用于核心判断句（每节最多 2 处）
- 禁止在补充内容中使用 > 引用块（引用块预算留给维度章节）
- 禁止使用 --- 分割线

### 补充内容标题层级
- 跨维度关联分析、风险评估、战略建议等补充内容必须使用 ### 子标题组织结构
- 例如跨维度分析下使用 "### 因果链分析"、"### 系统性风险"、"### 维度对比" 等子标题
- 战略建议下按受众使用 "### 企业决策者"、"### 投资者"、"### 技术从业者" 等子标题
- 禁止用纯加粗文本代替标题（如 **技术架构：** 应改为 ### 技术架构）
- 每条列表项不超过 100 字，结论性内容用段落而非列表项表达`;

// ============ English Variants ============

export const HEADING_HIERARCHY_EN = `## Heading Hierarchy Rules

Your content is embedded under \`## DimensionName\`, so:
- Use \`###\` for sub-sections (e.g. ### Background, ### Current Analysis)
- Use \`####\` for sub-sub-sections (e.g. #### Competitive Landscape)
- Do NOT use \`#\` or \`##\` (reserved for report framework)
- Do NOT use \`#####\` or deeper levels

Rule: Maximum 2 levels (### and ####). Structure through content, not heading depth.`;

export const PROFESSIONAL_TONE_EN = `## Writing Style Standards

### Analytical Tone (third-person primary, first-person secondary)
- Present data in third person: "Data indicates...", "Evidence suggests...", "Research shows..."
- Use restrained first person for judgments: max 1 "our analysis shows" per sub-section
- Total first-person expressions ("we believe/observe/find") max 10 across entire document
- Benchmarked: McKinsey uses "Our analysis shows" (sparingly), Stanford HAI uses third person

### Prohibited
- Colloquial expressions
- Cliché openings: "In today's rapidly evolving...", "As we navigate..."
- Arrow chains: Do NOT use → to chain causality. Use "this leads to...", "which in turn causes...", "resulting in..."

### Terminology Consistency
- First occurrence of each term: include original term in parentheses if non-English
- Use consistent English terminology throughout
- Do not switch between equivalent terms

### Absolutely Prohibited Internal Information
- **No word counts**: Never output "(word count: ~XXX)", "(current count: XXX)" or similar
- **No role names**: Never output "Leader", "Agent", "Research Agent" or similar internal multi-agent role names
- **No textbook references**: Do not use "as the curriculum shows", "the learning roadmap indicates"
- **No internal annotations**: Never output "data support summary", "independent insight", "needs verification"

### Math Formulas
- **Use standard LaTeX syntax**: Rendered by frontend KaTeX
- Inline formulas: \`$...$\` (e.g. \`$O(n^2)$\`, \`$\\frac{a}{b}$\`)
- Display formulas: \`$$...$$\`
- Simple expressions can use Unicode: O(n²), √n
- **Completeness**: One math expression must be in a single \`$...$\` pair. Never split like \`$A$ $\\in$ $B$\``;

export const FORMATTING_LIMITS_EN = `## Formatting Limits (Hard Constraints)

### Bold (**bold**)
- Max 2 bold items per sub-section (### heading)
- Only bold core judgment statements
- Do NOT bold: standalone numbers/percentages, entire sentences (>30 words)
- Bold text should form a "scan layer": reader gets core points from bold alone

### Blockquotes (> blockquote)
- Max 10-15 blockquotes across entire report
- Max 2 blockquotes per dimension
- Each blockquote max 150 words
- Only for: 1 core judgment + 1 key data finding per dimension

### Horizontal Rules (---)
- Do NOT use --- in detailedContent
- Section separation is handled by heading hierarchy

### Lists
- Ordered lists: 1. 2. 3. (Arabic numerals only)
- Unordered lists: - (dash only)
- Max 2 nesting levels
- **Each list item max 100 characters**: Split long items into multiple items or use paragraphs
- Lists are not paragraph substitutes: Do not put concluding paragraphs as list items`;

export const CHAPTER_HIGHLIGHTS_EN = `## Chapter Highlights (required at start of each dimension's detailedContent)

At the very beginning of detailedContent, before the first ### heading, insert a blockquote:

> **Chapter Highlights**
> - Point 1: One-sentence core finding (with key data)
> - Point 2: One-sentence core finding
> - Point 3: One-sentence core finding

Constraints:
- 3-5 points, each max 30 words
- This is the only "opening blockquote" allowed for each dimension
- Benchmarked: Stanford HAI Chapter Highlights pattern`;

export const EXECUTIVE_SUMMARY_FORMAT_EN = `## Executive Summary (McKinsey SCR Framework)

### Structure (strict order)
1. **Thesis Statement** (1 sentence, max 30 words, bold): The single most important conclusion
2. **Context** (2-3 sentences): Research scope and time window
3. **Core Findings** (3-5 items, numbered): Each 1-2 sentences, bold the judgment sentence
4. **Key Metrics** (table): Metric | Value | Source
5. **Risk Alerts** (2-3 items, numbered): Each 1 sentence
6. **Action Items** (3 items, by audience): Each 1 sentence

### Constraints
- Total length 400-600 words
- Core findings: bold first sentence (judgment), second sentence plain (data support)
- Must be independently readable: core information without reading full report
- Do NOT use blockquotes`;

/**
 * Language-aware writing standards resolver.
 *
 * Returns the complete set of writing standards as a single string block
 * in the appropriate language. Used by prompts that need runtime language switching.
 *
 * @param language "zh" | "en" (default "zh")
 */
export function getWritingStandards(language: string = "zh"): string {
  if (language.startsWith("en")) {
    return [
      HEADING_HIERARCHY_EN,
      PROFESSIONAL_TONE_EN,
      FORMATTING_LIMITS_EN,
      CHAPTER_HIGHLIGHTS_EN,
    ].join("\n\n");
  }
  return [
    HEADING_HIERARCHY,
    PROFESSIONAL_TONE,
    FORMATTING_LIMITS,
    CHAPTER_HIGHLIGHTS,
  ].join("\n\n");
}

/**
 * Language-aware executive summary format.
 */
export function getExecutiveSummaryFormat(language: string = "zh"): string {
  return language.startsWith("en")
    ? EXECUTIVE_SUMMARY_FORMAT_EN
    : EXECUTIVE_SUMMARY_FORMAT;
}
