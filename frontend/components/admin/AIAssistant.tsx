'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  X,
  Send,
  Loader2,
  ChevronDown,
  ChevronUp,
  Lightbulb,
} from 'lucide-react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';

interface AIAssistantProps {
  context:
    | 'whitelist'
    | 'quality'
    | 'ai-models'
    | 'system'
    | 'dashboard'
    | 'users'
    | 'collection'
    | 'external-api'
    | 'storage'
    | 'settings';
  currentData?: any; // 当前配置数据，用于AI分析
  onApplySuggestion?: (suggestion: any) => void; // 应用AI建议的回调
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  suggestions?: Suggestion[];
}

interface Suggestion {
  id: string;
  title: string;
  description: string;
  action?: any; // 可执行的动作数据
}

// 每个 context 的系统提示词
const CONTEXT_PROMPTS: Record<string, string> = {
  whitelist: `你是一个数据源白名单配置专家。帮助用户：
1. 分析当前白名单配置是否合理
2. 推荐可信赖的数据源（如知名新闻网站、学术期刊、官方机构）
3. 建议需要排除的低质量来源
4. 优化白名单策略以提高数据采集质量

请给出具体可操作的建议，包括域名、关键词等。`,

  quality: `你是一个数据质量管理专家。帮助用户：
1. 分析当前数据质量配置是否最优
2. 建议去重策略和相似度阈值
3. 推荐数据清洗规则
4. 优化数据验证流程
5. 建议异常检测参数

请给出具体的配置参数建议。`,

  'ai-models': `你是一个 AI 模型配置专家。帮助用户：
1. 分析当前 AI 模型配置是否合理
2. 推荐适合不同任务的模型（聊天、图片生成、快速响应等）
3. 建议 temperature、max_tokens 等参数的最优值
4. 诊断 API 配置问题
5. 推荐模型组合策略（如设置默认模型、备用模型）

请给出具体的配置建议。可用模型提供商：OpenAI、Anthropic、Google、xAI。`,

  system: `你是一个系统配置优化专家。帮助用户：
1. 优化 API 缓存策略（缓存时长、缓存策略）
2. 建议爬虫并发数和超时设置
3. 配置通知和告警策略
4. 优化搜索 API 配置（Tavily vs Serper）
5. 建议系统性能优化方案

请给出具体的配置参数建议。`,

  dashboard: `你是一个系统监控和分析专家。帮助用户：
1. 解读系统仪表盘数据
2. 识别潜在的性能瓶颈
3. 分析数据采集趋势
4. 建议关键指标的优化方向
5. 提供系统健康度评估

请给出具体的分析和优化建议。`,

  users: `你是一个用户管理和权限配置专家。帮助用户：
1. 设计用户角色和权限结构
2. 建议安全策略（密码复杂度、会话管理）
3. 优化用户管理流程
4. 分析用户活跃度和使用模式
5. 建议访问控制最佳实践

请给出具体的配置建议。`,

  collection: `你是一个数据采集配置专家。帮助用户：
1. 优化数据源配置策略
2. 设计采集调度计划
3. 建议数据抓取规则
4. 优化批量采集参数
5. 排查采集失败问题

请给出具体的配置和优化建议。`,

  'external-api': `你是一个外部 API 集成专家。帮助用户：
1. 配置搜索 API（Tavily、Serper 等）
2. 优化 API 调用频率和配额
3. 建议 API 降级策略
4. 诊断 API 连接问题
5. 推荐合适的第三方服务

请给出具体的配置建议。`,

  storage: `你是一个存储管理专家。帮助用户：
1. 优化存储空间使用
2. 配置数据备份策略
3. 建议数据归档方案
4. 分析存储性能
5. 规划存储扩容

请给出具体的优化建议。`,

  settings: `你是一个系统设置配置专家。帮助用户：
1. 配置邮件服务器（SMTP）设置
2. 优化站点基本信息设置
3. 配置 AI 模型默认参数和限速
4. 设置安全策略（会话超时、登录尝试限制）
5. 管理存储配置（上传限制、允许的文件类型）

请给出具体可操作的配置建议。`,
};

