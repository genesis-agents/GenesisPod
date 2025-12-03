import { NextRequest, NextResponse } from 'next/server';

// 后端 API URL
const BACKEND_API_URL =
  process.env.BACKEND_API_URL ||
  'https://deepdive-engine.up.railway.app/api/v1';

/**
 * 获取 PPT 文档
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    const response = await fetch(`${BACKEND_API_URL}/ai-office/ppt/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Backend error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[PPT GET] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch PPT document' },
      { status: 500 }
    );
  }
}

/**
 * 删除 PPT 文档
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    const response = await fetch(`${BACKEND_API_URL}/ai-office/ppt/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Backend error: ${response.status}` },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[PPT DELETE] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete PPT document' },
      { status: 500 }
    );
  }
}
