---
title: AI Strategic Simulation
owner: product
status: draft
last_updated: 2025-12-06
---

## Purpose

Design an AI strategic simulation（推演）能力：支持多智能体对抗与裁判判定，融合人类干预、外部数据、报告复盘。菜单建议：侧栏新增入口「AI 推演 / AI Wargame」但文件命名保持中性。

## Value & Use Cases

- 市场进入/价格战/危机管理/合规冲突/舆情应对。
- 输出可决策的复盘：关键节点、红旗风险、机会窗口、反事实建议。

## 3-Layer Architecture

1. **Environment / Arbiter（裁判）**
   - 维护世界状态，判定行动后果，可驳回不合理动作。
   - 强制 RAG：行情/新闻/法规/内部知识。
   - 状态字段：资源、KPI、风险、舆情/立场、时间线、事件队列、证据链。
   - 黑天鹅/随机因子：可配置概率与事件库。
2. **Agent Swarm（蓝/红/绿 + Chaos）**
   - 蓝军：己方多角色。
   - 红军：对手角色库（激进CEO、保守董事、非理性散户群等），可多选组合。
   - 绿军：第三方（监管/媒体/消费者/供应链伙伴）。
   - Chaos Agent：注入非理性/情绪化/恐慌决策或随机温度。
   - Agent 配置：team、persona（动机/偏见/压力源/时间偏好/风险&合规度）、私有/共享记忆、工具权限、行为风格（aggressive/defensive/erratic/media/regulator）。
3. **Human-in-the-loop**
   - 节奏建议：AI 2 回合 → 人类干预 → 再 2 回合。
   - 控制台：暂停/快进/插话/改约束/调整 Agent 参数或工具配额。

## Memory & Tools

- **共享记忆**：公共新闻/行情/政策/内部公告，回合同步。
- **私有记忆**：仅特定 Agent 可见，可设泄露/侦察触发。
- 工具：搜索、计算/表格、代码沙盒、数据 API（行情/新闻/财务/法规），配置配额/冷却/成本，调用计入日志与状态。

## 5-Step Wargaming Loop（产品化约束）

1. **Persona Engineering**
   - 强制填写：角色 + 性格/偏见/压力源/时间偏好/风险与合规倾向。
   - 防 Echo：System prompt 明确“利益冲突，非合作，最大化自身效用可损害对方”。
2. **State Initialization**
   - 量化：现金/预算、市场份额%、价格区间、库存/产能、负债、合规阈值、KPI、约束/禁做/冷却。
   - 数据源标签：手工 / 外部(RAG) / 内部。未填关键数值时提示。
3. **Asynchronous Action Turn**
   - 强制 CoT：先内心独白（可含私有记忆），再公开行动。
   - 盲注：蓝/红同时提交，收齐后统一揭示。
   - 可调：回合数、时限、非理性/随机温度、黑天鹅概率。
4. **Adjudication（裁判判定）**
   - 校验可行性（资金/时间/约束/合规），引用证据；缺证据标“依据不足”；可驳回动作。
   - 更新世界状态：资源/KPI/风险/舆情/时间线；记录事件/证据链。
   - 触发黑天鹅/干扰事件（合作过度时可放大利益冲突）。
5. **Debriefing & Attribution**
   - 抽取内心独白日志，生成因果链：触发因素、偏见/压力源、私有/共享记忆、工具证据。
   - 盲点提示：信息缺口、私有记忆优势、策略偏差。
   - 反事实卡片：若 X→Y 的状态差分。
   - 报告双版：公开版（隐私/私有记忆可隐藏）、内部版（全量）。

## UI/UX Key Screens（文字稿）

- **Dashboard**：场景卡 + 运行记录 + 模板入口；主 CTA “新建推演”。
- **场景配置**
  - Agents 选配：Team Tabs（蓝/红/绿/裁判），红军/绿军库多选；Agent 卡配置 persona/偏见/记忆/工具。
  - 角色生成方式：提供“AI 生成”按钮（基于场景目标快速生成 persona/偏见/压力源/工具建议），也支持手工输入与编辑；可一键应用红/绿军模板。
  - 状态初始化：量化表格 + 宏观/约束/KPI；“从数据源填充”。
  - 规则：禁做/冷却/成本、黑天鹅事件库、合规阈值。
