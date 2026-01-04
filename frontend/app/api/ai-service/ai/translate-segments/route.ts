import { NextRequest, NextResponse } from 'next/server';

// Try NestJS backend first, fallback to AI service
function getBackendUrl() {
  return (
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:4000'
  );
}
const API_URL = getBackendUrl();
// AI service as fallback (should be same as backend in most cases)
const AI_SERVICE_URL = getBackendUrl();

// 增加超时时间到5分钟
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      segments,
      targetLanguage = 'zh-CN',
      model = 'gemini',
      batchSize = 10,
    } = body;

    console.log(
      `Translation request: ${segments.length} segments, model: ${model}, batchSize: ${batchSize}`
    );

    // 创建带超时的 fetch 请求
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5分钟超时

    try {
      // Try NestJS backend first (translate-segments endpoint)
      let response = await fetch(`${API_URL}/api/v1/ai/translate-segments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          segments,
          targetLanguage,
          model,
          batchSize,
        }),
        signal: controller.signal,
      });

      // If NestJS doesn't have this endpoint, try AI service
      if (response.status === 404) {
        console.log('NestJS endpoint not found, trying AI service...');
        response = await fetch(
          `${AI_SERVICE_URL}/api/v1/ai/translate-segments`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              segments,
              targetLanguage,
              model,
              batchSize,
            }),
            signal: controller.signal,
          }
        );
      }

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`AI service error: ${response.status} - ${errorText}`);
        throw new Error(`AI service responded with status: ${response.status}`);
      }

      const data = await response.json();
      console.log(
        `Translation completed: ${data.translations?.length || 0} translations`
      );
      return NextResponse.json(data);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.error('Translation request timed out after 5 minutes');
        throw new Error('Translation request timed out');
      }
      throw fetchError;
    }
  } catch (error: any) {
    console.error('Translation error:', error?.message || error);
    return NextResponse.json(
      { error: error?.message || 'Failed to translate segments' },
      { status: 500 }
    );
  }
}
