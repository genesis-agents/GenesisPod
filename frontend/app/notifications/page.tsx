'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import { useSettingsStore, type Notification } from '@/stores';
import ClientDate from '@/components/common/ClientDate';
import {
  Bell,
  BellOff,
  Trash2,
  Check,
  CheckCheck,
  Sparkles,
  Info,
  Zap,
  RefreshCw,
} from 'lucide-react';

export default function Notifications() {
  const {
    notifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAllNotifications,
  } = useSettingsStore();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <AppShell>
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  const filteredNotifications =
    filter === 'all' ? notifications : notifications.filter((n) => !n.read);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'feature':
        return (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100">
            <Sparkles className="h-5 w-5 text-violet-600" />
          </div>
        );
      case 'update':
        return (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
            <RefreshCw className="h-5 w-5 text-green-600" />
          </div>
        );
      case 'tip':
        return (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
            <Zap className="h-5 w-5 text-amber-600" />
          </div>
        );
      default:
        return (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
            <Info className="h-5 w-5 text-blue-600" />
          </div>
        );
    }
  };

  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const d = new Date(date);
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    // Return null to use ClientDate component for date display
    return null;
  };

  const getTypeLabel = (type: Notification['type']) => {
    switch (type) {
      case 'feature':
        return { text: 'Feature', color: 'bg-violet-100 text-violet-700' };
      case 'update':
        return { text: 'Update', color: 'bg-green-100 text-green-700' };
      case 'tip':
        return { text: 'Tip', color: 'bg-amber-100 text-amber-700' };
      default:
        return { text: 'System', color: 'bg-blue-100 text-blue-700' };
    }
  };

  return (
    <AppShell>
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
          <div className="flex items-center gap-3">
            <Bell className="h-6 w-6 text-violet-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Notifications</h1>
              <p className="text-sm text-gray-500">
                {unreadCount > 0
                  ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}`
                  : 'All caught up!'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Filter Tabs */}
            <div className="flex rounded-lg border border-gray-200 p-1">
              <button
                onClick={() => setFilter('all')}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                  filter === 'all'
                    ? 'bg-violet-100 text-violet-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('unread')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                  filter === 'unread'
                    ? 'bg-violet-100 text-violet-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Unread
                {unreadCount > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-violet-600 px-1.5 text-xs text-white">
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>

            {/* Actions */}
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50"
              >
                <CheckCheck className="h-4 w-4" />
                Mark all read
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={clearAllNotifications}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
                Clear all
              </button>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {filteredNotifications.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
                <BellOff className="h-10 w-10 text-gray-400" />
              </div>
              <h2 className="mb-2 text-xl font-semibold text-gray-700">
                {filter === 'unread'
                  ? 'No unread notifications'
                  : 'No notifications'}
              </h2>
              <p className="max-w-sm text-gray-500">
                {filter === 'unread'
                  ? "You've read all your notifications. Check back later for updates!"
                  : "You don't have any notifications yet. We'll notify you about important updates and tips."}
              </p>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-3">
              {filteredNotifications.map((notification) => {
                const typeLabel = getTypeLabel(notification.type);
                return (
                  <div
                    key={notification.id}
                    className={`group rounded-lg border bg-white p-4 transition-all hover:shadow-md ${
                      !notification.read
                        ? 'border-violet-200 bg-violet-50/30'
                        : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {getNotificationIcon(notification.type)}

                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-gray-900">
                              {notification.title}
                            </h3>
                            {!notification.read && (
                              <span className="h-2 w-2 rounded-full bg-violet-600" />
                            )}
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeLabel.color}`}
                            >
                              {typeLabel.text}
                            </span>
                          </div>
                          <span className="whitespace-nowrap text-xs text-gray-500">
                            {formatTimestamp(notification.timestamp) || (
                              <ClientDate
                                date={notification.timestamp}
                                format="date"
                              />
                            )}
                          </span>
                        </div>
                        <p className="mb-3 text-sm text-gray-600">
                          {notification.message}
                        </p>

                        <div className="flex items-center gap-3">
                          {notification.actionUrl && (
                            <Link
                              href={notification.actionUrl}
                              onClick={() => markAsRead(notification.id)}
                              className="text-sm font-medium text-violet-600 hover:text-violet-700"
                            >
                              View
                            </Link>
                          )}
                          {!notification.read && (
                            <button
                              onClick={() => markAsRead(notification.id)}
                              className="flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-700"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Mark as read
                            </button>
                          )}
                          <button
                            onClick={() => deleteNotification(notification.id)}
                            className="flex items-center gap-1 text-sm font-medium text-gray-400 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </AppShell>
  );
}
