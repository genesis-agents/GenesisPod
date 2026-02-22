'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AIMessage } from '../utils/types';
import { extractImagesFromMarkdown } from '../utils';
import { Base64Image } from '../resources/Base64Image';
import TextSelectionToolbar from '@/components/ui/TextSelectionToolbar';
import { useTranslation } from '@/lib/i18n/i18n-context';
import { ClientDate } from '@/components/common/ClientDate';

interface AIChatMessagesProps {
  aiMessages: AIMessage[];
  isStreaming: boolean;
  aiModel: string;
  aiModels: Array<Record<string, unknown>>;
  resourceId?: string;
  onContextMenu?: (e: React.MouseEvent, text: string) => void;
  onAskAI?: (text: string) => void;
  chatEndRef: React.RefObject<HTMLDivElement>;
}

export default function AIChatMessages({
  aiMessages,
  isStreaming,
  aiModel,
  aiModels,
  resourceId,
  onContextMenu,
  onAskAI,
  chatEndRef,
}: AIChatMessagesProps) {
  const { t } = useTranslation();

  return (
    <TextSelectionToolbar
      resourceId={resourceId}
      onAskAI={onAskAI}
      onAddToNotes={(text) => {
        onContextMenu?.({} as React.MouseEvent<Element, MouseEvent>, text);
      }}
    >
      <div className="space-y-3 border-t border-gray-200 pt-4">
        {aiMessages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`rounded-lg px-3 py-2 ${
                msg.role === 'user'
                  ? 'max-w-[80%] bg-gradient-to-br from-red-500 to-red-600 text-white'
                  : 'w-full cursor-text select-text bg-gray-100 text-gray-800'
              }`}
            >
              <div className="prose-xs prose !max-w-none text-xs leading-relaxed [&>*]:my-1 [&>ol]:my-1 [&>p]:my-1 [&>ul]:my-1">
                {(() => {
                  const { images, textContent } = extractImagesFromMarkdown(
                    msg.content
                  );
                  return (
                    <div>
                      {images.map((img, idx) => (
                        <Base64Image key={idx} src={img.src} alt={img.alt} />
                      ))}
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {textContent}
                      </ReactMarkdown>
                    </div>
                  );
                })()}
              </div>
              <div
                className={`mt-1 text-[10px] ${
                  msg.role === 'user' ? 'text-red-100' : 'text-gray-500'
                }`}
              >
                <ClientDate date={msg.timestamp} format="time" />
              </div>
            </div>
          </div>
        ))}

        {/* Inline Loading Message */}
        {isStreaming && (
          <div className="flex justify-start">
            <div className="w-full rounded-lg bg-gray-100 px-3 py-2 text-gray-900">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-red-600"></div>
                <p className="text-xs">
                  {(aiModels.find((m) => m.modelId === aiModel)
                    ?.name as string) || aiModel}{' '}
                  {t('explore.aiPanel.thinking') || 'is thinking...'}
                </p>
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>
    </TextSelectionToolbar>
  );
}
