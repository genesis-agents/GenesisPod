# AI 开发团队自动化编排系统

24小时自动运行的完整 AI 开发团队，由 Leader Agent 监督和协调 8 个专业 Worker Agent。

---

## 完整团队架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Leader Agent (编排器)                              │
│                                                                          │
│  • 24小时持续运行                • 任务队列管理                          │
│  • 工作流编排                    • 智能调度                              │
│  • 故障恢复                      • 进度监控                              │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│    PM Agent     │   │   Architect     │   │  Coder Agent    │
│    产品经理     │   │    架构师       │   │    开发者       │
│    (Opus)       │   │    (Opus)       │   │   (Sonnet)      │
├─────────────────┤   ├─────────────────┤   ├─────────────────┤
│ • 需求分析      │   │ • 架构设计      │   │ • 功能实现      │
│ • 任务拆分      │   │ • 技术选型      │   │ • Bug修复       │
│ • PRD编写       │   │ • 规范制定      │   │ • 代码重构      │
│ • 优先级排序    │   │ • 性能优化      │   │ • 技术调研      │
│ • 进度跟踪      │   │ • 安全架构      │   │ • 并行开发 x3   │
└─────────────────┘   └─────────────────┘   └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│ Reviewer Agent  │   │  Tester Agent   │   │   运维 Agents   │
│   代码审查      │   │    测试员       │   │                 │
│   (Sonnet)      │   │   (Sonnet)      │   │   (Sonnet)      │
├─────────────────┤   ├─────────────────┤   ├─────────────────┤
│ • 代码审查      │   │ • 测试设计      │   │ • monitoring    │
│ • 安全审计      │   │ • 测试执行      │   │ • merge-to-main │
│ • 规范检查      │   │ • 缺陷报告      │   │ • docs-specialist│
│ • 质量把关      │   │ • 性能测试      │   │                 │
└─────────────────┘   └─────────────────┘   └─────────────────┘
```

---

## 团队成员介绍

### 1. PM Agent (产品经理)

**模型**: Opus | **并发**: 1

**职责**:

- 分析业务需求，转化为技术需求
- 编写 PRD (产品需求文档)
- 将大需求拆分为可执行的小任务
- 确定任务优先级
- 跟踪项目进度

**配置文件**: `.claude/agents/pm.md`

---

### 2. Architect Agent (架构师)

**模型**: Opus | **并发**: 1

**职责**:

- 设计系统架构和模块划分
- 技术选型和方案评估
- 制定编码规范和最佳实践
- 性能优化设计
- 安全架构审查
- 编写 ADR (架构决策记录)

**配置文件**: `.claude/agents/architect.md`

---

### 3. Coder Agent (开发者)

**模型**: Sonnet | **并发**: 3 (可并行)

**职责**:

- 根据需求实现功能代码
- 修复 Bug
- 代码重构和优化
- 技术调研和 POC

**配置文件**: `.claude/agents/coder.md`

---

### 4. Reviewer Agent (代码审查)

**模型**: Sonnet | **并发**: 2

**职责**:

- 审查代码质量和可读性
- 安全漏洞检查
- 编码规范检查
- 运行自动化测试验证
- 提供改进建议

**配置文件**: `.claude/agents/reviewer.md`

---

### 5. Tester Agent (测试员)

**模型**: Sonnet | **并发**: 2

**职责**:

- 设计测试用例
- 执行自动化测试
- 编写缺陷报告
- 回归测试
- 性能测试

**配置文件**: `.claude/agents/tester.md`

---

### 6. Monitoring Agent (监控专家)

**模型**: Sonnet | **并发**: 1

**职责**:

- 系统健康检查
- 告警分析
- 性能指标监控
- 生成监控报告

**配置文件**: `.claude/agents/monitoring.md`

---

### 7. Merge-to-Main Agent (发布管理)

**模型**: Sonnet | **并发**: 1

**职责**:

- 代码合并前验证
- 执行安全的 merge 操作
- 监控 CI/CD 状态
- 失败时自动回滚

**配置文件**: `.claude/agents/merge-to-main.md`

---

### 8. Docs-Specialist Agent (文档专家)

**模型**: Sonnet | **并发**: 1

**职责**:

- 分析文档完整性
- 编写技术文档
- 更新过时文档
- 文档质量检查

**配置文件**: `.claude/agents/docs-specialist.md`

---

## 工作流

### 功能开发流程

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│   PM    │───▶│Architect│───▶│   PM    │───▶│  Coder  │
│需求分析 │    │技术方案 │    │任务拆分 │    │代码实现 │
└─────────┘    └─────────┘    └─────────┘    └────┬────┘
                                                  │
┌─────────┐    ┌─────────┐    ┌─────────┐         │
│  Merge  │◀───│ Tester  │◀───│Reviewer │◀────────┘
│合并发布 │    │测试验证 │    │代码审查 │
└─────────┘    └─────────┘    └─────────┘
```

