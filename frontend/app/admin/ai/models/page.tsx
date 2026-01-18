'use client';

import { Bot } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { AdminPageLayout } from '@/components/admin/layout';
import AIModelSettings from '@/components/admin/AIModelSettings';

export default function AIModelsPage() {
  const { t } = useTranslation();

  return (
    <AdminPageLayout
      title={t('admin.nav.models')}
      description={t('admin.tabDescriptions.aiModels')}
      icon={Bot}
      domain="ai"
    >
      <AIModelSettings />
    </AdminPageLayout>
  );
}
