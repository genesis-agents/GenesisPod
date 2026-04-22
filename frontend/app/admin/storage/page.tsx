'use client';

import { HardDrive } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { AdminPageLayout } from '@/components/admin/layout';
import { StorageInventoryPanel } from '@/components/admin/data-management';
import StorageSettings from '@/components/admin/settings/StorageSettings';

export default function StorageAdminPage() {
  const { t } = useTranslation();

  return (
    <AdminPageLayout
      title={t('admin.nav.storage')}
      description="数据库体积、R2 对象存储用量、Off-load 迁移进度 + 存储 provider 配置"
      icon={HardDrive}
      domain="data"
      maxWidth="7xl"
    >
      <div className="space-y-6">
        <StorageInventoryPanel />
        <StorageSettings />
      </div>
    </AdminPageLayout>
  );
}
