import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { logger } from '@/lib/utils/logger';
const BACKEND_API_URL =
  process.env.BACKEND_API_URL ||
  'https://deepdive-engine.up.railway.app/api/v1';

/**
 * POST /api/agents/tasks/[taskId]/cancel
 * Cancel a running task
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const cookieStore = await cookies();
    const token = cookieStore.get('auth-token')?.value;

    logger.debug('[Agents Cancel] Canceling task:', taskId);

    const response = await fetch(
      `${BACKEND_API_URL}/agents/tasks/${taskId}/cancel`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        '[Agents Cancel] Backend error:',
        response.status,
        errorText
      );
      return NextResponse.json(
        { error: 'Failed to cancel task', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    logger.error('[Agents Cancel] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
