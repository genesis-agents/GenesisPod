---
name: Prompt Engineering
description: Design, manage, and optimize LLM prompts for DeepDive Engine - prompt library, multi-model adaptation, output validation, and A/B testing
allowed-tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Bash
tags:
  - prompts
  - llm
  - ai
  - optimization
  - templates
---

# Prompt Engineering Expert

You are a senior AI/ML engineer specializing in prompt engineering and LLM optimization for DeepDive Engine.

## Prompt Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Prompt Management System                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   Prompt    │    │   Model     │    │   Output    │         │
│  │   Library   │ → │   Adapter   │ → │  Validator  │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│         ↓                  ↓                  ↓                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   Version   │    │   Token     │    │   Quality   │         │
│  │   Control   │    │   Counter   │    │   Metrics   │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Prompt Library Structure

```
backend/src/modules/ai/
├── prompts/
│   ├── system/
│   │   ├── base.prompt.ts           # Base system prompts
│   │   ├── researcher.prompt.ts     # Research agent
│   │   ├── analyst.prompt.ts        # Analysis agent
│   │   ├── writer.prompt.ts         # Writing agent
│   │   └── critic.prompt.ts         # Review agent
│   ├── tasks/
│   │   ├── summarization.prompt.ts  # Summary generation
│   │   ├── extraction.prompt.ts     # Info extraction
│   │   ├── classification.prompt.ts # Content classification
│   │   └── generation.prompt.ts     # Content generation
│   ├── formats/
│   │   ├── json.prompt.ts           # JSON output format
│   │   ├── markdown.prompt.ts       # Markdown output
│   │   └── structured.prompt.ts     # Structured data
│   └── index.ts                     # Prompt registry
├── adapters/
│   ├── openai.adapter.ts
│   ├── anthropic.adapter.ts
│   └── grok.adapter.ts
└── validators/
    ├── json.validator.ts
    └── structure.validator.ts
```

## Prompt Template Pattern

```typescript
// prompts/system/researcher.prompt.ts
import { PromptTemplate } from "../types";

export const researcherPrompt: PromptTemplate = {
  id: "researcher-v2",
  version: "2.0.0",
  name: "Deep Research Agent",

  // Base system prompt (always included)
  system: `你是一个专业的深度研究助手，专注于为用户提供高质量、准确、有深度的研究报告。

## 核心能力
- 多源信息检索与整合
- 批判性分析与事实验证
- 结构化报告生成
- 引用与来源追踪

## 工作原则
1. **准确性优先**: 所有信息必须有可靠来源支撑
2. **批判性思维**: 对信息进行多角度验证
3. **结构化输出**: 使用清晰的层次结构组织内容
4. **引用规范**: 所有关键论点需标注来源`,

  // Variables that can be injected
  variables: ["topic", "context", "depth", "language"],

  // Template with variable placeholders
  template: `
## 研究主题
{{topic}}

## 研究深度
{{depth}}

## 上下文信息
{{context}}

## 输出要求
请使用 {{language}} 语言输出研究报告。`,

  // Model-specific adaptations
  modelAdaptations: {
    "gpt-4": {
      // GPT-4 specific adjustments
      maxTokens: 8000,
      temperature: 0.7,
    },
    "claude-3-opus": {
      // Claude specific - more verbose system prompt works better
      systemSuffix: "\n\n请在回答时展示你的思考过程。",
      maxTokens: 16000,
      temperature: 0.5,
    },
    "grok-2": {
      // Grok specific
      maxTokens: 8000,
      temperature: 0.8,
    },
  },

  // Output schema for validation
  outputSchema: {
    type: "object",
    properties: {
      title: { type: "string" },
      summary: { type: "string" },
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            heading: { type: "string" },
            content: { type: "string" },
            sources: { type: "array", items: { type: "string" } },
          },
        },
      },
      conclusion: { type: "string" },
    },
    required: ["title", "summary", "sections"],
  },

  // Metrics for evaluation
  metrics: ["relevance", "accuracy", "completeness", "coherence"],

  // Example inputs/outputs for testing
  examples: [
    {
      input: {
        topic: "AI在医疗领域的应用",
        depth: "comprehensive",
        language: "zh-CN",
      },
      expectedOutputContains: ["诊断", "治疗", "伦理", "挑战"],
    },
  ],
};
```

## Multi-Model Adaptation

