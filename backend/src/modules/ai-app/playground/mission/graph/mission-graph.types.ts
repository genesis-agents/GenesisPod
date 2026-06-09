/**
 * 留桩 re-export shim（2026-06-08）：图谱类型已上抽到平台共享层
 * `marketplace/graph/graph.types`（design.md §4.3「市场=平台共享」）。
 * playground 历史 import 路径保持不变，行为零变化。
 */
export * from "@/modules/ai-app/marketplace/graph/graph.types";
