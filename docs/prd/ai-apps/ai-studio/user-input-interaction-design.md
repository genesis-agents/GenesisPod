# 用户输入交互设计 - AI Leader 解码机制

## 背景

当前问题：

1. 用户输入后，直接变成 TODO，没有 AI 反馈
2. 用户不知道 AI 是否理解了请求
3. 缺乏对话感和交互感
4. 无法看到 AI Leader 的决策过程

## 目标设计

### 核心原则

- **即时响应**：用户输入后立即看到 AI Leader 的响应
- **透明决策**：AI Leader 解释如何处理用户请求
- **灵活选择**：AI Leader 决定是否需要创建 TODO、直接回答、或请求澄清

---

## 交互流程设计

### 场景 1：用户提问（无需创建 TODO）

```
用户: 当前研究进度如何？

AI Leader 响应:
┌──────────────────────────────────────────────────────┐
│ 🧠 Leader 回复                                        │
│                                                       │
│ 当前研究进度概况：                                    │
│ • 已完成 3/5 个维度研究                               │
│ • 报告撰写进度 40%                                    │
│ • 预计还需 15 分钟完成                                │
│                                                       │
│ [无需创建任务，已直接回答]                            │
└──────────────────────────────────────────────────────┘
```

### 场景 2：用户请求新任务（需要创建 TODO）

```
用户: 请深入研究政策环境的国际比较

AI Leader 响应:
┌──────────────────────────────────────────────────────┐
│ 🧠 Leader 理解                                        │
│                                                       │
│ 收到！我理解你希望：                                  │
│ • 对政策环境维度进行更深入的研究                      │
│ • 重点关注国际比较分析                                │
│                                                       │
│ 📋 已添加到 TODO:                                     │
│ "政策环境 - 国际比较深度分析"                         │
│                                                       │
│ [任务已创建，研究员即将开始工作]                      │
└──────────────────────────────────────────────────────┘
```

### 场景 3：用户请求需要澄清

```
用户: 再研究一下

AI Leader 响应:
┌──────────────────────────────────────────────────────┐
│ 🧠 Leader 确认                                        │
│                                                       │
│ 我需要确认一下，你希望：                              │
│                                                       │
│ ○ 对某个维度进行更深入的研究？                        │
│ ○ 刷新所有数据重新研究？                              │
│ ○ 添加新的研究维度？                                  │
│                                                       │
│ 请补充说明，或选择上述选项。                          │
└──────────────────────────────────────────────────────┘
```

---

## UI 组件设计

### 1. 对话式消息列表 (新增)

在 QuickCommandBar 下方，添加对话式消息列表：

```
┌───────────────────────────────────────────────────────────┐
│ 研究协作面板                                               │
├───────────────────────────────────────────────────────────┤
│ [快捷指令栏 - QuickCommandBar]                             │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ 输入研究指令... 🔍深入 📊维度 📝报告 🔄刷新 💡建议   │   │
│ └─────────────────────────────────────────────────────┘   │
│                                                           │
│ ┌─── 对话消息区 (新增) ─────────────────────────────────┐ │
│ │                                                       │ │
│ │ 👤 用户 (14:30:05)                                    │ │
│ │ 请深入研究政策环境的国际比较                          │ │
│ │                                                       │ │
│ │ 🧠 Leader (14:30:08)                                  │ │
│ │ 收到！我理解你希望对政策环境维度进行更深入的研究。    │ │
│ │ 已添加到 TODO: "政策环境 - 国际比较深度分析"         │ │
│ │ [查看 TODO →]                                         │ │
│ │                                                       │ │
│ └───────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌─── TODO 列表 ─────────────────────────────────────────┐ │
│ │ ▶ 进行中 (2)                                          │ │
│ │ ▷ 待处理 (3)                                          │ │
│ │ ✓ 已完成 (4)                                          │ │
│ └───────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

### 2. Leader 决策类型

AI Leader 收到用户输入后，返回以下决策之一：

```typescript
interface LeaderDecision {
  type: "DIRECT_ANSWER" | "CREATE_TODO" | "CLARIFY" | "REJECT";

  // DIRECT_ANSWER: 直接回答，无需创建任务
  response?: string;

  // CREATE_TODO: 创建新任务
  todoTitle?: string;
  todoDescription?: string;

  // CLARIFY: 需要澄清
  clarifyQuestion?: string;
  options?: string[];

  // REJECT: 拒绝执行（超出范围等）
  rejectReason?: string;
}
```

---

## 技术实现

### 后端 API 变更

新增 `/topics/:id/leader-chat` 端点：

```typescript
// POST /api/v1/topic-research/topics/:topicId/leader-chat
interface LeaderChatRequest {
  message: string;
  missionId?: string;
}

interface LeaderChatResponse {
  decisionType: "DIRECT_ANSWER" | "CREATE_TODO" | "CLARIFY" | "REJECT";
  leaderResponse: string; // Leader 的响应文本
  todo?: {
    // 如果创建了 TODO
    id: string;
    title: string;
    type: string;
  };
  clarifyOptions?: string[]; // 如果需要澄清
}
```

### Leader 决策 Prompt

```
你是研究团队的 Leader。用户刚刚发送了一条消息，请根据消息内容决定如何响应：

用户消息: "{message}"

当前研究状态:
- 主题: {topicName}
- 进行中的维度: {currentDimensions}
- TODO 列表: {todoList}

请决定：
1. DIRECT_ANSWER - 如果是简单问题，直接回答
2. CREATE_TODO - 如果需要执行新任务，创建 TODO
3. CLARIFY - 如果请求模糊，请求澄清
4. REJECT - 如果超出研究范围，礼貌拒绝

以 JSON 格式返回你的决定和响应。
```

### 前端组件变更

1. 新增 `LeaderChatMessages` 组件
2. 修改 `handleInstructionSubmit` 流程
3. 添加实时消息显示

---

## 实现优先级

### Phase 1: 基础对话显示 ✅

- [x] 添加 Leader 响应显示区域
- [x] 用户消息即时显示
- [x] Leader 响应后显示决策结果

### Phase 2: Leader 决策逻辑 ✅

- [x] 后端 leader-chat API
- [x] Leader 决策 Prompt
- [x] 决策类型处理

### Phase 3: 高级交互 ✅

- [x] 澄清选项点击
- [x] TODO 快捷跳转
- [x] 历史消息滚动

**实现完成日期**: 2025-01-14

---

## 视觉设计参考

### 消息样式

```css
/* 用户消息 */
.user-message {
  background: #f0f9ff;
  border-left: 3px solid #3b82f6;
  padding: 12px 16px;
  margin-bottom: 12px;
}

/* Leader 响应 */
.leader-response {
  background: #f0fdf4;
  border-left: 3px solid #22c55e;
  padding: 12px 16px;
  margin-bottom: 12px;
}

/* 决策标签 */
.decision-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
}
.badge-todo {
  background: #dbeafe;
  color: #1d4ed8;
}
.badge-answer {
  background: #dcfce7;
  color: #16a34a;
}
.badge-clarify {
  background: #fef3c7;
  color: #d97706;
}
```

---

## 总结

这个设计将用户输入从"黑箱 TODO 创建"改为"对话式 AI 协作"：

| 当前               | 改进后                       |
| ------------------ | ---------------------------- |
| 输入 → TODO        | 输入 → AI 响应 → (可能) TODO |
| 无即时反馈         | 即时显示 AI 理解             |
| 不知道 AI 做了什么 | 透明展示决策过程             |
| 纯任务列表         | 对话+任务双模式              |
