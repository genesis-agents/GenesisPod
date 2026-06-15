# AI 工具系统梳理 + 治理改造方案

> 状态:**P0 止血 + P1-1(乙)已执行**(分支 `fix/tools-disable-stub-tools`);其余 P1/P2 待确认
> 日期:2026-06-14
> 范围:`ai-engine/tools/` 全部内置工具 + `ai-app` 动态注册工具 + `ai-harness/memory` 工具
> 方法:逐文件 Read `execute()/doExecute()` 实现核实,非凭命名推断

---

## 0. 结论摘要

- **总量**:76 个工具(72 engine 内置 + 2 ai-app + 2 harness)。`TOTAL_TOOL_COUNT` 源码核实为 72(此前文档"46"为陈旧值)。
- **真实度**:REAL 59 / PARTIAL 11 / STUB 6。约 78% 真接数据源,基础盘扎实。
- **最大风险**:不是"没实现",而是 **3 个工具静默返回假数据**(agent 以为成功)——`github-integration`、`calendar-integration`、`workflow-orchestration`。这比直接抛错更危险。
- **结构问题**:① agent 实走的 `ToolInvoker` 绕过 engine `ToolPipeline` 五件套中间件(双路径割裂);② `information` 类过载(27/72);③ 命名不统一(ontology 用点号);④ OpenAPI 适配器声明存在实则缺失;⑤ lazy schema 半成品。
- **设计层**:`ITool` 接口成熟(sideEffect / entitlement ACL / maxResultSizeChars / compact summary / token 估算),对标业界一流。问题集中在"实现完成度"和"装配一致性",不在抽象设计。

---

## 0.5 已执行(P0 止血 · 2026-06-14)

> 分支 `fix/tools-disable-stub-tools`。验证:type-check 0 error · 新 spec 通过 · `verify:arch` 473/473 · 工具单测 1826/1826。

- 给 `ITool` 新增机器可读 `maturity?: "real"|"partial"|"stub"` 字段(默认 real)。
- **禁用 6 个**(`enabled=false`+`maturity="stub"`,退出 agent catalog):`video-generation`、`container-executor`、`github-integration`、`calendar-integration`、`task-delegation`、`workflow-orchestration`。
- **标注 partial 保留 2 个**(内存态但结果不伪造):`user-preferences`、`consensus-mechanism`。
- 新增守护 `tools/__tests__/tool-maturity-guard.spec.ts`:静态扫描断言"`maturity=stub` 必 `enabled=false`",防回潮。
- 注:catalog 构建(`getEnabled`/`listByCategory`/`getFunctionDefinitions`)均过滤 `enabled!==false`,故禁用工具不再被 agent 召回;`ToolInvoker.invoke` 暂未对 enabled 做二次拦截(已记为 P1 加固项,见 §3)。

**P1-1(乙)已执行** — agent 工具路径补真超时 + input 校验(commit 见分支):

- `tool-invoker.ts`:派生 `AbortController` + `Promise.race`,超时即 abort 派生 signal 并返回 `TOOL_TIMEOUT`(此前仅透传 `context.timeout` 不掐断);`execute` 前跑 `tool.validateInput`,失败返回 `TOOL_INPUT_VALIDATION_FAILED` 不调 execute;`finally` 清理定时器/监听。
- 新增 7 测试(超时/abort/defaultTimeout 回落/校验/向后兼容)。验证:ToolInvoker 37 + loop 225 测试全过,type-check 0 err。
- 未做(剩余 P1-1):甲/丙 的全量双路径合并(把 engine ToolPipeline 的限流/权限中间件也接进 agent 路径)仍待评估。

---

## 1. 现状台账(76 工具 · 实读核实)

图例:✅ REAL=真调 service/HTTP/Prisma/Redis · ⚠️ PARTIAL=部分实现/有 fallback 假数据/委托/易失内存 · ❌ STUB=静默假数据或 throw 未实现

### 1.1 Information(信息获取,27 REAL / 5 PARTIAL)

