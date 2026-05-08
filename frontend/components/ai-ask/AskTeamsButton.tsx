'use client';

/**
 * AskTeamsButton —— AI Ask 工具栏右侧的"团队模式"入口
 *
 * 设计：teams-mode.md §10
 * 行为：
 *   - 点击 → 跳转 `/ai-ask/rooms/new`（新建团队房间）
 *   - 与现有 SOLO 单聊体验并存；后续可扩展为 popover（升级当前会话）
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users } from 'lucide-react';

export default function AskTeamsButton() {
  const router = useRouter();
  const [hover, setHover] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => router.push('/ai-ask/rooms/new')}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 transition-colors hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-violet-700 dark:hover:bg-violet-900/30 dark:hover:text-violet-300"
        aria-label="AI 团队模式"
      >
        <Users size={14} />
        <span>团队</span>
      </button>
      {hover && (
        <div className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-md dark:bg-gray-700">
          多 AI 协作（辩论/投票/评审/交接）
        </div>
      )}
    </div>
  );
}
