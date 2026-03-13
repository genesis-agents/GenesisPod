# 事件洞察（Event Insights）设计方案

> Topic Insights 新增类型：基于新闻/线索深挖事件来龙去脉，通过现象发现本质

## 1. 场景定义

### 1.1 核心目标

**通过一个事件，梳理其来龙去脉，通过现象发现本质。**

用户看到一条新闻或线索（如"OpenAI 发布 GPT-5"、"英伟达收购 Run:ai"、"欧盟通过 AI 法案"），
希望以此为锚点，不仅了解事件本身，更要：

- **追溯根因**：这件事为什么会发生？什么结构性力量在推动？
- **还原全貌**：涉及哪些利益方？各方的真实动机是什么？
- **推演影响**：一阶影响（直接影响）→ 二阶影响（间接影响）→ 三阶影响（系统性变化）
- **洞察本质**：这个事件背后反映了什么更深层的趋势或矛盾？
- **预判走向**：接下来会怎样？什么变量决定走哪条路？

### 1.2 与现有类型的区别

|              | MACRO                                   | TECHNOLOGY                                | COMPANY                                 | **EVENT（新）**                                                |
| ------------ | --------------------------------------- | ----------------------------------------- | --------------------------------------- | -------------------------------------------------------------- |
| **输入**     | 主题名称                                | 技术名称                                  | 企业名称                                | 新闻 URL / 粘贴内容                                            |
| **研究起点** | 无锚点，广泛搜索                        | 技术为中心                                | 企业为中心                              | **锚定文章**为中心                                             |
| **核心方法** | 多维度扫描                              | 技术深度分析                              | 企业全景分析                            | **因果链推理**                                                 |
| **维度来源** | 预设模板 + Leader 规划                  | 预设模板 + Leader 规划                    | 预设模板 + Leader 规划                  | **从文章内容动态推导**                                         |
| **搜索策略** | 搜主题本身                              | 搜技术本身                                | 搜企业本身                              | **三层递进搜索**（事实→上下文→影响）                           |
| **证据层次** | 所有证据平等                            | 所有证据平等                              | 所有证据平等                            | 锚定文章 = 一级证据，证据分级                                  |
| **分析特色** | 全景覆盖                                | 技术纵深                                  | 竞争定位                                | **因果推理 + 利益博弈 + 情景推演**                             |
| **典型维度** | 政策/市场/竞争/技术/投资/人才/国际/应用 | 原理/前沿/玩家/专利/应用/商业化/挑战/路线 | 概况/产品/模式/财务/技术/市场/战略/SWOT | 事件核心/结构背景/触发时机/利益格局/连锁反应/历史对标/情景推演 |

### 1.3 典型用例

| 用例                                     | 用户期望的本质洞察                                               |
| ---------------------------------------- | ---------------------------------------------------------------- |
| 一条行业新闻（英伟达收购 Run:ai）        | 不只是收购本身，而是 AI 基础设施从"芯片战"进入"调度权之争"的信号 |
| 一个政策公告（欧盟 AI 法案落地）         | 不只是合规要求，而是全球 AI 治理从"自律"转向"强监管"的拐点       |
| 一条竞品动态（Claude 4 发布）            | 不只是产品更新，而是大模型竞争从"参数竞赛"转向"工程化能力"的转折 |
| 一条融资消息（某 AI 公司 10 亿美元融资） | 不只是金额，而是资本对 AI 产业链哪个环节的预判                   |
| 一起安全事件（大规模数据泄露）           | 不只是事件本身，而是暴露了什么系统性安全治理缺陷                 |

---

## 2. 核心分析方法论

> **定位**：所有竞品（OpenAI/Gemini/Perplexity Deep Research）都是"智能搜索聚合器"——搜得广、整理得好，但不会质疑、不会反驳、不会问"如果主流分析是错的呢？"。
>
> Event Insights 的目标不是做一个更好的搜索聚合器，而是做一个**会思考的分析师**——它有分析框架、会提出假设、会自我质疑、会告诉你"大多数人没看到的东西"。

### 2.1 竞品差距分析：为什么现有产品做不到"透过现象看本质"

| 能力           | OpenAI Deep Research         | Gemini Deep Research                 | Perplexity        | **Event Insights（目标）**         |
| -------------- | ---------------------------- | ------------------------------------ | ----------------- | ---------------------------------- |
| 信息搜集       | 强（多步搜索+回溯）          | 强（迭代搜索）                       | 强（并行搜索）    | 强（三层递进搜索）                 |
| 信息整理       | 中（长散文）                 | 中（长散文）                         | 强（结构化+引用） | 强（结构化维度）                   |
| **因果推理**   | 弱（偶尔出现）               | 弱                                   | 无                | **强（三层因果引擎）**             |
| **自我质疑**   | 无                           | 有（self-critique，仅查格式/清晰度） | 无                | **强（Red Team 对抗验证）**        |
| **反共识洞察** | 无                           | 无                                   | 无                | **有（共识 vs 反共识分离）**       |
| **分析框架**   | 无（对所有事件用同一种方式） | 无                                   | 无                | **有（按事件类型自动选框架）**     |
| **可证伪预测** | 无（"未来充满不确定性"）     | 无                                   | 无                | **有（条件-时间-结果三元组）**     |
| **盲点检测**   | 无                           | 无                                   | 无                | **有（主动识别分析未覆盖的视角）** |
| 持续追踪       | 无（一次性）                 | 无                                   | 无                | **有（V2 事件追踪+预测回溯）**     |

**一句话总结**：竞品做到了"帮你搜到所有信息"，我们要做到的是"告诉你大多数人没看到的东西"。

### 2.2 分析引擎：五层递进（Five-Layer Analytical Engine）

Event Insights 的核心差异是一个**五层递进分析引擎**，每一层都在竞品能力边界之上：

```
                    竞品能力边界
                    ─────────────────────────────────────
Layer 1  信息层      搜集事实、整理信息              ← 所有竞品都能做
Layer 2  因果层      远因-近因-导火索推理             ← 竞品偶尔做到，不系统
                    ═════════════════════════════════════
                    Event Insights 独有能力
                    ─────────────────────────────────────
Layer 3  框架层      选择分析框架，结构化看问题        ← 竞品完全没有
Layer 4  对抗层      Red Team 质疑 + 反共识检验        ← 竞品完全没有
Layer 5  预测层      可证伪情景 + 盲点检测             ← 竞品完全没有
```

以下详述每一层。

#### Layer 1: 信息层（Information Layer）—— 与竞品持平

搜集事实、核实信息、整理证据。详见第 5 章三层递进搜索策略。

这一层不是差异化点，但必须做好——它是上层分析的地基。

#### Layer 2: 因果层（Causal Layer）—— 超越竞品

Leader 在规划维度之前，必须完成**因果假设生成**：

```
锚定文章 ──→ Leader 因果推理 ──→ 生成因果假设链 ──→ 分配给各维度验证/证伪
```

**三层因果结构**：

| 层次                         | 问题                                        | 说明                                             | 示例（英伟达收购 Run:ai）                           |
| ---------------------------- | ------------------------------------------- | ------------------------------------------------ | --------------------------------------------------- |
| **远因**（Structural Cause） | 什么长期趋势/结构性矛盾导致这件事可能发生？ | 行业周期、技术演进、政策变迁、竞争格局的深层变化 | AI 算力从"有就行"进入"编排效率决定 ROI"阶段         |
| **近因**（Proximate Cause）  | 什么具体条件在近期成熟，使这件事变为可能？  | 技术条件、市场条件、资本条件、人事条件           | Run:ai 客户规模达到临界点 + CUDA 生态需要补齐调度层 |
| **导火索**（Trigger）        | 为什么是现在？什么触发了行动？              | 具体事件、时间窗口、竞争压力、监管窗口           | AMD ROCm 生态加速 + 欧盟反垄断审查窗口              |

**与竞品的区别**：OpenAI Deep Research 有时会提到原因，但它不区分远因/近因/导火索，也不把因果假设当作后续研究的"待验证命题"。我们的因果假设会注入到每个维度的研究中，让搜索变成"验证或推翻"而非"搜集相关内容"。

#### Layer 3: 框架层（Framework Layer）—— 竞品完全没有

**核心洞察**：所有竞品对所有事件用同一种分析方式。但一个收购事件和一个政策事件需要完全不同的分析框架——就像医生不会对所有病人用同一套检查方案。

**分析框架自动选择**（Analytical Framework Auto-Selection）：

Leader 根据事件类型，自动选择并应用对应的**专业分析框架**：

| 事件类型          | 自动加载的分析框架                                                                | 框架来源      | 增加的分析维度                                         |
| ----------------- | --------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------ |
| **收购/并购**     | 交易逻辑分析（战略互补性 + 估值合理性 + 整合风险）                                | 投行 M&A 框架 | "交易的真实逻辑是什么？买方买的到底是什么？"           |
| **政策/法规**     | 政策周期分析（议程设置→政策制定→执行→效果评估） + 合规级联（谁先受影响→传导路径） | 公共政策学    | "这个政策真正想解决什么问题？执行会打几折？"           |
| **产品发布**      | 颠覆理论（Christensen）+ 采用曲线（Rogers）+ 竞争回应矩阵                         | 战略管理      | "这是持续性创新还是颠覆性创新？在采用曲线的哪个阶段？" |
| **融资/IPO**      | 资本信号解读（估值逻辑 + 资金用途 + 投资人组合信号）                              | VC/PE 分析    | "这笔钱真正说明了什么？投资人在赌什么？"               |
| **安全事件/危机** | 瑞士奶酪模型（多层防御失效分析）+ 危机传播模型                                    | 风险管理      | "哪几层防线同时失效才导致了这个结果？"                 |
| **地缘/贸易**     | 约束分析（Stratfor 方法论）+ 博弈论（纳什均衡/囚徒困境）                          | 地缘政治学    | "各方的约束条件是什么？均衡点在哪？"                   |
| **人事变动**      | 组织政治分析 + 路线信号解读                                                       | 组织行为学    | "这次换人真正的权力信号是什么？"                       |
| **技术突破**      | 技术成熟度评估（Gartner Hype Cycle 定位）+ 技术-商业缺口分析                      | 技术战略      | "这个技术在 Hype Cycle 的哪个位置？离商业化还有多远？" |

**实现方式**：

- Leader 在因果推理阶段自动识别事件类型
- 根据事件类型从 `analytical-frameworks.config.ts` 加载对应框架
- 框架以结构化 prompt 段注入 Leader 和维度写作 prompt
- 框架中的分析问题替代或补充通用的 analyticalQuestion

```typescript
// 新增配置：analytical-frameworks.config.ts

interface AnalyticalFramework {
  id: string;
  name: string;
  /** 适用的事件类型 */
  applicableEventTypes: string[];
  /** 框架要求回答的核心问题 */
  coreQuestions: string[];
  /** 注入到 Leader prompt 的分析指导 */
  leaderGuidance: string;
  /** 注入到维度写作 prompt 的分析视角 */
  writingLens: string;
  /** 框架专属的搜索词模板 */
  searchTemplates: string[];
}

// 示例：收购/并购框架
const MA_FRAMEWORK: AnalyticalFramework = {
  id: "merger_acquisition",
  name: "交易逻辑分析框架",
  applicableEventTypes: ["acquisition", "merger"],
  coreQuestions: [
    "买方真正在买什么？是技术、人才、客户、还是消灭竞争对手？",
    "这笔交易的战略互补性在哪？1+1 能否 >2？",
    "估值是否合理？对标同类交易是偏高还是偏低？为什么？",
    "整合最大的风险是什么？历史上类似整合的成功率？",
    "如果这笔交易没发生，买方会怎样？卖方会怎样？（反事实推理）",
  ],
  leaderGuidance: `用 M&A 分析框架拆解这笔交易：
    1. 战略动机（Strategic Rationale）：买方真正的意图
    2. 协同效应（Synergies）：收入协同 vs 成本协同 vs 技术协同
    3. 估值逻辑（Valuation）：与同类交易对标
    4. 整合风险（Integration Risk）：文化、技术、人才保留
    5. 反事实分析（Counterfactual）：不收购会怎样`,
  writingLens: '每个分析论点必须回答"这对交易逻辑意味着什么"',
  searchTemplates: [
    "{acquirer} acquisition strategy history",
    "{target} valuation comparable deals",
    "{industry} M&A integration success rate",
    "{acquirer} {target} antitrust risk",
  ],
};
```