- **Run 控制台**
  - 顶部：开始/暂停/盲注开关/快进；参数（回合数、非理性/温度、黑天鹅概率、合规阈值）。
  - Timeline：内心独白（私有可标隐）、公开行动、裁判判定 + 状态差分 + 证据引用；Team 色标。
  - 侧栏：World State、黑天鹅事件、工具调用日志、干预输入（插话/改约束/注入事实）。
- **Insights / Report**
  - 关键节点列表（回合、Agent、内心摘要、行动、判定、证据、状态差分）。
  - 团队对比：蓝/红/绿立场/行动分歧，得分趋势、风险雷达、舆情/合规曲线。
  - 盲点 & 反事实卡片；导出 PDF/Markdown/JSON。

## Pitfalls & Guards

- 没有裁判/状态更新 → 必设 Arbiter，写状态并可驳回。
- 无证据判定 → 强制 RAG + 证据链；缺证据需标注。
- 无私有记忆/情报 → 支持私有记忆与泄露/侦察；报告分公开/内部版。
- 忽视绿军/监管/舆情 → 绿军必选，舆情/合规阈值可配。
- Echo Chamber → 非合作系统提示 + 冲突 KPI + 合作惩罚/干扰事件。
- 过度理性 → Chaos Agent/随机温度/黑天鹅。
- 人类缺席 → 建议节奏 2 回合 AI + 人类介入 + 2 回合 AI，控制台显式干预入口。
- 状态无审计 → 记录“意图-行动-判定-状态差分-证据”。
- 报告只看输赢 → 必含因果/盲点/反事实。

## Industry Simulation Deep-Dive（多企业行业推演）

目标：在指定行业内，对多家企业（标杆/巨头、初创/区域玩家等）进行情景推演；支持联网获取最新信息初始化档案，人类可调整参数/决策；公开/非公开信息清晰可视；过程可视化强化。

### 关键对象

- Company：类型（标杆/初创/区域）、市场/地区、财务与资源（现金、产能、渠道、用户、ARPU、毛利、负债）、护城河（专利/品牌/分销）、风险/合规阈值、舆情与新闻引用。
- Company-Agent：每家公司可有多角色（CEO/CFO/运营/公关/法务/渠道），仍归属蓝/红/绿；Chaos Agent 作为市场/舆情扰动。
- Memory：公共（新闻/财报/宏观/监管）、公司公开（财报/公告）、公司私有（资金链、供应、隐秘计划），支持泄露/侦察规则。
- Scenario：行业主题、时间跨度、区域、关键约束（监管/供应链）、成功指标（份额/利润/合规/口碑）。
- Data Sources (RAG)：Web 新闻/政策/财报/行情，自有知识库（市场研究/专利/招股书），标注来源与时间戳。

### 行业流程

1. 联网建档：输入行业/公司列表 → RAG 抓取公开数据 → 生成公司卡（公开信息）。
2. 私有补充：为特定公司填写私有情报，设可见性（公开/半公开/私有）与泄露规则。
3. 参数校准：人类审核/调整财务、份额、价格带、产能/渠道、护城河、合规阈值；设定红/绿军偏见与工具权限。
4. 推演回合：盲注+CoT，多公司动作提交；裁判检索最新数据验证可行性，更新世界状态（份额、价格、库存、舆情、监管态度）。
5. 干预与可视化：人类插话/改约束/插入事件；实时可视化刷新市场格局、风险雷达、舆情、监管态度、资源曲线。
6. 复盘归因：按公司/角色出因果链、偏见影响、盲点、反事实；生成公开版/内部版报告。

### 可视化要求

- 公司棋盘：多公司卡片（类型/份额/现金/库存/价格/护城河指标），颜色标 Team。
- 时间线+事件流：意图→行动→判定→状态差分，标注证据、来源、可见性（公开/私有）。
- 市场格局：份额/价格带分布、区域热力图，随回合刷新。
- 风险/舆情/监管板：风险雷达、舆情情绪曲线、监管立场指示灯。
- 记忆侧栏：公共 vs 私有记忆列表，清晰可见性标识；私有记忆仅所属公司/角色可见，泄露事件会提示。
- 工具日志：搜索/数据API/代码调用，记录成本/配额/证据链接。

### 人类可控点

- 选择公司与角色模板；上传/编辑私有情报；调节财务/份额/价格/产能等量化参数；开关 Chaos/随机温度/黑天鹅概率；设置合规/禁做/冷却；中途插话或重置回合。

