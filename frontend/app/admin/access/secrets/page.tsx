'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Shield, Plus, KeyRound, Activity, Inbox } from 'lucide-react';
import { AdminPageLayout } from '@/components/admin/layout';
import { AdminTabs } from '@/components/admin/shared';
import { SecretsManager } from '@/components/admin/secrets/SecretsManager';
import { SecretsStatusOverview } from '@/components/admin/secrets/SecretsStatusOverview';
import { KeyRequestsManager } from '@/components/admin/byok/KeyRequestsManager';
import { toast } from '@/stores';

type SecretsTab = 'manage' | 'requests' | 'status';

const TABS = [
  { key: 'manage', label: 'Key Management', icon: KeyRound },
  { key: 'requests', label: 'Requests', icon: Inbox },
  { key: 'status', label: 'Status Overview', icon: Activity },
];

const FROM_TOAST: Record<string, string> = {
  'key-requests': '"密钥申请"已并入密钥管理 — 在顶部 [Requests] Tab 处理',
};

function SecretsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawTab = searchParams?.get('tab');
  const tab: SecretsTab =
    rawTab === 'requests' || rawTab === 'status' ? rawTab : 'manage';

  const [showAddModal, setShowAddModal] = useState(false);

  // Wave 4 精化 (2026-05-11): 旧 /admin/access/key-requests redirect 后一次性提示
  useEffect(() => {
    const from = searchParams?.get('from');
    if (from && FROM_TOAST[from]) {
      toast.info('页面已迁移', FROM_TOAST[from]);
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.delete('from');
      const qs = params.toString();
      router.replace(
        qs ? `${pathname}?${qs}` : (pathname ?? '/admin/access/secrets'),
        {
          scroll: false,
        }
      );
    }
  }, [searchParams, router, pathname]);

  return (
    <AdminPageLayout
      title="Secret Management"
      description="Centralized management of all API keys with encrypted storage and access auditing"
      icon={Shield}
      domain="secret"
      actions={
        tab === 'manage' ? (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-700"
          >
            <Plus className="h-5 w-5" />
            Add Secret
          </button>
        ) : null
      }
    >
      <div className="mb-6">
        <AdminTabs tabs={TABS} mode="route" />
      </div>

      {tab === 'manage' && (
        <SecretsManager
          showAddModal={showAddModal}
          setShowAddModal={setShowAddModal}
        />
      )}
      {tab === 'requests' && <KeyRequestsManager />}
      {tab === 'status' && <SecretsStatusOverview />}
    </AdminPageLayout>
  );
}

export default function SecretsPage() {
  // useSearchParams requires Suspense boundary in Next.js 14 App Router
  return (
    <Suspense fallback={null}>
      <SecretsPageInner />
    </Suspense>
  );
}