#### Layer 4: 对抗层（Adversarial Layer）—— 竞品完全没有

**核心洞察**：所有竞品的分析都有一个致命缺陷——**confirmation bias（确认偏差）**。一旦 LLM 形成了一个判断，它会倾向于搜集支持该判断的证据，忽略矛盾证据。这就像一个分析师只看自己想看的东西。

**解决方案：Red Team 对抗验证**

在交叉验证阶段，引入一个**对抗视角的 Agent**（或 prompt 段），专门攻击主分析的每一个核心判断：

```
                    ┌─────────────┐
各维度研究完成 ──→  │ 主分析合成   │ ──→ 主判断 + 因果链
                    └──────┬──────┘
                           │
                    ┌──────┴──────┐
                    │  Red Team   │ ──→ 对每个核心判断提出反驳
                    │  对抗验证   │      + 识别确认偏差
                    └──────┬──────┘      + 寻找被忽略的证据
                           │
                    ┌──────┴──────┐
                    │  综合裁决   │ ──→ 最终判断（含对抗意见）
                    └─────────────┘
```

**Red Team prompt 设计**：

```
## Red Team 对抗验证任务

你是这篇分析报告的质疑者（Devil's Advocate）。你的任务不是同意主分析，
而是尽一切可能找到它的漏洞。

### 1. 核心判断攻击
对主分析的每一个核心判断，回答：
- 什么证据能证明这个判断是错的？
- 这个判断是否建立在未经验证的假设之上？
- 是否存在被忽略的反面证据？

### 2. 确认偏差检测
- 主分析是否只引用了支持其结论的证据？
- 是否有重要的反对声音被遗漏或弱化处理？
- 因果链中是否有逻辑跳跃（A 发生后 B 发生 ≠ A 导致了 B）？

### 3. 替代解释（Alternative Hypothesis）
提出至少 1 个与主分析不同的、但同样能解释现有证据的替代解释。
例：主分析认为"英伟达收购 Run:ai 是为了控制算力调度权"，
替代解释可能是"这只是一笔防御性收购，防止 AMD 先下手"。

### 4. "证伪条件"（Falsification Conditions）
对主分析的本质判断，给出 2-3 个具体的证伪条件：
"如果以下任一情况出现，主分析的判断大概率是错的：
- 条件 1：...
- 条件 2：...
- 条件 3：..."
```

**输出结构**：

```typescript
interface RedTeamResult {
  /** 对每个核心判断的攻击 */
  challenges: Array<{
    targetClaim: string; // 被攻击的判断
    counterEvidence: string; // 反面证据
    logicGap: string; // 逻辑漏洞
    severity: "fatal" | "significant" | "minor";
  }>;
  /** 替代解释 */
  alternativeHypothesis: string;
  /** 证伪条件 */
  falsificationConditions: string[];
  /** 被忽略的视角 */
  blindSpots: string[];
}
```

**报告呈现**：Red Team 的结果不是隐藏的质量检查，而是**直接呈现在报告中**——这是对用户最大的价值：

```markdown
### 反共识视角

> **主流分析认为**：英伟达收购 Run:ai 是为了控制 AI 算力调度权，
> 标志着芯片厂商从"卖硬件"向"控平台"的战略转型。
>
> **但值得注意的是**：另一种同样合理的解释是，这只是一笔防御性收购——
> 英伟达的真正恐惧不是算力调度，而是 AMD ROCm 生态一旦在调度层补齐短板，
> CUDA 的护城河将被绕过。Run:ai 的 700+ 企业客户是英伟达需要锁定的资源，
> 而非调度技术本身。

#### 证伪条件

如果以下任一情况出现，主分析可能需要修正：

1. 英伟达在收购后 12 个月内未将 Run:ai 深度集成到 CUDA 生态（说明收购动机是防御而非进攻）
2. Run:ai 继续支持 AMD GPU 调度（说明"控制权"判断不成立）
3. 英伟达在 2025 年继续收购其他 GPU 编排公司（说明这是系列防御动作，非单一战略）
```

**为什么这很重要**：这是业界没有任何产品做的事。用户拿到的不只是"一种分析"，而是"主流分析 + 最强反驳 + 判断什么情况下自己该改变看法"。这才是真正的洞察力。

#### Layer 5: 预测层（Prediction Layer）—— 竞品完全没有

**核心洞察**：所有竞品的预测都是不可证伪的废话——"未来充满不确定性"、"需要持续关注"。这种预测没有任何信息量。

**解决方案：可证伪预测 + WWNBT 框架**

**WWNBT = "What Would Need to Be True"（要使这件事成立，什么条件必须为真）**

这是 McKinsey 内部做战略建议时的标准方法——不问"会不会发生"，而是问"要发生的话，需要什么条件成立"。

```
## 情景推演（WWNBT 框架）

对每个情景，必须回答三个问题：

### 情景 A：[情景名称]
1. **What Would Need to Be True**：要使这个情景发生，以下条件全部成立：
   - 条件 1：[具体、可观察的条件]
   - 条件 2：[具体、可观察的条件]
   - 条件 3：[具体、可观察的条件]
2. **关键观察指标**：用户应该关注什么信号来判断是否走向这个情景？
   - 指标 1：[具体可追踪的指标]（当前值 → 触发阈值）
   - 指标 2：...
3. **时间窗口**：这个情景的判断窗口是多久？在什么时间点之前应该能看到明确信号？
```

**示例**（英伟达收购 Run:ai）：

```markdown
### 情景推演

#### 情景 A：英伟达建成算力调度垄断（概率：35%，置信度：中）

**What Would Need to Be True**：

- Run:ai 在 12 个月内完成与 CUDA 的深度集成
- 英伟达停止 Run:ai 对 AMD GPU 的支持
- 至少 3 家主要云厂商采用 Run:ai 作为默认调度层

**关键观察指标**：

- Run:ai 企业客户数变化（当前 ~700 → 若 18 个月内达到 2000+ 则确认）
- AMD ROCm 在 Top 500 超算中的占比（当前 ~8% → 若持续上升则削弱此情景）

**判断窗口**：2027 年 Q2 前应有明确信号

#### 情景 B：防御性收购，Run:ai 逐渐边缘化（概率：40%，置信度：中）

...

#### 情景 C：监管干预，被迫开放（概率：25%，置信度：低）

...
```

**与竞品的区别**：

- 竞品说"英伟达的收购可能改变行业格局"（不可证伪的废话）
- 我们说"如果 Run:ai 12 个月内客户数翻倍且停止支持 AMD，那么垄断情景成立；如果相反，则这只是防御性收购"（可证伪、可追踪、有行动指导）

### 2.3 完整分析流水线

将五层引擎串联起来，完整流程如下：

```
锚定文章
    │
    ▼
Layer 1: 信息层 ──→ 实体提取 + 事件分类 + 信源评估
    │
    ▼
Layer 2: 因果层 ──→ 远因/近因/导火索假设生成
    │
    ▼
Layer 3: 框架层 ──→ 自动选择分析框架 + 注入框架专属问题
    │
    ▼
维度规划 + 搜索 + 写作（各维度并行）
    │
    ▼
Layer 4: 对抗层 ──→ 交叉验证 + Red Team 攻击 + 替代解释 + 证伪条件
    │
    ▼
Layer 5: 预测层 ──→ WWNBT 情景推演 + 观察指标 + 判断窗口 + 盲点检测
    │
    ▼
报告合成 ──→ 主分析 + 反共识视角 + 可证伪预测 + 分析局限声明
```

### 2.4 分析驱动的维度设计

每个维度不是一个"信息分类桶"，而是回答一个**核心分析问题**：

| 维度       | 核心分析问题                             | 分析目标               |
| ---------- | ---------------------------------------- | ---------------------- |
| 事件核心   | 如果用一句话概括这个事件的本质，是什么？ | 5W1H 全貌还原          |
| 结构性背景 | 这个事件是偶然的还是必然的？             | 验证远因假设           |
| 触发与时机 | 为什么这件事没有早一年或晚一年发生？     | 验证近因和导火索假设   |
| 利益格局   | 谁是最大受益者？谁的利益被损害？         | 博弈分析，非信息罗列   |
| 连锁反应   | 哪些看似无关的领域会被波及？             | 一阶→二阶→三阶影响传导 |
| 历史对标   | 历史上有没有类似事件？结局如何？         | 以史为鉴，校准预测     |
| 情景推演   | 接下来有几种可能路径？什么变量决定走向？ | WWNBT 可证伪预测       |

### 2.5 证据分级体系

EVENT 类型对证据质量要求更高，因为因果推理依赖可靠证据：

| 等级                   | 来源类型                                         | 引用方式                                   | 示例                                         |
| ---------------------- | ------------------------------------------------ | ------------------------------------------ | -------------------------------------------- |
| **Tier 1（强证据）**   | 当事方官方声明、审计财报、官方统计数据、学术论文 | 直接引用，无需限定语                       | SEC 文件、官方新闻稿                         |
| **Tier 2（中等证据）** | 权威机构报告、权威媒体深度报道、行业白皮书       | 引用时加"据 XX 报告..."                    | Gartner/IDC 报告、Reuters/Bloomberg 深度报道 |
| **Tier 3（弱证据）**   | 新闻转载、行业访谈、社区讨论、个人博客           | 引用时加限定语"据报道..."、"有观点认为..." | 行业论坛帖子、Twitter/X 讨论                 |

**规则**：

- 锚定文章自动归为 Tier 2（除非来自官方渠道则为 Tier 1）
- 每个核心因果判断至少需要 1 个 Tier 1 或 Tier 2 来源支撑
- 仅依赖 Tier 3 的判断必须标注"待进一步验证"
- 数据类引用必须标注采集时间和来源机构

### 2.6 信息新颖度检测（Information Novelty Detection）

**问题**：搜索引擎返回的结果中 70-80% 是对同一信息源的转载和重复报道。10 篇文章可能只包含 2 条独立信息。

**解决方案**：在 enrichment 阶段对每条证据做新颖度评分：

```typescript
interface NoveltyScore {
  /** 这条证据是否包含在其他已有证据中未出现的独立信息？ */
  hasUniqueInfo: boolean;
  /** 独立信息点数量 */
  uniqueInfoCount: number;
  /** 与已有证据的重叠度 (0-1) */
  overlapRatio: number;
  /** 信息源独立性：是原始报道还是转载？ */
  isOriginalSource: boolean;
}
```

**用途**：

- 优先使用高新颖度 + 高 Tier 的证据
- 在报告中标注"本分析基于 N 条独立信息源"（而非 N 条搜索结果）
- 帮助 Red Team 识别"看似证据充分但实际只有一个信源"的情况

---

## 3. 用户旅程

### 3.1 核心原则

