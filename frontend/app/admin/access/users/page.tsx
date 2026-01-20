'use client';

import { useState } from 'react';
import { Users } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { AdminPageLayout } from '@/components/admin/layout';
import UsersSettings, {
  UsersAddButton,
  UsersSearchBar,
} from '@/components/admin/UsersSettings';

export default function UsersPage() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  return (
    <AdminPageLayout
      title={t('admin.users.title')}
      description={t('admin.users.description')}
      icon={Users}
      domain="access"
      actions={<UsersAddButton onClick={() => setShowAddModal(true)} />}
      searchBar={
        <UsersSearchBar value={searchQuery} onChange={setSearchQuery} />
      }
    >
      <UsersSettings
        searchQuery={searchQuery}
        showAddModal={showAddModal}
        setShowAddModal={setShowAddModal}
      />
    </AdminPageLayout>
  );
}
