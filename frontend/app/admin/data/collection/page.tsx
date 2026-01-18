'use client';

import { Database } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { AdminPageLayout } from '@/components/admin/layout';
import CollectionManagement from '@/components/admin/CollectionManagement';

export default function DataCollectionPage() {
  const { t } = useTranslation();

  return (
    <AdminPageLayout
      title={t('admin.nav.collection')}
      description={t('admin.tabDescriptions.collection')}
      icon={Database}
      domain="data"
    >
      <CollectionManagement />
    </AdminPageLayout>
  );
}
