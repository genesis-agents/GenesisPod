'use client';

import { Key } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { AdminPageLayout } from '@/components/admin/layout';
import SecretsManager from '@/components/admin/SecretsManager';

export default function SecretsPage() {
  const { t } = useTranslation();

  return (
    <AdminPageLayout
      title={t('admin.nav.secrets')}
      description={t('admin.tabDescriptions.secrets')}
      icon={Key}
      domain="access"
    >
      <SecretsManager />
    </AdminPageLayout>
  );
}
