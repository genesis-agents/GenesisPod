declare module "openai" {
  interface EmbeddingCreateParams {
    model: string;
    input: string | string[];
    dimensions?: number;
    encoding_format?: string;
  }

  interface EmbeddingData {
    embedding: number[];
    index: number;
    object: string;
  }

  interface EmbeddingResponse {
    data: EmbeddingData[];
    model: string;
    object: string;
    usage: {
      prompt_tokens: number;
      total_tokens: number;
    };
  }

  interface Embeddings {
    create(params: EmbeddingCreateParams): Promise<EmbeddingResponse>;
  }

  interface ChatCompletionMessageParam {
    role: "system" | "user" | "assistant";
    content: string;
  }

  interface ChatCompletionCreateParams {
    model: string;
    messages: ChatCompletionMessageParam[];
    temperature?: number;
    max_tokens?: number;
  }

  interface ChatCompletionChoice {
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
    index: number;
  }

  interface ChatCompletionResponse {
    id: string;
    choices: ChatCompletionChoice[];
    usage: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
  }

  interface Chat {
    completions: {
      create(
        params: ChatCompletionCreateParams,
      ): Promise<ChatCompletionResponse>;
    };
  }

  interface OpenAIOptions {
    apiKey?: string;
    baseURL?: string;
  }

  class OpenAI {
    embeddings: Embeddings;
    chat: Chat;
    constructor(options?: OpenAIOptions);
  }

  export default OpenAI;
}
