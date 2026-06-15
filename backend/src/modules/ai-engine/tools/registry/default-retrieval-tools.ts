/**
 * Default Retrieval Tool Set —— 默认检索工具集（唯一真相源）
 *
 * 背景（2026-06-14）：上层各 AI App 的工具解析层此前各自在自己的映射表里硬编码
 * "web-search" 一类检索工具，导致每新增一个内部检索工具（如前沿库 explore-search）
 * 都要改 N 处。本文件把"agent 默认应该具备哪些检索能力"收口为单一常量：以后增删
 * 默认检索工具只改这里，各上层解析层引用即自动同步。
 *
 * 只放**字符串 id**，不 import 任何具体工具类 —— web-search / rag-search 是 engine 工具，
 * explore-search / radar-signal-search 是 ai-app 工具，引擎按 id 引用不产生反向依赖，
 * 不破坏分层（id 是契约，类归各自模块）。
 *
 * 成员语义（互补的四层检索）：
 *   - web-search           公开网页（时效 + 广度）
 *   - explore-search       AI 前沿库（每日更新的高质量策展资源）
 *   - rag-search           私有知识沉淀（用户/项目语料）
 *   - radar-signal-search  雷达一手信号（用户订阅话题的近期高分资讯）
 */

/** Registry 结构子集 —— 只需判断某 id 是否已注册（避免与 ToolRegistry 形成类型环依赖）。 */
interface ToolRegistryLike {
  has(id: string): boolean;
}

/**
 * 默认检索工具 id 列表（顺序即建议的优先级：先库内、私有、信号，再回落公开网页）。
 * 注意：这是"应当具备"的集合；实际可用还需经 resolveDefaultRetrievalTools 按注册情况过滤。
 */
export const DEFAULT_RETRIEVAL_TOOL_IDS = [
  "web-search",
  "explore-search",
  "rag-search",
  "radar-signal-search",
] as const;

export type DefaultRetrievalToolId =
  (typeof DEFAULT_RETRIEVAL_TOOL_IDS)[number];

/**
 * 解析当前环境下真正可用的默认检索工具 id —— 过滤掉未注册的（某 app 未加载时其工具缺席，
 * 静默跳过而非报错）。各 app 的工具解析层应调用本函数取得 bundle，再适配成自己的形态。
 */
export function resolveDefaultRetrievalTools(
  registry: ToolRegistryLike,
): string[] {
  return DEFAULT_RETRIEVAL_TOOL_IDS.filter((id) => registry.has(id));
}
