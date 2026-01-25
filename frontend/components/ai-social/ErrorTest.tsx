'use client';

/**
 * 错误测试组件
 * 仅用于开发环境测试 ErrorBoundary
 *
 * 使用方法：
 * 1. 在 AI Social 页面导入此组件
 * 2. 添加一个测试 tab：{ id: 'test', label: 'Test Error', icon: AlertTriangle }
 * 3. 在内容区域渲染：{activeTab === 'test' && <ErrorTest />}
 * 4. 切换到 Test Error tab，会触发错误
 *
 * 警告：此组件仅用于测试，请勿在生产环境中使用
 */

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

export function ErrorTest() {
  const [triggerError, setTriggerError] = useState(false);

  if (process.env.NODE_ENV !== 'development') {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="rounded-lg bg-yellow-50 p-4 text-yellow-800">
          <p className="font-medium">
            Error test component is disabled in production
          </p>
        </div>
      </div>
    );
  }

  if (triggerError) {
    // 抛出错误来测试 ErrorBoundary
    throw new Error(
      'This is a test error to verify ErrorBoundary is working correctly'
    );
  }

  return (
    <div className="flex items-center justify-center p-8">
      <div className="w-full max-w-md rounded-xl border-2 border-dashed border-gray-300 bg-white p-8 text-center">
        <div className="mb-4 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100">
            <AlertTriangle className="h-8 w-8 text-yellow-600" />
          </div>
        </div>

        <h3 className="mb-2 text-xl font-bold text-gray-900">
          Error Boundary Test
        </h3>

        <p className="mb-6 text-sm text-gray-600">
          Click the button below to trigger an error and test the ErrorBoundary
          component. You should see the SocialErrorFallback UI.
        </p>

        <button
          onClick={() => setTriggerError(true)}
          className="rounded-lg bg-red-600 px-6 py-3 font-medium text-white transition-colors hover:bg-red-700"
        >
          Trigger Test Error
        </button>

        <div className="mt-6 rounded-lg bg-gray-50 p-4 text-left">
          <h4 className="mb-2 text-sm font-semibold text-gray-900">
            What to expect:
          </h4>
          <ul className="space-y-1 text-xs text-gray-600">
            <li>• Error will be caught by ErrorBoundary</li>
            <li>• SocialErrorFallback UI will be displayed</li>
            <li>• Error details shown in development mode</li>
            <li>• Error logged to console</li>
            <li>• Retry/Reload/Home buttons available</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default ErrorTest;