### 公开/非公开体验

- 信息项带可见性标签：公开 / 公司私有 / 角色私有 / 条件解锁。
- Timeline 与报告提供“公开版/内部版”切换：公开版隐藏私有项，内部版全量。
- 泄露/情报事件将私有项转为半公开并通知。

## Technical Hints (future work)

- 数据模型：Scenario / Agent / Run / Turn / Adjudication / Report with visibility flags (public/private) & evidence refs。
- 执行通道：SSE/队列驱动回合；裁判前置检索；工具调用计费/配额。
- 安全：外部数据与生成内容审计；敏感操作需人类确认。

## Next Steps

- 确认菜单命名与首批模板场景。
- 输出低保真线框 + API 契约 + 任务拆分与里程碑。

## UI/UX Wireframe Notes (fit existing style)

- 视觉延续：沿用项目浅色背景、圆角卡片、灰度分隔线、渐变强调色（紫/蓝），避免突兀；图标线性简洁。
- 布局节奏：Dashboard（卡片+表格）、场景配置（左右分区或分段卡片）、Run 控制台（上控件+左右主区+底部干预）、报告分节卡片；字号/间距遵循现有体系。
- 组件复用：按钮/表单/Tag/Segmented/Popover/Drawer/表格/图表用现有组件库；Timeline 用现有消息/气泡样式加色标与状态差分；工具日志用折叠列表。
- 可视化规范：市场棋盘用卡片网格+小型条/热力；风险雷达/情绪曲线柔和配色；可见性用标签/锁图标而非强警示色；泄露事件用提示条。
- 响应式：侧栏宽度与现有一致，主区自适应；移动端关键操作折叠为悬浮/底部栏，与现有交互一致。

## Low-Fidelity Wireframe Outline

- Dashboard：标题+副文案+主CTA“新建推演”；场景/运行卡片；行业模板快捷入口
- 场景配置：基础信息/状态初始化（量化表格+联网填充）；Agent 选配（蓝/红/绿/裁判/Chaos，AI 生成/模板/手工）；规则卡（禁做/冷却/成本、黑天鹅、合规、随机/非理性滑杆）
- Run 控制台：顶部控制（开始/暂停/盲注/快进+参数）；左 Timeline（内心独白、公开行动、裁判判定、状态差分、证据、可见性）；右状态与指标（市场格局、份额/价格/库存曲线、风险雷达、舆情/监管态度、工具日志）；底部干预输入+事件提示
- Insights & Report：公开/内部版切换；关键节点列表；团队/公司对比；盲点/反事实卡片；导出 PDF/Markdown/JSON

## API/Model Draft (方向性)

- Scenario：industry, region, horizon, goals/KPI, constraints, data_sources
- Company：type, market, metrics{cash, share, price_band, capacity, inventory, arpu, margin, debt}, moat, risk_thresholds, sentiment_refs
- Agent：company_id, team, persona{role, traits, biases, pressure, time_pref, risk, compliance}, memory{public_refs, company_public, private}, tools{allowed, quotas, cooldowns, cost_model}, behavior_style, visibility_rules
- Run：params{rounds, blind, cot, random_temp, chaos, black_swan_prob, compliance_thresholds}, company_ids[], status
- Turn：submissions[{agent_id, inner_monologue, public_action, tools_used, evidence_refs, visibility, private_memory_refs}], adjudication{ruling, state_delta, scores, black_swan_events}, world_state_snapshot
- Report：version(public/internal), key_nodes, blindspots, counterfactuals, evidence_refs, exports

## Milestones (建议)

1. 线框+数据契约：低保真线框、接口/模型草案、行业模板与默认数据源清单
2. 场景/Agent/Run CRUD：AI 生成/模板导入、公开/私有记忆可见性
3. 推演执行 Beta：盲注+CoT、裁判 RAG 判定、黑天鹅/Chaos 参数，实时可视化（Timeline+状态面板）
4. Insights/Report：关键节点、因果/盲点/反事实、公开/内部版导出
5. 行业增强：公司棋盘、市场格局图、情报泄露提示，模板扩充
6. 性能与安全：日志/审计、内容审查、外部 API 限流与缓存

## UI/UX Wireframe Notes (fit existing style)

- fffff

## UI/UX Wireframe Notes (fit existing style)

- 
