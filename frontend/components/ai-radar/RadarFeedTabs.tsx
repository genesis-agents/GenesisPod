'use client';

/**
 * RadarFeedTabs —— Feed 流 tab 切换（All / X / YouTube / RSS / Custom）
 *
 * 通过 ?type= query 控制后端 feed 过滤。配合 acceptedOnly toggle + minRelevance
 * slider 一起组成完整的 feed 过滤栏。
 */
import { Radio, Rss, Globe, Twitter, Youtube } from 'lucide-react';
import type { RadarSourceType } from '@/services/ai-radar/types';

export type RadarFeedTabKey = 'all' | RadarSourceType;

const TABS: Array<{
  key: RadarFeedTabKey;
  label: string;
  Icon: typeof Radio;
}> = [
  { key: 'all', label: '全部', Icon: Radio },
  { key: 'X', label: 'X', Icon: Twitter },
  { key: 'YOUTUBE', label: 'YouTube', Icon: Youtube },
  { key: 'RSS', label: 'RSS', Icon: Rss },
  { key: 'CUSTOM', label: '自定义', Icon: Globe },
];

export interface RadarFeedTabsProps {
  value: RadarFeedTabKey;
  onChange: (key: RadarFeedTabKey) => void;
  acceptedOnly: boolean;
  onAcceptedOnlyChange: (v: boolean) => void;
}

export function RadarFeedTabs({
  value,
  onChange,
  acceptedOnly,
  onAcceptedOnlyChange,
}: RadarFeedTabsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-2">
      <div className="flex flex-wrap gap-1">
        {TABS.map(({ key, label, Icon }) => {
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                active
                  ? 'bg-cyan-50 text-cyan-700'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          );
        })}
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={acceptedOnly}
            onChange={(e) => onAcceptedOnlyChange(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 text-cyan-600"
          />
          仅精选
        </label>
      </div>
    </div>
  );
}
