'use client';

import Sidebar from '@/components/layout/Sidebar';
import { DataManagementDashboard } from '@/components/admin/data-management/DataManagementDashboard';

export default function Page() {
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <DataManagementDashboard />
    </div>
  );
}
