'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  HardDrive,
  Trash2,
  RefreshCw,
  Image,
  FileText,
  Database,
  AlertTriangle,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import { getAuthTokens } from '@/lib/auth';

interface StorageStats {
  images?: {
    total: number;
    bookmarked: number;
    unbookmarked: number;
    totalSizeEstimate?: string;
  };
  rawData?: {
    total: number;
    byType?: Record<string, number>;
  };
  resources?: {
    total: number;
  };
}

interface CleanupResult {
  success: boolean;
  message: string;
  deletedCount?: number;
  totalDeleted?: number;
  usersCleaned?: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

function getAuthHeaders(): HeadersInit {
  const tokens = getAuthTokens();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (tokens?.accessToken) {
    (headers as Record<string, string>)['Authorization'] =
      `Bearer ${tokens.accessToken}`;
  }
  return headers;
}

export default function StoragePage() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // 加载存储统计
  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      // 获取图片统计
      const imageRes = await fetch(
        `${API_BASE}/api/v1/ai-image/stats?key=deepdive-admin-cleanup-2024`
      );
      const imageStats = await imageRes.json();

      setStats({
        images: imageStats.success ? imageStats : undefined,
      });
    } catch (error) {
      console.error('Failed to load storage stats:', error);
      setMessage({ type: 'error', text: 'Failed to load storage statistics' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // 清理所有用户的旧图片
  const handleCleanupOldImages = async () => {
    if (
      !confirm(
        'This will delete old unbookmarked images for all users (keeping latest 20 per user). Continue?'
      )
    ) {
      return;
    }

    setCleaning('images');
    setMessage(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/ai-image/cleanup-all?key=deepdive-admin-cleanup-2024`,
        {
          method: 'POST',
        }
      );
      const result: CleanupResult = await res.json();
      if (result.success) {
        setMessage({
          type: 'success',
          text: `Successfully cleaned up ${result.totalDeleted || 0} images from ${result.usersCleaned || 0} users`,
        });
        loadStats();
      } else {
        setMessage({
          type: 'error',
          text: result.message || 'Cleanup failed',
        });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to cleanup images' });
    } finally {
      setCleaning(null);
    }
  };

  // 删除所有图片
  const handleDeleteAllImages = async () => {
    if (
      !confirm(
        'WARNING: This will permanently delete ALL images from ALL users. This action cannot be undone! Are you sure?'
      )
    ) {
      return;
    }

    if (
      !confirm(
        'Please confirm again: Delete ALL images permanently? Type "yes" in your mind and click OK to proceed.'
      )
    ) {
      return;
    }

    setCleaning('delete-all-images');
    setMessage(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/ai-image/delete-all?key=deepdive-admin-cleanup-2024`,
        {
          method: 'DELETE',
        }
      );
      const result: CleanupResult = await res.json();
      if (result.success) {
        setMessage({
          type: 'success',
          text: `Successfully deleted ${result.deletedCount || 0} images`,
        });
        loadStats();
      } else {
        setMessage({
          type: 'error',
          text: result.message || 'Delete failed',
        });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to delete images' });
    } finally {
      setCleaning(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100/50 p-8">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg">
              <HardDrive className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Storage Management
              </h1>
              <p className="text-sm text-gray-500">
                Manage Railway storage resources to control costs
              </p>
            </div>
          </div>
          <button
            onClick={loadStats}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-200 transition-all hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Alert Message */}
        {message && (
          <div
            className={`flex items-center gap-3 rounded-lg p-4 ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-700'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle className="h-5 w-5" />
            ) : (
              <AlertTriangle className="h-5 w-5" />
            )}
            <span>{message.text}</span>
            <button
              onClick={() => setMessage(null)}
              className="ml-auto text-current opacity-50 hover:opacity-100"
            >
              &times;
            </button>
          </div>
        )}

        {/* Storage Overview */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-3">
            {/* Images Storage */}
            <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
                  <Image className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">AI Images</h3>
                  <p className="text-xs text-gray-500">Generated images</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total Images</span>
                  <span className="font-medium text-gray-900">
                    {stats?.images?.total ?? 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Bookmarked</span>
                  <span className="font-medium text-green-600">
                    {stats?.images?.bookmarked ?? 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Unbookmarked</span>
                  <span className="font-medium text-orange-600">
                    {stats?.images?.unbookmarked ?? 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Raw Data Storage */}
            <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Raw Data</h3>
                  <p className="text-xs text-gray-500">Collected content</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total Records</span>
                  <span className="font-medium text-gray-900">
                    {stats?.rawData?.total ?? 'Coming soon'}
                  </span>
                </div>
              </div>
            </div>

            {/* Resources Storage */}
            <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
                  <Database className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Resources</h3>
                  <p className="text-xs text-gray-500">Indexed resources</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total Resources</span>
                  <span className="font-medium text-gray-900">
                    {stats?.resources?.total ?? 'Coming soon'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Cleanup Actions */}
        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Cleanup Actions
          </h2>
          <p className="mb-6 text-sm text-gray-500">
            Railway charges based on storage usage. Use these actions to free up
            space and reduce costs.
          </p>

          <div className="space-y-4">
            {/* Clean Old Images */}
            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100">
                  <Trash2 className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">
                    Cleanup Old Images
                  </h3>
                  <p className="text-sm text-gray-500">
                    Delete old unbookmarked images, keeping latest 20 per user
                  </p>
                </div>
              </div>
              <button
                onClick={handleCleanupOldImages}
                disabled={cleaning !== null}
                className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-orange-700 disabled:opacity-50"
              >
                {cleaning === 'images' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Cleanup
              </button>
            </div>

            {/* Delete All Images */}
            <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50/50 p-4">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <h3 className="font-medium text-red-900">
                    Delete All Images
                  </h3>
                  <p className="text-sm text-red-600">
                    Permanently delete ALL images from ALL users - cannot be
                    undone!
                  </p>
                </div>
              </div>
              <button
                onClick={handleDeleteAllImages}
                disabled={cleaning !== null}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-red-700 disabled:opacity-50"
              >
                {cleaning === 'delete-all-images' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Delete All
              </button>
            </div>
          </div>
        </div>

        {/* Info Card */}
        <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-6">
          <h3 className="flex items-center gap-2 font-medium text-blue-900">
            <HardDrive className="h-5 w-5" />
            About Railway Storage
          </h3>
          <p className="mt-2 text-sm text-blue-700">
            Railway charges based on storage usage. Generated images and
            collected data can accumulate quickly. Regular cleanup helps control
            costs. Bookmarked images are preserved during cleanup operations.
          </p>
        </div>
      </div>
    </div>
  );
}
