/**
 * 留桩 re-export shim（2026-06-08）：纯图谱分析（runGraphAnalyses）已上抽到平台
 * 共享层 `marketplace/graph/graph-analyses`。playground 历史 import 路径不变，
 * 纯函数实现零变化，分析 spec 通过该路径仍解析。
 */
export * from "@/modules/ai-app/marketplace/graph/graph-analyses";
