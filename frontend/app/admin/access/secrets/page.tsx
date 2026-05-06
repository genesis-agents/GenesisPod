'use client';

import { useState } from 'react';
import { Shield, Plus, KeyRound, Activity } from 'lucide-react';
import { AdminPageLayout } from '@/components/admin/layout';
import { SecretsManager } from '@/components/admin/secrets/SecretsManager';
import { SecretsStatusOverview } from '@/components/admin/secrets/SecretsStatusOverview';

type SecretsTab = 'manage' | 'status';

export default function SecretsPage() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [tab, setTab] = useState<SecretsTab>('manage');

  return (
    <AdminPageLayout
      title="Secret Management"
      description="Centralized management of all API keys with encrypted storage and access auditing"
      icon={Shield}
      domain="access"
      actions={
        tab === 'manage' ? (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            <Plus className="h-5 w-5" />
            Add Secret
          </button>
        ) : null
      }
    >
      <div className="mb-4 border-b border-gray-200">
        <nav className="flex gap-1" aria-label="Tabs">
          <button
            onClick={() => setTab('manage')}
            className={`inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === 'manage'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <KeyRound className="h-4 w-4" /> Key Management
          </button>
          <button
            onClick={() => setTab('status')}
            className={`inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === 'status'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Activity className="h-4 w-4" /> Status Overview
          </button>
        </nav>
      </div>

      {tab === 'manage' ? (
        <SecretsManager
          showAddModal={showAddModal}
          setShowAddModal={setShowAddModal}
        />
      ) : (
        <SecretsStatusOverview />
      )}
    </AdminPageLayout>
  );
}
