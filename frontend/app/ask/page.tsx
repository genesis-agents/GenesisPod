'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { useAIModels, AIModel } from '@/hooks/useAIModels';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  timestamp: Date;
}

interface MixtureResponse {
  model: string;
  modelId: string;
  content: string;
  isCollapsed: boolean;
}

// Helper: render model icon (emoji or image)
function ModelIcon({
  model,
  size = 20,
}: {
  model: AIModel | { icon: string; iconUrl?: string };
  size?: number;
}) {
  const icon = model.icon;
  const iconUrl = 'iconUrl' in model ? model.iconUrl : undefined;

  // Check if icon is emoji (single character or emoji sequence)
  const isEmoji = icon && (icon.length <= 2 || /\p{Emoji}/u.test(icon));

  if (isEmoji && icon) {
    return <span style={{ fontSize: size }}>{icon}</span>;
  }

  if (iconUrl && !iconUrl.startsWith('/icons/')) {
    // It's a real URL, use Image
    return (
      <Image
        src={iconUrl}
        alt=""
        width={size}
        height={size}
        className="rounded"
      />
    );
  }

  // Fallback to default emoji
  return <span style={{ fontSize: size }}>🤖</span>;
}

export default function AskPage() {
  const { user } = useAuth();
  const { models, loading: modelsLoading } = useAIModels();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [mixtureResponses, setMixtureResponses] = useState<MixtureResponse[]>(
    []
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modelSelectorRef = useRef<HTMLDivElement>(null);

  // Set default model when models load
  useEffect(() => {
    if (models.length > 0 && !selectedModel) {
      const defaultModel = models.find((m) => m.isDefault) || models[0];
      setSelectedModel(defaultModel.id);
    }
  }, [models, selectedModel]);

  const selectedModelInfo = models.find((m) => m.id === selectedModel);
  const isMixtureMode = selectedModel === 'mixture';

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, mixtureResponses]);

  // Close model selector when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        modelSelectorRef.current &&
        !modelSelectorRef.current.contains(event.target as Node)
      ) {
        setShowModelSelector(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setMixtureResponses([]);

    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    try {
      if (isMixtureMode) {
        // Mixture mode: call multiple models in parallel
        const chatModels = models
          .filter((m) => m.modelType === 'CHAT')
          .slice(0, 4);
        const responses: MixtureResponse[] = chatModels.map((m) => ({
          model: m.name,
          modelId: m.id,
          content: '',
          isCollapsed: false,
        }));
        setMixtureResponses(responses);

        // Simulate parallel API calls (replace with actual API calls)
        await Promise.all(
          chatModels.map(async (model, index) => {
            await new Promise((resolve) =>
              setTimeout(resolve, 1000 + Math.random() * 2000)
            );
            const simulatedResponse = `This is a response from **${model.name}**.\n\nYour question: "${userMessage.content}"\n\n_Connect to actual AI API for real responses._`;

            setMixtureResponses((prev) => {
              const newResponses = [...prev];
              newResponses[index] = {
                ...newResponses[index],
                content: simulatedResponse,
              };
              return newResponses;
            });
          })
        );

        const mixtureContent = chatModels
          .map(
            (m, i) => `### ${m.name}\n${responses[i]?.content || 'No response'}`
          )
          .join('\n\n---\n\n');

        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: mixtureContent,
            model: 'mixture',
            timestamp: new Date(),
          },
        ]);
      } else {
        // Single model mode
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const simulatedResponse = `This is a response from **${selectedModelInfo?.name || 'AI'}**.\n\nYour question: "${userMessage.content}"\n\n_Connect to actual AI API for real responses._`;

        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: simulatedResponse,
            model: selectedModel,
            timestamp: new Date(),
          },
        ]);
      }
    } catch (error) {
      console.error('Error:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Sorry, an error occurred. Please try again.',
          model: selectedModel,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMixtureCollapse = (index: number) => {
    setMixtureResponses((prev) => {
      const newResponses = [...prev];
      newResponses[index] = {
        ...newResponses[index],
        isCollapsed: !newResponses[index].isCollapsed,
      };
      return newResponses;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Get greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  // Build model list with Mixture option
  const modelOptions = [
    ...models.filter((m) => m.modelType === 'CHAT'),
    {
      id: 'mixture',
      name: 'Mixture',
      provider: 'Multi-Model',
      color: 'from-violet-500 to-fuchsia-500',
      icon: '🔀',
      modelType: 'CHAT' as const,
      isMixture: true,
    },
  ];

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-gray-50/50 to-white">
      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {messages.length === 0 ? (
          /* Welcome Screen - Centered with input */
          <div className="flex flex-1 flex-col items-center justify-center px-4">
            <div className="w-full max-w-2xl">
              {/* Greeting Only */}
              <h1 className="mb-12 text-center text-4xl font-light text-gray-800 md:text-5xl">
                <span className="bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 bg-clip-text text-transparent">
                  {getGreeting()}
                </span>
                {user?.username && (
                  <span className="text-gray-700">, {user.username}</span>
                )}
              </h1>

              {/* Input Box - Centered */}
              <div className="relative">
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm transition-all focus-within:border-purple-300 focus-within:shadow-md">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask anything..."
                    rows={1}
                    className="w-full resize-none rounded-t-2xl bg-transparent px-4 py-4 text-gray-900 placeholder-gray-400 focus:outline-none"
                    disabled={isLoading || modelsLoading}
                  />

                  {/* Bottom Bar */}
                  <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2">
                    <div className="flex items-center gap-2">
                      {/* Model Selector */}
                      <div className="relative" ref={modelSelectorRef}>
                        <button
                          type="button"
                          onClick={() =>
                            setShowModelSelector(!showModelSelector)
                          }
                          disabled={modelsLoading}
                          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-100"
                        >
                          {modelsLoading ? (
                            <span className="text-gray-400">Loading...</span>
                          ) : (
                            <>
                              {isMixtureMode ? (
                                <span className="text-base">🔀</span>
                              ) : selectedModelInfo ? (
                                <ModelIcon
                                  model={selectedModelInfo}
                                  size={18}
                                />
                              ) : (
                                <span className="text-base">🤖</span>
                              )}
                              <span>
                                {isMixtureMode
                                  ? 'Mixture'
                                  : selectedModelInfo?.name || 'Select Model'}
                              </span>
                              <svg
                                className="h-4 w-4 text-gray-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 9l-7 7-7-7"
                                />
                              </svg>
                            </>
                          )}
                        </button>

                        {/* Model Dropdown */}
                        {showModelSelector && (
                          <div className="absolute bottom-full left-0 mb-2 max-h-80 w-72 overflow-y-auto rounded-xl border border-gray-200 bg-white py-2 shadow-xl">
                            <div className="px-3 pb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
                              Select Model
                            </div>
                            {modelOptions.map((model) => (
                              <button
                                key={model.id}
                                type="button"
                                onClick={() => {
                                  setSelectedModel(model.id);
                                  setShowModelSelector(false);
                                }}
                                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-gray-50 ${
                                  selectedModel === model.id
                                    ? 'bg-purple-50'
                                    : ''
                                }`}
                              >
                                <ModelIcon model={model} size={20} />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="truncate font-medium text-gray-900">
                                      {model.name}
                                    </span>
                                    {'isMixture' in model &&
                                      model.isMixture && (
                                        <span className="shrink-0 rounded bg-gradient-to-r from-violet-500 to-fuchsia-500 px-1.5 py-0.5 text-xs text-white">
                                          Multi
                                        </span>
                                      )}
                                  </div>
                                  <span className="text-xs text-gray-500">
                                    {model.provider}
                                  </span>
                                </div>
                                {selectedModel === model.id && (
                                  <svg
                                    className="h-5 w-5 shrink-0 text-purple-600"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Send Button */}
                    <button
                      type="button"
                      onClick={() => handleSubmit()}
                      disabled={!input.trim() || isLoading || modelsLoading}
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white transition-all hover:from-violet-700 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isLoading ? (
                        <svg
                          className="animate-spin\ h-5 w-5"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                      ) : (
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Hint */}
                <p className="mt-3 text-center text-xs text-gray-400">
                  Press Enter to send, Shift+Enter for new line
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Chat Messages */
          <>
            <div className="flex-1 overflow-y-auto px-4 py-6">
              <div className="mx-auto max-w-3xl space-y-6">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                        message.role === 'user'
                          ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white'
                          : 'bg-white shadow-sm ring-1 ring-gray-100'
                      }`}
                    >
                      {message.role === 'assistant' &&
                        message.model &&
                        (() => {
                          const msgModel = models.find(
                            (m) => m.id === message.model
                          );
                          return (
                            <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
                              {message.model === 'mixture' ? (
                                <span className="text-sm">🔀</span>
                              ) : msgModel ? (
                                <ModelIcon model={msgModel} size={14} />
                              ) : (
                                <span className="text-sm">🤖</span>
                              )}
                              {message.model === 'mixture'
                                ? 'Mixture'
                                : msgModel?.name || message.model}
                            </div>
                          );
                        })()}
                      <div
                        className={`prose prose-sm max-w-none ${message.role === 'user' ? 'prose-invert' : ''}`}
                      >
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Mixture Responses */}
                {isLoading && isMixtureMode && mixtureResponses.length > 0 && (
                  <div className="space-y-3">
                    {mixtureResponses.map((response, index) => {
                      const modelInfo = models.find(
                        (m) => m.id === response.modelId
                      );
                      return (
                        <div
                          key={index}
                          className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100"
                        >
                          <button
                            onClick={() => toggleMixtureCollapse(index)}
                            className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
                          >
                            <div className="flex items-center gap-2">
                              {modelInfo ? (
                                <ModelIcon model={modelInfo} size={18} />
                              ) : (
                                <span className="text-lg">🤖</span>
                              )}
                              <span className="font-medium text-gray-900">
                                {response.model}
                              </span>
                              {!response.content && (
                                <span className="flex items-center gap-1 text-xs text-gray-400">
                                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-purple-500" />
                                  Thinking...
                                </span>
                              )}
                            </div>
                            <svg
                              className={`h-5 w-5 text-gray-400 transition-transform ${response.isCollapsed ? '' : 'rotate-180'}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 9l-7 7-7-7"
                              />
                            </svg>
                          </button>
                          {!response.isCollapsed && response.content && (
                            <div className="border-t border-gray-100 px-4 py-3">
                              <div className="prose prose-sm max-w-none">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {response.content}
                                </ReactMarkdown>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Loading for single model */}
                {isLoading && !isMixtureMode && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-gray-100">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          <span
                            className="h-2 w-2 animate-bounce rounded-full bg-purple-500"
                            style={{ animationDelay: '0ms' }}
                          />
                          <span
                            className="h-2 w-2 animate-bounce rounded-full bg-purple-500"
                            style={{ animationDelay: '150ms' }}
                          />
                          <span
                            className="h-2 w-2 animate-bounce rounded-full bg-purple-500"
                            style={{ animationDelay: '300ms' }}
                          />
                        </div>
                        <span className="text-sm text-gray-500">
                          {selectedModelInfo?.name || 'AI'} is thinking...
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input Area - Fixed at Bottom */}
            <div className="border-t border-gray-200 bg-white px-4 py-4">
              <div className="mx-auto max-w-3xl">
                <form onSubmit={handleSubmit}>
                  <div className="rounded-2xl border border-gray-200 bg-white shadow-sm transition-all focus-within:border-purple-300">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      placeholder="Ask anything..."
                      rows={1}
                      className="w-full resize-none rounded-t-2xl bg-transparent px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none"
                      disabled={isLoading}
                    />
                    <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2">
                      <div className="relative" ref={modelSelectorRef}>
                        <button
                          type="button"
                          onClick={() =>
                            setShowModelSelector(!showModelSelector)
                          }
                          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                        >
                          {isMixtureMode ? (
                            <span className="text-base">🔀</span>
                          ) : selectedModelInfo ? (
                            <ModelIcon model={selectedModelInfo} size={18} />
                          ) : (
                            <span className="text-base">🤖</span>
                          )}
                          <span>
                            {isMixtureMode
                              ? 'Mixture'
                              : selectedModelInfo?.name || 'Model'}
                          </span>
                          <svg
                            className="h-4 w-4 text-gray-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </button>
                      </div>
                      <button
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white transition-all hover:from-violet-700 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {isLoading ? (
                          <svg
                            className="h-5 w-5 animate-spin"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                          </svg>
                        ) : (
                          <svg
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
