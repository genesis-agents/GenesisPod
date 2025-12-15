import { NextRequest, NextResponse } from 'next/server';

const GITHUB_ISSUES_URL =
  'https://github.com/JUNJIE-DUAN/deepdive-engine/issues';

// Get backend URL - same logic as config.ts
const getBackendUrl = () => {
  // 1. Use environment variable if set
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  // 2. Railway production uses hardcoded URL
  if (process.env.RAILWAY_ENVIRONMENT === 'production') {
    return 'https://deepdive-engine-backend.up.railway.app';
  }
  // 3. Development default
  return 'http://localhost:4000';
};

interface FeedbackRequest {
  type: 'bug' | 'feature' | 'improvement' | 'other';
  title: string;
  description: string;
  email?: string;
  userAgent?: string;
  url?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: FeedbackRequest = await request.json();

    // Validate required fields
    if (!body.title || !body.description || !body.type) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const backendUrl = getBackendUrl();

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
        console.error('Backend feedback error:', errorData);
      }
    } catch (backendError) {
      console.error('Backend feedback service error:', backendError);
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
    console.error('Feedback submission error:', error);
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
