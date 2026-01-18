'use client';

import { Users } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { AdminPageLayout } from '@/components/admin/layout';
import UsersSettings from '@/components/admin/UsersSettings';

export default function UsersPage() {
  const { t } = useTranslation();

  return (
    <AdminPageLayout
      title={t('admin.nav.users')}
      description={t('admin.tabDescriptions.users')}
      icon={Users}
      domain="access"
    >
      <UsersSettings />
    </AdminPageLayout>
  );
}
