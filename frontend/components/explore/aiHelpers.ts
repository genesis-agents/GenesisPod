/**
 * AI-related helper functions for resource analysis
 */

import { config } from '@/lib/utils/config';
import type { Resource, AIInsight } from './types';

/**
 * Save AI analysis results to database
 */
export async function saveAIAnalysisToDatabase(
  resourceId: string,
  data: {
    aiSummary?: string;
    keyInsights?: AIInsight[];
    methodology?: string;
  }
): Promise<void> {
  try {
    const res = await fetch(`${config.apiUrl}/resources/${resourceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      console.log('AI analysis saved to database for resource:', resourceId);
    }
  } catch (error) {
    console.error('Failed to save AI analysis to database:', error);
  }
}

/**
 * Generate AI summary for resource
 */
export async function generateSummary(
  resource: Resource,
  articleTextContent: string,
  setAiSummary: (summary: string) => void,
  setAiLoading: (loading: boolean) => void
): Promise<void> {
  if (!resource) return;

  // Check if we already have summary in database
  if (resource.aiSummary) {
    console.log('Using cached summary from database');
    setAiSummary(resource.aiSummary);
    return;
  }

  try {
    setAiLoading(true);
    // Use extracted article content if available, otherwise fallback to abstract/title
    const content = articleTextContent || resource.abstract || resource.title;
    console.log('Generating summary with content length:', content.length);

    const res = await fetch('/api/ai-service/ai/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: content,
        max_length: 200,
        language: 'zh',
      }),
    });

    if (!res.ok) {
      if (res.status === 503) {
        setAiSummary(
          '⚠️ AI服务暂不可用\n\n请在 ai-service/.env 文件中配置以下API密钥之一：\n• GROK_API_KEY (推荐)\n• OPENAI_API_KEY\n\n配置后重启 ai-service 即可使用AI功能。'
        );
      } else {
        try {
          const error = await res.json();
          setAiSummary(
            `生成失败: ${error.error || error.detail || error.message || 'AI服务返回错误'}`
          );
        } catch {
          setAiSummary(`生成失败: AI服务返回错误 (${res.status})`);
        }
      }
      return;
    }

    const data = await res.json();
    setAiSummary(data.summary);

    // Save to database for future use
    if (data.summary) {
      await saveAIAnalysisToDatabase(resource.id, { aiSummary: data.summary });
    }
  } catch (error) {
    console.error('Failed to generate summary:', error);
    setAiSummary(
      '⚠️ 无法连接到AI服务\n\n请确保 ai-service 已启动：\ncd ai-service && uvicorn main:app --reload'
    );
  } finally {
    setAiLoading(false);
  }
}

/**
 * Generate AI insights for resource
 */
export async function generateInsights(
  resource: Resource,
  articleTextContent: string,
  setAiInsights: (insights: AIInsight[]) => void
): Promise<void> {
  if (!resource) return;

  // Check if we already have insights in database
  if (resource.keyInsights && resource.keyInsights.length > 0) {
    console.log('Using cached insights from database');
    setAiInsights(resource.keyInsights);
    return;
  }

  try {
    // Use extracted article content if available, otherwise fallback to abstract/title
    const content = articleTextContent || resource.abstract || resource.title;
    console.log('Generating insights with content length:', content.length);

    const res = await fetch('/api/ai-service/ai/insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: content,
        language: 'zh',
      }),
    });

    const data = await res.json();
    const insights = data.insights || [];
    setAiInsights(insights);

    // Save to database for future use
    if (insights.length > 0) {
      await saveAIAnalysisToDatabase(resource.id, { keyInsights: insights });
    }
  } catch (error) {
    console.error('Failed to generate insights:', error);
  }
}
