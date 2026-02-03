import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/utils/logger';
import { config } from '@/lib/utils/config';

const GITHUB_ISSUES_URL =
  'https://github.com/JUNJIE-DUAN/deepdive-engine/issues';

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    const backendUrl = config.getBackendUrl();

    // Handle multipart form data (with file uploads)
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();

      const type = formData.get('type') as string;
      const title = formData.get('title') as string;
      const description = formData.get('description') as string;

      // Validate required fields
      if (!title || !description || !type) {
        return NextResponse.json(
          { success: false, error: 'Missing required fields' },
          { status: 400 }
        );
      }

      // Forward the FormData to backend (with files)
      try {
        const response = await fetch(`${backendUrl}/api/v1/feedback`, {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          const data = await response.json();
          return NextResponse.json({
            success: true,
            message: 'Feedback submitted successfully',
            feedbackId: data.feedbackId,
            attachmentsCount: data.attachmentsCount || 0,
          });
        } else {
          const errorData = await response.json().catch(() => ({}));
          logger.error('Backend feedback error:', errorData);
        }
      } catch (backendError) {
        logger.error('Backend feedback service error:', backendError);
      }
    } else {
      // Handle JSON (no file uploads)
      const body = await request.json();

      // Validate required fields
      if (!body.title || !body.description || !body.type) {
        return NextResponse.json(
          { success: false, error: 'Missing required fields' },
          { status: 400 }
        );
      }

      // Send to backend feedback API
      try {
        const response = await fetch(`${backendUrl}/api/v1/feedback`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: body.type,
            title: body.title,
            description: body.description,
            userEmail: body.email,
            userAgent: body.userAgent,
            url: body.url,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          return NextResponse.json({
            success: true,
            message: 'Feedback submitted successfully',
            feedbackId: data.feedbackId,
          });
        } else {
          const errorData = await response.json().catch(() => ({}));
          logger.error('Backend feedback error:', errorData);
        }
      } catch (backendError) {
        logger.error('Backend feedback service error:', backendError);
      }
    }

    // Fallback: Return error and suggest GitHub Issues
    return NextResponse.json(
      {
        success: false,
        error:
          'Failed to submit feedback. Please try again or open a GitHub issue.',
        githubIssuesUrl: GITHUB_ISSUES_URL,
      },
      { status: 500 }
    );
  } catch (error) {
    logger.error('Feedback submission error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to submit feedback',
        githubIssuesUrl: GITHUB_ISSUES_URL,
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    githubIssuesUrl: GITHUB_ISSUES_URL,
    types: ['bug', 'feature', 'improvement', 'other'],
  });
}
