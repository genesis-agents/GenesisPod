import { useApiPost, useApiGet } from '../core';
import { useStream } from '../core';
import { useCallback, useState } from 'react';

export interface Document {
  id: string;
  title: string;
  content: string;
  type: 'doc' | 'slide' | 'design';
  createdAt: string;
  updatedAt: string;
}

export function useAIOffice() {
  const [generatedContent, setGeneratedContent] = useState<string>('');

  // Document generation with streaming
  const {
    state,
    startPost: startGenerate,
    stop: stopGenerate,
    reset: resetStream,
  } = useStream<{ content: string }>({
    onComplete: (result) => {
      if (result?.content) {
        setGeneratedContent(result.content);
      }
    },
  });

  // Parse user intent
  const { loading: parseLoading, execute: parseIntent } = useApiPost<
    { intent: string; params: Record<string, unknown> },
    { message: string }
  >('/api/ai-office/parse-intent');

  // Export document
  const { loading: exportLoading, execute: exportDoc } = useApiPost<
    { url: string },
    { documentId: string; format: string }
  >('/api/ai-office/export');

  // Get document history
  const {
    data: history,
    loading: historyLoading,
    execute: refreshHistory,
  } = useApiGet<Document[]>('/api/ai-office/history', { immediate: false });

  const generate = useCallback(
    async (prompt: string, type: 'doc' | 'slide' | 'design') => {
      setGeneratedContent('');
      await startGenerate('/api/ai-office/chat', {
        prompt,
        type,
        stream: true,
      });
    },
    [startGenerate]
  );

  const reset = useCallback(() => {
    setGeneratedContent('');
    resetStream();
  }, [resetStream]);

  return {
    // Generation
    generatedContent,
    isGenerating: state.streaming,
    generateProgress: state.progress,
    generateError: state.error,
    generate,
    stopGenerate,
    reset,

    // Intent parsing
    parseIntent,
    isParsing: parseLoading,

    // Export
    exportDoc,
    isExporting: exportLoading,

    // History
    history: history ?? [],
    historyLoading,
    refreshHistory,
  };
}
