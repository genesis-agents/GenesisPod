# Agent-Playground 根本重设 — Design v1

> **状态**：draft（待 5 路集体审视，新增 product-e2e 路）
> **作者**：2026-05-07
> **触发**：mission `c195035f` 用户视角 broken（重跑显示"未知错误"实际 completed / lengthProfile=standard 8K 总量但用户期望深度洞察 / withFigures=true 但 figures.length=0 / word_count 字段虚标 1428 占位 / rerun 重建丢图）。前两轮 4 路评审（rerun-overhaul + layer 6）spec 共识 4/4 YES，但**没人在 prod 真跑过完整 mission**。
> **范围**：根本架构重设，**非打补丁**。不可分批（核心决策互相依赖）。
> **目标读者**：5 路集体审视 — architect / security / reviewer / tester / **product-e2e（新增）**

---

## 1. 数据驱动事实（mission c195035f）

| 维度                      | 用户期望                    | 系统实际                                           | 真因                                                                        |
| ------------------------- | --------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------- |
| 报告字数                  | 深度洞察、章节 1W+ 字       | 30 章 × 700-830 字 = 21K 真字符（中文 unicode 计） | lengthProfile=standard 默认 8K 总量；用户没意识到这个轴                     |
| word_count UI 显示        | 真字数                      | 全章节 1428（LLM 编的占位）                        | LLM 输出的 wordCount 字段被信任直写 DB                                      |
| 配图                      | withFigures=true → 章节有图 | figures.length=0（30 章节全无图）                  | researcher 抽图是软 prompt，LLM 不听就 0 图；S8 figures=0 只 warning 软通过 |
| 重跑成功                  | UI 显示成功                 | UI "未知错误"，DB status=completed                 | LivenessGuard wall-time 用 startedAt 误杀（已修 commit 4f6e62114）          |
| 重跑保留图                | 重跑后图还在                | mission warnings: "rerun_recovered，figures 缺失"  | chapter_drafts 表无 figures 字段，S11 重建从 drafts 取拿不到图              |
| 重跑改 lengthProfile 生效 | 重跑选 mega 拿更长报告      | rerun 表单改了不生效（用旧 user_profile 重建）     | ctx-hydrator 不消费 rerun input 里的新 lengthProfile                        |

**6 个用户视角痛点 = 6 个决策层错误**（非独立 bug）。

---

## 2. 6 个核心架构决策

### D1：单一 `reportScale` 轴 + 高级覆盖（弃多轴 cross-product）

**现状**：depth(3) × lengthProfile(6) × budgetProfile × styleProfile × audienceProfile × auditLayers × concurrency × withFigures × ... ≥ 10 个独立轴。用户认知是单一"我要多深"，但前端必须 cross-product 选完。

**目标态**：

```typescript
type ReportScale =
  | "quick"
  | "standard"
  | "deep"
  | "professional"
  | "publication"
  | "encyclopedia";

const SCALE_PRESETS: Record<ReportScale, ScalePreset> = {
  quick: {
    dim: 3,
    chPerDim: 2,
    wordsPerCh: [800, 1200],
    figPerCh: 0,
    model: "fast",
    maxCredits: 0.5,
  },
  standard: {
    dim: 5,
    chPerDim: 3,
    wordsPerCh: [1500, 2500],
    figPerCh: 1,
    model: "balanced",
    maxCredits: 2,
  },
  deep: {
    dim: 10,
    chPerDim: 4,
    wordsPerCh: [3000, 5000],
    figPerCh: 2,
    model: "balanced",
    maxCredits: 8,
  },
  professional: {
    dim: 15,
    chPerDim: 5,
    wordsPerCh: [5000, 8000],
    figPerCh: 3,
    model: "premium",
    maxCredits: 25,
  },
  publication: {
    dim: 20,
    chPerDim: 6,
    wordsPerCh: [8000, 12000],
    figPerCh: 4,
    model: "premium",
    maxCredits: 80,
  },
  encyclopedia: {
    dim: 30,
    chPerDim: 8,
    wordsPerCh: [12000, 20000],
    figPerCh: 5,
    model: "max-output",
    maxCredits: 250,
  },
};
```

**前端 UI**：单选 6 档卡片，每档展示"维度数 × 章数 × 章字数 × 图数 × 预算"摘要。**高级覆盖面板**（折叠）让 power user 单独覆盖任一子参数。

**联动**：