**界面一致性**：EVENT 类型的详情页、研究进度、报告展示与现有类型（MACRO/TECH/COMPANY）完全一致。
用户感知到的唯一差别是：创建时输入的是新闻 URL/内容而非主题名称，研究维度是从文章内容动态推导的而非预设模板。

```
创建事件洞察 → 锚定文章解析 → 因果推理+维度规划 → 三层递进搜索 → 写作+交叉验证 → 报告生成 → 报告消费
     │              │              │                    │              │              │           │
  用户操作       系统自动        系统自动             系统执行       系统执行       系统自动     用户操作
  (~30s)        (~10s)         (~15s)              (~3-8min)      (~2min)       (~30s)      (持续)
```

### 3.2 Step 1: 创建事件洞察

**入口**：用户在 `/ai-insights/topic-research` 页面点击「创建话题」按钮

**Step 1a: 选择类型**

用户在类型选择面板中看到 4 个选项卡片：

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  🌐 宏观趋势  │  │  🔬 技术追踪  │  │  🏢 企业分析  │  │  📰 事件洞察  │
│  MACRO        │  │  TECHNOLOGY   │  │  COMPANY      │  │  EVENT (新)   │
│              │  │              │  │              │  │              │
│ 宏观产业趋势  │  │ 跟踪技术发展  │  │ 深度企业分析  │  │ 基于新闻线索  │
│ 多维度分析    │  │ 前沿动态     │  │ 竞争态势     │  │ 深挖事件本质  │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

用户点击「事件洞察」卡片 → 进入 Step 1b

**Step 1b: 填写事件信息**

EVENT 类型的表单与其他类型有显著区别 — 核心输入从「主题名称」变为「新闻来源」：

```
┌─────────────────────────────────────────────────────────┐
│  创建事件洞察                                             │
│                                                          │
│  ┌─ 输入方式 ──────────────────────────────────────┐    │
│  │  ● 新闻链接    ○ 粘贴内容                        │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  新闻链接 *                                              │
│  ┌──────────────────────────────────────────────────┐   │
│  │ https://www.reuters.com/technology/nvidia-...     │   │
│  └──────────────────────────────────────────────────┘   │
│  ✓ 已识别来源：reuters.com                               │
│                                                          │
│  主题名称（自动生成，可编辑）                              │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 英伟达宣布收购 Run:ai —— AI 算力市场格局巨变       │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  研究语言                                                │
│  [中文 ▾]                                                │
│                                                          │
│  ┌─ 高级选项 ─────────────────────────────────────┐    │
│  │  研究深度:  ○ 快速(4维度)  ● 标准(5维度)  ○ 深度(7维度) │
│  │  启用图表:  [✓]                                  │    │
│  │  搜索时间范围: [近6个月 ▾]                        │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│                    [取消]    [开始分析]                    │
└─────────────────────────────────────────────────────────┘
```

**粘贴内容模式**（切换到「粘贴内容」时）：

```
│  ┌─ 输入方式 ──────────────────────────────────────┐    │
│  │  ○ 新闻链接    ● 粘贴内容                        │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  粘贴新闻内容 *                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 英伟达（NVIDIA）周四宣布已完成对以色列初创公司      │   │
│  │ Run:ai 的收购。Run:ai 的 GPU 编排平台将帮助...     │   │
│  │                                                    │   │
│  │                                                    │   │
│  │                                          500/5000字 │   │
│  └──────────────────────────────────────────────────┘   │
```

**关键交互细节**：

| 交互              | 行为                                                              |
| ----------------- | ----------------------------------------------------------------- |
| 输入 URL 后       | 前端展示 loading → 后端抓取文章 → 自动填充主题名称 → 展示来源域名 |
| URL 无法抓取      | 提示「无法访问该链接，请尝试粘贴内容」，自动切换到粘贴模式        |
| 粘贴内容后        | 取第一行或前 50 字符作为主题名称候选                              |
| 主题名称          | 自动生成但可编辑，用户可以自定义更具描述性的标题                  |
| 内容过短 (<100字) | 提示「内容较短，可能影响分析深度」，但不阻止创建                  |
| 研究深度          | 默认「标准」，Leader 同时参考事件复杂度自动调整（见 3.4）         |

**Step 1c: 提交创建**

用户点击「开始分析」：

1. 前端发送 `POST /api/v1/topic-insights/topics` + `CreateTopicDto`
2. 后端创建 Topic 记录（type=EVENT, topicConfig 含 sourceUrl/sourceContent）
3. 前端收到响应 → 跳转到 `/ai-insights/topic/{topicId}` 详情页
4. 后端异步触发锚定文章解析（Step 2）

### 3.3 Step 2: 锚定文章解析（系统自动，用户无感）

创建 Topic 时，后端在保存记录的同时异步解析锚定文章。这一步对用户来说是透明的 — 用户创建完成后直接跳转到与现有类型完全一致的详情页，看到的是标准的「开始研究」状态。

**用户看到的**：标准的 Topic 详情页，与 MACRO/TECH/COMPANY 完全一致。

**系统在后台完成的工作**（创建时异步触发，~5-10s 内完成）：

1. URL 抓取全文（如果是 URL 输入）
2. LLM 提取标题、摘要、关键实体、事件类型、信源可信度评估
3. 提取文章中的图片（复用 FigureExtractorService）
4. 结果写入 `topicConfig`（供后续 Leader 规划使用）

> 如果解析失败（URL 不可访问等），不阻塞流程 — Leader 规划时降级为普通模式。

### 3.4 Step 3: 因果推理 + 维度规划（EVENT 核心差异）

**与现有类型的关键差异**：现有类型 Leader 直接规划维度；EVENT 类型 Leader 先做因果推理，再基于因果假设规划维度。

```
现有类型：   锚定文章 → Leader 规划维度 → 执行
EVENT 类型：锚定文章 → Leader 因果推理 → 生成因果假设 → 基于假设规划维度 → 执行
```

**Leader 因果推理任务**（EVENT 专属 prompt 段）：

```
## EVENT 因果推理任务

在规划维度之前，先基于锚定文章完成因果推理，输出到 causalHypotheses 字段：

### 远因分析（Structural Cause）
这个事件反映了什么长期趋势或结构性矛盾？
- 行业层面：什么行业周期或结构变化在推动？
- 技术层面：什么技术成熟度变化创造了条件？
- 政策层面：什么政策环境变化在起作用？

### 近因分析（Proximate Cause）
什么具体条件在近期成熟，使这件事变为可能？
- 哪些具体条件在近 1-2 年内发生了变化？
- 涉及的关键决策者做出了什么判断？

### 导火索分析（Trigger）
为什么是现在？什么具体事件/时间窗口触发了行动？
- 有什么具体事件催化了这次行动？
- 是否存在竞争压力、监管窗口、市场窗口？

### 本质判断（一句话）
用一句话概括：这个事件的本质是什么？

⚠️ 以上是初始假设，各维度研究后可能被修正。
```

**事件复杂度自动评估**：

Leader 同时评估事件复杂度，影响维度数量：

| 复杂度                               | 判断标准                                  | 维度数 |
| ------------------------------------ | ----------------------------------------- | ------ |
| 简单（产品发布、人事变动）           | 涉及实体 ≤3，单一行业，时间跨度 <1 年     | 4-5    |
| 中等（收购、政策发布、融资）         | 涉及实体 3-5，1-2 个行业，时间跨度 1-3 年 | 5-6    |
| 复杂（地缘冲突、行业变革、重大监管） | 涉及实体 >5，跨行业，时间跨度 >3 年       | 6-7    |

用户选择的研究深度作为上限参考，Leader 在此范围内自动决定。

### 3.5 Step 4: 三层递进搜索 + 研究执行

**用户视角**：与 MACRO/TECH/COMPANY 没有任何区别 — 左侧维度列表展示进度，右侧等待报告生成。

**后端差异**：搜索策略从"单层搜索"升级为"三层递进搜索"（详见第 5 章架构设计）。

### 3.6 Step 5: 交叉验证 + Red Team + 报告合成

所有维度研究完成后，EVENT 类型执行三个竞品完全没有的阶段：

```
维度研究完成
    │
    ▼
交叉验证（Leader 检验因果一致性、矛盾检测、证据缺口）
    │
    ▼
Red Team 对抗验证（质疑核心判断、提出替代假设、识别确认偏差）
    │
    ▼
WWNBT 情景推演（可证伪预测 + 观察指标 + 判断窗口）
    │
    ▼
报告合成（通过 EventReportSkill 组装 EVENT 专属报告结构）
```

**报告结构差异**：EVENT 类型通过 `EventReportSkill` 定义专属报告骨架，包含"反共识视角"和"证伪条件"等竞品没有的章节（详见第 6 章 ReportSkill 架构）。

### 3.7 Step 6: 报告消费

**与现有类型完全一致**。报告自动合成后展示在右侧面板，用户可以：

- 阅读报告（执行摘要 + 各维度分析）
- 查看证据来源（锚定文章标记为"主要来源"）
- 导出（Markdown / PDF / DOCX）
- 更新研究（增量模式）
- 版本历史与对比
- 分享

### 3.8 与现有类型的旅程差异汇总

```
                    现有类型 (MACRO/TECH/COMPANY)          EVENT 类型
                    ───────────────────────────          ──────────

Step 1 类型选择       一样                                一样（多一个 EVENT 卡片）
Step 1 表单          名称 + 描述                         ★ URL/粘贴 + 自动生成名称
Step 2 文章解析       无此步骤                            ★ 后端异步解析（用户无感）
Step 3 详情页        一样                                一样（完全复用）
Step 3 启动研究       一样                                一样
Step 3 规划          Leader 基于模板规划维度               ★ Leader 先因果推理，再基于假设规划维度
Step 4 搜索          单层搜索                             ★ 三层递进搜索 + 锚定证据注入
Step 4 写作          一样                                ★ 每个维度注入 analyticalQuestion
Step 4.5 交叉验证     无此步骤                            ★ Leader 交叉验证因果链
Step 4.6 Red Team    无此步骤                            ★ 对抗验证 + 替代假设 + 证伪条件
Step 4.7 WWNBT       无此步骤                            ★ 可证伪情景推演 + 观察指标
Step 5 报告合成       通用 ReportSkill                    ★ EventReportSkill（含反共识视角+证伪条件）
Step 5 报告展示       一样                                一样（完全复用）
Step 5 报告消费       一样                                一样（完全复用）
```

**前端只需改动 1 处**：CreateTopicDialog 增加 EVENT 类型卡片和对应的 URL/粘贴输入表单。
**其余所有页面（详情页、进度面板、报告面板、导出、版本历史等）全部复用，零改动。**

### 3.9 边界场景与降级策略

| 场景                                 | 处理方式                                                        |
| ------------------------------------ | --------------------------------------------------------------- |
| URL 无法访问（403/付费墙）           | 创建对话框中提示用户手动粘贴内容，自动切换输入模式              |
| 文章内容过短（<200 字）              | 允许创建，但提示分析深度可能受限；Leader 可能降级复杂度为"简单" |
| 文章内容过长（>10000 字）            | 截取前 5000 字 + LLM 摘要，不影响用户体验                       |
| 文章语言与设定语言不一致             | Leader 用设定语言输出，不阻止                                   |
| 文章内容为非新闻（如产品页面、博客） | 不限制，Leader 会根据实际内容调整分析角度                       |
| 重复提交相同 URL                     | 前端检查是否存在同 URL 的 Topic，提示但不阻止                   |
| 锚定文章解析失败                     | 不阻塞创建，Leader 规划时降级为普通模式（跳过因果推理）         |
| 锚定文章解析成功但实体提取为空       | 降级为普通研究模式，不注入锚定文章特殊逻辑                      |
| 因果推理质量过低（LLM 输出空泛）     | Leader 自检，低质量时降级为标准维度规划模式                     |

