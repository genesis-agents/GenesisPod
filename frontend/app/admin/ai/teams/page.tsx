'use client';

import { UsersRound } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { AdminPageLayout } from '@/components/admin/layout';
import AITeamsSettings from '@/components/admin/AITeamsSettings';

export default function AITeamsPage() {
  const { t } = useTranslation();

  return (
    <AdminPageLayout
      title={t('admin.nav.teams')}
      description={t('admin.tabDescriptions.aiTeams')}
      icon={UsersRound}
      domain="ai"
    >
      <AITeamsSettings />
    </AdminPageLayout>
  );
}
