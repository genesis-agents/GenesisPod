/**
 * QuickCommandBar - 快捷指令栏
 *
 * 用户输入快捷指令，转换为研究 TODO
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Send,
  Plus,
  Search,
  FileText,
  RefreshCw,
  Sparkles,
  ChevronDown,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils/common';

interface QuickCommand {
  id: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  template: string;
}

const QUICK_COMMANDS: QuickCommand[] = [
  {
    id: 'deep-dive',
    label: '深入研究',
    icon: <Search className="h-4 w-4" />,
    description: '对某个维度进行更深入的研究',
    template: '请对 {维度} 进行更深入的研究，重点关注 {关注点}',
  },
  {
    id: 'add-dimension',
    label: '新增维度',
    icon: <Plus className="h-4 w-4" />,
    description: '添加一个新的研究维度',
    template: '请新增研究维度：{维度名称}，研究方向：{研究方向}',
  },
  {
    id: 'generate-report',
    label: '生成报告',
    icon: <FileText className="h-4 w-4" />,
    description: '基于当前研究生成报告',
    template: '请基于当前研究结果生成一份完整报告',
  },
  {
    id: 'refresh-data',
    label: '刷新数据',
    icon: <RefreshCw className="h-4 w-4" />,
    description: '重新获取最新数据',
    template: '请刷新 {维度} 的数据，获取最新信息',
  },
  {
    id: 'ai-suggest',
    label: 'AI 建议',
    icon: <Sparkles className="h-4 w-4" />,
    description: '让 AI 给出研究建议',
    template: '请分析当前研究进展，给出下一步建议',
  },
];

interface QuickCommandBarProps {
  topicId: string;
  missionId?: string;
  onSubmit: (instruction: string) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function QuickCommandBar({
  topicId: _topicId,
  missionId: _missionId,
  onSubmit,
  disabled = false,
  placeholder = '输入研究指令，如：深入研究政策环境...',
  className,
}: QuickCommandBarProps) {
  const [input, setInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isSubmitting || disabled) return;

    setIsSubmitting(true);
    try {
      await onSubmit(input.trim());
      setInput('');
    } finally {
      setIsSubmitting(false);
    }
  }, [input, isSubmitting, disabled, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleCommandSelect = useCallback((command: QuickCommand) => {
    setInput(command.template);
    inputRef.current?.focus();
    // Select the first placeholder for easy editing
    setTimeout(() => {
      const match = command.template.match(/\{([^}]+)\}/);
      if (match && inputRef.current) {
        const start = command.template.indexOf(match[0]);
        const end = start + match[0].length;
        inputRef.current.setSelectionRange(start, end);
      }
    }, 0);
  }, []);

  // Keyboard shortcut: Ctrl+K to focus input
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Main input area */}
      <div className="flex items-center gap-2">
        {/* Quick commands dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              className="shrink-0"
            >
              <Plus className="mr-1 h-4 w-4" />
              快捷指令
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            {QUICK_COMMANDS.map((command, index) => (
              <div key={command.id}>
                {index > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  onClick={() => handleCommandSelect(command)}
                  className="flex items-start gap-2 py-2"
                >
                  <span className="text-muted-foreground mt-0.5">
                    {command.icon}
                  </span>
                  <div className="flex flex-col">
                    <span className="font-medium">{command.label}</span>
                    <span className="text-muted-foreground text-xs">
                      {command.description}
                    </span>
                  </div>
                </DropdownMenuItem>
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Input field */}
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setInput(e.target.value)
            }
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || isSubmitting}
            className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-9 w-full rounded-md border px-3 pr-16 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <div className="text-muted-foreground pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs">
            <kbd className="bg-muted rounded px-1.5 py-0.5 text-[10px]">
              Ctrl+K
            </kbd>
          </div>
        </div>

        {/* Submit button */}
        <Button
          onClick={handleSubmit}
          disabled={!input.trim() || disabled || isSubmitting}
          size="sm"
          className="shrink-0"
        >
          {isSubmitting ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          <span className="ml-1.5 hidden sm:inline">发送</span>
        </Button>
      </div>

      {/* Quick action buttons */}
      <div className="flex flex-wrap items-center gap-1.5">
        {QUICK_COMMANDS.slice(0, 3).map((command) => (
          <Button
            key={command.id}
            variant="ghost"
            size="sm"
            onClick={() => handleCommandSelect(command)}
            disabled={disabled}
            className="text-muted-foreground hover:text-foreground h-7 text-xs"
          >
            {command.icon}
            <span className="ml-1">{command.label}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}

export default QuickCommandBar;