---

## 4. 维度模板

EVENT 类型**不使用固定维度模板**（维度完全由 Leader 从文章内容和因果假设推导），
但提供**分析驱动的参考框架**供 Leader prompt 引用：

```typescript
// dimension-templates.config.ts

/**
 * 事件洞察维度参考框架（分析驱动型）
 *
 * ★ 不作为固定模板使用，仅作为 Leader AI 的规划参考
 * ★ 每个维度有核心分析问题（analyticalQuestion），注入写作 prompt
 * Leader 应根据具体事件内容和因果假设灵活选择和调整维度
 */
export const EVENT_INSIGHT_REFERENCE_DIMENSIONS: DimensionTemplate[] = [
  {
    id: "event_core",
    name: "事件核心：发生了什么",
    description:
      "事件全貌还原：5W1H（谁、什么、何时、何地、为何、如何），关键时间线",
    analyticalQuestion: "如果用一句话概括这个事件的本质，是什么？",
    sortOrder: 1,
    searchQueries: [
      "{event} official announcement",
      "{event} press release",
      "{event} timeline chronology",
      "{entity} statement {event}",
    ],
    searchSources: ["news", "web"],
    searchLayer: "factual",
    minSources: 5,
  },
  {
    id: "structural_context",
    name: "结构性背景：为什么会发生",
    description:
      "事件发生的深层结构性原因：行业周期、技术成熟度、政策窗口、竞争格局演变",
    analyticalQuestion:
      "这个事件是偶然的还是必然的？如果是必然的，什么结构性力量在推动？",
    sortOrder: 2,
    searchQueries: [
      "{industry} trend evolution 2024 2025 2026",
      "{industry} structural change",
      "{entity} strategy history background",
      "{technology} maturity adoption curve",
    ],
    searchSources: ["web", "academic", "industry-reports"],
    searchLayer: "contextual",
    minSources: 6,
  },
  {
    id: "trigger_and_timing",
    name: "触发与时机：为什么是现在",
    description: "直接触发因素、时间窗口分析、催化事件、竞争压力、监管窗口",
    analyticalQuestion:
      "为什么这件事没有早一年或晚一年发生？什么条件在此刻成熟？",
    sortOrder: 3,
    searchQueries: [
      "{event} trigger catalyst",
      "{entity} recent moves 2025 2026",
      "{industry} competitive pressure",
      "{event} regulatory window",
    ],
    searchSources: ["news", "web"],
    searchLayer: "contextual",
    minSources: 5,
  },
  {
    id: "stakeholder_map",
    name: "利益格局：谁受益谁受损",
    description: "关键利益相关方的立场、动机、博弈关系、权力不对称分析",
    analyticalQuestion:
      "谁是这个事件最大的受益者？谁的利益被损害？权力格局如何重新分配？",
    sortOrder: 4,
    searchQueries: [
      "{event} stakeholder reaction response",
      "{event} winner loser impact",
      "{entity} competitor response",
      "{event} expert analysis opinion",
    ],
    searchSources: ["news", "web"],
    searchLayer: "impact",
    minSources: 6,
  },
  {
    id: "ripple_effects",
    name: "连锁反应：影响如何传导",
    description:
      "一阶影响（直接）→ 二阶影响（间接）→ 三阶影响（系统性），跨行业传导路径",
    analyticalQuestion:
      "这个事件的影响会如何层层传导？哪些看似无关的领域会被波及？",
    sortOrder: 5,
    searchQueries: [
      "{event} impact analysis industry",
      "{event} market impact ripple effect",
      "{event} supply chain impact",
      "{event} downstream effect",
    ],
    searchSources: ["news", "web", "financial"],
    searchLayer: "impact",
    minSources: 6,
  },
  {
    id: "historical_parallel",
    name: "历史对标：有无先例可循",
    description: "历史上类似事件的对比分析、结局复盘、经验教训、关键差异",
    analyticalQuestion: "历史上有没有类似的事件？结局如何？这次有什么不同？",
    sortOrder: 6,
    searchQueries: [
      "similar {eventType} historical precedent",
      "{industry} acquisition history case study",
      "{eventType} lessons learned",
      "historical parallel {event}",
    ],
    searchSources: ["web", "academic"],
    searchLayer: "contextual",
    minSources: 5,
  },
  {
    id: "future_scenarios",
    name: "情景推演：接下来会怎样",
    description: "基准/乐观/悲观三种情景分析，关键变量识别，拐点判断，概率评估",
    analyticalQuestion: "这件事的发展有几种可能路径？什么变量决定走向哪条路？",
    sortOrder: 7,
    searchQueries: [
      "{event} future outlook prediction",
      "{event} scenario analysis",
      "{industry} forecast 2026 2027",
      "{event} key uncertainty risk",
    ],
    searchSources: ["web", "news"],
    searchLayer: "impact",
    minSources: 5,
  },
];
```

### 维度选择策略

Leader 根据事件类型灵活裁剪维度：

| 事件类型  | 核心维度（必选）               | 可选维度             | 可省略维度                         |
| --------- | ------------------------------ | -------------------- | ---------------------------------- |
| 收购/并购 | 事件核心、利益格局、连锁反应   | 结构性背景、历史对标 | 触发时机（通常已在事件核心中覆盖） |
| 政策/法规 | 事件核心、结构性背景、连锁反应 | 利益格局、情景推演   | 历史对标（视政策类型而定）         |
| 产品发布  | 事件核心、利益格局、情景推演   | 结构性背景           | 触发时机、历史对标                 |
| 融资/IPO  | 事件核心、利益格局、结构性背景 | 连锁反应、情景推演   | 历史对标                           |
| 安全事件  | 事件核心、连锁反应、历史对标   | 利益格局             | 触发时机                           |
| 地缘/贸易 | 全部维度                       | —                    | —                                  |

---

## 5. 架构设计

### 5.1 数据模型变更

#### Prisma Schema

```prisma
// 1. 新增 enum 值
enum ResearchTopicType {
  MACRO
  TECHNOLOGY
  COMPANY
  EVENT       // ← 新增
}

// 2. ResearchTopic.topicConfig 新增 EVENT 类型的配置
// EVENT topicConfig schema:
// {
//   // === 锚定文章信息 ===
//   sourceUrl?: string;          // 原始新闻 URL（如果是 URL 输入）
//   sourceUrls?: string[];       // V2 预留：多 URL 输入
//   sourceContent?: string;      // 原始新闻内容（如果是粘贴输入，截取前 5000 字符）
//   additionalContext?: string;  // V2 预留：用户补充上下文
//   sourceTitle?: string;        // 新闻标题
//   sourceDate?: string;         // 新闻日期（ISO 格式）
//   sourceDomain?: string;       // 来源域名
//   sourceTier?: 1 | 2 | 3;     // 信源可信度等级
//
//   // === 事件解析结果 ===
//   eventType?: string;          // 事件类型：policy/acquisition/product/funding/regulation/incident/geopolitical
//   keyEntities?: {
//     people: string[];          // 关键人物
//     organizations: string[];   // 关键机构
//     technologies: string[];    // 关键技术
//     locations: string[];       // 关键地点
//     events: string[];          // 关联事件
//   };
//   complexityLevel?: 'simple' | 'moderate' | 'complex';  // 事件复杂度（Leader 自动评估）
//
//   // === 因果推理结果（Leader 规划阶段生成）===
//   causalHypotheses?: {
//     structuralCause: string;   // 远因
//     proximateCause: string;    // 近因
//     trigger: string;           // 导火索
//     essenceStatement: string;  // 一句话本质判断
//   };
//
//   // === 交叉验证结果（synthesis 阶段生成）===
//   crossValidation?: {
//     contradictions: string[];  // 发现的矛盾
//     revisedHypotheses: string; // 修正后的因果链
//     emergentFindings: string[];// 涌现的新发现
//     evidenceGaps: string[];    // 证据缺口
//   };
//
//   // === 事件时间线（research 阶段逐步丰富）===
//   timeline?: Array<{
//     date: string;
//     event: string;
//     significance: 'high' | 'medium' | 'low';
//     category: 'structural_cause' | 'proximate_cause' | 'trigger' | 'event' | 'reaction' | 'consequence';
//   }>;
//
//   // === 分析框架（Layer 3 框架层）===
//   analyticalFrameworkId?: string;  // 自动选择的分析框架 ID（如 'merger_acquisition'）
//   analyticalFrameworkName?: string; // 框架名称（如 '交易逻辑分析框架'）
//
//   // === Red Team 对抗验证结果（Layer 4 对抗层）===
//   redTeamResult?: {
//     challenges: Array<{
//       targetClaim: string;      // 被攻击的判断
//       counterEvidence: string;  // 反面证据
//       logicGap: string;         // 逻辑漏洞
//       severity: 'fatal' | 'significant' | 'minor';
//     }>;
//     alternativeHypothesis: string;  // 替代解释
//     falsificationConditions: string[]; // 证伪条件
//     blindSpots: string[];           // 被忽略的视角
//   };
//
//   // === WWNBT 预测结果（Layer 5 预测层）===
//   predictions?: Array<{
//     scenarioName: string;
//     probability: number;        // 0-100
//     confidence: 'high' | 'medium' | 'low';
//     wwnbt: string[];            // What Would Need to Be True
//     observableIndicators: Array<{
//       indicator: string;
//       currentValue?: string;
//       triggerThreshold?: string;
//     }>;
//     judgmentWindow: string;     // 判断窗口（如 "2027 年 Q2 前"）
//   }>;
//
//   // === 分析局限声明（synthesis 阶段生成）===
//   limitations?: {
//     cutoffDate: string;
//     sourceBias?: string;
//     missingPerspectives?: string[];
//     keyAssumptions?: string[];
//   };
//
//   // === 搜索配置 ===
//   enrichmentTopN?: number;     // 默认 20（事件需要更多上下文）
//   enrichmentMaxLength?: number; // 默认 8000（需要更深的内容）
// }
```

#### 迁移 SQL

```sql
-- 新增 EVENT enum 值
DO $$
BEGIN
    ALTER TYPE "ResearchTopicType" ADD VALUE IF NOT EXISTS 'EVENT';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

### 5.2 Pipeline 差异点

```
                    MACRO/TECH/COMPANY                              EVENT
                    ==================                              =====

