'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useAIModels, AIModel } from '@/hooks/useAIModels';
import { config } from '@/lib/utils/config';
import Sidebar from '@/components/layout/Sidebar';
import SessionSidebar from '@/components/ai-ask/SessionSidebar';
import MessageContextMenu from '@/components/ai-ask/MessageContextMenu';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CollapsibleBlockquote } from '@/components/ui/CollapsibleBlockquote';
import { CollapsibleMessage } from '@/components/ui/CollapsibleMessage';
import { useThemeStore } from '@/stores/themeStore';

// Toast notification component
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 2000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 transform rounded-lg bg-gray-800 px-4 py-2 text-sm text-white shadow-lg">
      {message}
    </div>
  );
}

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
  const { userMessageStyle, aiMessageStyle } = useThemeStore();
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    message: Message;
    position: { x: number; y: number };
  } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<
    Array<{ file: File; preview?: string }>
  >([]);
  const [isDragging, setIsDragging] = useState(false);
  const [quotedMessage, setQuotedMessage] = useState<{
    content: string;
    preview: string;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modelSelectorRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Create preview URLs for image files
  const addFilesWithPreviews = useCallback((files: File[]) => {
    const filesWithPreviews = files.map((file) => {
      if (file.type.startsWith('image/')) {
        return { file, preview: URL.createObjectURL(file) };
      }
      return { file };
    });
    setAttachedFiles((prev) => [...prev, ...filesWithPreviews].slice(0, 5));
  }, []);

  // Cleanup preview URLs when files are removed
  useEffect(() => {
    return () => {
      attachedFiles.forEach((item) => {
        if (item.preview) {
          URL.revokeObjectURL(item.preview);
        }
      });
    };
  }, [attachedFiles]);

  // Handle file drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      const validFiles = files.filter((file) => {
        const validTypes = [
          'image/',
          'application/pdf',
          'text/',
          'application/json',
        ];
        return validTypes.some((type) => file.type.startsWith(type));
      });

      if (validFiles.length > 0) {
        addFilesWithPreviews(validFiles);
        setToastMessage(`已添加 ${validFiles.length} 个文件`);
      } else if (files.length > 0) {
        setToastMessage('不支持的文件类型');
      }
    },
    [addFilesWithPreviews]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const removeFile = useCallback((index: number) => {
    setAttachedFiles((prev) => {
      const item = prev[index];
      if (item?.preview) {
        URL.revokeObjectURL(item.preview);
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  // Read file content as base64 or text
  const readFileContent = useCallback(async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      if (file.type.startsWith('image/')) {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      } else {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsText(file);
      }
    });
  }, []);

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
    contextMessages?: Message[],
    signal?: AbortSignal
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
      signal,
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
    // Allow sending with just files even without text, or with quoted message
    if (
      (!input.trim() && attachedFiles.length === 0 && !quotedMessage) ||
      isLoading
    )
      return;

    // Build message content with quoted content and file attachments
    let userContent = input.trim();
    const currentFiles = [...attachedFiles];
    const currentQuote = quotedMessage;

    // Read file contents and append to message
    if (currentFiles.length > 0) {
      const fileDescriptions: string[] = [];
      for (const item of currentFiles) {
        try {
          const content = await readFileContent(item.file);
          if (item.file.type.startsWith('image/')) {
            // For images, include base64 data
            fileDescriptions.push(`[图片: ${item.file.name}]\n${content}`);
          } else {
            // For text files, include content
            const truncatedContent =
              content.length > 5000
                ? content.substring(0, 5000) + '...(内容已截断)'
                : content;
            fileDescriptions.push(
              `[文件: ${item.file.name}]\n\`\`\`\n${truncatedContent}\n\`\`\``
            );
          }
        } catch (err) {
          console.error(`Failed to read file ${item.file.name}:`, err);
          fileDescriptions.push(`[文件: ${item.file.name}] (读取失败)`);
        }
      }

      if (fileDescriptions.length > 0) {
        userContent = userContent
          ? `${userContent}\n\n---\n附件内容:\n${fileDescriptions.join('\n\n')}`
          : `请分析以下内容:\n${fileDescriptions.join('\n\n')}`;
      }
    }

    // Add quoted content at the beginning if present
    // displayContent is for UI display (truncated), userContent is for AI (full)
    let displayContent = userContent;
    if (currentQuote) {
      // Full content for AI
      const quotedBlock = `> 引用内容:\n> ${currentQuote.content.split('\n').join('\n> ')}\n\n`;
      userContent = userContent
        ? `${quotedBlock}${userContent}`
        : `${quotedBlock}请针对以上引用内容进行回复`;

      // Truncated content for display (max 100 chars)
      const truncatedQuote =
        currentQuote.content.length > 100
          ? currentQuote.content.substring(0, 100).replace(/\n/g, ' ') + '...'
          : currentQuote.content.replace(/\n/g, ' ');
      const displayQuoteBlock = `> 引用: ${truncatedQuote}\n\n`;
      displayContent = displayContent
        ? `${displayQuoteBlock}${displayContent}`
        : `${displayQuoteBlock}请针对以上引用内容进行回复`;
    }

    setInput('');
    setAttachedFiles([]);
    setQuotedMessage(null);
    setIsLoading(true);
    setMixtureResponses([]);

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    try {
      if (isMixtureMode) {
        // Mixture mode: call multiple models in parallel (legacy behavior)
        const userMessage: Message = {
          id: Date.now().toString(),
          role: 'user',
          content: displayContent,
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
                webSearchEnabled,
                undefined,
                signal
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
              if ((error as Error).name === 'AbortError') return;
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
          // Optimistically add user message (display truncated quote)
          const tempUserMessage: Message = {
            id: 'temp-user-' + Date.now(),
            role: 'user',
            content: displayContent,
            createdAt: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, tempUserMessage]);

          // Send message and get response (send full quote to AI)
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
            content: displayContent,
            createdAt: new Date().toISOString(),
          };

          // Get current messages for context before adding new user message
          const currentMessages = messages;
          setMessages((prev) => [...prev, userMessage]);

          const modelName = selectedModelInfo?.modelName || 'gemini';
          // Pass context messages (last 20) for memory
          const contextForAI = currentMessages.slice(-20);
          // Send full content to AI
          const content = await callAIChat(
            modelName,
            userContent,
            webSearchEnabled,
            contextForAI,
            signal
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
      // Ignore abort errors (user stopped generation)
      if ((error as Error).name === 'AbortError') {
        return;
      }
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
      abortControllerRef.current = null;
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

  // Stop generation handler
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
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
      <SessionSidebar
        currentSessionId={currentSessionId || undefined}
        onSelectSession={loadSession}
        onNewSession={handleNewSession}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

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
                          <div className="absolute bottom-full left-0 z-50 mb-2 max-h-96 w-64 overflow-y-auto rounded-xl border border-gray-200 bg-white py-2 shadow-lg">
                            {/* AI Office Agents */}
                            <div className="px-3 pb-1 text-xs font-medium text-gray-400">
                              AI Office
                            </div>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setShowTools(false);
                                router.push('/ai-office?tab=slides');
                              }}
                            >
                              <span className="text-base">📊</span>
                              <span className="flex-1">AI Slides</span>
                              <span className="text-xs text-gray-400">PPT</span>
                            </button>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setShowTools(false);
                                router.push('/ai-office?tab=docs');
                              }}
                            >
                              <span className="text-base">📝</span>
                              <span className="flex-1">AI Docs</span>
                              <span className="text-xs text-gray-400">
                                Word
                              </span>
                            </button>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setShowTools(false);
                                router.push('/ai-office?tab=developer');
                              }}
                            >
                              <span className="text-base">💻</span>
                              <span className="flex-1">AI Developer</span>
                              <span className="text-xs text-gray-400">
                                Code
                              </span>
                            </button>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setShowTools(false);
                                router.push('/ai-office?tab=designer');
                              }}
                            >
                              <span className="text-base">🎨</span>
                              <span className="flex-1">AI Designer</span>
                              <span className="text-xs text-gray-400">
                                Design
                              </span>
                            </button>

                            {/* Divider */}
                            <div className="my-2 border-t border-gray-100" />

                            {/* AI Teams */}
                            <div className="px-3 pb-1 text-xs font-medium text-gray-400">
                              Collaboration
                            </div>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setShowTools(false);
                                router.push('/ai-teams');
                              }}
                            >
                              <span className="text-base">👥</span>
                              <span className="flex-1">AI Teams</span>
                              <span className="text-xs text-gray-400">
                                Multi-Agent
                              </span>
                            </button>

                            {/* Divider */}
                            <div className="my-2 border-t border-gray-100" />

                            {/* Creative */}
                            <div className="px-3 pb-1 text-xs font-medium text-gray-400">
                              Creative
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
                              <span className="text-base">🖼️</span>
                              <span className="flex-1">Image Generation</span>
                              <span className="text-xs text-gray-400">
                                DALL-E
                              </span>
                            </button>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setShowTools(false);
                                router.push('/ai-studio');
                              }}
                            >
                              <span className="text-base">🎬</span>
                              <span className="flex-1">AI Studio</span>
                              <span className="text-xs text-gray-400">
                                Projects
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

                    {/* Send/Stop Button */}
                    <button
                      type="button"
                      onClick={() =>
                        isLoading ? handleStopGeneration() : handleSubmit()
                      }
                      disabled={
                        !isLoading &&
                        ((!input.trim() &&
                          attachedFiles.length === 0 &&
                          !quotedMessage) ||
                          modelsLoading)
                      }
                      className={`flex h-9 w-9 items-center justify-center rounded-xl text-white transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                        isLoading
                          ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700'
                          : 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700'
                      }`}
                      title={isLoading ? 'Stop generation' : 'Send message'}
                    >
                      {isLoading ? (
                        <svg
                          className="h-5 w-5"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <rect x="6" y="6" width="12" height="12" rx="1" />
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
          <div className="relative flex-1 overflow-hidden">
            <div className="h-full overflow-y-auto px-4 pb-32 pt-6">
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
                            ? userMessageStyle
                            : aiMessageStyle
                        }`}
                        onContextMenu={(e) => {
                          if (message.role === 'assistant') {
                            e.preventDefault();
                            setContextMenu({
                              message,
                              position: { x: e.clientX, y: e.clientY },
                            });
                          }
                        }}
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
                        {message.role === 'assistant' ? (
                          <CollapsibleMessage maxHeight={600}>
                            <div className="prose prose-sm max-w-none">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  blockquote: CollapsibleBlockquote,
                                }}
                              >
                                {message.content}
                              </ReactMarkdown>
                            </div>
                          </CollapsibleMessage>
                        ) : (
                          <div className="prose prose-sm prose-invert max-w-none">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                blockquote: CollapsibleBlockquote,
                              }}
                            >
                              {message.content}
                            </ReactMarkdown>
                          </div>
                        )}
                        {/* Action buttons for assistant messages */}
                        {message.role === 'assistant' && (
                          <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-2">
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(message.content);
                                setToastMessage('已复制到剪贴板');
                              }}
                              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                              title="复制内容"
                            >
                              <svg
                                className="h-3.5 w-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                />
                              </svg>
                              复制
                            </button>
                            <button
                              onClick={() => {
                                // 设置引用消息显示在输入框上方
                                const preview =
                                  message.content
                                    .substring(0, 100)
                                    .replace(/\n/g, ' ') +
                                  (message.content.length > 100 ? '...' : '');
                                setQuotedMessage({
                                  content: message.content,
                                  preview,
                                });
                                inputRef.current?.focus();
                                setToastMessage('已添加引用');
                              }}
                              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                              title="引用回复"
                            >
                              <svg
                                className="h-3.5 w-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                                />
                              </svg>
                              引用
                            </button>
                          </div>
                        )}
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
                              <CollapsibleMessage maxHeight={400}>
                                <div className="prose prose-sm max-w-none">
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                      blockquote: CollapsibleBlockquote,
                                    }}
                                  >
                                    {response.content}
                                  </ReactMarkdown>
                                </div>
                              </CollapsibleMessage>
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

            {/* Floating Bottom Input */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-gray-50 via-gray-50/95 to-transparent px-4 pb-4 pt-8">
              <div className="pointer-events-auto mx-auto max-w-4xl">
                <form onSubmit={handleSubmit}>
                  <div
                    className={`rounded-2xl border bg-white shadow-lg transition-all focus-within:border-purple-300 focus-within:shadow-xl ${
                      isDragging
                        ? 'border-purple-500 ring-2 ring-purple-200'
                        : 'border-gray-200'
                    }`}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                  >
                    {/* Drag overlay */}
                    {isDragging && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-purple-50/90">
                        <div className="text-center">
                          <svg
                            className="mx-auto h-10 w-10 text-purple-500"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                            />
                          </svg>
                          <p className="mt-2 text-sm font-medium text-purple-600">
                            拖放文件到此处
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Quoted message preview - displayed ABOVE the input area */}
                    {quotedMessage && (
                      <div className="flex items-start gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
                        <div className="flex-shrink-0 pt-0.5">
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
                              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                            />
                          </svg>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-gray-500">
                            引用回复
                          </p>
                          <p className="mt-0.5 truncate text-sm text-gray-700">
                            {quotedMessage.preview}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setQuotedMessage(null)}
                          className="flex-shrink-0 rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
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
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                    )}

                    {/* Attached files preview */}
                    {attachedFiles.length > 0 && (
                      <div className="flex flex-wrap gap-2 px-4 pt-3">
                        {attachedFiles.map((item, index) => (
                          <div key={index} className="group relative">
                            {item.preview ? (
                              /* Image thumbnail */
                              <div className="relative h-16 w-16 overflow-hidden rounded-lg border border-gray-200">
                                <img
                                  src={item.preview}
                                  alt={item.file.name}
                                  className="h-full w-full object-cover"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeFile(index)}
                                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-gray-800 text-white opacity-0 transition-opacity group-hover:opacity-100"
                                >
                                  <svg
                                    className="h-3 w-3"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M6 18L18 6M6 6l12 12"
                                    />
                                  </svg>
                                </button>
                              </div>
                            ) : (
                              /* Non-image file */
                              <div className="flex h-16 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3">
                                <svg
                                  className="h-6 w-6 text-blue-500"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                  />
                                </svg>
                                <div className="min-w-0 flex-1">
                                  <p className="max-w-[100px] truncate text-xs font-medium text-gray-700">
                                    {item.file.name}
                                  </p>
                                  <p className="text-[10px] text-gray-400">
                                    {(item.file.size / 1024).toFixed(1)} KB
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeFile(index)}
                                  className="text-gray-400 hover:text-gray-600"
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
                                      d="M6 18L18 6M6 6l12 12"
                                    />
                                  </svg>
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      placeholder={
                        attachedFiles.length > 0
                          ? '添加消息描述这些文件...'
                          : 'Ask anything...'
                      }
                      rows={2}
                      className="w-full resize-none rounded-t-2xl bg-transparent px-4 py-4 text-gray-900 placeholder-gray-400 focus:outline-none"
                      disabled={isLoading}
                    />

                    {/* Hidden file input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/*,.pdf,.txt,.json,.md"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        if (files.length > 0) {
                          addFilesWithPreviews(files);
                          setToastMessage(`已添加 ${files.length} 个文件`);
                        }
                        e.target.value = '';
                      }}
                      className="hidden"
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
                            <div className="absolute bottom-full left-0 z-50 mb-2 max-h-96 w-64 overflow-y-auto rounded-xl border border-gray-200 bg-white py-2 shadow-lg">
                              {/* AI Office Agents */}
                              <div className="px-3 pb-1 text-xs font-medium text-gray-400">
                                AI Office
                              </div>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setShowTools(false);
                                  router.push('/ai-office?tab=slides');
                                }}
                              >
                                <span className="text-base">📊</span>
                                <span className="flex-1">AI Slides</span>
                                <span className="text-xs text-gray-400">
                                  PPT
                                </span>
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setShowTools(false);
                                  router.push('/ai-office?tab=docs');
                                }}
                              >
                                <span className="text-base">📝</span>
                                <span className="flex-1">AI Docs</span>
                                <span className="text-xs text-gray-400">
                                  Word
                                </span>
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setShowTools(false);
                                  router.push('/ai-office?tab=developer');
                                }}
                              >
                                <span className="text-base">💻</span>
                                <span className="flex-1">AI Developer</span>
                                <span className="text-xs text-gray-400">
                                  Code
                                </span>
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setShowTools(false);
                                  router.push('/ai-office?tab=designer');
                                }}
                              >
                                <span className="text-base">🎨</span>
                                <span className="flex-1">AI Designer</span>
                                <span className="text-xs text-gray-400">
                                  Design
                                </span>
                              </button>

                              {/* Divider */}
                              <div className="my-2 border-t border-gray-100" />

                              {/* AI Teams */}
                              <div className="px-3 pb-1 text-xs font-medium text-gray-400">
                                Collaboration
                              </div>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setShowTools(false);
                                  router.push('/ai-teams');
                                }}
                              >
                                <span className="text-base">👥</span>
                                <span className="flex-1">AI Teams</span>
                                <span className="text-xs text-gray-400">
                                  Multi-Agent
                                </span>
                              </button>

                              {/* Divider */}
                              <div className="my-2 border-t border-gray-100" />

                              {/* Creative */}
                              <div className="px-3 pb-1 text-xs font-medium text-gray-400">
                                Creative
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
                                <span className="text-base">🖼️</span>
                                <span className="flex-1">Image Generation</span>
                                <span className="text-xs text-gray-400">
                                  DALL-E
                                </span>
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setShowTools(false);
                                  router.push('/ai-studio');
                                }}
                              >
                                <span className="text-base">🎬</span>
                                <span className="flex-1">AI Studio</span>
                                <span className="text-xs text-gray-400">
                                  Projects
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

                        {/* File Upload Button */}
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                            attachedFiles.length > 0
                              ? 'bg-green-50 text-green-600'
                              : 'text-gray-400 hover:bg-gray-100'
                          }`}
                          title="上传文件或图片"
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
                              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                            />
                          </svg>
                          {attachedFiles.length > 0 && (
                            <span className="rounded-full bg-green-100 px-1.5 text-xs">
                              {attachedFiles.length}
                            </span>
                          )}
                        </button>

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
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          if (isLoading) {
                            handleStopGeneration();
                          } else {
                            handleSubmit();
                          }
                        }}
                        disabled={
                          !isLoading &&
                          !input.trim() &&
                          attachedFiles.length === 0 &&
                          !quotedMessage
                        }
                        className={`flex h-9 w-9 items-center justify-center rounded-xl text-white transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                          isLoading
                            ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700'
                            : 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700'
                        }`}
                        title={isLoading ? 'Stop generation' : 'Send message'}
                      >
                        {isLoading ? (
                          <svg
                            className="h-5 w-5"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <rect x="6" y="6" width="12" height="12" rx="1" />
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
          </div>
        )}
      </main>

      {/* Context Menu */}
      {contextMenu && (
        <MessageContextMenu
          message={contextMenu.message}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onCopy={() => {
            navigator.clipboard.writeText(contextMenu.message.content);
            setContextMenu(null);
            setToastMessage('已复制到剪贴板');
          }}
          onQuote={() => {
            // 设置引用消息显示在输入框上方
            const preview =
              contextMenu.message.content
                .substring(0, 100)
                .replace(/\n/g, ' ') +
              (contextMenu.message.content.length > 100 ? '...' : '');
            setQuotedMessage({ content: contextMenu.message.content, preview });
            setContextMenu(null);
            inputRef.current?.focus();
            setToastMessage('已添加引用');
          }}
          onSave={() => {
            setContextMenu(null);
            setToastMessage('收藏功能即将推出');
          }}
        />
      )}

      {/* Toast notification */}
      {toastMessage && (
        <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
      )}
    </div>
  );
}
