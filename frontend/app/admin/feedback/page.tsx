'use client';

import { useState, useEffect, useCallback } from 'react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';

interface Feedback {
  id: string;
  type: 'BUG' | 'FEATURE' | 'IMPROVEMENT' | 'OTHER';
  status: 'PENDING' | 'REVIEWED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  title: string;
  description: string;
  user_email: string | null;
  user_agent: string | null;
  page_url: string | null;
  user_id: string | null;
  admin_notes: string | null;
  attachments: Array<{
    filename: string;
    url: string;
    mimeType: string;
    size: number;
  }>;
  created_at: string;
  updated_at: string;
}

interface FeedbackStats {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
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
  PENDING: 'bg-yellow-100 text-yellow-800',
  REVIEWED: 'bg-blue-100 text-blue-800',
  IN_PROGRESS: 'bg-purple-100 text-purple-800',
  RESOLVED: 'bg-green-100 text-green-800',
  CLOSED: 'bg-gray-100 text-gray-800',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  REVIEWED: 'Reviewed',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function FeedbackPage() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(
    null
  );
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [adminNotes, setAdminNotes] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [updating, setUpdating] = useState(false);

  const fetchFeedbacks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.append('status', filterStatus);
      if (filterType) params.append('type', filterType);

      const response = await fetch(
        `${config.apiUrl}/feedback?${params.toString()}`,
        { headers: getAuthHeader() }
      );
      if (response.ok) {
        const data = await response.json();
        setFeedbacks(data.feedbacks || []);
      }
    } catch (error) {
      console.error('Failed to fetch feedbacks:', error);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterType]);

  const fetchStats = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/feedback/stats`, {
        headers: getAuthHeader(),
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  useEffect(() => {
    void fetchFeedbacks();
    void fetchStats();
  }, [fetchFeedbacks]);

  const handleUpdateStatus = async () => {
    if (!selectedFeedback || !newStatus) return;

    setUpdating(true);
    try {
      const response = await fetch(
        `${config.apiUrl}/feedback/${selectedFeedback.id}/status`,
        {
          method: 'PATCH',
          headers: {
            ...getAuthHeader(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: newStatus,
            adminNotes: adminNotes || undefined,
          }),
        }
      );

      if (response.ok) {
        await fetchFeedbacks();
        await fetchStats();
        setSelectedFeedback(null);
        setAdminNotes('');
        setNewStatus('');
      }
    } catch (error) {
      console.error('Failed to update status:', error);
    } finally {
      setUpdating(false);
    }
  };

  const openDetail = (feedback: Feedback) => {
    setSelectedFeedback(feedback);
    setNewStatus(feedback.status);
    setAdminNotes(feedback.admin_notes || '');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Feedback Management
          </h1>
          <p className="text-gray-600">Review and manage user feedback</p>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
            <div className="rounded-lg bg-white p-4 shadow">
              <div className="text-2xl font-bold text-gray-900">
                {stats.total}
              </div>
              <div className="text-sm text-gray-500">Total</div>
            </div>
            <div className="rounded-lg bg-white p-4 shadow">
              <div className="text-2xl font-bold text-yellow-600">
                {stats.byStatus?.PENDING || 0}
              </div>
              <div className="text-sm text-gray-500">Pending</div>
            </div>
            <div className="rounded-lg bg-white p-4 shadow">
              <div className="text-2xl font-bold text-purple-600">
                {stats.byStatus?.IN_PROGRESS || 0}
              </div>
              <div className="text-sm text-gray-500">In Progress</div>
            </div>
            <div className="rounded-lg bg-white p-4 shadow">
              <div className="text-2xl font-bold text-green-600">
                {stats.byStatus?.RESOLVED || 0}
              </div>
              <div className="text-sm text-gray-500">Resolved</div>
            </div>
            <div className="rounded-lg bg-white p-4 shadow">
              <div className="text-2xl font-bold text-red-600">
                {stats.byType?.BUG || 0}
              </div>
              <div className="text-sm text-gray-500">Bugs</div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mb-4 flex gap-4">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm"
          >
            <option value="">All Status</option>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm"
          >
            <option value="">All Types</option>
            {Object.entries(TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Feedback List */}
        <div className="rounded-lg bg-white shadow">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : feedbacks.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No feedback found
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {feedbacks.map((feedback) => (
                <div
                  key={feedback.id}
                  className="cursor-pointer p-4 transition-colors hover:bg-gray-50"
                  onClick={() => openDetail(feedback)}
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
                          className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_COLORS[feedback.status]}`}
                        >
                          {STATUS_LABELS[feedback.status]}
                        </span>
                        {feedback.attachments?.length > 0 && (
                          <span className="text-xs text-gray-500">
                            {feedback.attachments.length} attachment(s)
                          </span>
                        )}
                      </div>
                      <h3 className="font-medium text-gray-900">
                        {feedback.title}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-sm text-gray-600">
                        {feedback.description}
                      </p>
                      <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                        <span>{formatRelativeTime(feedback.created_at)}</span>
                        {feedback.user_email && (
                          <span>{feedback.user_email}</span>
                        )}
                        <span className="font-mono">
                          {feedback.id.slice(0, 8)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

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

              <div className="p-4">
                {/* Type & Status */}
                <div className="mb-4 flex items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-medium ${TYPE_COLORS[selectedFeedback.type]}`}
                  >
                    {TYPE_LABELS[selectedFeedback.type]}
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLORS[selectedFeedback.status]}`}
                  >
                    {STATUS_LABELS[selectedFeedback.status]}
                  </span>
                </div>

                {/* Title */}
                <h3 className="mb-2 text-xl font-semibold text-gray-900">
                  {selectedFeedback.title}
                </h3>

                {/* Meta */}
                <div className="mb-4 text-sm text-gray-500">
                  <div>
                    ID: <span className="font-mono">{selectedFeedback.id}</span>
                  </div>
                  <div>
                    Submitted:{' '}
                    {new Date(selectedFeedback.created_at).toLocaleString()}
                  </div>
                  {selectedFeedback.user_email && (
                    <div>
                      Email:{' '}
                      <a
                        href={`mailto:${selectedFeedback.user_email}`}
                        className="text-blue-600 hover:underline"
                      >
                        {selectedFeedback.user_email}
                      </a>
                    </div>
                  )}
                  {selectedFeedback.page_url && (
                    <div className="truncate">
                      URL:{' '}
                      <a
                        href={selectedFeedback.page_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {selectedFeedback.page_url}
                      </a>
                    </div>
                  )}
                </div>

                {/* Description */}
                <div className="mb-4 rounded-lg bg-gray-50 p-4">
                  <h4 className="mb-2 font-medium text-gray-700">
                    Description
                  </h4>
                  <p className="whitespace-pre-wrap text-gray-600">
                    {selectedFeedback.description}
                  </p>
                </div>

                {/* Attachments */}
                {selectedFeedback.attachments?.length > 0 && (
                  <div className="mb-4">
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
                          <span className="text-gray-400">
                            {(att.size / 1024).toFixed(1)} KB
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Update Status */}
                <div className="border-t pt-4">
                  <h4 className="mb-2 font-medium text-gray-700">
                    Update Status
                  </h4>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="mb-3 w-full rounded-lg border border-gray-300 px-4 py-2"
                  >
                    {Object.entries(STATUS_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>

                  <h4 className="mb-2 font-medium text-gray-700">
                    Admin Notes
                  </h4>
                  <textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Add notes about this feedback..."
                    className="mb-3 h-24 w-full resize-none rounded-lg border border-gray-300 px-4 py-2"
                  />

                  <button
                    onClick={() => void handleUpdateStatus()}
                    disabled={updating}
                    className="w-full rounded-lg bg-blue-600 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {updating ? 'Updating...' : 'Update Feedback'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