用户输入            主题名称 + 描述                                 新闻 URL 或粘贴内容
                         │                                               │
                         │                                          ┌────┴────┐
                         │                                          │ 锚定文章 │  ← 新增阶段
                         │                                          │ 抓取解析 │
                         │                                          └────┬────┘
                         │                                               │
                         │                                          ┌────┴────┐
                         │                                          │ 因果推理 │  ← EVENT 独有
                         │                                          │ 假设生成 │
                         │                                          └────┬────┘
                         │                                               │
                    ┌────┴────┐                                    ┌────┴────┐
                    │ Leader  │                                    │ Leader  │
                    │ 规划维度 │                                    │ 基于假设 │  ← prompt 差异
                    │ (模板+AI)│                                    │ 推导维度 │
                    └────┬────┘                                    └────┬────┘
                         │                                               │
                    ┌────┴────┐                                    ┌────┴─────┐
                    │ 搜索阶段 │                                    │ 三层递进  │
                    │ 搜主题   │                                    │ 搜索阶段  │  ← 搜索策略差异
                    └────┬────┘                                    │ + 锚定注入│
                         │                                          └────┬─────┘
                         │                                               │
                    ┌────┴────┐                                    ┌────┴────┐
                    │ 写作阶段 │                                    │ 写作阶段 │
                    │ (通用)   │                                    │ +分析问题│  ← 每个维度注入 analyticalQuestion
                    └────┬────┘                                    └────┬────┘
                         │                                               │
                         │                                          ┌────┴─────┐
                         │                                          │ 交叉验证  │  ← EVENT 独有
                         │                                          │ 因果修正  │
                         │                                          └────┬─────┘
                         │                                               │
                         │                                          ┌────┴─────┐
                         │                                          │ Red Team  │  ← EVENT 独有
                         │                                          │ 对抗验证  │     Layer 4
                         │                                          └────┬─────┘
                         │                                               │
                         │                                          ┌────┴─────┐
                         │                                          │  WWNBT   │  ← EVENT 独有
                         │                                          │ 情景推演  │     Layer 5
                         │                                          └────┬─────┘
                         │                                               │
                    ┌────┴──────────────────────────────────────────┐
                    │              报告合成阶段                       │
                    │  通过 ReportSkill 按类型选择报告骨架            │
                    │  MACRO → MacroReportSkill                     │
                    │  TECH  → TechReportSkill                      │
                    │  COMPANY → CompanyReportSkill                  │
                    │  EVENT → EventReportSkill（含反共识+证伪）      │
                    │  → 格式化 → 发布                               │
                    └─────────────────────────────────────────────────┘
```

**关键差异阶段：8 个（五层引擎全量实现）**

1. 锚定文章抓取解析（新增服务）
2. 因果推理 + 假设生成（Layer 2，新增 prompt 段）
3. 分析框架自动选择（Layer 3，新增 prompt 段 + 框架配置）
4. 三层递进搜索策略（搜索逻辑差异）
5. 写作阶段注入 analyticalQuestion + 框架视角（prompt 差异）
6. 交叉验证 + 因果修正（新增 prompt 段）
7. Red Team 对抗验证（Layer 4，新增 prompt 段）
8. WWNBT 情景推演（Layer 5，新增 prompt 段）

### 5.3 差异阶段详细设计

#### 阶段 1：锚定文章抓取解析（新增）

**触发时机**：Topic 创建后、Leader 规划前
**负责服务**：`EventSourceService`（新增）

```typescript
// 新增文件：services/event/event-source.service.ts

interface EventSourceResult {
  /** 原始文章全文 */
  fullContent: string;
  /** 文章标题 */
  title: string;
  /** 发布日期 */
  publishDate?: string;
  /** 来源域名 */
  domain: string;
  /** 信源可信度等级 */
  sourceTier: 1 | 2 | 3;
  /** 文章摘要（LLM 生成） */
  summary: string;
  /** 关键实体提取 */
  keyEntities: {
    people: string[]; // 关键人物
    organizations: string[]; // 关键机构
    technologies: string[]; // 关键技术
    locations: string[]; // 关键地点
    events: string[]; // 关联事件
  };
  /** 事件类型分类 */
  eventType: string;
  /** 提取的图片 */
  extractedFigures: ExtractedFigure[];
}
```

**信源可信度评估规则**：

```typescript
function assessSourceTier(domain: string, content: string): 1 | 2 | 3 {
  // Tier 1: 官方来源
  const tier1Domains = [
    /\.gov($|\.)/,
    /sec\.gov/,
    /europa\.eu/,
    // 企业官方新闻稿
    /newsroom\./,
    /press\./,
    /blog\.(google|microsoft|apple|nvidia)\./,
  ];

  // Tier 2: 权威媒体和机构
  const tier2Domains = [
    /reuters\.com/,
    /bloomberg\.com/,
    /wsj\.com/,
    /ft\.com/,
    /nature\.com/,
    /science\.org/,
    /arxiv\.org/,
    /gartner\.com/,
    /mckinsey\.com/,
    /bcg\.com/,
    /techcrunch\.com/,
    /theverge\.com/,
    /arstechnica\.com/,
  ];

  // 其余为 Tier 3
}
```

**流程**：

1. 如果输入是 URL → 通过 ToolRegistry 调用 web-scraper 抓取全文
2. 如果输入是粘贴内容 → 直接使用
3. 评估信源可信度等级
4. 调用 LLM 提取：标题、摘要、关键实体、事件类型
5. 提取图片（复用 FigureExtractorService）
6. 将结果存入 `topicConfig`

#### 阶段 2：因果推理 + 维度规划（Leader prompt 差异）

**现有机制**：`LEADER_PLAN_PROMPT` 根据 `{topicType}` 分支选择维度策略

**新增 EVENT 分支**（两步：先因果推理，再规划维度）：

```
### 如果类型为 EVENT（事件洞察）：

## 第一步：因果推理（必须完成后再规划维度）

基于锚定文章，完成因果推理并输出到 causalHypotheses 字段：

1. 远因（Structural Cause）：什么长期趋势/结构性矛盾导致这件事可能发生？
2. 近因（Proximate Cause）：什么具体条件在近期成熟，使这件事变为可能？
3. 导火索（Trigger）：为什么是现在？什么触发了行动？
4. 本质判断（一句话）：这个事件的本质是什么？

## 第二步：基于因果假设规划维度

- 以因果假设为骨架，围绕事件展开分析
- 维度从文章内容和因果假设推导，不使用预设模板
- 每个维度必须有明确的 analyticalQuestion（核心分析问题）
- 推荐维度方向参考 EVENT_INSIGHT_REFERENCE_DIMENSIONS（灵活调整，不需全部使用）

## 第三步：事件复杂度评估

评估事件复杂度（simple/moderate/complex），输出到 complexityLevel：
- 涉及实体数量（>5 为 complex）
- 跨行业影响范围（>2 个行业为 complex）
- 时间跨度（背景超过 3 年为 complex）
- 利益相关方数量（>4 方为 complex）

## 搜索策略要求
- ⚠️ 不搜事件本身（锚定文章已有），搜事件的背景、影响、反应
- ⚠️ 为每个维度标注搜索层级：factual / contextual / impact
- ⚠️ 锚定文章已作为一级证据注入，搜索应聚焦补充信息
- ⚠️ 历史对标维度需要搜索类似的历史事件，不是搜当前事件本身

## 锚定文章内容（仅 EVENT 类型）
{sourceContent}

## 锚定文章关键实体
{keyEntities}

## 信源可信度
{sourceTier}
```

#### 阶段 3：三层递进搜索（搜索策略差异）

**核心理念**：不同类型的信息需要不同的搜索策略和来源。

```typescript
/**
 * EVENT 类型三层递进搜索策略
 * 每个维度根据其 searchLayer 字段选择对应策略
 */
const EVENT_SEARCH_LAYERS = {
  /**
   * 第一层：事实层（Factual）
   * 目标：核实事件本身的准确信息，获取更完整的事件细节
   */
  factual: {
    sources: ["news", "official"],
    timeRange: "7d", // 事件前后 7 天
    priority: "recency", // 按时间排序，优先最新
    dedup: true, // URL 去重排除锚定文章
  },

  /**
   * 第二层：上下文层（Contextual）
   * 目标：理解事件的背景、前因、行业环境、历史先例
   */
  contextual: {
    sources: ["web", "academic", "industry-reports"],
    timeRange: "12m", // 过去 12 个月
    priority: "relevance", // 按相关性排序
    dedup: true,
  },

  /**
   * 第三层：影响层（Impact）
   * 目标：收集各方反应、市场影响、专家分析、未来预测
   */
  impact: {
    sources: ["news", "web", "financial", "social"],
    timeRange: "30d", // 事件后 30 天
    priority: "authority", // 按来源权威性排序
    dedup: true,
  },
};
```

**搜索阶段代码差异**：

```typescript
// dimension-mission.service.ts 中

// 现有类型：searchQueries 直接搜主题本身
// EVENT 类型：searchQueries 按维度的 searchLayer 选择策略

// 示例：锚定文章 "OpenAI 发布 GPT-5"
// 维度 "连锁反应" (searchLayer: "impact") 的搜索词：
//   "GPT-5 impact AI industry downstream"
//   "GPT-5 competitor response market shift"
//   "大模型竞赛 2026 格局变化"
//   "GPT-5 developer ecosystem impact"
// 而不是 "OpenAI GPT-5"（锚定文章已有）
```

**锚定文章作为一级证据注入**：

```typescript
// dimension-mission.service.ts

// EVENT 类型：将锚定文章作为第一条证据注入每个维度的 evidenceData
if (topic.type === "EVENT") {
  const sourceEvidence = buildSourceEvidence(topic.topicConfig);
  searchPhaseResult.evidenceData.unshift(sourceEvidence);
}
```

```typescript
function buildSourceEvidence(
  topicConfig: EventTopicConfig,
): EnrichedEvidenceData {
  return {
    url: topicConfig.sourceUrl || "",
    title: topicConfig.sourceTitle || "锚定文章",
    domain: topicConfig.sourceDomain || "",
    fullContent: topicConfig.sourceContent,
    snippet: topicConfig.sourceContent?.slice(0, 300),
    contentSource: "anchor", // ← 新增 contentSource 类型
    urlValid: true,
    extractedFigures: [], // 锚定文章的图片
    isAnchorSource: true, // ← 标记为锚定来源
    sourceTier: topicConfig.sourceTier || 2,
  };
}
```

#### 阶段 3.5：分析框架自动选择（Layer 3，EVENT 独有）

**触发时机**：因果推理完成后、维度规划前
**依赖**：`analytical-frameworks.config.ts`（新增）

Leader 在因果推理阶段自动识别事件类型（acquisition/policy/product/funding/incident/geopolitical/personnel/tech-breakthrough），然后从框架配置中加载对应的分析框架。

```
## 框架注入 prompt（追加到 Leader 因果推理 prompt 之后）

### 分析框架加载

已识别事件类型：{eventType}
已加载分析框架：{frameworkName}

框架核心问题（每个必须在某个维度中得到回答）：
{coreQuestions}

分析指导：
{leaderGuidance}

框架专属搜索词模板：
{searchTemplates}

请在规划维度时：
1. 确保框架核心问题被分配到对应维度的 analyticalQuestion 中
2. 框架搜索词模板注入到对应维度的 searchQueries 中
3. 框架的 writingLens 注入到每个维度的写作指导中
```

#### 阶段 4：写作阶段（analyticalQuestion + 框架视角注入）

写作阶段复用 `section-writer.service.ts`，但 EVENT 类型每个维度的写作 prompt 额外注入：

```
## 本维度核心分析问题
{analyticalQuestion}

你的写作必须围绕这个问题展开，在结尾给出明确的分析判断。
禁止只罗列信息不给结论。

## 分析框架视角
{writingLens}
（如：M&A 框架要求"每个分析论点必须回答'这对交易逻辑意味着什么'"）

## 因果假设（供参考和验证）
远因：{structuralCause}
近因：{proximateCause}
导火索：{trigger}

请在本维度的分析中回答：本维度的证据是否支持/修正/推翻上述因果假设？
如果发现新的因果关系，请明确指出。
```

#### 阶段 5：交叉验证（EVENT 独有）

所有维度写作完成后、report-synthesis 之前，增加一次 Leader 交叉验证：

```
## 交叉验证任务

各维度研究已完成，请执行以下检验：

### 1. 矛盾检测
各维度之间是否存在事实或判断上的矛盾？
（如：维度 A 说"利好行业"，维度 B 显示"多方反对"— 这需要解释）