- LLM 模型选型（fast/balanced/premium/max-output 自动按 reportScale 决）
- maxTokens（按 max(wordsPerCh) × 2 算）
- wallTimeCap（按 dim × chPerDim × 估时算）
- reviewer 评分阈值（高档要求高字数 + 高图数）

**保留兼容**：DB user_profile 同时存 `reportScale` + 解构后的 `dimensionsCount/chaptersPerDim/...`，老 mission 读 lengthProfile/depth 反向推 reportScale。

### D2：派生统计后端真值（弃信任 LLM 输出）

**现状**：`chapter_drafts.word_count = LLM 输出 wordCount`（c195035f 全 1428）；`reportArtifact.figures = LLM 列举的 figureCandidates`；`citations` 同。

**目标态**：

```typescript
// 写入前 backend 重算
const wordCount = countCJKWords(content); // [...content].length 不含空白
const figureCount = figures.length; // 真 array 长度
const citationCount = uniqueBy(citations, "url").length;
const score =
  ruleBasedScore(content, figures, citations) * 0.5 + llmScore * 0.5; // LLM 评分仅 50% 权重
```

**禁止**：UI / DB 任何用户可见统计字段直接来自 LLM。LLM 只负责 raw content。

**实施点**：

- `chapter-writer.agent.ts` Output schema 删 `wordCount` 字段（或保留但写入前覆盖）
- `per-dim-pipeline.util.ts` 写 chapter_drafts 前 `chapter.wordCount = countCJKWords(chapter.content)`
- `report-artifact-assembler.ts` 装配时同样重算 figures.length / citations.length
- 前端 `ArtifactReader.tsx` 不再读 LLM 字段，读 backend 真值

### D3：表 schema 重构（中间产物 vs 最终产物分离）

**现状**：`agent_playground_chapter_drafts` 既是 writer 中间产物又是 rerun 重建源。无 `figures` / `citations` 字段。15 行 schema 字段都给了 writer 中间态。

**目标态**：

```sql
-- 最终态（rerun 重建源）
CREATE TABLE agent_playground_chapters (
  id UUID PRIMARY KEY,
  mission_id UUID REFERENCES missions(id) ON DELETE CASCADE,
  dimension TEXT NOT NULL,
  chapter_index INT NOT NULL,
  heading TEXT NOT NULL,
  thesis TEXT,
  content TEXT NOT NULL,
  word_count INT NOT NULL,           -- backend 真值
  status TEXT NOT NULL,
  score INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  UNIQUE (mission_id, dimension, chapter_index)
);

-- 章节图独立表（D6 figure-curator stage 写）
CREATE TABLE agent_playground_chapter_figures (
  id UUID PRIMARY KEY,
  chapter_id UUID REFERENCES agent_playground_chapters(id) ON DELETE CASCADE,
  source_url TEXT,                   -- 抽图来源（null = AI 生成）
  image_url TEXT NOT NULL,           -- 终态 CDN URL
  caption TEXT NOT NULL,
  alt_text TEXT,
  width INT, height INT,
  source_type TEXT NOT NULL,         -- "scraped" | "ai-generated" | "user-uploaded"
  ai_generation_prompt TEXT,         -- AI 生成时记录 prompt
  created_at TIMESTAMPTZ DEFAULT NOW(),
  position_in_chapter INT NOT NULL   -- 章节内序号
);

-- 引用独立表
CREATE TABLE agent_playground_chapter_citations (
  id UUID PRIMARY KEY,
  chapter_id UUID REFERENCES agent_playground_chapters(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  source_title TEXT,
  citation_text TEXT NOT NULL,
  cited_paragraph_index INT,         -- 章节内段落定位
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- chapter_drafts 降级为 audit / 历史 attempts
ALTER TABLE agent_playground_chapter_drafts RENAME TO agent_playground_chapter_attempts;
ALTER TABLE agent_playground_chapter_attempts ADD COLUMN attempt_no INT NOT NULL DEFAULT 1;
ALTER TABLE agent_playground_chapter_attempts ADD COLUMN published_chapter_id UUID;  -- 关联到 chapters 表
-- 不再 unique (mission_id, dimension, chapter_index)，允许多 attempt
```

**rerun 重建源**：`SELECT * FROM agent_playground_chapters JOIN chapter_figures JOIN chapter_citations`（不再从 drafts 重建）。

**migration 策略**：

1. 新表创建（CREATE TABLE，不破坏现有）
2. 历史 mission 数据迁移 SQL（chapter_drafts 最新 attempt → chapters；report_full.figures 拆分到 chapter_figures）
3. dual-write 期（新 mission 同时写新旧表）2 周
4. 切读源到新表
5. drop 旧表 unique 约束 + 重命名

