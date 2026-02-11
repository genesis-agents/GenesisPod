'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, XCircle, Loader2, Zap } from 'lucide-react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { useTranslation } from '@/lib/i18n';
import { logger } from '@/lib/utils/logger';

interface BindingStatus {
  isBound: boolean;
  feishuOpenId: string | null;
}

/**
 * Feishu Binding Card
 * Allows users to bind their Feishu Open ID for syncing content
 */
export function FeishuBindingCard() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [binding, setBinding] = useState(false);
  const [status, setStatus] = useState<BindingStatus | null>(null);
  const [feishuOpenId, setFeishuOpenId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(
        `${config.apiUrl}/feishu-data-source/binding`,
        {
          headers: { ...getAuthHeader() },
        }
      );
      if (response.ok) {
        const result = await response.json();
        const data = result?.data ?? result;
        setStatus(data);
        if (data.feishuOpenId) {
          setFeishuOpenId(data.feishuOpenId);
        }
      }
    } catch (err) {
      logger.error('Failed to fetch Feishu binding status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleBind = async () => {
    if (!feishuOpenId.trim()) {
      setError(t('profile.integrations.feishu.enterOpenId'));
      return;
    }

    setBinding(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `${config.apiUrl}/feishu-data-source/binding`,
        {
          method: 'PATCH',
          headers: {
            ...getAuthHeader(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ feishuOpenId: feishuOpenId.trim() }),
        }
      );

      if (response.ok) {
        setSuccess(t('profile.integrations.feishu.bindSuccess'));
        await fetchStatus();
      } else {
        const result = await response.json();
        const data = result?.data ?? result;
        setError(data.message || t('profile.integrations.feishu.bindFailed'));
      }
    } catch (err) {
      logger.error('Failed to bind Feishu Open ID:', err);
      setError(t('profile.integrations.feishu.bindFailed'));
    } finally {
      setBinding(false);
    }
  };

  const handleUnbind = async () => {
    if (!confirm(t('profile.integrations.feishu.confirmUnbind'))) {
      return;
    }

    setBinding(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `${config.apiUrl}/feishu-data-source/binding`,
        {
          method: 'DELETE',
          headers: { ...getAuthHeader() },
        }
      );

      if (response.ok) {
        setSuccess(t('profile.integrations.feishu.unbindSuccess'));
        setFeishuOpenId('');
        await fetchStatus();
      } else {
        const result = await response.json();
        const data = result?.data ?? result;
        setError(data.message || t('profile.integrations.feishu.unbindFailed'));
      }
    } catch (err) {
      logger.error('Failed to unbind Feishu Open ID:', err);
      setError(t('profile.integrations.feishu.unbindFailed'));
    } finally {
      setBinding(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
          <Zap className="h-7 w-7 text-blue-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {t('profile.integrations.feishu.title')}
          </h2>
          <p className="text-sm text-gray-500">
            {t('profile.integrations.feishu.description')}
          </p>
        </div>
      </div>

      {/* Status */}
      {status?.isBound ? (
        <div className="space-y-4">
          {/* Connected Status */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="font-medium text-blue-800">
                    {t('profile.integrations.feishu.connected')}
                  </p>
                  <p className="text-sm text-blue-600">
                    {t('profile.integrations.feishu.boundTo')}:{' '}
                    {status.feishuOpenId}
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
              {t('profile.integrations.feishu.howToUse')}
            </h4>
            <ol className="list-inside list-decimal space-y-1 text-sm text-gray-600">
              <li>{t('profile.integrations.feishu.step1')}</li>
              <li>{t('profile.integrations.feishu.step2')}</li>
              <li>{t('profile.integrations.feishu.step3')}</li>
            </ol>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Not Connected */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center gap-2 text-gray-600">
              <XCircle className="h-5 w-5" />
              <span>{t('profile.integrations.feishu.notConnected')}</span>
            </div>
          </div>

          {/* Binding Form */}
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('profile.integrations.feishu.openIdLabel')}
              </label>
              <input
                type="text"
                value={feishuOpenId}
                onChange={(e) => setFeishuOpenId(e.target.value)}
                placeholder={t('profile.integrations.feishu.openIdPlaceholder')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                {t('profile.integrations.feishu.openIdHelp')}
              </p>
            </div>

            <button
              onClick={handleBind}
              disabled={binding || !feishuOpenId.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {binding ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('profile.integrations.feishu.binding')}
                </>
              ) : (
                t('profile.integrations.feishu.bind')
              )}
            </button>
          </div>

          {/* Setup Guide */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <h4 className="mb-2 text-sm font-medium text-blue-800">
              {t('profile.integrations.feishu.findOpenId')}
            </h4>
            <ol className="list-inside list-decimal space-y-1 text-sm text-blue-700">
              <li>{t('profile.integrations.feishu.findStep1')}</li>
              <li>{t('profile.integrations.feishu.findStep2')}</li>
              <li>{t('profile.integrations.feishu.findStep3')}</li>
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
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
          <p className="text-sm text-blue-600">{success}</p>
        </div>
      )}
    </div>
  );
}

export default FeishuBindingCard;
