import { NextRequest, NextResponse } from 'next/server';

// 后端 API URL
const BACKEND_API_URL =
  process.env.BACKEND_API_URL ||
  'https://deepdive-engine.up.railway.app/api/v1';

/**
 * 导出 Slides
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    const body = await request.json();

    const response = await fetch(
      `${BACKEND_API_URL}/ai-office/slides/${id}/export`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: `Backend error: ${response.status}` },
        { status: response.status }
      );
    }

    // 返回文件流
    const blob = await response.blob();
    return new NextResponse(blob, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="presentation.pptx"`,
      },
    });
  } catch (error) {
    console.error('[Slides Export] Error:', error);
    return NextResponse.json(
      { error: 'Failed to export Slides' },
      { status: 500 }
    );
  }
}