### 2. 因果假设修正
初始因果假设：
- 远因：{structuralCause}
- 近因：{proximateCause}
- 导火索：{trigger}
- 本质判断：{essenceStatement}

基于各维度的证据，这些假设是否需要修正？修正后的版本是什么？

### 3. 涌现发现
是否有多个维度的证据共同指向一个未预设的解释或发现？

### 4. 证据缺口
哪些关键判断缺少充分证据？需要在报告中标注不确定性的地方是什么？

输出到 crossValidation 字段。
```

#### 阶段 6：Red Team 对抗验证（Layer 4，EVENT 独有）

**触发时机**：交叉验证完成后、报告合成前
**输入**：各维度分析内容 + 交叉验证结果 + 因果假设链
**输出**：`topicConfig.redTeamResult`

详细 prompt 设计见 Section 2.2 Layer 4。

**关键实现细节**：

- Red Team 作为独立 LLM 调用，使用 `taskProfile: { creativity: 'high' }` 以鼓励发散思维
- 输入包含所有维度的 `keyFindings` + `essenceStatement` + 主要因果判断
- 输出的 `challenges`（按 severity 排序）、`alternativeHypothesis`、`falsificationConditions`、`blindSpots` 存入 `topicConfig.redTeamResult`
- Red Team 结果直接注入报告合成 prompt，在报告中呈现为"反共识视角"章节

```typescript
// Red Team 阶段在 topic-team-orchestrator.service.ts 中的位置：
//
// ... 所有维度研究完成 ...
// await this.runCrossValidation(topic, dimensions);     // 交叉验证
// await this.runRedTeamVerification(topic, dimensions);  // ← 新增：Red Team
// await this.runWWNBTPredictions(topic, dimensions);     // ← 新增：WWNBT
// await this.synthesizeReport(topic, dimensions);        // 报告合成
```

#### 阶段 7：WWNBT 情景推演（Layer 5，EVENT 独有）

**触发时机**：Red Team 完成后、报告合成前
**输入**：各维度分析 + 交叉验证 + Red Team 结果（含替代假设）
**输出**：`topicConfig.predictions`

```
## WWNBT 情景推演任务

基于已完成的分析和 Red Team 对抗验证，生成 2-4 个可证伪的情景：

### 对每个情景，必须回答：
1. **What Would Need to Be True**：要使这个情景发生，以下条件全部成立：
   - [具体、可观察、有时间限定的条件]
2. **关键观察指标**：用户应该关注什么信号？
   - [具体可追踪的指标]（当前值 → 触发阈值）
3. **时间窗口**：在什么时间点之前应该看到明确信号？

### 约束
- 每个情景必须有概率评估和置信度
- Red Team 的替代假设必须作为至少一个情景的基础
- 禁止不可证伪的预测（如"未来充满不确定性"）
- 所有条件必须是 12 个月内可观察的

输出格式参考 topicConfig.predictions 结构。
```

---

## 6. 报告结构设计：ReportSkill 架构

### 6.0 为什么需要 ReportSkill

**当前问题**：`report-assembler.service.ts` 硬编码了唯一的报告骨架——所有类型都输出"前言→执行摘要→维度→跨维度→风险→战略→结语"。但不同类型的洞察有根本不同的分析目标：

| 类型       | 分析目标     | 最佳报告结构                                    |
| ---------- | ------------ | ----------------------------------------------- |
| MACRO      | 全景扫描     | 执行简报 + 多维扫描 + 风险雷达 + 战略建议       |
| TECHNOLOGY | 技术纵深     | 技术评估 + 成熟度定位 + 采用路线图 + 技术壁垒   |
| COMPANY    | 竞争情报     | 企业画像 + 竞争定位 + 财务健康 + SWOT 矩阵      |
| **EVENT**  | **因果洞察** | **因果链 + 反共识视角 + 可证伪预测 + 分析局限** |

**解决方案**：`ReportSkill` 接口——每个 Topic 类型注册一个 Skill，定义该类型独有的报告结构。`report-assembler` 变成骨架引擎，根据 Skill 定义组装报告。

```typescript
// 新增文件：shared/report-template/skills/report-skill.interface.ts

interface ReportSkill {
  /** 适用的 Topic 类型 */
  topicType: ResearchTopicType;

  /** 报告骨架：有序的章节列表 */
  reportSkeleton: ReportSection[];

  /** 执行摘要格式（注入到 synthesis prompt） */
  executiveSummaryFormat: string;

  /** 合成 prompt 的补充指令（类型专属） */
  synthesisPromptAddendum: string;

  /** 类型专属的质量检查 */
  qualityChecks: QualityCheck[];
}

interface ReportSection {
  /** 章节 ID */
  id: string;
  /** 章节标题（支持 i18n） */
  label: { zh: string; en: string };
  /** 内容来源 */
  source: "supplementary" | "dimension" | "computed";
  /** 对应的 supplementary key（如 source=supplementary） */
  supplementaryKey?: keyof SupplementaryContent;
  /** 是否必选 */
  required: boolean;
  /** 排序权重 */
  order: number;
}
```

**四个 ReportSkill 实现**：

```typescript
// shared/report-template/skills/macro-report.skill.ts
const MACRO_REPORT_SKILL: ReportSkill = {
  topicType: 'MACRO',
  reportSkeleton: [
    { id: 'preface', label: { zh: '前言', en: 'Preface' }, source: 'supplementary', supplementaryKey: 'preface', required: true, order: 1 },
    { id: 'exec_summary', label: { zh: '执行摘要', en: 'Executive Summary' }, source: 'supplementary', supplementaryKey: 'executiveSummary', required: true, order: 2 },
    { id: 'toc', label: { zh: '目录', en: 'Table of Contents' }, source: 'computed', required: true, order: 3 },
    { id: 'dimensions', label: { zh: '维度分析', en: 'Dimension Analysis' }, source: 'dimension', required: true, order: 4 },
    { id: 'cross_dimension', label: { zh: '跨维度关联分析', en: 'Cross-Dimension Analysis' }, source: 'supplementary', supplementaryKey: 'crossDimensionAnalysis', required: true, order: 5 },
    { id: 'risk', label: { zh: '风险评估', en: 'Risk Assessment' }, source: 'supplementary', supplementaryKey: 'riskAssessment', required: true, order: 6 },
    { id: 'strategy', label: { zh: '战略建议', en: 'Strategic Recommendations' }, source: 'supplementary', supplementaryKey: 'strategicRecommendations', required: true, order: 7 },
    { id: 'conclusion', label: { zh: '结语', en: 'Conclusion' }, source: 'supplementary', supplementaryKey: 'conclusion', required: true, order: 8 },
  ],
  executiveSummaryFormat: '...McKinsey SCR 框架（现有）...',
  synthesisPromptAddendum: '',
  qualityChecks: [/* 现有通用检查 */],
};

// shared/report-template/skills/tech-report.skill.ts
const TECH_REPORT_SKILL: ReportSkill = {
  topicType: 'TECHNOLOGY',
  reportSkeleton: [
    { id: 'preface', ..., order: 1 },
    { id: 'exec_summary', label: { zh: '技术评估摘要', en: 'Technology Assessment Summary' }, ..., order: 2 },
    { id: 'toc', ..., order: 3 },
    { id: 'dimensions', ..., order: 4 },
    { id: 'maturity_position', label: { zh: '技术成熟度定位', en: 'Technology Maturity Position' }, source: 'supplementary', supplementaryKey: 'maturityPosition', required: true, order: 5 },
    { id: 'adoption_roadmap', label: { zh: '采用路线图', en: 'Adoption Roadmap' }, source: 'supplementary', supplementaryKey: 'adoptionRoadmap', required: true, order: 6 },
    { id: 'risk', label: { zh: '技术壁垒与风险', en: 'Technical Barriers & Risks' }, ..., order: 7 },
    { id: 'conclusion', ..., order: 8 },
  ],
  executiveSummaryFormat: `
    ## 技术评估摘要
    ### 技术定位（一句话）
    ### Hype Cycle 位置 + 成熟度评级
    ### 核心发现（3-5 条）
    ### 关键技术指标（表格）
    ### 商业化距离评估
    ### 技术壁垒
  `,
  synthesisPromptAddendum: '聚焦技术可行性和商业化路径，禁止泛泛的宏观政策分析',
  qualityChecks: [/* 技术准确性检查 */],
};

// shared/report-template/skills/company-report.skill.ts
const COMPANY_REPORT_SKILL: ReportSkill = {
  topicType: 'COMPANY',
  reportSkeleton: [
    { id: 'preface', ..., order: 1 },
    { id: 'exec_summary', label: { zh: '企业情报摘要', en: 'Company Intelligence Summary' }, ..., order: 2 },
    { id: 'toc', ..., order: 3 },
    { id: 'dimensions', ..., order: 4 },
    { id: 'competitive_position', label: { zh: '竞争定位分析', en: 'Competitive Positioning' }, source: 'supplementary', supplementaryKey: 'competitivePosition', required: true, order: 5 },
    { id: 'swot_matrix', label: { zh: 'SWOT 矩阵', en: 'SWOT Matrix' }, source: 'supplementary', supplementaryKey: 'swotMatrix', required: true, order: 6 },
    { id: 'strategy', label: { zh: '战略评估与建议', en: 'Strategic Assessment' }, ..., order: 7 },
    { id: 'conclusion', ..., order: 8 },
  ],
  executiveSummaryFormat: `
    ## 企业情报摘要
    ### 一句话定位
    ### 核心竞争力评级（表格：维度/评分/说明）
    ### 关键财务指标
    ### 战略动向（近 12 个月重大事件）
    ### 风险预警
    ### 投资者/合作者/竞争者视角建议
  `,
  synthesisPromptAddendum: '聚焦企业竞争力和战略方向，数据必须有财务来源支撑',
  qualityChecks: [/* 财务数据准确性检查 */],
};
```

**EVENT ReportSkill（核心设计）**：

```typescript
// shared/report-template/skills/event-report.skill.ts
const EVENT_REPORT_SKILL: ReportSkill = {
  topicType: "EVENT",
  reportSkeleton: [
    {
      id: "preface",
      label: { zh: "前言", en: "Preface" },
      source: "supplementary",
      supplementaryKey: "preface",
      required: true,
      order: 1,
    },
    {
      id: "exec_summary",
      label: { zh: "执行摘要", en: "Executive Summary" },
      source: "supplementary",
      supplementaryKey: "executiveSummary",
      required: true,
      order: 2,
    },
    {
      id: "toc",
      label: { zh: "目录", en: "Table of Contents" },
      source: "computed",
      required: true,
      order: 3,
    },
    {
      id: "dimensions",
      label: { zh: "深度分析", en: "Deep Analysis" },
      source: "dimension",
      required: true,
      order: 4,
    },
    {
      id: "cross_validation",
      label: { zh: "交叉验证", en: "Cross-Validation" },
      source: "supplementary",
      supplementaryKey: "crossDimensionAnalysis",
      required: true,
      order: 5,
    },
    // ★ EVENT 独有章节 ★
    {
      id: "contrarian_view",
      label: { zh: "反共识视角", en: "Contrarian Perspective" },
      source: "supplementary",
      supplementaryKey: "contrarianView",
      required: true,
      order: 6,
    },
    {
      id: "falsification",
      label: { zh: "证伪条件", en: "Falsification Conditions" },
      source: "supplementary",
      supplementaryKey: "falsificationConditions",
      required: true,
      order: 7,
    },
    {
      id: "scenario_wwnbt",
      label: { zh: "情景推演", en: "Scenario Analysis" },
      source: "supplementary",
      supplementaryKey: "scenarioOutlook",
      required: true,
      order: 8,
    },
    {
      id: "limitations",
      label: { zh: "分析局限声明", en: "Analytical Limitations" },
      source: "supplementary",
      supplementaryKey: "limitations",
      required: true,
      order: 9,
    },
    {
      id: "timeline",
      label: { zh: "事件时间线", en: "Event Timeline" },
      source: "computed",
      required: false,
      order: 10,
    },
    {
      id: "conclusion",
      label: { zh: "结语", en: "Conclusion" },
      source: "supplementary",
      supplementaryKey: "conclusion",
      required: true,
      order: 11,
    },
  ],
  executiveSummaryFormat: "... EVENT 专属格式（见 6.1）...",
  synthesisPromptAddendum: `
    ## EVENT 专属合成指令

    你需要额外生成以下 EVENT 独有章节：

    ### contrarianView（反共识视角）
    基于 Red Team 对抗验证结果，生成"反共识视角"章节：
    - 以"主流分析认为...但值得注意的是..."的结构展开
    - 呈现替代假设及其论据
    - 标注哪些被忽略的视角（blindSpots）
    - 400-600 字

    ### falsificationConditions（证伪条件）
    基于 Red Team 的证伪条件，生成结构化的证伪检查清单：
    - 每条证伪条件标注观察时间窗口
    - 格式："如果以下任一情况出现，主分析可能需要修正：1. ... 2. ... 3. ..."
    - 200-300 字

    ### scenarioOutlook（情景推演 WWNBT 版）
    基于 WWNBT 预测结果，生成可证伪的情景推演：
    - 每个情景必须包含：概率 + 置信度 + WWNBT 条件 + 观察指标 + 判断窗口
    - Red Team 的替代假设必须作为至少一个情景的基础
    - 600-800 字

    ### limitations（分析局限声明）
    生成分析局限声明（对标 Gartner Analytical Assumptions）：
    - 信息截止日期
    - 主要信源及可信度
    - 未覆盖视角
    - 关键假设
    - 200-300 字
  `,
  qualityChecks: [
    // EVENT 专属质量检查
    { id: "causal_rigor", description: "因果判断有证据链支撑" },
    { id: "contrarian_present", description: "反共识视角章节存在且非空" },
    { id: "falsification_specific", description: "证伪条件具体可观察" },
    { id: "wwnbt_falsifiable", description: "WWNBT 预测可证伪" },
    { id: "red_team_integrated", description: "Red Team 结果已整合到报告" },
    { id: "timeline_present", description: "事件时间线存在" },
    { id: "perspective_balance", description: "利益格局覆盖 ≥3 方" },
  ],
};
```

**ReportSkill 注册与使用**：

```typescript
// shared/report-template/skills/report-skill.registry.ts

