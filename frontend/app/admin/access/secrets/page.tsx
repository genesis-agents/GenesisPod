'use client';

import { useState } from 'react';
import { Shield, Plus } from 'lucide-react';
import { AdminPageLayout } from '@/components/admin/layout';
import { SecretsManager } from '@/components/admin/secrets/SecretsManager';

export default function SecretsPage() {
  const [showAddModal, setShowAddModal] = useState(false);

  return (
    <AdminPageLayout
      title="Secret Management"
      description="Centralized management of all API keys with encrypted storage and access auditing"
      icon={Shield}
      domain="access"
      actions={
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <Plus className="h-5 w-5" />
          Add Secret
        </button>
      }
    >
      <SecretsManager
        showAddModal={showAddModal}
        setShowAddModal={setShowAddModal}
      />
    </AdminPageLayout>
  );
}