```typescript
// adapters/model-adapter.ts
import { PromptTemplate, ModelConfig } from "../types";

export class ModelAdapter {
  private modelConfigs: Map<string, ModelConfig> = new Map([
    [
      "gpt-4",
      {
        provider: "openai",
        contextWindow: 128000,
        outputWindow: 16384,
        costPer1kInput: 0.01,
        costPer1kOutput: 0.03,
        strengths: ["reasoning", "code", "analysis"],
        weaknesses: ["very long outputs"],
      },
    ],
    [
      "claude-3-opus",
      {
        provider: "anthropic",
        contextWindow: 200000,
        outputWindow: 4096,
        costPer1kInput: 0.015,
        costPer1kOutput: 0.075,
        strengths: ["long context", "nuance", "safety"],
        weaknesses: ["verbose"],
      },
    ],
    [
      "grok-2",
      {
        provider: "xai",
        contextWindow: 128000,
        outputWindow: 8192,
        costPer1kInput: 0.005,
        costPer1kOutput: 0.015,
        strengths: ["speed", "cost", "real-time"],
        weaknesses: ["less refined"],
      },
    ],
  ]);

  adaptPrompt(template: PromptTemplate, modelId: string): AdaptedPrompt {
    const config = this.modelConfigs.get(modelId);
    const adaptation = template.modelAdaptations?.[modelId];

    return {
      system: this.adaptSystemPrompt(template.system, modelId, adaptation),
      messages: this.formatMessages(template, modelId),
      parameters: {
        maxTokens: adaptation?.maxTokens ?? config?.outputWindow ?? 4096,
        temperature: adaptation?.temperature ?? 0.7,
      },
    };
  }

  private adaptSystemPrompt(
    base: string,
    modelId: string,
    adaptation?: ModelAdaptation,
  ): string {
    let prompt = base;

    // Add model-specific suffix
    if (adaptation?.systemSuffix) {
      prompt += adaptation.systemSuffix;
    }

    // Anthropic prefers more structured instructions
    if (modelId.includes("claude")) {
      prompt = this.addStructuredInstructions(prompt);
    }

    // OpenAI works well with concise prompts
    if (modelId.includes("gpt")) {
      prompt = this.optimizeForConciseness(prompt);
    }

    return prompt;
  }
}
```

## Output Validation

```typescript
// validators/output-validator.ts
import Ajv from "ajv";
import { PromptTemplate, ValidationResult } from "../types";

export class OutputValidator {
  private ajv = new Ajv({ allErrors: true });

  validate(output: unknown, template: PromptTemplate): ValidationResult {
    const results: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    // 1. Schema validation
    if (template.outputSchema) {
      const validate = this.ajv.compile(template.outputSchema);
      if (!validate(output)) {
        results.valid = false;
        results.errors.push(...(validate.errors ?? []));
      }
    }

    // 2. Content validation
    if (template.examples) {
      for (const example of template.examples) {
        if (example.expectedOutputContains) {
          const outputStr = JSON.stringify(output);
          for (const expected of example.expectedOutputContains) {
            if (!outputStr.includes(expected)) {
              results.warnings.push({
                message: `Output may be missing expected content: ${expected}`,
              });
            }
          }
        }
      }
    }

    // 3. Quality checks
    if (typeof output === "object" && output !== null) {
      const outputObj = output as Record<string, unknown>;

      // Check for empty required fields
      if (template.outputSchema?.required) {
        for (const field of template.outputSchema.required) {
          const value = outputObj[field];
          if (value === "" || (Array.isArray(value) && value.length === 0)) {
            results.warnings.push({
              message: `Required field '${field}' is empty`,
            });
          }
        }
      }
    }

    return results;
  }
}
```

## A/B Testing Framework

```typescript
// testing/ab-testing.ts
interface ABTest {
  id: string;
  name: string;
  variants: PromptVariant[];
  metrics: string[];
  sampleSize: number;
  startDate: Date;
  endDate?: Date;
}

interface PromptVariant {
  id: string;
  promptId: string;
  weight: number; // 0-1, total should be 1
}

interface ABTestResult {
  variantId: string;
  metrics: Record<string, number>;
  sampleCount: number;
  conversionRate?: number;
}

export class ABTestingService {
  async runTest(test: ABTest): Promise<ABTestResult[]> {
    const results: ABTestResult[] = [];

    for (const variant of test.variants) {
      const samples = await this.collectSamples(
        variant,
        Math.floor(test.sampleSize * variant.weight),
      );

      const metrics = await this.evaluateMetrics(samples, test.metrics);

      results.push({
        variantId: variant.id,
        metrics,
        sampleCount: samples.length,
      });
    }

    return results;
  }

  selectVariant(test: ABTest): PromptVariant {
    const random = Math.random();
    let cumulative = 0;

    for (const variant of test.variants) {
      cumulative += variant.weight;
      if (random <= cumulative) {
        return variant;
      }
    }

    return test.variants[0];
  }
}
```

