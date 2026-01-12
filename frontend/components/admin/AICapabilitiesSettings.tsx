'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Wrench,
  Sparkles,
  Server,
  Search,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  Settings,
  Play,
  RefreshCw,
  Plus,
  Trash2,
  Power,
  PowerOff,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';

// ==================== Types ====================

interface ToolConfig {
  id: string;
  toolId: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  enabled: boolean;
  implemented: boolean;
  tags: string[];
  config?: Record<string, unknown>;
}

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

interface MCPServerConfig {
  id: string;
  serverId: string;
  name: string;
  description: string;
  transport: 'stdio' | 'sse';
  command?: string;
  args?: string[];
  url?: string;
  enabled: boolean;
  autoConnect: boolean;
  connected: boolean;
  tools: Array<{
    name: string;
    description: string;
  }>;
}

interface ToolStats {
  total: number;
  enabled: number;
  implemented: number;
  byCategory: Record<string, number>;
}

interface SkillStats {
  total: number;
  enabled: number;
  byLayer: Record<string, number>;
  byDomain: Record<string, number>;
}

// ==================== Tab Navigation ====================

type TabType = 'tools' | 'skills' | 'mcp';

const TABS = [
  {
    id: 'tools' as TabType,
    name: 'Tools',
    icon: Wrench,
    description: '工具管理',
  },
  {
    id: 'skills' as TabType,
    name: 'Skills',
    icon: Sparkles,
    description: '技能管理',
  },
  {
    id: 'mcp' as TabType,
    name: 'MCP Servers',
    icon: Server,
    description: 'MCP 服务器',
  },
];

// ==================== Tool Categories ====================

const TOOL_CATEGORIES = [
  { id: 'all', name: '全部', color: 'bg-gray-100 text-gray-700' },
  { id: 'information', name: '信息获取', color: 'bg-blue-100 text-blue-700' },
  { id: 'content', name: '内容生成', color: 'bg-green-100 text-green-700' },
  { id: 'data', name: '数据处理', color: 'bg-orange-100 text-orange-700' },
  { id: 'code', name: '代码执行', color: 'bg-purple-100 text-purple-700' },
  { id: 'integration', name: '外部集成', color: 'bg-pink-100 text-pink-700' },
  { id: 'memory', name: '记忆管理', color: 'bg-indigo-100 text-indigo-700' },
  { id: 'export', name: '导出', color: 'bg-cyan-100 text-cyan-700' },
  { id: 'collaboration', name: '协作', color: 'bg-amber-100 text-amber-700' },
];

// ==================== Skill Layers ====================

const SKILL_LAYERS = [
  { id: 'all', name: '全部', color: 'bg-gray-100 text-gray-700' },
  { id: 'understanding', name: '理解层', color: 'bg-blue-100 text-blue-700' },
  { id: 'planning', name: '规划层', color: 'bg-green-100 text-green-700' },
  { id: 'design', name: '设计层', color: 'bg-purple-100 text-purple-700' },
  { id: 'content', name: '内容层', color: 'bg-orange-100 text-orange-700' },
  { id: 'rendering', name: '渲染层', color: 'bg-pink-100 text-pink-700' },
  {
    id: 'optimization',
    name: '优化层',
    color: 'bg-indigo-100 text-indigo-700',
  },
  { id: 'quality', name: '质量层', color: 'bg-cyan-100 text-cyan-700' },
];

// ==================== Preset MCP Servers ====================

const PRESET_MCP_SERVERS = [
  {
    serverId: 'duckduckgo',
    name: 'DuckDuckGo Search',
    description: '隐私搜索引擎，无需 API Key',
    transport: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-duckduckgo'],
    icon: '🦆',
  },
  {
    serverId: 'filesystem',
    name: 'File System',
    description: '本地文件系统访问',
    transport: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-filesystem', '/tmp'],
    icon: '📁',
  },
  {
    serverId: 'github',
    name: 'GitHub',
    description: 'GitHub API 访问（需要 Token）',
    transport: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-github'],
    icon: '🐙',
    requiresApiKey: true,
  },
  {
    serverId: 'slack',
    name: 'Slack',
    description: 'Slack 消息和频道管理',
    transport: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-slack'],
    icon: '💬',
    requiresApiKey: true,
  },
];