### Bug修复流程

```
Coder修复 → Reviewer审查 → Tester回归 → Merge发布
```

### 文档更新流程

```
Docs编写 → Reviewer审查
```

---

## 快速开始

### 1. 安装依赖

```bash
# 安装 Claude Code CLI
npm install -g @anthropic-ai/claude-code

# 安装 PM2
npm install -g pm2

# 安装项目依赖
npm install js-yaml
npm install -D ts-node typescript @types/node @types/js-yaml
```

### 2. 启动系统

```bash
# 后台运行 (推荐)
pm2 start ecosystem.config.js --only leader-agent

# 或前台运行 (调试)
npx ts-node scripts/orchestrator/leader-agent.ts
```

### 3. 添加任务

```bash
# 启动完整功能开发流程
npx ts-node scripts/orchestrator/add-task.ts \
  --type requirement \
  --priority high \
  --title "实现用户认证功能" \
  --workflow feature_development

# 添加 Bug 修复任务
npx ts-node scripts/orchestrator/add-task.ts \
  --type bugfix \
  --priority high \
  --title "修复登录页面错误" \
  --workflow bugfix

# 添加单独任务
npx ts-node scripts/orchestrator/add-task.ts \
  --type monitoring \
  --priority medium \
  --title "系统健康检查"
```

### 4. 查看状态

```bash
npx ts-node scripts/orchestrator/status.ts
```

---

## 文件结构

```
.claude/
├── orchestrator/
│   ├── README.md           # 本文档
│   ├── config.yml          # 系统配置
│   ├── task-queue.json     # 任务队列
│   └── leader-state.json   # Leader 状态
│
├── agents/
│   ├── leader-agent.md     # Leader 编排器
│   ├── pm.md               # 产品经理
│   ├── architect.md        # 架构师
│   ├── coder.md            # 开发者
│   ├── reviewer.md         # 代码审查
│   ├── tester.md           # 测试专家
│   ├── monitoring.md       # 监控专家
│   ├── merge-to-main.md    # 发布管理
│   └── docs-specialist.md  # 文档专家
│
└── logs/
    ├── orchestrator-audit.jsonl  # 审计日志
    ├── leader-agent-out.log      # 输出日志
    └── leader-agent-error.log    # 错误日志

scripts/orchestrator/
├── leader-agent.ts    # 核心编排器
├── add-task.ts        # 添加任务
├── status.ts          # 状态查看
├── run-task.ts        # 直接运行任务
├── start.sh           # Linux/Mac 启动
└── start.bat          # Windows 启动

ecosystem.config.js    # PM2 配置
```

---

## 任务类型

| 类型             | Worker          | 说明     |
| ---------------- | --------------- | -------- |
| `requirement`    | pm              | 需求分析 |
| `task_breakdown` | pm              | 任务拆分 |
| `architecture`   | architect       | 架构设计 |
| `tech_selection` | architect       | 技术选型 |
| `coding`         | coder           | 代码编写 |
| `bugfix`         | coder           | Bug修复  |
| `refactor`       | coder           | 代码重构 |
| `review`         | reviewer        | 代码审查 |
| `security_audit` | reviewer        | 安全审计 |
| `testing`        | tester          | 测试执行 |
| `test_design`    | tester          | 测试设计 |
| `monitoring`     | monitoring      | 系统监控 |
| `merge`          | merge-to-main   | 代码合并 |
| `docs`           | docs-specialist | 文档工作 |

