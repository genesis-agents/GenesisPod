'use client';

import { Plug } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { AdminPageLayout } from '@/components/admin/layout';
import ExternalAPISettings from '@/components/admin/ExternalAPISettings';

export default function ExternalServicesPage() {
  const { t } = useTranslation();

  return (
    <AdminPageLayout
      title={t('admin.nav.externalServices')}
      description={t('admin.tabDescriptions.externalApi')}
      icon={Plug}
      domain="ai"
    >
      <ExternalAPISettings />
    </AdminPageLayout>
  );
}
