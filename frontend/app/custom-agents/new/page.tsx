/**
 * E R4 Phase 2 (PR-E2 / 2026-05-05): /custom-agents/new redirect
 *
 * 创建/编辑入口已合入个人中心 /me/agents（在 sidebar + 左导航框架内 inline
 * 切换 list/create/edit panel），消除独立全屏页（无 sidebar 的孤立体验）。
 * 外部直链仍重定向到该入口，保留向后兼容。
 */
import { redirect } from 'next/navigation';

export default function NewCustomAgentPage() {
  redirect('/me/agents');
}
