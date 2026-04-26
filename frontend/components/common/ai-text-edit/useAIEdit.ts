'use client';

/**
 * useAIEdit Hook
 *
 * A hook that encapsulates all AI editing logic including:
 * - State management for input and preview modals
 * - API calls for AI editing
 * - Selection tracking and context gathering
 * - Error recovery and debounce protection
 *
 * Usage:
 * ```tsx
 * const aiEdit = useAIEdit({
 *   topicId,
 *   reportId,
 *   onSuccess: () => toast.success('编辑已应用'),
 *   onError: (e) => toast.error(e.message),
 * });
 *
 * // Pass to TextSelectionContextMenu
 * <TextSelectionContextMenu onOpenAIEdit={aiEdit.handleOpenEdit} />
 *
 * // Render modals
 * {aiEdit.renderModals()}
 * ```
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { aiEditReport } from '@/lib/api/topic-insights';
import type {
  AIEditOperation,
  AIEditReportDto,
} from '@/lib/api/topic-insights';
import type { SelectionInfo } from '@/components/ai-insights/panels/TextSelectionContextMenu';
import type { EditContext } from './AIEditInputModal';

// Constants for validation
export const MAX_SELECTION_LENGTH = 2000;
export const MAX_CONTEXT_LENGTH = 3000;
export const MAX_INSTRUCTION_LENGTH = 500;

export interface UseAIEditOptions {
  /** Topic ID for API calls */
  topicId: string;
  /** Report ID for API calls */
  reportId: string;
  /** Callback when edit is successfully applied */
  onSuccess?: (editedText: string, originalText: string) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Context information for AI */
  context?: EditContext;
  /** Full content of the current section (for better AI understanding) */
  fullContent?: string;
  /** Callback to replace selected text in the editor */
  onReplaceText?: (original: string, edited: string) => void;
}

export interface UseAIEditReturn {
  // Modal states
  isInputModalOpen: boolean;
  isPreviewModalOpen: boolean;

  // Edit data
  selectedText: string;
  editedText: string;
  selectionInfo: SelectionInfo | null;
  instruction: string;

  // Loading and error states
  isLoading: boolean;
  error: Error | null;

  // Context
  editContext: EditContext | null;

  // Validation
  validationError: string | null;

  // Actions
  /** Called when user clicks "AI Edit" in context menu */
  handleOpenEdit: (selection: SelectionInfo) => void;
  /** Called when user submits the edit instruction */
  handleSubmitEdit: (
    instruction: string,
    operation?: AIEditOperation
  ) => Promise<void>;
  /** Called when user applies the edit */
  handleApplyEdit: () => void;
  /** Called to regenerate with same instruction */
  handleRegenerate: () => Promise<void>;
  /** Close input modal */
  closeInputModal: () => void;
  /** Close preview modal */
  closePreviewModal: () => void;
  /** Clear error state */
  clearError: () => void;
  /** Reset all state */
  reset: () => void;
}

