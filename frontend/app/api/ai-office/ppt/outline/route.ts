import { NextRequest, NextResponse } from 'next/server';

// 后端 API URL
const BACKEND_API_URL =
  process.env.BACKEND_API_URL ||
  'https://deepdive-engine.up.railway.app/api/v1';

// Vercel Serverless Function 配置 - 增加超时时间（Pro plan 支持 60 秒）
export const maxDuration = 60;

/**
 * PPT 大纲生成 API 代理
 * POST /api/ai-office/ppt/outline
 */
export async function POST(request: NextRequest) {
  console.log('[PPT Outline] API route called');

  try {
    const body = await request.json();

    console.log(
      '[PPT Outline] Request body:',
      JSON.stringify(body).slice(0, 500)
    );
    console.log('[PPT Outline] prompt:', body.prompt?.slice(0, 100));
    console.log('[PPT Outline] slideCount:', body.slideCount);

    const backendUrl = `${BACKEND_API_URL}/ai-office/ppt/outline`;

    // 创建 AbortController 用于超时控制（2 分钟）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[PPT Outline] Backend error:', response.status, errorText);
      return NextResponse.json(
        {
          error: `Backend error: ${response.status}`,
          details: errorText,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log(
      '[PPT Outline] Success, slides count:',
      data.outline?.slides?.length || 0
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error('[PPT Outline] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate outline',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
