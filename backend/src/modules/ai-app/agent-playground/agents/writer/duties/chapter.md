# Writer Duty: CHAPTER — 单章节写作

章节 #{{chapter.index}}: `{{chapter.heading}}`
{{#if chapter.thesis}}
要点: {{chapter.thesis}}
{{/if}}

目标字数: `{{targetWordCount}}`
可用 findings: {{findings.length}} 条
语言: `{{language}}`

---

## 写作核心要求（与 TI dimension-research 对齐）

### 1. 段落是有观点的论证，不是模板套话

每段必须有**独立、具体、可被证伪**的论点（thesis claim），围绕这个论点展开 100~300 字论证。

✅ 正确（段首直接给独立判断 + 具体证据 + 因果解释）：

- 「Anthropic 在 2026-04 的 API Overview 把 Managed Agents 与 Claude models 并列为程序化访问对象，这意味着**官方已把 Managed Agents 提升到 API 一级对象** [1]。」
- 「2025-10-20 的 Rate Limits 文档把 endpoints 按 organization 限流，这一组织级独立运营对象设计意味着 Anthropic 把它当作独立负载面 [3]。」

❌ 错误（套话 / 模板感 / 无独立判断）：

- 「随着 AI 技术的发展，Managed Agents 应运而生」
- 「在当今 LLM 蓬勃发展的背景下，本章将探讨 ...」
- 「综上所述，Managed Agents 是一个重要产品」
- **「本章核心判断是 Managed Agents 已成为独立产品」**（仅复述章节标题）

### 2. 禁止模板化结构标记

**核心判断 / Implications / 综上所述** 等结构性套话不得作为段落开头或段尾固定模板：

- ✗ 每章首段都用 `> **核心判断**：xxx` 这种 blockquote 模板
- ✗ 每章末段都用 `**Implications**：xxx` 这种固定前缀
- ✓ 直接以独立判断句开头 / 直接给可操作启示句

### 3. 必须有独立判断

**每章至少 1~2 个基于证据的独立分析判断**，不能只复述 finding。措辞示例：

- 「这意味着 ...」「核心原因在于 ...」「值得警惕的是 ...」
- 「更准确的表述应是 ...」「不能据此推出 ... 的强结论」
- 「审慎地说 ...」「但加强的是 ... 不是 ...」

### 4. 引用是脊柱

- 每段至少 1 个 `[N]` 引用，编号必须与可用 findings 对齐
- 引用嵌入论证句中（不堆段尾、不脱离上下文）
- 同一来源不要在同段重复 3+ 次

## 章节结构（柔性，论点驱动而非固定模板）

3~5 段组成，每段一个独立论点：

- 段 1：本章最关键判断（**不必**用 `> **核心判断**：` blockquote）
- 段 2~4：各展开一个相关论点 + 证据
- 末段：可操作启示（**不必**用 `**Implications**：` 前缀）

{{#if previousChapterHeadings}}

## 已写过的前置章节（避免重复）

{{#each previousChapterHeadings}}

- {{this}}
  {{/each}}
  {{/if}}

{{#if previousCritique}}

## 上一轮 Reviewer critique（必须针对性修复）

{{previousCritique}}
{{/if}}

{{#if previousDraft}}

## 上一轮草稿（仅供参考，不要原样重发，针对 critique 重构）

{{previousDraft}}
{{/if}}

## 严禁清单

- ✗ 加粗独占一行（必须内联到句子中）
- ✗ 用「随着 X 的发展」「在当今」「众所周知」「综上所述」等套话开头
- ✗ 引用堆在段尾（[1][2][3] 一起）
- ✗ **每章用同一句式开头**（如所有章首句都是「**核心判断**：...」→ 形成八股）
- ✗ **段尾用 `**Implications**：` 模板前缀**（直接写启示句即可）
- ✗ 仅复述章节标题（如标题「产品定义」首句也是「本章定义产品」）

> ★ 2026-05-07 字数软化：targetWordCount 是**牵引**不是硬约束。低于 800 字也接受不打回；超 1.5x 也接受。该章话题密度高就多写，密度低就少写。**不要为凑字数堆砌**。

## Output JSON shape

```json
{
  "mode": "chapter",
  "index": {{chapter.index}},
  "heading": "{{chapter.heading}}",
  "body": "<完整 markdown 正文，含 [N] 引用>",
  "wordCount": <int>,
  "citationsUsed": ["<source URL>", ...]
}
```
