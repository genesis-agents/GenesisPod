import { NextRequest, NextResponse } from 'next/server';

// 后端 API URL
const BACKEND_API_URL =
  process.env.BACKEND_API_URL ||
  'https://deepdive-engine.up.railway.app/api/v1';

/**
 * PPT 幻灯片规划 API 代理
 * POST /api/ai-office/ppt/plan-slides
 *
 * 输入已确认的大纲，生成每页的详细设计规格：
 * - 布局类型 + 理由
 * - 背景决策（纯色/渐变/AI生成）
 * - 图像规格（prompt、位置、风格）
 * - 图表规格
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    console.log(
      '[PPT Plan Slides] Request:',
      JSON.stringify(body).slice(0, 200)
    );

    const backendUrl = `${BACKEND_API_URL}/ai-office/ppt/plan-slides`;

    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        '[PPT Plan Slides] Backend error:',
        response.status,
        errorText
      );
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
      '[PPT Plan Slides] Success, specs count:',
      data.slideSpecs?.length || 0
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error('[PPT Plan Slides] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to plan slides',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
