'use client';

/**
 * AI Edit Input Modal
 *
 * A modal for users to input their editing intent with:
 * - Selected text preview
 * - Quick operation tags (rewrite/polish/expand/compress)
 * - Custom instruction text input
 * - Cancel and submit buttons
 */

import { useState, useCallback, useMemo } from 'react';
import {
  RefreshCw,
  Sparkles,
  Expand,
  Minimize2,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/common';
import type { AIEditOperation } from '../types';

// Validation constants
const MAX_SELECTION_LENGTH = 2000;
const MAX_INSTRUCTION_LENGTH = 500;

// Preset operation configurations
const PRESET_OPERATIONS: Array<{
  id: AIEditOperation;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}> = [
  {
    id: 'rewrite',
    label: '重写',
    icon: RefreshCw,
    description: '用不同的表达方式重新撰写',
  },
  {
    id: 'polish',
    label: '润色',
    icon: Sparkles,
    description: '改善文字流畅度和表达',
  },
  {
    id: 'expand',
    label: '扩展',
    icon: Expand,
    description: '添加更多细节和论述',
  },
  {
    id: 'compress',
    label: '精简',
    icon: Minimize2,
    description: '保留核心内容，去除冗余',
  },
];

export interface EditContext {
  sectionTitle?: string;
  dimensionName?: string;
  topicName?: string;
  fullContent?: string;
}

export interface AIEditInputModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Close callback */
  onClose: () => void;
  /** The selected text to edit */
  selectedText: string;
  /** Submit callback with instruction and optional operation */
  onSubmit: (instruction: string, operation?: AIEditOperation) => void;
  /** Whether AI is processing */
  isLoading?: boolean;
  /** Context information for better AI understanding */
  context?: EditContext;
}