### D4：用户硬合约执行（弃 quality.warning 软通过）

**现状**：用户在创建表单选 `withFigures=true`，但 `figures.length=0` 时只 push 一条 quality.warnings，mission 仍 markCompleted。

**目标态**：用户表单选项 = **硬合约**，不达标 mission 不能 markCompleted。

**硬合约清单**：

| 用户选项                              | 硬合约                             | 不达标行为                                                      |
| ------------------------------------- | ---------------------------------- | --------------------------------------------------------------- |
| `reportScale.figPerCh ≥ N`            | 每章 figures.length ≥ N            | retry figure-curator 3 次 → AI 生成兜底 → 仍 0 → mission fail   |
| `reportScale.wordsPerCh = [min, max]` | 章节字数 ∈ [min × 0.7, max × 1.5]  | 不足 → 强制 chapter-writer revise；超出 → reviewer 截断或拆章节 |
| `reportScale.dim`                     | dimensionsCount === scale.dim ± 1  | leader 加/删 dim 至匹配                                         |
| `reportScale.chPerDim`                | 每 dim chapters === scale.chPerDim | outline-planner 强制规划                                        |
| `withCitations=true`                  | 每章 citations.length ≥ 1          | retry researcher → fail                                         |

**实施点**：

- `mission-runtime-shell.ts` markCompleted 前跑 `assertHardContract(mission, scale)`
- 不达标 → 返 `incomplete-contract` 失败码 + 自动 enqueue 对应 stage retry
- 用户视角：mission 看到的"完成"始终满足合约

### D5：rerun 按用户意图分类（弃 stage-based 命名）

**现状**：3 个 endpoint（full-rerun / task-rerun / local-rerun），3 处独立判定（已修），但**用户语义不分**：S11 持久化 / S8 重写 / 整 mission 重跑都叫"重跑"。

**目标态**：前端按用户意图，后端编排 stage 子集。

```typescript
type RerunIntent =
  | "extend-length"      // 换更长档（升级 reportScale）
  | "add-figures"        // 补图（withFigures false→true，或图不够）
  | "revise-chapter"     // 修订某章（content 不满意）
  | "extend-research"    // 补充新 dim（leader 加 dim）
  | "fresh-research"     // 全新研究（同 topic + 新参数）
  | "publish-only";      // 持久化（已有产物落库，原 S11）

// 每意图后端编排
const INTENT_STAGES: Record<RerunIntent, StageId[]> = {
  "extend-length":     ["s7-outline", "s8-writer", "s9-review", "s10-leader-signoff", "s11-persist"],
  "add-figures":       ["s3.5-figure-curator", "s11-persist"],
  "revise-chapter":    ["s8-writer-single-chapter", "s9-review", "s11-persist"],
  "extend-research":   ["s2-leader-add-dim", "s3-research-new-dim", "s7-outline-update", "s8-writer-new-dim", ...],
  "fresh-research":    ["s2-s11 全跑"],
  "publish-only":      ["s11-persist"],
};
```

**前端 UI**：mission 详情页"重跑"按钮变成 5 个意图卡片：

- 📏 报告太短 → 换更长档
- 🖼️ 想加图 → 补图
- ✏️ 这章不满意 → 修订（点章节卡片右上角）
- ➕ 想加新维度 → 扩展研究
- 🔄 重新研究 → 全新跑

**rerun 表单升级**：选意图后展开对应参数（"换更长档"→ reportScale 6 档；"修订某章"→ 章节选择器 + 修订指引）。

### D6：图文匹配独立 stage（弃 researcher 副产物）

**现状**：抽图是 `researcher.agent` prompt 软约束（"必须 1 轮 web-scraper extractImages"），LLM 不听就 0 图。

**目标态**：

```
S3 researcher 完成 dim findings → S3.5 figure-curator stage 触发（前提：scale.figPerCh > 0）
  ├── Step 1：从 findings.sources URL 调 web-scraper extractImages（保留现有能力）
  ├── Step 2：from chapter heading + thesis 调 image search API（Bing / Google Image）
  ├── Step 3（兜底）：AI 生成图（DALL-E 3 / SD-XL，水印 "AI 生成"）
  └── 硬阈值：每章 figures ≥ scale.figPerCh，不达标 retry 3 次后 mission fail
```

