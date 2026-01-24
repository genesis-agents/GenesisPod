'use client';
import { config } from '@/lib/utils/config';

import React, { useState } from 'react';
import { Sparkles, Loader2, CheckCircle } from 'lucide-react';
import { useDocumentStore } from '@/stores/aiOfficeStore';

import { logger } from '@/lib/utils/logger';
export default function QuickGenerateInput() {
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const { addDocument, setCurrentDocument } = useDocumentStore();

  const handleGenerate = async () => {
    if (!input.trim() || isGenerating) return;

    setIsGenerating(true);
    setError('');
    setSuccess(false);

    try {
      // 调用快速生成API - 修复:添加/v1前缀
      const response = await fetch(
        `${config.apiUrl}/ai-office/quick-generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: input,
            autoResearch: true,
            autoMedia: true,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Generation failed');
      }

      const result = await response.json();

      // 创建新文档
      const newDocumentId = `doc-${Date.now()}`;
      const newDocument = {
        _id: newDocumentId,
        userId: 'current-user',
        type: 'article' as const,
        title: result.title || '未命名文档',
        status: 'completed' as const,
        resources: [],
        aiConfig: {
          model: result.metadata?.model || 'grok',
          language: 'zh-CN',
          detailLevel: 3,
          professionalLevel: 3,
        },
        generationHistory: [
          {
            timestamp: new Date(),
            action: 'create' as const,
            aiModel: result.metadata?.model || 'grok',
          },
        ],
        versions: [],
        content: {
          markdown:
            result.summary +
            '\n\n' +
            result.sections
              .map((s: any) => `## ${s.title}\n\n${s.content}`)
              .join('\n\n'),
        },
        metadata: {
          wordCount: result.summary.length,
          lastEditedBy: 'AI Assistant',
          ...result.metadata,
        },
        tags: [],
        collaborators: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      addDocument(newDocument as any);
      setCurrentDocument(newDocumentId);
      setSuccess(true);
      setInput('');

      // 3秒后清除成功提示
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      logger.error('Generation failed:', err);
      setError(err.message || 'Failed to generate document. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleGenerate();
    }
  };

  return (
    <div className="quick-generate-container mx-auto max-w-4xl p-8">
      <div className="mb-6">
        <h2 className="mb-3 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-3xl font-bold text-transparent">
          ✨ Quick Generate
        </h2>
        <p className="text-lg text-gray-600">
          Describe what you want to create, and AI will do the rest
        </p>
      </div>

      <div className="relative">
        <textarea
          className="h-48 w-full resize-none rounded-xl border-2 border-gray-300 p-5 text-base shadow-sm transition-shadow hover:shadow-md focus:border-blue-500 focus:outline-none"
          placeholder="Describe the document you want to create...

Examples:
• Create a business plan for a SaaS startup focused on AI tools for developers
• Generate a research paper on the impact of climate change on coastal cities
• Make a presentation about the future of renewable energy and sustainability
• Write a technical blog about React Server Components and their benefits"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isGenerating}
        />

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {success && (
          <div className="mt-3 flex items-center space-x-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-600">
            <CheckCircle className="h-4 w-4" />
            <span>
              Document generated successfully! Check the editor on the right.
            </span>
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={!input.trim() || isGenerating}
          className="mt-4 flex w-full items-center justify-center space-x-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4 text-lg font-semibold text-white shadow-lg transition-all hover:from-blue-700 hover:to-purple-700 hover:shadow-xl disabled:cursor-not-allowed disabled:from-gray-300 disabled:to-gray-300"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Generating with AI...</span>
            </>
          ) : (
            <>
              <Sparkles className="h-6 w-6" />
              <span>Generate with AI</span>
            </>
          )}
        </button>

        <div className="mt-4 text-center text-sm text-gray-500">
          Press <kbd className="rounded bg-gray-100 px-2 py-1">Ctrl</kbd> +{' '}
          <kbd className="rounded bg-gray-100 px-2 py-1">Enter</kbd> to generate
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 text-sm">
        <div className="flex items-start space-x-3 rounded-lg bg-green-50 p-4">
          <span className="text-xl text-green-500">✓</span>
          <div>
            <div className="font-semibold text-green-900">Auto Research</div>
            <div className="text-green-700">
              AI compiles findings automatically
            </div>
          </div>
        </div>
        <div className="flex items-start space-x-3 rounded-lg bg-blue-50 p-4">
          <span className="text-xl text-blue-500">✓</span>
          <div>
            <div className="font-semibold text-blue-900">Smart Media</div>
            <div className="text-blue-700">Suggests images and diagrams</div>
          </div>
        </div>
        <div className="flex items-start space-x-3 rounded-lg bg-purple-50 p-4">
          <span className="text-xl text-purple-500">✓</span>
          <div>
            <div className="font-semibold text-purple-900">
              Professional Format
            </div>
            <div className="text-purple-700">Well-structured output</div>
          </div>
        </div>
        <div className="flex items-start space-x-3 rounded-lg bg-orange-50 p-4">
          <span className="text-xl text-orange-500">✓</span>
          <div>
            <div className="font-semibold text-orange-900">
              Multi-Format Export
            </div>
            <div className="text-orange-700">PDF, Word, Markdown</div>
          </div>
        </div>
      </div>
    </div>
  );
}
