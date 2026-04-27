/**
 * Back-compat shim —— abstractions 已搬迁到 modules/ai-harness/abstractions/
 *
 * Phase 1 (PR-H2) 保留此 re-export 让 ai-engine 内部仍能 import 旧路径，
 * 避免一次性大面积改动。后续 PR 直接改 import 路径，本文件再删。
 *
 * 外部模块（ai-app/*）应从 modules/ai-harness/facade 引入，不要走本路径。
 */

export * from "../../../ai-harness/abstractions";
