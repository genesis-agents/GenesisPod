'use client';

import AppShell from '@/components/layout/AppShell';
import { FeedbackDashboard } from '@/components/feedback';
import { MessageSquareText, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function ResearchFeedbackPage() {
  return (
    <AppShell>
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/feedback"
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="h-4 w-4" />
              返回
            </Link>
            <div className="h-6 w-px bg-gray-200" />
            <MessageSquareText className="h-6 w-6 text-violet-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">研究反馈管理</h1>
              <p className="text-sm text-gray-500">
                管理研究报告反馈，进行 AI 分析和知识沉淀
              </p>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <FeedbackDashboard />
        </main>
      </div>
    </AppShell>
  );
}
