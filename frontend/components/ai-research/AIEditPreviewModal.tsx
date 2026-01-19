'use client';

/**
 * AI Edit Preview Modal
 *
 * A modal for previewing AI edit results before applying them:
 * - Side-by-side comparison of original and edited text
 * - Apply, regenerate, or cancel options
 * - Loading state during AI processing
 */

import { Loader2, RefreshCw, Check, X, AlertCircle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/common';

export interface AIEditPreviewModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Close callback */
  onClose: () => void;
  /** Original text before editing */
  originalText: string;
  /** Edited text from AI */
  editedText: string;
  /** Whether AI is processing */
  isLoading: boolean;
  /** Error state */
  error?: Error | null;
  /** Apply the edit */
  onApply: () => void;
  /** Regenerate the edit */
  onRegenerate: () => void;
  /** Clear error */
  onClearError?: () => void;
  /** Optional: The instruction used for editing (for display) */
  instruction?: string;
}

export function AIEditPreviewModal({
  isOpen,
  onClose,
  originalText,
  editedText,
  isLoading,
  error,
  onApply,
  onRegenerate,
  onClearError,
  instruction,
}: AIEditPreviewModalProps) {
  // Handle close - only allow if not loading
  const handleClose = () => {
    if (!isLoading) {
      onClearError?.();
      onClose();
    }
  };

  // Determine if we have a valid result to show
  const hasResult = !isLoading && !error && editedText;
  const hasError = !isLoading && error;

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title="编辑预览"
      subtitle={
        instruction
          ? `指令: ${instruction.slice(0, 50)}${instruction.length > 50 ? '...' : ''}`
          : undefined
      }
      size="xl"
      closeButtonDisabled={isLoading}
      closeOnOverlayClick={!isLoading}
      closeOnEscape={!isLoading}
      footer={
        isLoading ? (
          <Button variant="outline" onClick={handleClose} disabled>
            取消
          </Button>
        ) : hasError ? (
          // Error state footer
          <>
            <Button variant="outline" onClick={handleClose}>
              <X className="mr-2 h-4 w-4" />
              取消
            </Button>
            <Button onClick={onRegenerate}>
              <RefreshCw className="mr-2 h-4 w-4" />
              重试
            </Button>
          </>
        ) : (
          // Success state footer
          <>
            <Button variant="outline" onClick={handleClose}>
              <X className="mr-2 h-4 w-4" />
              取消
            </Button>
            <Button variant="outline" onClick={onRegenerate}>
              <RefreshCw className="mr-2 h-4 w-4" />
              重新生成
            </Button>
            <Button onClick={onApply} disabled={!editedText}>
              <Check className="mr-2 h-4 w-4" />
              应用修改
            </Button>
          </>
        )
      }
    >
      {isLoading ? (
        // Loading state
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
          <p className="mt-4 text-sm text-gray-500">AI 正在编辑...</p>
          <p className="mt-1 text-xs text-gray-400">这可能需要几秒钟时间</p>
        </div>
      ) : hasError ? (
        // Error state
        <div className="flex flex-col items-center justify-center py-12">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <AlertCircle className="h-8 w-8 text-red-500" />
          </div>
          <p className="mt-4 text-sm font-medium text-gray-900">编辑失败</p>
          <p className="mt-2 max-w-md text-center text-sm text-gray-500">
            {error?.message || '发生未知错误，请重试'}
          </p>
          <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs text-gray-500">
              您可以点击"重试"重新生成，或点击"取消"返回编辑。
              <br />
              如果问题持续存在，请稍后再试。
            </p>
          </div>
        </div>
      ) : (
        // Preview comparison
        <div className="grid grid-cols-2 gap-4">
          {/* Original text */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-700">原文</h4>
              <span className="text-xs text-gray-400">
                {originalText.length} 字
              </span>
            </div>
            <div
              className={cn(
                'max-h-80 overflow-y-auto rounded-lg border p-4',
                'border-red-200 bg-red-50'
              )}
            >
              <p className="whitespace-pre-wrap text-sm text-gray-700">
                {originalText}
              </p>
            </div>
          </div>

          {/* Edited text */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-700">编辑后</h4>
              <span className="text-xs text-gray-400">
                {editedText.length} 字
                {editedText.length !== originalText.length && (
                  <span
                    className={cn(
                      'ml-1',
                      editedText.length > originalText.length
                        ? 'text-green-600'
                        : 'text-red-600'
                    )}
                  >
                    ({editedText.length > originalText.length ? '+' : ''}
                    {editedText.length - originalText.length})
                  </span>
                )}
              </span>
            </div>
            <div
              className={cn(
                'max-h-80 overflow-y-auto rounded-lg border p-4',
                'border-green-200 bg-green-50'
              )}
            >
              <p className="whitespace-pre-wrap text-sm text-gray-700">
                {editedText}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Change summary */}
      {!isLoading && editedText && (
        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3">
          <p className="text-xs text-blue-600">
            {editedText.length === originalText.length
              ? '字数保持不变'
              : editedText.length > originalText.length
                ? `扩展了 ${editedText.length - originalText.length} 字`
                : `精简了 ${originalText.length - editedText.length} 字`}
            。点击"应用修改"将替换选中的文本。
          </p>
        </div>
      )}
    </Modal>
  );
}

export default AIEditPreviewModal;
