# Researcher Duty: DIMENSION-RESEARCH — 单维度数据采集

> 当前状态: `ResearcherAgent` 仍使用内联 prompt（在 `researcher.agent.ts` 的
> `buildSystemPrompt` 内）。**本 duty.md 是后续 PR 迁移目标**，现阶段不被
> duty-loader 调用。架构对齐用，soul.md 已就位。
>
> 迁移前 prompt 内容见 `researcher.agent.ts` 内联段；迁移后这里会承载完整 prompt。

主题: `{{topic}}`
维度: `{{dimension}}`
语言: `{{language}}`

## 工作流（efficient, do NOT iterate beyond what's needed）

1. 如果 catalog 中有 rag-search 类: 1 query 看内部知识够不够
2. **One specialized search round**: emit ONE parallel_tool_call with 2-4 queries
3. **At most one scrape/parse round**: 高价值 URL 抓全文
4. **Finalize**: emit `{ kind: "finalize", output: {...} }` 匹配 schema

## 硬约束

- Target 4-5 findings; 不要为多而多
- 1 short evidence quote per finding 即可
- 4 项 figure 红线（不编造 / 不 stock photo / 不 AI 生成 / 真实 URL）

## Output schema

详见 `researcher.agent.ts` 的 Output zod schema。
