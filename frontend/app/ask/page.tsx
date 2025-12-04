'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useAIModels, AIModel } from '@/hooks/useAIModels';
import { config } from '@/lib/config';
import Sidebar from '@/components/layout/Sidebar';
import SessionSidebar from '@/components/ask/SessionSidebar';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  modelId?: string;
  modelName?: string;
  createdAt: string;
}

interface MixtureResponse {
  model: string;
  modelId: string;
  content: string;
  isCollapsed: boolean;
}

// Provider to local icon path mapping
const PROVIDER_ICONS: Record<string, string> = {
  openai: '/icons/ai/openai.svg',
  google: '/icons/ai/gemini.svg',
  anthropic: '/icons/ai/claude.svg',
  xai: '/icons/ai/grok.svg',
};

// Helper: render model icon using local SVG files
function ModelIcon({
  model,
  size = 20,
}: {
  model: AIModel | { icon?: string; iconUrl?: string; provider?: string };
  size?: number;
}) {
  const icon = model.icon || '';
  const iconUrl = 'iconUrl' in model ? model.iconUrl : undefined;
  const provider = (
    'provider' in model ? model.provider || '' : ''
  ).toLowerCase();

  // Priority 1: Use iconUrl if it starts with /icons/ (local path)
  if (iconUrl && iconUrl.startsWith('/icons/')) {
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

  // Priority 2: Use icon if it starts with /icons/ (local path)
  if (icon && icon.startsWith('/icons/')) {
    return (
      <Image src={icon} alt="" width={size} height={size} className="rounded" />
    );
  }

  // Priority 3: Use iconUrl if it's a valid URL (starts with http)
  if (iconUrl && iconUrl.startsWith('http')) {
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

  // Priority 4: Map provider to local icon
  const providerIcon = PROVIDER_ICONS[provider];
  if (providerIcon) {
    return (
      <Image
        src={providerIcon}
        alt=""
        width={size}
        height={size}
        className="rounded"
      />
    );
  }

  // Priority 5: Check if icon is emoji
  const isEmoji = icon && /\p{Emoji}/u.test(icon) && !icon.startsWith('/');
  if (isEmoji) {
    return <span style={{ fontSize: size }}>{icon}</span>;
  }

  // Fallback: default icon
  return (
    <span
      style={{ fontSize: size }}
      className="flex items-center justify-center"
    >
      🤖
    </span>
  );
}

export default function AskPage() {
  const router = useRouter();
  const { user, accessToken: token } = useAuth();
  const { models, loading: modelsLoading } = useAIModels();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [mixtureResponses, setMixtureResponses] = useState<MixtureResponse[]>(
    []
  );
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modelSelectorRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);

  // Filter only CHAT models for the selector
  const chatModels = models.filter((m) => m.modelType === 'CHAT');

  // Set default model when models load
  useEffect(() => {
    if (chatModels.length > 0 && !selectedModel) {
      const defaultModel = chatModels.find((m) => m.isDefault) || chatModels[0];
      setSelectedModel(defaultModel.id);
    }
  }, [chatModels, selectedModel]);

  const selectedModelInfo = chatModels.find((m) => m.id === selectedModel);
  const isMixtureMode = selectedModel === 'mixture';

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, mixtureResponses]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        modelSelectorRef.current &&
        !modelSelectorRef.current.contains(event.target as Node)
      ) {
        setShowModelSelector(false);
      }
      if (
        toolsRef.current &&
        !toolsRef.current.contains(event.target as Node)
      ) {
        setShowTools(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
  };

  // Create a new session
  const createSession = useCallback(async (): Promise<string | null> => {
    if (!token) {
      console.warn('Cannot create session: no auth token');
      return null;
    }

    try {
      const response = await fetch(`${config.apiUrl}/ask/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          modelId: selectedModel !== 'mixture' ? selectedModel : undefined,
        }),
      });

      if (response.ok) {
        const session = await response.json();
        return session.id;
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to create session:', response.status, errorData);
      }
    } catch (error) {
      console.error('Failed to create session:', error);
    }
    return null;
  }, [token, selectedModel]);

  // Send message to session
  const sendMessageToSession = useCallback(
    async (sessionId: string, content: string, modelId?: string) => {
      if (!token) {
        console.warn('Cannot send message: no auth token');
        return null;
      }

      try {
        const response = await fetch(
          `${config.apiUrl}/ask/sessions/${sessionId}/messages`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              content,
              modelId:
                modelId ||
                (selectedModel !== 'mixture' ? selectedModel : undefined),
              webSearch: webSearchEnabled,
            }),
          }
        );

        if (response.ok) {
          return await response.json();
        } else {
          const errorData = await response.json().catch(() => ({}));
          console.error('Failed to send message:', response.status, errorData);
        }
      } catch (error) {
        console.error('Failed to send message:', error);
      }
      return null;
    },
    [token, selectedModel, webSearchEnabled]
  );

  // Load session messages
  const loadSession = useCallback(
    async (sessionId: string) => {
      if (!token) return;

      try {
        const response = await fetch(
          `${config.apiUrl}/ask/sessions/${sessionId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setCurrentSessionId(sessionId);
          setMessages(
            data.messages.map((m: any) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              modelId: m.modelId,
              modelName: m.modelName,
              createdAt: m.createdAt,
            }))
          );
          setMixtureResponses([]);
        }
      } catch (error) {
        console.error('Failed to load session:', error);
      }
    },
    [token]
  );

  // Handle new session
  const handleNewSession = useCallback(() => {
    setCurrentSessionId(null);
    setMessages([]);
    setMixtureResponses([]);
    setInput('');
  }, []);

  // Call real backend AI API with optional context (for mixture mode and fallback)
  const callAIChat = async (
    modelName: string,
    message: string,
    enableWebSearch: boolean = false,
    contextMessages?: Message[]
  ): Promise<string> => {
    // Build messages array with context
    const apiMessages = contextMessages
      ? [
          ...contextMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          { role: 'user' as const, content: message },
        ]
      : undefined;

    const response = await fetch(`${config.apiUrl}/ai/simple-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        messages: apiMessages,
        model: modelName,
        stream: false,
        webSearch: enableWebSearch,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `API Error: ${response.status}`);
    }

    const data = await response.json();
    return data.content || 'No response';
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userContent = input.trim();
    setInput('');
    setIsLoading(true);
    setMixtureResponses([]);

    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    try {
      if (isMixtureMode) {
        // Mixture mode: call multiple models in parallel (legacy behavior)
        const userMessage: Message = {
          id: Date.now().toString(),
          role: 'user',
          content: userContent,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, userMessage]);

        const modelsToCall = chatModels.slice(0, 4);
        const responses: MixtureResponse[] = modelsToCall.map((m) => ({
          model: m.name,
          modelId: m.id,
          content: '',
          isCollapsed: false,
        }));
        setMixtureResponses(responses);

        await Promise.all(
          modelsToCall.map(async (model, index) => {
            try {
              const content = await callAIChat(
                model.modelName,
                userContent,
                webSearchEnabled
              );
              setMixtureResponses((prev) => {
                const newResponses = [...prev];
                newResponses[index] = {
                  ...newResponses[index],
                  content,
                };
                return newResponses;
              });
            } catch (error) {
              setMixtureResponses((prev) => {
                const newResponses = [...prev];
                newResponses[index] = {
                  ...newResponses[index],
                  content: `Error: ${error instanceof Error ? error.message : 'Failed to get response'}`,
                };
                return newResponses;
              });
            }
          })
        );
      } else {
        // Single model mode with session
        let sessionId = currentSessionId;

        // Create session if needed
        if (!sessionId) {
          sessionId = await createSession();
          if (sessionId) {
            setCurrentSessionId(sessionId);
          }
        }

        if (sessionId) {
          // Optimistically add user message
          const tempUserMessage: Message = {
            id: 'temp-user-' + Date.now(),
            role: 'user',
            content: userContent,
            createdAt: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, tempUserMessage]);

          // Send message and get response
          const result = await sendMessageToSession(sessionId, userContent);

          if (result) {
            // Replace temp message with real messages
            setMessages((prev) => {
              const withoutTemp = prev.filter((m) => !m.id.startsWith('temp-'));
              return [
                ...withoutTemp,
                {
                  id: result.userMessage.id,
                  role: 'user',
                  content: result.userMessage.content,
                  modelId: result.userMessage.modelId,
                  modelName: result.userMessage.modelName,
                  createdAt: result.userMessage.createdAt,
                },
                {
                  id: result.assistantMessage.id,
                  role: 'assistant',
                  content: result.assistantMessage.content,
                  modelId: result.assistantMessage.modelId,
                  modelName: result.assistantMessage.modelName,
                  createdAt: result.assistantMessage.createdAt,
                },
              ];
            });
          }
        } else {
          // Fallback to simple chat if session creation fails
          // Still maintain context from current conversation
          const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: userContent,
            createdAt: new Date().toISOString(),
          };

          // Get current messages for context before adding new user message
          const currentMessages = messages;
          setMessages((prev) => [...prev, userMessage]);

          const modelName = selectedModelInfo?.modelName || 'gemini';
          // Pass context messages (last 20) for memory
          const contextForAI = currentMessages.slice(-20);
          const content = await callAIChat(
            modelName,
            userContent,
            webSearchEnabled,
            contextForAI
          );

          setMessages((prev) => [
            ...prev,
            {
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              content,
              modelId: selectedModel,
              createdAt: new Date().toISOString(),
            },
          ]);
        }
      }
    } catch (error) {
      console.error('Error:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Error: ${error instanceof Error ? error.message : 'An error occurred'}`,
          modelId: selectedModel,
          createdAt: new Date().toISOString(),
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

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  // Build model options: only CHAT models + Mixture
  const modelOptions = [
    ...chatModels,
    {
      id: 'mixture',
      name: 'Mixture',
      provider: 'Multi-Model',
      icon: '🔀',
      modelType: 'CHAT' as const,
      isMixture: true,
    },
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />

      {/* Session Sidebar */}
      {token && (
        <SessionSidebar
          currentSessionId={currentSessionId || undefined}
          onSelectSession={loadSession}
          onNewSession={handleNewSession}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
        />
      )}

      {/* Main Content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {messages.length === 0 ? (
          /* Welcome Screen */
          <div className="flex flex-1 flex-col items-center justify-center px-4">
            <div className="w-full max-w-2xl">
              <h1 className="mb-12 text-center text-4xl font-light text-gray-800 md:text-5xl">
                <span className="bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 bg-clip-text text-transparent">
                  {getGreeting()}
                </span>
                {user?.username && (
                  <span className="text-gray-700">
                    , {user.username.split(' ')[0]}
                  </span>
                )}
              </h1>

              {/* Input Box */}
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

                  <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2">
                    <div className="flex items-center gap-2">
                      {/* Tools Button */}
                      <div className="relative" ref={toolsRef}>
                        <button
                          type="button"
                          onClick={() => setShowTools(!showTools)}
                          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                            showTools
                              ? 'bg-purple-100 text-purple-700'
                              : 'text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                            />
                          </svg>
                          Tools
                        </button>

                        {showTools && (
                          <div className="absolute bottom-full left-0 z-50 mb-2 w-56 rounded-xl border border-gray-200 bg-white py-2 shadow-lg">
                            {/* Image Generation */}
                            <div className="px-3 pb-1 text-xs font-medium text-gray-400">
                              Image Generation
                            </div>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setShowTools(false);
                                router.push('/studio?tab=create');
                              }}
                            >
                              <svg
                                className="h-4 w-4 text-purple-500"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                />
                              </svg>
                              <span>Generate Image</span>
                              <svg
                                className="ml-auto h-3 w-3 text-gray-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                />
                              </svg>
                            </button>

                            {/* Divider */}
                            <div className="my-2 border-t border-gray-100"></div>

                            {/* Deep Research - Coming Soon */}
                            <div className="px-3 pb-1 text-xs font-medium text-gray-400">
                              Research
                            </div>
                            <button
                              type="button"
                              disabled
                              className="flex w-full cursor-not-allowed items-center gap-2 px-3 py-2 text-left text-sm text-gray-400"
                            >
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                                />
                              </svg>
                              <span>Deep Research</span>
                              <span className="ml-auto rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                                Soon
                              </span>
                            </button>
                          </div>
                        )}
                      </div>

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
                                <span>🔀</span>
                              ) : selectedModelInfo ? (
                                <ModelIcon
                                  model={selectedModelInfo}
                                  size={16}
                                />
                              ) : (
                                <span>🤖</span>
                              )}
                              <span>
                                {isMixtureMode
                                  ? 'Mixture'
                                  : selectedModelInfo?.name || 'Select'}
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

                        {showModelSelector && (
                          <div className="absolute bottom-full left-0 z-50 mb-2 max-h-80 w-56 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1.5 shadow-xl">
                            <div className="px-3 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-400">
                              Chat Models
                            </div>
                            {modelOptions.map((model) => (
                              <button
                                key={model.id}
                                type="button"
                                onClick={() => {
                                  setSelectedModel(model.id);
                                  setShowModelSelector(false);
                                }}
                                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-gray-50 ${
                                  selectedModel === model.id
                                    ? 'bg-purple-50'
                                    : ''
                                }`}
                              >
                                <ModelIcon model={model} size={16} />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="truncate text-sm font-medium text-gray-900">
                                      {model.name}
                                    </span>
                                    {'isMixture' in model &&
                                      model.isMixture && (
                                        <span className="shrink-0 rounded bg-gradient-to-r from-violet-500 to-fuchsia-500 px-1 py-0.5 text-[10px] text-white">
                                          Multi
                                        </span>
                                      )}
                                  </div>
                                  <span className="text-[11px] text-gray-500">
                                    {model.provider}
                                  </span>
                                </div>
                                {selectedModel === model.id && (
                                  <svg
                                    className="h-4 w-4 shrink-0 text-purple-600"
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

                      {/* Web Search Toggle */}
                      <button
                        type="button"
                        onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                          webSearchEnabled
                            ? 'bg-blue-50 text-blue-600'
                            : 'text-gray-400 hover:bg-gray-100'
                        }`}
                        title={
                          webSearchEnabled
                            ? 'Web search enabled'
                            : 'Web search disabled'
                        }
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                          />
                        </svg>
                        <span>Search</span>
                        {webSearchEnabled && (
                          <svg
                            className="h-3.5 w-3.5"
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
              <div className="mx-auto max-w-4xl space-y-6">
                {messages.map((message) => {
                  const messageModel = chatModels.find(
                    (m) => m.id === message.modelId
                  );
                  return (
                    <div
                      key={message.id}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[90%] rounded-2xl px-4 py-3 ${
                          message.role === 'user'
                            ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white'
                            : 'bg-white shadow-sm ring-1 ring-gray-100'
                        }`}
                      >
                        {message.role === 'assistant' &&
                          (message.modelId || message.modelName) && (
                            <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
                              {messageModel ? (
                                <ModelIcon model={messageModel} size={14} />
                              ) : (
                                <span>🤖</span>
                              )}
                              <span>
                                {message.modelName ||
                                  messageModel?.name ||
                                  'AI'}
                              </span>
                            </div>
                          )}
                        <div
                          className={`prose prose-sm max-w-none ${message.role === 'user' ? 'prose-invert' : ''}`}
                        >
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Mixture Responses - show when there are responses (loading or completed) */}
                {mixtureResponses.length > 0 && (
                  <div className="space-y-3">
                    {mixtureResponses.map((response, index) => {
                      const modelInfo = chatModels.find(
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
                                <ModelIcon model={modelInfo} size={20} />
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

                {/* Single model loading */}
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

            {/* Bottom Input */}
            <div className="border-t border-gray-200 bg-white px-4 py-4">
              <div className="mx-auto max-w-4xl">
                <form onSubmit={handleSubmit}>
                  <div className="rounded-2xl border border-gray-200 bg-white shadow-sm transition-all focus-within:border-purple-300">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      placeholder="Ask anything..."
                      rows={2}
                      className="w-full resize-none rounded-t-2xl bg-transparent px-4 py-4 text-gray-900 placeholder-gray-400 focus:outline-none"
                      disabled={isLoading}
                    />
                    <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2">
                      <div className="flex items-center gap-2">
                        {/* Tools with dropdown */}
                        <div className="relative" ref={toolsRef}>
                          <button
                            type="button"
                            onClick={() => setShowTools(!showTools)}
                            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                              showTools
                                ? 'bg-purple-100 text-purple-700'
                                : 'text-gray-500 hover:bg-gray-100'
                            }`}
                          >
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                              />
                            </svg>
                            Tools
                          </button>

                          {showTools && (
                            <div className="absolute bottom-full left-0 z-50 mb-2 w-56 rounded-xl border border-gray-200 bg-white py-2 shadow-lg">
                              {/* Image Generation */}
                              <div className="px-3 pb-1 text-xs font-medium text-gray-400">
                                Image Generation
                              </div>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setShowTools(false);
                                  router.push('/studio?tab=create');
                                }}
                              >
                                <svg
                                  className="h-4 w-4 text-purple-500"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                  />
                                </svg>
                                <span>Generate Image</span>
                                <svg
                                  className="ml-auto h-3 w-3 text-gray-400"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                  />
                                </svg>
                              </button>

                              {/* Divider */}
                              <div className="my-2 border-t border-gray-100"></div>

                              {/* Deep Research - Coming Soon */}
                              <div className="px-3 pb-1 text-xs font-medium text-gray-400">
                                Research
                              </div>
                              <button
                                type="button"
                                disabled
                                className="flex w-full cursor-not-allowed items-center gap-2 px-3 py-2 text-left text-sm text-gray-400"
                              >
                                <svg
                                  className="h-4 w-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                                  />
                                </svg>
                                <span>Deep Research</span>
                                <span className="ml-auto rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                                  Soon
                                </span>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Model selector with dropdown */}
                        <div className="relative" ref={modelSelectorRef}>
                          <button
                            type="button"
                            onClick={() =>
                              setShowModelSelector(!showModelSelector)
                            }
                            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                          >
                            {isMixtureMode ? (
                              <span>🔀</span>
                            ) : selectedModelInfo ? (
                              <ModelIcon model={selectedModelInfo} size={16} />
                            ) : (
                              <span>🤖</span>
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

                          {showModelSelector && (
                            <div className="absolute bottom-full left-0 z-50 mb-2 max-h-80 w-56 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1.5 shadow-xl">
                              <div className="px-3 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-400">
                                Chat Models
                              </div>
                              {modelOptions.map((model) => (
                                <button
                                  key={model.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedModel(model.id);
                                    setShowModelSelector(false);
                                  }}
                                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-gray-50 ${
                                    selectedModel === model.id
                                      ? 'bg-purple-50'
                                      : ''
                                  }`}
                                >
                                  <ModelIcon model={model} size={16} />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className="truncate text-sm font-medium text-gray-900">
                                        {model.name}
                                      </span>
                                      {'isMixture' in model &&
                                        model.isMixture && (
                                          <span className="shrink-0 rounded bg-gradient-to-r from-violet-500 to-fuchsia-500 px-1 py-0.5 text-[10px] text-white">
                                            Multi
                                          </span>
                                        )}
                                    </div>
                                    <span className="text-[11px] text-gray-500">
                                      {model.provider}
                                    </span>
                                  </div>
                                  {selectedModel === model.id && (
                                    <svg
                                      className="h-4 w-4 shrink-0 text-purple-600"
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

                        {/* Web Search Toggle */}
                        <button
                          type="button"
                          onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                            webSearchEnabled
                              ? 'bg-blue-50 text-blue-600'
                              : 'text-gray-400 hover:bg-gray-100'
                          }`}
                          title={
                            webSearchEnabled
                              ? 'Web search enabled'
                              : 'Web search disabled'
                          }
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                            />
                          </svg>
                          <span>Search</span>
                          {webSearchEnabled && (
                            <svg
                              className="h-3.5 w-3.5"
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
      </main>
    </div>
  );
}