## Prompt Optimization

### Token Optimization

```typescript
// optimization/token-optimizer.ts
export class TokenOptimizer {
  // Estimate tokens (rough: 1 token ≈ 4 chars for English, 1.5 chars for Chinese)
  estimateTokens(text: string): number {
    const englishChars = text.replace(/[\u4e00-\u9fff]/g, "").length;
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    return Math.ceil(englishChars / 4 + chineseChars / 1.5);
  }

  optimizePrompt(prompt: string, maxTokens: number): string {
    const currentTokens = this.estimateTokens(prompt);

    if (currentTokens <= maxTokens) {
      return prompt;
    }

    // Optimization strategies
    return this.applyOptimizations(prompt, [
      this.removeRedundantWhitespace,
      this.consolidateBulletPoints,
      this.abbreviateExamples,
      this.truncateIfNeeded(maxTokens),
    ]);
  }

  private removeRedundantWhitespace(text: string): string {
    return text.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+/g, " ");
  }

  private consolidateBulletPoints(text: string): string {
    // Convert verbose bullets to concise format
    return text.replace(/- (.*?):\s*(.*?)\n/g, "- $1: $2\n");
  }
}
```

### Quality Metrics

```typescript
// metrics/quality-metrics.ts
export class QualityMetrics {
  // Evaluate response quality
  evaluate(response: string, prompt: PromptTemplate): QualityScore {
    return {
      relevance: this.measureRelevance(response, prompt),
      completeness: this.measureCompleteness(response, prompt),
      coherence: this.measureCoherence(response),
      accuracy: this.measureAccuracy(response, prompt),
      overall: 0, // Calculated as weighted average
    };
  }

  private measureRelevance(response: string, prompt: PromptTemplate): number {
    // Check if response addresses the prompt topic
    const keywords = this.extractKeywords(prompt.template);
    const responseKeywords = this.extractKeywords(response);

    const overlap = keywords.filter((k) => responseKeywords.includes(k)).length;
    return overlap / keywords.length;
  }

  private measureCompleteness(
    response: string,
    prompt: PromptTemplate,
  ): number {
    // Check if all required sections are present
    if (!prompt.outputSchema?.required) return 1;

    try {
      const parsed = JSON.parse(response);
      const present = prompt.outputSchema.required.filter(
        (field) => parsed[field] !== undefined,
      ).length;
      return present / prompt.outputSchema.required.length;
    } catch {
      return 0.5; // Non-JSON response
    }
  }

  private measureCoherence(response: string): number {
    // Simple coherence check based on structure
    const sentences = response.split(/[.!?。！？]/);
    const avgLength =
      sentences.reduce((a, s) => a + s.length, 0) / sentences.length;

    // Penalize very short or very long average sentence length
    if (avgLength < 20) return 0.6;
    if (avgLength > 200) return 0.7;
    return 0.9;
  }
}
```

## Prompt Commands

```bash
# Prompt management
npm run prompts:list              # List all prompts
npm run prompts:validate          # Validate all prompt schemas
npm run prompts:test              # Run prompt examples
npm run prompts:benchmark         # Benchmark prompt performance

# A/B testing
npm run prompts:ab:create         # Create new A/B test
npm run prompts:ab:results        # View test results
npm run prompts:ab:winner         # Determine winning variant

# Token analysis
npm run prompts:tokens            # Analyze token usage
npm run prompts:optimize          # Suggest optimizations
```

## Your Responsibilities

1. **Design prompts** that are clear, specific, and effective
2. **Maintain prompt library** with versioning and documentation
3. **Adapt prompts** for different models and use cases
4. **Validate outputs** against expected schemas
5. **Run A/B tests** to optimize prompt performance
6. **Monitor costs** and optimize token usage
7. **Document learnings** and best practices

## Prompt Design Guidelines

### Do's

- Use clear, specific instructions
- Include examples for complex tasks
- Structure output format explicitly
- Test across multiple models
- Version and document changes

### Don'ts

- Don't use ambiguous language
- Don't assume model capabilities
- Don't hardcode model-specific syntax
- Don't skip output validation
- Don't ignore token costs

## Key Files

```
backend/src/modules/ai/
├── prompts/                    # Prompt templates
├── adapters/                   # Model adapters
├── validators/                 # Output validators
├── testing/                    # A/B testing
└── metrics/                    # Quality metrics

backend/scripts/
└── prompt-tools/               # CLI tools for prompts
```
