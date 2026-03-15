'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Globe,
  Star,
  Tag,
  ChevronUp,
  ChevronDown,
  Loader2,
  X,
  Save,
  FileText,
} from 'lucide-react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('IndustryReportSourcesTab');

const TOOL_ID = 'industry-report';

const TOPIC_TYPES = [
  { value: 'TECHNOLOGY', label: '科技' },
  { value: 'COMPANY', label: '公司' },
  { value: 'MACRO', label: '宏观' },
  { value: 'EVENT', label: '事件' },
];

const CATEGORY_OPTIONS = [
  '科技报告',
  '金融研究',
  '行业分析',
  '咨询机构',
  '政策研究',
  '学术研究',
  '新闻媒体',
  '其他',
];

export interface IndustryReportSource {
  id: string;
  name: string;
  domain: string;
  category: string;
  credibilityScore: number;
  enabled: boolean;
  topicTypes: string[];
}

interface SourceFormData {
  name: string;
  domain: string;
  category: string;
  credibilityScore: number;
  enabled: boolean;
  topicTypes: string[];
}

const DEFAULT_FORM: SourceFormData = {
  name: '',
  domain: '',
  category: '',
  credibilityScore: 0.8,
  enabled: true,
  topicTypes: [],
};

function generateId(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

interface SourceFormProps {
  initial?: IndustryReportSource | null;
  onSave: (data: SourceFormData) => void;
  onCancel: () => void;
  saving: boolean;
}

function SourceForm({ initial, onSave, onCancel, saving }: SourceFormProps) {
  const [form, setForm] = useState<SourceFormData>(
    initial
      ? {
          name: initial.name,
          domain: initial.domain,
          category: initial.category,
          credibilityScore: initial.credibilityScore,
          enabled: initial.enabled,
          topicTypes: initial.topicTypes,
        }
      : DEFAULT_FORM
  );

  const toggleTopicType = (type: string) => {
    setForm((prev) => ({
      ...prev,
      topicTypes: prev.topicTypes.includes(type)
        ? prev.topicTypes.filter((t) => t !== type)
        : [...prev.topicTypes, type],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {/* 名称 */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">
            名称 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder="例如 SemiAnalysis"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* 域名 */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">
            域名 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={form.domain}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, domain: e.target.value }))
            }
            placeholder="例如 semianalysis.com"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* 分类 */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">
            分类 <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <select
              value={
                CATEGORY_OPTIONS.includes(form.category) ? form.category : ''
              }
              onChange={(e) => {
                if (e.target.value) {
                  setForm((prev) => ({ ...prev, category: e.target.value }));
                }
              }}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">选择分类</option>
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={form.category}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, category: e.target.value }))
              }
              placeholder="或自定义"
              className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* 可信度分数 */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">
            可信度分数{' '}
            <span className="font-normal text-gray-500">
              ({form.credibilityScore.toFixed(2)})
            </span>
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0.5"
              max="1.0"
              step="0.01"
              value={form.credibilityScore}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  credibilityScore: parseFloat(e.target.value),
                }))
              }
              className="flex-1 accent-blue-600"
            />
            <span
              className={`w-12 rounded px-1.5 py-0.5 text-center text-xs font-semibold ${
                form.credibilityScore >= 0.9
                  ? 'bg-green-100 text-green-700'
                  : form.credibilityScore >= 0.75
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-yellow-100 text-yellow-700'
              }`}
            >
              {form.credibilityScore.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>0.50</span>
            <span>0.75</span>
            <span>1.00</span>
          </div>
        </div>
      </div>

      {/* 关联话题类型 */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700">
          关联话题类型
        </label>
        <div className="flex flex-wrap gap-2">
          {TOPIC_TYPES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => toggleTopicType(value)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                form.topicTypes.includes(value)
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              {label} ({value})
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400">不选则对所有类型生效</p>
      </div>

      {/* 启用状态 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={form.enabled}
          onClick={() =>
            setForm((prev) => ({ ...prev, enabled: !prev.enabled }))
          }
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
            form.enabled ? 'bg-blue-600' : 'bg-gray-200'
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
              form.enabled ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
        <span className="text-sm text-gray-700">
          {form.enabled ? '已启用' : '已禁用'}
        </span>
      </div>

      {/* 操作按钮 */}
      <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <X className="h-4 w-4" />
          取消
        </button>
        <button
          type="submit"
          disabled={saving || !form.name || !form.domain || !form.category}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          保存
        </button>
      </div>
    </form>
  );
}

interface SourceRowProps {
  source: IndustryReportSource;
  index: number;
  total: number;
  onEdit: (source: IndustryReportSource) => void;
  onDelete: (id: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onToggle: (id: string, enabled: boolean) => void;
}

function SourceRow({
  source,
  index,
  total,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  onToggle,
}: SourceRowProps) {
  return (
    <div className="group flex items-center gap-3 border-b border-gray-100 px-4 py-3 transition-colors last:border-b-0 hover:bg-gray-50">
      {/* 排序按钮 */}
      <div className="flex flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={() => onMoveUp(index)}
          disabled={index === 0}
          className="flex h-4 w-4 items-center justify-center rounded text-gray-400 hover:text-gray-600 disabled:opacity-20"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          onClick={() => onMoveDown(index)}
          disabled={index === total - 1}
          className="flex h-4 w-4 items-center justify-center rounded text-gray-400 hover:text-gray-600 disabled:opacity-20"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>

      {/* 状态图标 */}
      <div
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
          source.enabled ? 'bg-blue-50' : 'bg-gray-100'
        }`}
      >
        <FileText
          className={`h-4 w-4 ${source.enabled ? 'text-blue-600' : 'text-gray-400'}`}
        />
      </div>

      {/* 主要信息 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">{source.name}</span>
          <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
            <Globe className="h-3 w-3" />
            {source.domain}
          </span>
          <span className="rounded bg-purple-50 px-1.5 py-0.5 text-xs text-purple-700">
            {source.category}
          </span>
        </div>
        {source.topicTypes.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {source.topicTypes.map((type) => {
              const topicLabel =
                TOPIC_TYPES.find((t) => t.value === type)?.label ?? type;
              return (
                <span
                  key={type}
                  className="inline-flex items-center gap-0.5 rounded-full border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600"
                >
                  <Tag className="h-2.5 w-2.5" />
                  {topicLabel}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* 可信度分数 */}
      <div className="flex flex-shrink-0 items-center gap-1">
        <Star
          className={`h-3.5 w-3.5 ${
            source.credibilityScore >= 0.9 ? 'text-yellow-500' : 'text-gray-300'
          }`}
        />
        <span
          className={`text-xs font-semibold ${
            source.credibilityScore >= 0.9
              ? 'text-green-700'
              : source.credibilityScore >= 0.75
                ? 'text-blue-700'
                : 'text-yellow-700'
          }`}
        >
          {source.credibilityScore.toFixed(2)}
        </span>
      </div>

      {/* 启用开关 */}
      <button
        role="switch"
        aria-checked={source.enabled}
        onClick={() => onToggle(source.id, !source.enabled)}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
          source.enabled ? 'bg-blue-600' : 'bg-gray-200'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
            source.enabled ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>

      {/* 操作按钮 */}
      <div className="flex flex-shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={() => onEdit(source)}
          className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-700"
          title="编辑"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onDelete(source.id)}
          className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600"
          title="删除"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

interface IndustryReportSourcesTabProps {
  loading?: boolean;
}

export default function IndustryReportSourcesTab({
  loading: parentLoading = false,
}: IndustryReportSourcesTabProps) {
  const [sources, setSources] = useState<IndustryReportSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingSource, setEditingSource] =
    useState<IndustryReportSource | null>(null);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const loadSources = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${config.apiUrl}/admin/ai/tools`, {
        headers: { ...getAuthHeader() },
      });

      if (!res.ok) {
        logger.error('Failed to fetch tool configs');
        setSources([]);
        return;
      }

      const json = await res.json();
      const tools: Array<{
        toolId: string;
        config?: { sources?: IndustryReportSource[] } | null;
      }> = json?.data?.tools ?? json?.tools ?? [];

      const industryTool = tools.find((t) => t.toolId === TOOL_ID);
      const rawSources = industryTool?.config?.sources ?? [];
      setSources(rawSources);
    } catch (err) {
      logger.error('Failed to load industry report sources:', err);
      setSources([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  const persistSources = async (updated: IndustryReportSource[]) => {
    setSaving(true);
    try {
      const res = await fetch(`${config.apiUrl}/admin/ai/tools/${TOOL_ID}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({ config: { sources: updated } }),
      });

      if (!res.ok) {
        throw new Error('Save failed');
      }

      setSources(updated);
      return true;
    } catch (err) {
      logger.error('Failed to save industry report sources:', err);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (formData: SourceFormData) => {
    let updated: IndustryReportSource[];

    if (editingSource) {
      updated = sources.map((s) =>
        s.id === editingSource.id ? { ...formData, id: editingSource.id } : s
      );
    } else {
      const newSource: IndustryReportSource = {
        ...formData,
        id: generateId(formData.name) || `source-${Date.now()}`,
      };
      // 确保 id 唯一
      if (sources.some((s) => s.id === newSource.id)) {
        newSource.id = `${newSource.id}-${Date.now()}`;
      }
      updated = [...sources, newSource];
    }

    const ok = await persistSources(updated);
    if (ok) {
      showMessage('success', editingSource ? '报告源已更新' : '报告源已添加');
      setShowForm(false);
      setEditingSource(null);
    } else {
      showMessage('error', '保存失败，请重试');
    }
  };

  const handleDelete = async (id: string) => {
    const source = sources.find((s) => s.id === id);
    if (!source) return;
    if (!confirm(`确认删除报告源「${source.name}」？`)) return;

    const updated = sources.filter((s) => s.id !== id);
    const ok = await persistSources(updated);
    if (ok) {
      showMessage('success', `已删除「${source.name}」`);
    } else {
      showMessage('error', '删除失败，请重试');
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    const updated = sources.map((s) => (s.id === id ? { ...s, enabled } : s));
    const ok = await persistSources(updated);
    if (!ok) {
      showMessage('error', '更新失败，请重试');
    }
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const updated = [...sources];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    const ok = await persistSources(updated);
    if (!ok) showMessage('error', '排序失败，请重试');
  };

  const handleMoveDown = async (index: number) => {
    if (index === sources.length - 1) return;
    const updated = [...sources];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    const ok = await persistSources(updated);
    if (!ok) showMessage('error', '排序失败，请重试');
  };

  const handleEdit = (source: IndustryReportSource) => {
    setEditingSource(source);
    setShowForm(true);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingSource(null);
  };

  if (parentLoading || loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  const enabledCount = sources.filter((s) => s.enabled).length;

  return (
    <div className="space-y-4">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">行业报告来源</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            配置 AI 生成行业洞察报告时参考的权威来源网站
            {sources.length > 0 && (
              <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                {enabledCount} / {sources.length} 已启用
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => {
            setEditingSource(null);
            setShowForm(true);
          }}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          添加来源
        </button>
      </div>

      {/* 消息提示 */}
      {message && (
        <div
          className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          }`}
        >
          <span>{message.text}</span>
          <button
            onClick={() => setMessage(null)}
            className="ml-auto opacity-60 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 添加/编辑表单 */}
      {showForm && (
        <div className="rounded-xl border border-blue-100 bg-blue-50/30 p-4">
          <h4 className="mb-4 text-sm font-semibold text-gray-800">
            {editingSource ? `编辑：${editingSource.name}` : '添加新来源'}
          </h4>
          <SourceForm
            initial={editingSource}
            onSave={handleSave}
            onCancel={handleCancelForm}
            saving={saving}
          />
        </div>
      )}

      {/* 来源列表 */}
      {sources.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 py-12 text-center">
          <FileText className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-2 text-sm font-medium text-gray-500">
            暂无配置的报告来源
          </p>
          <p className="mt-1 text-xs text-gray-400">
            点击「添加来源」配置 AI 报告生成参考的权威来源
          </p>
          <button
            onClick={() => {
              setEditingSource(null);
              setShowForm(true);
            }}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Plus className="h-4 w-4" />
            添加来源
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          {/* 表头 */}
          <div className="border-b border-gray-100 bg-gray-50 px-4 py-2">
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 text-xs font-medium text-gray-500">
              <span className="w-8" />
              <span>来源信息</span>
              <span className="w-12 text-center">可信度</span>
              <span className="w-16 text-center">状态</span>
              <span className="w-16 text-center">操作</span>
            </div>
          </div>

          {/* 行列表 */}
          {sources.map((source, index) => (
            <SourceRow
              key={source.id}
              source={source}
              index={index}
              total={sources.length}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
              onToggle={handleToggle}
            />
          ))}
        </div>
      )}

      {/* 说明提示 */}
      {sources.length > 0 && (
        <p className="text-xs text-gray-400">
          提示：鼠标悬停行可排序或编辑。可信度分数影响 AI 引用时的权重（0.9+
          高权重）。
        </p>
      )}
    </div>
  );
}
