# AI Coding 开发过程可视化增强 PRD

## 文档信息

| 属性     | 值                                            |
| -------- | --------------------------------------------- |
| 版本     | 1.0                                           |
| 作者     | PM Agent                                      |
| 创建日期 | 2025-12-22                                    |
| 状态     | 草稿                                          |
| 关联 PRD | `docs/prd/ai-coding-feature.md`               |
| 关联设计 | `docs/design/ai-coding-enhancement-design.md` |

---

## 1. 背景与问题分析

### 1.1 当前实现现状

DeepDive Engine 的 AI Coding 功能目前包含以下页面和组件：

**前端页面结构：**

- `/ai-coding` - 项目列表页
- `/ai-coding/new` - 新建项目页（核心开发流程可视化）
- `/ai-coding/[projectId]` - 项目详情页
- `/ai-coding/kanban` - 看板视图

**现有可视化元素（`new/page.tsx`）：**

- 左侧面板：Agent 状态列表（PM/Architect/PM Lead/Engineer/QA）
- 中间面板：协作消息流（带 Markdown 渲染）
- 右侧面板：产出预览（PRD/设计/任务/代码/测试）
- 进度条显示（0-100%）
- Agent 状态指示器（pending/running/completed/error）
- 流式点动画

**后端处理流程（`ai-coding.service.ts`）：**

```
PM Agent (0-20%) -> Architect Agent (20-40%) -> PM Lead Agent (40-50%)
-> Engineer Agent (50-80%) -> QA Agent (80-90%) -> Document (90-100%)
```

### 1.2 用户反馈的核心问题

用户明确指出：**"整个开发过程可视化太差"**

具体痛点分析：

| 痛点编号 | 问题描述                                                                           | 影响程度 |
| -------- | ---------------------------------------------------------------------------------- | -------- |
| P1       | **无法看到 Agent 具体在做什么** - 只显示"正在生成内容"的动画，不知道 AI 在思考什么 | 高       |
| P2       | **无法实时预览生成的代码** - 代码生成后只能下载 ZIP，无法直接运行验证              | 高       |
| P3       | **缺乏文件级别的可视化** - 不知道生成了哪些文件、每个文件的内容                    | 中       |
| P4       | **缺乏代码编辑能力** - 用户无法在线修改生成的代码                                  | 中       |
| P5       | **缺乏调试信息** - 出错时不知道问题在哪里                                          | 中       |

### 1.3 竞品对标分析

| 功能特性     | Bolt.new          | v0.dev      | 当前实现 | 差距 |
| ------------ | ----------------- | ----------- | -------- | ---- |
| 实时代码预览 | WebContainer 沙箱 | 组件预览    | 无       | 高   |
| 代码在线编辑 | Monaco Editor     | 基础编辑    | 无       | 高   |
| 文件树可视化 | 完整文件系统      | 组件级      | 简单列表 | 中   |
| 终端输出     | 完整终端          | 无          | 无       | 中   |
| 即时部署     | StackBlitz 部署   | Vercel 部署 | 无       | 高   |
| AI 思考过程  | 部分可见          | 不可见      | 简单显示 | 中   |

