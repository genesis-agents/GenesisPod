'use client';

import { Inbox } from 'lucide-react';
import AdminPageLayout from '@/components/admin/layout/AdminPageLayout';
import { KeyRequestsManager } from '@/components/admin/byok/KeyRequestsManager';

export default function KeyRequestsPage() {
  return (
    <AdminPageLayout
      title="Key 申请工单"
      description="处理用户的 API Key 申请。批准时从分发池选择一个 Key 分配给该用户。"
      icon={Inbox}
      domain="access"
    >
      <KeyRequestsManager />
    </AdminPageLayout>
  );
}