**Stage 顺序**：S3 → S3.5 (figure-curator) → S4 (leader-assess) → S5+ ...

**figure-curator agent**：

- 输入：dimension + research findings + chapter outline (heading/thesis)
- 输出：`{ figures: ChapterFigure[] }`（每图 sourceUrl/imageUrl/caption/altText/sourceType）
- 写入：`chapter_figures` 表

**AI 生成兜底**：

- 默认 disabled（成本敏感）
- 用户开启 `aiGenerateFiguresFallback=true` 时启用
- prompt 由 chapter heading + thesis + style 构造
- 必标 watermark "AI generated illustration"

---

## 3. 端到端验证策略（防 4 路 spec 评审再漏 prod）

**触发原因**：上 2 轮 design 4 路评审 spec 共识 9/9/9/8.5 全 YES，但**没人在 prod 跑过**完整 mission。

**新机制**：第 5 路评审 — `product-e2e`（新增）

```
设计阶段：product-e2e 路检查
  - design 列出的"用户期望"是否每条都有 e2e spec 锚点？
  - 端到端真实场景（含 LLM 调用）能否在 staging 跑通？
  - 失败模式（LLM 不听 prompt / 网络抖 / 模型 maxToken 超）有 fallback 路径？

实施阶段：product-e2e 路检查
  - PR push 前必须有 staging 真跑录屏（mission 创建 → 完成 → 重跑 → 报告查看）
  - 不允许"spec 全绿就 push"

合并到 main 前：product-e2e 路 sign off
  - 在生产环境跑一个 mission，按用户视角验证 design 列出的硬合约逐条
```

**实施手段**：

- 加 `e2e-smoke.sh` 脚本：自动跑 mission + 抓 events + 验证硬合约
- CI 跑 staging 冒烟（用 OPENAI_API_KEY_TEST，预算 $0.5/run）
- design + 实施评审都加这一路

**评审 5 路全部 YES 才能 push**：4/4 → 5/5。

---

## 4. PR 拆分（不可分批的部分 vs 可以并行的部分）

### 不可分批（必须同 PR / 互相依赖）

**PR-1（DB schema + 实体新表）**：

- agent_playground_chapters / chapter_figures / chapter_citations 三表 CREATE
- chapter_drafts → chapter_attempts 重命名 + attempt_no
- 历史数据迁移 SQL（不在事务内，分开跑）
- ★ 此 PR 只动 schema 不改业务代码，回退安全

### 互相依赖串联

**PR-2（D2 派生数据后端真值）**：

- chapter-writer Output 删 wordCount 信任
- per-dim-pipeline 写入前 backend 重算
- report-artifact-assembler 同
- 写入到 chapter_drafts（旧表，dual-write 期）

**PR-3（D3 写新表 + dual-write）**：

- per-dim-pipeline 同时写 chapters + chapter_drafts (变 attempts)
- report-artifact-assembler 装配从 chapters 读
- rerun ctx-hydrator dual-source（先新表，fallback 旧表）

**PR-4（D1 reportScale + 联动）**：

- 后端 SCALE_PRESETS 常量
- DTO + zod schema 加 reportScale 字段
- 老 lengthProfile/depth 反推 reportScale
- per-dim-pipeline / chapter-writer / outline-planner / leader 全用 scale 派生参数

**PR-5（D6 figure-curator stage）**：

- 新建 figure-curator.agent.ts
- 注册到 PLAYGROUND_PIPELINE 在 S3 后插入 S3.5
- 写入 chapter_figures 表（依赖 PR-1 schema）
- AI 生成兜底（feature flag 默认 OFF）

**PR-6（D4 硬合约）**：

- mission-runtime-shell.ts 加 assertHardContract
- markCompleted 前调
- 失败 → enqueue retry stage

**PR-7（D5 rerun 意图路由）**：

- 后端 RerunIntent 枚举 + INTENT_STAGES 映射
- 前端 mission 详情页重跑按钮分裂为 5 意图卡
- ctx-hydrator 接受 rerun input.scaleOverride 覆盖 user_profile

**PR-8（前端创建表单重设）**：

- DemoLauncher 改为 reportScale 6 卡片单选
- 高级覆盖面板（折叠）
- 老 lengthProfile/depth 字段保留但隐藏（向后兼容）

**PR-9（e2e 冒烟脚本 + CI 集成）**：

- e2e-smoke.sh 跑 staging mission + 验证硬合约
- pre-push hook 跑 e2e（可选 / 用户触发）
- product-e2e 评审第 5 路 sub-agent 模板

