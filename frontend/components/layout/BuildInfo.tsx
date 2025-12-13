'use client';

import { config } from '@/lib/utils/config';
import { CURRENT_VERSION } from '@/lib/utils/changelog';

/**
 * 构建信息组件 - 显示版本号、commit hash 和构建时间
 * 通常放置在页面底部或设置页面中
 */
export default function BuildInfo() {
  const buildDate = config.buildTime
    ? new Date(config.buildTime).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Unknown';

  return (
    <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="flex items-center gap-1">
          <span className="font-medium">版本:</span>
          <span className="rounded bg-white px-2 py-0.5 font-mono">
            v{CURRENT_VERSION}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="font-medium">Commit:</span>
          <span className="rounded bg-white px-2 py-0.5 font-mono">
            {config.gitCommitHash}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="font-medium">构建时间:</span>
          <span className="rounded bg-white px-2 py-0.5">{buildDate}</span>
        </div>
        {config.isDevelopment && (
          <span className="rounded bg-yellow-100 px-2 py-0.5 text-yellow-800">
            开发模式
          </span>
        )}
        {config.isProduction && (
          <span className="rounded bg-green-100 px-2 py-0.5 text-green-800">
            生产模式
          </span>
        )}
      </div>
    </div>
  );
}
