'use client';

import { AlertTriangle, Info, CheckCircle, XCircle } from 'lucide-react';
import { useState, useCallback } from 'react';
import { Modal } from './Modal';
import { Button } from '../primitives/button';
import { cn } from '@/lib/utils/common';

type ConfirmType = 'danger' | 'warning' | 'info' | 'success';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  type?: ConfirmType;
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
}

const typeConfig: Record<
  ConfirmType,
  {
    icon: React.ReactNode;
    iconBg: string;
    confirmVariant: 'default' | 'destructive' | 'outline';
  }
> = {
  danger: {
    icon: <XCircle className="h-6 w-6 text-red-600" />,
    iconBg: 'bg-red-100',
    confirmVariant: 'destructive',
  },
  warning: {
    icon: <AlertTriangle className="h-6 w-6 text-amber-600" />,
    iconBg: 'bg-amber-100',
    confirmVariant: 'default',
  },
  info: {
    icon: <Info className="h-6 w-6 text-blue-600" />,
    iconBg: 'bg-blue-100',
    confirmVariant: 'default',
  },
  success: {
    icon: <CheckCircle className="h-6 w-6 text-green-600" />,
    iconBg: 'bg-green-100',
    confirmVariant: 'default',
  },
};

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  type = 'warning',
  confirmText = '确认',
  cancelText = '取消',
  loading = false,
}: ConfirmDialogProps) {
  const config = typeConfig[type];

  const handleConfirm = async () => {
    await onConfirm();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={title}
      showCloseButton={false}
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <div
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-full',
            config.iconBg
          )}
        >
          {config.icon}
        </div>

        {description && <p className="text-sm text-gray-500">{description}</p>}

        <div className="flex w-full gap-3 pt-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={loading}
          >
            {cancelText}
          </Button>
          <Button
            variant={config.confirmVariant}
            className="flex-1"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? '处理中...' : confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// Hook 简化使用
interface UseConfirmOptions {
  title: string;
  description?: string;
  type?: ConfirmType;
  confirmText?: string;
}

export function useConfirm(options: UseConfirmOptions) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    (() => Promise<void>) | null
  >(null);

  const confirm = useCallback((action: () => Promise<void>) => {
    setPendingAction(() => action);
    setOpen(true);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!pendingAction) return;
    setLoading(true);
    try {
      await pendingAction();
    } finally {
      setLoading(false);
      setOpen(false);
      setPendingAction(null);
    }
  }, [pendingAction]);

  const dialog = (
    <ConfirmDialog
      open={open}
      onClose={() => setOpen(false)}
      onConfirm={handleConfirm}
      loading={loading}
      {...options}
    />
  );

  return { confirm, dialog };
}
