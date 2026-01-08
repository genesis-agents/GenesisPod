'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Users,
  Crown,
  ChevronRight,
  Loader2,
  AlertCircle,
  UserPlus,
} from 'lucide-react';
import * as api from '@/lib/api/admin-ai-teams';
import type {
  AITeamTemplate,
  AITeamMemberTemplate,
  CreateTeamDto,
  UpdateTeamDto,
} from '@/lib/api/admin-ai-teams';
import AITeamMemberEditor from './AITeamMemberEditor';

// ==================== Team Form Modal ====================

interface TeamFormModalProps {
  team?: AITeamTemplate | null;
  onClose: () => void;
  onSave: (dto: CreateTeamDto | UpdateTeamDto) => Promise<void>;
}

function TeamFormModal({ team, onClose, onSave }: TeamFormModalProps) {
  const [name, setName] = useState(team?.name || '');
  const [displayName, setDisplayName] = useState(team?.displayName || '');
  const [description, setDescription] = useState(team?.description || '');
  const [icon, setIcon] = useState(team?.icon || '');
  const [color, setColor] = useState(team?.color || '#3B82F6');
  const [category, setCategory] = useState(team?.category || 'writing');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        name,
        displayName,
        description: description || undefined,
        icon: icon || undefined,
        color: color || undefined,
        category: category || undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">
          {team ? '编辑团队' : '创建团队'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                内部标识 *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="writing-team"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                显示名称 *
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="写作团队"
                required
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              描述
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              rows={3}
              placeholder="团队的功能描述..."
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                图标
              </label>
              <input
                type="text"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="emoji"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                主题色
              </label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 w-full rounded-lg border border-gray-300"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                分类
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="writing">写作</option>
                <option value="research">研究</option>
                <option value="coding">编程</option>
                <option value="design">设计</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving || !name || !displayName}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {team ? '保存' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==================== Main Component ====================

export default function AITeamsSettings() {
  const [teams, setTeams] = useState<AITeamTemplate[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<AITeamTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [editingTeam, setEditingTeam] = useState<AITeamTemplate | null>(null);
  const [showMemberEditor, setShowMemberEditor] = useState(false);
  const [editingMember, setEditingMember] =
    useState<AITeamMemberTemplate | null>(null);

  // Load teams
  const loadTeams = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.getTeams({ includeMembers: true });
      setTeams(result.items);
      // Auto-select first team if none selected
      if (!selectedTeam && result.items.length > 0) {
        setSelectedTeam(result.items[0]);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedTeam]);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  // Team CRUD
  const handleCreateTeam = async (dto: CreateTeamDto | UpdateTeamDto) => {
    const team = await api.createTeam(dto as CreateTeamDto);
    setTeams((prev) => [...prev, team]);
    setSelectedTeam(team);
  };

  const handleUpdateTeam = async (dto: CreateTeamDto | UpdateTeamDto) => {
    if (!editingTeam) return;
    const updated = await api.updateTeam(editingTeam.id, dto as UpdateTeamDto);
    setTeams((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    if (selectedTeam?.id === updated.id) {
      setSelectedTeam(updated);
    }
  };

  const handleDeleteTeam = async (team: AITeamTemplate) => {
    if (team.isSystem) {
      alert('系统预设团队不能删除');
      return;
    }
    if (!confirm(`确定要删除团队 "${team.displayName}" 吗？`)) return;

    await api.deleteTeam(team.id);
    setTeams((prev) => prev.filter((t) => t.id !== team.id));
    if (selectedTeam?.id === team.id) {
      setSelectedTeam(teams.find((t) => t.id !== team.id) || null);
    }
  };

  // Member CRUD
  const handleSaveMember = async (
    memberData: api.CreateTeamMemberDto | api.UpdateTeamMemberDto
  ) => {
    if (!selectedTeam) return;

    if (editingMember) {
      // Update existing member
      const updated = await api.updateMember(
        editingMember.id,
        memberData as api.UpdateTeamMemberDto
      );
      const newTeam = {
        ...selectedTeam,
        members: selectedTeam.members?.map((m) =>
          m.id === updated.id ? updated : m
        ),
      };
      setSelectedTeam(newTeam);
      setTeams((prev) => prev.map((t) => (t.id === newTeam.id ? newTeam : t)));
    } else {
      // Add new member
      const newMember = await api.addMember(
        selectedTeam.id,
        memberData as api.CreateTeamMemberDto
      );
      const newTeam = {
        ...selectedTeam,
        members: [...(selectedTeam.members || []), newMember],
      };
      setSelectedTeam(newTeam);
      setTeams((prev) => prev.map((t) => (t.id === newTeam.id ? newTeam : t)));
    }

    setShowMemberEditor(false);
    setEditingMember(null);
  };

  const handleDeleteMember = async (member: AITeamMemberTemplate) => {
    if (!confirm(`确定要删除成员 "${member.displayName}" 吗？`)) return;

    await api.deleteMember(member.id);
    if (selectedTeam) {
      const newTeam = {
        ...selectedTeam,
        members: selectedTeam.members?.filter((m) => m.id !== member.id),
      };
      setSelectedTeam(newTeam);
      setTeams((prev) => prev.map((t) => (t.id === newTeam.id ? newTeam : t)));
    }
  };

  // Render
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="m-8 rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="flex items-center gap-2 text-red-700">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left: Team List */}
      <div className="w-72 border-r border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between border-b border-gray-200 p-4">
          <h2 className="font-semibold text-gray-900">AI 团队模板</h2>
          <button
            onClick={() => {
              setEditingTeam(null);
              setShowTeamForm(true);
            }}
            className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            新建
          </button>
        </div>

        <div className="space-y-1 p-2">
          {teams.map((team) => (
            <button
              key={team.id}
              onClick={() => setSelectedTeam(team)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                selectedTeam?.id === team.id
                  ? 'bg-blue-100 text-blue-900'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg text-lg"
                style={{ backgroundColor: team.color || '#E5E7EB' }}
              >
                {team.icon || ''}
              </span>
              <div className="flex-1 truncate">
                <div className="font-medium">{team.displayName}</div>
                <div className="text-xs text-gray-500">
                  {team.members?.length || 0} 成员
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </button>
          ))}

          {teams.length === 0 && (
            <div className="py-8 text-center text-sm text-gray-500">
              暂无团队模板
            </div>
          )}
        </div>
      </div>

      {/* Right: Team Details */}
      <div className="flex-1 overflow-auto">
        {selectedTeam ? (
          <div className="p-6">
            {/* Team Header */}
            <div className="mb-6 flex items-start justify-between">
              <div className="flex items-center gap-4">
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-xl text-2xl"
                  style={{ backgroundColor: selectedTeam.color || '#E5E7EB' }}
                >
                  {selectedTeam.icon || ''}
                </span>
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">
                    {selectedTeam.displayName}
                  </h1>
                  <p className="text-sm text-gray-500">
                    {selectedTeam.description || '暂无描述'}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      {selectedTeam.category || '未分类'}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        selectedTeam.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-700'
                          : selectedTeam.status === 'DRAFT'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {selectedTeam.status === 'ACTIVE'
                        ? '启用'
                        : selectedTeam.status === 'DRAFT'
                          ? '草稿'
                          : '归档'}
                    </span>
                    {selectedTeam.isSystem && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                        系统预设
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditingTeam(selectedTeam);
                    setShowTeamForm(true);
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Pencil className="h-4 w-4" />
                  编辑
                </button>
                {!selectedTeam.isSystem && (
                  <button
                    onClick={() => handleDeleteTeam(selectedTeam)}
                    className="flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    删除
                  </button>
                )}
              </div>
            </div>

            {/* Team Members */}
            <div className="rounded-xl border border-gray-200 bg-white">
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-gray-500" />
                  <h2 className="font-medium text-gray-900">团队成员</h2>
                  <span className="text-sm text-gray-500">
                    ({selectedTeam.members?.length || 0})
                  </span>
                </div>
                <button
                  onClick={() => {
                    setEditingMember(null);
                    setShowMemberEditor(true);
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  <UserPlus className="h-4 w-4" />
                  添加成员
                </button>
              </div>

              <div className="divide-y divide-gray-100">
                {selectedTeam.members?.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-lg">
                      {member.avatar || member.displayName[0]}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">
                          {member.displayName}
                        </span>
                        {member.isLeader && (
                          <Crown className="h-4 w-4 text-yellow-500" />
                        )}
                      </div>
                      <div className="text-sm text-gray-500">
                        {member.roleDescription || member.roleId}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      {member.workStyle && (
                        <span className="rounded bg-gray-100 px-2 py-0.5">
                          {member.workStyle}
                        </span>
                      )}
                      <span>{member.capabilities?.length || 0} 工具</span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setEditingMember(member);
                          setShowMemberEditor(true);
                        }}
                        className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteMember(member)}
                        className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}

                {(!selectedTeam.members ||
                  selectedTeam.members.length === 0) && (
                  <div className="py-8 text-center text-sm text-gray-500">
                    暂无成员，点击上方按钮添加
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-gray-500">
            选择左侧的团队查看详情
          </div>
        )}
      </div>

      {/* Team Form Modal */}
      {showTeamForm && (
        <TeamFormModal
          team={editingTeam}
          onClose={() => {
            setShowTeamForm(false);
            setEditingTeam(null);
          }}
          onSave={editingTeam ? handleUpdateTeam : handleCreateTeam}
        />
      )}

      {/* Member Editor Modal */}
      {showMemberEditor && selectedTeam && (
        <AITeamMemberEditor
          member={editingMember}
          onClose={() => {
            setShowMemberEditor(false);
            setEditingMember(null);
          }}
          onSave={handleSaveMember}
        />
      )}
    </div>
  );
}
