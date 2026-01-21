'use client';

import { useState, useMemo } from 'react';
import { useTranslation } from '@/lib/i18n';
import { Search, Sparkles, Upload, Folder } from 'lucide-react';
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

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Layer Filter */}
        <div className="flex flex-wrap gap-2">
          {SKILL_LAYERS.map((layer: any) => {
            const Icon = layer.icon;
            const isActive = selectedLayer === layer.id;
            const count =
              layer.id === 'all'
                ? skills.length
                : skills.filter((s) => s.layer === layer.id).length;

            return (
              <button
                key={layer.id}
                onClick={() => setSelectedLayer(layer.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{t(layer.labelKey)}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-xs ${
                    isActive
                      ? 'bg-purple-500 text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search & Upload */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('admin.skills.searchPlaceholder')}
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 sm:w-64"
            />
          </div>
          <button
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            title={t('admin.skills.upload')}
          >
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">{t('admin.skills.upload')}</span>
          </button>
        </div>
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