// ==================== Main Component ====================

export default function AICapabilitiesSettings() {
  const [activeTab, setActiveTab] = useState<TabType>('tools');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tools state
  const [tools, setTools] = useState<ToolConfig[]>([]);
  const [toolStats, setToolStats] = useState<ToolStats | null>(null);
  const [toolCategory, setToolCategory] = useState('all');
  const [toolSearch, setToolSearch] = useState('');

  // Skills state
  const [skills, setSkills] = useState<SkillConfig[]>([]);
  const [skillStats, setSkillStats] = useState<SkillStats | null>(null);
  const [skillLayer, setSkillLayer] = useState('all');
  const [skillSearch, setSkillSearch] = useState('');

  // MCP state
  const [mcpServers, setMcpServers] = useState<MCPServerConfig[]>([]);
  const [showAddMCP, setShowAddMCP] = useState(false);

  // Load data
  const loadTools = useCallback(async () => {
    try {
      const response = await fetch(
        `${config.apiUrl}/admin/capabilities/tools`,
        {
          headers: { ...getAuthHeader() },
          credentials: 'include',
        }
      );
      if (response.ok) {
        const data = await response.json();
        setTools(data.tools || []);
        setToolStats(data.stats || null);
      }
    } catch (err) {
      console.error('Failed to load tools:', err);
    }
  }, []);

  const loadSkills = useCallback(async () => {
    try {
      const response = await fetch(
        `${config.apiUrl}/admin/capabilities/skills`,
        {
          headers: { ...getAuthHeader() },
          credentials: 'include',
        }
      );
      if (response.ok) {
        const data = await response.json();
        setSkills(data.skills || []);
        setSkillStats(data.stats || null);
      }
    } catch (err) {
      console.error('Failed to load skills:', err);
    }
  }, []);

  const loadMCPServers = useCallback(async () => {
    try {
      const response = await fetch(
        `${config.apiUrl}/admin/capabilities/mcp-servers`,
        {
          headers: { ...getAuthHeader() },
          credentials: 'include',
        }
      );
      if (response.ok) {
        const data = await response.json();
        setMcpServers(data.servers || []);
      }
    } catch (err) {
      console.error('Failed to load MCP servers:', err);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadTools(), loadSkills(), loadMCPServers()]);
    } catch (err) {
      setError('加载数据失败');
    } finally {
      setLoading(false);
    }
  }, [loadTools, loadSkills, loadMCPServers]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Toggle handlers
  const handleToggleTool = async (toolId: string, enabled: boolean) => {
    try {
      const response = await fetch(
        `${config.apiUrl}/admin/capabilities/tools/${toolId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          credentials: 'include',
          body: JSON.stringify({ enabled }),
        }
      );
      if (response.ok) {
        setTools(
          tools.map((t) => (t.toolId === toolId ? { ...t, enabled } : t))
        );
      }
    } catch (err) {
      console.error('Failed to toggle tool:', err);
    }
  };

  const handleToggleSkill = async (skillId: string, enabled: boolean) => {
    try {
      const response = await fetch(
        `${config.apiUrl}/admin/capabilities/skills/${skillId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          credentials: 'include',
          body: JSON.stringify({ enabled }),
        }
      );
      if (response.ok) {
        setSkills(
          skills.map((s) => (s.skillId === skillId ? { ...s, enabled } : s))
        );
      }
    } catch (err) {
      console.error('Failed to toggle skill:', err);
    }
  };

  const handleToggleMCPServer = async (serverId: string, enabled: boolean) => {
    try {
      const response = await fetch(
        `${config.apiUrl}/admin/capabilities/mcp-servers/${serverId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          credentials: 'include',
          body: JSON.stringify({ enabled }),
        }
      );
      if (response.ok) {
        setMcpServers(
          mcpServers.map((s) =>
            s.serverId === serverId ? { ...s, enabled } : s
          )
        );
      }
    } catch (err) {
      console.error('Failed to toggle MCP server:', err);
    }
  };

  const handleConnectMCPServer = async (serverId: string) => {
    try {
      const response = await fetch(
        `${config.apiUrl}/admin/capabilities/mcp-servers/${serverId}/connect`,
        {
          method: 'POST',
          headers: { ...getAuthHeader() },
          credentials: 'include',
        }
      );
      if (response.ok) {
        await loadMCPServers();
      }
    } catch (err) {
      console.error('Failed to connect MCP server:', err);
    }
  };

  const handleDisconnectMCPServer = async (serverId: string) => {
    try {
      const response = await fetch(
        `${config.apiUrl}/admin/capabilities/mcp-servers/${serverId}/disconnect`,
        {
          method: 'POST',
          headers: { ...getAuthHeader() },
          credentials: 'include',
        }
      );
      if (response.ok) {
        await loadMCPServers();
      }
    } catch (err) {
      console.error('Failed to disconnect MCP server:', err);
    }
  };

  const handleAddMCPServer = async (preset: (typeof PRESET_MCP_SERVERS)[0]) => {
    try {
      const response = await fetch(
        `${config.apiUrl}/admin/capabilities/mcp-servers`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          credentials: 'include',
          body: JSON.stringify({
            serverId: preset.serverId,
            name: preset.name,
            description: preset.description,
            transport: preset.transport,
            command: preset.command,
            args: preset.args,
            enabled: true,
            autoConnect: true,
          }),
        }
      );
      if (response.ok) {
        await loadMCPServers();
        setShowAddMCP(false);
      }
    } catch (err) {
      console.error('Failed to add MCP server:', err);
    }
  };

  const handleDeleteMCPServer = async (serverId: string) => {
    if (!confirm('确定要删除这个 MCP 服务器吗？')) return;
    try {
      const response = await fetch(
        `${config.apiUrl}/admin/capabilities/mcp-servers/${serverId}`,
        {
          method: 'DELETE',
          headers: { ...getAuthHeader() },
          credentials: 'include',
        }
      );
      if (response.ok) {
        setMcpServers(mcpServers.filter((s) => s.serverId !== serverId));
      }
    } catch (err) {
      console.error('Failed to delete MCP server:', err);
    }
  };

  // Filter tools and skills
  const filteredTools = tools.filter((tool) => {
    const matchesCategory =
      toolCategory === 'all' || tool.category === toolCategory;
    const matchesSearch =
      !toolSearch ||
      tool.name.toLowerCase().includes(toolSearch.toLowerCase()) ||
      tool.description.toLowerCase().includes(toolSearch.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const filteredSkills = skills.filter((skill) => {
    const matchesLayer = skillLayer === 'all' || skill.layer === skillLayer;
    const matchesSearch =
      !skillSearch ||
      skill.name.toLowerCase().includes(skillSearch.toLowerCase()) ||
      skill.description.toLowerCase().includes(skillSearch.toLowerCase());
    return matchesLayer && matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              AI Agent 能力管理
            </h2>
            <p className="text-sm text-gray-500">
              配置 Tools、Skills 和 MCP 服务器
            </p>
          </div>
          <button
            onClick={loadData}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            刷新
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-lg bg-red-50 p-4 text-red-700">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="flex gap-6">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 border-b-2 pb-3 pt-1 text-sm font-medium transition-colors ${
                    isActive
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.name}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'tools' && (
          <ToolsTab
            tools={filteredTools}
            stats={toolStats}
            category={toolCategory}
            search={toolSearch}
            onCategoryChange={setToolCategory}
            onSearchChange={setToolSearch}
            onToggle={handleToggleTool}
          />
        )}

        {activeTab === 'skills' && (
          <SkillsTab
            skills={filteredSkills}
            stats={skillStats}
            layer={skillLayer}
            search={skillSearch}
            onLayerChange={setSkillLayer}
            onSearchChange={setSkillSearch}
            onToggle={handleToggleSkill}
          />
        )}

        {activeTab === 'mcp' && (
          <MCPTab
            servers={mcpServers}
            showAdd={showAddMCP}
            onShowAddChange={setShowAddMCP}
            onToggle={handleToggleMCPServer}
            onConnect={handleConnectMCPServer}
            onDisconnect={handleDisconnectMCPServer}
            onAdd={handleAddMCPServer}
            onDelete={handleDeleteMCPServer}
          />
        )}
      </div>
    </div>
  );
}

// ==================== Tools Tab ====================

function ToolsTab({
  tools,
  stats,
  category,
  search,
  onCategoryChange,
  onSearchChange,
  onToggle,
}: {
  tools: ToolConfig[];
  stats: ToolStats | null;
  category: string;
  search: string;
  onCategoryChange: (category: string) => void;
  onSearchChange: (search: string) => void;
  onToggle: (toolId: string, enabled: boolean) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            title="总工具数"
            value={stats.total}
            icon={Wrench}
            color="gray"
          />
          <StatCard
            title="已启用"
            value={stats.enabled}
            icon={CheckCircle}
            color="green"
          />
          <StatCard
            title="已实现"
            value={stats.implemented}
            icon={Play}
            color="blue"
          />
          <StatCard
            title="待实现"
            value={stats.total - stats.implemented}
            icon={AlertCircle}
            color="amber"
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4">
        {/* Category Filter */}
        <div className="flex flex-wrap gap-2">
          {TOOL_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => onCategoryChange(cat.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                category === cat.id
                  ? 'bg-blue-600 text-white'
                  : cat.color + ' hover:opacity-80'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative ml-auto">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索工具..."
            className="w-64 rounded-lg border border-gray-300 py-1.5 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Tools Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => (
          <ToolCard key={tool.toolId} tool={tool} onToggle={onToggle} />
        ))}
      </div>

      {tools.length === 0 && (
        <div className="py-12 text-center text-gray-500">暂无匹配的工具</div>
      )}
    </div>
  );
}

function ToolCard({
  tool,
  onToggle,
}: {
  tool: ToolConfig;
  onToggle: (toolId: string, enabled: boolean) => void;
}) {
  const categoryInfo =
    TOOL_CATEGORIES.find((c) => c.id === tool.category) || TOOL_CATEGORIES[0];

  return (
    <div
      className={`rounded-xl border bg-white p-5 shadow-sm transition-all ${
        tool.enabled ? 'border-gray-200' : 'border-gray-100 opacity-60'
      }`}
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="font-medium text-gray-900">
            {tool.displayName || tool.name}
          </h3>
          <span
            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${categoryInfo.color}`}
          >
            {categoryInfo.name}
          </span>
        </div>
        <button
          onClick={() => onToggle(tool.toolId, !tool.enabled)}
          className={`relative h-6 w-11 rounded-full transition-colors ${
            tool.enabled ? 'bg-green-500' : 'bg-gray-300'
          }`}
        >
          <div
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
              tool.enabled ? 'left-[22px]' : 'left-0.5'
            }`}
          />
        </button>
      </div>

      {/* Description */}
      <p className="mb-3 line-clamp-2 text-sm text-gray-600">
        {tool.description}
      </p>

      {/* Status Badges */}
      <div className="flex items-center gap-2">
        {tool.implemented ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            <CheckCircle className="h-3 w-3" />
            已实现
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            <AlertCircle className="h-3 w-3" />
            仅定义
          </span>
        )}
        {tool.tags.slice(0, 2).map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

// ==================== Skills Tab ====================

function SkillsTab({
  skills,
  stats,
  layer,
  search,
  onLayerChange,
  onSearchChange,
  onToggle,
}: {
  skills: SkillConfig[];
  stats: SkillStats | null;
  layer: string;
  search: string;
  onLayerChange: (layer: string) => void;
  onSearchChange: (search: string) => void;
  onToggle: (skillId: string, enabled: boolean) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            title="总技能数"
            value={stats.total}
            icon={Sparkles}
            color="gray"
          />
          <StatCard
            title="已启用"
            value={stats.enabled}
            icon={CheckCircle}
            color="green"
          />
          <StatCard
            title="领域数"
            value={Object.keys(stats.byDomain || {}).length}
            icon={Settings}
            color="purple"
          />
          <StatCard
            title="层次数"
            value={Object.keys(stats.byLayer || {}).length}
            icon={Wrench}
            color="blue"
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4">
        {/* Layer Filter */}
        <div className="flex flex-wrap gap-2">
          {SKILL_LAYERS.map((l) => (
            <button
              key={l.id}
              onClick={() => onLayerChange(l.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                layer === l.id
                  ? 'bg-blue-600 text-white'
                  : l.color + ' hover:opacity-80'
              }`}
            >
              {l.name}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative ml-auto">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索技能..."
            className="w-64 rounded-lg border border-gray-300 py-1.5 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Skills Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {skills.map((skill) => (
          <SkillCard key={skill.skillId} skill={skill} onToggle={onToggle} />
        ))}
      </div>

      {skills.length === 0 && (
        <div className="py-12 text-center text-gray-500">暂无匹配的技能</div>
      )}
    </div>
  );
}

