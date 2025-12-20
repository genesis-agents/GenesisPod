'use client';

/**
 * AI Office 工作区布局组件
 * 四个专项 Tab：Slides/Docs/Designer/Developer
 * 右侧浮动：任务列表 (Genspark风格)
 * 注意：左侧菜单使用系统全局Sidebar
 *
 * v5.1: 添加 Developer Tab
 */

import React, { useState, useRef, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTaskStore } from '@/stores/aiOfficeStore';
import { ListTodo, Presentation, FileText, Palette, Code2 } from 'lucide-react';
import TaskList from '../task/TaskList';
import CommandPalette, {
  useCommandPalette,
} from '@/components/ai-studio/CommandPalette';
import SlidesTab from '../tabs/SlidesTab';
import DocsTab from '../tabs/DocsTab';
import DesignerTab from '../tabs/DesignerTab';
import DeveloperTab from '../tabs/DeveloperTab';

// 工作模式类型 - 四个专项Tab
type WorkspaceTab = 'slides' | 'docs' | 'designer' | 'developer';

interface WorkspaceLayoutProps {
  children?: React.ReactNode;
}

// Valid tab values
const VALID_TABS: WorkspaceTab[] = ['slides', 'docs', 'designer', 'developer'];

export default function WorkspaceLayout({
  children: _children,
}: WorkspaceLayoutProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Read initial tab from URL params
  const tabParam = searchParams.get('tab') as WorkspaceTab | null;
  const initialTab =
    tabParam && VALID_TABS.includes(tabParam) ? tabParam : 'slides';

  const [activeTab, setActiveTab] = useState<WorkspaceTab>(initialTab);
  const containerRef = useRef<HTMLDivElement>(null);
  const commandPalette = useCommandPalette();

  const tasks = useTaskStore((state) => state.tasks);
  const isTaskListOpen = useTaskStore((state) => state.isTaskListOpen);
  const toggleTaskList = useTaskStore((state) => state.toggleTaskList);

  // Sync tab from URL params on navigation
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab') as WorkspaceTab | null;
    if (
      tabFromUrl &&
      VALID_TABS.includes(tabFromUrl) &&
      tabFromUrl !== activeTab
    ) {
      setActiveTab(tabFromUrl);
    }
  }, [searchParams, activeTab]);

  // Update URL when tab changes
  const handleTabChange = (tab: WorkspaceTab) => {
    setActiveTab(tab);
    // Update URL without full page reload
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    router.replace(url.pathname + url.search, { scroll: false });
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
            <span>AI Slides</span>
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
            <span>AI Docs</span>
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
            <span>AI Designer</span>
          </button>

          {/* AI Developer Tab */}
          <button
            onClick={() => handleTabChange('developer')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'developer'
                ? 'border-green-500 text-green-600'
                : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'
            }`}
          >
            <Code2 className="h-4 w-4" />
            <span>AI Developer</span>
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

        {activeTab === 'developer' && (
          /* AI Developer - 代码生成 */
          <div className="flex-1 overflow-hidden">
            <DeveloperTab />
          </div>
        )}
      </div>

      {/* 浮动任务列表按钮 (Genspark风格) */}
      {!isTaskListOpen && (
        <button
          onClick={toggleTaskList}
          className="fixed bottom-6 right-6 z-30 flex items-center space-x-2 rounded-full bg-blue-600 px-5 py-3 text-white shadow-lg transition-all hover:scale-105 hover:bg-blue-700 hover:shadow-xl active:scale-95"
          title="打开任务列表"
        >
          <ListTodo className="h-5 w-5" />
          <span className="font-medium">任务</span>
          {tasks.length > 0 && (
            <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-blue-600">
              {tasks.length}
            </span>
          )}
        </button>
      )}

      {/* 任务列表侧边栏 */}
      <TaskList />

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
