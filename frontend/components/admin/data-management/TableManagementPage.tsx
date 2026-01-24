'use client';

import { useState, useCallback } from 'react';
import { Layers } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { useTableManagement } from '@/hooks/domain';
import { AdminPageLayout } from '@/components/admin/layout';
import TableStatsCards from './TableStatsCards';
import TableToolbar from './TableToolbar';
import TableDataGrid from './TableDataGrid';
import TableDetailModal from './TableDetailModal';
import TableDiagnosisPanel from './TableDiagnosisPanel';

export default function TableManagementPage() {
  const { t } = useTranslation();
  const [batchDiagnosing, setBatchDiagnosing] = useState(false);

  const {
    // Data
    tables,
    stats,
    total,
    page,
    pageSize,

    // Loading states
    loading,
    detailLoading,
    diagnosisLoading,
    cleanupLoading,

    // Error
    error,

    // Query state
    query,

    // Query actions
    updateSearch,
    updateCategory,
    updateHealthStatus,
    updateSort,
    updatePage,
    refresh,

    // Detail
    selectedTable,
    tableDetail,
    fetchTableDetail,
    closeTableDetail,

    // Diagnosis
    diagnosingTable,
    diagnosis,
    diagnoseTable,
    closeDiagnosis,
    batchDiagnose,

    // Cleanup
    cleaningTable,
    cleanupTable,
  } = useTableManagement();

  // Handle batch diagnose
  const handleBatchDiagnose = useCallback(async () => {
    setBatchDiagnosing(true);
    try {
      const results = await batchDiagnose();
      // Show results (could be a toast or modal)
      if (results.length === 0) {
        alert(t('admin.tables.diagnosis.noIssuesFound'));
      } else {
        alert(
          t('admin.tables.diagnosis.issuesFound', {
            count: results.length,
          })
        );
      }
    } finally {
      setBatchDiagnosing(false);
    }
  }, [batchDiagnose, t]);

  // Handle cleanup from diagnosis panel
  const handleCleanupFromDiagnosis = useCallback(() => {
    if (diagnosingTable) {
      closeDiagnosis();
      cleanupTable(diagnosingTable);
    }
  }, [diagnosingTable, closeDiagnosis, cleanupTable]);

  return (
    <AdminPageLayout
      title={t('admin.tables.title')}
      description={t('admin.tables.description')}
      icon={Layers}
      domain="data"
      maxWidth="7xl"
    >
      <div className="space-y-6">
        {/* Stats Cards */}
        <TableStatsCards stats={stats} loading={loading} />

        {/* Toolbar */}
        <TableToolbar
          query={query}
          onSearchChange={updateSearch}
          onCategoryChange={updateCategory}
          onHealthStatusChange={updateHealthStatus}
          onRefresh={refresh}
          onBatchDiagnose={handleBatchDiagnose}
          loading={loading}
          diagnosing={batchDiagnosing}
        />

        {/* Error State */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {t('admin.tables.error')}: {error.message || String(error)}
          </div>
        )}

        {/* Data Grid */}
        <TableDataGrid
          tables={tables}
          query={query}
          total={total}
          page={page}
          pageSize={pageSize}
          loading={loading}
          onSort={updateSort}
          onPageChange={updatePage}
          onViewDetail={fetchTableDetail}
          onDiagnose={diagnoseTable}
          onCleanup={cleanupTable}
          cleaningTable={cleaningTable}
        />

        {/* Detail Modal */}
        <TableDetailModal
          table={tableDetail}
          loading={detailLoading}
          open={!!selectedTable}
          onClose={closeTableDetail}
        />

        {/* Diagnosis Panel */}
        <TableDiagnosisPanel
          diagnosis={diagnosis}
          loading={diagnosisLoading}
          open={!!diagnosingTable}
          onClose={closeDiagnosis}
          onCleanup={handleCleanupFromDiagnosis}
        />
      </div>
    </AdminPageLayout>
  );
}
