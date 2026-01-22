'use client';

import { useState, useMemo } from 'react';
import { useTranslation } from '@/lib/i18n';
import { Search, Sparkles, Upload, Folder, ChevronDown } from 'lucide-react';
import { SkillRow } from '@/components/admin/skills/SkillRow';
import { EditSkillModal } from '@/components/admin/skills/EditSkillModal';
import {
  SKILL_LAYERS,
  SkillLayer,
} from '@/components/admin/skills/skill-layers';
import type { SkillConfig } from '@/components/admin/skills/types';

interface LocalSkillsTabProps {
  skills: SkillConfig[];
  onToggle: (skillId: string, enabled: boolean) => void;
  onSaveSkill: (skill: SkillConfig) => Promise<void>;
  saving: boolean;
}

export function LocalSkillsTab({
  skills,
  onToggle,
  onSaveSkill,
  saving,
}: LocalSkillsTabProps) {
  const { t } = useTranslation();
  const [selectedLayer, setSelectedLayer] = useState<SkillLayer>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingSkill, setEditingSkill] = useState<SkillConfig | null>(null);
  const [showLayerDropdown, setShowLayerDropdown] = useState(false);

  // Filter skills
  const filteredSkills = useMemo(() => {
    return skills.filter((skill) => {
      const matchesLayer =
        selectedLayer === 'all' || skill.layer === selectedLayer;
      const matchesSearch =
        !searchQuery ||
        skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        skill.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        skill.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        skill.tags.some((tag: string) =>
          tag.toLowerCase().includes(searchQuery.toLowerCase())
        );
      return matchesLayer && matchesSearch;
    });
  }, [skills, selectedLayer, searchQuery]);

  // Get layer counts
  const layerCounts = useMemo(() => {
    const counts: Record<string, number> = { all: skills.length };
    SKILL_LAYERS.forEach((layer) => {
      if (layer.id !== 'all') {
        counts[layer.id] = skills.filter((s) => s.layer === layer.id).length;
      }
    });
    return counts;
  }, [skills]);

  // Current layer info
  const currentLayer = SKILL_LAYERS.find((l) => l.id === selectedLayer)!;
  const CurrentIcon = currentLayer.icon;

  return (
    <div className="space-y-6">
      {/* Search and Filter Bar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Search Input */}
        <div className="relative flex-1 lg:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('admin.skills.searchPlaceholder')}
            className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
          />
        </div>

        {/* Layer Dropdown + Upload */}
        <div className="flex items-center gap-3">
          {/* Layer Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowLayerDropdown(!showLayerDropdown)}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
            >
              <CurrentIcon className="h-4 w-4" />
              <span>{t(currentLayer.labelKey)}</span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                {layerCounts[selectedLayer]}
              </span>
              <ChevronDown
                className={`h-4 w-4 text-gray-400 transition-transform ${showLayerDropdown ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Dropdown Menu */}
            {showLayerDropdown && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowLayerDropdown(false)}
                />
                <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-gray-200 bg-white py-2 shadow-lg">
                  {SKILL_LAYERS.map((layer) => {
                    const Icon = layer.icon;
                    const isActive = selectedLayer === layer.id;
                    const count = layerCounts[layer.id];

                    return (
                      <button
                        key={layer.id}
                        onClick={() => {
                          setSelectedLayer(layer.id);
                          setShowLayerDropdown(false);
                        }}
                        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                          isActive
                            ? 'bg-purple-50 text-purple-700'
                            : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-lg ${layer.color}`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1">
                          <span className="font-medium">
                            {t(layer.labelKey)}
                          </span>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            isActive
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Upload Button */}
          <button
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            title={t('admin.skills.upload')}
          >
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">{t('admin.skills.upload')}</span>
          </button>
        </div>
      </div>

      {/* Quick Layer Filters - Horizontal Scroll */}
      <div className="scrollbar-hide flex items-center gap-2 overflow-x-auto pb-2">
        {SKILL_LAYERS.map((layer) => {
          const Icon = layer.icon;
          const isActive = selectedLayer === layer.id;
          const count = layerCounts[layer.id];

          // Skip "all" in quick filters since it's redundant with dropdown
          if (layer.id === 'all') return null;

          return (
            <button
              key={layer.id}
              onClick={() => setSelectedLayer(layer.id)}
              className={`group flex flex-shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-all ${
                isActive
                  ? 'border-purple-200 bg-purple-50 text-purple-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div
                className={`flex h-5 w-5 items-center justify-center rounded ${layer.color}`}
              >
                <Icon className="h-3 w-3" />
              </div>
              <span className="whitespace-nowrap">{t(layer.labelKey)}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs ${
                  isActive
                    ? 'bg-purple-200 text-purple-800'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Skills List */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {filteredSkills.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Sparkles className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-2">{t('admin.skills.noSkillsFound')}</p>
          </div>
        ) : (
          filteredSkills.map((skill) => (
            <SkillRow
              key={skill.skillId}
              skill={skill}
              onToggle={onToggle}
              onEdit={setEditingSkill}
            />
          ))
        )}
      </div>

      {/* Source Indicator - Show file path for local skills */}
      {filteredSkills.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Folder className="h-4 w-4" />
          <span>
            Local skills from:{' '}
            <code className="rounded bg-gray-100 px-1.5 py-0.5">skills/</code>
          </span>
        </div>
      )}

      {/* Edit Modal */}
      {editingSkill && (
        <EditSkillModal
          skill={editingSkill}
          onClose={() => setEditingSkill(null)}
          onSave={onSaveSkill}
          saving={saving}
        />
      )}
    </div>
  );
}
