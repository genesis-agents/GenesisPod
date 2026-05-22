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
    Icon: typeof XCircle;
    iconColor: string;
    confirmVariant: 'default' | 'destructive' | 'outline';
  }
> = {
  danger: {
    Icon: XCircle,
    iconColor: 'text-red-500',
    confirmVariant: 'destructive',
  },
  warning: {
    Icon: AlertTriangle,
    iconColor: 'text-amber-500',
    confirmVariant: 'default',
  },
  info: {
    Icon: Info,
    iconColor: 'text-blue-500',
    confirmVariant: 'default',
  },
  success: {
    Icon: CheckCircle,
    iconColor: 'text-emerald-500',
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
  const { Icon, iconColor, confirmVariant } = typeConfig[type];

  const handleConfirm = async () => {
    await onConfirm();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      showCloseButton={false}
      // 图标内联标题；按钮走 Modal 底部灰条（右对齐），与全站弹窗一致。
      title={
        <span className="flex items-center gap-2.5">
          <Icon className={cn('h-5 w-5 shrink-0', iconColor)} />
          <span className="min-w-0 truncate">{title}</span>
        </span>
      }
      // 无描述时收起内容区，避免标题与按钮之间留空白。
      contentClassName={description ? undefined : 'hidden'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? '处理中…' : confirmText}
          </Button>
        </>
      }
    >
      {description ? (
        <p className="text-sm leading-relaxed text-gray-600">{description}</p>
      ) : null}
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
