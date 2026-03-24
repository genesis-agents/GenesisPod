'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  useConsciousness,
  useConsciousnessConversation,
} from '@/hooks/domain/useConsciousness';
import { useI18n } from '@/lib/i18n/i18n-context';
import { logger } from '@/lib/utils/logger';
import {
  ArrowLeft,
  Brain,
  Send,
  Loader2,
  User as UserIcon,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface AvatarChatProps {
  conversationId: string;
  onBack: () => void;
}

export function AvatarChat({
  conversationId,
  onBack,
}: AvatarChatProps) {
  const { t } = useI18n();
  const { sendMessage, isSending } = useConsciousness();
  const {
    data: conversation,
    refresh: refreshConversation,
  } = useConsciousnessConversation(conversationId);

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.messages]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isSending) return;
    const message = input.trim();
    setInput('');

    try {
      await sendMessage(conversationId, message);
      void refreshConversation();
    } catch (error) {
      logger.error('Failed to send message', error);
    }
  }, [input, isSending, conversationId, sendMessage, refreshConversation]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  if (!conversation) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-white/10">
        <button
          onClick={onBack}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-gray-400" />
        </button>
        <div className="h-8 w-8 rounded-full bg-purple-600/30 flex items-center justify-center">
          <Brain className="h-4 w-4 text-purple-400" />
        </div>
        <div>
          <h3 className="text-sm font-medium text-white">
            {conversation.profile?.name ?? 'Avatar'}
          </h3>
          <p className="text-xs text-gray-500">{conversation.title}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {conversation.messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Brain className="h-12 w-12 text-purple-600/30 mb-3" />
            <p className="text-gray-500">
              {t(
                'consciousness.startChat',
                'Start a conversation with this digital twin.',
              )}
            </p>
          </div>
        )}

        {conversation.messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${
              msg.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {msg.role === 'avatar' && (
              <div className="h-8 w-8 rounded-full bg-purple-600/30 flex-shrink-0 flex items-center justify-center">
                <Brain className="h-4 w-4 text-purple-400" />
              </div>
            )}
            <div
              className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white/10 text-gray-200'
              }`}
            >
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.content}
                </ReactMarkdown>
              </div>
            </div>
            {msg.role === 'user' && (
              <div className="h-8 w-8 rounded-full bg-blue-600/30 flex-shrink-0 flex items-center justify-center">
                <UserIcon className="h-4 w-4 text-blue-400" />
              </div>
            )}
          </div>
        ))}

        {isSending && (
          <div className="flex gap-3 justify-start">
            <div className="h-8 w-8 rounded-full bg-purple-600/30 flex-shrink-0 flex items-center justify-center">
              <Brain className="h-4 w-4 text-purple-400" />
            </div>
            <div className="bg-white/10 rounded-2xl px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-white/10">
        <div className="flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t(
              'consciousness.messagePlaceholder',
              'Type a message...',
            )}
            rows={1}
            className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            className="p-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl transition-colors"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
