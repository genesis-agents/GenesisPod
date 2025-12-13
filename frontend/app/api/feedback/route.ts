import { NextRequest, NextResponse } from 'next/server';

const FEEDBACK_EMAIL = 'hello.junjie.duan@gmail.com';
const GITHUB_ISSUES_URL =
  'https://github.com/JUNJIE-DUAN/deepdive-engine/issues';

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

    // Get backend URL
    const backendUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

    // Try to send via backend email service first
    try {
      const emailResponse = await fetch(`${backendUrl}/api/v1/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: FEEDBACK_EMAIL,
          subject: `[DeepDive Feedback] ${getTypeLabel(body.type)}: ${body.title}`,
          type: body.type,
          title: body.title,
          description: body.description,
          userEmail: body.email,
          userAgent: body.userAgent,
          url: body.url,
          timestamp: new Date().toISOString(),
        }),
      });

      if (emailResponse.ok) {
        return NextResponse.json({
          success: true,
          message: 'Feedback submitted successfully',
          method: 'email',
        });
      }
    } catch (emailError) {
      console.warn(
        'Email service unavailable, falling back to log:',
        emailError
      );
    }

    // Fallback: Log feedback (in production, this could write to a database)
    console.log('='.repeat(60));
    console.log('NEW FEEDBACK RECEIVED');
    console.log('='.repeat(60));
    console.log(`Type: ${body.type}`);
    console.log(`Title: ${body.title}`);
    console.log(`Description: ${body.description}`);
    console.log(`User Email: ${body.email || 'Not provided'}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`Target Email: ${FEEDBACK_EMAIL}`);
    console.log('='.repeat(60));

    // Return success with info about GitHub issues as alternative
    return NextResponse.json({
      success: true,
      message:
        'Feedback recorded. For faster response, consider opening a GitHub issue.',
      githubIssuesUrl: GITHUB_ISSUES_URL,
      method: 'log',
      feedbackId: `FB-${Date.now()}`,
    });
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

function getTypeLabel(type: string): string {
  switch (type) {
    case 'bug':
      return 'Bug Report';
    case 'feature':
      return 'Feature Request';
    case 'improvement':
      return 'Improvement';
    default:
      return 'Feedback';
  }
}

export async function GET() {
  return NextResponse.json({
    feedbackEmail: FEEDBACK_EMAIL,
    githubIssuesUrl: GITHUB_ISSUES_URL,
    types: ['bug', 'feature', 'improvement', 'other'],
  });
}
