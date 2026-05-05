/**
 * E R4 Phase 2 (PR-E2 / 2026-05-05): /custom-agents/new redirect
 *
 * 创建/编辑入口已合入 /me/ai?tab=agents（在 sidebar + tabs 框架内 inline
 * 切换 list/create/edit panel），消除独立全屏页（无 sidebar 的孤立体验）。
 * 外部直链仍重定向到 tab 入口，保留向后兼容。
 */
import { redirect } from 'next/navigation';

export default function NewCustomAgentPage() {
  redirect('/me/ai?tab=agents');
}
