'use client';

import { useState } from 'react';
import { Key, Plus, RefreshCw, Search } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { AdminPageLayout } from '@/components/admin/layout';
import SecretsManager from '@/components/admin/SecretsManager';

// Category options for filter
const CATEGORIES = [
  { value: 'ALL', label: 'All' },
  { value: 'AI_MODEL', label: 'AI Models' },
  { value: 'SEARCH', label: 'Search' },
  { value: 'EXTRACTION', label: 'Extraction' },
  { value: 'YOUTUBE', label: 'YouTube' },
  { value: 'TTS', label: 'TTS' },
  { value: 'SKILLSMP', label: 'SkillsMP' },
  { value: 'OTHER', label: 'Other' },
];

export default function SecretsPage() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <AdminPageLayout
      title={t('admin.nav.secrets')}
      description={t('admin.tabDescriptions.secrets')}
      icon={Key}
      domain="access"
      actions={
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-700"
        >
          <Plus className="h-5 w-5" />
          New Secret
        </button>
      }
      searchBar={
        <div className="flex items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search secrets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-4 text-sm outline-none transition-all focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          {/* Category Filter Tags */}
          <div className="flex items-center gap-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setSelectedCategory(cat.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedCategory === cat.value
                    ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-200'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      }
    >
      <SecretsManager
        searchQuery={searchQuery}
        selectedCategory={selectedCategory}
        showCreateModal={showCreateModal}
        setShowCreateModal={setShowCreateModal}
        refreshKey={refreshKey}
      />
    </AdminPageLayout>
  );
}
