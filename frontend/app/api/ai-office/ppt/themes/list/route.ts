import { NextResponse } from 'next/server';

// 后端 API URL
const BACKEND_API_URL =
  process.env.BACKEND_API_URL ||
  'https://deepdive-engine.up.railway.app/api/v1';

/**
 * 获取可用主题列表
 */
export async function GET() {
  try {
    const response = await fetch(
      `${BACKEND_API_URL}/ai-office/ppt/themes/list`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: `Backend error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[PPT Themes] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch themes' },
      { status: 500 }
    );
  }
}
