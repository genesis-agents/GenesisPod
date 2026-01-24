'use client';

import { useState, useEffect, useCallback } from 'react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { logger } from '@/lib/utils/logger';

interface Feedback {
  id: string;
  type: 'BUG' | 'FEATURE' | 'IMPROVEMENT' | 'OTHER';
  status: 'PENDING' | 'REVIEWED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  user_email: string | null;
  user_agent: string | null;
  page_url: string | null;
  user_id: string | null;
  admin_notes: string | null;
  assigned_to: string | null;
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
  byPriority?: Record<string, number>;
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

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-600 text-white',
  HIGH: 'bg-orange-100 text-orange-800',
  NORMAL: 'bg-gray-100 text-gray-700',
  LOW: 'bg-slate-100 text-slate-600',
};

const PRIORITY_LABELS: Record<string, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  NORMAL: 'Normal',
  LOW: 'Low',
};

const PRIORITY_ICONS: Record<string, string> = {
  CRITICAL: 'text-red-600',
  HIGH: 'text-orange-500',
  NORMAL: 'text-gray-400',
  LOW: 'text-slate-400',
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
  const [filterPriority, setFilterPriority] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [newPriority, setNewPriority] = useState('');
  const [updating, setUpdating] = useState(false);

  const fetchFeedbacks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.append('status', filterStatus);
      if (filterType) params.append('type', filterType);
      if (filterPriority) params.append('priority', filterPriority);

      const response = await fetch(
        `${config.apiUrl}/feedback?${params.toString()}`,
        { headers: getAuthHeader() }
      );
      if (response.ok) {
        const result = await response.json();
        const data = result?.data ?? result;
        let feedbackList = data.feedbacks || [];

        // Client-side search filtering
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          feedbackList = feedbackList.filter(
            (f: Feedback) =>
              f.title.toLowerCase().includes(query) ||
              f.description.toLowerCase().includes(query) ||
              f.user_email?.toLowerCase().includes(query) ||
              f.id.toLowerCase().includes(query)
          );
        }

        setFeedbacks(feedbackList);
      }
    } catch (error) {
      logger.error('Failed to fetch feedbacks:', error);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterType, filterPriority, searchQuery]);

  const fetchStats = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/feedback/stats`, {
        headers: getAuthHeader(),
      });
      if (response.ok) {
        const result = await response.json();
        const data = result?.data ?? result;
        setStats(data);
      }
    } catch (error) {
      logger.error('Failed to fetch stats:', error);
    }
  };

  useEffect(() => {
    void fetchFeedbacks();
    void fetchStats();
  }, [fetchFeedbacks]);

  const handleUpdateFeedback = async () => {
    if (!selectedFeedback) return;

    setUpdating(true);
    try {
      // Update status if changed
      if (newStatus !== selectedFeedback.status) {
        await fetch(`${config.apiUrl}/feedback/${selectedFeedback.id}/status`, {
          method: 'PATCH',
          headers: {
            ...getAuthHeader(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: newStatus,
            adminNotes: adminNotes || undefined,
          }),
        });
      }

      // Update priority if changed
      if (newPriority !== selectedFeedback.priority) {
        await fetch(
          `${config.apiUrl}/feedback/${selectedFeedback.id}/priority`,
          {
            method: 'PATCH',
            headers: {
              ...getAuthHeader(),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ priority: newPriority }),
          }
        );
      }

      await fetchFeedbacks();
      await fetchStats();
      setSelectedFeedback(null);
      setAdminNotes('');
      setNewStatus('');
      setNewPriority('');
    } catch (error) {
      logger.error('Failed to update feedback:', error);
    } finally {
      setUpdating(false);
    }
  };

  const openDetail = (feedback: Feedback) => {
    setSelectedFeedback(feedback);
    setNewStatus(feedback.status);
    setNewPriority(feedback.priority || 'NORMAL');
    setAdminNotes(feedback.admin_notes || '');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void fetchFeedbacks();
  };

  // Get critical/high priority count for badge
  const urgentCount = feedbacks.filter(
    (f) => f.priority === 'CRITICAL' || f.priority === 'HIGH'
  ).length;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Feedback Management
              </h1>
              <p className="text-gray-600">Review and manage user feedback</p>
            </div>
            {urgentCount > 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-red-100 px-4 py-2 text-red-800">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <span className="font-medium">{urgentCount} urgent</span>
              </div>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-6">
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
            <div className="rounded-lg bg-white p-4 shadow">
              <div className="text-2xl font-bold text-amber-600">
                {stats.byType?.FEATURE || 0}
              </div>
              <div className="text-sm text-gray-500">Features</div>
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div className="mb-4 flex flex-wrap gap-4">
          <form onSubmit={handleSearch} className="flex-1">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title, description, email, or ID..."
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm"
              />
              <svg
                className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </form>
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
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm"
          >
            <option value="">All Priority</option>
            {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
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
                        {/* Priority indicator */}
                        <span
                          className={`flex h-6 w-6 items-center justify-center ${PRIORITY_ICONS[feedback.priority || 'NORMAL']}`}
                        >
                          {feedback.priority === 'CRITICAL' && (
                            <svg
                              className="h-4 w-4"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                          {feedback.priority === 'HIGH' && (
                            <svg
                              className="h-4 w-4"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M5.293 7.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L6.707 7.707a1 1 0 01-1.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[feedback.type]}`}
                        >
                          {TYPE_LABELS[feedback.type]}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[feedback.status]}`}
                        >
                          {STATUS_LABELS[feedback.status]}
                        </span>
                        {feedback.priority &&
                          feedback.priority !== 'NORMAL' && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_COLORS[feedback.priority]}`}
                            >
                              {PRIORITY_LABELS[feedback.priority]}
                            </span>
                          )}
                        {feedback.attachments?.length > 0 && (
                          <span className="text-xs text-gray-500">
                            {feedback.attachments.length} file(s)
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
                {/* Type, Status & Priority badges */}
                <div className="mb-4 flex flex-wrap items-center gap-2">
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
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-medium ${PRIORITY_COLORS[selectedFeedback.priority || 'NORMAL']}`}
                  >
                    {PRIORITY_LABELS[selectedFeedback.priority || 'NORMAL']}
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

                {/* Admin Notes (existing) */}
                {selectedFeedback.admin_notes && (
                  <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <h4 className="mb-2 font-medium text-blue-800">
                      Previous Admin Notes
                    </h4>
                    <p className="whitespace-pre-wrap text-blue-700">
                      {selectedFeedback.admin_notes}
                    </p>
                  </div>
                )}

                {/* Update Section */}
                <div className="border-t pt-4">
                  <h4 className="mb-3 font-medium text-gray-700">
                    Update Feedback
                  </h4>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Status
                      </label>
                      <select
                        value={newStatus}
                        onChange={(e) => setNewStatus(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-4 py-2"
                      >
                        {Object.entries(STATUS_LABELS).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Priority
                      </label>
                      <select
                        value={newPriority}
                        onChange={(e) => setNewPriority(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-4 py-2"
                      >
                        {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Admin Notes
                    </label>
                    <textarea
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder="Add notes about this feedback..."
                      className="h-24 w-full resize-none rounded-lg border border-gray-300 px-4 py-2"
                    />
                  </div>

                  <button
                    onClick={() => void handleUpdateFeedback()}
                    disabled={updating}
                    className="mt-4 w-full rounded-lg bg-blue-600 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {updating ? 'Updating...' : 'Save Changes'}
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