| 工具 id                | 子域      | 状态 | 数据来源                                        |
| ---------------------- | --------- | ---- | ----------------------------------------------- |
| web-search             | web       | ✅   | SearchService(Tavily/Serper 等)                 |
| web-scraper            | web       | ✅   | SearchService.fetchUrlContent(HTTP)             |
| data-fetch             | web       | ✅   | Prisma(resource/topic 表)                       |
| rag-search             | knowledge | ✅   | RAGPipelineService(向量+RRF+Cohere rerank)      |
| database-query         | knowledge | ✅   | Prisma `$queryRawUnsafe`                        |
| arxiv-search           | academic  | ✅   | OpenAlex/arXiv API                              |
| semantic-scholar       | academic  | ✅   | semanticscholar.org API(429 重试)               |
| openalex-search        | academic  | ✅   | OpenAlex API(双通道鉴权+退避)                   |
| pubmed                 | academic  | ✅   | NCBI esearch/esummary                           |
| hackernews-search      | community | ✅   | Algolia HN API                                  |
| github-search          | community | ✅   | GitHub REST API                                 |
| finance-api            | data      | ✅   | Alpha Vantage API                               |
| weather-api            | data      | ✅   | OpenWeatherMap API                              |
| sec-edgar-search       | data      | ✅   | SEC 公共 API(节流)                              |
| startuphub-startup     | data      | ✅   | StartupHub.ai API                               |
| federal-register       | policy    | ✅   | FederalRegister.gov API                         |
| congress-gov           | policy    | ✅   | Congress.gov v3 API                             |
| bing-image-search      | image     | ✅   | Bing Image API v7                               |
| google-image-search    | image     | ✅   | Google CSE API                                  |
| serpapi-image-search   | image     | ✅   | SerpAPI                                         |
| image-search           | image     | ✅   | 多引擎聚合(递归调上述三者)                      |
| ontology.upsertObject  | knowledge | ✅   | OntologyService(**写操作**)                     |
| ontology.addLink       | knowledge | ✅   | OntologyService(**写操作**)                     |
| ontology.setConfidence | knowledge | ✅   | OntologyService(**写操作**)                     |
| ontology.editProperty  | knowledge | ✅   | OntologyService(**写操作**)                     |
| ontology.mergeObjects  | knowledge | ✅   | OntologyService(**写操作**)                     |
| job-search             | jobs      | ✅   | 委托 web-search + site 过滤                     |
| wiki-page-read         | knowledge | ⚠️   | 可选 KB_QUERY_AUGMENTOR,未绑定返回空            |
| wiki-search            | knowledge | ⚠️   | 同上,未绑定返回空                               |
| social-x-search        | social    | ⚠️   | 委托 web-search(无 X 官方 API)                  |
| youtube-search         | video     | ⚠️   | 委托 web-search(无 YouTube Data API)            |
| whitehouse-news        | policy    | ⚠️   | 抓 whitehouse.gov + Federal Register 兜底       |
| industry-report-search | industry  | ⚠️   | web-search+Prisma,credibility 有硬编码 fallback |

### 1.2 Generation(生成,4 REAL / 1 PARTIAL / 1 STUB)

| 工具 id           | 状态 | 数据来源 / 问题                                   |
| ----------------- | ---- | ------------------------------------------------- |
| text-generation   | ✅   | AiChatService(LLM)                                |
| code-generation   | ✅   | AiChatService(LLM)                                |
| audio-generation  | ✅   | TtsService(BYOK)                                  |
| structured-output | ✅   | AiChatService(JSON)                               |
| image-generation  | ⚠️   | imageService 流式;依赖 AiImageModule 未加载则报错 |
| video-generation  | ❌   | `throw "not yet implemented"`                     |

### 1.3 Processing(处理,7 REAL)

| 工具 id         | 状态 | 数据来源                              |
| --------------- | ---- | ------------------------------------- |
| data-analysis   | ✅   | AiChatService(LLM)                    |
| data-validation | ✅   | AJV + 自定义规则引擎                  |
| data-cleaning   | ✅   | 内存算法(去重/缺失值/标准化)          |
| file-parser     | ✅   | pdf-parse/mammoth/exceljs/jszip       |
| file-conversion | ✅   | ExportOrchestratorService + Puppeteer |
| document-diff   | ✅   | diff 库                               |
| template-render | ✅   | Handlebars + 自定义 helper            |

### 1.4 Execution(执行,2 REAL / 1 STUB)

| 工具 id                              | 状态 | 数据来源 / 问题                           |
| ------------------------------------ | ---- | ----------------------------------------- |
| sql-executor                         | ✅   | Prisma `$queryRawUnsafe`(含安全检查)      |
| ocr-recognition                      | ✅   | Tesseract.js                              |
| container-executor                   | ❌   | `throw NotImplementedError`(附伪代码注释) |
| ~~python/javascript/shell-executor~~ | 🔒   | 已主动禁用(RCE,未注册)                    |

### 1.5 Integration(集成,6 REAL / 1 PARTIAL / 2 STUB)

