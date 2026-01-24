'use client';

import { useState } from 'react';
import NoteEditor from './NoteEditor';
import CommentsList from '../../common/comments/CommentsList';
import AIAssistant from '../../ai-ask/AIAssistant';
import KnowledgeGraphLinker from './KnowledgeGraphLinker';

interface ResourceDetailPanelProps {
  resourceId: string;
  noteId?: string;
  defaultTab?: 'notes' | 'comments' | 'ai' | 'graph';
  pdfContext?: string; // PDF文本内容，用于AI上下文
}

/**
 * 资源详情侧边面板
 *
 * 集成功能：
 * - 笔记编辑
 * - 评论讨论
 * - AI助手
 * - 知识图谱
 */
export default function ResourceDetailPanel({
  resourceId,
  noteId,
  defaultTab = 'notes',
  pdfContext,
}: ResourceDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<
    'notes' | 'comments' | 'ai' | 'graph'
  >(defaultTab);
  const [note, setNote] = useState<any>(null);

  const tabs = [
    {
      id: 'notes' as const,
      name: '笔记',
      icon: (
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
      ),
    },
    {
      id: 'comments' as const,
      name: '评论',
      icon: (
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      ),
    },
    {
      id: 'ai' as const,
      name: 'AI助手',
      icon: (
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
      ),
    },
    {
      id: 'graph' as const,
      name: '知识图谱',
      icon: (
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
          />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex h-full flex-col bg-gray-50">
      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.name}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'notes' && (
          <div className="p-6">
            <NoteEditor
              resourceId={resourceId}
              noteId={noteId}
              onSave={(savedNote) => setNote(savedNote)}
            />
          </div>
        )}

        {activeTab === 'comments' && (
          <div className="p-6">
            <CommentsList resourceId={resourceId} />
          </div>
        )}

        {activeTab === 'ai' && note && (
          <div className="p-6">
            <AIAssistant
              noteId={note.id}
              existingInsights={note.aiInsights}
              pdfContext={pdfContext}
              onExplanationAdded={(explanation) => {
                // Update note's AI insights
                setNote({
                  ...note,
                  aiInsights: {
                    ...note.aiInsights,
                    explanations: [
                      ...(note.aiInsights?.explanations || []),
                      explanation,
                    ],
                  },
                });
              }}
            />
          </div>
        )}

        {activeTab === 'ai' && !note && (
          <div className="p-6">
            <div className="py-12 text-center">
              <svg
                className="mx-auto h-12 w-12 text-gray-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
              <p className="mt-2 text-sm text-gray-500">
                请先创建笔记后使用AI助手
              </p>
              <button
                onClick={() => setActiveTab('notes')}
                className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                前往笔记
              </button>
            </div>
          </div>
        )}

        {activeTab === 'graph' && note && (
          <div className="p-6">
            <KnowledgeGraphLinker
              noteId={note.id}
              resourceId={resourceId}
              linkedNodes={note.graphNodes || []}
              onNodeLinked={(node) => {
                setNote({
                  ...note,
                  graphNodes: [...(note.graphNodes || []), node],
                });
              }}
              onNodeUnlinked={(nodeId) => {
                setNote({
                  ...note,
                  graphNodes: (note.graphNodes || []).filter(
                    (n) => n.id !== nodeId
                  ),
                });
              }}
            />
          </div>
        )}

        {activeTab === 'graph' && !note && (
          <div className="p-6">
            <div className="py-12 text-center">
              <svg
                className="mx-auto h-12 w-12 text-gray-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                />
              </svg>
              <p className="mt-2 text-sm text-gray-500">
                请先创建笔记后关联知识图谱
              </p>
              <button
                onClick={() => setActiveTab('notes')}
                className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                前往笔记
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
