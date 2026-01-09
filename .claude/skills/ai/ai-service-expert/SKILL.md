---
name: AI Service Expert
description: Integrate and manage AI services (Grok, OpenAI, Claude) for DeepDive Engine
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
tags:
  - ai
  - grok
  - openai
  - llm
---

# AI Service Integration Expert

You are an expert at integrating and managing AI services for DeepDive Engine.

## AI Service Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   AI Orchestrator                        │
│                   (NestJS Backend)                       │
├─────────────────────────────────────────────────────────┤
│  Primary: Grok API (x.AI) - Speed optimized             │
│  Fallback: OpenAI GPT-4 → Claude → Gemini → DeepSeek   │
├─────────────────────────────────────────────────────────┤
│                   AI Python Service                      │
│                   (FastAPI - Port 5000)                  │
└─────────────────────────────────────────────────────────┘
                          │
    ┌─────────────────────┼─────────────────────┐
    │                     │                     │
┌───▼───┐           ┌─────▼─────┐         ┌─────▼─────┐
│ Grok  │           │  OpenAI   │         │  Claude   │
│ (x.AI)│           │  GPT-4    │         │  Opus/    │
│       │           │  GPT-4o   │         │  Sonnet   │
└───────┘           └───────────┘         └───────────┘
```

## AI Client Configuration

### Grok Client (Primary)

```python
# ai-service/services/grok_client.py
import httpx
from typing import AsyncGenerator

class GrokClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.x.ai/v1"
        self.client = httpx.AsyncClient(timeout=60.0)

    async def chat_completion(
        self,
        messages: list[dict],
        model: str = "grok-beta",
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> dict:
        response = await self.client.post(
            f"{self.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            },
        )
        return response.json()

    async def stream_completion(
        self,
        messages: list[dict],
        model: str = "grok-beta",
    ) -> AsyncGenerator[str, None]:
        async with self.client.stream(
            "POST",
            f"{self.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={"model": model, "messages": messages, "stream": True},
        ) as response:
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    yield line[6:]
```

### OpenAI Fallback

```python
# ai-service/services/openai_client.py
from openai import AsyncOpenAI

class OpenAIClient:
    def __init__(self, api_key: str):
        self.client = AsyncOpenAI(api_key=api_key)

    async def chat_completion(
        self,
        messages: list[dict],
        model: str = "gpt-4o",
        temperature: float = 0.7,
    ) -> dict:
        response = await self.client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
        )
        return response.model_dump()
```

## AI Orchestration Pattern

```typescript
// backend/src/modules/ai/ai-orchestrator.service.ts
@Injectable()
export class AIOrchestrator {
  private providers = ["grok", "openai", "claude", "gemini"];

  async complete(request: AIRequest): Promise<AIResponse> {
    for (const provider of this.providers) {
      try {
        const result = await this.callProvider(provider, request);
        return { ...result, provider };
      } catch (error) {
        this.logger.warn(`Provider ${provider} failed, trying next...`);
        continue;
      }
    }
    throw new ServiceUnavailableException("All AI providers failed");
  }

  private async callProvider(provider: string, request: AIRequest) {
    switch (provider) {
      case "grok":
        return this.grokService.complete(request);
      case "openai":
        return this.openaiService.complete(request);
      case "claude":
        return this.claudeService.complete(request);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }
}
```

## LiteLLM Proxy Configuration

```yaml
# litellm-proxy/config.yaml
model_list:
  - model_name: grok-beta
    litellm_params:
      model: xai/grok-beta
      api_key: ${GROK_API_KEY}

  - model_name: gpt-4o
    litellm_params:
      model: openai/gpt-4o
      api_key: ${OPENAI_API_KEY}

  - model_name: claude-3-opus
    litellm_params:
      model: anthropic/claude-3-opus
      api_key: ${ANTHROPIC_API_KEY}

router_settings:
  routing_strategy: latency-based-routing
  num_retries: 3
  timeout: 60
```

## Prompt Engineering Patterns

### System Prompt Template

```python
SYSTEM_PROMPT = """You are an AI assistant for DeepDive Engine, a knowledge management platform.

Your capabilities:
- Analyze documents and extract key insights
- Generate summaries and reports
- Answer questions based on provided context
- Help organize and structure information

Guidelines:
- Be concise and accurate
- Cite sources when available
- Acknowledge uncertainty when appropriate
- Follow the user's preferred language
"""
```

### Structured Output

```python
from pydantic import BaseModel

class AnalysisResult(BaseModel):
    summary: str
    key_points: list[str]
    sentiment: str
    confidence: float

async def analyze_with_structure(content: str) -> AnalysisResult:
    response = await client.chat_completion(
        messages=[
            {"role": "system", "content": "Output valid JSON matching the schema."},
            {"role": "user", "content": f"Analyze: {content}"},
        ],
        response_format={"type": "json_object"},
    )
    return AnalysisResult.model_validate_json(response["choices"][0]["message"]["content"])
```

## Error Handling

```python
class AIServiceError(Exception):
    """Base AI service error"""

class RateLimitError(AIServiceError):
    """Rate limit exceeded"""

class TokenLimitError(AIServiceError):
    """Token limit exceeded"""

async def safe_completion(messages: list[dict]) -> dict:
    try:
        return await client.chat_completion(messages)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            raise RateLimitError("Rate limit exceeded, retry later")
        if e.response.status_code == 400:
            raise TokenLimitError("Token limit exceeded")
        raise AIServiceError(f"API error: {e.response.status_code}")
```

## Your Responsibilities

1. Configure AI provider clients correctly
2. Implement robust fallback logic
3. Handle rate limits and token limits
4. Optimize prompts for accuracy and cost
5. Implement streaming for real-time responses
6. Monitor AI service costs and usage
7. Ensure proper error handling and logging
8. Test AI integrations thoroughly
