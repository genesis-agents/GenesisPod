/**
 * E R4 Phase 2 (PR-E2 / 2026-05-05): /custom-agents 列表入口
 *
 * 列表已合入 /me/ai?tab=agents（与 API Keys / 我的模型 同栏）。
 * 这里仅做 redirect，避免两个入口分裂。
 */
import { redirect } from 'next/navigation';

export default function CustomAgentsListPage() {
  redirect('/me/ai?tab=agents');
}