const REPORT_SKILLS: Record<ResearchTopicType, ReportSkill> = {
  MACRO: MACRO_REPORT_SKILL,
  TECHNOLOGY: TECH_REPORT_SKILL,
  COMPANY: COMPANY_REPORT_SKILL,
  EVENT: EVENT_REPORT_SKILL,
};

export function getReportSkill(topicType: ResearchTopicType): ReportSkill {
  return REPORT_SKILLS[topicType] ?? MACRO_REPORT_SKILL; // 默认回退到 MACRO
}
```

```typescript
// report-assembler.service.ts 改造（伪代码）

assembleFullReport(topic, dimensionInputs, supplementaryContent, options) {
  const skill = getReportSkill(topic.type);
  const parts: string[] = [];

  for (const section of skill.reportSkeleton) {
    switch (section.source) {
      case 'supplementary':
        const content = supplementaryContent[section.supplementaryKey];
        if (content) {
          parts.push(`## ${section.label[lang]}\n`);
          parts.push(stripLeadingHeading(content));
        }
        break;
      case 'dimension':
        // 插入排序后的维度内容
        for (const dim of sortedDimensions) {
          parts.push(this.processDimensionContent(dim, ...));
        }
        break;
      case 'computed':
        // 目录、时间线等计算生成
        parts.push(this.computeSection(section.id, topic, dimensionInputs));
        break;
    }
  }

  return parts.join('\n');
}
```

**关键改动**：

- `report-assembler.service.ts` 从硬编码结构改为根据 `ReportSkill.reportSkeleton` 动态组装
- `report-synthesis.prompt.ts` 根据 `ReportSkill.synthesisPromptAddendum` 追加类型专属指令
- `SupplementaryContent` 接口扩展，新增 EVENT 专属字段（`contrarianView`、`falsificationConditions`、`limitations`）
- 现有类型（MACRO/TECH/COMPANY）的 ReportSkill 初始版本完全复现当前报告结构，确保向后兼容

### 6.1 EVENT 专属执行摘要

EVENT 类型使用专属执行摘要结构（替代通用的 McKinsey SCR 框架），更贴合"来龙去脉"的叙事需求：

```
## 执行摘要结构（EVENT 专属）

### 结构（严格按顺序）

1. **一句话判断**（加粗段落，30 字以内）
   这个事件的本质是什么？
   例：英伟达收购 Run:ai 标志着 AI 基础设施从"芯片战"进入"调度权之争"。

2. `### 为什么重要`（段落，2-3 句）
   这个事件为什么值得关注？对谁影响最大？

3. `### 因果脉络`（表格）
   | 层次 | 内容 |
   |------|------|
   | 远因 | {structuralCause — 来自交叉验证后的修正版} |
   | 近因 | {proximateCause} |
   | 导火索 | {trigger} |
   | 事件 | {event 一句话描述} |
   | 一阶影响 | {直接影响} |
   | 二阶影响 | {间接影响} |

4. `### 核心发现`（3-5 条编号列表）
   每条 1-2 句话，加粗判断句，标注置信度 [高/中/低]

5. `### 谁受益谁受损`（表格）
   | 利益方 | 影响 | 原因 |
   用表格呈现利益格局，直观清晰

6. `### 关键不确定性`（2-3 条）
   可能改变事件走向的关键变量，标注"值得持续关注"

### 约束
- 总长度 500-700 字
- 必须独立可读：不读全文也能理解事件来龙去脉
- 核心发现每条标注置信度
- 禁止使用引用块
- 禁止套话开头
```

### 6.2 维度内容写作标准

在通用 `report-writing-standards.ts` 基础上，EVENT 维度额外遵循：

```
### EVENT 维度写作附加要求

1. 结论先行：每个 ### 子节的第一段必须是该节的核心结论，不是背景铺垫
2. So-What 测试：每个主要论点后必须回答"这意味着什么"
3. 因果严谨性：区分相关性和因果性
   - 有因果证据："A 导致了 B（据 XX 报告...）"
   - 仅有相关性："A 与 B 呈正相关"
4. 量化锚点：关键数据必须有对比基准
   - 正确："市场规模达 1200 亿美元，同比增长 23%，为近五年最高增速"
   - 错误："市场规模达 1200 亿美元"（缺参照系）
5. 时间锚定：预测性判断标注时间窗口和置信度
   "预计 2025-2027 年（高置信度）..." 或 "中期来看（3-5 年，中等置信度）..."
```

### 6.3 事件时间线

事件时间线作为"事件核心"维度的结构化输出，V1 用 Markdown 表格呈现：

```markdown
### 事件时间线

| 时间    | 事件                                     | 类别   | 重要性 |
| ------- | ---------------------------------------- | ------ | ------ |
| 2023-06 | Run:ai 完成 C 轮融资 1 亿美元            | 近因   | 中     |
| 2024-01 | AMD 发布 ROCm 6.0，加速开源 GPU 编排生态 | 导火索 | 高     |
| 2024-03 | 英伟达宣布收购意向                       | 事件   | 高     |
| 2024-04 | 欧盟反垄断审查启动                       | 反应   | 高     |
| 2024-12 | 收购获批完成                             | 后续   | 高     |
```

V2 可做前端可视化组件（时间线图），数据结构预留在 `topicConfig.timeline` 中。

### 6.4 分析局限声明

报告末尾自动生成分析局限声明（对标 Gartner Analytical Assumptions）：

```markdown
---

### 分析局限声明