**核心差距**：Bolt.new 使用 [WebContainer](https://github.com/stackblitz/bolt.new) 技术在浏览器中运行完整 Node.js 环境，实现真正的实时预览，这是我们最大的差距。

---

## 2. 需求目标

### 2.1 产品目标

> 让用户能够**清晰看到 AI 团队的工作过程**，并**实时预览和运行生成的 Web 应用**，实现类似 Bolt.new 的开发体验。

### 2.2 成功指标

| 指标               | 当前值 | 目标值    | 衡量方式      |
| ------------------ | ------ | --------- | ------------- |
| 用户对可视化满意度 | 未知   | > 4.0/5.0 | 用户调研      |
| 项目完成率         | 未知   | > 80%     | 完成数/启动数 |
| 平均查看代码时间   | N/A    | > 5 分钟  | 页面停留      |
| 预览功能使用率     | N/A    | > 60%     | 功能使用统计  |

### 2.3 非目标（Out of Scope）

- 完整的在线 IDE 功能
- 多人实时协作编辑
- 生产级部署功能
- 数据库连接和后端服务运行

---

## 3. 用户故事

### 3.1 角色定义

- **开发者用户**：需要快速验证 AI 生成代码的技术用户
- **产品用户**：需要了解项目进展的非技术用户

### 3.2 用户故事列表

| ID     | 角色     | 故事                                                   | 价值       | 优先级 |
| ------ | -------- | ------------------------------------------------------ | ---------- | ------ |
| US-001 | 开发者   | 作为开发者，我想看到 AI 正在思考什么，以便理解生成逻辑 | 提高信任度 | P0     |
| US-002 | 开发者   | 作为开发者，我想实时预览生成的 Web 应用，以便验证功能  | 核心价值   | P0     |
| US-003 | 开发者   | 作为开发者，我想在线编辑生成的代码，以便快速调整       | 提高效率   | P1     |
| US-004 | 开发者   | 作为开发者，我想看到完整的文件树，以便了解项目结构     | 信息透明   | P1     |
| US-005 | 开发者   | 作为开发者，我想看到终端输出，以便调试问题             | 调试能力   | P2     |
| US-006 | 产品用户 | 作为产品用户，我想看到生成进度的详细信息               | 了解状态   | P1     |
| US-007 | 开发者   | 作为开发者，我想一键部署预览链接                       | 分享便捷   | P2     |

---

## 4. 功能需求

### 4.1 功能列表概览

| ID    | 功能名称          | 描述                              | 优先级 | 复杂度 |
| ----- | ----------------- | --------------------------------- | ------ | ------ |
| F-001 | AI 思考过程可视化 | 展示 Agent 当前思考内容、推理过程 | P0     | 中     |
| F-002 | 实时代码预览沙箱  | 在浏览器中运行生成的前端代码      | P0     | 高     |
| F-003 | 代码编辑器集成    | Monaco Editor 支持代码编辑        | P1     | 中     |
| F-004 | 增强文件树视图    | 可折叠、可搜索的文件树            | P1     | 低     |
| F-005 | 虚拟终端输出      | 显示构建和运行日志                | P2     | 中     |
| F-006 | 一键部署预览      | 生成可分享的预览链接              | P2     | 高     |

### 4.2 详细功能说明

#### F-001: AI 思考过程可视化

**描述**
实时展示每个 Agent 的思考过程，让用户了解 AI 正在分析什么、做什么决策。

**UI 设计建议**

```
+------------------------------------------------------------------+
|  [PM Agent]  正在分析需求...                                      |
+------------------------------------------------------------------+
|  > 识别到的关键需求:                                              |
|    - 用户认证功能                                                 |
|    - 数据展示仪表盘                                               |
|    - API 集成                                                     |
|                                                                    |
|  > 正在生成用户故事...                                            |
|    [====================          ] 60%                           |
|                                                                    |
|  > 当前思考:                                                       |
|    "根据需求描述，这是一个 B2B SaaS 应用，需要考虑多租户..."       |
+------------------------------------------------------------------+
```

**技术方案**

1. 后端：在每个 Agent 执行时，通过 WebSocket 推送 `THINKING` 类型消息
2. 消息内容包含：
   - `step`: 当前步骤（分析需求 / 生成设计 / 编写代码）
   - `thought`: AI 的思考内容片段
   - `keyPoints`: 识别的关键点列表
   - `progress`: 子任务进度
3. 前端：使用流式渲染展示思考过程，带打字机效果

**验收标准**

- [ ] 每个 Agent 开始工作时显示思考过程面板
- [ ] 思考内容实时更新，无明显延迟
- [ ] 用户可以折叠/展开思考过程

---

#### F-002: 实时代码预览沙箱

**描述**
在浏览器中运行生成的前端代码，用户可以直接看到应用效果，无需下载。

**UI 设计建议**

```
+----------------------------------+----------------------------------+
|           代码编辑区              |            预览区                |
+----------------------------------+----------------------------------+
|  [文件树]   |   [代码内容]        |                                  |
|             |                    |      +------------------+         |
|  src/       |   import React     |      |                  |         |
|   App.tsx   |   from 'react';    |      |   [应用预览]      |         |
|   main.tsx  |                    |      |                  |         |
|  package.   |   function App() { |      +------------------+         |
|    json     |     return (       |                                  |
|             |       <div>        |       [刷新] [新窗口] [控制台]    |
|             |         Hello!     |                                  |
+----------------------------------+----------------------------------+
|                        [终端输出区]                                  |
|  > npm install                                                       |
|  > npm run dev                                                       |
|  Ready on http://localhost:5173                                      |
+----------------------------------------------------------------------+
```

**技术方案对比**

| 方案            | 描述                    | 优点                    | 缺点                     | 推荐度 |
| --------------- | ----------------------- | ----------------------- | ------------------------ | ------ |
| A. WebContainer | 浏览器内 Node.js 运行时 | 最佳体验，完整 npm 支持 | 需引入 StackBlitz 依赖   | 高     |
| B. iframe + CDN | 使用 esm.sh 等 CDN 运行 | 简单实现，无需后端      | 功能有限，不支持复杂项目 | 中     |
| C. 后端沙箱     | Docker 容器运行代码     | 支持后端代码            | 需要后端资源，安全风险   | 低     |
| D. Sandpack     | CodeSandbox 嵌入方案    | 官方支持，稳定          | 需要 API Key，有限制     | 中     |

**推荐方案：渐进式实现**

**Phase 1 (MVP)**: iframe + CDN 方案

- 使用 esm.sh 或 skypack.dev 直接在 iframe 中运行 React 代码
- 支持基础 React/Vue 组件预览
- 不需要额外后端资源

**Phase 2 (增强)**: WebContainer 方案

- 引入 @webcontainer/api
- 支持完整 npm install 和 dev server
- 实现类似 Bolt.new 的体验

**MVP 实现示例代码**

```typescript
// components/CodePreview.tsx
import { useEffect, useRef, useState } from 'react';

interface CodePreviewProps {
  files: { path: string; content: string }[];
  entryPoint: string;
}

export function CodePreview({ files, entryPoint }: CodePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!iframeRef.current) return;

    // 构建 HTML 内容
    const appCode = files.find(f => f.path === entryPoint)?.content || '';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <script type="importmap">
          {
            "imports": {
              "react": "https://esm.sh/react@18",
              "react-dom/client": "https://esm.sh/react-dom@18/client"
            }
          }
        </script>
      </head>
      <body>
        <div id="root"></div>
        <script type="module">
          ${transformToESM(appCode)}
          import { createRoot } from 'react-dom/client';
          const root = createRoot(document.getElementById('root'));
          root.render(React.createElement(App));
        </script>
      </body>
      </html>
    `;

    iframeRef.current.srcdoc = html;
  }, [files, entryPoint]);

  return (
    <div className="relative h-full w-full">
      <iframe
        ref={iframeRef}
        className="h-full w-full border-0"
        sandbox="allow-scripts allow-same-origin"
        title="Code Preview"
      />
      {error && (
        <div className="absolute bottom-0 left-0 right-0 bg-red-500 text-white p-2">
          {error}
        </div>
      )}
    </div>
  );
}
```

**验收标准**

- [ ] 生成的 React 代码可以在预览区实时运行
- [ ] 修改代码后预览自动刷新
- [ ] 支持查看控制台错误
- [ ] 提供全屏预览模式

---

#### F-003: 代码编辑器集成

**描述**
集成 Monaco Editor（VS Code 同款编辑器），支持语法高亮、智能提示、代码格式化。

**技术方案**

使用 `@monaco-editor/react` 包：

```typescript
import Editor from '@monaco-editor/react';

