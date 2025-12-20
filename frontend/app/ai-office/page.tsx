'use client';

import { Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from '@/components/layout/Sidebar';
import WorkspaceLayout from '@/components/ai-office/layout/WorkspaceLayout';
import { LogIn } from 'lucide-react';

// Loading fallback for Suspense
function WorkspaceLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
    </div>
  );
}

/**
 * AI Office 工作区页面
 * 整合资源管理、AI交互、文档生成的统一工作区
 * 支持生成 Word、Excel、PPT 等多种格式文档
 */
export default function AIOfficePage() {
  const { user, isLoading, loginWithGoogle } = useAuth();

  // 加载中
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  // 未登录
  if (!user) {
    return (
      <div className="flex h-screen bg-gray-50">
        <Sidebar />
        <main className="flex flex-1 items-center justify-center">
          <div className="mx-auto max-w-md text-center">
            <div className="mb-6 flex justify-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/25">
                <svg
                  className="h-10 w-10 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
            </div>
            <h1 className="mb-2 text-2xl font-bold text-gray-900">AI Office</h1>
            <p className="mb-8 text-gray-500">
              登录后即可使用智能文档生成功能，包括 PPT、Word、Excel 等
            </p>
            <button
              onClick={loginWithGoogle}
              className="inline-flex items-center gap-3 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-violet-500/25 transition-all hover:shadow-xl hover:shadow-violet-500/30"
            >
              <LogIn className="h-5 w-5" />
              使用 Google 登录
            </button>
          </div>
        </main>
      </div>
    );
  }

  // 已登录
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/50 backdrop-blur-sm">
          <div className="px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/25">
                  <svg
                    className="h-7 w-7 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    AI Office
                  </h1>
                  <p className="text-sm text-gray-500">智能文档生成工作区</p>
                </div>
              </div>
              <div className="text-sm text-gray-500">选择资源，自定义生成</div>
            </div>
          </div>
        </div>

        {/* 内容区域 */}
        <div className="h-[calc(100vh-120px)]">
          <Suspense fallback={<WorkspaceLoading />}>
            <WorkspaceLayout />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