### 可并行（不阻塞主线）

**PR-A（前端 UI 文案 + 高级覆盖 UX）**
**PR-B（监控仪表盘新指标：硬合约通过率 / e2e 冒烟成功率）**

### PR 顺序硬门控

```
PR-1 (schema)
  ├─ PR-2 (D2 派生真值，可独立)
  ├─ PR-3 (D3 dual-write，依赖 PR-1)
  │    └─ PR-4 (D1 reportScale，依赖 PR-3 写新表)
  │         └─ PR-5 (D6 figure-curator，依赖 PR-4 scale.figPerCh + PR-3 chapter_figures)
  │              └─ PR-6 (D4 硬合约，依赖 PR-5 figure-curator + PR-4 scale)
  │                   └─ PR-7 (D5 rerun 意图，依赖 PR-6 硬合约)
  │                        └─ PR-8 (前端创建表单，依赖 PR-7 rerun + PR-4 scale)
  └─ PR-9 (e2e 冒烟，依赖 PR-1~8 全 merged)
```

总 9 PR + 2 并行。

---

## 5. 工作量真实评估

| 阶段                   | 工作量           | 备注                                                        |
| ---------------------- | ---------------- | ----------------------------------------------------------- |
| PR-1 schema migration  | 0.5 d            | 新表 CREATE + 老表迁移 SQL                                  |
| PR-2 D2 派生真值       | 0.5 d            | wordCount/figureCount 重算逻辑                              |
| PR-3 D3 dual-write     | 1 d              | chapter_drafts 改写为 attempts + chapters 新表写入          |
| PR-4 D1 reportScale    | 1.5 d            | 后端常量 + 全栈联动 + 老字段反推                            |
| PR-5 D6 figure-curator | 2 d              | 新 stage / agent / web-scraper / image-search / AI 生成兜底 |
| PR-6 D4 硬合约         | 1 d              | assertHardContract + retry enqueue                          |
| PR-7 D5 rerun 意图     | 1.5 d            | 后端意图路由 + 前端 5 卡 + ctx-hydrator 接受 override       |
| PR-8 前端创建表单      | 1 d              | reportScale 卡片 + 高级覆盖 UX                              |
| PR-9 e2e 冒烟          | 0.5 d            | 脚本 + CI 集成 + product-e2e sub-agent                      |
| 5 路评审迭代 buffer    | 1 d              | design 路 R1+R2 / 每 PR 实施路 5 路                         |
| **合计**               | **10-11 工作日** | 1 个 senior 工程师 2 周                                     |

---

## 6. 风险与缓解

| 风险                                                                      | 缓解                                                                                                                     |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **R1 schema migration 影响 prod 现存 mission**                            | dual-write 期 2 周；新写都到新表；老 mission 数据迁移脚本独立跑（不在 PR-1）；回退路径：drop 新表 + 关闭 dual-write flag |
| **R2 reportScale.encyclopedia 1.5M 字 + 150 图 LLM 单 mission $50+ 烧钱** | maxCredits 硬上限按 scale 自动算；budget guard 已有；前端创建表单显示估算成本                                            |
| **R3 figure-curator AI 生成兜底成本**                                     | 默认 OFF；用户显式开启；DALL-E 3 $0.04/图，150 图 $6 上限                                                                |
| **R4 LLM 不听 prompt 抽图（D6 现 prod 真因）**                            | figure-curator 走规则 / image-search API 不依赖 LLM；AI 生成兜底跳过 LLM 创意决策                                        |
| **R5 5 路评审 product-e2e 路 staging 真跑成本**                           | 用 OPENAI_API_KEY_TEST + 限 quick scale；每次 $0.1；CI 只在 main PR 跑                                                   |
| **R6 老 lengthProfile/depth 反推 reportScale 不准**                       | 给查不到时默认 standard + warn；老 mission rerun 时强制让用户选 reportScale                                              |
| **R7 D5 rerun 意图 5 卡片用户认知成本**                                   | 前端文案对应"用户场景"（"报告太短" 而非 "extend-length"）；hover tooltip 给场景示例                                      |
| **R8 D4 硬合约让现有 LLM 永远过不去（写不到 N 字）**                      | 模型选型联动（高 scale 自动切 max-output 模型）；retry 上限后给降级方案（"已达极限，可降档继续 / 用户确认"）             |

---

## 7. 反向证据 spec（每决策 ≥ 2 条）

**D1 reportScale**：

