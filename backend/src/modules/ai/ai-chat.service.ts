import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  name?: string;
}

export interface ChatCompletionOptions {
  model: string;
  systemPrompt?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface ChatCompletionResult {
  content: string;
  model: string;
  tokensUsed: number;
}

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  constructor(private readonly httpService: HttpService) {}

  /**
   * Extract URLs from text content
   */
  private extractUrls(text: string): string[] {
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
    return text.match(urlRegex) || [];
  }

  /**
   * Detect if a message needs web search
   * Looks for keywords like "搜索", "查找", "最新", "新闻", "search", etc.
   */
  private needsWebSearch(text: string): boolean {
    const searchKeywords = [
      "搜索",
      "搜一下",
      "查找",
      "查一下",
      "查询",
      "最新",
      "新闻",
      "今天",
      "昨天",
      "本周",
      "现在",
      "目前",
      "当前",
      "实时",
      "热点",
      "trending",
      "search",
      "look up",
      "find out",
      "latest",
      "news",
      "current",
      "recent",
      "today",
    ];
    const lowerText = text.toLowerCase();
    return searchKeywords.some((keyword) => lowerText.includes(keyword));
  }

  /**
   * Extract search query from user message
   */
  private extractSearchQuery(text: string): string {
    // Remove common prefixes and clean up the query
    let query = text
      .replace(/@[\w-]+\s*/g, "") // Remove @mentions
      .replace(/搜索|搜一下|查找|查一下|查询|帮我|请|给我/g, "")
      .replace(/search|look up|find/gi, "")
      .trim();

    // Limit query length
    if (query.length > 100) {
      query = query.substring(0, 100);
    }

    return query;
  }