| 工具 id                  | 状态 | 数据来源 / 问题                        |
| ------------------------ | ---- | -------------------------------------- |
| email-sender             | ✅   | nodemailer + SMTP                      |
| message-push             | ✅   | Slack/Discord/SMTP/Webhook/飞书        |
| cloud-storage            | ✅   | AWS S3 / MinIO                         |
| webhook-trigger          | ✅   | axios HTTP                             |
| wechat-mp-publish        | ✅   | SocialPublishPort → ai-app/social      |
| xhs-publish              | ✅   | SocialPublishPort → ai-app/social      |
| social-publish-status    | ⚠️   | 依赖 port 注入,未注入返回错误          |
| **github-integration**   | ❌   | **静默返回随机假数据,无真实 API 调用** |
| **calendar-integration** | ❌   | **`setTimeout` 模拟 + 硬编码样例数据** |

### 1.6 Memory(记忆,2 REAL / 1 STUB)

| 工具 id              | 状态 | 数据来源 / 问题                        |
| -------------------- | ---- | -------------------------------------- |
| entity-memory        | ✅   | Prisma longTermMemory 表               |
| knowledge-base       | ✅   | Prisma longTermMemory 表               |
| **user-preferences** | ❌   | **内存 Map,无持久化(重启/多实例丢失)** |

### 1.7 Export(导出,4 REAL)

| 工具 id                  | 状态 | 数据来源                            |
| ------------------------ | ---- | ----------------------------------- |
| export-pptx / docx / pdf | ✅   | ExportOrchestratorService(轮询任务) |
| export-image             | ✅   | Puppeteer + Sharp                   |

### 1.8 Collaboration(协作,2 REAL / 2 PARTIAL / 1 STUB)

| 工具 id                    | 状态 | 数据来源 / 问题                                              |
| -------------------------- | ---- | ------------------------------------------------------------ |
| agent-handoff              | ✅   | AiChatService(同步等待 LLM)                                  |
| agent-communication        | ✅   | Redis 持久化 + 内存 Map                                      |
| consensus-mechanism        | ⚠️   | 共识逻辑真,但仅内存 Map 无持久化                             |
| **workflow-orchestration** | ⚠️   | **step 执行用 `Math.random()>0.1` 模拟 90% 成功率,未真派发** |
| human-approval             | ⚠️   | DB 轮询(LongTermMemory),WebSocket 前端集成 TODO              |
| task-delegation            | ❌   | 内存 Map,无持久化                                            |

### 1.9 Automation / AI-App / Harness(5 REAL)

| 工具 id             | 层             | 状态 | 数据来源                           |
| ------------------- | -------------- | ---- | ---------------------------------- |
| browser-context     | automation     | ✅   | BrowserService(Puppeteer)          |
| explore-search      | ai-app/explore | ✅   | Prisma Resource 表(日更策展)       |
| radar-signal-search | ai-app/radar   | ✅   | Prisma RadarItem 表                |
| short-term-memory   | ai-harness     | ✅   | ShortTermMemoryService(Redis/内存) |
| long-term-memory    | ai-harness     | ✅   | LongTermMemoryService(Prisma)      |

---

## 2. 问题清单(按四维度)

### 维度 A:真实度与债务

**A1 · 静默假数据(最高危)** — agent 收到假"成功",会据此继续决策/写报告,污染下游且无报错:

- `github-integration`:返回随机 mock 仓库/issue 数据
- `calendar-integration`:返回硬编码样例事件
- `workflow-orchestration`:`Math.random()` 决定步骤成败,不真实执行

**A2 · throw 未实现(中危)** — 诚实失败,但仍在 catalog 里可被召回,LLM 选中=一次必败循环:

- `video-generation`、`container-executor`

**A3 · 易失内存态(中危)** — 单实例 demo 可用,生产多实例/重启数据丢失:

- `user-preferences`、`task-delegation`、`consensus-mechanism`(内存 Map)

**A4 · 委托/可选降级(低危,多数可接受)**:

- `social-x-search`/`youtube-search`/`job-search` 委托 web-search(无官方 API,合理);`wiki-*` 可选 augmentor 未绑定返回空(应至少日志告警);`industry-report-search` 硬编码 credibility=0.7。

### 维度 B:覆盖度与缺口(对标业界)

**B1 · `information` 类过载**:27/72 工具堆在一个 category,LLM 召回时无法按子域(学术/金融/政策/媒体)精筛。物理目录已分 11 子目录,但逻辑 `category` 未分化。

