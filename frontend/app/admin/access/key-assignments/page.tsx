'use client';

import { Users } from 'lucide-react';
import AdminPageLayout from '@/components/admin/layout/AdminPageLayout';
import { KeyAssignmentsOverview } from '@/components/admin/byok/KeyAssignmentsOverview';

export default function KeyAssignmentsPage() {
  return (
    <AdminPageLayout
      title="Key 分配总览"
      description="管理所有用户与分发 Key 的关联，支持撤销、调整配额和查看用量"
      icon={Users}
      domain="access"
    >
      <KeyAssignmentsOverview />
    </AdminPageLayout>
  );
}
