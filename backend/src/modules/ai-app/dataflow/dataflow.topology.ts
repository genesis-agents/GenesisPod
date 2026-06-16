/**
 * 系统数据流图 —— 声明式拓扑（SSOT）
 *
 * 设计取舍（2026-06-15，与用户确认）：
 *   - 节点/边是「声明式映射」：基于真实代码关系手工固化（跨模块业务语义边
 *     无法从代码可靠自动推导，详见决策记录）。
 *   - 但每个可对应到真实运行时实体的节点都带 capabilityId / sourceId：
 *       · capabilityId → ToolRegistry.isAvailable() 校验 live + AIUsageLog 聚合真实调用量
 *       · sourceId     → ContentSourceRegistry.get() 校验 live
 *     这样「拓扑是声明式骨架，真实性 + 流量由 registry / 日志回填」。
 *
 * 四层架构带（自下而上数据流）：
 *   ① 外部数据源/采集  ② 内容与组织(知识库+前沿库)  ③ AI Engine 基元  ④ AI Apps(左侧菜单)
 */

export type DataFlowGroup =
  | "external"
  | "explore"
  | "library"
  | "engine"
  | "ontology"
  | "apps";

export type DataFlowEdgeKind =
  | "ingest"
  | "process"
  | "retrieve"
  | "save"
  | "ofill"
  | "ouse";

export interface DataFlowLayerDef {
  /** 层序号（1=底部外部源 … 4=顶部 Apps） */
  id: number;
  label: string;
}

export interface DataFlowNodeDef {
  id: string;
  /** 所属架构层（1-4） */
  layer: number;
  group: DataFlowGroup;
  title: string;
  subtitle: string;
  /** 后端定位（文件/模块），前端详情面板展示 */
  tag: string;
  description: string;
  /**
   * 真实工具 id（ToolRegistry）。存在时：
   *   - getGraph 用 ToolRegistry.isAvailable() 标注 live
   *   - getMetrics 用 AIUsageLog(capabilityId=该值) 聚合真实调用量
   */
  capabilityId?: string;
  /** 真实内容源 id（ContentSourceRegistry），存在时校验 live */
  sourceId?: string;
}

export interface DataFlowEdgeDef {
  id: string;
  from: string;
  to: string;
  kind: DataFlowEdgeKind;
  label: string;
}

export const DATAFLOW_LAYERS: DataFlowLayerDef[] = [
  { id: 4, label: "④ AI Apps · 左侧菜单功能" },
  { id: 3, label: "③ AI Engine 基元 · 检索 / 向量 / 知识本体" },
  { id: 2, label: "② 内容与组织 · 知识库 Library + 前沿库 EXPLORE" },
  { id: 1, label: "① 外部数据源 / 采集" },
];