**B2 · 业界常见却缺失的工具**(对标 Anthropic tool use / OpenAI / LangChain / MCP 生态):

| 缺口                    | 优先级 | 说明                                      |
| ----------------------- | ------ | ----------------------------------------- |
| calculator / math       | P0     | 避免 LLM 算错数(研究/财务刚需)            |
| pdf-table-extraction    | P0     | file-parser 只做基础解析,缺表格结构化抽取 |
| datetime / timezone     | P0     | 全球化时间对齐                            |
| translation             | P1     | 跨语言信息源                              |
| unit-converter          | P1     | 科研/商务换算                             |
| audio-transcription     | P1     | 有 TTS 无 STT(反向缺失)                   |
| vision / image-analysis | P2     | OCR 只取字,缺图像理解                     |
| geocoding / maps        | P2     | 地理分析                                  |
| graph-query(Cypher/类)  | P2     | ontology 只 CRUD,无图查询                 |

> 注:是否补齐取决于实际 agent 场景,遵循 YAGNI,需逐项确认而非一次性全加。

### 维度 C:架构一致性

**C1 · 双执行路径割裂(最关键结构问题)**:

- engine `ToolPipeline.execute()`:permission→rate-limit→validation→timeout→progress 五件套。
- harness `ToolInvoker.invoke()`(**agent 实走**):`tool-invoker.ts:247` 直接 `tool.execute()`,**绕过 ToolPipeline**,自带另一套(熔断器/access matrix/输出截断落盘/tracing/错误对 LLM 可见)。
- 后果:agent 路径上 **input schema 校验、限流、entitlement 中间件缺席**(entitlement 仅在召回期 `performToolRecall` Step4 过滤);**超时只透传 `context.timeout`,无 AbortController 真正掐断**(advisory)。两套关注点重叠但不一致,维护双份。

**C2 · 命名不统一**:

- ontology 用点号驼峰 `ontology.upsertObject`,全项目其余 kebab-case → 无法统一 regex/分组。
- `pubmed`(缺 `-search`)、`startuphub-startup`(冗余)、`xhs-publish`(2 段)vs `wechat-mp-publish`(3 段)、图片搜索 `image-search`(聚合器)vs `bing-image-search`(provider 前缀)前后缀不一致。

**C3 · 分类语义错位**:5 个 ontology 工具是**写操作**(`sideEffect: idempotent`)却归 `information`(语义=读)。应归 `execution` 或独立 knowledge-write。

**C4 · 适配器名实不符**:CLAUDE.md/README 称 `mcp/openapi/function` 三件套,实测 `adapters/` 下**仅 mcp**(生产级,8.5/10)。OpenAPI→ITool 适配器**不存在**,导致 finance/weather 类只能逐个硬编码工具类;"function adapter" 实为 base-tool 的 `createTool()` 工厂,非独立适配器。

**C5 · tags 无约定**:全部工具有 tags 但自由命名(`tech` vs `technology`、`ai-image` vs `image`),无 `STANDARD_TAGS` 枚举,无法可靠按 tag 召回/分组。

### 维度 D:给 agent 的可用性

**D1 · lazy schema 半成品**:`CompactToolSummary` + `estimateTokens` 已实现,但 `buildCatalogBlock` 仍逐工具展开 schema 摘要进 system prompt,无"先摘要、调用时再取完整 schema"二阶段。工具增多时 token 线性上涨。

**D2 · 召回链路本身科学**(7 步:listByCategory→Leader hint→exclude→entitlement→prefer→fail-soft 回退→forbidden),但:Leader hint 无权重排序(all-or-nothing);fail-soft 回退无审计日志。

**D3 · STUB 工具仍进 catalog**:与 A2 同源——`enabled` 字段存在但未对未实现工具置 false,它们照常被召回。

---

## 3. 治理改造方案(分优先级 · 带验证标准)

> 原则:① **registry 里不允许静默假数据**——工具要么真能用,要么 `enabled:false` 退出 catalog;② 能 5 行不写 50 行,缺口按需补不一次性堆;③ 架构改动先确认。

### P0(止血,本周内,低风险)

**P0-1 · 清除静默假数据**

- `github-integration` / `calendar-integration`:二选一——(a) 接真实 API(Octokit / Google Calendar),或 (b) 立即 `enabled:false` 退出 catalog。**在补真之前必须 (b)**,杜绝假数据进 agent。
- `workflow-orchestration`:去掉 `Math.random` 模拟,step 真派发到 ToolInvoker/agent;未完成前 `enabled:false`。
- verify:`ToolRegistry.getEnabled()` 不含任何返回 mock 的工具;grep `Math.random` 在 tools/categories 下为 0(测试除外)。

