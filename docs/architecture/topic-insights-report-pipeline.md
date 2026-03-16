# Topic Insights 报告生成管线 — 全链路基线文档

> 版本: 1.0 | 日期: 2026-03-16 | 维护者: Claude Code

## 概览

Topic Insights 报告生成是一个多阶段、多 LLM 调用的管线，从用户创建话题到最终报告输出共 9 个环节、15+ 个处理步骤。

```
用户创建话题
    ↓
[环节1] Leader 规划维度
    ↓
[环节2] 多维度并行执行
    ├─ [2.1] 搜索 → evidence 收集
    ├─ [2.2] Leader 规划维度 outline（keyPoints, sections）
    ├─ [2.3] Section Writer 生成各章节
    │   ├─ parseChartOutput 分离 markdown/JSON
    │   ├─ QualityGate 检查/修复
    │   └─ Section revision（如需）
    ├─ [2.4] Leader 整合维度内容
    ├─ [2.5] 证据保存 + 引用重映射
    └─ [2.6] 分析结果转换
    ↓
[环节3] Report Synthesis（跨维度合成）
    ├─ 前言、执行摘要
    ├─ 跨维度分析、风险评估、战略建议
    └─ 结语
    ↓
[环节4] 报告组装 assembleFullReport
    ├─ processDimensionContent（每维度规范化）
    ├─ 拼接所有内容
    └─ 参考文献生成
    ↓
[环节5] postProcessFinalReport 后处理
    ↓
[环节6] outputReview 质量审查
    ↓
[环节7] 保存到数据库
```

---

## 环节详解

### 环节1: Leader 规划全局维度

| 项目         | 内容                                                                 |
| ------------ | -------------------------------------------------------------------- |
| **Service**  | `services/core/leader/leader-planning.service.ts` → `planResearch()` |
| **Prompt**   | `prompts/research-leader.prompt.ts` → `LEADER_PLAN_PROMPT`           |
| **输入**     | topic name, description, type, language                              |
| **输出**     | `LeaderPlan { dimensions[], globalOutline }`                         |
| **清理**     | 无                                                                   |
| **污染风险** | 低 — LLM 输出结构化 JSON                                             |

### 环节2.1: 搜索阶段

| 项目         | 内容                                                                      |
| ------------ | ------------------------------------------------------------------------- |
| **Service**  | `services/dimension/dimension-search.service.ts` → `executeSearchPhase()` |
| **输入**     | topic, dimension, searchQueries                                           |
| **输出**     | `SearchPhaseResult { evidenceData[], evidenceSummary, figureRegistry }`   |
| **清理**     | `DataEnrichmentService` 抓取全文时过滤 HTML/二进制                        |
| **污染风险** | 中 — fullContent 可能含 HTML 残留、过大 PDF 内容                          |

**子步骤**:

1. `DataSourceRouterService.fetchDataForDimension()` → 执行 web/academic/github 等多源搜索
2. `DataEnrichmentService.enrichSearchResults()` → 抓取 top-N 结果的完整页面内容
3. `FigureExtractorService` → Vision LLM 提取图表
4. `createEvidenceSummary()` → 生成证据摘要供 Leader 规划使用

### 环节2.2: Leader 规划维度 Outline

| 项目         | 内容                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Service**  | `services/core/leader/leader-planning.service.ts` → `planDimensionOutline()`                                             |
| **Prompt**   | `prompts/research-leader.prompt.ts` → `DIMENSION_OUTLINE_PROMPT`                                                         |
| **输入**     | topic, dimension, evidenceSummary, figuresSummary, otherDimensions                                                       |
| **输出**     | `DimensionOutline { sections[{ id, title, description, keyPoints[], targetWords, allocatedFigures[] }], executionPlan }` |
| **清理**     | `validateAllocatedFigures()` 校验图表 ID 合法性                                                                          |
| **污染风险** | 中 — keyPoints 可能含序号前缀、description 可能含元注释                                                                  |

**keyPoints 数据流**:

