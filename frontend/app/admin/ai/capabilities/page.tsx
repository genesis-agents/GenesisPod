'use client';

import { Wrench } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { AdminPageLayout } from '@/components/admin/layout';
import AICapabilitiesSettings from '@/components/admin/AICapabilitiesSettings';

export default function AICapabilitiesPage() {
  const { t } = useTranslation();

  return (
    <AdminPageLayout
      title={t('admin.nav.capabilities')}
      description={t('admin.tabDescriptions.capabilities')}
      icon={Wrench}
      domain="ai"
    >
      <AICapabilitiesSettings />
    </AdminPageLayout>
  );
}