**P0-2 · throw 类工具退出 catalog**

- `video-generation` / `container-executor`:`enabled:false`(保留代码待实现)。
- verify:agent 召回列表不含这两个;若 LLM 仍点名调用,ToolInvoker 返回明确 "tool disabled" 而非 throw。

**P0-3 · 易失内存态标注或落库**

- `user-preferences` / `task-delegation`:改 Prisma 持久化(对齐 entity-memory 模式),或 `enabled:false`。
- verify:重启后数据不丢的集成测试通过。

### P1(架构收口,2–3 周,需确认)

**P1-1 · 统一执行路径(C1)** — 三选一,需你拍板:

- 方案甲:`ToolInvoker` 内部改调 `ToolPipeline.execute()`,中间件在两路径统一生效(改动大,但彻底)。
- 方案乙:把 validation/限流/真超时(AbortController)下沉进 `ToolInvoker`,废弃 engine `ToolPipeline`(承认 agent 是唯一入口)。
- 方案丙:保留双路径,但抽出共享 `ToolExecutionCore`,两边复用(折中)。
- verify:任一 agent 工具调用都经过 schema 校验 + 真超时掐断;超时测试(故意 sleep 超 timeout)被 abort。

**P1-2 · 命名统一(C2/C3)**:

- ontology `.` → `-`(`ontology-upsert-object`...),保留旧 id 别名一个版本周期防回归。
- ontology 5 工具 `category` 改 `execution`(或新增 `knowledge-write`)。
- 出一份 `standards/` 工具命名规范(kebab-case、`{verb}-{noun}` 或 `{domain}-{action}`)。
- verify:架构 spec 测试新增"工具 id 全 kebab-case"断言通过;无消费方因改名报错。

**P1-3 · information 子分类(B1)**:不炸开 8 大类,改为**强制 tags 子域**(academic/financial/policy/social/media/web/knowledge)+ `STANDARD_TAGS` 枚举,召回支持按子 tag 精筛。

- verify:`listByCategory(['information'])` 可再按 tag 收窄;tags 全部取自枚举。

### P2(能力补全 + 体验,按需,需确认每项)

**P2-1 · 补 P0 缺口工具**:calculator、datetime/timezone、pdf-table-extraction(逐项确认是否真需要)。

- verify:每个新工具有 REAL 实现 + 单测 + 注册,无 mock。
  **P2-2 · OpenAPI→ITool 适配器(C4)**:参考 MCP 适配器架构,spec 批量转工具;或更新文档承认只有 MCP、移除虚假声明。
  **P2-3 · lazy schema 二阶段(D1)**:system prompt 仅投 compact summary + `get_tool_schema(toolId)` helper。
  **P2-4 · 真 entitlement 在 invoke 期(配合 P1-1)+ tags 枚举(P1-3)+ 召回审计日志(D2)。**

---

## 4. 需你拍板的决策点

1. **STUB 处理策略**:静默假数据的 4 个(github/calendar/user-preferences/task-delegation)——一律先 `enabled:false`,还是其中某些直接排期接真实现?
2. **执行路径统一(P1-1)**:甲/乙/丙 哪个方向?(决定后我读全 ToolPipeline + ToolInvoker 出详细 diff 方案)
3. **命名迁移(P1-2)**:是否接受 ontology 改名(需别名过渡)?改名影响面我会先全量 grep 消费方再动。
4. **缺口补齐(P2-1)**:calculator / datetime / pdf-table 这三个 P0 缺口,哪些确实要补?
5. **本台账维护方式**:是否在 `ITool` 加 `maturity: 'real'|'partial'|'stub'` 字段做机器可读状态(配合一个 spec 测试守护"registry 无 stub"),还是仅靠本文档人工维护?

---

## 附:已核实文件(部分)

- `ai-engine/tools/abstractions/tool.interface.ts`、`registry/tool.registry.ts`、`tools.provider.ts`、`tools.module.ts`、`registry/default-retrieval-tools.ts`
- `ai-engine/tools/middleware/*`(pipeline/permission/rate-limit/validation/timeout/progress/output-truncator)
- `ai-engine/tools/adapters/mcp/*`(确认仅 mcp 一个适配器)
- `ai-harness/runner/tool-invoker/tool-invoker.ts`(确认绕过 ToolPipeline + 接了截断落盘)
- 76 个工具的 `execute/doExecute`(逐个核实 REAL/PARTIAL/STUB)
