'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';
import { Save, X, Loader2 } from 'lucide-react';
import { SKILL_LAYERS } from './skill-layers';
import type { SkillConfig } from './types';

interface EditSkillModalProps {
  skill: SkillConfig;
  onClose: () => void;
  onSave: (skill: SkillConfig) => Promise<void>;
  saving: boolean;
}

export function EditSkillModal({
  skill,
  onClose,
  onSave,
  saving,
}: EditSkillModalProps) {
  const { t } = useTranslation();
  const [editedSkill, setEditedSkill] = useState<SkillConfig>({ ...skill });
  const [tagsInput, setTagsInput] = useState(skill.tags.join(', '));
  const [toolsInput, setToolsInput] = useState(skill.requiredTools.join(', '));
  const [skillsInput, setSkillsInput] = useState(
    skill.requiredSkills.join(', ')
  );

  const layerInfo =
    SKILL_LAYERS.find((l) => l.id === skill.layer) || SKILL_LAYERS[0];

  // Keyboard support - Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const updatedSkill: SkillConfig = {
      ...editedSkill,
      tags: tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      requiredTools: toolsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      requiredSkills: skillsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };
    await onSave(updatedSkill);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-skill-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className={`rounded-lg p-2 ${layerInfo.color}`}>
              <layerInfo.icon className="h-5 w-5 text-gray-700" />
            </div>
            <div>
              <h3
                id="edit-skill-modal-title"
                className="text-lg font-semibold text-gray-900"
              >
                {t('admin.skills.modal.editSkill')}
              </h3>
              <p className="text-sm text-gray-500">
                {skill.displayName || skill.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form
          onSubmit={handleSubmit}
          className="max-h-[70vh] overflow-y-auto p-6"
        >
          <div className="space-y-4">
            {/* Display Name */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                {t('admin.skills.modal.displayName')}
              </label>
              <input
                type="text"
                value={editedSkill.displayName}
                onChange={(e) =>
                  setEditedSkill({
                    ...editedSkill,
                    displayName: e.target.value,
                  })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {/* Description */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                {t('admin.skills.modal.description')}
              </label>
              <textarea
                value={editedSkill.description}
                onChange={(e) =>
                  setEditedSkill({
                    ...editedSkill,
                    description: e.target.value,
                  })
                }
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {/* Author & Version */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Author
                </label>
                <input
                  type="text"
                  value={editedSkill.author || ''}
                  onChange={(e) =>
                    setEditedSkill({
                      ...editedSkill,
                      author: e.target.value || undefined,
                    })
                  }
                  placeholder="e.g. deepdive-engine"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Version
                </label>
                <input
                  type="text"
                  value={editedSkill.version || ''}
                  onChange={(e) =>
                    setEditedSkill({
                      ...editedSkill,
                      version: e.target.value || undefined,
                    })
                  }
                  placeholder="e.g. 1.0.0"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            {/* Layer & Domain */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  {t('admin.skills.modal.layer')}
                </label>
                <select
                  value={editedSkill.layer}
                  onChange={(e) =>
                    setEditedSkill({ ...editedSkill, layer: e.target.value })
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  {SKILL_LAYERS.filter((l) => l.id !== 'all').map((l) => (
                    <option key={l.id} value={l.id}>
                      {t(l.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  {t('admin.skills.modal.domain')}
                </label>
                <input
                  type="text"
                  value={editedSkill.domain}
                  onChange={(e) =>
                    setEditedSkill({ ...editedSkill, domain: e.target.value })
                  }
                  placeholder={t('admin.skills.modal.domainPlaceholder')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                {t('admin.skills.modal.tags')}{' '}
                <span className="font-normal text-gray-400">
                  {t('admin.skills.modal.commaSeparated')}
                </span>
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder={t('admin.skills.modal.tagsPlaceholder')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {/* Required Tools */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                {t('admin.skills.requiredTools')}{' '}
                <span className="font-normal text-gray-400">
                  {t('admin.skills.modal.commaSeparated')}
                </span>
              </label>
              <input
                type="text"
                value={toolsInput}
                onChange={(e) => setToolsInput(e.target.value)}
                placeholder={t('admin.skills.modal.requiredToolsPlaceholder')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {/* Required Skills */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                {t('admin.skills.requiredSkills')}{' '}
                <span className="font-normal text-gray-400">
                  {t('admin.skills.modal.commaSeparated')}
                </span>
              </label>
              <input
                type="text"
                value={skillsInput}
                onChange={(e) => setSkillsInput(e.target.value)}
                placeholder={t('admin.skills.modal.requiredSkillsPlaceholder')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {/* Enabled Toggle */}
            <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
              <div>
                <span className="font-medium text-gray-700">
                  {t('admin.skills.modal.enabled')}
                </span>
                <p className="text-sm text-gray-500">
                  {t('admin.skills.modal.enabledDescription')}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setEditedSkill({
                    ...editedSkill,
                    enabled: !editedSkill.enabled,
                  })
                }
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  editedSkill.enabled ? 'bg-green-500' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                    editedSkill.enabled ? 'left-[22px]' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {t('admin.skills.modal.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {t('admin.skills.modal.saveChanges')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