export function AIEditInputModal({
  isOpen,
  onClose,
  selectedText,
  onSubmit,
  isLoading = false,
  context,
}: AIEditInputModalProps) {
  const [selectedOperations, setSelectedOperations] = useState<
    AIEditOperation[]
  >([]);
  const [customInstruction, setCustomInstruction] = useState('');

  // Toggle operation selection
  const toggleOperation = useCallback((operation: AIEditOperation) => {
    setSelectedOperations((prev) =>
      prev.includes(operation)
        ? prev.filter((op) => op !== operation)
        : [...prev, operation]
    );
  }, []);

  // Validation
  const validation = useMemo(() => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check selection length
    if (selectedText.length > MAX_SELECTION_LENGTH) {
      errors.push(
        `选中文本过长（${selectedText.length} 字），最多支持 ${MAX_SELECTION_LENGTH} 字`
      );
    } else if (selectedText.length > MAX_SELECTION_LENGTH * 0.8) {
      warnings.push(
        `选中文本较长（${selectedText.length} 字），可能影响编辑效果`
      );
    }

    // Check instruction length
    if (customInstruction.length > MAX_INSTRUCTION_LENGTH) {
      errors.push(
        `编辑指令过长（${customInstruction.length} 字），最多支持 ${MAX_INSTRUCTION_LENGTH} 字`
      );
    }

    return {
      errors,
      warnings,
      isValid: errors.length === 0,
    };
  }, [selectedText.length, customInstruction.length]);

  // Handle submit
  const handleSubmit = useCallback(() => {
    // Validate before submit
    if (!validation.isValid || isLoading) {
      return;
    }

    // Build the instruction from selected operations and custom text
    const parts: string[] = [];

    // Add selected operations
    if (selectedOperations.length > 0) {
      const opLabels = selectedOperations
        .map((op) => PRESET_OPERATIONS.find((p) => p.id === op)?.label)
        .filter(Boolean)
        .join('、');
      parts.push(opLabels);
    }

    // Add custom instruction
    if (customInstruction.trim()) {
      parts.push(customInstruction.trim());
    }

    const instruction = parts.join('，');

    // Use the primary operation if only one is selected
    const primaryOperation =
      selectedOperations.length === 1 ? selectedOperations[0] : undefined;

    onSubmit(instruction, primaryOperation);
  }, [
    selectedOperations,
    customInstruction,
    onSubmit,
    validation.isValid,
    isLoading,
  ]);

  // Check if submit is enabled
  const canSubmit =
    validation.isValid &&
    (selectedOperations.length > 0 || customInstruction.trim().length > 0);

  // Reset state when modal opens/closes
  const handleClose = useCallback(() => {
    setSelectedOperations([]);
    setCustomInstruction('');
    onClose();
  }, [onClose]);

  // Count characters
  const textLength = selectedText.length;

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title="AI 编辑"
      subtitle={context?.sectionTitle || context?.dimensionName}
      size="md"
      closeButtonDisabled={isLoading}
      closeOnOverlayClick={!isLoading}
      closeOnEscape={!isLoading}
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                AI 正在编辑...
              </>
            ) : (
              '开始编辑'
            )}
          </Button>
        </>
      }
    >
      {/* Validation errors */}
      {validation.errors.length > 0 && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
            <div>
              {validation.errors.map((error, idx) => (
                <p key={idx} className="text-sm text-red-600">
                  {error}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Validation warnings */}
      {validation.warnings.length > 0 && validation.errors.length === 0 && (
        <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-500" />
            <div>
              {validation.warnings.map((warning, idx) => (
                <p key={idx} className="text-sm text-yellow-600">
                  {warning}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Selected text preview */}
      <div className="mb-6">
        <label className="mb-2 block text-sm font-medium text-gray-700">
          选中文本
        </label>
        <div
          className={cn(
            'max-h-32 overflow-y-auto rounded-lg border p-3',
            validation.errors.some((e) => e.includes('选中文本'))
              ? 'border-red-300 bg-red-50'
              : 'border-gray-200 bg-gray-50'
          )}
        >
          <p className="whitespace-pre-wrap text-sm text-gray-600">
            {selectedText.length > 300
              ? selectedText.slice(0, 300) + '...'
              : selectedText}
          </p>
        </div>
        <p
          className={cn(
            'mt-1 text-right text-xs',
            textLength > MAX_SELECTION_LENGTH
              ? 'text-red-500'
              : textLength > MAX_SELECTION_LENGTH * 0.8
                ? 'text-yellow-500'
                : 'text-gray-400'
          )}
        >
          共 {textLength} 字
          {textLength > MAX_SELECTION_LENGTH &&
            ` (超出 ${textLength - MAX_SELECTION_LENGTH} 字)`}
        </p>
      </div>

      {/* Quick operations */}
      <div className="mb-6">
        <label className="mb-2 block text-sm font-medium text-gray-700">
          快捷操作
          <span className="ml-1 font-normal text-gray-400">（可多选）</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {PRESET_OPERATIONS.map((op) => {
            const Icon = op.icon;
            const isSelected = selectedOperations.includes(op.id);
            return (
              <button
                key={op.id}
                type="button"
                onClick={() => toggleOperation(op.id)}
                disabled={isLoading}
                title={op.description}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors',
                  'border hover:border-purple-300',
                  isSelected
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
                  isLoading && 'cursor-not-allowed opacity-50'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {op.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom instruction */}
      <div>
        <label
          htmlFor="custom-instruction"
          className="mb-2 block text-sm font-medium text-gray-700"
        >
          编辑要求
        </label>
        <textarea
          id="custom-instruction"
          value={customInstruction}
          onChange={(e) => setCustomInstruction(e.target.value)}
          disabled={isLoading}
          placeholder="请输入您的编辑要求...&#10;例如：让语气更正式、添加数据支撑、改成问答形式"
          rows={3}
          maxLength={MAX_INSTRUCTION_LENGTH + 50} // Allow slight overflow to show warning
          className={cn(
            'w-full resize-none rounded-lg border p-3 text-sm',
            'placeholder:text-gray-400',
            'focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500',
            'disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-50',
            customInstruction.length > MAX_INSTRUCTION_LENGTH
              ? 'border-red-300'
              : 'border-gray-200'
          )}
        />
        <p
          className={cn(
            'mt-1 text-right text-xs',
            customInstruction.length > MAX_INSTRUCTION_LENGTH
              ? 'text-red-500'
              : customInstruction.length > MAX_INSTRUCTION_LENGTH * 0.8
                ? 'text-yellow-500'
                : 'text-gray-400'
          )}
        >
          {customInstruction.length} / {MAX_INSTRUCTION_LENGTH}
        </p>
      </div>

      {/* Context hint */}
      {context && (context.topicName || context.dimensionName) && (
        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3">
          <p className="text-xs text-blue-600">
            AI 将根据研究主题
            {context.topicName && <strong>「{context.topicName}」</strong>}
            {context.dimensionName && (
              <>
                和当前维度<strong>「{context.dimensionName}」</strong>
              </>
            )}
            的上下文进行编辑，确保内容连贯性。
          </p>
        </div>
      )}
    </Modal>
  );
}

export default AIEditInputModal;
