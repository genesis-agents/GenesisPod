'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Users } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { AdminPageLayout } from '@/components/admin/layout';
import UsersSettings, {
  UsersAddButton,
  UsersSearchBar,
} from '@/components/admin/UsersSettings';
import { toast } from '@/stores';

const FROM_TOAST: Record<string, string> = {
  permissions: '"权限管理"已并入用户管理 — 在用户行内点击 [权限] 修改',
  credits: '"积分管理"已并入用户管理 — 在用户行内点击 [积分] 处理',
  billing: '"计费管理"已并入用户管理 — 在用户行内点击 [计费] 查看',
};

function UsersPageInner() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Wave 4 精化 (2026-05-11): 旧 deep-link redirect 后显示一次性 toast 提示，
  // 让书签用户知道"页面去哪了"。读完即清掉 query 防止 refresh 重复弹。
  useEffect(() => {
    const from = searchParams?.get('from');
    if (from && FROM_TOAST[from]) {
      toast.info('页面已迁移', FROM_TOAST[from]);
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.delete('from');
      const qs = params.toString();
      router.replace(
        qs ? `${pathname}?${qs}` : (pathname ?? '/admin/access/users'),
        {
          scroll: false,
        }
      );
    }
  }, [searchParams, router, pathname]);

  return (
    <AdminPageLayout
      title={t('admin.users.title')}
      description={t('admin.users.description')}
      icon={Users}
      domain="user"
      actions={<UsersAddButton onClick={() => setShowAddModal(true)} />}
      searchBar={
        <UsersSearchBar value={searchQuery} onChange={setSearchQuery} />
      }
    >
      <UsersSettings
        searchQuery={searchQuery}
        showAddModal={showAddModal}
        setShowAddModal={setShowAddModal}
      />
    </AdminPageLayout>
  );
}

export default function UsersPage() {
  return (
    <Suspense fallback={null}>
      <UsersPageInner />
    </Suspense>
  );
}
