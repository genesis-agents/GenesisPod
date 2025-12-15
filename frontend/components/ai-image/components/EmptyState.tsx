export function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center border-b border-gray-100 bg-gradient-to-b from-gray-50 to-white p-8 text-center">
      {/* Icon */}
      <div className="relative mb-5">
        <div className="absolute -inset-3 rounded-full bg-gradient-to-r from-purple-100 to-blue-100 opacity-50 blur-lg" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-100 to-white shadow-inner">
          <svg
            className="h-8 w-8 text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
      </div>
      <p className="mb-2 text-sm font-semibold text-gray-600">Insights Panel</p>
      <p className="max-w-[200px] text-xs leading-relaxed text-gray-400">
        Select an image to view details, or generate a new one below
      </p>
      {/* Decorative line */}
      <div className="mt-6 flex items-center gap-2">
        <div className="h-px w-8 bg-gradient-to-r from-transparent to-gray-200" />
        <div className="h-1.5 w-1.5 rounded-full bg-gray-200" />
        <div className="h-px w-8 bg-gradient-to-l from-transparent to-gray-200" />
      </div>
    </div>
  );
}
