'use client';

import { AdminPageLayout } from '@/components/admin/layout';
import { DataManagementDashboard } from '@/components/admin/data-management/DataManagementDashboard';
import { Layers } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

export default function Page() {
  const { t } = useTranslation();
  return (
    <AdminPageLayout
      title={t('admin.nav.dataManagement')}
      description={t('admin.tabDescriptions.dataManagement')}
      icon={Layers}
      domain="data"
    >
      <DataManagementDashboard />
    </AdminPageLayout>
  );
}
