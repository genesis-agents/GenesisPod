import { useState } from 'react';
import type { UIMessage } from '../shared/types';
import { safeString } from '@/lib/utils/common';

interface ResearchCompleteCardProps {
  msg: UIMessage;
}

export function ResearchCompleteCard({ msg }: ResearchCompleteCardProps) {
  const [showMore, setShowMore] = useState(false);
  const dimData =
    msg.detail?.type === 'dimension_content'
      ? (msg.detail.data as {
          summary?: string;
          keyFindings?: string[];
          dimensionName?: string;
        })
      : null;

  const keyFindings = dimData?.keyFindings || [];
  const summary = dimData?.summary || '';
  const dimName =
    (msg.agent || '').replace('研究员', '').trim() ||
    dimData?.dimensionName ||
    '';

  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">✅</span>
          <span className="font-medium text-green-800">
            {dimName ? `${dimName} 研究完成` : '研究完成'}
          </span>
        </div>
        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-600">
          100%
        </span>
      </div>

      {keyFindings.length > 0 && (
        <div className="mt-3">
          <div className="mb-2 flex items-center gap-1.5">
            <span className="text-sm">💡</span>
            <span className="text-xs font-medium text-gray-600">关键发现</span>
          </div>
          <ul className="space-y-1.5">
            {keyFindings
              .slice(0, showMore ? keyFindings.length : 3)
              .map((finding, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 text-sm text-gray-700"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-green-500" />
                  <span>
                    {typeof finding === 'string'
                      ? finding
                      : safeString(finding)}
                  </span>
                </li>
              ))}
          </ul>
          {keyFindings.length > 3 && (
            <button
              onClick={() => setShowMore(!showMore)}
              className="mt-2 text-xs text-green-600 hover:text-green-700"
            >
              {showMore ? '收起' : `展开全部 ${keyFindings.length} 条`}
            </button>
          )}
        </div>
      )}

      {!keyFindings.length && summary && (
        <p className="mt-2 line-clamp-3 text-sm text-gray-600">{summary}</p>
      )}
    </div>
  );
}
