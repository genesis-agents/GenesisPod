'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { config } from '@/lib/config';
import { getAuthHeader } from '@/lib/auth';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Available AI Models
const AI_MODELS = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    color: 'from-green-500 to-emerald-500',
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'OpenAI',
    color: 'from-green-400 to-emerald-400',
  },
  {
    id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    color: 'from-orange-500 to-amber-500',
  },
  {
    id: 'claude-3-5-haiku',
    name: 'Claude 3.5 Haiku',
    provider: 'Anthropic',
    color: 'from-orange-400 to-amber-400',
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'Google',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    provider: 'Google',
    color: 'from-blue-600 to-cyan-600',
  },
  {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat',
    provider: 'DeepSeek',
    color: 'from-purple-500 to-indigo-500',
  },
  {
    id: 'qwen-max',
    name: 'Qwen Max',
    provider: 'Alibaba',
    color: 'from-red-500 to-pink-500',
  },
  {
    id: 'mixture',
    name: 'Mixture',
    provider: 'Multi-Model',
    color: 'from-violet-500 via-purple-500 to-fuchsia-500',
    isMixture: true,
  },
];

// Tool definitions (similar to Gemini)
const TOOLS = [
  {
    id: 'deep-research',
    name: 'Deep Research',
    icon: 'research',
    description: 'In-depth research with citations',
  },
  {
    id: 'create-image',
    name: 'Create Image',
    icon: 'image',
    description: 'Generate images with AI',
  },
  {
    id: 'analyze-data',
    name: 'Analyze Data',
    icon: 'chart',
    description: 'Analyze and visualize data',
  },
  {
    id: 'code-assist',
    name: 'Code Assist',
    icon: 'code',
    description: 'Help with coding tasks',
  },
];

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  timestamp: Date;
  isCollapsed?: boolean;
}

interface MixtureResponse {
  model: string;
  content: string;
  isCollapsed: boolean;
}

