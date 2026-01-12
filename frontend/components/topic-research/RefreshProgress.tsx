'use client';

/**
 * Refresh Progress Component
 *
 * 显示专题刷新进度
 */

interface RefreshProgressProps {
  progress: {
    phase: string;
    progress: number;
    message: string;
    currentDimension?: string;
    completedDimensions: number;
    totalDimensions: number;
  };
  onCancel?: () => void;
}

const phaseLabels: Record<string, string> = {
  starting: '初始化',
  researching: '研究中',
  synthesizing: '合成报告',
  completed: '已完成',
  failed: '失败',
};

export function RefreshProgress({ progress, onCancel }: RefreshProgressProps) {
  const phaseLabel = phaseLabels[progress.phase] || progress.phase;

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10">
            {/* Circular progress */}
            <svg className="h-10 w-10 -rotate-90 transform">
              <circle
                className="text-blue-200"
                strokeWidth="3"
                stroke="currentColor"
                fill="transparent"
                r="16"
                cx="20"
                cy="20"
              />
              <circle
                className="text-blue-600 transition-all duration-300"
                strokeWidth="3"
                strokeLinecap="round"
                stroke="currentColor"
                fill="transparent"
                r="16"
                cx="20"
                cy="20"
                strokeDasharray={`${progress.progress * 1.005} 100.5`}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-blue-700">
              {progress.progress}%
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-blue-900">{phaseLabel}</span>
              {progress.currentDimension && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                  {progress.currentDimension}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-blue-700">{progress.message}</p>
          </div>
        </div>

        {onCancel &&
          progress.phase !== 'completed' &&
          progress.phase !== 'failed' && (
            <button
              onClick={onCancel}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
            >
              取消
            </button>
          )}
      </div>

      {/* Dimensions progress */}
      {progress.totalDimensions > 0 && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-blue-600">
            <span>维度进度</span>
            <span>
              {progress.completedDimensions} / {progress.totalDimensions}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-blue-200">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-300"
              style={{
                width: `${(progress.completedDimensions / progress.totalDimensions) * 100}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
