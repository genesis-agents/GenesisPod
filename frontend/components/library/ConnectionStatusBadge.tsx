'use client';

import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

export type ConnectionStatus =
  | 'connected'
  | 'disconnected'
  | 'syncing'
  | 'needs_reauth'
  | 'error';

interface ConnectionStatusBadgeProps {
  status: ConnectionStatus;
  /** Optional: Show only icon without text */
  iconOnly?: boolean;
  /** Optional: Additional CSS classes */
  className?: string;
}

/**
 * Connection status badge component with color coding and animations
 * - Green: Connected
 * - Blue: Syncing (with spinner)
 * - Orange: Needs reauthorization
 * - Red: Error
 * - Gray: Disconnected
 */
export default function ConnectionStatusBadge({
  status,
  iconOnly = false,
  className = '',
}: ConnectionStatusBadgeProps) {
  const { t } = useTranslation();

  const getStatusConfig = () => {
    switch (status) {
      case 'connected':
        return {
          icon: CheckCircle2,
          label: t('dataSources.connected'),
          containerClass:
            'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/30 dark:border-green-700 dark:text-green-400',
          dotClass: 'bg-green-500 animate-pulse-soft',
          iconClass: 'text-green-600 dark:text-green-400',
        };
      case 'syncing':
        return {
          icon: Loader2,
          label: t('dataSources.syncing'),
          containerClass:
            'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-400',
          dotClass: 'bg-blue-500',
          iconClass: 'text-blue-600 dark:text-blue-400 animate-spin',
        };
      case 'needs_reauth':
        return {
          icon: RefreshCw,
          label: t('dataSources.needsReauth'),
          containerClass:
            'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-400',
          dotClass: 'bg-amber-500 animate-pulse',
          iconClass: 'text-amber-600 dark:text-amber-400',
        };
      case 'error':
        return {
          icon: AlertCircle,
          label: t('common.error'),
          containerClass:
            'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-700 dark:text-red-400',
          dotClass: 'bg-red-500',
          iconClass: 'text-red-600 dark:text-red-400',
        };
      case 'disconnected':
      default:
        return {
          icon: XCircle,
          label: t('dataSources.notConnected'),
          containerClass:
            'bg-gray-50 border-gray-200 text-gray-500 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400',
          dotClass: 'bg-gray-400',
          iconClass: 'text-gray-400 dark:text-gray-500',
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  if (iconOnly) {
    return (
      <div
        className={`flex items-center justify-center ${className}`}
        title={config.label}
      >
        <Icon className={`h-4 w-4 ${config.iconClass}`} />
      </div>
    );
  }

  return (
    <div
      className={`
        inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1
        text-xs font-medium transition-all duration-200
        ${config.containerClass}
        ${className}
      `}
    >
      {status === 'connected' && (
        <span className={`h-2 w-2 rounded-full ${config.dotClass}`} />
      )}
      <Icon className={`h-3.5 w-3.5 ${config.iconClass}`} />
      <span>{config.label}</span>
    </div>
  );
}