---

## 优先级

| 级别        | 权重 | 说明                |
| ----------- | ---- | ------------------- |
| 🔴 critical | 100  | 生产事故、安全漏洞  |
| 🟠 high     | 75   | 阻塞性Bug、重要功能 |
| 🟡 medium   | 50   | 常规开发、定时任务  |
| 🟢 low      | 25   | 技术债务、文档优化  |

---

## 定时任务

| 任务                | 时间         | 类型       | 说明         |
| ------------------- | ------------ | ---------- | ------------ |
| hourly-health-check | 每小时       | monitoring | 系统健康检查 |
| daily-code-quality  | 每天 2:00    | review     | 代码质量检查 |
| daily-report        | 每天 9:00    | monitoring | 日报生成     |
| weekly-docs-sync    | 每周一 10:00 | docs       | 文档同步检查 |

---

## 常用命令

### PM2 管理

```bash
pm2 start ecosystem.config.js      # 启动
pm2 stop leader-agent              # 停止
pm2 restart leader-agent           # 重启
pm2 logs leader-agent              # 日志
pm2 monit                          # 监控面板
```

### 任务管理

```bash
# 查看状态
npx ts-node scripts/orchestrator/status.ts

# 查看状态 (JSON)
npx ts-node scripts/orchestrator/status.ts --json

# 添加任务
npx ts-node scripts/orchestrator/add-task.ts --type xxx --priority xxx --title "xxx"

# 直接运行
npx ts-node scripts/orchestrator/run-task.ts --type monitoring --title "健康检查"
```

---

## 成本说明

| Agent      | 模型   | 成本          |
| ---------- | ------ | ------------- |
| PM         | Opus   | 高 (复杂推理) |
| Architect  | Opus   | 高 (复杂设计) |
| Coder      | Sonnet | 中            |
| Reviewer   | Sonnet | 中            |
| Tester     | Sonnet | 中            |
| Monitoring | Sonnet | 中            |
| Merge      | Sonnet | 中            |
| Docs       | Sonnet | 中            |

建议在 `config.yml` 中设置预算告警：

```yaml
limits:
  api_budget_warning: 100 # 美元
  api_budget_limit: 200 # 美元
```

---

## 故障排查

### Leader 无法启动

1. 检查 Claude CLI: `claude --version`
2. 检查 API 密钥: `echo $ANTHROPIC_API_KEY`
3. 检查配置文件: `cat .claude/orchestrator/config.yml`

### 任务一直 pending

1. 检查 Worker 是否启用
2. 检查任务依赖是否满足
3. 查看状态: `npx ts-node scripts/orchestrator/status.ts`

### 查看日志

```bash
# PM2 日志
pm2 logs leader-agent --lines 100

# 审计日志
tail -50 .claude/logs/orchestrator-audit.jsonl

# 错误日志
cat .claude/logs/leader-agent-error.log
```

---

## 扩展指南

### 添加新 Worker Agent

1. 创建 `.claude/agents/new-agent.md`
2. 在 `config.yml` 添加 worker 配置
3. 添加任务类型映射
4. 重启 Leader

### 添加新工作流

在 `config.yml` 中添加：

```yaml
workflows:
  new_workflow:
    name: "新工作流"
    steps:
      - type: xxx
        name: "步骤1"
      - type: yyy
        depends_on: [xxx]
```

---

## 更新日志

### v2.0.0 (2025-12-15)

- 新增 PM Agent (产品经理)
- 新增 Architect Agent (架构师)
- 新增 Coder Agent (开发者)
- 新增 Reviewer Agent (代码审查)
- 新增 Tester Agent (测试员)
- 新增工作流支持
- 支持任务依赖
- 支持并行编码

### v1.0.0 (2025-12-15)

- 初始版本
- 支持 monitoring, merge, docs 任务