/**
 * Get user-friendly error message
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('403') || message.includes('forbidden')) {
      return '您没有权限编辑此报告';
    }
    if (message.includes('404') || message.includes('not found')) {
      return '报告不存在或已被删除';
    }
    if (message.includes('timeout') || message.includes('timed out')) {
      return 'AI 处理超时，请稍后重试';
    }
    if (message.includes('network') || message.includes('fetch')) {
      return '网络连接失败，请检查网络后重试';
    }
    if (message.includes('conflict') || message.includes('version')) {
      return '报告已被其他用户修改，请刷新后重试';
    }
    return error.message;
  }
  return '编辑失败，请重试';
}

export function useAIEdit({
  topicId,
  reportId,
  onSuccess,
  onError,
  context,
  fullContent,
  onReplaceText,
}: UseAIEditOptions): UseAIEditReturn {
  // Modal states
  const [isInputModalOpen, setIsInputModalOpen] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

  // Edit data
  const [selectedText, setSelectedText] = useState('');
  const [editedText, setEditedText] = useState('');
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(
    null
  );
  const [instruction, setInstruction] = useState('');
  const [lastOperation, setLastOperation] = useState<
    AIEditOperation | undefined
  >();

  // Loading and error states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Ref for preventing concurrent requests (debounce protection)
  const pendingRequestRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Cancel any pending request
      pendingRequestRef.current?.abort();
    };
  }, []);

  // Memoized context
  const editContext = useMemo(() => context || null, [context]);

  // Validate selection
  const validateSelection = useCallback((text: string): string | null => {
    if (!text || text.trim().length === 0) {
      return '请选择要编辑的文本';
    }
    if (text.length > MAX_SELECTION_LENGTH) {
      return `选中文本过长（${text.length} 字），最多支持 ${MAX_SELECTION_LENGTH} 字`;
    }
    return null;
  }, []);

  // Handle opening the edit input modal
  const handleOpenEdit = useCallback(
    (selection: SelectionInfo) => {
      // Validate selection first
      const validationErr = validateSelection(selection.text);
      if (validationErr) {
        setValidationError(validationErr);
        onError?.(new Error(validationErr));
        return;
      }

      setSelectedText(selection.text);
      setSelectionInfo(selection);
      setEditedText('');
      setInstruction('');
      setError(null);
      setValidationError(null);
      setIsInputModalOpen(true);
    },
    [validateSelection, onError]
  );

  // Handle submitting the edit instruction
  const handleSubmitEdit = useCallback(
    async (editInstruction: string, operation?: AIEditOperation) => {
      // Prevent concurrent requests
      if (isLoading || !topicId || !reportId || !selectedText) {
        return;
      }

      // Cancel any pending request
      pendingRequestRef.current?.abort();
      pendingRequestRef.current = new AbortController();

      setInstruction(editInstruction);
      setLastOperation(operation);
      setIsInputModalOpen(false);
      setIsPreviewModalOpen(true);
      setIsLoading(true);
      setError(null);
      setEditedText(''); // Clear previous result

      try {
        // Build the API request with context matching info
        const dto: AIEditReportDto = {
          operation: operation || 'rewrite',
          selectedText,
          context: editInstruction,
          fullContent: fullContent?.slice(0, MAX_CONTEXT_LENGTH),
          // Pass selector context for reliable text matching
          selectorPrefix: selectionInfo?.selectorPrefix,
          selectorSuffix: selectionInfo?.selectorSuffix,
        };

        const result = await aiEditReport(topicId, reportId, dto);

        // Only update state if still mounted
        if (isMountedRef.current) {
          setEditedText(result.editedContent || '');
        }
      } catch (err) {
        // Only update state if still mounted and not aborted
        if (
          isMountedRef.current &&
          !(err instanceof DOMException && err.name === 'AbortError')
        ) {
          const error =
            err instanceof Error ? err : new Error(getErrorMessage(err));
          setError(error);
          onError?.(error);
          // Keep preview modal open for retry - don't close it
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [isLoading, topicId, reportId, selectedText, fullContent, onError]
  );

  // Handle applying the edit
  const handleApplyEdit = useCallback(() => {
    if (editedText && selectedText) {
      // Call the replace callback if provided
      onReplaceText?.(selectedText, editedText);
      onSuccess?.(editedText, selectedText);
    }
    setIsPreviewModalOpen(false);
    // Reset after successful apply
    setSelectedText('');
    setEditedText('');
    setSelectionInfo(null);
    setInstruction('');
    setLastOperation(undefined);
    setError(null);
  }, [editedText, selectedText, onReplaceText, onSuccess]);

  // Handle regenerating with the same instruction
  const handleRegenerate = useCallback(async () => {
    if (!instruction && !lastOperation) {
      return;
    }

    // Prevent concurrent requests
    if (isLoading) {
      return;
    }

    // Cancel any pending request
    pendingRequestRef.current?.abort();
    pendingRequestRef.current = new AbortController();

    setIsLoading(true);
    setError(null);
    setEditedText(''); // Clear previous result

    try {
      const dto: AIEditReportDto = {
        operation: lastOperation || 'rewrite',
        selectedText,
        context: instruction,
        fullContent: fullContent?.slice(0, MAX_CONTEXT_LENGTH),
        // Pass selector context for reliable text matching
        selectorPrefix: selectionInfo?.selectorPrefix,
        selectorSuffix: selectionInfo?.selectorSuffix,
      };

      const result = await aiEditReport(topicId, reportId, dto);

      if (isMountedRef.current) {
        setEditedText(result.editedContent || '');
      }
    } catch (err) {
      if (
        isMountedRef.current &&
        !(err instanceof DOMException && err.name === 'AbortError')
      ) {
        const error =
          err instanceof Error ? err : new Error(getErrorMessage(err));
        setError(error);
        onError?.(error);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [
    topicId,
    reportId,
    selectedText,
    selectionInfo,
    instruction,
    lastOperation,
    fullContent,
    onError,
    isLoading,
  ]);

  // Close input modal
  const closeInputModal = useCallback(() => {
    setIsInputModalOpen(false);
  }, []);

  // Close preview modal
  const closePreviewModal = useCallback(() => {
    if (!isLoading) {
      // Cancel any pending request
      pendingRequestRef.current?.abort();
      setIsPreviewModalOpen(false);
      // Reset state
      setSelectedText('');
      setEditedText('');
      setSelectionInfo(null);
      setInstruction('');
      setLastOperation(undefined);
      setError(null);
    }
  }, [isLoading]);

  // Clear error state
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Reset all state
  const reset = useCallback(() => {
    pendingRequestRef.current?.abort();
    setSelectedText('');
    setEditedText('');
    setSelectionInfo(null);
    setInstruction('');
    setLastOperation(undefined);
    setIsLoading(false);
    setError(null);
    setValidationError(null);
  }, []);

  return {
    // Modal states
    isInputModalOpen,
    isPreviewModalOpen,

    // Edit data
    selectedText,
    editedText,
    selectionInfo,
    instruction,

    // Loading and error states
    isLoading,
    error,

    // Context
    editContext,

    // Validation
    validationError,

    // Actions
    handleOpenEdit,
    handleSubmitEdit,
    handleApplyEdit,
    handleRegenerate,
    closeInputModal,
    closePreviewModal,
    clearError,
    reset,
  };
}

export default useAIEdit;
