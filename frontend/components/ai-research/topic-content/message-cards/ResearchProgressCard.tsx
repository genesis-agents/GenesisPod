import type { UIMessage } from '../shared/types';
import { safeString } from '@/lib/utils/common';

interface ResearchProgressCardProps {
  msg: UIMessage;
}

export function ResearchProgressCard({ msg }: ResearchProgressCardProps) {
  const progress = msg.progress || 0;
  const dimName = (msg.agent || '').replace('研究员', '').trim();

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
          <span className="text-sm text-blue-700">
            {dimName ? `${dimName} 研究中...` : safeString(msg.content)}
          </span>
        </div>
        {progress > 0 && (
          <span className="text-xs text-blue-600">{progress}%</span>
        )}
      </div>
      {progress > 0 && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-blue-200">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