function CodeEditor({
  file,
  onChange
}: {
  file: ProjectFile;
  onChange: (content: string) => void;
}) {
  return (
    <Editor
      height="100%"
      language={getLanguage(file.path)}
      value={file.content}
      onChange={(value) => onChange(value || '')}
      theme="vs-dark"
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true,
      }}
    />
  );
}
```

**验收标准**

- [ ] 支持 TypeScript、JavaScript、JSON、CSS、HTML 语法高亮
- [ ] 代码修改后自动保存到状态
- [ ] 支持基础快捷键（保存、撤销、格式化）

---

#### F-004: 增强文件树视图

**描述**
可折叠、可搜索的文件树，清晰展示项目结构。

**UI 设计**

```
+------------------------+
| [搜索文件...]          |
+------------------------+
| v src/                 |
|   v components/        |
|     | Button.tsx       |
|     | Card.tsx         |
|   v pages/             |
|     | Home.tsx         |
|   | App.tsx            |
|   | main.tsx           |
| > public/              |
| | package.json         |
| | tsconfig.json        |
+------------------------+
| 8 个文件, 3 个文件夹    |
+------------------------+
```

**验收标准**

- [ ] 文件夹可折叠/展开
- [ ] 支持文件名搜索过滤
- [ ] 不同文件类型显示不同图标
- [ ] 点击文件在编辑器中打开

---

#### F-005: 虚拟终端输出

**描述**
显示构建和运行过程的日志输出。

**验收标准**

- [ ] 显示 npm install 输出
- [ ] 显示 dev server 启动日志
- [ ] 显示运行时错误
- [ ] 支持清空终端

---

#### F-006: 一键部署预览

**描述**
将生成的项目快速部署，生成可分享的预览链接。

**技术方案选择**

| 方案             | 实现方式             | 成本           |
| ---------------- | -------------------- | -------------- |
| Vercel 部署      | 使用 Vercel API      | 免费层有限     |
| GitHub Pages     | 推送到 gh-pages 分支 | 需 GitHub 集成 |
| Cloudflare Pages | 使用 CF API          | 免费层充足     |
| 自建             | 静态文件托管服务     | 需要维护       |

**推荐**：结合现有 GitHub 集成，使用 GitHub Pages 自动部署。

---

## 5. 非功能需求

### 5.1 性能要求

| 指标                   | 要求    |
| ---------------------- | ------- |
| 代码预览启动时间       | < 3 秒  |
| 编辑器加载时间         | < 2 秒  |
| WebSocket 消息延迟     | < 500ms |
| 大文件（>1MB）打开时间 | < 5 秒  |

### 5.2 兼容性要求

- 浏览器：Chrome 90+, Firefox 90+, Safari 15+, Edge 90+
- 屏幕尺寸：最小 1024x768
- 移动端：仅支持查看，不支持编辑

### 5.3 安全要求

- iframe 沙箱必须限制网络访问
- 生成的代码在隔离环境运行
- 用户代码不能访问主应用 Cookie/Storage

---

## 6. UI/UX 设计建议

### 6.1 新版布局设计

**当前布局**

```
+-------------+----------------------+-------------+
|   Agent     |       消息流          |    产出     |
|   状态      |                      |    预览     |
|  (左侧)     |       (中间)          |   (右侧)    |
+-------------+----------------------+-------------+
```

**建议新布局**

```
+-------------+------------------------------------------+
|   Agent     |               主工作区                   |
|   状态      +----------------------+-------------------+
|             |      代码编辑器      |     实时预览       |
|   进度      |                      |                   |
|   时间线    |   [文件树] [代码]    |   [应用预览]      |
|             |                      |                   |
|             +----------------------+-------------------+
|             |            终端/消息切换区               |
+-------------+------------------------------------------+
```

### 6.2 交互设计要点

1. **渐进式展示**：Agent 工作时显示消息流，代码生成后自动切换到编辑器+预览模式
2. **面板可调整**：支持拖拽调整各面板大小
3. **快捷键支持**：
   - `Ctrl+S`: 保存代码
   - `Ctrl+Shift+P`: 刷新预览
   - `Ctrl+B`: 切换文件树
4. **视觉反馈**：正在生成的文件用动画高亮

### 6.3 状态视觉设计

```
Agent 状态颜色：
- pending:   灰色 + 虚线边框
- running:   蓝色 + 呼吸动画 + 进度条
- completed: 绿色 + 勾选图标
- error:     红色 + 感叹号图标
```

---

## 7. 技术方案

### 7.1 前端技术栈增强

```json
{
  "dependencies": {
    "@monaco-editor/react": "^4.6.0",
    "@webcontainer/api": "^1.1.0",
    "xterm": "^5.3.0",
    "@xterm/xterm": "^5.3.0"
  }
}
```

### 7.2 组件结构

```
frontend/components/ai-coding/
├── DevWorkspace/                 # 开发工作区
│   ├── DevWorkspace.tsx          # 主容器
│   ├── CodeEditor.tsx            # Monaco 编辑器封装
│   ├── FileExplorer.tsx          # 文件树
│   ├── PreviewPane.tsx           # 预览面板
│   ├── Terminal.tsx              # 终端输出
│   └── index.ts
├── AgentThinking/                # AI 思考过程
│   ├── ThinkingPanel.tsx         # 思考过程面板
│   ├── ThinkingStep.tsx          # 单步展示
│   └── index.ts
├── existing components...
```

### 7.3 后端增强

需要在 `ai-coding.service.ts` 中增强消息推送：

```typescript
// 新增 THINKING 消息类型的详细结构
interface ThinkingMessage {
  messageType: 'THINKING';
  content: {
    step: string;           // 当前步骤
    thought: string;        // 思考内容
    keyPoints?: string[];   // 关键点
    progress?: number;      // 子进度 0-100
    reasoning?: string;     // 推理过程（可选）
  };
}

