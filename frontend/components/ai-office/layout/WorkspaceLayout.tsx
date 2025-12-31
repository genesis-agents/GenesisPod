'use client';

/**
 * AI Office 工作区布局组件
 * 三个专项 Tab：Slides/Docs/Designer
 * 注意：左侧菜单使用系统全局Sidebar
 */

import React, { useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Presentation, FileText, Palette } from 'lucide-react';
import CommandPalette, {
  useCommandPalette,
} from '@/components/ai-studio/CommandPalette';
import { SlidesTab } from '../slides';
import DocsTab from '../tabs/DocsTab';
import DesignerTab from '../tabs/DesignerTab';
import { useTranslation } from '@/lib/i18n';

// 工作模式类型 - 三个专项Tab
type WorkspaceTab = 'slides' | 'docs' | 'designer';

interface WorkspaceLayoutProps {
  children?: React.ReactNode;
}

// Valid tab values
const VALID_TABS: WorkspaceTab[] = ['slides', 'docs', 'designer'];

export default function WorkspaceLayout({
  children: _children,
}: WorkspaceLayoutProps) {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Derive active tab directly from URL (source of truth)
  const tabParam = searchParams.get('tab') as WorkspaceTab | null;
  const activeTab: WorkspaceTab =
    tabParam && VALID_TABS.includes(tabParam) ? tabParam : 'slides';

  const containerRef = useRef<HTMLDivElement>(null);
  const commandPalette = useCommandPalette();

  // Update URL when tab changes
  const handleTabChange = (tab: WorkspaceTab) => {
    router.push(`/ai-office?tab=${tab}`, { scroll: false });
  };

  return (
    <div
      ref={containerRef}
      className="relative flex h-full flex-col overflow-hidden bg-gray-50"
    >
      {/* Tab 切换导航 */}
      <div className="flex-shrink-0 border-b border-gray-200 bg-white px-6">
        <div className="flex items-center gap-1">
          {/* AI Slides Tab */}
          <button
            onClick={() => handleTabChange('slides')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'slides'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'
            }`}
          >
            <Presentation className="h-4 w-4" />
            <span>{t('aiOffice.tabs.slides')}</span>
          </button>

          {/* AI Docs Tab */}
          <button
            onClick={() => handleTabChange('docs')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'docs'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'
            }`}
          >
            <FileText className="h-4 w-4" />
            <span>{t('aiOffice.tabs.docs')}</span>
          </button>

          {/* AI Designer Tab */}
          <button
            onClick={() => handleTabChange('designer')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'designer'
                ? 'border-pink-500 text-pink-600'
                : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'
            }`}
          >
            <Palette className="h-4 w-4" />
            <span>{t('aiOffice.tabs.designer')}</span>
          </button>
        </div>
      </div>

      {/* 内容区域 - 根据 Tab 显示不同内容 */}
      <div className="flex flex-1 overflow-hidden">
        {activeTab === 'slides' && (
          /* AI Slides - PPT 生成器 */
          <div className="flex-1 overflow-hidden">
            <SlidesTab />
          </div>
        )}

        {activeTab === 'docs' && (
          /* AI Docs - 文档生成 */
          <div className="flex-1 overflow-hidden">
            <DocsTab />
          </div>
        )}

        {activeTab === 'designer' && (
          /* AI Designer - 设计生成 */
          <div className="flex-1 overflow-hidden">
            <DesignerTab />
          </div>
        )}
      </div>

      {/* Command Palette (Cmd+K) */}
      <CommandPalette
        isOpen={commandPalette.isOpen}
        onClose={commandPalette.close}
        onExecuteCommand={(cmd) => {
          console.log('Execute command:', cmd.id);
        }}
      />
    </div>
  );
}
