'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { useTranslation } from '@/lib/i18n';
import { createLogger } from '@/lib/utils/logger';
import {
  Sparkles,
  Search,
  Loader2,
  CheckCircle,
  XCircle,
  RefreshCw,
  Filter,
  Tag,
  Settings,
  Save,
  X,
  ChevronDown,
  ChevronRight,
  Layers,
  Target,
  Compass,
  Palette,
  FileCode,
  Image,
  Lightbulb,
  CheckSquare,
  Edit3,
  AlertTriangle,
  Wrench,
  Link,
} from 'lucide-react';

const logger = createLogger('SkillsManagement');

// Skill interface
interface SkillConfig {
  id: string;
  skillId: string;
  name: string;
  displayName: string;
  description: string;
  layer: string;
  domain: string;
  enabled: boolean;
  tags: string[];
  requiredTools: string[];
  requiredSkills: string[];
  config?: Record<string, unknown>;
}

// Layer types
type SkillLayer =
  | 'all'
  | 'understanding'
  | 'planning'
  | 'design'
  | 'content'
  | 'rendering'
  | 'optimization'
  | 'quality';

// Layer definitions - labels use translation keys
const SKILL_LAYERS: {
  id: SkillLayer;
  labelKey: string;
  icon: typeof Layers;
  color: string;
  badge: string;
}[] = [
  {
    id: 'all',
    labelKey: 'admin.skills.layers.all',
    icon: Layers,
    color: 'bg-gray-100',
    badge: 'bg-gray-100 text-gray-700',
  },
  {
    id: 'understanding',
    labelKey: 'admin.skills.layers.understanding',
    icon: Compass,
    color: 'bg-blue-100',
    badge: 'bg-blue-100 text-blue-700',
  },
  {
    id: 'planning',
    labelKey: 'admin.skills.layers.planning',
    icon: Target,
    color: 'bg-green-100',
    badge: 'bg-green-100 text-green-700',
  },
  {
    id: 'design',
    labelKey: 'admin.skills.layers.design',
    icon: Palette,
    color: 'bg-purple-100',
    badge: 'bg-purple-100 text-purple-700',
  },
  {
    id: 'content',
    labelKey: 'admin.skills.layers.content',
    icon: FileCode,
    color: 'bg-orange-100',
    badge: 'bg-orange-100 text-orange-700',
  },
  {
    id: 'rendering',
    labelKey: 'admin.skills.layers.rendering',
    icon: Image,
    color: 'bg-pink-100',
    badge: 'bg-pink-100 text-pink-700',
  },
  {
    id: 'optimization',
    labelKey: 'admin.skills.layers.optimization',
    icon: Lightbulb,
    color: 'bg-indigo-100',
    badge: 'bg-indigo-100 text-indigo-700',
  },
  {
    id: 'quality',
    labelKey: 'admin.skills.layers.quality',
    icon: CheckSquare,
    color: 'bg-cyan-100',
    badge: 'bg-cyan-100 text-cyan-700',
  },
];

