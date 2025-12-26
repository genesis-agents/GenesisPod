/**
 * Screenshot Analyzer Service
 *
 * 截图分析服务 - 使用 Vision 模型分析用户上传的截图
 *
 * 职责：
 * 1. OCR 识别截图中的文本
 * 2. 识别错误信息和异常
 * 3. 识别页面和 UI 元素
 * 4. 生成问题描述
 */

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  ScreenshotAnalysis,
  FeedbackAttachment,
} from "../triage/triage-decision.types";

interface VisionMessage {
  role: "user" | "assistant" | "system";
  content:
    | string
    | Array<{
        type: "text" | "image_url";
        text?: string;
        image_url?: { url: string };
      }>;
}

@Injectable()
export class ScreenshotAnalyzerService {
  private readonly logger = new Logger(ScreenshotAnalyzerService.name);
  private readonly openaiApiKey: string;
  private readonly openaiBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.openaiApiKey = this.configService.get<string>("OPENAI_API_KEY") || "";
    this.openaiBaseUrl =
      this.configService.get<string>("OPENAI_BASE_URL") ||
      "https://api.openai.com/v1";
  }

  /**
   * 分析截图
   */
  async analyzeScreenshots(
    attachments: FeedbackAttachment[],
  ): Promise<ScreenshotAnalysis> {
    const imageAttachments = attachments.filter((a) =>
      a.mimeType.startsWith("image/"),
    );

    if (imageAttachments.length === 0) {
      return { hasScreenshot: false };
    }

    this.logger.log(`Analyzing ${imageAttachments.length} screenshots`);

    try {
      const analysisResults = await Promise.all(
        imageAttachments.map((attachment) =>
          this.analyzeSingleScreenshot(attachment),
        ),
      );

      // 合并所有分析结果
      return this.mergeAnalysisResults(analysisResults);
    } catch (error) {
      this.logger.error("Failed to analyze screenshots", error);
      return {
        hasScreenshot: true,
        issueDescription: "截图分析失败，请人工查看",
      };
    }
  }

  /**
   * 分析单个截图
   */
  private async analyzeSingleScreenshot(
    attachment: FeedbackAttachment,
  ): Promise<ScreenshotAnalysis> {
    const prompt = `你是一个专业的软件测试工程师，正在分析用户提交的 bug 截图。

请仔细分析这张截图，提取以下信息：

1. **检测到的文本** (detectedText): 识别截图中的所有关键文本，特别是错误消息、警告信息
2. **检测到的错误** (detectedErrors): 提取任何错误信息、异常堆栈、警告弹窗
3. **UI 元素** (uiElements): 识别截图中的主要 UI 组件（按钮、表单、弹窗等）
4. **页面识别** (pageIdentified): 判断这是哪个功能页面（如：PPT编辑器、研究报告、设置页面等）
5. **问题描述** (issueDescription): 用一句话描述你从截图中观察到的问题

请以 JSON 格式返回结果：
{
  "detectedText": ["文本1", "文本2"],
  "detectedErrors": ["错误信息1"],
  "uiElements": ["按钮", "表单"],
  "pageIdentified": "页面名称",
  "issueDescription": "问题描述"
}

只返回 JSON，不要其他解释。`;

    const messages: VisionMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: { url: attachment.url },
          },
        ],
      },
    ];

    try {
      const response = await this.callVisionApi(messages);
      return this.parseVisionResponse(response);
    } catch (error) {
      this.logger.error(
        `Failed to analyze screenshot: ${attachment.filename}`,
        error,
      );
      return {
        hasScreenshot: true,
        issueDescription: `截图 ${attachment.filename} 分析失败`,
      };
    }
  }

  /**
   * 调用 Vision API
   */
  private async callVisionApi(messages: VisionMessage[]): Promise<string> {
    if (!this.openaiApiKey) {
      throw new Error("OpenAI API key not configured");
    }

    const response = await fetch(`${this.openaiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages,
        max_tokens: 1000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Vision API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || "";
  }

  /**
   * 解析 Vision 响应
   */
  private parseVisionResponse(response: string): ScreenshotAnalysis {
    try {
      // 提取 JSON 部分
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        hasScreenshot: true,
        detectedText: parsed.detectedText || [],
        detectedErrors: parsed.detectedErrors || [],
        uiElements: parsed.uiElements || [],
        pageIdentified: parsed.pageIdentified || undefined,
        issueDescription: parsed.issueDescription || undefined,
      };
    } catch (error) {
      this.logger.warn("Failed to parse vision response", error);
      return {
        hasScreenshot: true,
        issueDescription: response.slice(0, 200),
      };
    }
  }

  /**
   * 合并多个分析结果
   */
  private mergeAnalysisResults(
    results: ScreenshotAnalysis[],
  ): ScreenshotAnalysis {
    if (results.length === 0) {
      return { hasScreenshot: false };
    }

    if (results.length === 1) {
      return results[0];
    }

    // 合并所有结果
    const merged: ScreenshotAnalysis = {
      hasScreenshot: true,
      detectedText: [],
      detectedErrors: [],
      uiElements: [],
    };

    const pages = new Set<string>();
    const descriptions: string[] = [];

    for (const result of results) {
      if (result.detectedText) {
        merged.detectedText!.push(...result.detectedText);
      }
      if (result.detectedErrors) {
        merged.detectedErrors!.push(...result.detectedErrors);
      }
      if (result.uiElements) {
        merged.uiElements!.push(...result.uiElements);
      }
      if (result.pageIdentified) {
        pages.add(result.pageIdentified);
      }
      if (result.issueDescription) {
        descriptions.push(result.issueDescription);
      }
    }

    // 去重
    merged.detectedText = [...new Set(merged.detectedText)];
    merged.detectedErrors = [...new Set(merged.detectedErrors)];
    merged.uiElements = [...new Set(merged.uiElements)];

    // 合并页面和描述
    if (pages.size > 0) {
      merged.pageIdentified = [...pages].join(", ");
    }
    if (descriptions.length > 0) {
      merged.issueDescription = descriptions.join("; ");
    }

    return merged;
  }

  /**
   * 快速检查截图是否包含错误
   */
  async quickErrorCheck(
    attachments: FeedbackAttachment[],
  ): Promise<{ hasError: boolean; errorHint?: string }> {
    const analysis = await this.analyzeScreenshots(attachments);

    if (analysis.detectedErrors && analysis.detectedErrors.length > 0) {
      return {
        hasError: true,
        errorHint: analysis.detectedErrors[0],
      };
    }

    // 检查常见错误关键词
    const errorKeywords = [
      "error",
      "错误",
      "失败",
      "failed",
      "exception",
      "异常",
      "warning",
      "警告",
      "404",
      "500",
      "undefined",
      "null",
    ];

    const allText = (analysis.detectedText || []).join(" ").toLowerCase();

    for (const keyword of errorKeywords) {
      if (allText.includes(keyword)) {
        return {
          hasError: true,
          errorHint: `检测到关键词: ${keyword}`,
        };
      }
    }

    return { hasError: false };
  }
}