// 每个 context 的预设问题
const PRESET_QUESTIONS: Record<string, string[]> = {
  whitelist: [
    '推荐一些高质量的新闻数据源',
    '哪些域名应该加入黑名单？',
    '如何优化白名单策略？',
    '分析当前配置的问题',
  ],
  quality: [
    '推荐最佳的去重阈值',
    '如何减少重复数据？',
    '数据清洗的最佳实践',
    '异常检测参数建议',
  ],
  'ai-models': [
    '推荐最佳的模型配置',
    '如何选择默认聊天模型？',
    '图片生成用哪个模型最好？',
    '优化 API 调用成本',
  ],
  system: [
    '推荐最优缓存配置',
    '爬虫并发数应该设多少？',
    '搜索 API 选 Tavily 还是 Serper？',
    '如何优化系统性能？',
  ],
  dashboard: [
    '当前系统状态如何？',
    '有哪些需要关注的指标？',
    '数据采集效率如何优化？',
    '系统瓶颈分析',
  ],
  users: [
    '如何设计用户权限？',
    '安全策略建议',
    '用户管理最佳实践',
    '如何提高用户活跃度？',
  ],
  collection: [
    '优化数据采集策略',
    '如何设置采集调度？',
    '批量采集参数建议',
    '采集失败如何排查？',
  ],
  'external-api': [
    '搜索 API 怎么选择？',
    'API 调用频率建议',
    'API 配置问题诊断',
    '第三方服务推荐',
  ],
  storage: [
    '如何优化存储空间？',
    '数据备份策略建议',
    '存储扩容方案',
    '性能优化建议',
  ],
  settings: [
    '如何配置 Gmail SMTP？',
    '推荐的安全设置参数',
    'AI 模型配置最佳实践',
    '邮件发送测试失败怎么办？',
  ],
};

export default function AIAssistant({
  context,
  currentData,
  onApplySuggestion,
}: AIAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const contextLabels: Record<string, string> = {
    whitelist: '白名单管理',
    quality: '数据质量',
    'ai-models': 'AI 模型',
    system: '系统设置',
    dashboard: '仪表盘',
    users: '用户管理',
    collection: '数据采集',
    'external-api': '外部 API',
    storage: '存储管理',
  };

  const sendMessage = async (content: string) => {
    if (!content.trim() || loading) return;

    const userMessage: Message = { role: 'user', content };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      // 构建完整的上下文
      const systemPrompt = CONTEXT_PROMPTS[context];
      const dataContext = currentData
        ? `\n\n当前配置数据：\n${JSON.stringify(currentData, null, 2)}`
        : '';

      // 构建消息数组，包含系统提示作为第一条用户消息的一部分
      const fullMessages = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: content },
      ];

      // 使用 simple-chat 端点
      const response = await fetch(`${config.apiUrl}/ai/simple-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        credentials: 'include',
        body: JSON.stringify({
          message: `${systemPrompt}${dataContext}\n\n用户问题：${content}`,
          messages:
            fullMessages.length > 1
              ? [
                  { role: 'system', content: systemPrompt + dataContext },
                  ...fullMessages,
                ]
              : undefined,
          stream: false, // 不使用流式响应
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const assistantMessage: Message = {
          role: 'assistant',
          content:
            data.content ||
            data.message ||
            data.response ||
            '抱歉，无法获取回复。',
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'API request failed');
      }
    } catch (error) {
      console.error('AI Assistant error:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '抱歉，AI 助手暂时无法响应。请稍后重试或检查 AI 模型配置。',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handlePresetQuestion = (question: string) => {
    sendMessage(question);
  };

  const clearChat = () => {
    setMessages([]);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-medium text-white shadow-lg transition-all hover:from-violet-700 hover:to-indigo-700 hover:shadow-xl"
      >
        <Sparkles className="h-5 w-5" />
        AI 助手
      </button>
    );
  }

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex flex-col rounded-2xl bg-white shadow-2xl transition-all ${
        isMinimized ? 'h-14 w-80' : 'h-[500px] w-96'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between rounded-t-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-white" />
          <span className="font-medium text-white">
            AI 助手 - {contextLabels[context]}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="rounded-lg p-1.5 text-white/80 hover:bg-white/20 hover:text-white"
          >
            {isMinimized ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="rounded-lg p-1.5 text-white/80 hover:bg-white/20 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="space-y-4">
                <div className="rounded-lg bg-violet-50 p-4">
                  <div className="mb-2 flex items-center gap-2 text-violet-700">
                    <Lightbulb className="h-4 w-4" />
                    <span className="text-sm font-medium">AI 配置助手</span>
                  </div>
                  <p className="text-sm text-violet-600">
                    我可以帮助你优化 {contextLabels[context]}{' '}
                    配置，分析问题并给出专业建议。
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-500">
                    快速提问：
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_QUESTIONS[context]?.map((question, idx) => (
                      <button
                        key={idx}
                        onClick={() => handlePresetQuestion(question)}
                        className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs text-violet-700 transition-colors hover:bg-violet-100"
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message, idx) => (
                  <div
                    key={idx}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                        message.role === 'user'
                          ? 'bg-violet-600 text-white'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      <div className="whitespace-pre-wrap text-sm">
                        {message.content}
                      </div>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 rounded-2xl bg-gray-100 px-4 py-2.5">
                      <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
                      <span className="text-sm text-gray-500">思考中...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-gray-100 p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) =>
                  e.key === 'Enter' && !e.shiftKey && sendMessage(input)
                }
                placeholder="输入问题..."
                className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                disabled={loading}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                className="rounded-xl bg-violet-600 px-4 py-2.5 text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="mt-2 text-xs text-gray-400 hover:text-gray-600"
              >
                清空对话
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
