'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { config } from '@/lib/utils/config';
import {
  getAuthHeader,
  isAuthenticated,
  loginWithGoogle,
} from '@/lib/utils/auth';
import Link from 'next/link';

import { logger } from '@/lib/utils/logger';
interface Feedback {
  id: string;
  type: 'BUG' | 'FEATURE' | 'IMPROVEMENT' | 'OTHER';
  status: 'PENDING' | 'REVIEWED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  title: string;
  description: string;
  admin_notes: string | null;
  attachments: Array<{
    filename: string;
    url: string;
  }>;
  created_at: string;
  updated_at: string;
}

const TYPE_COLORS: Record<string, string> = {
  BUG: 'bg-red-100 text-red-800',
  FEATURE: 'bg-amber-100 text-amber-800',
  IMPROVEMENT: 'bg-blue-100 text-blue-800',
  OTHER: 'bg-gray-100 text-gray-800',
};

const TYPE_LABELS: Record<string, string> = {
  BUG: 'Bug',
  FEATURE: 'Feature',
  IMPROVEMENT: 'Improvement',
  OTHER: 'Other',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  REVIEWED: 'bg-blue-100 text-blue-800 border-blue-200',
  IN_PROGRESS: 'bg-purple-100 text-purple-800 border-purple-200',
  RESOLVED: 'bg-green-100 text-green-800 border-green-200',
  CLOSED: 'bg-gray-100 text-gray-800 border-gray-200',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  REVIEWED: 'Reviewed',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

const STATUS_DESCRIPTIONS: Record<string, string> = {
  PENDING: 'Your feedback has been received and is waiting for review.',
  REVIEWED: 'Your feedback has been reviewed by our team.',
  IN_PROGRESS: 'We are actively working on addressing your feedback.',
  RESOLVED: 'Your feedback has been addressed!',
  CLOSED: 'This feedback has been closed.',
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function FeedbackHistoryPage() {
  const router = useRouter();
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(
    null
  );

  const fetchFeedbacks = useCallback(async () => {
    if (!isAuthenticated()) {
      loginWithGoogle();
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${config.apiUrl}/feedback/my`, {
        headers: getAuthHeader(),
      });
      if (response.ok) {
        const result = await response.json();
        // Handle wrapped response { success: true, data: {...} }
        const data = result?.data ?? result;
        setFeedbacks(data?.feedbacks || []);
      }
    } catch (error) {
      logger.error('Failed to fetch feedbacks:', error);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchFeedbacks();
  }, [fetchFeedbacks]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          <p className="text-gray-600">Loading your feedback...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Feedback</h1>
            <p className="text-gray-600">
              Track the status of your submitted feedback
            </p>
          </div>
          <Link
            href="/feedback"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Submit New Feedback
          </Link>
        </div>

        {/* Feedback List */}
        {feedbacks.length === 0 ? (
          <div className="rounded-lg bg-white p-12 text-center shadow">
            <svg
              className="mx-auto mb-4 h-12 w-12 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
            <h3 className="mb-2 text-lg font-medium text-gray-900">
              No feedback yet
            </h3>
            <p className="mb-4 text-gray-600">
              You haven&apos;t submitted any feedback yet. We&apos;d love to
              hear from you!
            </p>
            <Link
              href="/feedback"
              className="inline-block rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700"
            >
              Submit Feedback
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {feedbacks.map((feedback) => (
              <div
                key={feedback.id}
                className="cursor-pointer rounded-lg bg-white p-6 shadow transition-shadow hover:shadow-md"
                onClick={() => setSelectedFeedback(feedback)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${TYPE_COLORS[feedback.type]}`}
                      >
                        {TYPE_LABELS[feedback.type]}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-1 text-xs font-medium ${STATUS_COLORS[feedback.status]}`}
                      >
                        {STATUS_LABELS[feedback.status]}
                      </span>
                    </div>
                    <h3 className="mb-1 font-medium text-gray-900">
                      {feedback.title}
                    </h3>
                    <p className="line-clamp-2 text-sm text-gray-600">
                      {feedback.description}
                    </p>
                    <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                      <span>Submitted: {formatDate(feedback.created_at)}</span>
                      {feedback.updated_at !== feedback.created_at && (
                        <span>Updated: {formatDate(feedback.updated_at)}</span>
                      )}
                    </div>
                  </div>
                  <svg
                    className="h-5 w-5 flex-shrink-0 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Detail Modal */}
        {selectedFeedback && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl">
              <div className="sticky top-0 flex items-center justify-between border-b bg-white p-4">
                <h2 className="text-lg font-semibold">Feedback Details</h2>
                <button
                  onClick={() => setSelectedFeedback(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <div className="p-6">
                {/* Status Banner */}
                <div
                  className={`mb-6 rounded-lg border p-4 ${STATUS_COLORS[selectedFeedback.status]}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold">
                      {STATUS_LABELS[selectedFeedback.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm opacity-80">
                    {STATUS_DESCRIPTIONS[selectedFeedback.status]}
                  </p>
                </div>

                {/* Type & Title */}
                <div className="mb-4">
                  <span
                    className={`mb-2 inline-block rounded-full px-3 py-1 text-sm font-medium ${TYPE_COLORS[selectedFeedback.type]}`}
                  >
                    {TYPE_LABELS[selectedFeedback.type]}
                  </span>
                  <h3 className="text-xl font-semibold text-gray-900">
                    {selectedFeedback.title}
                  </h3>
                </div>

                {/* Meta */}
                <div className="mb-4 text-sm text-gray-500">
                  <div>
                    ID: <span className="font-mono">{selectedFeedback.id}</span>
                  </div>
                  <div>
                    Submitted: {formatDate(selectedFeedback.created_at)}
                  </div>
                  {selectedFeedback.updated_at !==
                    selectedFeedback.created_at && (
                    <div>
                      Last updated: {formatDate(selectedFeedback.updated_at)}
                    </div>
                  )}
                </div>

                {/* Description */}
                <div className="mb-6 rounded-lg bg-gray-50 p-4">
                  <h4 className="mb-2 font-medium text-gray-700">
                    Your Feedback
                  </h4>
                  <p className="whitespace-pre-wrap text-gray-600">
                    {selectedFeedback.description}
                  </p>
                </div>

                {/* Admin Response */}
                {selectedFeedback.admin_notes && (
                  <div className="mb-6 rounded-lg border-l-4 border-blue-500 bg-blue-50 p-4">
                    <h4 className="mb-2 font-medium text-blue-900">
                      Response from Team
                    </h4>
                    <p className="whitespace-pre-wrap text-blue-800">
                      {selectedFeedback.admin_notes}
                    </p>
                  </div>
                )}

                {/* Attachments */}
                {selectedFeedback.attachments?.length > 0 && (
                  <div>
                    <h4 className="mb-2 font-medium text-gray-700">
                      Attachments ({selectedFeedback.attachments.length})
                    </h4>
                    <div className="space-y-2">
                      {selectedFeedback.attachments.map((att, idx) => (
                        <a
                          key={idx}
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-lg border p-2 text-sm hover:bg-gray-50"
                        >
                          <svg
                            className="h-5 w-5 text-gray-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                            />
                          </svg>
                          <span className="flex-1 truncate">
                            {att.filename}
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