```
Leader LLM → outline.sections[].keyPoints (字符串数组)
    ↓
SectionWriterService.writeSection() 行 148-162
    → 格式化为 "point1；point2；point3。"
    ↓
渲染到 SECTION_WRITING_USER_PROMPT_TEMPLATE 的 {{keyPoints}}
    ↓
Section Writer LLM 看到 keyPoints 并生成内容
```

### 环节2.3: Section Writer 生成章节

| 项目         | 内容                                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| **Service**  | `services/dimension/section-writer.service.ts` → `writeSection()`                                                 |
| **Prompt**   | `prompts/dimension-research.prompt.ts` → `SECTION_WRITING_SYSTEM_PROMPT` + `SECTION_WRITING_USER_PROMPT_TEMPLATE` |
| **输入**     | section (title, keyPoints, targetWords), evidenceData[], previousSections, allocatedFigures, temporalContext      |
| **输出**     | `SectionWriteResult { content, figureReferences[], generatedCharts[] }`                                           |
| **清理**     | `extractContent()` 去除 ```markdown 包装; `parseChartOutput()` 分离 JSON                                          |
| **污染风险** | **高** — LLM 输出最不可控的环节                                                                                   |

**LLM 可能输出的污染内容**:

- Chart JSON 块未使用 `---CHARTS---` 分隔符
- 裸 keyPoints bullet list
- 字数统计 `[字数约1520字]`
- 内部指令回显 `（注：本输出严格基于...）`
- 图表配置说明 `以下是本维度使用的图表引用配置`
- 占位符 `[图表引用待定]`
- 营销话术
- 引用堆积 `[1][2][3][4][5]`
- 孤立 JSON 符号 `]` `}` `{`

### 环节2.3.1: parseChartOutput

| 项目         | 内容                                                                 |
| ------------ | -------------------------------------------------------------------- |
| **函数**     | `section-writer.service.ts` 行 990-1063 → `parseChartOutput()`       |
| **输入**     | LLM 原始输出                                                         |
| **输出**     | `{ markdown, charts }`                                               |
| **清理**     | 按 `---CHARTS---` 分隔符分离; `stripChartJsonFromContent()` 兜底清理 |
| **污染风险** | **高** — LLM 不使用分隔符时，JSON 会残留在 markdown 中               |

### 环节2.3.2: QualityGate 检查

| 项目         | 内容                                                                             |
| ------------ | -------------------------------------------------------------------------------- |
| **Service**  | `services/quality/report-quality-gate.service.ts` → `validateDimensionContent()` |
| **输入**     | section content (单个 section 的 markdown)                                       |
| **输出**     | `QualityCheckResult { passed, violations[], fixedContent, rewriteGuidance[] }`   |
| **调用位置** | `dimension-mission.service.ts` 行 1554                                           |

**清理步骤（按顺序）**:

1. `sanitizeHeadingLevels()` — H1/H2 → H3
2. `removeHorizontalRules()` — 删除 `---`
3. `limitBoldFormatting()` — 限制加粗数量
4. `limitBlockquotes()` — 限制引用块
5. `stripLLMMetaNotes()` — 清理字数统计、角色声明等
6. `stripInternalFigureNotation()` — 清理图表标注
7. `validateAndFixLatex()` — 修复 LaTeX
8. `deduplicateHeadings()` — 去重标题
9. `stripChartJsonFromContent()` — 清理 JSON 残留
10. 内联图片清理 — `![alt](url)` 和 `!(url)`
11. 引用堆积拆分 — 3+ 连续引用保留前 2 个
12. 裸 keyPoints 删除 — ### 后 3+ bullets 自动删除
13. 数量声明不匹配检测 — 触发 rewrite
14. 营销话术替换 — 替换为中性表述

**⚠️ 已知盲区**:

- 只检查 `### ` 标题后的 bullets，不检查 `## ` 标题后的
- `validateDimensionContent` 处理的是单个 section 内容，**不含 section 标题**（标题在 assembler 中拼入）
- dimension 级别的 keyFindings bullets 不经过 QualityGate

### 环节2.4: Leader 整合维度内容

| 项目         | 内容                                                                                |
| ------------ | ----------------------------------------------------------------------------------- |
| **Service**  | `services/core/research/research-leader.service.ts` → `integrateDimensionResults()` |
| **输入**     | dimension info, sectionResults[]                                                    |
| **输出**     | `IntegratedDimensionResult { content, metadata { summary, keyFindings[] } }`        |
| **清理**     | 无                                                                                  |
| **污染风险** | 中 — LLM 可能在整合时引入新的格式问题                                               |

**关键**: `keyFindings` 是一个字符串数组，在 assembler 中可能被拼为 bullet list。

### 环节2.5: 证据保存 + 引用重映射

| 项目         | 内容                                                                       |
| ------------ | -------------------------------------------------------------------------- |
| **函数**     | `dimension-mission.service.ts` → `saveEvidence()` + `replaceEvidenceIds()` |
| **输入**     | evidenceData[], integratedResult.content                                   |
| **输出**     | 内容中 `[promptIndex]` → `[dbCitationIndex]`                               |
| **清理**     | 无（纯数字替换）                                                           |
| **污染风险** | 低 — 但如果 promptIndex 体系与实际 evidence 不一致，引用会错位             |

### 环节3: Report Synthesis

| 项目         | 内容                                                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Service**  | `services/report/report-synthesis.service.ts` → `synthesizeReport()`                                                               |
| **输入**     | 所有维度的 DimensionAnalysisInput[]                                                                                                |
| **输出**     | `SupplementaryContent { preface, executiveSummary, crossDimensionAnalysis, riskAssessment, strategicRecommendations, conclusion }` |
| **清理**     | `normalizeReportResponse()` 将补充内容独立存储（不拼入 conclusion）                                                                |
| **污染风险** | 中 — 每个补充部分都是 LLM 生成，可能含元注释/格式问题                                                                              |

### 环节4: 报告组装

| 项目        | 内容                                                                   |
| ----------- | ---------------------------------------------------------------------- |
| **Service** | `services/report/report-assembler.service.ts` → `assembleFullReport()` |
| **输入**    | topic, dimensionInputs[], supplementaryContent                         |
| **输出**    | 完整 markdown 报告                                                     |

**组装顺序**:

```
# 标题
> 生成时间
## 前言
## 执行摘要
## 目录
## 1. 维度1
  [keyFindings bullets]    ← ⚠️ 从 dimensionInput.keyFindings 生成
  [detailedContent]        ← 经过 processDimensionContent 处理
## 2. 维度2
  ...
## 跨维度关联分析
## 风险评估
## 战略建议
## 结语
# 参考文献
```

**processDimensionContent 管道**（12 步清理）:

1. stripLeadingHeading
2. stripChartJsonFromContent
3. stripLLMMetaNotes
4. sanitizeHeadingLevels
5. deduplicateHeadings
6. numberSubHeadings
7. hierarchicalNumberBoldListItems
8. deduplicateParagraphs
9. 截断（MAX_DIMENSION_CHARS）
10. resolveChartPlaceholders
11. stripInternalFigureNotation
12. stripLLMMetaNotes（二次清理）

**⚠️ 关键盲区**: `## N. 维度名` 后面拼入的 keyFindings bullets **不经过任何清理**。

### 环节5: postProcessFinalReport

| 项目        | 内容                                                                       |
| ----------- | -------------------------------------------------------------------------- |
| **Service** | `services/report/report-assembler.service.ts` → `postProcessFinalReport()` |
| **输入**    | 完整 markdown                                                              |
| **输出**    | 最终 markdown                                                              |

**处理步骤**:

1. 移除残余 figure 占位符
2. stripInternalFigureNotation
3. stripLLMMetaNotes
4. repairTruncatedBlockquoteBullets
5. decodeHtmlEntities
6. fixDoubleSourceLabels
7. repairBrokenListItems
8. clearBrokenMediaAndEmptyBlocks
9. repairMarkdownTables
10. ensureBlankLineAfterTables
11. extractTableFootnotes
12. splitWallOfText
13. detectAndPromoteHeadings
14. deduplicateHeadingEcho
15. repairOrderedListContinuity
16. collapsePseudoCodeHeadings
17. bold-only → ### 标题转换
18. 双重 ### 修复
19. 空引用 [] 清理
20. 三连空行压缩
21. wrapPseudoCodeBlocks
22. collapseExcessSubHeadings
23. removeEmptyHeadings

### 环节6: outputReview

| 项目        | 内容                                                          |
| ----------- | ------------------------------------------------------------- |
| **Service** | `ai-engine/orchestration/services/output-reviewer.service.ts` |
| **输入**    | 报告前 5000 字符                                              |
| **输出**    | `ReviewResult { score, passed, feedback }`                    |
| **清理**    | 无 — 只评分不修改                                             |

### 环节7: 保存到数据库

| 项目        | 内容                                                           |
| ----------- | -------------------------------------------------------------- |
| **Service** | `services/report/report-synthesis.service.ts`                  |
| **数据**    | fullReport, executiveSummary, highlights, qualityTrace, charts |

---

## 清理函数调用矩阵

| 清理函数                    | 环节2.3 QualityGate | 环节4 processDimContent | 环节5 postProcess |
| --------------------------- | ------------------- | ----------------------- | ----------------- |
| stripChartJsonFromContent   | ✅                  | ✅                      | ❌                |
| stripLLMMetaNotes           | ✅                  | ✅×2                    | ✅                |
| stripInternalFigureNotation | ✅                  | ✅                      | ✅                |
| sanitizeHeadingLevels       | ✅                  | ✅                      | ❌                |
| deduplicateHeadings         | ❌                  | ✅                      | ❌                |
| numberSubHeadings           | ❌                  | ✅                      | ❌                |
| deduplicateParagraphs       | ❌                  | ✅                      | ❌                |
| bold-only → ###             | ❌                  | ❌                      | ✅                |
| 双重 ### 修复               | ❌                  | ❌                      | ✅                |
| 空引用清理                  | ❌                  | ❌                      | ✅                |
| 裸 keyPoints 删除           | ✅ (仅 ###)         | ❌                      | ❌                |
| 引用堆积拆分                | ✅                  | ❌                      | ❌                |
| 营销话术替换                | ✅                  | ❌                      | ❌                |

---

## 已知污染路径

### 路径 A: keyFindings bullets 绕过清理

```
环节2.4 integrateDimensionResults
  → metadata.keyFindings = ["finding1", "finding2", ...]
    ↓
环节4 assembleFullReport
  → parts.push(`## N. 维度名\n`)
  → parts.push(processed)   ← detailedContent 已清理
    但 keyFindings 如果在 detailedContent 开头作为 bullets，
    它们经过了 processDimensionContent 清理（包含 stripLLMMetaNotes）
    但 processDimensionContent 不删除 bullets
```

### 路径 B: Section Writer LLM 输出不可控

```
环节2.3 Section Writer LLM
  → 输出包含裸 keyPoints, JSON, 字数统计, 指令回显等
    ↓
环节2.3.1 parseChartOutput
  → 只处理 ---CHARTS--- 分隔的 JSON
  → 内联 JSON 残留
    ↓
环节2.3.2 QualityGate
  → 清理已知模式，但 LLM 变体无穷
  → 裸 keyPoints 自动删除只查 ### 不查内容开头
```

### 路径 C: Synthesis 补充内容未清理

```
环节3 Report Synthesis LLM
  → crossDimensionAnalysis, riskAssessment 等
  → 可能含 bold-only 标题、元注释
    ↓
环节4 assembleFullReport
  → supplementary 内容通过 extractMarkdownFromJsonString + stripLLMMetaNotes
  → 但不经过完整的 processDimensionContent 管道
```

---

## 质量改进方向

基于以上链路分析，质量改进应聚焦以下环节：

1. **环节2.3 Section Writer** — 这是污染的源头，LLM 输出最不可控
2. **环节4 assembleFullReport** — keyFindings bullets 拼入时缺少清理
3. **环节5 postProcessFinalReport** — 最后一道防线，应该是铁墙

**核心原则**: 不试图控制 LLM 行为（prompt 规则越多 LLM 表现越差），而是在 postProcess 铁墙中兜底清理所有已知污染模式。

---

_最后更新: 2026-03-16_