// Skill Row Component
function SkillRow({
  skill,
  onToggle,
  onEdit,
}: {
  skill: SkillConfig;
  onToggle: (skillId: string, enabled: boolean) => void;
  onEdit: (skill: SkillConfig) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const layerInfo =
    SKILL_LAYERS.find((l) => l.id === skill.layer) || SKILL_LAYERS[0];
  const LayerIcon = layerInfo.icon;

  const hasDependencies =
    skill.requiredTools.length > 0 || skill.requiredSkills.length > 0;

  return (
    <div className="group border-b border-gray-100 transition-colors hover:bg-gray-50">
      <div className="flex items-center gap-4 px-4 py-4">
        {/* Status Indicator */}
        <div className="flex-shrink-0">
          {skill.enabled ? (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
              <XCircle className="h-5 w-5 text-gray-400" />
            </div>
          )}
        </div>

        {/* Skill Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-gray-900">
              {skill.displayName || skill.name}
            </h3>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${layerInfo.badge}`}
            >
              <LayerIcon className="mr-1 inline h-3 w-3" />
              {t(layerInfo.labelKey)}
            </span>
            {skill.domain && (
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                {skill.domain}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm text-gray-500">
            {skill.description}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {skill.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600"
              >
                <Tag className="mr-0.5 h-3 w-3" />
                {tag}
              </span>
            ))}
            {skill.tags.length > 4 && (
              <span className="text-xs text-gray-400">
                +{skill.tags.length - 4}
              </span>
            )}
          </div>
        </div>

        {/* Dependencies Indicator */}
        <div className="hidden flex-shrink-0 flex-col items-end gap-1 sm:flex">
          {hasDependencies && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
            >
              <Link className="h-3 w-3" />
              {t('admin.skills.dependencies')} (
              {skill.requiredTools.length + skill.requiredSkills.length})
              {expanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            onClick={() => onEdit(skill)}
            className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Edit3 className="h-4 w-4" />
            <span className="hidden sm:inline">{t('admin.skills.edit')}</span>
          </button>
          <button
            onClick={() => onToggle(skill.skillId, !skill.enabled)}
            className={`relative h-6 w-11 rounded-full transition-colors ${
              skill.enabled ? 'bg-green-500' : 'bg-gray-300'
            }`}
          >
            <div
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                skill.enabled ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Expanded Dependencies */}
      {expanded && hasDependencies && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
          <div className="ml-14 space-y-2">
            {skill.requiredTools.length > 0 && (
              <div className="flex items-start gap-2">
                <Wrench className="mt-0.5 h-4 w-4 text-gray-400" />
                <div>
                  <span className="text-xs font-medium text-gray-500">
                    {t('admin.skills.requiredTools')}:
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {skill.requiredTools.map((tool) => (
                      <span
                        key={tool}
                        className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {skill.requiredSkills.length > 0 && (
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 text-gray-400" />
                <div>
                  <span className="text-xs font-medium text-gray-500">
                    {t('admin.skills.requiredSkills')}:
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {skill.requiredSkills.map((s) => (
                      <span
                        key={s}
                        className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Edit Modal Component
function EditSkillModal({
  skill,
  onClose,
  onSave,
  saving,
}: {
  skill: SkillConfig;
  onClose: () => void;
  onSave: (skill: SkillConfig) => Promise<void>;
  saving: boolean;
}) {
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

// Main Component
export default function SkillsManagement() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [skills, setSkills] = useState<SkillConfig[]>([]);
  const [selectedLayer, setSelectedLayer] = useState<SkillLayer>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingSkill, setEditingSkill] = useState<SkillConfig | null>(null);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Load skills
  const loadSkills = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${config.apiUrl}/admin/capabilities/skills`, {
        headers: { ...getAuthHeader() },
      });
      if (res.ok) {
        const data = await res.json();
        setSkills(data.skills || []);
      }
    } catch (err) {
      logger.error('Failed to load skills:', err);
      setMessage({ type: 'error', text: t('admin.skills.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

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
        skill.tags.some((tag) =>
          tag.toLowerCase().includes(searchQuery.toLowerCase())
        );
      return matchesLayer && matchesSearch;
    });
  }, [skills, selectedLayer, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const total = skills.length;
    const enabled = skills.filter((s) => s.enabled).length;
    return { total, enabled };
  }, [skills]);

  // Toggle skill
  const handleToggle = async (skillId: string, enabled: boolean) => {
    try {
      const res = await fetch(
        `${config.apiUrl}/admin/capabilities/skills/${skillId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
          },
          body: JSON.stringify({ enabled }),
        }
      );

      if (res.ok) {
        setSkills((prev) =>
          prev.map((s) => (s.skillId === skillId ? { ...s, enabled } : s))
        );
        const action = enabled
          ? t('admin.skills.toggleEnabled')
          : t('admin.skills.toggleDisabled');
        setMessage({
          type: 'success',
          text: t('admin.skills.toggleSuccess', { action }),
        });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: t('admin.skills.operationFailed') });
      }
    } catch (err) {
      logger.error('Failed to toggle skill:', err);
      setMessage({ type: 'error', text: t('admin.skills.operationFailed') });
    }
  };

  // Save skill
  const handleSaveSkill = async (skill: SkillConfig) => {
    setSaving(true);
    try {
      const res = await fetch(
        `${config.apiUrl}/admin/capabilities/skills/${skill.skillId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
          },
          body: JSON.stringify(skill),
        }
      );

      if (res.ok) {
        setSkills((prev) =>
          prev.map((s) => (s.skillId === skill.skillId ? skill : s))
        );
        setEditingSkill(null);
        setMessage({ type: 'success', text: t('admin.skills.saveSuccess') });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: t('admin.skills.saveFailed') });
      }
    } catch (err) {
      logger.error('Failed to save skill:', err);
      setMessage({ type: 'error', text: t('admin.skills.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="rounded-lg bg-purple-50 px-3 py-1.5">
            <span className="text-sm text-purple-700">
              <span className="font-semibold">{stats.enabled}</span> /{' '}
              {stats.total} {t('admin.skills.enabled')}
            </span>
          </div>
        </div>
        <button
          onClick={loadSkills}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('admin.skills.refresh')}
        </button>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`flex items-center gap-3 rounded-lg p-4 ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="h-5 w-5" />
          ) : (
            <AlertTriangle className="h-5 w-5" />
          )}
          <span>{message.text}</span>
          <button
            onClick={() => setMessage(null)}
            className="ml-auto opacity-50 hover:opacity-100"
          >
            &times;
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Layer Filter */}
        <div className="flex flex-wrap gap-2">
          {SKILL_LAYERS.map((layer) => {
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

        {/* Search */}
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
              onToggle={handleToggle}
              onEdit={setEditingSkill}
            />
          ))
        )}
      </div>

      {/* Edit Modal */}
      {editingSkill && (
        <EditSkillModal
          skill={editingSkill}
          onClose={() => setEditingSkill(null)}
          onSave={handleSaveSkill}
          saving={saving}
        />
      )}
    </div>
  );
}
