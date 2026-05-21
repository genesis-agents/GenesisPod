# 006. 对话式 AI 整理 - ChatFacade tool-loop + 薄封装既有写操作

**Date**: 2026-05-21
**Status**: 🟡 Proposed（评审中，待集体评审通过）
**关联设计文档**: [ai-app/conversational-organize-design.md](../architecture/ai-app/conversational-organize-design.md)

## 背景

`library` 现有「一键整理」（`AIOrganizePanel` + `ai-file-organizer` + `collections` 批量写）只能跑死板预设，无法表达组合意图（"把所有 AI 论文归一个新集合并打标，已读的别动"）。需新增「对话整理」：自然语言指令 → AI 边对话边真实改动书签/笔记/外部内容。一键模式保留不回退。

## 决策

1. **Function Calling 跑法**：用 Engine 原生 `ChatFacade.chat({ tools })`（已支持 `tools: FunctionDefinition[]` 入参 + 返回 `toolCalls`）+ 在新建 `ai-app/library/organize-chat` 服务内写**薄 tool-loop**（chat → 执行 toolCalls → 结果回灌 → 再 chat，最大 N 轮）。
   - **不**走 ai-harness 的 agent runner / function-calling-executor：organize 是「聊天改库」而非 agent mission，用 harness 是跨层 + 过度抽象。
2. **工具不进全局 ToolRegistry**：本模块内联 `FunctionDefinition[]` + switch 执行器，薄封装 `CollectionsService`（建集合/打标/移动/改状态）、`AiFileOrganizerService`（分类建议）、`NotesService` 既有方法，**不重写 SQL**。
3. **强权限**：所有工具调用注入服务端 `userId` 做行级过滤，不信任 LLM 传的 id；破坏性动作前端 `confirm`；外部连接**只读 + 归类到本地**，不回写第三方。
4. **流式**：SSE（同 AI Ask）+ 代理掐断对账兜底（复用已立 `ai-ask-stream` reconcile 范式）。
5. **会话**：独立 `OrganizeSession`（不复用 `AskSession`，避免污染 ai-ask 会话列表）。

## 范围 / 顺序

- 覆盖书签 + 笔记 + 外部连接（统一对话界面，scope 切数据源）。
- 用户已定：**本特性先于 [ADR-007] Agent Teams 迁移**。

## 影响

- 新增后端模块 `organize-chat` + 前端面板「对话整理」Tab。
- 0 破坏：一键模式与既有整理能力不变；对话模式底层共用同一批写操作。

## 待评审（详见设计文档 §9）

破坏性确认粒度 / 计费口径（按轮 vs 按工具）/ tool-loop 轮次上限 / 外部只读边界。
