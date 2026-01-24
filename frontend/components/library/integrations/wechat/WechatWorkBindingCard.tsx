'use client';

import { useState, useEffect, useCallback } from 'react';
import { MessageCircle, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { useTranslation } from '@/lib/i18n';

import { logger } from '@/lib/utils/logger';
interface BindingStatus {
  isBound: boolean;
  wechatWorkUserId: string | null;
}

/**
 * WeChat Work Binding Card
 * Allows users to bind their WeChat Work user ID for syncing content
 */
export function WechatWorkBindingCard() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [binding, setBinding] = useState(false);
  const [status, setStatus] = useState<BindingStatus | null>(null);
  const [wechatWorkUserId, setWechatWorkUserId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch binding status
  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(
        `${config.apiUrl}/wechat-data-source/binding`,
        {
          headers: { ...getAuthHeader() },
        }
      );
      if (response.ok) {
        const result = await response.json();
        // Handle wrapped API response { success: true, data: T }
        const data = result?.data ?? result;
        setStatus(data);
        if (data.wechatWorkUserId) {
          setWechatWorkUserId(data.wechatWorkUserId);
        }
      }
    } catch (err) {
      logger.error('Failed to fetch WeChat Work binding status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Bind WeChat Work ID
  const handleBind = async () => {
    if (!wechatWorkUserId.trim()) {
      setError(t('profile.integrations.wechat.enterUserId'));
      return;
    }

    setBinding(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `${config.apiUrl}/wechat-data-source/binding`,
        {
          method: 'PATCH',
          headers: {
            ...getAuthHeader(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ wechatWorkUserId: wechatWorkUserId.trim() }),
        }
      );

      if (response.ok) {
        setSuccess(t('profile.integrations.wechat.bindSuccess'));
        await fetchStatus();
      } else {
        const result = await response.json();
        // Handle wrapped API response { success: true, data: T }
        const data = result?.data ?? result;
        setError(data.message || t('profile.integrations.wechat.bindFailed'));
      }
    } catch (err) {
      logger.error('Failed to bind WeChat Work ID:', err);
      setError(t('profile.integrations.wechat.bindFailed'));
    } finally {
      setBinding(false);
    }
  };

  // Unbind WeChat Work ID
  const handleUnbind = async () => {
    if (!confirm(t('profile.integrations.wechat.confirmUnbind'))) {
      return;
    }

    setBinding(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `${config.apiUrl}/wechat-data-source/binding`,
        {
          method: 'DELETE',
          headers: { ...getAuthHeader() },
        }
      );

      if (response.ok) {
        setSuccess(t('profile.integrations.wechat.unbindSuccess'));
        setWechatWorkUserId('');
        await fetchStatus();
      } else {
        const result = await response.json();
        // Handle wrapped API response { success: true, data: T }
        const data = result?.data ?? result;
        setError(data.message || t('profile.integrations.wechat.unbindFailed'));
      }
    } catch (err) {
      logger.error('Failed to unbind WeChat Work ID:', err);
      setError(t('profile.integrations.wechat.unbindFailed'));
    } finally {
      setBinding(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-green-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
          <MessageCircle className="h-7 w-7 text-green-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {t('profile.integrations.wechat.title')}
          </h2>
          <p className="text-sm text-gray-500">
            {t('profile.integrations.wechat.description')}
          </p>
        </div>
      </div>

      {/* Status */}
      {status?.isBound ? (
        <div className="space-y-4">
          {/* Connected Status */}
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium text-green-800">
                    {t('profile.integrations.wechat.connected')}
                  </p>
                  <p className="text-sm text-green-600">
                    {t('profile.integrations.wechat.boundTo')}:{' '}
                    {status.wechatWorkUserId}
                  </p>
                </div>
              </div>
              <button
                onClick={handleUnbind}
                disabled={binding}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
              >
                {binding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t('profile.integrations.disconnect')
                )}
              </button>
            </div>
          </div>

          {/* Usage Instructions */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <h4 className="mb-2 text-sm font-medium text-gray-700">
              {t('profile.integrations.wechat.howToUse')}
            </h4>
            <ol className="list-inside list-decimal space-y-1 text-sm text-gray-600">
              <li>{t('profile.integrations.wechat.step1')}</li>
              <li>{t('profile.integrations.wechat.step2')}</li>
              <li>{t('profile.integrations.wechat.step3')}</li>
            </ol>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Not Connected */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center gap-2 text-gray-600">
              <XCircle className="h-5 w-5" />
              <span>{t('profile.integrations.wechat.notConnected')}</span>
            </div>
          </div>

          {/* Binding Form */}
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('profile.integrations.wechat.userIdLabel')}
              </label>
              <input
                type="text"
                value={wechatWorkUserId}
                onChange={(e) => setWechatWorkUserId(e.target.value)}
                placeholder={t('profile.integrations.wechat.userIdPlaceholder')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                {t('profile.integrations.wechat.userIdHelp')}
              </p>
            </div>

            <button
              onClick={handleBind}
              disabled={binding || !wechatWorkUserId.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
            >
              {binding ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('profile.integrations.wechat.binding')}
                </>
              ) : (
                t('profile.integrations.wechat.bind')
              )}
            </button>
          </div>

          {/* Setup Guide */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <h4 className="mb-2 text-sm font-medium text-blue-800">
              {t('profile.integrations.wechat.findUserId')}
            </h4>
            <ol className="list-inside list-decimal space-y-1 text-sm text-blue-700">
              <li>{t('profile.integrations.wechat.findStep1')}</li>
              <li>{t('profile.integrations.wechat.findStep2')}</li>
              <li>{t('profile.integrations.wechat.findStep3')}</li>
            </ol>
          </div>
        </div>
      )}

      {/* Error/Success Messages */}
      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
      {success && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3">
          <p className="text-sm text-green-600">{success}</p>
        </div>
      )}
    </div>
  );
}

export default WechatWorkBindingCard;
