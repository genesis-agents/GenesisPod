'use client';

import { useEffect, useState } from 'react';
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  Activity,
  AlertCircle as AlertCircleIcon,
  TrendingUp,
} from 'lucide-react';
import {
  getQualityIssues,
  getQualityStats,
  QualityIssue,
  QualityStats,
} from '@/lib/api/data-collection';

export default function QualityPage() {
  const [issues, setIssues] = useState<QualityIssue[]>([]);
  const [stats, setStats] = useState<QualityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [issuesResponse, statsResponse] = await Promise.all([
          getQualityIssues({ limit: 50 }),
          getQualityStats(),
        ]);
        setIssues(issuesResponse.data);
        setStats(statsResponse.data);
      } catch (err) {
        console.error('Failed to fetch quality data:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to load quality data'
        );
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center p-8">
        <div className="text-center">
          <Activity className="mx-auto h-8 w-8 animate-spin text-blue-600" />
          <p className="mt-2 text-sm text-gray-500">Loading quality data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-96 items-center justify-center p-8">
        <div className="text-center">
          <AlertCircleIcon className="mx-auto h-8 w-8 text-red-600" />
          <p className="mt-2 text-sm text-gray-900">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-8">
      <h2 className="text-lg font-semibold text-gray-900">Data Quality</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-2xl font-bold">
              {stats?.bySeverity?.HIGH || 0}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">High Priority Issues</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-2xl font-bold">
              {stats?.bySeverity?.MEDIUM || 0}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">Medium Priority</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-gray-600">
            <Shield className="h-5 w-5" />
            <span className="text-2xl font-bold">
              {stats?.totalIssues || 0}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">Total Issues</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-emerald-600">
            <CheckCircle className="h-5 w-5" />
            <span className="text-2xl font-bold">
              {stats?.avgQualityScore?.toFixed(1) || 0}%
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">Avg Quality Score</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h3 className="font-semibold text-gray-900">Quality Issues</h3>
          <p className="text-sm text-gray-500">
            {issues.length} issue{issues.length !== 1 ? 's' : ''} found
          </p>
        </div>

        {issues.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-emerald-500" />
            <h3 className="mt-4 text-sm font-medium text-gray-900">
              No quality issues
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              All resources meet quality standards
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {issues.map((issue) => (
              <div key={issue.id} className="px-6 py-4 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">
                      {issue.resource?.title || 'Unknown Resource'}
                    </h4>
                    <p className="mt-1 text-sm text-gray-500">
                      {issue.message}
                    </p>
                    <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                      <span>Type: {issue.type}</span>
                      <span>•</span>
                      <span>
                        Detected {formatRelativeTime(issue.detectedAt)}
                      </span>
                      <span>•</span>
                      <span
                        className={`font-medium ${
                          issue.reviewStatus === 'RESOLVED'
                            ? 'text-emerald-600'
                            : issue.reviewStatus === 'REVIEWING'
                              ? 'text-blue-600'
                              : 'text-gray-600'
                        }`}
                      >
                        {issue.reviewStatus}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`ml-4 rounded-full px-2.5 py-1 text-xs font-medium ${
                      issue.severity === 'CRITICAL'
                        ? 'bg-purple-100 text-purple-700'
                        : issue.severity === 'HIGH'
                          ? 'bg-red-100 text-red-700'
                          : issue.severity === 'MEDIUM'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {issue.severity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