- **信息截止日期**：2026-03-13
- **主要信源**：reuters.com（Tier 2：权威媒体）
- **未覆盖视角**：未获取到 Run:ai 创始团队的公开声明；缺少亚太市场反应数据
- **关键假设**：假设欧盟反垄断审查不会推翻收购结果；假设 AMD ROCm 生态短期内不会实质性追赶 CUDA
```

---

## 7. 前端设计

### 7.1 改动范围

**只改 CreateTopicDialog.tsx** — 增加 EVENT 类型卡片和对应的输入表单。
其余所有页面（TopicDetail、TopicResearchLayout、报告面板、导出、版本历史、TopicCard）完全复用，不做任何改动。

### 7.2 CreateTopicDialog 扩展

**类型卡片新增**：

```typescript
{
  type: 'EVENT',
  icon: Newspaper,          // Lucide Newspaper 图标
  gradient: 'from-orange-500 to-red-500',
  title: '事件洞察',
  description: '基于新闻或线索，深挖事件来龙去脉，洞察背后本质',
}
```

**EVENT 专属输入表单**（Step 2）：

与其他类型的区别：用 URL/粘贴内容替代「主题名称+描述」输入，其余字段（语言、研究深度、高级选项）保持一致。

```
┌─────────────────────────────────────────────────────────┐
│  输入方式:  ● 新闻链接    ○ 粘贴内容                       │
│                                                          │
│  新闻链接 *                                              │
│  ┌──────────────────────────────────────────────────┐   │
│  │ https://www.reuters.com/technology/nvidia-...     │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  主题名称（自动从文章标题生成，可编辑）*                    │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 英伟达宣布收购 Run:ai                              │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  语言 / 研究深度 / 高级选项 → 与现有类型一致               │
└─────────────────────────────────────────────────────────┘
```

**关键交互**：

- 输入 URL → 后端抓取标题 → 自动填充主题名称（可编辑）
- 切换到粘贴模式 → 文本框替代 URL 输入 → 取第一行作为主题名称候选
- URL 不可访问时提示切换到粘贴模式

### 7.3 TopicCard 适配

TopicCard 已通过 `topic.type` 展示不同图标和渐变色，只需在类型映射中新增 EVENT 条目：

```typescript
// 类型→图标/颜色映射，已有 MACRO/TECH/COMPANY，新增：
EVENT: { icon: Newspaper, gradient: 'from-orange-500 to-red-500' }
```

### 7.4 其他页面：零改动

| 页面/组件           | 是否改动 | 原因                                   |
| ------------------- | -------- | -------------------------------------- |
| TopicDetail         | 不改     | 通用详情页，按 topic.type 无分支逻辑   |
| TopicResearchLayout | 不改     | 左右面板通用布局                       |
| 维度列表面板        | 不改     | 动态渲染 dimensions，名称来自后端      |
| 报告面板            | 不改     | 渲染 fullReport markdown，与类型无关   |
| 导出功能            | 不改     | 通用导出逻辑                           |
| 版本历史            | 不改     | 通用版本管理                           |
| 证据面板            | 不改     | 渲染证据列表，锚定文章作为普通证据显示 |

---

## 8. 质量控制

### 8.1 EVENT 专属质量检查（含五层引擎检查）

在现有 quality review 基础上，EVENT 类型通过 `EventReportSkill.qualityChecks` 追加以下检查：

| 检查项             | 规则                                                           | 阈值                     | 对应层  |
| ------------------ | -------------------------------------------------------------- | ------------------------ | ------- |
| **事实核查**       | 锚定文章中的关键事实（数字、日期、人名、金额）须有独立来源佐证 | >=80% 事实被二次确认     | Layer 1 |
| **因果严谨性**     | 每个因果判断标注是"相关性"还是"因果性"                         | 因果性判断须有直接证据链 | Layer 2 |
| **框架覆盖**       | 分析框架的 coreQuestions 在报告中全部被回答                    | 100% 覆盖                | Layer 3 |
| **Red Team 整合**  | 反共识视角章节存在、非空、包含替代假设                         | 必须有 ≥1 个替代假设     | Layer 4 |
| **证伪条件具体性** | 证伪条件是具体、可观察、有时间限定的                           | 禁止模糊条件             | Layer 4 |
| **WWNBT 可证伪性** | 每个情景的 WWNBT 条件在 12 个月内可验证                        | 100% 可证伪              | Layer 5 |
| **盲点声明**       | Red Team 的 blindSpots 在分析局限声明中体现                    | 必须声明                 | Layer 4 |
| **视角平衡**       | 利益格局维度必须覆盖至少 3 个不同立场的利益方                  | 不允许只呈现单方观点     | 通用    |
| **时效性**         | 影响分析和利益格局的证据 >50% 应在事件发生后发布               | 避免用旧信息分析新事件   | 通用    |
| **交叉一致**       | 执行摘要中的因果链与各维度结论不矛盾                           | 矛盾处必须解释原因       | 通用    |

### 8.2 三层可读性自检

报告须支持三种阅读模式（对标 McKinsey 三层阅读设计）：

| 阅读层            | 目标读者 | 阅读时间 | 获取内容                                     |
| ----------------- | -------- | -------- | -------------------------------------------- |
| **Layer 1: 扫描** | 高管     | 30 秒    | 执行摘要一句话判断 + 因果脉络表 + 核心发现   |
| **Layer 2: 速读** | 决策者   | 10 分钟  | Layer 1 + 各章要点 + 图表标题 + 谁受益谁受损 |
| **Layer 3: 精读** | 分析师   | 30+ 分钟 | 全文，含详细论证、引用、时间线、情景推演     |

**自检**：仅读 Layer 1 内容，能否回答"这个事件的本质是什么？来龙去脉是什么？接下来怎么看？"

---

## 9. 实现计划

### 9.1 阶段划分

| 阶段                                 | 内容                                                                                     | 工作量 | 依赖   |
| ------------------------------------ | ---------------------------------------------------------------------------------------- | ------ | ------ |
| **P1: 数据模型 + ReportSkill 基础**  | Prisma enum + 迁移 SQL + DTO 扩展 + ReportSkill 接口 + 4 个 Skill 定义                   | 1 天   | 无     |
| **P2: report-assembler 改造**        | 从硬编码结构改为 ReportSkill 驱动的动态组装，MACRO/TECH/COMPANY 向后兼容                 | 1 天   | P1     |
| **P3: 锚定文章服务**                 | EventSourceService（抓取+解析+实体提取+信源评估）                                        | 1 天   | P1     |
| **P4: Leader — 因果推理 + 框架选择** | EVENT 因果推理 prompt + 分析框架自动选择（Layer 2+3）+ `analytical-frameworks.config.ts` | 1 天   | P3     |
| **P5: 搜索 + 写作适配**              | 三层递进搜索 + 锚定证据注入 + analyticalQuestion + 框架视角注入                          | 1 天   | P4     |
| **P6: 交叉验证 + Red Team + WWNBT**  | 交叉验证 prompt + Red Team 对抗验证（Layer 4）+ WWNBT 情景推演（Layer 5）                | 1.5 天 | P5     |
| **P7: EVENT 报告合成**               | EventReportSkill 合成 prompt + 反共识/证伪/WWNBT 章节生成 + 分析局限声明                 | 1 天   | P2, P6 |
| **P8: 前端**                         | CreateTopicDialog EVENT 类型 + URL/粘贴输入 + TopicCard 图标                             | 0.5 天 | P1     |
| **P9: 测试 + 质量**                  | 单元测试 + ReportSkill 集成测试 + Red Team 质量验证 + 端到端                             | 2 天   | P7, P8 |

**总工作量：约 10 天**（较原方案 +3 天，新增 ReportSkill 架构 + Red Team + WWNBT）

### 9.2 文件变更清单

**新增文件**：

| 文件                                                      | 说明                                    |
| --------------------------------------------------------- | --------------------------------------- |
| `shared/report-template/skills/report-skill.interface.ts` | ReportSkill 接口定义                    |
| `shared/report-template/skills/report-skill.registry.ts`  | ReportSkill 注册表                      |
| `shared/report-template/skills/macro-report.skill.ts`     | MACRO 报告 Skill                        |
| `shared/report-template/skills/tech-report.skill.ts`      | TECHNOLOGY 报告 Skill                   |
| `shared/report-template/skills/company-report.skill.ts`   | COMPANY 报告 Skill                      |
| `shared/report-template/skills/event-report.skill.ts`     | EVENT 报告 Skill（含反共识+证伪+WWNBT） |
| `config/analytical-frameworks.config.ts`                  | 8 种事件类型的分析框架定义              |
| `services/event/event-source.service.ts`                  | 锚定文章抓取解析服务                    |
| `services/event/__tests__/event-source.service.spec.ts`   | 测试                                    |
| `prisma/migrations/YYYYMMDD_add_event_type/migration.sql` | 迁移                                    |

**修改文件**：

| 文件                                                     | 变更                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| `prisma/schema/models.prisma`                            | 新增 `EVENT` enum 值                                               |
| `dto/create-topic.dto.ts`                                | 新增 EVENT 类型的 `topicConfig` 校验                               |
| `config/dimension-templates.config.ts`                   | 新增 `EVENT_INSIGHT_REFERENCE_DIMENSIONS`（含 analyticalQuestion） |
| `prompts/research-leader.prompt.ts`                      | 新增 EVENT 因果推理 + 框架选择 + 维度规划 prompt                   |
| `prompts/report-synthesis.prompt.ts`                     | 从通用 prompt 改为根据 ReportSkill 动态注入类型专属指令            |
| `services/core/leader/leader-planning.service.ts`        | 注入锚定文章、因果推理、框架选择逻辑                               |
| `services/core/topic/topic-crud.service.ts`              | EVENT 创建时触发锚定文章解析                                       |
| `services/core/topic/topic-team-orchestrator.service.ts` | EVENT 编排逻辑（含交叉验证 + Red Team + WWNBT 三个新阶段）         |
| `services/dimension/dimension-mission.service.ts`        | 三层搜索策略路由 + 锚定证据注入 + analyticalQuestion 注入          |
| `services/dimension/section-writer.service.ts`           | analyticalQuestion + 因果假设 + 框架视角注入写作 prompt            |
| `shared/report-template/report-assembler.service.ts`     | ★ 从硬编码结构改为 ReportSkill 驱动的动态组装                      |
| `services/report/report-synthesis.service.ts`            | 根据 ReportSkill.synthesisPromptAddendum 追加类型专属合成指令      |
| `frontend/.../CreateTopicDialog.tsx`                     | EVENT 类型卡片 + URL/粘贴输入表单                                  |
| `frontend/.../TopicCard.tsx`                             | EVENT 类型图标和渐变色映射                                         |

### 9.3 不变的部分（复用）

以下模块**完全不需要修改**：

- 格式化管道（formatting-pipeline.ts）— ReportSkill 不影响格式化逻辑
- 图片管线（figure-extractor / figure-relevance）
- 报告导出（topic-export.service.ts）— 导出的是 fullReport markdown，与报告结构无关
- 前端详情页（TopicDetail / TopicResearchLayout）
- 前端报告展示（报告面板、证据面板、版本历史、导出）

> 注意：`report-assembler.service.ts` 从"不改"变为"需改"——引入 ReportSkill 驱动的动态组装。但改动是向后兼容的：MACRO/TECH/COMPANY 的 ReportSkill 完全复现当前硬编码结构。

---

## 10. 风险和注意事项

### 10.1 锚定文章质量

- **问题**：用户可能粘贴无关内容、营销软文、或低质量信息源
- **对策**：EventSourceService 解析阶段加入信源可信度评估 + 信息密度检测
- **降级**：质量过低时提示用户，但不阻止创建；Leader 因果推理质量自检

### 10.2 因果推理质量

- **问题**：LLM 因果推理可能过于笼统或存在逻辑跳跃
- **对策**：
  1. Prompt 中要求每个因果层次给出具体证据线索（不允许空泛判断）
  2. Leader 自检机制：如果因果假设无法指导具体的搜索方向，降级为标准模式
  3. 交叉验证阶段进一步修正

### 10.3 搜索词与锚定文章重复

- **问题**：Leader 生成的搜索词可能搜到锚定文章本身
- **对策**：在 enrichment 阶段通过 URL 去重自动排除；prompt 中明确要求搜索补充信息

### 10.4 锚定文章篇幅

- **问题**：文章可能很长（10000+ 字符），注入 prompt 会占用大量 token
- **对策**：限制注入长度（5000 字符），超长内容使用 LLM 摘要后注入

### 10.5 事件时效性

- **问题**：事件洞察的时效性要求高，搜索结果需要最新
- **对策**：
  1. 事实层搜索限定 7 天时间窗口
  2. 影响层搜索限定 30 天时间窗口
  3. enrichment 阶段按发布日期排序，优先最新

### 10.6 交叉验证增加延迟

- **问题**：交叉验证步骤增加约 15-30 秒延迟
- **对策**：交叉验证与报告格式化可部分并行；用户可在设置中关闭交叉验证（高级选项）

---

## 11. 未来扩展

### 11.1 多篇锚定文章支持（V2）

数据模型已预留 `sourceUrls` 和 `additionalContext` 字段。

V2 扩展：

- 输入多个链接（最多 5 条），同一事件的不同信源
- 多篇文章交叉验证事实一致性
- 多视角覆盖（中英文媒体、行业媒体 vs 大众媒体）

### 11.2 事件追踪模式（V2）

EVENT 类型可以设置 `refreshFrequency: DAILY`，持续追踪事件发展。
每次刷新时：

- 重新搜索最新进展
- 增量更新报告（标注"新增信息"）
- 对比上一版本的预判是否准确（预测回溯机制，对标 Deloitte TMT Predictions）
- 自动更新时间线

### 11.3 事件关联网络（V2）

多个 EVENT 类型的 Topic 可以通过关键实体（企业、人物、技术）关联：

- 自动发现相关事件
- 生成跨事件因果链分析报告
- 可视化事件关联图谱

### 11.4 一键事件洞察（V2）

从 AI Ask（智能问答）模块，用户提问关于某个新闻时，
提供"深度分析"按钮，一键创建 EVENT 类型 Topic。

### 11.5 前端时间线可视化（V2）

将 Markdown 表格形式的时间线升级为交互式可视化组件：

- 可缩放的时间轴
- 按因果类别（远因/近因/导火索/事件/反应/后续）着色
- 点击事件节点展开详情和证据来源

---

**最后更新**: 2026-03-13
**版本**: 3.0

### 版本历史

| 版本 | 日期       | 变更                                                                          |
| ---- | ---------- | ----------------------------------------------------------------------------- |
| 1.0  | 2026-03-12 | 初始方案：EVENT 类型基础设计                                                  |
| 2.0  | 2026-03-13 | 五层分析引擎（因果层+框架层+对抗层+预测层）、证据分级、信息新颖度检测         |
| 3.0  | 2026-03-13 | ReportSkill 架构（差异化报告模板）、Red Team/WWNBT 阶段实现设计、数据模型扩展 |
