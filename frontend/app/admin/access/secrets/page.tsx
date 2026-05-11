'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Shield, Plus } from 'lucide-react';
import { AdminPageLayout } from '@/components/admin/layout';
import { SecretsManager } from '@/components/admin/secrets/SecretsManager';
import { useTranslation } from '@/lib/i18n';
import { toast } from '@/stores';

/**
 * Wave 4 修订 (2026-05-11): 密钥管理回退为**单视图**:
 * - 删除 Requests Tab → BYOK 申请审批移到用户管理 /admin/access/users 的 [模型] Drawer
 * - 删除 Status Overview Tab → 单 Key 的命中/统计/状态合并到 SecretsManager 主表格
 *
 * 旧 /admin/access/key-requests redirect 进入时携带 ?from=key-requests,
 * 落地后显示一次性 toast 引导到用户管理。
 */

const FROM_TOAST: Record<string, string> = {
  'key-requests': '"密钥申请"已并入用户管理 — 进入用户管理点 [模型] 处理',
};

function SecretsPageInner() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    const from = searchParams?.get('from');
    if (from && FROM_TOAST[from]) {
      toast.info(t('admin.secrets.movedNotice'), FROM_TOAST[from]);
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.delete('from');
      const qs = params.toString();
      router.replace(
        qs ? `${pathname}?${qs}` : (pathname ?? '/admin/access/secrets'),
        { scroll: false }
      );
    }
  }, [searchParams, router, pathname, t]);

  return (
    <AdminPageLayout
      title={t('admin.secrets.title')}
      description={t('admin.secrets.description')}
      icon={Shield}
      domain="secret"
      actions={
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-700"
        >
          <Plus className="h-5 w-5" />
          {t('admin.secrets.addSecret')}
        </button>
      }
    >
      <SecretsManager
        showAddModal={showAddModal}
        setShowAddModal={setShowAddModal}
      />
    </AdminPageLayout>
  );
}

export default function SecretsPage() {
  return (
    <Suspense fallback={null}>
      <SecretsPageInner />
    </Suspense>
  );
}