// 在每个 Agent 执行时发送详细的思考过程
private async sendThinkingUpdate(
  projectId: string,
  role: CodingAgentRole,
  step: string,
  thought: string,
  progress?: number
): Promise<void> {
  await this.sendAgentMessage(
    projectId,
    role,
    JSON.stringify({ step, thought, progress }),
    CodingMessageType.THINKING
  );
}
```

### 7.4 WebSocket 事件增强

新增事件类型：

| 事件             | 数据结构                      | 用途         |
| ---------------- | ----------------------------- | ------------ |
| `agent:thinking` | `{ step, thought, progress }` | AI 思考过程  |
| `file:created`   | `{ path, language, size }`    | 文件创建通知 |
| `file:updated`   | `{ path, diff }`              | 文件更新通知 |
| `preview:ready`  | `{ url }`                     | 预览可用通知 |

---

## 8. 任务拆分

### Epic: AI Coding 开发过程可视化增强

#### Story 1: AI 思考过程可视化 (P0)

| ID    | 任务                            | 类型 | 预估 | 依赖  |
| ----- | ------------------------------- | ---- | ---- | ----- |
| T-1.1 | 设计 ThinkingMessage 数据结构   | 后端 | 0.5d | -     |
| T-1.2 | 修改 Agent 执行流程添加思考消息 | 后端 | 1d   | T-1.1 |
| T-1.3 | 实现 ThinkingPanel 组件         | 前端 | 1d   | T-1.1 |
| T-1.4 | 集成到 new/page.tsx             | 前端 | 0.5d | T-1.3 |
| T-1.5 | 添加打字机效果动画              | 前端 | 0.5d | T-1.4 |

#### Story 2: 实时代码预览 MVP (P0)

| ID    | 任务                         | 类型 | 预估 | 依赖  |
| ----- | ---------------------------- | ---- | ---- | ----- |
| T-2.1 | 实现 ESM 代码转换函数        | 前端 | 1d   | -     |
| T-2.2 | 实现 PreviewPane iframe 方案 | 前端 | 1.5d | T-2.1 |
| T-2.3 | 添加错误边界和控制台输出     | 前端 | 0.5d | T-2.2 |
| T-2.4 | 实现刷新和全屏功能           | 前端 | 0.5d | T-2.2 |
| T-2.5 | 集成到项目详情页             | 前端 | 0.5d | T-2.4 |

#### Story 3: 代码编辑器集成 (P1)

| ID    | 任务               | 类型 | 预估 | 依赖  |
| ----- | ------------------ | ---- | ---- | ----- |
| T-3.1 | 集成 Monaco Editor | 前端 | 0.5d | -     |
| T-3.2 | 实现多文件切换     | 前端 | 0.5d | T-3.1 |
| T-3.3 | 实现代码保存逻辑   | 前端 | 0.5d | T-3.2 |
| T-3.4 | 添加快捷键支持     | 前端 | 0.5d | T-3.3 |

#### Story 4: 增强文件树 (P1)

| ID    | 任务                   | 类型 | 预估 | 依赖  |
| ----- | ---------------------- | ---- | ---- | ----- |
| T-4.1 | 实现 FileExplorer 组件 | 前端 | 1d   | -     |
| T-4.2 | 添加搜索功能           | 前端 | 0.5d | T-4.1 |
| T-4.3 | 添加文件类型图标       | 前端 | 0.5d | T-4.1 |

#### Story 5: WebContainer 集成 (P2)

| ID    | 任务                     | 类型 | 预估 | 依赖  |
| ----- | ------------------------ | ---- | ---- | ----- |
| T-5.1 | 研究 WebContainer API    | 研究 | 1d   | -     |
| T-5.2 | 实现 WebContainer 初始化 | 前端 | 1d   | T-5.1 |
| T-5.3 | 实现 npm install 功能    | 前端 | 1d   | T-5.2 |
| T-5.4 | 实现 dev server 启动     | 前端 | 1d   | T-5.3 |
| T-5.5 | 添加终端输出组件         | 前端 | 1d   | T-5.4 |

---

## 9. 排期计划

### 里程碑

| 里程碑      | 预计日期 | 内容                   |
| ----------- | -------- | ---------------------- |
| M1 - MVP    | Week 1   | Story 1 + Story 2 完成 |
| M2 - 编辑器 | Week 2   | Story 3 + Story 4 完成 |
| M3 - 增强版 | Week 3-4 | Story 5 完成           |

### 开发顺序建议

```
Week 1:
  Day 1-2: T-1.1 ~ T-1.5 (AI 思考过程)
  Day 3-5: T-2.1 ~ T-2.5 (实时预览 MVP)