export const DATAFLOW_NODES: DataFlowNodeDef[] = [
  // ① 外部数据源
  {
    id: "crawlers",
    layer: 1,
    group: "external",
    title: "采集爬虫",
    subtitle: "arXiv/RSS/HN/GitHub",
    tag: "EXPLORE · ingestion/crawlers",
    description:
      "定时(Cron, ~6h)抓取前沿资源，按质量门槛去重后入 Resource 库。",
  },
  {
    id: "youtube",
    layer: 1,
    group: "external",
    title: "YouTube 采集",
    subtitle: "视频 + 字幕缓存",
    tag: "EXPLORE · youtube",
    description: "抓取视频与转录字幕，缓存于 YouTubeTranscriptCache。",
  },
  {
    id: "integr",
    layer: 1,
    group: "external",
    title: "外部集成",
    subtitle: "GDrive / 飞书 / Notion",
    tag: "Library · integrations",
    description: "把第三方文档导入知识库，作为 KB Document 进入 RAG 管道。",
  },

  // ② 内容与组织：前沿库 + 知识库
  {
    id: "resource",
    layer: 2,
    group: "explore",
    title: "Resource 前沿资源库",
    subtitle: "策展 + AI富化 + 质量分",
    tag: "EXPLORE · resources",
    description:
      "全局公共资源实体：aiSummary/keyInsights/qualityScore/trendingScore。",
    sourceId: "AI_EXPLORE",
  },
  {
    id: "feed",
    layer: 2,
    group: "explore",
    title: "Feed / 浏览",
    subtitle: "/feed · 时间&热度排序",
    tag: "EXPLORE · feed",
    description: "前端首页流、搜索、trending、相关推荐。",
  },
  {
    id: "kbDocs",
    layer: 2,
    group: "library",
    title: "KB Documents",
    subtitle: "多源文档导入",
    tag: "Library · rag/knowledge-base",
    description: "统一文档容器：GDrive/飞书/平台/URL/内部报告。",
  },
  {
    id: "chunks",
    layer: 2,
    group: "library",
    title: "Parent/Child Chunks",
    subtitle: "~2000 / ~400 token",
    tag: "Library · rag/document-processor",
    description: "Parent-Child 分块：parent 给上下文，child 给向量精度。",
  },
  {
    id: "collections",
    layer: 2,
    group: "library",
    title: "Collections 合集",
    subtitle: "CollectionItem 多态覆盖",
    tag: "Library · collections",
    description:
      "收藏覆盖层：纳入 Resource/Note/Image/Notion/Drive，自动 AI 打标签。",
  },
  {
    id: "notes",
    layer: 2,
    group: "library",
    title: "Notes 笔记",
    subtitle: "Markdown + 高亮",
    tag: "Library · notes",
    description: "用户私有笔记，可关联资源 / 知识图谱节点，可被合集整理。",
  },
  {
    id: "wiki",
    layer: 2,
    group: "library",
    title: "Wiki (BM25)",
    subtitle: "WikiPage 出链/反链",
    tag: "Library · wiki",
    description: "KB 内 wiki 页，BM25 索引；检索置信度够则短路，不走向量。",
  },

  // ③ AI Engine 基元
  {
    id: "exSearch",
    layer: 3,
    group: "engine",
    title: "explore-search 工具",
    subtitle: "ToolRegistry · public/mine",
    tag: "engine · tools / explore-search",
    description:
      "注册进全局 ToolRegistry，被 AI 洞察 / AI 前瞻等 Agent 调用检索前沿库。",
    capabilityId: "explore-search",
  },
  {
    id: "websearch",
    layer: 3,
    group: "engine",
    title: "Web Search",
    subtitle: "公网检索 (Serper/Tavily)",
    tag: "engine · DEFAULT_RETRIEVAL_TOOL_IDS",
    description: "四层检索之一，提供公网时效性。",
    capabilityId: "web-search",
  },
  {
    id: "vector",
    layer: 3,
    group: "engine",
    title: "Vector Store",
    subtitle: "EmbeddingService 向量",
    tag: "engine · rag/vector",
    description: "child chunk 向量化(自适应限速)后入库，供相似度检索。",
  },
  {
    id: "kbQuery",
    layer: 3,
    group: "engine",
    title: "KbQuery 检索门面",
    subtitle: "Wiki 优先 + RAG 回退",
    tag: "Library · kb-query (rag-search)",
    description: "统一检索入口：先 Wiki(BM25)，不够再 RAG 向量+rerank。",
    capabilityId: "rag-search",
  },
  {
    id: "ontology",
    layer: 3,
    group: "ontology",
    title: "知识本体 Ontology",
    subtitle: "OntologyObject + Link",
    tag: "engine · knowledge/ontology",
    description:
      "全局图谱。回填(4源→OntologyBuilderSkill)写入；AI 洞察 S2 读子图作背景知识。",
  },

  // ④ AI Apps（左侧菜单可见项）
  {
    id: "ask",
    layer: 4,
    group: "apps",
    title: "AI 问答",
    subtitle: "/ai-ask",
    tag: "menu · nav.aiAsk",
    description: "多模型问答，可走 RAG 检索知识库作答。",
  },
  {
    id: "radar",
    layer: 4,
    group: "apps",
    title: "AI 雷达",
    subtitle: "/ai-radar · 信号流",
    tag: "menu · nav.aiRadar",
    description:
      "订阅话题信号，radar-signal-search 作为四层检索之一供 Agent 取证。",
    capabilityId: "radar-signal-search",
  },
  {
    id: "insights",
    layer: 4,
    group: "apps",
    title: "AI 洞察",
    subtitle: "/agent-playground · 多Agent mission",
    tag: "menu · nav.aiInsights",
    description:
      "多 Agent mission：S2 Leader 读本体规划，S11 完成回写本体，形成闭环。原 Topic Insights / 研究能力收于此。",
  },
  {
    id: "foresight",
    layer: 4,
    group: "apps",
    title: "AI 前瞻",
    subtitle: "/foresight · 假设图谱",
    tag: "menu · nav.aiForesight",
    description:
      "扫描前沿库验证/证伪假设：scanExplore→explore-search(public)→ForesightSignal。",
  },
  {
    id: "agents",
    layer: 4,
    group: "apps",
    title: "我的专家团",
    subtitle: "/agents · 任务",
    tag: "menu · nav.myExperts",
    description: "专家花名册 + 专家任务，驱动 AI 洞察 mission 执行。",
  },
];

