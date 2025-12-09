'use client';

/**
 * PromptBar 组件
 * Genspark 风格的极简输入框
 *
 * 特性:
 * - 单行/多行自动切换
 * - 文件上传支持 (拖拽/点击)
 * - URL 自动识别
 * - @资源 提及
 * - 快捷命令 (/ppt, /doc, /design)
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Paperclip,
  Link,
  X,
  Loader2,
  Sparkles,
  FileText,
  Image as ImageIcon,
  Code,
  Presentation,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AgentType, UploadedFile } from '@/lib/agents/types';

interface PromptBarProps {
  placeholder?: string;
  agentType?: AgentType;
  onSubmit: (data: {
    prompt: string;
    files?: UploadedFile[];
    urls?: string[];
  }) => void;
  isProcessing?: boolean;
  suggestions?: string[];
  showAgentHint?: boolean;
  className?: string;
  autoFocus?: boolean;
}

// 快捷命令定义
const QUICK_COMMANDS = [
  { cmd: '/ppt', agent: AgentType.SLIDES, icon: Presentation, label: 'PPT' },
  { cmd: '/doc', agent: AgentType.DOCS, icon: FileText, label: '文档' },
  { cmd: '/design', agent: AgentType.DESIGNER, icon: ImageIcon, label: '设计' },
  { cmd: '/code', agent: AgentType.DEVELOPER, icon: Code, label: '代码' },
];

export function PromptBar({
  placeholder = '描述你想要创建的内容...',
  agentType,
  onSubmit,
  isProcessing = false,
  suggestions = [],
  showAgentHint = true,
  className,
  autoFocus = false,
}: PromptBarProps) {
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showCommands, setShowCommands] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 自动调整高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 200)}px`;
    }
  }, [prompt]);

  // 检测快捷命令
  useEffect(() => {
    if (prompt.startsWith('/')) {
      setShowCommands(true);
    } else {
      setShowCommands(false);
    }
  }, [prompt]);

  // 提交处理
  const handleSubmit = useCallback(() => {
    if (!prompt.trim() && files.length === 0) return;
    if (isProcessing) return;

    onSubmit({
      prompt: prompt.trim(),
      files: files.length > 0 ? files : undefined,
      urls: urls.length > 0 ? urls : undefined,
    });

    // 清空输入
    setPrompt('');
    setFiles([]);
    setUrls([]);
  }, [prompt, files, urls, isProcessing, onSubmit]);

  // 键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // 文件处理
  const handleFiles = useCallback((fileList: FileList) => {
    const newFiles: UploadedFile[] = Array.from(fileList).map((file) => ({
      id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: file.name,
      mimeType: file.type,
      size: file.size,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  // 拖拽处理
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  // 删除文件
  const removeFile = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  // 获取 Agent 图标
  const getAgentIcon = () => {
    switch (agentType) {
      case AgentType.SLIDES:
        return '📊';
      case AgentType.DOCS:
        return '📄';
      case AgentType.DESIGNER:
        return '🎨';
      case AgentType.DEVELOPER:
        return '💻';
      default:
        return '✨';
    }
  };

  return (
    <div className={cn('relative w-full', className)}>
      {/* 主输入区域 */}
      <div
        className={cn(
          'bg-card relative rounded-2xl border shadow-lg transition-all duration-200',
          isDragOver && 'border-primary ring-primary/20 ring-2',
          isProcessing && 'opacity-75'
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* 文件预览 */}
        {files.length > 0 && (
          <div className="border-border flex flex-wrap gap-2 border-b p-3">
            {files.map((file) => (
              <div
                key={file.id}
                className="bg-muted flex items-center gap-2 rounded-full px-3 py-1.5 text-sm"
              >
                <FileText className="text-muted-foreground h-4 w-4" />
                <span className="max-w-[150px] truncate">{file.name}</span>
                <button
                  onClick={() => removeFile(file.id)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 输入框 */}
        <div className="flex items-end gap-3 p-3">
          {/* Agent 图标 */}
          {showAgentHint && (
            <div className="bg-primary/10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-xl">
              {getAgentIcon()}
            </div>
          )}

          {/* 文本输入 */}
          <div className="min-w-0 flex-1">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={isProcessing}
              autoFocus={autoFocus}
              className="text-foreground placeholder:text-muted-foreground w-full resize-none border-none bg-transparent text-base leading-relaxed outline-none"
              rows={1}
              style={{ minHeight: '24px', maxHeight: '200px' }}
            />
          </div>

          {/* 操作按钮 */}
          <div className="flex flex-shrink-0 items-center gap-2">
            {/* 添加文件 */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
            >
              <Paperclip className="h-5 w-5" />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />

            {/* 添加链接 */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground"
              disabled={isProcessing}
            >
              <Link className="h-5 w-5" />
            </Button>

            {/* 发送按钮 */}
            <Button
              type="button"
              size="icon"
              className="bg-primary hover:bg-primary/90 rounded-full"
              onClick={handleSubmit}
              disabled={isProcessing || (!prompt.trim() && files.length === 0)}
            >
              {isProcessing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* 快捷命令提示 */}
      <AnimatePresence>
        {showCommands && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="bg-card absolute bottom-full left-0 right-0 mb-2 rounded-lg border p-2 shadow-lg"
          >
            <div className="flex items-center gap-2 text-sm">
              {QUICK_COMMANDS.filter((cmd) =>
                cmd.cmd.startsWith(prompt.toLowerCase())
              ).map((cmd) => (
                <button
                  key={cmd.cmd}
                  className="bg-muted hover:bg-muted/80 flex items-center gap-2 rounded-full px-3 py-1.5 transition-colors"
                  onClick={() => {
                    setPrompt('');
                    setShowCommands(false);
                    // 触发 Agent 切换
                  }}
                >
                  <cmd.icon className="h-4 w-4" />
                  <span>{cmd.label}</span>
                  <span className="text-muted-foreground">{cmd.cmd}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 建议提示 */}
      {suggestions.length > 0 && !showCommands && (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((suggestion, i) => (
            <button
              key={i}
              className="bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors"
              onClick={() => setPrompt(suggestion)}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default PromptBar;
