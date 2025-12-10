'use client';

/**
 * AI Office 工作区布局组件
 * 中栏：资源+AI交互 (350-450px可调节)
 * 右栏：文档编辑器 (自适应)
 * 右侧浮动：任务列表 (Genspark风格)
 * 注意：左侧菜单使用系统全局Sidebar
 *
 * v3.0: 新增 PPT 3.0 模式切换
 * v4.0: 新增 Slides/Docs/Designer Tab切换（无子菜单）
 */

import React, { useState, useRef, useEffect } from 'react';
import { useUIStore, useTaskStore } from '@/stores/aiOfficeStore';
import { ListTodo, Presentation, FileText, Image, Palette } from 'lucide-react';
import MiddlePanel from './MiddlePanel';
import RightPanel from './RightPanel';
import TaskList from '../task/TaskList';
import CommandPalette, {
  useCommandPalette,
} from '@/components/ai-studio/CommandPalette';
import PPTGenerator from '../ppt/PPTGenerator';

// 工作模式类型 - 经典模式下的 Tab
type WorkspaceTab = 'classic' | 'slides' | 'docs' | 'designer';

interface WorkspaceLayoutProps {
  children?: React.ReactNode;
}

export default function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
  const { middlePanelWidth, setMiddlePanelWidth } = useUIStore();
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('classic');
  const containerRef = useRef<HTMLDivElement>(null);
  const commandPalette = useCommandPalette();

  // 处理拖拽调整中间栏宽度
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;

      // 限制最小和最大宽度
      const constrainedWidth = Math.max(400, Math.min(700, newWidth));
      setMiddlePanelWidth(constrainedWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, setMiddlePanelWidth]);

  const tasks = useTaskStore((state) => state.tasks);
  const isTaskListOpen = useTaskStore((state) => state.isTaskListOpen);
  const toggleTaskList = useTaskStore((state) => state.toggleTaskList);

  return (
    <div
      ref={containerRef}
      className="relative flex h-full flex-col overflow-hidden bg-gray-50"
    >
      {/* Tab 切换导航 */}
      <div className="flex-shrink-0 border-b border-gray-200 bg-white px-6">
        <div className="flex items-center gap-1">
          {/* 经典模式 Tab */}
          <button
            onClick={() => setActiveTab('classic')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'classic'
                ? 'border-violet-500 text-violet-600'
                : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'
            }`}
          >
            <FileText className="h-4 w-4" />
            <span>经典模式</span>
          </button>

          {/* AI Slides Tab */}
          <button
            onClick={() => setActiveTab('slides')}
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
            onClick={() => setActiveTab('docs')}
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
            onClick={() => setActiveTab('designer')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'designer'
                ? 'border-pink-500 text-pink-600'
                : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'
            }`}
          >
            <Palette className="h-4 w-4" />
            <span>AI Designer</span>
          </button>
        </div>
      </div>

      {/* 内容区域 - 根据 Tab 显示不同内容 */}
      <div className="flex flex-1 overflow-hidden">
        {activeTab === 'classic' && (
          /* 经典模式 - 原有布局 */
          <>
            {/* 中间栏 (资源 + AI交互) */}
            <div
              className="relative flex-shrink-0 border-r border-gray-200 bg-white"
              style={{ width: `${middlePanelWidth}px` }}
            >
              <MiddlePanel />

              {/* 拖拽调节手柄 */}
              <div
                className={`absolute right-0 top-0 h-full w-1 cursor-col-resize transition-colors hover:bg-blue-500 ${
                  isDragging ? 'bg-blue-500' : ''
                }`}
                onMouseDown={handleMouseDown}
                title="拖拽调节宽度"
              />
            </div>

            {/* 右侧文档编辑器 */}
            <div className="min-w-0 flex-1 overflow-hidden bg-white">
              <RightPanel>{children}</RightPanel>
            </div>
          </>
        )}

        {activeTab === 'slides' && (
          /* AI Slides - PPT 生成器 */
          <div className="flex-1 overflow-hidden">
            <PPTGenerator />
          </div>
        )}

        {activeTab === 'docs' && (
          /* AI Docs - 文档生成 (待实现内嵌版本) */
          <div className="flex flex-1 flex-col items-center justify-center bg-white p-8">
            <div className="text-center">
              <FileText className="mx-auto mb-4 h-16 w-16 text-blue-500" />
              <h2 className="mb-2 text-xl font-semibold text-gray-800">
                AI Docs
              </h2>
              <p className="mb-6 text-gray-500">
                智能文档生成器 - 研究报告、商业提案、技术文档等
              </p>
              <p className="text-sm text-gray-400">
                在左侧对话区描述需求，AI将帮您生成专业文档
              </p>
            </div>
          </div>
        )}

        {activeTab === 'designer' && (
          /* AI Designer - 设计生成 (待实现内嵌版本) */
          <div className="flex flex-1 flex-col items-center justify-center bg-white p-8">
            <div className="text-center">
              <Palette className="mx-auto mb-4 h-16 w-16 text-pink-500" />
              <h2 className="mb-2 text-xl font-semibold text-gray-800">
                AI Designer
              </h2>
              <p className="mb-6 text-gray-500">
                智能设计助手 - 信息图、数据可视化、流程图、海报等
              </p>
              <p className="text-sm text-gray-400">
                在左侧对话区描述设计需求，AI将帮您创建专业设计
              </p>
            </div>
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
