---
title: AI Strategic Simulation
owner: product
status: draft
last_updated: 2025-12-06
---

## Purpose

Design an AI strategic simulation（推演）能力，支持多智能体对抗与裁判判定，融合人类干预、外部真实数据、报告复盘。菜单建议：侧栏新增入口「AI 推演 / AI Wargame」，文件命名保持中性。

## Scope (MVP)

- 行业模板：首发 **AI 算力基础设施**（GPU/芯片/IDC/云算力服务/供应链）。支持 3–5 家公司，蓝/红/绿队角色各 2–3 个，Chaos 可选。
- 数据：**杜绝 Mock，全部真实数据**。所有外部 API 必须在 **Settings -> External API** 配置后使用（密钥、端点、配额），不允许硬编码或临时假数据。
- 核心能力：场景/公司/Agent/推演运行 CRUD；盲注+CoT 回合；裁判判定（RAG+证据）；Timeline+状态面板；报告公开/内部版切换；人类干预（暂停/插话/改约束/重置）。

## Architecture (3-Layer)

1. 环境/裁判（Arbiter）：维护世界状态，引用真实数据（RAG）判定可行性，可驳回动作；黑天鹅/随机因子；写状态差分与证据链。
2. Agent 群：蓝/红/绿 + Chaos；Persona 含偏见/压力源/时间偏好/风险&合规度；公共/公开/私有记忆；工具与配额/冷却/成本。
3. Human-in-loop：节奏建议 2 回合 AI → 人类干预 → 2 回合 AI；显式干预入口（暂停、插话、改约束、重置）。

## Data & External APIs (真实数据约束)

- 配置入口：Settings -> External API，集中管理 Key/Endpoint/配额/开关；服务端读取配置，不得写死或 Mock。
- 需要的真实数据源（AI 算力基础设施场景示例）：
  - 市场/价格：GPU/芯片/云算力价格、供需、交付周期。
  - 公司公开信息：财报、公告、投融资、新闻、专利/备案。
  - 宏观/监管：政策/出口管制/能耗/合规指标。
  - 舆情：行业新闻、媒体情绪。
- 数据使用策略：请求日志/限流/重试/缓存（真实缓存，非假数据）；每次判定记录证据引用与时间戳；无数据则标注“依据不足”而非伪造。

## Process (5-Step Loop)

1. Persona Engineering：强制 persona（角色、性格/偏见、压力源、时间偏好、风险&合规度）；“非合作”提示防 Echo。
2. State Initialization：量化（现金/份额/价格带/产能/库存/负债/KPI/约束），来源标记：手工 / 外部真实 API（RAG）/ 内部知识库。
3. Asynchronous Action Turn：CoT 强制（内心独白→公开行动），盲注同时提交；参数：回合数、随机温度/非理性、黑天鹅概率。
4. Adjudication：裁判检索真实数据，验证可行性（资金/时间/约束/合规），可驳回；写状态差分（资源/KPI/风险/舆情/监管态度/时间线）、证据链；黑天鹅/干扰事件可触发。
5. Debriefing：抽取内心独白日志，生成因果链/偏见/盲点/反事实；报告公开/内部双版。

## Industry Deep-Dive (AI 算力基础设施)

- Company 要素：类型（标杆/初创/区域）、市场/地区、现金/产能/库存/交付、价格带、合同/订单、供应链风险、能耗/合规阈值、护城河（专利/渠道/品牌）、舆情。
- 角色：CEO/COO/销售/采购/法务/公关；绿军（监管/媒体/客户），Chaos（市场恐慌/供应突发）。
- 事件库：供应链中断、关税/出口管制、客户大单/解约、竞品降价、媒体曝光、能耗/合规检查。

## UI/UX (与现有风格匹配)

- 视觉：浅色背景、圆角卡片、灰度分隔、渐变强调色（紫/蓝）；线性图标；可见性用标签/锁图标，泄露用提示条。
- 布局：Dashboard（卡片+表格）；场景配置（左右分区）；Run 控制台（上控件+左 Timeline/右状态面板+底部干预）；报告分节卡片；响应式沿用现有侧栏宽度与组件。
- 组件复用：按钮/表单/Tag/Segmented/Popover/Drawer/表格/图表用现有库；Timeline 复用消息气泡样式加色标与状态差分；工具日志折叠列表。
- 可视化：公司棋盘（卡片网格，显示份额/现金/库存/价格/护城河）；市场格局/热力；风险雷达、舆情/监管态度曲线；事件流显示证据与可见性。

## Wireframe Outline

- Dashboard：标题、副文案、主 CTA“新建推演”；场景/运行卡片；行业模板入口。
- 场景配置：基础信息；量化表格（支持“从外部数据填充”按钮）；Agent 选配（蓝/红/绿/裁判/Chaos，AI 生成+手工+模板）；规则卡（禁做/冷却/成本、黑天鹅、合规、随机/非理性滑杆）。
- Run 控制台：顶部控制（开始/暂停/盲注/快进+参数）；左 Timeline（内心独白、公开行动、裁判判定、状态差分、证据、可见性）；右状态与指标（市场格局、份额/价格/库存曲线、风险雷达、舆情/监管态度、工具日志）；底部干预输入+事件提示。
- Insights & Report：公开/内部版切换；关键节点列表；团队/公司对比；盲点/反事实卡片；导出 PDF/Markdown/JSON。
- External API 设置：Settings -> External API 页面配置各数据源（名称、描述、endpoint、headers、auth、配额、启用开关），服务端读取使用。

## API/Model Draft (方向性)

- Scenario：industry, region, horizon, goals/KPI, constraints, data_sources_config_ids[]
- Company：type, market, metrics{cash, share, price_band, capacity, inventory, arpu, margin, debt}, moat, risk_thresholds, sentiment_refs
- Agent：company_id, team, persona{role, traits, biases, pressure, time_pref, risk, compliance}, memory{public_refs, company_public, private}, tools{allowed, quotas, cooldowns, cost_model}, behavior_style, visibility_rules
- Run：params{rounds, blind, cot, random_temp, chaos, black_swan_prob, compliance_thresholds}, company_ids[], status
- Turn：submissions[{agent_id, inner_monologue, public_action, tools_used, evidence_refs, visibility, private_memory_refs}], adjudication{ruling, state_delta, scores, black_swan_events}, world_state_snapshot
- Report：version(public/internal), key_nodes, blindspots, counterfactuals, evidence_refs, exports
- ExternalAPIConfig：id, name, provider, base_url, auth{key,id,secret}, headers, rate_limit, enabled

## Milestones

1. 线框+数据契约：低保真线框、接口/模型草案、行业模板与真实数据源清单；External API 配置界面。
2. CRUD 基座：Scenario/Company/Agent/Run/Report CRUD，AI 生成/模板导入，记忆可见性；External API 配置生效（后端读取）。
3. 执行 Beta：盲注+CoT 流程，裁判判定（真实数据检索+证据链，占位规则），Timeline+状态面板实时更新（SSE）。
4. Insights/Report：关键节点、因果/偏见/盲点/反事实，公开/内部版导出。
5. 行业增强（AI 算力）：公司棋盘、市场格局图、情报泄露提示、事件库扩充。
6. 性能与安全：日志/审计、内容审查、外部 API 限流与缓存、秘钥安全存储。

## Non-Mock Assurance

- 不允许使用伪数据/假接口；无数据时返回“依据不足”提示。
- 所有外部数据调用必须通过 Settings -> External API 配置，读取真实 Key/Endpoint；请求需记录来源和时间戳。
- 任何缓存均为真实数据缓存，禁止生成或注入虚假内容。
