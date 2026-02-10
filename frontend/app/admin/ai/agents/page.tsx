'use client';

import { useState, useCallback } from 'react';
import { Bot, Plus, Pencil, Trash2, Power } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { AdminPageLayout } from '@/components/admin/layout';
import { useAdminAgents, AgentConfig } from '@/hooks/domain/useAdminAgents';

export default function AgentManagementPage() {
  const { t } = useTranslation();
  const {
    agents,
    loading,
    error,
    createAgent,
    updateAgent,
    deleteAgent,
    refreshAgents,
  } = useAdminAgents();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentConfig | null>(null);
  const [formData, setFormData] = useState({
    agentId: '',
    name: '',
    description: '',
    agentType: 'reactive',
    domain: 'general',
    systemPrompt: '',
    tools: '',
    skills: '',
    modelType: '',
    enabled: true,
  });

  const resetForm = useCallback(() => {
    setFormData({
      agentId: '',
      name: '',
      description: '',
      agentType: 'reactive',
      domain: 'general',
      systemPrompt: '',
      tools: '',
      skills: '',
      modelType: '',
      enabled: true,
    });
  }, []);

  const handleCreate = useCallback(async () => {
    await createAgent({
      agentId: formData.agentId,
      name: formData.name,
      description: formData.description || undefined,
      agentType: formData.agentType,
      domain: formData.domain,
      systemPrompt: formData.systemPrompt,
      tools: formData.tools
        ? formData.tools.split(',').map((s) => s.trim())
        : [],
      skills: formData.skills
        ? formData.skills.split(',').map((s) => s.trim())
        : [],
      modelType: formData.modelType || undefined,
      enabled: formData.enabled,
    });
    setShowCreateModal(false);
    resetForm();
  }, [formData, createAgent, resetForm]);

  const handleUpdate = useCallback(async () => {
    if (!editingAgent) return;
    await updateAgent(editingAgent.id, {
      name: formData.name,
      description: formData.description || undefined,
      systemPrompt: formData.systemPrompt,
      tools: formData.tools
        ? formData.tools.split(',').map((s) => s.trim())
        : [],
      skills: formData.skills
        ? formData.skills.split(',').map((s) => s.trim())
        : [],
      modelType: formData.modelType || undefined,
      enabled: formData.enabled,
    });
    setEditingAgent(null);
    resetForm();
  }, [editingAgent, formData, updateAgent, resetForm]);

  const handleEdit = useCallback((agent: AgentConfig) => {
    setEditingAgent(agent);
    setFormData({
      agentId: agent.agentId,
      name: agent.name,
      description: agent.description || '',
      agentType: agent.agentType,
      domain: agent.domain,
      systemPrompt: agent.systemPrompt,
      tools: agent.tools.join(', '),
      skills: agent.skills.join(', '),
      modelType: agent.modelType || '',
      enabled: agent.enabled,
    });
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      if (
        window.confirm(
          'Are you sure you want to delete this agent configuration?'
        )
      ) {
        await deleteAgent(id);
      }
    },
    [deleteAgent]
  );

  const handleToggleEnabled = useCallback(
    async (agent: AgentConfig) => {
      await updateAgent(agent.id, { enabled: !agent.enabled });
    },
    [updateAgent]
  );

  // Group agents by domain
  const groupedAgents = agents.reduce<Record<string, AgentConfig[]>>(
    (acc, agent) => {
      const domain = agent.domain || 'other';
      if (!acc[domain]) acc[domain] = [];
      acc[domain].push(agent);
      return acc;
    },
    {}
  );

  const isModalOpen = showCreateModal || editingAgent !== null;

  return (
    <AdminPageLayout
      title={t('admin.agents.title')}
      description={t('admin.agents.description')}
      icon={Bot}
      domain="ai"
    >
      <div className="space-y-6">
        {/* Header with Add button */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-zinc-400">
            {agents.length} agent configuration{agents.length !== 1 ? 's' : ''}
          </div>
          <button
            onClick={() => {
              resetForm();
              setShowCreateModal(true);
            }}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500"
          >
            <Plus className="h-4 w-4" />
            Add Agent
          </button>
        </div>

        {/* Error state */}
        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
            {error.message || 'Failed to load agent configurations'}
            <button
              onClick={() => refreshAgents()}
              className="ml-2 underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading state */}
        {loading && !agents.length && (
          <div className="flex items-center justify-center py-12 text-zinc-400">
            Loading agent configurations...
          </div>
        )}

        {/* Agent list grouped by domain */}
        {Object.entries(groupedAgents).map(([domain, domainAgents]) => (
          <div key={domain} className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
              {domain}
            </h3>
            <div className="overflow-hidden rounded-lg border border-zinc-700/50 bg-zinc-800/50">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-700/50 text-left text-zinc-400">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Agent ID</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {domainAgents.map((agent) => (
                    <tr
                      key={agent.id}
                      className="border-b border-zinc-700/30 last:border-0 hover:bg-zinc-700/20"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-zinc-200">
                          {agent.name}
                        </div>
                        {agent.description && (
                          <div className="mt-0.5 max-w-xs truncate text-xs text-zinc-500">
                            {agent.description}
                          </div>
                        )}
                      </td>
                      <td className="font-mono px-4 py-3 text-xs text-zinc-400">
                        {agent.agentId}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full bg-zinc-700/50 px-2 py-0.5 text-xs text-zinc-300">
                          {agent.agentType}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleToggleEnabled(agent)}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                            agent.enabled
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-zinc-700/50 text-zinc-500'
                          }`}
                        >
                          <Power className="h-3 w-3" />
                          {agent.enabled ? 'Enabled' : 'Disabled'}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEdit(agent)}
                            className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          {!agent.isBuiltIn && (
                            <button
                              onClick={() => handleDelete(agent.id)}
                              className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {/* Empty state */}
        {!loading && agents.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
            <Bot className="mb-4 h-12 w-12 opacity-30" />
            <p className="text-lg font-medium">No agent configurations</p>
            <p className="mt-1 text-sm">
              Create your first agent configuration to get started.
            </p>
          </div>
        )}

        {/* Create/Edit Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-xl">
              <h2 className="mb-4 text-lg font-semibold text-zinc-100">
                {editingAgent
                  ? 'Edit Agent Configuration'
                  : 'Create Agent Configuration'}
              </h2>

              <div className="space-y-4">
                {/* Agent ID (only for create) */}
                {!editingAgent && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-300">
                      Agent ID
                    </label>
                    <input
                      type="text"
                      value={formData.agentId}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          agentId: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-violet-500 focus:outline-none"
                      placeholder="e.g., research-lead"
                    />
                  </div>
                )}

                {/* Name */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-300">
                    Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, name: e.target.value }))
                    }
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-violet-500 focus:outline-none"
                    placeholder="e.g., Research Lead"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-300">
                    Description
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-violet-500 focus:outline-none"
                    placeholder="Optional description"
                  />
                </div>

                {/* Agent Type & Domain */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-300">
                      Agent Type
                    </label>
                    <select
                      value={formData.agentType}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          agentType: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-violet-500 focus:outline-none"
                    >
                      <option value="reactive">Reactive</option>
                      <option value="plan-based">Plan-Based</option>
                      <option value="hybrid">Hybrid</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-300">
                      Domain
                    </label>
                    <select
                      value={formData.domain}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          domain: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-violet-500 focus:outline-none"
                    >
                      <option value="general">General</option>
                      <option value="research">Research</option>
                      <option value="writing">Writing</option>
                      <option value="coding">Coding</option>
                      <option value="slides">Slides</option>
                      <option value="social">Social</option>
                    </select>
                  </div>
                </div>

                {/* System Prompt */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-300">
                    System Prompt
                  </label>
                  <textarea
                    value={formData.systemPrompt}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        systemPrompt: e.target.value,
                      }))
                    }
                    rows={4}
                    className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-violet-500 focus:outline-none"
                    placeholder="System prompt for this agent..."
                  />
                </div>

                {/* Tools & Skills */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-300">
                      Tools (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={formData.tools}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          tools: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-violet-500 focus:outline-none"
                      placeholder="web-search, code-exec"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-300">
                      Skills (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={formData.skills}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          skills: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-violet-500 focus:outline-none"
                      placeholder="slides-outline, report-writing"
                    />
                  </div>
                </div>

                {/* Model Type & Enabled */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-300">
                      Model Type
                    </label>
                    <input
                      type="text"
                      value={formData.modelType}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          modelType: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-violet-500 focus:outline-none"
                      placeholder="CHAT, REASONING, etc."
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
                      <input
                        type="checkbox"
                        checked={formData.enabled}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            enabled: e.target.checked,
                          }))
                        }
                        className="rounded border-zinc-600 bg-zinc-800 text-violet-600 focus:ring-violet-500"
                      />
                      Enabled
                    </label>
                  </div>
                </div>
              </div>

              {/* Modal actions */}
              <div className="mt-6 flex items-center justify-end gap-3 border-t border-zinc-700/50 pt-4">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingAgent(null);
                    resetForm();
                  }}
                  className="rounded-lg px-4 py-2 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  onClick={editingAgent ? handleUpdate : handleCreate}
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500"
                >
                  {editingAgent ? 'Save Changes' : 'Create Agent'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminPageLayout>
  );
}
