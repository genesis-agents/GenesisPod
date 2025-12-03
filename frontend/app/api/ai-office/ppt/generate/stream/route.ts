import { NextRequest } from 'next/server';

// 后端 API URL
const BACKEND_API_URL =
  process.env.BACKEND_API_URL ||
  'https://deepdive-engine.up.railway.app/api/v1';

/**
 * PPT 3.0 流式生成 API 代理
 * 转发 SSE 请求到后端
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  // 构建后端 URL
  const backendUrl = new URL(
    `${BACKEND_API_URL}/ai-office/ppt/generate/stream`
  );

  // 转发所有查询参数
  searchParams.forEach((value, key) => {
    backendUrl.searchParams.set(key, value);
  });

  console.log('[PPT 3.0 Stream] Proxying to:', backendUrl.toString());

  try {
    const response = await fetch(backendUrl.toString(), {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) {
      console.error(
        '[PPT 3.0 Stream] Backend error:',
        response.status,
        response.statusText
      );
      return new Response(
        JSON.stringify({
          error: `Backend error: ${response.status}`,
        }),
        {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 转发 SSE 流
    if (response.body) {
      return new Response(response.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    return new Response(JSON.stringify({ error: 'No response body' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[PPT 3.0 Stream] Error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to connect to backend service',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
