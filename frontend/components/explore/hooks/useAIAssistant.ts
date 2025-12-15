import { useState, useRef, useEffect } from 'react';
import type { AIMessage, AIInsight, Resource } from '../types';
import {
  AIContextBuilder,
  type Resource as AIResource,
} from '@/lib/ai-office/context-builder';

export function useAIAssistant() {
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiInsights, setAiInsights] = useState<AIInsight[]>([]);
  const [aiMethodology, setAiMethodology] = useState<AIInsight[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const attachmentFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [aiMessages]);

  const handleAttachmentClick = () => {
    attachmentFileInputRef.current?.click();
  };

  const handleAttachmentFileChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles = Array.from(files);
    setAttachments((prev) => [...prev, ...newFiles]);

    if (e.target) {
      e.target.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const clearMessages = () => {
    setAiMessages([]);
    setAiSummary(null);
    setAiInsights([]);
    setAiMethodology([]);
    setAttachments([]);
  };

  return {
    // State
    aiMessages,
    aiInput,
    aiLoading,
    aiSummary,
    aiInsights,
    aiMethodology,
    isStreaming,
    attachments,
    chatEndRef,
    attachmentFileInputRef,

    // State setters
    setAiMessages,
    setAiInput,
    setAiLoading,
    setAiSummary,
    setAiInsights,
    setAiMethodology,
    setIsStreaming,
    setAttachments,

    // Actions
    handleAttachmentClick,
    handleAttachmentFileChange,
    removeAttachment,
    clearMessages,
  };
}