Week 2:
  Day 1-2: T-3.1 ~ T-3.4 (Monaco Editor)
  Day 3-4: T-4.1 ~ T-4.3 (文件树)
  Day 5: 集成测试和 Bug 修复

Week 3-4:
  T-5.1 ~ T-5.5 (WebContainer 增强)
```

---

## 10. 风险与依赖

### 10.1 风险

| 风险                    | 影响 | 概率 | 缓解措施                     |
| ----------------------- | ---- | ---- | ---------------------------- |
| WebContainer 兼容性问题 | 高   | 中   | 提供降级方案（iframe + CDN） |
| iframe 安全限制         | 中   | 中   | 充分测试 sandbox 配置        |
| Monaco Editor 包大小    | 中   | 低   | 使用动态导入和代码分割       |
| 复杂项目预览失败        | 中   | 中   | 明确支持范围，提供错误提示   |

### 10.2 依赖

| 依赖项                  | 状态   | 影响                       |
| ----------------------- | ------ | -------------------------- |
| 后端 WebSocket 事件增强 | 需开发 | 思考过程可视化依赖         |
| AI 模型输出格式调整     | 需开发 | 需要输出更详细的思考过程   |
| 代码生成格式标准化      | 已完成 | 确保生成的代码可在沙箱运行 |

---

## 11. 附录

### A. 参考资料

- [Bolt.new GitHub 仓库](https://github.com/stackblitz/bolt.new)
- [WebContainer API 文档](https://webcontainers.io/api)
- [Monaco Editor React](https://github.com/suren-atoyan/monaco-react)
- [Sandpack by CodeSandbox](https://sandpack.codesandbox.io/)

### B. 变更记录

| 版本 | 日期       | 变更内容 | 作者     |
| ---- | ---------- | -------- | -------- |
| 1.0  | 2025-12-22 | 初始版本 | PM Agent |

---

## 12. 审批

| 角色       | 姓名 | 日期 | 状态   |
| ---------- | ---- | ---- | ------ |
| 产品负责人 | -    | -    | 待审批 |
| 技术负责人 | -    | -    | 待审批 |
| 设计负责人 | -    | -    | 待审批 |

---

**文档结束**
