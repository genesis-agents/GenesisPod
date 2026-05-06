'use client';

interface AIModelSelectorProps {
  aiModel: string;
  setAiModel: (model: string) => void;
  aiModels: Array<Record<string, unknown>>;
}

export default function AIModelSelector({
  aiModel,
  setAiModel,
  aiModels,
}: AIModelSelectorProps) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-gradient-to-r from-gray-50 to-gray-100 p-3">
      <div className="flex items-center gap-2">
        <svg
          className="h-4 w-4 text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
        <span className="text-xs font-medium text-gray-700">AI Model</span>
      </div>
      <select
        value={aiModel}
        onChange={(e) => setAiModel(e.target.value)}
        className="cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium shadow-sm transition-all hover:border-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
      >
        {aiModels.map((model) => (
          <option key={model.id as string} value={model.modelId as string}>
            {model.name as string} ({model.provider as string})
            {model.isUserKey ? ' · 我的 Key' : ' · 系统 Key'}
          </option>
        ))}
      </select>
    </div>
  );
}
