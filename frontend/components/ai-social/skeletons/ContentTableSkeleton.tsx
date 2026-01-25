'use client';

/**
 * ContentTableSkeleton - 内容表格骨架屏
 * 用于 AI Social 内容列表加载时的占位符
 */
export function ContentTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        {/* Table Header */}
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left">
              <div className="h-3 w-16 animate-pulse rounded bg-gray-200" />
            </th>
            <th className="px-6 py-3 text-left">
              <div className="h-3 w-12 animate-pulse rounded bg-gray-200" />
            </th>
            <th className="px-6 py-3 text-left">
              <div className="h-3 w-16 animate-pulse rounded bg-gray-200" />
            </th>
            <th className="px-6 py-3 text-left">
              <div className="h-3 w-14 animate-pulse rounded bg-gray-200" />
            </th>
            <th className="px-6 py-3 text-left">
              <div className="h-3 w-12 animate-pulse rounded bg-gray-200" />
            </th>
            <th className="relative px-6 py-3">
              <div className="h-3 w-16 animate-pulse rounded bg-gray-200" />
            </th>
          </tr>
        </thead>

        {/* Table Body */}
        <tbody className="divide-y divide-gray-200 bg-white">
          {Array.from({ length: rows }).map((_, index) => (
            <tr key={index} className="animate-pulse">
              {/* Title Column */}
              <td className="whitespace-nowrap px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="h-5 w-5 rounded bg-gray-200" />
                  <div className="h-4 w-48 rounded bg-gray-200" />
                </div>
              </td>

              {/* Type Column */}
              <td className="whitespace-nowrap px-6 py-4">
                <div className="h-4 w-24 rounded bg-gray-200" />
              </td>

              {/* Source Column */}
              <td className="whitespace-nowrap px-6 py-4">
                <div className="h-4 w-20 rounded bg-gray-200" />
              </td>

              {/* Status Column */}
              <td className="whitespace-nowrap px-6 py-4">
                <div className="h-6 w-16 rounded-full bg-gray-200" />
              </td>

              {/* Date Column */}
              <td className="whitespace-nowrap px-6 py-4">
                <div className="h-4 w-20 rounded bg-gray-200" />
              </td>

              {/* Actions Column */}
              <td className="whitespace-nowrap px-6 py-4 text-right">
                <div className="flex items-center justify-end gap-2">
                  <div className="h-6 w-6 rounded bg-gray-200" />
                  <div className="h-6 w-6 rounded bg-gray-200" />
                  <div className="h-6 w-6 rounded bg-gray-200" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