export default function AskPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gpt-4o');
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [mixtureResponses, setMixtureResponses] = useState<MixtureResponse[]>(
    []
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modelSelectorRef = useRef<HTMLDivElement>(null);

  const selectedModelInfo =
    AI_MODELS.find((m) => m.id === selectedModel) || AI_MODELS[0];

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

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    try {
      if (selectedModel === 'mixture') {
        // Mixture mode: call multiple models in parallel
        const modelsToCall = AI_MODELS.filter((m) => !m.isMixture).slice(0, 4); // Use first 4 models
        const responses: MixtureResponse[] = modelsToCall.map((m) => ({
          model: m.name,
          content: '',
          isCollapsed: false,
        }));
        setMixtureResponses(responses);

        // Simulate parallel API calls (replace with actual API calls)
        await Promise.all(
          modelsToCall.map(async (model, index) => {
            // Simulated response - replace with actual API call
            await new Promise((resolve) =>
              setTimeout(resolve, 1000 + Math.random() * 2000)
            );
            const simulatedResponse = `This is a response from **${model.name}** (${model.provider}).\n\nYour question: "${userMessage.content}"\n\n_This is a simulated response. Connect to actual AI API for real responses._`;

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

        // Add mixture response to messages
        const mixtureContent = modelsToCall
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
        // Simulated response - replace with actual API call
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const simulatedResponse = `This is a response from **${selectedModelInfo.name}**.\n\nYour question: "${userMessage.content}"\n\n_This is a simulated response. Connect to actual AI API for real responses._`;

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

  return (
    <div className="flex h-screen flex-col bg-gradient-to-b from-gray-50 to-white">
      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {messages.length === 0 ? (
          /* Welcome Screen - Similar to Gemini */
          <div className="flex flex-1 flex-col items-center justify-center px-4">
            <div className="w-full max-w-3xl text-center">
              {/* Greeting */}
              <h1 className="mb-2 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 bg-clip-text text-4xl font-medium text-transparent md:text-5xl">
                {getGreeting()}
                {user?.username ? `, ${user.username}` : ''}
              </h1>
              <p className="mb-8 text-lg text-gray-500">
                How can I help you today?
              </p>

              {/* Quick Actions */}
              <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  {
                    label: 'Research a topic',
                    icon: '🔍',
                    prompt: 'Research the latest developments in',
                  },
                  {
                    label: 'Analyze data',
                    icon: '📊',
                    prompt: 'Help me analyze this data:',
                  },
                  {
                    label: 'Write content',
                    icon: '✍️',
                    prompt: 'Help me write',
                  },
                  {
                    label: 'Code assistance',
                    icon: '💻',
                    prompt: 'Help me with this code:',
                  },
                ].map((action, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(action.prompt + ' ')}
                    className="group flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-4 text-sm transition-all hover:border-purple-200 hover:bg-purple-50 hover:shadow-sm"
                  >
                    <span className="text-2xl">{action.icon}</span>
                    <span className="text-gray-700 group-hover:text-purple-700">
                      {action.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Chat Messages */
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
                    {message.role === 'assistant' && message.model && (
                      <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
                        <span
                          className={`h-2 w-2 rounded-full bg-gradient-to-r ${AI_MODELS.find((m) => m.id === message.model)?.color || 'from-gray-400 to-gray-500'}`}
                        />
                        {AI_MODELS.find((m) => m.id === message.model)?.name ||
                          message.model}
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
              ))}

              {/* Mixture Responses (Real-time) */}
              {isLoading &&
                selectedModel === 'mixture' &&
                mixtureResponses.length > 0 && (
                  <div className="space-y-3">
                    {mixtureResponses.map((response, index) => {
                      const modelInfo = AI_MODELS.find(
                        (m) => m.name === response.model
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
                              <span
                                className={`h-3 w-3 rounded-full bg-gradient-to-r ${modelInfo?.color || 'from-gray-400 to-gray-500'}`}
                              />
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

              {/* Loading indicator for single model */}
              {isLoading && selectedModel !== 'mixture' && (
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
                        {selectedModelInfo.name} is thinking...
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* Input Area - Fixed at Bottom */}
        <div className="border-t border-gray-200 bg-white px-4 py-4">
          <div className="mx-auto max-w-3xl">
            <form onSubmit={handleSubmit} className="relative">
              {/* Input Container */}
              <div className="relative rounded-2xl border border-gray-200 bg-white shadow-sm transition-all focus-within:border-purple-300 focus-within:ring-2 focus-within:ring-purple-100">
                {/* Textarea */}
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything..."
                  rows={1}
                  className="w-full resize-none rounded-2xl bg-transparent px-4 py-3 pr-32 text-gray-900 placeholder-gray-400 focus:outline-none"
                  disabled={isLoading}
                />

                {/* Bottom Actions Bar */}
                <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2">
                  <div className="flex items-center gap-2">
                    {/* Add Attachment */}
                    <button
                      type="button"
                      className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                      title="Add attachment"
                    >
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
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                    </button>

                    {/* Tools Button */}
                    <button
                      type="button"
                      onClick={() => setShowTools(!showTools)}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                        showTools
                          ? 'bg-purple-100 text-purple-700'
                          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
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
                          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                      Tools
                    </button>

                    {/* Model Selector */}
                    <div className="relative" ref={modelSelectorRef}>
                      <button
                        type="button"
                        onClick={() => setShowModelSelector(!showModelSelector)}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                      >
                        <span
                          className={`h-2 w-2 rounded-full bg-gradient-to-r ${selectedModelInfo.color}`}
                        />
                        {selectedModelInfo.name}
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
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>

                      {/* Model Dropdown */}
                      {showModelSelector && (
                        <div className="absolute bottom-full left-0 mb-2 w-64 rounded-xl border border-gray-200 bg-white py-2 shadow-lg">
                          <div className="px-3 pb-2 text-xs font-medium text-gray-400">
                            Select Model
                          </div>
                          {AI_MODELS.map((model) => (
                            <button
                              key={model.id}
                              type="button"
                              onClick={() => {
                                setSelectedModel(model.id);
                                setShowModelSelector(false);
                              }}
                              className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-gray-50 ${
                                selectedModel === model.id ? 'bg-purple-50' : ''
                              }`}
                            >
                              <span
                                className={`h-3 w-3 rounded-full bg-gradient-to-r ${model.color}`}
                              />
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-gray-900">
                                    {model.name}
                                  </span>
                                  {model.isMixture && (
                                    <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700">
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
                                  className="h-4 w-4 text-purple-600"
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
                    type="submit"
                    disabled={!input.trim() || isLoading}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white transition-all hover:from-violet-700 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
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

              {/* Tools Panel */}
              {showTools && (
                <div className="absolute bottom-full left-0 mb-2 w-full rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    {TOOLS.map((tool) => (
                      <button
                        key={tool.id}
                        type="button"
                        onClick={() => {
                          setActiveTool(
                            activeTool === tool.id ? null : tool.id
                          );
                          setShowTools(false);
                        }}
                        className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-all ${
                          activeTool === tool.id
                            ? 'border-purple-300 bg-purple-50 text-purple-700'
                            : 'border-gray-200 hover:border-purple-200 hover:bg-purple-50'
                        }`}
                      >
                        <span className="text-xl">
                          {tool.icon === 'research' && '🔬'}
                          {tool.icon === 'image' && '🎨'}
                          {tool.icon === 'chart' && '📊'}
                          {tool.icon === 'code' && '💻'}
                        </span>
                        <span className="text-sm font-medium">{tool.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </form>

            {/* Footer hint */}
            <p className="mt-2 text-center text-xs text-gray-400">
              DeepDive AI may produce inaccurate information. Always verify
              important facts.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