  /**
   * Perform web search using DuckDuckGo
   */
  private async webSearch(query: string): Promise<string> {
    try {
      this.logger.log(`Performing web search for: ${query}`);

      // Use DuckDuckGo HTML search
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

      const response = await firstValueFrom(
        this.httpService.get(searchUrl, {
          timeout: 10000,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Accept: "text/html",
          },
          responseType: "text",
        }),
      );

      const html = response.data;

      // Extract search results from DuckDuckGo HTML
      const results: { title: string; snippet: string; url: string }[] = [];

      // Match result blocks
      const resultRegex =
        /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([^<]*)</g;
      let match;
      let count = 0;

      while ((match = resultRegex.exec(html)) !== null && count < 5) {
        const url = match[1];
        const title = match[2].trim();
        const snippet = match[3].trim();

        if (title && snippet) {
          results.push({ title, snippet, url });
          count++;
        }
      }

      // Alternative extraction if first pattern didn't work
      if (results.length === 0) {
        const altRegex =
          /<h2[^>]*class="result__title"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
        while ((match = altRegex.exec(html)) !== null && count < 5) {
          const url = match[1];
          const title = match[2].replace(/<[^>]+>/g, "").trim();
          const snippet = match[3].replace(/<[^>]+>/g, "").trim();

          if (title && snippet) {
            results.push({ title, snippet, url });
            count++;
          }
        }
      }

      if (results.length === 0) {
        this.logger.warn(`No search results found for: ${query}`);
        return `[搜索 "${query}" 未找到结果]`;
      }

      // Format results for AI
      const formattedResults = results
        .map(
          (r, i) =>
            `${i + 1}. **${r.title}**\n   ${r.snippet}\n   来源: ${r.url}`,
        )
        .join("\n\n");

      this.logger.log(`Found ${results.length} search results for: ${query}`);

      return `\n\n--- 网络搜索结果 (${query}) ---\n${formattedResults}`;
    } catch (error) {
      this.logger.error(`Web search failed for "${query}": ${error}`);
      return `[搜索失败: ${error}]`;
    }
  }

  /**
   * Fetch content from a URL and extract text
   * Used to provide context to AI models that can't access URLs directly
   */
  private async fetchUrlContent(url: string): Promise<string | null> {
    try {
      this.logger.log(`Fetching URL content: ${url}`);
      const response = await firstValueFrom(
        this.httpService.get(url, {
          timeout: 15000,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          responseType: "text",
        }),
      );

      const html = response.data;

      // Extract text content from HTML (simple extraction)
      // Remove scripts, styles, and HTML tags
      let text = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, " ")
        .trim();

      // Limit content length to avoid token limits
      const maxLength = 8000;
      if (text.length > maxLength) {
        text = text.substring(0, maxLength) + "... [内容已截断]";
      }

      this.logger.log(`Fetched ${text.length} characters from ${url}`);
      return text;
    } catch (error) {
      this.logger.error(`Failed to fetch URL ${url}: ${error}`);
      return null;
    }
  }

  /**
   * Process messages to fetch URL content and perform web search if needed
   * This gives all AI models the ability to access the internet
   */
  private async augmentMessagesWithUrlContent(
    messages: ChatMessage[],
  ): Promise<ChatMessage[]> {
    const augmentedMessages: ChatMessage[] = [];

    for (const message of messages) {
      if (message.role === "user") {
        let augmentedContent = message.content;
        const urls = this.extractUrls(message.content);

        // 1. Fetch content from URLs if present
        if (urls.length > 0) {
          const urlsToFetch = urls.slice(0, 2);
          const fetchedContents: string[] = [];

          for (const url of urlsToFetch) {
            const content = await this.fetchUrlContent(url);
            if (content) {
              fetchedContents.push(`\n\n--- 网页内容 (${url}) ---\n${content}`);
            }
          }

          if (fetchedContents.length > 0) {
            augmentedContent += fetchedContents.join("\n");
            this.logger.log(
              `Augmented message with content from ${fetchedContents.length} URL(s)`,
            );
          }
        }

        // 2. Perform web search if message indicates search intent (and no URLs)
        if (urls.length === 0 && this.needsWebSearch(message.content)) {
          const searchQuery = this.extractSearchQuery(message.content);
          if (searchQuery.length > 3) {
            this.logger.log(`Detected search intent, query: ${searchQuery}`);
            const searchResults = await this.webSearch(searchQuery);
            augmentedContent += searchResults;
          }
        }

        augmentedMessages.push({
          ...message,
          content: augmentedContent,
        });
      } else {
        augmentedMessages.push(message);
      }
    }

    return augmentedMessages;
  }

  /**
   * Generate a chat completion using the specified AI model
   */
  async generateChatCompletion(
    options: ChatCompletionOptions,
  ): Promise<ChatCompletionResult> {
    const {
      model,
      systemPrompt,
      messages,
      maxTokens = 2048,
      temperature = 0.7,
    } = options;

    this.logger.log(`Generating chat completion with model: ${model}`);

    // Build messages array with system prompt
    const fullMessages: ChatMessage[] = [];
    if (systemPrompt) {
      fullMessages.push({ role: "system", content: systemPrompt });
    }
    fullMessages.push(...messages);

    // Route to appropriate provider based on model
    // Support both short names (grok, gpt-4, claude, gemini) and full model IDs
    const modelLower = model.toLowerCase();

    if (modelLower === "grok" || modelLower.includes("grok")) {
      return this.callGrokAPI(fullMessages, maxTokens, temperature);
    } else if (
      modelLower === "gpt-4" ||
      modelLower.includes("gpt") ||
      modelLower.startsWith("o1") ||
      modelLower.startsWith("o3")
    ) {
      return this.callOpenAIAPI(fullMessages, maxTokens, temperature);
    } else if (modelLower === "claude" || modelLower.includes("claude")) {
      return this.callClaudeAPI(fullMessages, maxTokens, temperature);
    } else if (modelLower === "gemini" || modelLower.includes("gemini")) {
      return this.callGeminiAPI(fullMessages, maxTokens, temperature);
    } else {
      // Unknown model - return mock response with correct model name
      this.logger.warn(`Unknown model "${model}", returning mock response`);
      return this.getMockResponse(model, messages);
    }
  }

  /**
   * Generate a meeting summary from discussion messages
   */
  async generateSummary(
    messages: { sender: string; content: string; timestamp: string }[],
    model: string = "grok",
  ): Promise<ChatCompletionResult> {
    const discussionText = messages
      .map((m) => `[${m.timestamp}] ${m.sender}: ${m.content}`)
      .join("\n");

    const systemPrompt = `You are an expert meeting summarizer. Analyze the following discussion and create a comprehensive summary that includes:
1. Key Discussion Points: Main topics and themes discussed
2. Decisions Made: Any decisions or conclusions reached
3. Action Items: Tasks or follow-ups mentioned
4. Participants' Perspectives: Notable viewpoints or contributions
5. Outstanding Questions: Unresolved issues or questions

Format the summary in a clear, structured manner using markdown.`;

    const userMessage = `Please summarize the following discussion:\n\n${discussionText}`;

    return this.generateChatCompletion({
      model,
      systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: 4096,
      temperature: 0.5,
    });
  }

  /**
   * Call xAI Grok API
   */
  private async callGrokAPI(
    messages: ChatMessage[],
    maxTokens: number,
    temperature: number,
  ): Promise<ChatCompletionResult> {
    const apiKey = process.env.XAI_API_KEY;
    const apiUrl =
      process.env.XAI_API_URL || "https://api.x.ai/v1/chat/completions";

    if (!apiKey) {
      this.logger.warn("XAI_API_KEY not configured");
      return {
        content: `**API Key 未配置**\n\n我是 Grok，但无法生成回复，因为 XAI_API_KEY 环境变量未设置。\n\n请在管理后台配置 API Key 或设置环境变量。`,
        model: "grok",
        tokensUsed: 0,
      };
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          apiUrl,
          {
            model: "grok-beta",
            messages: messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            max_tokens: maxTokens,
            temperature,
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
          },
        ),
      );

      const data = response.data;
      return {
        content: data.choices[0]?.message?.content || "",
        model: "grok",
        tokensUsed: data.usage?.total_tokens || 0,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "未知错误";
      this.logger.error(`Grok API error: ${errorMsg}`);
      return {
        content: `**Grok API 调用失败**\n\n错误信息：${errorMsg}\n\n请稍后重试或检查 API 配置。`,
        model: "grok",
        tokensUsed: 0,
      };
    }
  }

  /**
   * Call OpenAI API for GPT-4
   */
  private async callOpenAIAPI(
    messages: ChatMessage[],
    maxTokens: number,
    temperature: number,
  ): Promise<ChatCompletionResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    const apiUrl = "https://api.openai.com/v1/chat/completions";

    if (!apiKey) {
      this.logger.warn("OPENAI_API_KEY not configured");
      return {
        content: `**API Key 未配置**\n\n我是 GPT-4，但无法生成回复，因为 OPENAI_API_KEY 环境变量未设置。\n\n请在管理后台配置 API Key 或设置环境变量。`,
        model: "gpt-4",
        tokensUsed: 0,
      };
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          apiUrl,
          {
            model: "gpt-4-turbo-preview",
            messages: messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            max_tokens: maxTokens,
            temperature,
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
          },
        ),
      );

      const data = response.data;
      return {
        content: data.choices[0]?.message?.content || "",
        model: "gpt-4",
        tokensUsed: data.usage?.total_tokens || 0,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "未知错误";
      this.logger.error(`OpenAI API error: ${errorMsg}`);
      return {
        content: `**GPT-4 API 调用失败**\n\n错误信息：${errorMsg}\n\n请稍后重试或检查 API 配置。`,
        model: "gpt-4",
        tokensUsed: 0,
      };
    }
  }

  /**
   * Call Anthropic Claude API
   */
  private async callClaudeAPI(
    messages: ChatMessage[],
    maxTokens: number,
    temperature: number,
  ): Promise<ChatCompletionResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const apiUrl = "https://api.anthropic.com/v1/messages";

    if (!apiKey) {
      this.logger.warn("ANTHROPIC_API_KEY not configured");
      return {
        content: `**API Key 未配置**\n\n我是 Claude，但无法生成回复，因为 ANTHROPIC_API_KEY 环境变量未设置。\n\n请在管理后台配置 API Key 或设置环境变量。`,
        model: "claude",
        tokensUsed: 0,
      };
    }

    try {
      // Extract system message
      const systemMessage = messages.find((m) => m.role === "system");
      const otherMessages = messages.filter((m) => m.role !== "system");

      const response = await firstValueFrom(
        this.httpService.post(
          apiUrl,
          {
            model: "claude-3-opus-20240229",
            max_tokens: maxTokens,
            temperature,
            system: systemMessage?.content,
            messages: otherMessages.map((m) => ({
              role: m.role === "assistant" ? "assistant" : "user",
              content: m.content,
            })),
          },
          {
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
            },
          },
        ),
      );

      const data = response.data;
      return {
        content: data.content[0]?.text || "",
        model: "claude",
        tokensUsed:
          (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "未知错误";
      this.logger.error(`Claude API error: ${errorMsg}`);
      return {
        content: `**Claude API 调用失败**\n\n错误信息：${errorMsg}\n\n请稍后重试或检查 API 配置。`,
        model: "claude",
        tokensUsed: 0,
      };
    }
  }

  /**
   * Call Google Gemini API
   * Using Gemini 2.0 Flash model with system instruction support
   */
  private async callGeminiAPI(
    messages: ChatMessage[],
    maxTokens: number,
    temperature: number,
  ): Promise<ChatCompletionResult> {
    const apiKey = process.env.GOOGLE_AI_API_KEY;

    if (!apiKey) {
      this.logger.warn("GOOGLE_AI_API_KEY not configured");
      return {
        content: `**API Key 未配置**\n\n我是 Gemini，但无法生成回复，因为 GOOGLE_AI_API_KEY 环境变量未设置。\n\n请在管理后台配置 API Key 或设置环境变量。`,
        model: "gemini",
        tokensUsed: 0,
      };
    }

    // Use Gemini 2.0 Flash (latest model with better performance)
    const modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash-exp";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    try {
      // Extract system message for system instruction
      const systemMessage = messages.find((m) => m.role === "system");
      const otherMessages = messages.filter((m) => m.role !== "system");

      // Convert messages to Gemini format
      const contents = otherMessages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

      // Build request body
      const requestBody: any = {
        contents,
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature,
          topP: 0.95,
          topK: 40,
        },
      };

      // Add system instruction if present (Gemini 1.5+ supports this natively)
      if (systemMessage) {
        requestBody.systemInstruction = {
          parts: [{ text: systemMessage.content }],
        };
      }

      this.logger.log(`Calling Gemini API with model: ${modelName}`);

      const response = await firstValueFrom(
        this.httpService.post(apiUrl, requestBody, {
          headers: {
            "Content-Type": "application/json",
          },
          timeout: 60000, // 60 second timeout
        }),
      );

      const data = response.data;

      // Check for blocked content or errors
      if (data.candidates?.[0]?.finishReason === "SAFETY") {
        this.logger.warn("Gemini response blocked due to safety filters");
        return {
          content:
            "I apologize, but I cannot provide a response to that request due to content safety guidelines.",
          model: "gemini",
          tokensUsed: 0,
        };
      }

      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const tokensUsed =
        (data.usageMetadata?.promptTokenCount || 0) +
        (data.usageMetadata?.candidatesTokenCount || 0);

      this.logger.log(`Gemini response received, tokens used: ${tokensUsed}`);

      return {
        content,
        model: "gemini",
        tokensUsed,
      };
    } catch (error: any) {
      // Log detailed error information
      let errorMsg = "未知错误";
      if (error.response) {
        errorMsg = `${error.response.status} - ${JSON.stringify(error.response.data?.error?.message || error.response.data)}`;
        this.logger.error(`Gemini API error: ${errorMsg}`);
      } else {
        errorMsg = error.message || "网络错误";
        this.logger.error(`Gemini API error: ${errorMsg}`);
      }
      return {
        content: `**Gemini API 调用失败**\n\n错误信息：${errorMsg}\n\n请稍后重试或检查 API 配置。`,
        model: "gemini",
        tokensUsed: 0,
      };
    }
  }

  /**
   * Test connection to an AI model
   * Returns latency and success status
   */
  async testModelConnection(
    model: string,
  ): Promise<{ success: boolean; message: string; latency?: number }> {
    const startTime = Date.now();

    try {
      // Simple test message
      const testMessages: ChatMessage[] = [
        { role: "user", content: "Say 'OK' to confirm you are working." },
      ];

      let result: ChatCompletionResult;

      switch (model) {
        case "grok":
          result = await this.callGrokAPI(testMessages, 50, 0);
          break;
        case "gpt-4":
          result = await this.callOpenAIAPI(testMessages, 50, 0);
          break;
        case "claude":
          result = await this.callClaudeAPI(testMessages, 50, 0);
          break;
        case "gemini":
          result = await this.callGeminiAPI(testMessages, 50, 0);
          break;
        default:
          return {
            success: false,
            message: `Unknown model: ${model}`,
          };
      }

      const latency = Date.now() - startTime;

      // Check if we got a mock response (API key not configured)
      if (result.content.includes("mock response")) {
        return {
          success: false,
          message: `API key not configured for ${model}`,
          latency,
        };
      }

      return {
        success: true,
        message: `Connection successful! Response: "${result.content.substring(0, 100)}..."`,
        latency,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        message: `Connection failed: ${errorMessage}`,
        latency,
      };
    }
  }

  /**
   * Test connection to an AI model with custom API key and endpoint
   * Used for testing models configured in the database
   */
  async testModelConnectionWithKey(
    provider: string,
    modelId: string,
    apiKey: string,
    apiEndpoint: string,
  ): Promise<{ success: boolean; message: string; latency?: number }> {
    const startTime = Date.now();

    if (!apiKey) {
      return {
        success: false,
        message: "API key is not configured",
        latency: 0,
      };
    }

    try {
      const testMessages = [
        {
          role: "user" as const,
          content: "Say 'OK' to confirm you are working.",
        },
      ];

      let response;

      // Determine the correct API format based on provider
      switch (provider.toLowerCase()) {
        case "xai":
        case "grok":
          response = await firstValueFrom(
            this.httpService.post(
              apiEndpoint || "https://api.x.ai/v1/chat/completions",
              {
                model: modelId || "grok-beta",
                messages: testMessages,
                max_tokens: 50,
                temperature: 0,
              },
              {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
                timeout: 30000,
              },
            ),
          );
          break;

        case "openai":
        case "gpt":
          // Use max_completion_tokens for newer models (gpt-4o, gpt-5, o1, o3)
          const effectiveOpenAIModel = modelId || "gpt-4";
          const isNewerOpenAIModel =
            effectiveOpenAIModel.includes("gpt-5") ||
            effectiveOpenAIModel.includes("gpt-4o") ||
            effectiveOpenAIModel.startsWith("o1") ||
            effectiveOpenAIModel.startsWith("o3");
          const openAITokenParam = isNewerOpenAIModel
            ? { max_completion_tokens: 50 }
            : { max_tokens: 50 };

          response = await firstValueFrom(
            this.httpService.post(
              apiEndpoint || "https://api.openai.com/v1/chat/completions",
              {
                model: effectiveOpenAIModel,
                messages: testMessages,
                ...openAITokenParam,
                temperature: 0,
              },
              {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
                timeout: 30000,
              },
            ),
          );
          break;

        case "anthropic":
        case "claude":
          response = await firstValueFrom(
            this.httpService.post(
              apiEndpoint || "https://api.anthropic.com/v1/messages",
              {
                model: modelId || "claude-3-sonnet-20240229",
                max_tokens: 50,
                messages: testMessages,
              },
              {
                headers: {
                  "x-api-key": apiKey,
                  "anthropic-version": "2023-06-01",
                  "Content-Type": "application/json",
                },
                timeout: 30000,
              },
            ),
          );
          break;

        case "google":
        case "gemini":
          // Check if this is an Imagen model (uses different API)
          const isImagenModel = modelId?.toLowerCase().includes("imagen");

          if (isImagenModel) {
            // Imagen models use the predict endpoint
            // Test with a simple image generation request
            const imagenEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:predict?key=${apiKey}`;

            this.logger.log(`Testing Imagen API: ${imagenEndpoint}`);

            response = await firstValueFrom(
              this.httpService.post(
                imagenEndpoint,
                {
                  instances: [
                    { prompt: "A simple test image of a blue circle" },
                  ],
                  parameters: {
                    sampleCount: 1,
                    aspectRatio: "1:1",
                  },
                },
                {
                  headers: { "Content-Type": "application/json" },
                  timeout: 60000, // Longer timeout for image generation
                },
              ),
            );

            // Imagen returns predictions array
            if (response.data?.predictions?.[0]?.bytesBase64Encoded) {
              const latency = Date.now() - startTime;
              return {
                success: true,
                message: `Imagen connection successful! Image generated.`,
                latency,
              };
            }
          } else {
            // Regular Gemini models use generateContent
            const isImageCapableModel =
              modelId?.includes("gemini-2.0-flash-exp") ||
              modelId?.includes("image");

            const geminiTestPrompt = isImageCapableModel
              ? "Hello" // Simple prompt for image-capable models
              : testMessages[0].content;

            const geminiConfig: Record<string, unknown> = isImageCapableModel
              ? {} // Don't request image generation for connection test
              : {
                  maxOutputTokens: 50,
                  temperature: 0,
                };

            // Build full Gemini endpoint URL
            const effectiveGeminiModel = modelId || "gemini-pro";
            let geminiEndpoint: string;
            if (apiEndpoint && apiEndpoint.includes(":generateContent")) {
              geminiEndpoint = apiEndpoint;
            } else {
              const baseUrl =
                apiEndpoint?.replace(/\/$/, "") ||
                "https://generativelanguage.googleapis.com/v1beta/models";
              geminiEndpoint = `${baseUrl}/${effectiveGeminiModel}:generateContent`;
            }

            this.logger.log(`Testing Gemini API: ${geminiEndpoint}`);

            response = await firstValueFrom(
              this.httpService.post(
                geminiEndpoint,
                {
                  contents: [
                    {
                      parts: [{ text: geminiTestPrompt }],
                    },
                  ],
                  ...(Object.keys(geminiConfig).length > 0
                    ? { generationConfig: geminiConfig }
                    : {}),
                },
                {
                  headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": apiKey,
                  },
                  timeout: 30000,
                },
              ),
            );
          }
          break;

        default:
          return {
            success: false,
            message: `Unsupported provider: ${provider}`,
            latency: Date.now() - startTime,
          };
      }

      const latency = Date.now() - startTime;

      // Extract response content based on provider
      let content = "";
      if (
        provider.toLowerCase() === "anthropic" ||
        provider.toLowerCase() === "claude"
      ) {
        content = response.data?.content?.[0]?.text || "";
      } else if (
        provider.toLowerCase() === "google" ||
        provider.toLowerCase() === "gemini"
      ) {
        content =
          response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      } else {
        content = response.data?.choices?.[0]?.message?.content || "";
      }

      return {
        success: true,
        message: `Connection successful! Response: "${content.substring(0, 100)}${content.length > 100 ? "..." : ""}"`,
        latency,
      };
    } catch (error: any) {
      const latency = Date.now() - startTime;
      let errorMessage = "Unknown error";

      if (error.response) {
        // API returned an error response
        const status = error.response.status;
        const data = error.response.data;
        errorMessage = `API Error (${status}): ${data?.error?.message || data?.message || JSON.stringify(data)}`;
      } else if (error.code === "ECONNABORTED") {
        errorMessage = "Connection timeout";
      } else if (error.message) {
        errorMessage = error.message;
      }

      this.logger.error(`Model connection test failed: ${errorMessage}`);

      return {
        success: false,
        message: `Connection failed: ${errorMessage}`,
        latency,
      };
    }
  }

  /**
   * Generate a chat completion using a specific API key from the database
   * Used for AI Group feature where models are configured per-tenant
   */
  async generateChatCompletionWithKey(options: {
    provider: string;
    modelId: string;
    apiKey: string;
    apiEndpoint?: string;
    systemPrompt?: string;
    messages: ChatMessage[];
    maxTokens?: number;
    temperature?: number;
    displayName?: string; // AI member display name (e.g., "AI-Gemini (Image)")
    capabilities?: string[]; // AI capabilities (e.g., ["IMAGE_GENERATION", "TEXT_GENERATION"])
  }): Promise<ChatCompletionResult> {
    const {
      provider,
      modelId,
      apiKey,
      apiEndpoint,
      systemPrompt,
      messages,
      maxTokens = 2048,
      temperature = 0.7,
      displayName,
      capabilities = [], // AI capabilities for image generation decision
    } = options;

    this.logger.log(
      `Generating chat completion with key for provider: ${provider}, model: ${modelId}, apiKeyLength: ${apiKey?.length || 0}, endpoint: ${apiEndpoint}`,
    );

    if (!apiKey) {
      this.logger.warn(
        `No API key provided for ${provider}, returning error response`,
      );
      // Return clear error message instead of mock response
      const aiName = displayName || this.formatModelDisplayName(modelId);
      const envVarName = this.getEnvVarNameForProvider(provider);
      return {
        content: `**API Key 未配置**

我是 ${aiName}，但无法生成回复，因为 "${modelId}" 的 API Key 未配置。

**解决方法：**
1. 进入管理后台 → AI 模型管理
2. 找到 "${modelId}" 并添加 API Key
3. 或设置环境变量：${envVarName}

*请配置 API Key 后重试。*`,
        model: modelId,
        tokensUsed: 0,
      };
    }

    this.logger.log(
      `API key confirmed for ${provider}: ${apiKey.substring(0, 8)}...${apiKey.slice(-4)}`,
    );

    // Augment messages with URL content for all AI providers
    // This enables AI models to "access" URLs by fetching content server-side
    const augmentedMessages =
      await this.augmentMessagesWithUrlContent(messages);

    // Build full messages with system prompt
    const fullMessages: ChatMessage[] = [];
    if (systemPrompt) {
      fullMessages.push({ role: "system", content: systemPrompt });
    }
    fullMessages.push(...augmentedMessages);

    try {
      switch (provider.toLowerCase()) {
        case "xai":
        case "grok":
          // Enable live X/Twitter search for Grok
          // Uses search_parameters.mode = "auto" to let Grok decide when to search
          // Grok can search real-time X posts, news, and web content
          return await this.callApiWithKey(
            apiEndpoint || "https://api.x.ai/v1/chat/completions",
            {
              model: modelId || "grok-3-latest",
              messages: fullMessages.map((m) => ({
                role: m.role,
                content: m.content,
              })),
              max_tokens: maxTokens,
              temperature,
              // Enable live search from X/Twitter and web
              search_parameters: {
                mode: "auto", // "auto" = search when needed, "on" = always search
                return_citations: true, // Return source citations
              },
            },
            { Authorization: `Bearer ${apiKey}` },
            "grok",
          );

        case "openai":
        case "gpt":
          // Check if user is requesting image generation
          const lastUserMsg = fullMessages
            .filter((m) => m.role === "user")
            .pop();
          const userText = lastUserMsg?.content?.toLowerCase() || "";
          // Check if this AI has image generation capability
          const hasImageCapability = capabilities.includes("IMAGE_GENERATION");
          // Only generate images if:
          // 1. User explicitly requested an image (via keywords), AND
          // 2. AI has IMAGE_GENERATION capability
          // NOTE: Having IMAGE_GENERATION capability alone is NOT enough - user must request it
          const isImageRequest = this.isImageGenerationRequest(userText);
          if (isImageRequest && hasImageCapability) {
            this.logger.log(
              `Image generation request detected (byContent=${isImageRequest}, hasCapability=${hasImageCapability}), using DALL-E 3`,
            );
            // Build context-aware prompt for DALL-E 3
            // Use English text to avoid garbled characters
            const buildDallEPrompt = (): string => {
              const recentMessages = fullMessages.slice(-10);
              const contextParts: string[] = [];

              for (const msg of recentMessages) {
                if (msg.role === "assistant" && msg.name) {
                  const truncatedContent = msg.content.substring(0, 2000);
                  contextParts.push(
                    `[${msg.name}'s analysis]: ${truncatedContent}`,
                  );
                }
              }

              const userRequest = lastUserMsg?.content || "";

              if (contextParts.length > 0) {
                const context = contextParts.join("\n\n");
                return `Based on the following context:\n\n${context}\n\nUser's request: ${userRequest}\n\nIMPORTANT INSTRUCTIONS FOR IMAGE GENERATION:
1. Create a professional infographic or data visualization
2. ALL TEXT IN THE IMAGE MUST BE IN ENGLISH - do not use Chinese or other non-Latin characters as they may appear garbled
3. If the context contains Chinese data/names, translate them to English equivalents
4. Use clean, modern design with clear labels, legends, and proper typography
5. Ensure all text is legible and properly rendered
6. Use appropriate charts (bar, line, pie) to visualize numerical data`;
              }

              return `${userRequest}\n\nIMPORTANT: All text in the image must be in English. Use clean, professional design.`;
            };

            const dallePrompt = buildDallEPrompt();
            this.logger.log(
              `[DALL-E 3] Context-aware prompt length: ${dallePrompt.length}`,
            );
            return await this.callDallE3(apiKey, dallePrompt);
          }
          // Use max_completion_tokens for newer models (gpt-4o, gpt-5, o1, o3, etc.)
          // and max_tokens for older models (gpt-4-turbo, gpt-3.5-turbo)
          const effectiveModelId = modelId || "gpt-4-turbo-preview";
          const isNewModel =
            effectiveModelId.includes("gpt-5") ||
            effectiveModelId.includes("gpt-4o") ||
            effectiveModelId.startsWith("o1") ||
            effectiveModelId.startsWith("o3");
          const tokenParam = isNewModel
            ? { max_completion_tokens: maxTokens }
            : { max_tokens: maxTokens };

          return await this.callApiWithKey(
            apiEndpoint || "https://api.openai.com/v1/chat/completions",
            {
              model: effectiveModelId,
              messages: fullMessages.map((m) => ({
                role: m.role,
                content: m.content,
              })),
              ...tokenParam,
              temperature,
            },
            { Authorization: `Bearer ${apiKey}` },
            "gpt-4",
          );

        case "anthropic":
        case "claude":
          const systemMessage = fullMessages.find((m) => m.role === "system");
          const otherMessages = fullMessages.filter((m) => m.role !== "system");
          return await this.callClaudeApiWithKey(
            apiEndpoint || "https://api.anthropic.com/v1/messages",
            apiKey,
            modelId || "claude-3-opus-20240229",
            systemMessage?.content,
            otherMessages,
            maxTokens,
            temperature,
          );

        case "google":
        case "gemini":
          return await this.callGeminiApiWithKey(
            apiKey,
            modelId || "gemini-2.0-flash-exp",
            apiEndpoint,
            fullMessages,
            maxTokens,
            temperature,
            displayName,
            capabilities,
          );

        default:
          this.logger.warn(`Unknown provider: ${provider}, using Grok`);
          return await this.callApiWithKey(
            "https://api.x.ai/v1/chat/completions",
            {
              model: "grok-beta",
              messages: fullMessages.map((m) => ({
                role: m.role,
                content: m.content,
              })),
              max_tokens: maxTokens,
              temperature,
            },
            { Authorization: `Bearer ${apiKey}` },
            "grok",
          );
      }
    } catch (error) {
      const errorDetails =
        error instanceof Error
          ? {
              message: error.message,
              name: error.name,
              response: (error as any).response?.data,
              status: (error as any).response?.status,
            }
          : error;
      this.logger.error(
        `API call failed for ${provider}: ${JSON.stringify(errorDetails)}`,
      );
      // IMPORTANT: Return error message instead of mock response
      // This helps users understand what went wrong
      const errorMessage =
        (error as any).response?.data?.error?.message ||
        (error instanceof Error ? error.message : "Unknown API error");
      return {
        content: `API Error: ${errorMessage}\n\nProvider: ${provider}\nModel: ${modelId}\n\nPlease check your API key and model configuration.`,
        model: modelId,
        tokensUsed: 0,
      };
    }
  }

  /**
   * Helper method to call OpenAI-compatible APIs
   */
  private async callApiWithKey(
    url: string,
    body: any,
    headers: Record<string, string>,
    modelName: string,
  ): Promise<ChatCompletionResult> {
    this.logger.log(
      `[${modelName}] Calling API: ${url.replace(/Bearer\s+\S+/, "Bearer ***")}`,
    );
    this.logger.log(`[${modelName}] Request body model: ${body.model}`);

    const response = await firstValueFrom(
      this.httpService.post(url, body, {
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        timeout: 60000,
      }),
    );

    const data = response.data;
    const content = data.choices?.[0]?.message?.content;

    // Log response details for debugging
    this.logger.log(`[${modelName}] Response status: ${response.status}`);
    this.logger.log(
      `[${modelName}] Response has choices: ${!!data.choices}, length: ${data.choices?.length || 0}`,
    );
    if (data.choices?.[0]) {
      this.logger.log(
        `[${modelName}] Choice finish_reason: ${data.choices[0].finish_reason}`,
      );
      this.logger.log(
        `[${modelName}] Message content length: ${content?.length || 0}`,
      );
    }
    if (data.error) {
      this.logger.error(
        `[${modelName}] API returned error: ${JSON.stringify(data.error)}`,
      );
    }

    if (!content) {
      this.logger.warn(
        `[${modelName}] API returned empty content, full response: ${JSON.stringify(data).substring(0, 500)}`,
      );
    }

    return {
      content:
        content || `[${modelName}] No response content received from API.`,
      model: modelName,
      tokensUsed: data.usage?.total_tokens || 0,
    };
  }

  /**
   * Helper method to call Claude API with key
   */
  private async callClaudeApiWithKey(
    url: string,
    apiKey: string,
    modelId: string,
    systemPrompt: string | undefined,
    messages: ChatMessage[],
    maxTokens: number,
    temperature: number,
  ): Promise<ChatCompletionResult> {
    const response = await firstValueFrom(
      this.httpService.post(
        url,
        {
          model: modelId,
          max_tokens: maxTokens,
          temperature,
          system: systemPrompt,
          messages: messages.map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          })),
        },
        {
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          timeout: 60000,
        },
      ),
    );

    const data = response.data;
    return {
      content: data.content?.[0]?.text || "",
      model: "claude",
      tokensUsed:
        (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    };
  }

  /**
   * Helper method to call Gemini API with key
   * Supports both text and image generation
   */
  private async callGeminiApiWithKey(
    apiKey: string,
    modelId: string,
    _apiEndpoint: string | undefined, // Reserved for future use
    messages: ChatMessage[],
    maxTokens: number,
    temperature: number,
    displayName?: string, // AI member display name (e.g., "AI-Gemini (Image)")
    capabilities: string[] = [], // AI capabilities
  ): Promise<ChatCompletionResult> {
    // Check if user is requesting image generation
    const lastUserMessage = messages.filter((m) => m.role === "user").pop();
    const userContent = lastUserMessage?.content?.toLowerCase() || "";
    const isImageRequestByContent = this.isImageGenerationRequest(userContent);

    // Check if this AI has IMAGE_GENERATION capability
    const hasImageCapability = capabilities.includes("IMAGE_GENERATION");

    // Check if the configured model is Imagen (dedicated image generation model)
    // Only true Imagen models (imagen-xxx) should use the Imagen API
    // Gemini models with "image" in name (like gemini-3-pro-image-preview) use native Gemini image generation
    const modelIdLower = modelId.toLowerCase();
    const isImagenModel = modelIdLower.startsWith("imagen");

    // Check if this is a Gemini model with native image generation support
    const isGeminiImageModel =
      modelIdLower.includes("gemini") &&
      (modelIdLower.includes("image") || modelIdLower.includes("2.0"));

    // Only generate images if:
    // 1. User explicitly requested an image (via keywords), AND
    // 2. AI has IMAGE_GENERATION capability
    // NOTE: Having IMAGE_GENERATION capability alone is NOT enough - user must request it
    const isImageRequest = isImageRequestByContent && hasImageCapability;

    this.logger.log(
      `[Gemini] Image detection: modelId=${modelId}, displayName=${displayName}`,
    );
    this.logger.log(
      `[Gemini] Image detection details: hasImageCapability=${hasImageCapability}, capabilities=${JSON.stringify(capabilities)}, isImageRequestByContent=${isImageRequestByContent}, userContent="${userContent.substring(0, 100)}"`,
    );
    this.logger.log(
      `[Gemini] Image detection result: isImagenModel=${isImagenModel}, isGeminiImageModel=${isGeminiImageModel}, finalIsImageRequest=${isImageRequest}`,
    );

    // Build context-aware prompt for image generation
    // CRITICAL: Include ALL relevant context - user requests AND AI responses
    // Since Imagen cannot see previous images, we must describe them in text
    const buildImagePrompt = (): string => {
      // Get the last few messages for context (both user and assistant messages)
      const recentMessages = messages.slice(-10); // Last 10 messages for context

      // Build conversation history to understand what the user wants
      const conversationParts: string[] = [];

      for (const msg of recentMessages) {
        // Clean the content - remove @mentions and image markdown
        const cleanContent = msg.content
          .replace(/^@[\w\-()]+\s*/g, "") // Remove @mentions
          .replace(
            /!\[.*?\]\(data:image\/[^)]+\)/g,
            "[Previously generated image]",
          ) // Replace base64 images with placeholder
          .trim();

        if (!cleanContent || cleanContent === "[Previously generated image]") {
          continue; // Skip empty messages or image-only messages
        }

        if (msg.role === "user") {
          conversationParts.push(`User request: ${cleanContent}`);
        } else if (msg.role === "assistant" && msg.name) {
          // Only include text responses, not just image placeholders
          if (cleanContent.length > 10) {
            conversationParts.push(
              `${msg.name} responded: ${cleanContent.substring(0, 500)}`,
            );
          }
        }
      }

      // Get the user's current request - remove @mentions to get clean prompt
      let userRequest = lastUserMessage?.content || "";
      userRequest = userRequest.replace(/^@[\w\-()]+\s*/g, "").trim();

      this.logger.log(
        `[buildImagePrompt] Original: "${lastUserMessage?.content}", Cleaned: "${userRequest}"`,
      );

      // Build the final prompt with full context
      if (conversationParts.length > 1) {
        // There's conversation history - include it for context
        const history = conversationParts.slice(0, -1).join("\n"); // Exclude current request
        return `Based on this conversation history:
${history}

Current request: ${userRequest}

Generate an image that fulfills the current request while maintaining consistency with the previous context.`;
      }

      // For simple requests without history, just pass the user's request directly
      return userRequest;
    };

    // Use Imagen API only if explicitly configured as Imagen model
    if (isImageRequest && isImagenModel) {
      this.logger.log(`Using Imagen model for image generation: ${modelId}`);
      const imagePrompt = buildImagePrompt();
      return await this.callImagenApi(apiKey, modelId, imagePrompt);
    }

    // Check if this is a dedicated image model (not suitable for text conversations)
    const isImageOnlyModel =
      modelIdLower.includes("image") || modelIdLower.startsWith("imagen");

    // Determine the effective model to use
    let effectiveModelId = modelId;

    if (isImageOnlyModel && !isImageRequest) {
      // Image-only models can't do text conversations - fall back to text model
      effectiveModelId = "gemini-2.0-flash-exp";
      this.logger.log(
        `[Gemini] Image-only model ${modelId} used for non-image request, falling back to ${effectiveModelId}`,
      );
    } else if (isImageRequest && isGeminiImageModel) {
      // User requested image AND model is Gemini with image capability - use as configured
      this.logger.log(
        `[Gemini] Using configured Gemini image model: ${modelId}`,
      );
      // Keep the configured model (e.g., gemini-3-pro-image-preview)
    } else if (isImageRequest && !isGeminiImageModel && !isImagenModel) {
      // User requested image but model doesn't support it - switch to capable model
      const imageCapableModel = "gemini-2.0-flash-exp";
      this.logger.log(
        `[Gemini] Image request with non-image model ${modelId}, switching to ${imageCapableModel}`,
      );
      effectiveModelId = imageCapableModel;
    } else {
      this.logger.log(
        `[Gemini] Using configured model: ${effectiveModelId}, isImageRequest: ${isImageRequest}`,
      );
    }

    // Build the correct Gemini API URL
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${effectiveModelId}:generateContent?key=${apiKey}`;

    this.logger.log(
      `Calling Gemini API: ${url.replace(apiKey, "***")}, imageRequest=${isImageRequest}`,
    );

    // Extract system message for system instruction
    const systemMessage = messages.find((m) => m.role === "system");
    const otherMessages = messages.filter((m) => m.role !== "system");

    // For Gemini 3 image models, use simplified single-turn format
    // These models have special requirements and don't support multi-turn with model responses
    const isGemini3ImageModel =
      effectiveModelId.includes("gemini-3") &&
      effectiveModelId.includes("image");

    let contents: any[];

    if (isGemini3ImageModel && isImageRequest) {
      // IMPORTANT: Gemini 3 image models require single-turn format
      // They don't accept model responses in the conversation history
      // Use only the latest user message for image generation
      const lastUserMessage = otherMessages
        .filter((m) => m.role === "user")
        .pop();

      // Clean up the user message - remove @mentions and base64 images
      let cleanPrompt = lastUserMessage?.content || "Generate an image";
      cleanPrompt = cleanPrompt
        .replace(/^@[\w\-()]+\s*/g, "") // Remove @mentions
        .replace(/!\[.*?\]\(data:image\/[^)]+\)/g, "") // Remove base64 images
        .trim();

      // DO NOT add extra instructions - Gemini will render them as part of the image
      // Just pass the user's request directly, translated to English if needed
      this.logger.log(
        `[Gemini 3 Image] Using single-turn format, prompt: "${cleanPrompt.substring(0, 100)}..."`,
      );

      contents = [
        {
          role: "user",
          parts: [{ text: cleanPrompt }],
        },
      ];
    } else {
      // Standard multi-turn format for other models
      // IMPORTANT: Clean up base64 images from message content to avoid sending huge payloads
      contents = otherMessages.map((m) => {
        let cleanContent = m.content;

        // Replace base64 image data with description placeholder
        if (cleanContent.includes("![Generated Image](data:image")) {
          cleanContent = cleanContent.replace(
            /!\[Generated Image\]\(data:image\/[^)]+\)/g,
            "[An image was generated based on the previous request]",
          );
          this.logger.log(
            `[Gemini] Cleaned base64 image from message, role: ${m.role}`,
          );
        }

        return {
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: cleanContent }],
        };
      });
    }

    const requestBody: any = {
      contents,
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature,
      },
    };

    // Enable image generation if requested
    if (isImageRequest) {
      requestBody.generationConfig.responseModalities = ["TEXT", "IMAGE"];
      this.logger.log(
        `[Gemini] Image generation enabled, model: ${effectiveModelId}, isGemini3=${isGemini3ImageModel}`,
      );
    } else {
      // Enable Google Search Grounding for text-only responses
      requestBody.tools = [
        {
          googleSearch: {},
        },
      ];

      // Only add system instruction for non-image requests
      if (systemMessage) {
        requestBody.systemInstruction = {
          parts: [{ text: systemMessage.content }],
        };
      }
    }

    const response = await firstValueFrom(
      this.httpService.post(url, requestBody, {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 120000, // Longer timeout for image generation
      }),
    );

    const data = response.data;

    // Log response details for debugging
    this.logger.log(`[Gemini] Response status: ${response.status}`);
    this.logger.log(
      `[Gemini] Has candidates: ${!!data.candidates}, length: ${data.candidates?.length || 0}`,
    );

    if (data.candidates?.[0]) {
      const candidate = data.candidates[0];
      this.logger.log(
        `[Gemini] Candidate finishReason: ${candidate.finishReason}`,
      );
      this.logger.log(
        `[Gemini] Has content: ${!!candidate.content}, parts: ${candidate.content?.parts?.length || 0}`,
      );

      // Check for safety ratings that might block response
      if (candidate.safetyRatings) {
        const blocked = candidate.safetyRatings.filter(
          (r: any) => r.probability === "HIGH" || r.blocked,
        );
        if (blocked.length > 0) {
          this.logger.warn(
            `[Gemini] Safety blocked: ${JSON.stringify(blocked)}`,
          );
        }
      }
    }

    if (data.promptFeedback?.blockReason) {
      this.logger.error(
        `[Gemini] Prompt blocked: ${data.promptFeedback.blockReason}`,
      );
      return {
        content: `Response blocked by Gemini safety filters: ${data.promptFeedback.blockReason}`,
        model: "gemini",
        tokensUsed: 0,
      };
    }

    // Process response - handle both text and image parts
    const parts = data.candidates?.[0]?.content?.parts || [];
    let textContent = "";
    const images: string[] = [];

    this.logger.log(
      `[Gemini] Processing ${parts.length} part(s) from response`,
    );

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      this.logger.log(
        `[Gemini] Part ${i}: hasText=${!!part.text}, hasInlineData=${!!part.inlineData}`,
      );

      if (part.text) {
        textContent += part.text;
        this.logger.log(`[Gemini] Part ${i} text length: ${part.text.length}`);
      }
      if (part.inlineData) {
        // Image data is returned as base64
        const mimeType = part.inlineData.mimeType || "image/png";
        // CRITICAL: Remove all whitespace from base64 data (Gemini may include newlines)
        const base64Data = part.inlineData.data?.replace(/\s/g, "") || "";
        this.logger.log(
          `[Gemini] Part ${i} inlineData: mimeType=${mimeType}, dataLength=${base64Data?.length || 0}`,
        );

        if (base64Data && base64Data.length > 0) {
          // Validate base64 format
          const validBase64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
          if (!validBase64Regex.test(base64Data)) {
            this.logger.warn(
              `[Gemini] Part ${i} base64 has invalid characters!`,
            );
          }

          const imageMarkdown = `![Generated Image](data:${mimeType};base64,${base64Data})`;
          images.push(imageMarkdown);
          this.logger.log(
            `[Gemini] Part ${i} image markdown created, length: ${imageMarkdown.length}`,
          );
          this.logger.log(
            `[Gemini] Part ${i} base64 preview (first 50 chars): ${base64Data.substring(0, 50)}`,
          );
        } else {
          this.logger.warn(`[Gemini] Part ${i} has inlineData but no data!`);
        }
      }
    }

    // Combine text and images in the response
    let finalContent = textContent;
    if (images.length > 0) {
      finalContent =
        images.join("\n\n") + (textContent ? "\n\n" + textContent : "");
      this.logger.log(
        `[Gemini] Generated ${images.length} image(s), final content length: ${finalContent.length}`,
      );
    }

    // FALLBACK: If this was an image request but Gemini didn't return any images,
    // fall back to Imagen API for image generation
    if (isImageRequest && images.length === 0) {
      this.logger.warn(
        `[Gemini] Image generation requested but no images returned, falling back to Imagen API`,
      );

      // Build context-aware prompt for Imagen fallback
      // Include previous AI responses so image generation has proper context
      // Use English text to avoid garbled characters
      const buildFallbackImagePrompt = (): string => {
        const recentMessages = messages.slice(-10);
        const contextParts: string[] = [];

        for (const msg of recentMessages) {
          if (msg.role === "assistant" && msg.name) {
            const truncatedContent = msg.content.substring(0, 2000);
            contextParts.push(`[${msg.name}'s analysis]: ${truncatedContent}`);
          }
        }

        const lastUserMsg = messages.filter((m) => m.role === "user").pop();
        const userRequest = lastUserMsg?.content || "";

        if (contextParts.length > 0) {
          const context = contextParts.join("\n\n");
          return `Based on the following context from the discussion:\n\n${context}\n\nUser's request: ${userRequest}\n\nIMPORTANT INSTRUCTIONS:
1. Create a professional infographic or data visualization
2. ALL TEXT IN THE IMAGE MUST BE IN ENGLISH - do not use Chinese or other non-Latin characters
3. If the context contains Chinese data/names, translate them to English
4. Use clean, modern design with clear labels and legends
5. Ensure all text is legible and properly rendered`;
        }

        return `${userRequest}\n\nIMPORTANT: All text in the image must be in English.`;
      };

      const imagePrompt = buildFallbackImagePrompt();
      this.logger.log(
        `[Imagen Fallback] Context-aware prompt length: ${imagePrompt.length}`,
      );

      // Try Imagen API as fallback
      try {
        const imagenResult = await this.callImagenApi(
          apiKey,
          "imagen-4.0-generate-001",
          imagePrompt,
        );

        // If Imagen succeeded, combine with Gemini's text response
        if (
          imagenResult.content &&
          !imagenResult.content.includes("图像生成失败")
        ) {
          this.logger.log(`[Imagen Fallback] Successfully generated image`);
          // If Gemini provided useful text, append it
          if (textContent && textContent.length > 50) {
            return {
              content: imagenResult.content + "\n\n" + textContent,
              model: "gemini+imagen",
              tokensUsed:
                (data.usageMetadata?.promptTokenCount || 0) +
                (data.usageMetadata?.candidatesTokenCount || 0),
            };
          }
          return imagenResult;
        }
      } catch (imagenError) {
        this.logger.error(`[Imagen Fallback] Failed: ${imagenError}`);
      }

      // If Imagen also failed, check if we have OpenAI API key for DALL-E 3 fallback
      const openaiKey = process.env.OPENAI_API_KEY;
      if (openaiKey) {
        this.logger.log(
          `[DALL-E 3 Fallback] Imagen failed, trying DALL-E 3 with OpenAI API key`,
        );
        try {
          const dallePrompt = buildFallbackImagePrompt();
          const dalleResult = await this.callDallE3(openaiKey, dallePrompt);
          if (
            dalleResult.content &&
            !dalleResult.content.includes("图像生成失败")
          ) {
            this.logger.log(`[DALL-E 3 Fallback] Successfully generated image`);
            if (textContent && textContent.length > 50) {
              return {
                content: dalleResult.content + "\n\n" + textContent,
                model: "gemini+dalle3",
                tokensUsed:
                  (data.usageMetadata?.promptTokenCount || 0) +
                  (data.usageMetadata?.candidatesTokenCount || 0),
              };
            }
            return dalleResult;
          }
        } catch (dalleError) {
          this.logger.error(`[DALL-E 3 Fallback] Failed: ${dalleError}`);
        }
      }

      // If all image generation attempts failed, return Gemini's text response with explanation
      if (textContent) {
        return {
          content:
            textContent +
            "\n\n---\n\n**⚠️ 图片生成失败**\n\nAI 生成了上面的描述内容，但未能生成实际图片。\n\n**可能的解决方案：**\n1. 确保 Google API Key 启用了图片生成功能\n2. 检查 Imagen API 是否已在 Google Cloud 控制台启用\n3. 尝试使用配置了 OPENAI_API_KEY 的 AI 成员（支持 DALL-E 3）",
          model: "gemini",
          tokensUsed:
            (data.usageMetadata?.promptTokenCount || 0) +
            (data.usageMetadata?.candidatesTokenCount || 0),
        };
      }
    }

    if (!finalContent) {
      this.logger.warn(
        `[Gemini] Empty response, full data: ${JSON.stringify(data).substring(0, 500)}`,
      );
    }

    return {
      content:
        finalContent || "[Gemini] No response content received from API.",
      model: "gemini",
      tokensUsed:
        (data.usageMetadata?.promptTokenCount || 0) +
        (data.usageMetadata?.candidatesTokenCount || 0),
    };
  }

  /**
   * Check if the user message is requesting image generation
   */
  private isImageGenerationRequest(content: string): boolean {
    const imageKeywords = [
      // Chinese
      "生成图",
      "画图",
      "画一",
      "画个",
      "画张",
      "创建图",
      "制作图",
      "生成一张",
      "生成一个图",
      "帮我画",
      "给我画",
      "图片",
      "图像",
      "插图",
      "绘制",
      "设计图",
      "信息图",
      "流程图",
      "示意图",
      // English
      "generate image",
      "create image",
      "draw",
      "make image",
      "generate picture",
      "create picture",
      "illustration",
      "infographic",
      "diagram",
      "visualize",
      "picture of",
      "image of",
    ];

    const lowerContent = content.toLowerCase();
    return imageKeywords.some((keyword) => lowerContent.includes(keyword));
  }

  /**
   * Call OpenAI DALL-E 3 API for image generation
   * DALL-E 3 produces the best infographics and diagrams
   */
  private async callDallE3(
    apiKey: string,
    prompt: string,
  ): Promise<ChatCompletionResult> {
    const url = "https://api.openai.com/v1/images/generations";

    this.logger.log(`Calling DALL-E 3 API for image generation`);

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          url,
          {
            model: "dall-e-3",
            prompt: prompt,
            n: 1,
            size: "1024x1024",
            quality: "hd",
            response_format: "b64_json",
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            timeout: 120000, // 2 minutes for image generation
          },
        ),
      );

      const data = response.data;
      const imageData = data.data?.[0];

      if (imageData?.b64_json) {
        const imageMarkdown = `![Generated Image](data:image/png;base64,${imageData.b64_json})`;
        const revisedPrompt = imageData.revised_prompt
          ? `\n\n*Prompt used: ${imageData.revised_prompt}*`
          : "";

        this.logger.log("DALL-E 3 image generated successfully");

        return {
          content: imageMarkdown + revisedPrompt,
          model: "dall-e-3",
          tokensUsed: 0,
        };
      } else if (imageData?.url) {
        // Fallback to URL if b64_json not available
        const imageMarkdown = `![Generated Image](${imageData.url})`;
        return {
          content: imageMarkdown,
          model: "dall-e-3",
          tokensUsed: 0,
        };
      }

      throw new Error("No image data in response");
    } catch (error: any) {
      this.logger.error(
        `DALL-E 3 API error: ${error.response?.data?.error?.message || error.message}`,
      );

      // Return helpful error message instead of mock
      return {
        content: `抱歉，图像生成失败: ${error.response?.data?.error?.message || error.message}\n\n请检查 OpenAI API Key 是否有 DALL-E 3 的访问权限。`,
        model: "dall-e-3",
        tokensUsed: 0,
      };
    }
  }

  /**
   * Call Google Imagen API for image generation
   * Imagen 3 produces high-quality images
   */
  private async callImagenApi(
    apiKey: string,
    modelId: string,
    prompt: string,
  ): Promise<ChatCompletionResult> {
    // Use Imagen 4.0 as it's the latest available model via Gemini API
    // Available models: imagen-4.0-generate-001, imagen-4.0-ultra-generate-001, imagen-4.0-fast-generate-001
    const imagenModel = modelId.includes("imagen-4")
      ? modelId
      : "imagen-4.0-generate-001";

    // Correct endpoint format: :predict with x-goog-api-key header
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${imagenModel}:predict`;

    this.logger.log(`[Imagen] Calling API: ${url}`);
    this.logger.log(
      `[Imagen] Model: ${imagenModel}, Prompt length: ${prompt.length}`,
    );
    // Log the actual prompt being sent (first 500 chars for debugging)
    this.logger.log(
      `[Imagen] Prompt content: "${prompt.substring(0, 500)}${prompt.length > 500 ? "..." : ""}"`,
    );

    try {
      // Correct request format for Imagen API via Gemini
      // Use higher resolution for better quality images
      const response = await firstValueFrom(
        this.httpService.post(
          url,
          {
            instances: [
              {
                prompt: prompt,
              },
            ],
            parameters: {
              sampleCount: 1,
              aspectRatio: "16:9", // Better for infographics
              outputOptions: {
                mimeType: "image/png",
              },
            },
          },
          {
            headers: {
              "x-goog-api-key": apiKey,
              "Content-Type": "application/json",
            },
            timeout: 120000, // 2 minutes for image generation
          },
        ),
      );

      const data = response.data;
      this.logger.log(
        `[Imagen] Response received, keys: ${Object.keys(data).join(", ")}`,
      );

      // Response format can vary - handle both formats:
      // 1. SDK format: { generatedImages: [{ image: { imageBytes: "..." } }] }
      // 2. REST format: { predictions: [{ bytesBase64Encoded: "..." }] }
      let images: string[] = [];

      // Try SDK format first (generatedImages)
      if (data.generatedImages && data.generatedImages.length > 0) {
        images = data.generatedImages
          .map((img: any, index: number) => {
            const imageBytes = img.image?.imageBytes || img.imageBytes;
            if (imageBytes) {
              const cleanBase64 = imageBytes.replace(/\s/g, "");
              return `![Generated Image ${index + 1}](data:image/png;base64,${cleanBase64})`;
            }
            return null;
          })
          .filter(Boolean);
      }

      // Try REST format (predictions)
      if (
        images.length === 0 &&
        data.predictions &&
        data.predictions.length > 0
      ) {
        images = data.predictions
          .map((pred: any, index: number) => {
            const imageBytes =
              pred.bytesBase64Encoded || pred.image?.imageBytes;
            if (imageBytes) {
              const cleanBase64 = imageBytes.replace(/\s/g, "");
              return `![Generated Image ${index + 1}](data:image/png;base64,${cleanBase64})`;
            }
            return null;
          })
          .filter(Boolean);
      }

      if (images.length > 0) {
        this.logger.log(
          `[Imagen] Successfully generated ${images.length} image(s)`,
        );
        return {
          content: images.join("\n\n"),
          model: imagenModel,
          tokensUsed: 0,
        };
      }

      // If no images, log the response structure for debugging
      this.logger.warn(
        `[Imagen] No images found in response: ${JSON.stringify(data).substring(0, 1000)}`,
      );
      throw new Error("No images generated - check response format");
    } catch (error: any) {
      const errorMsg = error.response?.data?.error?.message || error.message;
      this.logger.error(`[Imagen] API error: ${errorMsg}`);
      this.logger.error(
        `[Imagen] Full error: ${JSON.stringify(error.response?.data || {}).substring(0, 1000)}`,
      );

      return {
        content: `抱歉，Imagen 图像生成失败: ${errorMsg}\n\n请确认:\n1. Google API Key 具有 Imagen API 访问权限\n2. 模型 imagen-4.0-generate-001 已可用\n3. Imagen API 已在 Google Cloud 项目中启用`,
        model: imagenModel,
        tokensUsed: 0,
      };
    }
  }

  /**
   * Generate a mock response for development/testing when API keys are not configured
   */
  private getMockResponse(
    model: string,
    messages: ChatMessage[],
    displayName?: string,
  ): ChatCompletionResult {
    const lastUserMessage = messages.filter((m) => m.role === "user").pop();
    const userContent = lastUserMessage?.content || "";

    // Use displayName if provided, otherwise format model nicely
    const aiName = displayName || this.formatModelDisplayName(model);

    // Generate contextual mock response
    let content: string;
    if (
      userContent.toLowerCase().includes("summarize") ||
      userContent.toLowerCase().includes("summary")
    ) {
      content = `## Discussion Summary

### Key Points
- The team discussed various aspects of the project
- Multiple perspectives were shared and considered
- Important decisions were made regarding next steps

### Decisions Made
1. Continue with the current approach
2. Schedule follow-up meetings as needed
3. Document all findings and share with stakeholders

### Action Items
- [ ] Review and finalize documentation
- [ ] Set up recurring meetings
- [ ] Share updates with the broader team

### Outstanding Questions
- Timeline for completion needs to be confirmed
- Resource allocation may need adjustment

*This is a mock summary generated for testing purposes. Configure API key in Admin panel for real AI responses.*`;
    } else {
      content = `⚠️ **API Key Not Configured**

I'm ${aiName}, but I cannot generate a real response because no API key is configured for this model.

**To fix this:**
1. Go to Admin Panel → AI Models
2. Find the model "${model}" and add your API key
3. Or set the appropriate environment variable (e.g., GOOGLE_AI_API_KEY for Gemini models)

*This is a mock response. Please configure the API key to enable real AI responses.*`;
    }

    return {
      content,
      model,
      tokensUsed: Math.floor(content.length / 4), // Rough estimate
    };
  }

  /**
   * Format a model ID into a user-friendly display name
   */
  private formatModelDisplayName(model: string): string {
    const modelLower = model.toLowerCase();

    // Map common model IDs to friendly names
    if (modelLower.includes("gemini")) {
      if (modelLower.includes("flash")) return "Gemini Flash";
      if (modelLower.includes("pro")) return "Gemini Pro";
      if (modelLower.includes("imagen")) return "Gemini Imagen";
      return "Gemini";
    }
    if (modelLower.includes("grok")) return "Grok";
    if (modelLower.includes("gpt-4")) return "GPT-4";
    if (modelLower.includes("gpt-5")) return "GPT-5";
    if (modelLower.startsWith("o1")) return "OpenAI o1";
    if (modelLower.startsWith("o3")) return "OpenAI o3";
    if (modelLower.includes("claude")) {
      if (modelLower.includes("opus")) return "Claude Opus";
      if (modelLower.includes("sonnet")) return "Claude Sonnet";
      if (modelLower.includes("haiku")) return "Claude Haiku";
      return "Claude";
    }
    if (modelLower.includes("dall-e")) return "DALL-E";

    // Default: return the model ID as-is
    return model;
  }

  /**
   * Get the environment variable name for a provider's API key
   */
  private getEnvVarNameForProvider(provider: string): string {
    const providerLower = provider.toLowerCase();
    if (providerLower === "xai" || providerLower === "grok")
      return "XAI_API_KEY";
    if (providerLower === "openai" || providerLower === "gpt")
      return "OPENAI_API_KEY";
    if (providerLower === "anthropic" || providerLower === "claude")
      return "ANTHROPIC_API_KEY";
    if (providerLower === "google" || providerLower === "gemini")
      return "GOOGLE_AI_API_KEY";
    return `${provider.toUpperCase()}_API_KEY`;
  }

  /**
   * Fetch available models from a provider's API
   * Returns list of model IDs and their metadata
   */
  async fetchAvailableModels(
    provider: string,
    apiKey: string,
    _apiEndpoint?: string, // Reserved for future custom endpoint support
  ): Promise<{
    success: boolean;
    models?: Array<{ id: string; name: string; description?: string }>;
    error?: string;
  }> {
    if (!apiKey) {
      return { success: false, error: "API key is required" };
    }

    try {
      switch (provider.toLowerCase()) {
        case "xai":
        case "grok":
          return await this.fetchXAIModels(apiKey);

        case "openai":
        case "gpt":
          return await this.fetchOpenAIModels(apiKey);

        case "anthropic":
        case "claude":
          return this.getAnthropicModels();

        case "google":
        case "gemini":
          return await this.fetchGeminiModels(apiKey);

        default:
          return { success: false, error: `Unknown provider: ${provider}` };
      }
    } catch (error: any) {
      this.logger.error(`Failed to fetch models for ${provider}: ${error}`);
      const errorMessage =
        error.response?.data?.error?.message ||
        error.response?.data?.message ||
        error.message ||
        "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Fetch models from xAI API
   */
  private async fetchXAIModels(apiKey: string) {
    const response = await firstValueFrom(
      this.httpService.get("https://api.x.ai/v1/models", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 30000,
      }),
    );

    const models = response.data?.data || [];
    return {
      success: true,
      models: models.map((m: any) => ({
        id: m.id,
        name: m.id,
        description: m.description || `xAI ${m.id}`,
      })),
    };
  }

  /**
   * Fetch models from OpenAI API
   */
  private async fetchOpenAIModels(apiKey: string) {
    const response = await firstValueFrom(
      this.httpService.get("https://api.openai.com/v1/models", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 30000,
      }),
    );

    const models = response.data?.data || [];
    // Filter to show only chat models (gpt-*)
    const chatModels = models
      .filter(
        (m: any) =>
          m.id.startsWith("gpt-") ||
          m.id.startsWith("o1") ||
          m.id.startsWith("o3"),
      )
      .sort((a: any, b: any) => b.created - a.created);

    return {
      success: true,
      models: chatModels.map((m: any) => ({
        id: m.id,
        name: m.id,
        description: `OpenAI ${m.id}`,
      })),
    };
  }

  /**
   * Get Anthropic models (no public list API, return known models)
   */
  private getAnthropicModels() {
    // Anthropic doesn't have a public models list API
    // Return known production models
    const models = [
      {
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet 4",
        description: "Most intelligent model, best for complex tasks",
      },
      {
        id: "claude-3-5-sonnet-20241022",
        name: "Claude 3.5 Sonnet",
        description: "Best balance of intelligence and speed",
      },
      {
        id: "claude-3-5-haiku-20241022",
        name: "Claude 3.5 Haiku",
        description: "Fastest model, good for simple tasks",
      },
      {
        id: "claude-3-opus-20240229",
        name: "Claude 3 Opus",
        description: "Previous flagship model",
      },
    ];

    return { success: true, models };
  }

  /**
   * Fetch models from Google Gemini API
   * Includes both Gemini text/multimodal models and Imagen image generation models
   */
  private async fetchGeminiModels(apiKey: string) {
    const response = await firstValueFrom(
      this.httpService.get(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        {
          timeout: 30000,
        },
      ),
    );

    const models = response.data?.models || [];
    // Filter to relevant models - include both gemini and imagen models
    const relevantModels = models.filter((m: any) => {
      const modelName = m.name.toLowerCase();
      const supportsGenerate =
        m.supportedGenerationMethods?.includes("generateContent");

      // Include Gemini models that support generateContent
      if (modelName.includes("gemini") && supportsGenerate) {
        return true;
      }

      // Include Imagen models for image generation
      if (modelName.includes("imagen")) {
        return true;
      }

      return false;
    });

    // Sort models: gemini-2.0-flash-exp first (supports image gen), then others
    const sortedModels = relevantModels.sort((a: any, b: any) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();

      // Prioritize image-capable models
      const aIsImageCapable =
        aName.includes("gemini-2.0-flash-exp") || aName.includes("imagen");
      const bIsImageCapable =
        bName.includes("gemini-2.0-flash-exp") || bName.includes("imagen");

      if (aIsImageCapable && !bIsImageCapable) return -1;
      if (!aIsImageCapable && bIsImageCapable) return 1;

      return aName.localeCompare(bName);
    });

    return {
      success: true,
      models: sortedModels.map((m: any) => {
        const modelId = m.name.replace("models/", "");
        const isImageModel =
          modelId.includes("imagen") ||
          modelId.includes("gemini-2.0-flash-exp");
        return {
          id: modelId,
          name: m.displayName || modelId,
          description:
            m.description ||
            `Google ${m.displayName}${isImageModel ? " (supports image generation)" : ""}`,
        };
      }),
    };
  }
}
