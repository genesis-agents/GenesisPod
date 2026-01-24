'use client';

import { HardDrive } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { AdminPageLayout } from '@/components/admin/layout';
import StorageSettings from '@/components/admin/settings/StorageSettings';

export default function StoragePage() {
  const { t } = useTranslation();

  return (
    <AdminPageLayout
      title={t('admin.nav.storage')}
      description={t('admin.tabDescriptions.storage')}
      icon={HardDrive}
      domain="system"
    >
      <StorageSettings />
    </AdminPageLayout>
  );
}
