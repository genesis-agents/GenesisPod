// PR-8 v1.6 D5 rerun 8 意图卡片 UI
//
// 用法（mission 详情页"重跑"按钮触发 → 弹出本组件）：
//   <RerunIntentCardGrid onPick={(intent) => openIntentForm(intent)} />

'use client';

import * as React from 'react';
import {
  RERUN_INTENT_CARDS,
  type RerunIntent,
} from '@/lib/agent-playground/rerun-intents';

export interface RerunIntentCardGridProps {
  onPick: (intent: RerunIntent) => void;
}

export function RerunIntentCardGrid({
  onPick,
}: RerunIntentCardGridProps): React.ReactElement {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {RERUN_INTENT_CARDS.map((card) => (
        <button
          key={card.intent}
          type="button"
          onClick={() => onPick(card.intent)}
          className="flex flex-col items-start gap-1 rounded-md border border-gray-200 bg-white p-3 text-left transition-all hover:border-blue-400 hover:bg-blue-50"
        >
          <div className="flex items-center gap-2">
            <span className="text-xl">{card.emoji}</span>
            <span className="font-medium text-gray-900">{card.label}</span>
            {card.createsNewMission && (
              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800">
                新 mission
              </span>
            )}
          </div>
          <div className="text-xs text-gray-600">{card.description}</div>
        </button>
      ))}
    </div>
  );
}
