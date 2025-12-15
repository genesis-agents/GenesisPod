'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AIMessage } from '../types';
import { extractImagesFromMarkdown } from '../utils';
import { Base64Image } from '../Base64Image';

interface AIChatMessagesProps {
  aiMessages: AIMessage[];
  isStreaming: boolean;
  aiModel: string;
  aiModels: any[];
  onContextMenu: (e: React.MouseEvent, text: string) => void;
  chatEndRef: React.RefObject<HTMLDivElement>;
}

export default function AIChatMessages({
  aiMessages,
  isStreaming,
  aiModel,
  aiModels,
  onContextMenu,
  chatEndRef,
}: AIChatMessagesProps) {
  return (
    <div className="space-y-3 border-t border-gray-200 pt-4">
      {aiMessages.map((msg, i) => (
        <div
          key={i}
          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[80%] rounded-lg px-3 py-2 ${
              msg.role === 'user'
                ? 'bg-gradient-to-br from-red-500 to-red-600 text-white'
                : 'bg-gray-100 text-gray-800'
            }`}
            onContextMenu={
              msg.role === 'assistant'
                ? (e) => onContextMenu(e, msg.content)
                : undefined
            }
          >
            <div className="prose-xs prose max-w-none text-xs leading-relaxed [&>*]:my-1 [&>ol]:my-1 [&>p]:my-1 [&>ul]:my-1">
              {(() => {
                const { images, textContent } = extractImagesFromMarkdown(
                  msg.content
                );
                return (
                  <>
                    {images.map((img, idx) => (
                      <Base64Image key={idx} src={img.src} alt={img.alt} />
                    ))}
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {textContent}
                    </ReactMarkdown>
                  </>
                );
              })()}
            </div>
            <div
              className={`mt-1 text-[10px] ${
                msg.role === 'user' ? 'text-red-100' : 'text-gray-500'
              }`}
            >
              {new Date(msg.timestamp).toLocaleTimeString()}
            </div>
          </div>
        </div>
      ))}

      {/* Inline Loading Message */}
      {isStreaming && (
        <div className="flex justify-start">
          <div className="max-w-[80%] rounded-lg bg-gray-100 px-3 py-2 text-gray-900">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-red-600"></div>
              <p className="text-xs">
                {aiModels.find((m) => m.modelId === aiModel)?.name || aiModel}
                正在思考...
              </p>
            </div>
          </div>
        </div>
      )}

      <div ref={chatEndRef} />
    </div>
  );
}
