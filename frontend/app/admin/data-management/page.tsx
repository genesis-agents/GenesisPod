'use client';

import AppShell from '@/components/layout/AppShell';
import { DataManagementDashboard } from '@/components/admin/data-management/DataManagementDashboard';

export default function Page() {
  return (
    <AppShell>
      <DataManagementDashboard />
    </AppShell>
  );
}
