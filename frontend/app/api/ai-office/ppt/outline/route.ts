import { NextRequest, NextResponse } from 'next/server';

// 后端 API URL
const BACKEND_API_URL =
  process.env.BACKEND_API_URL ||
  'https://deepdive-engine.up.railway.app/api/v1';

/**
 * PPT 大纲生成 API 代理
 * POST /api/ai-office/ppt/outline
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    console.log('[PPT Outline] Request:', JSON.stringify(body).slice(0, 200));

    const backendUrl = `${BACKEND_API_URL}/ai-office/ppt/outline`;

    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

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
