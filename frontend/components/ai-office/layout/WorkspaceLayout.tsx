'use client';

/**
 * AI Office 工作区布局组件
 * 中栏：资源+AI交互 (350-450px可调节)
 * 右栏：文档编辑器 (自适应)
 * 右侧浮动：任务列表 (Genspark风格)
 * 注意：左侧菜单使用系统全局Sidebar
 *
 * v3.0: 新增 PPT 3.0 模式切换
 * v4.0: 新增 Slides/Docs/Designer 多模式切换
 */

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useUIStore, useTaskStore } from '@/stores/aiOfficeStore';
import {
  ListTodo,
  Presentation,
  FileText,
  Image,
  ArrowUpRight,
} from 'lucide-react';
import MiddlePanel from './MiddlePanel';
import RightPanel from './RightPanel';
import TaskList from '../task/TaskList';
import CommandPalette, {
  useCommandPalette,
} from '@/components/ai-studio/CommandPalette';
import PPTGenerator from '../ppt/PPTGenerator';

// 工作模式类型
type WorkspaceMode = 'classic' | 'ppt30';

interface WorkspaceLayoutProps {
  children?: React.ReactNode;
}

export default function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
  const { middlePanelWidth, setMiddlePanelWidth } = useUIStore();
  const [isDragging, setIsDragging] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('classic');
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
      {/* 模式切换标签 + 快捷入口 */}
      <div className="flex-shrink-0 border-b border-gray-200 bg-white px-6 py-2">
        <div className="flex items-center justify-between">
          {/* 左侧：模式切换 */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setWorkspaceMode('classic')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                workspaceMode === 'classic'
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <FileText className="h-4 w-4" />
              <span>经典模式</span>
            </button>
            <button
              onClick={() => setWorkspaceMode('ppt30')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                workspaceMode === 'ppt30'
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Presentation className="h-4 w-4" />
              <span>PPT 3.0</span>
              <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                新
              </span>
            </button>
          </div>

          {/* 右侧：快捷入口 */}
          <div className="flex items-center gap-2">
            <Link
              href="/ai-office/slides"
              className="flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-sm font-medium text-orange-700 transition-colors hover:bg-orange-100"
            >
              <Presentation className="h-4 w-4" />
              <span>AI Slides</span>
              <ArrowUpRight className="h-3 w-3" />
            </Link>
            <Link
              href="/ai-office/docs"
              className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
            >
              <FileText className="h-4 w-4" />
              <span>AI Docs</span>
              <ArrowUpRight className="h-3 w-3" />
            </Link>
            <Link
              href="/ai-office/designer"
              className="flex items-center gap-1.5 rounded-lg border border-pink-200 bg-pink-50 px-3 py-1.5 text-sm font-medium text-pink-700 transition-colors hover:bg-pink-100"
            >
              <Image className="h-4 w-4" />
              <span>AI Designer</span>
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex flex-1 overflow-hidden">
        {workspaceMode === 'ppt30' ? (
          /* PPT 3.0 模式 - 全屏生成器 */
          <div className="flex-1 overflow-hidden">
            <PPTGenerator />
          </div>
        ) : (
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