- RV-1：选 reportScale=encyclopedia 创建 mission → user_profile.dimensionsCount=30 / chaptersPerDim=8
- RV-2：老 mission（lengthProfile=standard depth=deep）reopen → reportScale 反推 = standard

**D2 派生真值**：

- RV-3：LLM 输出 wordCount=1428 但 content 真字符 700 → DB 写入 word_count=700
- RV-4：figures.length 显示 = backend 真 array 长度，不读 LLM 报的 figureCount

**D3 schema**：

- RV-5：mission rerun 重建从 chapters + chapter_figures 取，drafts 表 0 调用
- RV-6：chapter_drafts 改名 chapter_attempts 后 unique 约束去掉，同 mission/dim/idx 可多 attempts

**D4 硬合约**：

- RV-7：withFigures=true + figures.length=0 → mission 不能 markCompleted，自动 retry figure-curator 3 次
- RV-8：scale.encyclopedia + 章节 wordCount=500 → 强制 chapter-writer revise，不能直接 markCompleted

**D5 rerun 意图**：

- RV-9：用户点 "extend-length" + scale=mega → ctx-hydrator 用新 scale 而非旧 user_profile
- RV-10：用户点 "add-figures" → 只跑 figure-curator + s11，不重跑 writer

**D6 figure-curator**：

- RV-11：researcher findings.sources 抽不到合规图 → image-search API 兜底
- RV-12：image-search 0 命中 + aiGenerateFiguresFallback=true → DALL-E 生成 + 水印

**端到端 e2e**：

- RV-13：staging 跑 mission(scale=deep, withFigures=true, withCitations=true) → 完成后 chapters.length=40 / 每章 ≥2 图 / 每章 ≥1 引用 / word_count 真值 / 重跑改 scale 生效
- RV-14：staging 故意让 LLM 不听抽图 prompt（mock）→ figure-curator AI 生成兜底触发 → 仍达硬合约

---

## 8. 落地约束

1. **5 路评审必须 5/5 YES** 才进 PR-1；新增 product-e2e 路检查"design 列的用户期望逐条有 e2e 锚点"
2. **每 PR 5 路评审实施层 R1**（含 product-e2e 跑 staging 冒烟）
3. **PR-1~9 顺序门控**（GitHub branch protection rule，依赖 PR# label）
4. **dual-write 期 2 周**，第 8/9 PR 后切读源到新表
5. **mission `c195035f` 用户视角真实跑通**（重跑选 mega → 拿到长报告 + 图保留 + 字数真值）= 整个 overhaul 验收锚点

---

## 9. 不做的（Out of Scope）

- 真实图片版权 / DMCA 处理（抽网图法律风险，标注来源即可）
- 多语言图片搜索（中文 image-search API 与英文行为差异）
- mission 数据归档 / cold storage（chapters 表无限增长）
- 跨 pod 分布式 mission 调度（单 pod 已够，本次不动）
- frontend 完整重写（只动创建表单 + rerun 表单 + 重跑按钮）

---

## 10. 关联

- 触发 mission：`c195035f-d6fd-4dae-a9a0-d5176048e4e6`
- 前置 commits：
  - `b68ccea29` rerun-overhaul（in-flight 单点判定）
  - `4f6e62114` LivenessGuard wall-time effectiveStart
  - `7db2b3e17` layer 6 真兜底
- 关联 memory：
  - `feedback_consensus_must_iterate_to_all_yes` — 但本次必须 5/5（含 e2e 路）
  - `feedback_no_dual_sources` — D2/D3 同源约束
  - `feedback_destructive_op_must_have_rollback` — schema migration 回退路径
  - `project_rerun_overhaul_2026_05_07` — 上一轮 overhaul 教训"4 路 spec 共识漏 prod"
  - `feedback_e2e_must_visit_ui` — 已有，本次 product-e2e 路是它的执行机制化

---

## 11. 元教训（写给未来的自己）

**为什么这次 overhaul 必须不打补丁**：

- 上 2 轮 4 路 spec 共识全 YES，但 prod c195035f 仍用户视角 broken 6 处
- 4 路是"代码内自洽"评审，不是"产品能用"评审
- 修补一个症状会暴露下一个（lengthProfile 修了 → 字数仍假 → 修了 → 图缺仍 warn 软通过 → 修了 → rerun 重建仍丢图）
- 唯一终止方法：架构层把"用户期望"和"系统实际"映射打通（D1-D6）

**新增 product-e2e 路是结构性补丁**，不是单次评审增项。
