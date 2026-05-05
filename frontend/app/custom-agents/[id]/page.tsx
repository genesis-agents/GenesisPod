/**
 * E R4 Phase 2 (PR-E2 / 2026-05-05): /custom-agents/[id] redirect
 *
 * 编辑入口已合入 /me/ai?tab=agents（点列表里"编辑"按钮 inline 切换 panel）。
 * 外部直链重定向到 tab 入口，保留向后兼容。
 */
import { redirect } from 'next/navigation';

export default function EditCustomAgentPage() {
  redirect('/me/ai?tab=agents');
}