function SkillCard({
  skill,
  onToggle,
}: {
  skill: SkillConfig;
  onToggle: (skillId: string, enabled: boolean) => void;
}) {
  const layerInfo =
    SKILL_LAYERS.find((l) => l.id === skill.layer) || SKILL_LAYERS[0];
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`rounded-xl border bg-white p-5 shadow-sm transition-all ${
        skill.enabled ? 'border-gray-200' : 'border-gray-100 opacity-60'
      }`}
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="font-medium text-gray-900">
            {skill.displayName || skill.name}
          </h3>
          <div className="mt-1 flex gap-2">
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${layerInfo.color}`}
            >
              {layerInfo.name}
            </span>
            {skill.domain && (
              <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                {skill.domain}
              </span>
            )}
          </div>
        </div>
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

      {/* Description */}
      <p className="mb-3 line-clamp-2 text-sm text-gray-600">
        {skill.description}
      </p>

      {/* Dependencies */}
      {(skill.requiredTools.length > 0 || skill.requiredSkills.length > 0) && (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            依赖项
          </button>
          {expanded && (
            <div className="mt-2 space-y-1 text-xs">
              {skill.requiredTools.length > 0 && (
                <div>
                  <span className="text-gray-500">Tools: </span>
                  <span className="text-gray-700">
                    {skill.requiredTools.join(', ')}
                  </span>
                </div>
              )}
              {skill.requiredSkills.length > 0 && (
                <div>
                  <span className="text-gray-500">Skills: </span>
                  <span className="text-gray-700">
                    {skill.requiredSkills.join(', ')}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== MCP Tab ====================

function MCPTab({
  servers,
  showAdd,
  onShowAddChange,
  onToggle,
  onConnect,
  onDisconnect,
  onAdd,
  onDelete,
}: {
  servers: MCPServerConfig[];
  showAdd: boolean;
  onShowAddChange: (show: boolean) => void;
  onToggle: (serverId: string, enabled: boolean) => void;
  onConnect: (serverId: string) => void;
  onDisconnect: (serverId: string) => void;
  onAdd: (preset: (typeof PRESET_MCP_SERVERS)[0]) => void;
  onDelete: (serverId: string) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Add Server Card */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">添加 MCP 服务器</h3>
            <p className="text-sm text-gray-500">选择预设服务器或自定义配置</p>
          </div>
          <button
            onClick={() => onShowAddChange(!showAdd)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            添加服务器
          </button>
        </div>

        {showAdd && (
          <div className="mt-4 border-t border-gray-200 pt-4">
            <h4 className="mb-3 text-sm font-medium text-gray-700">
              预设服务器
            </h4>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {PRESET_MCP_SERVERS.map((preset) => {
                const isAdded = servers.some(
                  (s) => s.serverId === preset.serverId
                );
                return (
                  <button
                    key={preset.serverId}
                    onClick={() => !isAdded && onAdd(preset)}
                    disabled={isAdded}
                    className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-colors ${
                      isAdded
                        ? 'cursor-not-allowed border-gray-100 bg-gray-50 opacity-60'
                        : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50'
                    }`}
                  >
                    <span className="text-2xl">{preset.icon}</span>
                    <div>
                      <div className="font-medium text-gray-900">
                        {preset.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {preset.description}
                      </div>
                      {isAdded && (
                        <span className="mt-1 inline-block text-xs text-green-600">
                          已添加
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Server List */}
      <div className="space-y-4">
        <h3 className="font-semibold text-gray-900">
          已配置服务器 ({servers.length})
        </h3>

        {servers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 py-12 text-center">
            <Server className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-gray-500">暂无 MCP 服务器</p>
            <p className="text-sm text-gray-400">点击上方按钮添加服务器</p>
          </div>
        ) : (
          servers.map((server) => (
            <MCPServerCard
              key={server.serverId}
              server={server}
              onToggle={onToggle}
              onConnect={onConnect}
              onDisconnect={onDisconnect}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}

function MCPServerCard({
  server,
  onToggle,
  onConnect,
  onDisconnect,
  onDelete,
}: {
  server: MCPServerConfig;
  onToggle: (serverId: string, enabled: boolean) => void;
  onConnect: (serverId: string) => void;
  onDisconnect: (serverId: string) => void;
  onDelete: (serverId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const preset = PRESET_MCP_SERVERS.find((p) => p.serverId === server.serverId);

  return (
    <div
      className={`rounded-xl border bg-white shadow-sm transition-all ${
        server.enabled ? 'border-gray-200' : 'border-gray-100 opacity-60'
      }`}
    >
      <div className="flex items-center gap-4 p-5">
        {/* Icon */}
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-2xl">
          {preset?.icon || '🔌'}
        </div>

        {/* Info */}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-gray-900">{server.name}</h3>
            {server.connected ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                已连接
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                未连接
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">{server.description}</p>
          <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
            <span>Transport: {server.transport}</span>
            {server.tools.length > 0 && (
              <span>工具: {server.tools.length}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {server.connected ? (
            <button
              onClick={() => onDisconnect(server.serverId)}
              className="flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-sm font-medium text-orange-700 hover:bg-orange-100"
            >
              <PowerOff className="h-4 w-4" />
              断开
            </button>
          ) : (
            <button
              onClick={() => onConnect(server.serverId)}
              disabled={!server.enabled}
              className="flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
            >
              <Power className="h-4 w-4" />
              连接
            </button>
          )}

          <button
            onClick={() => onToggle(server.serverId, !server.enabled)}
            className={`relative h-6 w-11 rounded-full transition-colors ${
              server.enabled ? 'bg-green-500' : 'bg-gray-300'
            }`}
          >
            <div
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                server.enabled ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>

          <button
            onClick={() => onDelete(server.serverId)}
            className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tools Preview */}
      {server.tools.length > 0 && (
        <div className="border-t border-gray-100 px-5 py-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex w-full items-center justify-between text-sm text-gray-600"
          >
            <span>可用工具 ({server.tools.length})</span>
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>

          {expanded && (
            <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {server.tools.map((tool) => (
                <div key={tool.name} className="rounded-lg bg-gray-50 p-3">
                  <div className="font-medium text-gray-900">{tool.name}</div>
                  <div className="text-xs text-gray-500">
                    {tool.description}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== Shared Components ====================

function StatCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: 'gray' | 'green' | 'blue' | 'amber' | 'purple';
}) {
  const colorClasses = {
    gray: 'bg-gray-50 text-gray-600',
    green: 'bg-green-50 text-green-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-semibold text-gray-900">{value}</p>
        </div>
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg ${colorClasses[color]}`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
