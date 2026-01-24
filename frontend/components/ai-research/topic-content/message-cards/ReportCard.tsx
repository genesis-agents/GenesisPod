import type { UIMessage } from '../shared/types';

interface ReportCardProps {
  msg: UIMessage;
}

export function ReportCard({ msg }: ReportCardProps) {
  const reportData =
    msg.detail?.type === 'report_preview'
      ? (msg.detail.data as { title?: string; summary?: string })
      : null;

  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-lg">📊</span>
        <span className="font-medium text-orange-800">研究报告撰写完成</span>
      </div>
      {reportData?.title && (
        <p className="text-sm font-medium text-gray-800">{reportData.title}</p>
      )}
      {reportData?.summary && (
        <p className="mt-2 line-clamp-2 text-sm text-gray-600">
          {reportData.summary}
        </p>
      )}
      <button className="mt-3 text-xs text-orange-600 hover:text-orange-700">
        查看完整报告 →
      </button>
    </div>
  );
}