export const DATAFLOW_EDGES: DataFlowEdgeDef[] = [
  // ① 采集 / 导入
  {
    id: "e1",
    from: "crawlers",
    to: "resource",
    kind: "ingest",
    label: "定时抓取",
  },
  {
    id: "e2",
    from: "youtube",
    to: "resource",
    kind: "ingest",
    label: "视频+字幕",
  },
  { id: "e3", from: "integr", to: "kbDocs", kind: "ingest", label: "导入文档" },
  // ② 内容层内部
  { id: "e4", from: "resource", to: "feed", kind: "save", label: "浏览/搜索" },
  {
    id: "e6",
    from: "resource",
    to: "collections",
    kind: "save",
    label: "收藏入库",
  },
  { id: "e11", from: "notes", to: "collections", kind: "save", label: "整理" },
  {
    id: "e8",
    from: "kbDocs",
    to: "chunks",
    kind: "process",
    label: "Parent-Child 分块",
  },
  {
    id: "e10",
    from: "collections",
    to: "kbDocs",
    kind: "process",
    label: "纳入语料",
  },
  // ② → ③
  {
    id: "e9",
    from: "chunks",
    to: "vector",
    kind: "process",
    label: "embedding",
  },
  {
    id: "e5",
    from: "resource",
    to: "exSearch",
    kind: "process",
    label: "索引来源",
  },
  {
    id: "e12",
    from: "vector",
    to: "kbQuery",
    kind: "process",
    label: "向量检索",
  },
  { id: "e13", from: "wiki", to: "kbQuery", kind: "process", label: "BM25" },
  // ③ → ④ 检索消费
  {
    id: "e15",
    from: "kbQuery",
    to: "insights",
    kind: "retrieve",
    label: "背景检索",
  },
  {
    id: "e16",
    from: "kbQuery",
    to: "foresight",
    kind: "retrieve",
    label: "KB 证据",
  },
  {
    id: "e17",
    from: "kbQuery",
    to: "ask",
    kind: "retrieve",
    label: "RAG 作答",
  },
  {
    id: "e18",
    from: "exSearch",
    to: "foresight",
    kind: "retrieve",
    label: "前沿扫描(public)",
  },
  {
    id: "e19",
    from: "exSearch",
    to: "insights",
    kind: "retrieve",
    label: "前沿取证",
  },
  {
    id: "e21",
    from: "websearch",
    to: "insights",
    kind: "retrieve",
    label: "公网检索",
  },
  {
    id: "e21b",
    from: "websearch",
    to: "foresight",
    kind: "retrieve",
    label: "公网检索",
  },
  // ④ 内部
  {
    id: "e22",
    from: "radar",
    to: "insights",
    kind: "retrieve",
    label: "信号检索",
  },
  {
    id: "e28",
    from: "agents",
    to: "insights",
    kind: "retrieve",
    label: "驱动 mission",
  },
  // 本体回填
  {
    id: "e23",
    from: "insights",
    to: "ontology",
    kind: "ofill",
    label: "S11 回写",
  },
  {
    id: "e24",
    from: "foresight",
    to: "ontology",
    kind: "ofill",
    label: "报告回填",
  },
  {
    id: "e26",
    from: "kbDocs",
    to: "ontology",
    kind: "ofill",
    label: "KB Doc 回填",
  },
  // 本体利用
  {
    id: "e27",
    from: "ontology",
    to: "insights",
    kind: "ouse",
    label: "S2 读子图",
  },
];
