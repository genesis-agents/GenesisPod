'use client';

import { useState } from 'react';
import { KeySquare, Plus } from 'lucide-react';
import AdminPageLayout from '@/components/admin/layout/AdminPageLayout';
import { DistributableKeysManager } from '@/components/admin/byok/DistributableKeysManager';

export default function DistributableKeysPage() {
  const [showAdd, setShowAdd] = useState(false);
  return (
    <AdminPageLayout
      title="分发 Key 池"
      description="管理员专门采购用于分配给无 Key 用户的 API Key，与系统自用 Secret 物理隔离"
      icon={KeySquare}
      domain="access"
      actions={
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <Plus className="h-5 w-5" />
          添加 Key
        </button>
      }
    >
      <DistributableKeysManager
        showAddModal={showAdd}
        setShowAddModal={setShowAdd}
      />
    </AdminPageLayout>
  );
}
