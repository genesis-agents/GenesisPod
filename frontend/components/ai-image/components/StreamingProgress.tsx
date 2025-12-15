import type { ProcessingStep, StreamingInsights } from '../types';

interface StreamingProgressProps {
  streamingSteps: ProcessingStep[];
  streamingInsights: StreamingInsights | null;
}

export function StreamingProgress({
  streamingSteps,
  streamingInsights,
}: StreamingProgressProps) {
  return (
    <div className="flex-1 overflow-auto border-b border-gray-200 p-4">
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-300 border-t-purple-600" />
          <span className="text-sm font-medium text-gray-700">
            Creating your image...
          </span>
        </div>
        {streamingInsights?.textModelUsed && (
          <p className="text-xs text-gray-500">
            Text Model: {streamingInsights.textModelUsed}
          </p>
        )}

        {/* Real-time Steps */}
        {streamingSteps.length > 0 && (
          <div className="space-y-2">
            {streamingSteps.map((step) => (
              <div
                key={step.step}
                className={`flex items-start gap-2 rounded-lg p-2 text-xs transition-all ${
                  step.status === 'processing'
                    ? 'border border-purple-200 bg-purple-50'
                    : step.status === 'completed'
                      ? 'border border-green-200 bg-green-50'
                      : step.status === 'error'
                        ? 'border border-red-200 bg-red-50'
                        : 'bg-gray-50'
                }`}
              >
                {/* Status Icon */}
                <div className="mt-0.5 flex-shrink-0">
                  {step.status === 'processing' ? (
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-purple-300 border-t-purple-600" />
                  ) : step.status === 'completed' ? (
                    <svg
                      className="h-3 w-3 text-green-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : step.status === 'error' ? (
                    <svg
                      className="h-3 w-3 text-red-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  ) : (
                    <div className="h-3 w-3 rounded-full bg-gray-300" />
                  )}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <p
                    className={`font-medium ${
                      step.status === 'processing'
                        ? 'text-purple-700'
                        : step.status === 'completed'
                          ? 'text-green-700'
                          : step.status === 'error'
                            ? 'text-red-700'
                            : 'text-gray-700'
                    }`}
                  >
                    {step.title}
                  </p>
                  {step.content && (
                    <p className="mt-0.5 truncate text-[10px] text-gray-500">
                      {step.content.slice(0, 80)}
                      {step.content.length > 80 ? '...' : ''}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
