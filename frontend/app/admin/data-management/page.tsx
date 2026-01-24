'use client';

import { AdminPageLayout } from '@/components/admin/layout';
import DatabaseManagement from '@/components/admin/data-management/DatabaseManagement';
import { Database } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

export default function Page() {
  const { t } = useTranslation();
  return (
    <AdminPageLayout
      title={t('admin.nav.dataManagement')}
      description={t('admin.tabDescriptions.dataManagement')}
      icon={Database}
      domain="data"
    >
      <DatabaseManagement />
    </AdminPageLayout>
  );
}
