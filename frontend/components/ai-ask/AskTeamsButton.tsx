'use client';

/**
 * AskTeamsButton —— AI Ask 工具栏的"团队模式"入口
 *
 * 设计：teams-mode.md §10
 * 样式：与 KnowledgeBaseSelector(compact) 对齐（无边框 / 灰文字 / hover 浅灰），
 *      置于 AskToolsButton(🔑) 之前，与"知识库"按钮形成一组。
 * 行为：点击直接弹 NewAskRoomModal（不再跳路由）。
 */

import { useState } from 'react';
import { Users } from 'lucide-react';
import NewAskRoomModal from './NewAskRoomModal';

export default function AskTeamsButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-100"
        title="多 AI 协作（辩论 / 投票 / 评审 / 交接）"
        aria-label="AI 团队模式"
      >
        <Users className="h-4 w-4" />
        <span className="whitespace-nowrap">团队</span>
      </button>
      <NewAskRoomModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
