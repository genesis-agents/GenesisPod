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
  Edit3,
  X,
  Save,
  Eye,
  EyeOff,
  Zap,
  Globe,
  Code,
  Database,
  FileText,
  Image,
  MessageSquare,
  Share2,
  Download,
  Users,
  Brain,
  Layers,
  Target,
  Lightbulb,
  Compass,
  Palette,
  FileCode,
  CheckSquare,
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
  requiresAuth?: boolean;
  allowedRoles?: string[];
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
  apiKey?: string;
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

// ==================== Tool Categories with Colors ====================

const TOOL_CATEGORIES = [
  {
    id: 'all',
    name: '全部',
    color: 'bg-gray-100 text-gray-700',
    gradient: 'from-gray-500 to-slate-500',
    icon: Wrench,
  },
  {
    id: 'information',
    name: '信息获取',
    color: 'bg-blue-100 text-blue-700',
    gradient: 'from-blue-500 to-cyan-500',
    icon: Search,
  },
  {
    id: 'content',
    name: '内容生成',
    color: 'bg-green-100 text-green-700',
    gradient: 'from-green-500 to-emerald-500',
    icon: FileText,
  },
  {
    id: 'data',
    name: '数据处理',
    color: 'bg-orange-100 text-orange-700',
    gradient: 'from-orange-500 to-amber-500',
    icon: Database,
  },
  {
    id: 'code',
    name: '代码执行',
    color: 'bg-purple-100 text-purple-700',
    gradient: 'from-purple-500 to-violet-500',
    icon: Code,
  },
  {
    id: 'integration',
    name: '外部集成',
    color: 'bg-pink-100 text-pink-700',
    gradient: 'from-pink-500 to-rose-500',
    icon: Globe,
  },
  {
    id: 'memory',
    name: '记忆管理',
    color: 'bg-indigo-100 text-indigo-700',
    gradient: 'from-indigo-500 to-blue-500',
    icon: Brain,
  },
  {
    id: 'export',
    name: '导出',
    color: 'bg-cyan-100 text-cyan-700',
    gradient: 'from-cyan-500 to-teal-500',
    icon: Download,
  },
  {
    id: 'collaboration',
    name: '协作',
    color: 'bg-amber-100 text-amber-700',
    gradient: 'from-amber-500 to-yellow-500',
    icon: Users,
  },
];

// ==================== Skill Layers with Colors ====================

const SKILL_LAYERS = [
  {
    id: 'all',
    name: '全部',
    color: 'bg-gray-100 text-gray-700',
    gradient: 'from-gray-500 to-slate-500',
    icon: Layers,
  },
  {
    id: 'understanding',
    name: '理解层',
    color: 'bg-blue-100 text-blue-700',
    gradient: 'from-blue-500 to-indigo-500',
    icon: Compass,
  },
  {
    id: 'planning',
    name: '规划层',
    color: 'bg-green-100 text-green-700',
    gradient: 'from-green-500 to-teal-500',
    icon: Target,
  },
  {
    id: 'design',
    name: '设计层',
    color: 'bg-purple-100 text-purple-700',
    gradient: 'from-purple-500 to-pink-500',
    icon: Palette,
  },
  {
    id: 'content',
    name: '内容层',
    color: 'bg-orange-100 text-orange-700',
    gradient: 'from-orange-500 to-red-500',
    icon: FileCode,
  },
  {
    id: 'rendering',
    name: '渲染层',
    color: 'bg-pink-100 text-pink-700',
    gradient: 'from-pink-500 to-rose-500',
    icon: Image,
  },
  {
    id: 'optimization',
    name: '优化层',
    color: 'bg-indigo-100 text-indigo-700',
    gradient: 'from-indigo-500 to-violet-500',
    icon: Lightbulb,
  },
  {
    id: 'quality',
    name: '质量层',
    color: 'bg-cyan-100 text-cyan-700',
    gradient: 'from-cyan-500 to-blue-500',
    icon: CheckSquare,
  },
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
    color: 'from-orange-500 to-yellow-500',
    features: ['免费使用', '无需API Key', '隐私保护'],
  },
  {
    serverId: 'filesystem',
    name: 'File System',
    description: '本地文件系统访问',
    transport: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-filesystem', '/tmp'],
    icon: '📁',
    color: 'from-blue-500 to-cyan-500',
    features: ['文件读写', '目录管理', '本地存储'],
  },
  {
    serverId: 'github',
    name: 'GitHub',
    description: 'GitHub API 访问（需要 Token）',
    transport: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-github'],
    icon: '🐙',
    color: 'from-gray-700 to-gray-900',
    requiresApiKey: true,
    features: ['代码仓库', 'Issues管理', 'PR操作'],
  },
  {
    serverId: 'slack',
    name: 'Slack',
    description: 'Slack 消息和频道管理',
    transport: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-slack'],
    icon: '💬',
    color: 'from-purple-500 to-pink-500',
    requiresApiKey: true,
    features: ['消息发送', '频道管理', '用户查询'],
  },
  {
    serverId: 'brave-search',
    name: 'Brave Search',
    description: 'Brave 隐私搜索引擎',
    transport: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-brave-search'],
    icon: '🦁',
    color: 'from-orange-600 to-red-500',
    requiresApiKey: true,
    features: ['隐私搜索', '无追踪', 'Web结果'],
  },
  {
    serverId: 'puppeteer',
    name: 'Puppeteer',
    description: '浏览器自动化工具',
    transport: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-puppeteer'],
    icon: '🎭',
    color: 'from-green-500 to-teal-500',
    features: ['网页截图', '表单填写', 'JS执行'],
  },
];

// ==================== Main Component ====================

export default function AICapabilitiesSettings() {
  const [activeTab, setActiveTab] = useState<TabType>('tools');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Tools state
  const [tools, setTools] = useState<ToolConfig[]>([]);
  const [toolStats, setToolStats] = useState<ToolStats | null>(null);
  const [toolCategory, setToolCategory] = useState('all');
  const [toolSearch, setToolSearch] = useState('');
  const [editingTool, setEditingTool] = useState<ToolConfig | null>(null);

  // Skills state
  const [skills, setSkills] = useState<SkillConfig[]>([]);
  const [skillStats, setSkillStats] = useState<SkillStats | null>(null);
  const [skillLayer, setSkillLayer] = useState('all');
  const [skillSearch, setSkillSearch] = useState('');
  const [editingSkill, setEditingSkill] = useState<SkillConfig | null>(null);

  // MCP state
  const [mcpServers, setMcpServers] = useState<MCPServerConfig[]>([]);
  const [showAddMCP, setShowAddMCP] = useState(false);
  const [editingMCP, setEditingMCP] = useState<MCPServerConfig | null>(null);

  // Test state
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, { success: boolean; message: string }>
  >({});

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

  // Show message helper
  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

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
        showMessage('success', `工具已${enabled ? '启用' : '禁用'}`);
      }
    } catch (err) {
      console.error('Failed to toggle tool:', err);
      showMessage('error', '操作失败');
    }
  };

  const handleSaveTool = async (tool: ToolConfig) => {
    try {
      const response = await fetch(
        `${config.apiUrl}/admin/capabilities/tools/${tool.toolId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          credentials: 'include',
          body: JSON.stringify({
            enabled: tool.enabled,
            displayName: tool.displayName,
            description: tool.description,
            config: tool.config,
            tags: tool.tags,
          }),
        }
      );
      if (response.ok) {
        setTools(tools.map((t) => (t.toolId === tool.toolId ? tool : t)));
        setEditingTool(null);
        showMessage('success', '工具配置已保存');
      }
    } catch (err) {
      console.error('Failed to save tool:', err);
      showMessage('error', '保存失败');
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
        showMessage('success', `技能已${enabled ? '启用' : '禁用'}`);
      }
    } catch (err) {
      console.error('Failed to toggle skill:', err);
      showMessage('error', '操作失败');
    }
  };

  const handleSaveSkill = async (skill: SkillConfig) => {
    try {
      const response = await fetch(
        `${config.apiUrl}/admin/capabilities/skills/${skill.skillId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          credentials: 'include',
          body: JSON.stringify({
            enabled: skill.enabled,
            displayName: skill.displayName,
            description: skill.description,
            config: skill.config,
            tags: skill.tags,
          }),
        }
      );
      if (response.ok) {
        setSkills(skills.map((s) => (s.skillId === skill.skillId ? skill : s)));
        setEditingSkill(null);
        showMessage('success', '技能配置已保存');
      }
    } catch (err) {
      console.error('Failed to save skill:', err);
      showMessage('error', '保存失败');
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
        showMessage('success', `MCP 服务器已${enabled ? '启用' : '禁用'}`);
      }
    } catch (err) {
      console.error('Failed to toggle MCP server:', err);
      showMessage('error', '操作失败');
    }
  };

  const handleSaveMCPServer = async (server: MCPServerConfig) => {
    try {
      const response = await fetch(
        `${config.apiUrl}/admin/capabilities/mcp-servers/${server.serverId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          credentials: 'include',
          body: JSON.stringify({
            name: server.name,
            description: server.description,
            enabled: server.enabled,
            autoConnect: server.autoConnect,
            apiKey: server.apiKey,
          }),
        }
      );
      if (response.ok) {
        setMcpServers(
          mcpServers.map((s) => (s.serverId === server.serverId ? server : s))
        );
        setEditingMCP(null);
        showMessage('success', 'MCP 服务器配置已保存');
      }
    } catch (err) {
      console.error('Failed to save MCP server:', err);
      showMessage('error', '保存失败');
    }
  };

  const handleConnectMCPServer = async (serverId: string) => {
    setTesting(`mcp-connect-${serverId}`);
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
        setTestResults((prev) => ({
          ...prev,
          [`mcp-${serverId}`]: { success: true, message: '连接成功' },
        }));
        showMessage('success', 'MCP 服务器已连接');
      } else {
        const data = await response.json().catch(() => ({}));
        setTestResults((prev) => ({
          ...prev,
          [`mcp-${serverId}`]: {
            success: false,
            message: data.message || '连接失败',
          },
        }));
      }
    } catch (err) {
      console.error('Failed to connect MCP server:', err);
      setTestResults((prev) => ({
        ...prev,
        [`mcp-${serverId}`]: { success: false, message: '连接失败' },
      }));
    } finally {
      setTesting(null);
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
        showMessage('success', 'MCP 服务器已断开');
      }
    } catch (err) {
      console.error('Failed to disconnect MCP server:', err);
      showMessage('error', '断开连接失败');
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
        showMessage('success', 'MCP 服务器已添加');
      }
    } catch (err) {
      console.error('Failed to add MCP server:', err);
      showMessage('error', '添加失败');
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
        showMessage('success', 'MCP 服务器已删除');
      }
    } catch (err) {
      console.error('Failed to delete MCP server:', err);
      showMessage('error', '删除失败');
    }
  };

  // Test tool
  const handleTestTool = async (toolId: string) => {
    setTesting(`tool-${toolId}`);
    setTestResults((prev) => {
      const newResults = { ...prev };
      delete newResults[`tool-${toolId}`];
      return newResults;
    });

    try {
      const response = await fetch(
        `${config.apiUrl}/admin/capabilities/tools/${toolId}/test`,
        {
          method: 'POST',
          headers: { ...getAuthHeader() },
          credentials: 'include',
        }
      );
      const data = await response.json();
      setTestResults((prev) => ({
        ...prev,
        [`tool-${toolId}`]: {
          success: data.success || response.ok,
          message: data.message || (response.ok ? '测试成功' : '测试失败'),
        },
      }));
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [`tool-${toolId}`]: {
          success: false,
          message: err.message || '测试失败',
        },
      }));
    } finally {
      setTesting(null);
    }
  };

  // Filter tools and skills
  const filteredTools = tools.filter((tool) => {
    const matchesCategory =
      toolCategory === 'all' || tool.category === toolCategory;
    const matchesSearch =
      !toolSearch ||
      (tool.name || '').toLowerCase().includes(toolSearch.toLowerCase()) ||
      (tool.description || '').toLowerCase().includes(toolSearch.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const filteredSkills = skills.filter((skill) => {
    const matchesLayer = skillLayer === 'all' || skill.layer === skillLayer;
    const matchesSearch =
      !skillSearch ||
      (skill.name || '').toLowerCase().includes(skillSearch.toLowerCase()) ||
      (skill.description || '')
        .toLowerCase()
        .includes(skillSearch.toLowerCase());
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

        {/* Message Alert */}
        {message && (
          <div
            className={`mb-6 flex items-center gap-2 rounded-lg p-4 ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-700'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle className="h-5 w-5" />
            ) : (
              <AlertCircle className="h-5 w-5" />
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
            onEdit={setEditingTool}
            onTest={handleTestTool}
            testing={testing}
            testResults={testResults}
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
            onEdit={setEditingSkill}
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
            onEdit={setEditingMCP}
            testing={testing}
            testResults={testResults}
          />
        )}

        {/* Edit Tool Dialog */}
        {editingTool && (
          <EditToolDialog
            tool={editingTool}
            onSave={handleSaveTool}
            onClose={() => setEditingTool(null)}
          />
        )}

        {/* Edit Skill Dialog */}
        {editingSkill && (
          <EditSkillDialog
            skill={editingSkill}
            onSave={handleSaveSkill}
            onClose={() => setEditingSkill(null)}
          />
        )}

        {/* Edit MCP Dialog */}
        {editingMCP && (
          <EditMCPDialog
            server={editingMCP}
            onSave={handleSaveMCPServer}
            onClose={() => setEditingMCP(null)}
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
  onEdit,
  onTest,
  testing,
  testResults,
}: {
  tools: ToolConfig[];
  stats: ToolStats | null;
  category: string;
  search: string;
  onCategoryChange: (category: string) => void;
  onSearchChange: (search: string) => void;
  onToggle: (toolId: string, enabled: boolean) => void;
  onEdit: (tool: ToolConfig) => void;
  onTest: (toolId: string) => void;
  testing: string | null;
  testResults: Record<string, { success: boolean; message: string }>;
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
          <ToolCard
            key={tool.toolId}
            tool={tool}
            onToggle={onToggle}
            onEdit={onEdit}
            onTest={onTest}
            testing={testing}
            testResult={testResults[`tool-${tool.toolId}`]}
          />
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
  onEdit,
  onTest,
  testing,
  testResult,
}: {
  tool: ToolConfig;
  onToggle: (toolId: string, enabled: boolean) => void;
  onEdit: (tool: ToolConfig) => void;
  onTest: (toolId: string) => void;
  testing: string | null;
  testResult?: { success: boolean; message: string };
}) {
  const categoryInfo =
    TOOL_CATEGORIES.find((c) => c.id === tool.category) || TOOL_CATEGORIES[0];
  const CategoryIcon = categoryInfo.icon;
  const isTesting = testing === `tool-${tool.toolId}`;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border-2 bg-white shadow-sm transition-all hover:shadow-md ${
        tool.enabled ? 'border-gray-200' : 'border-gray-100 opacity-70'
      }`}
    >
      {/* Gradient Header */}
      <div className={`bg-gradient-to-r ${categoryInfo.gradient} p-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 backdrop-blur">
              <CategoryIcon className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-white">
                {tool.displayName || tool.name}
              </h3>
              <p className="text-xs text-white/80">{categoryInfo.name}</p>
            </div>
          </div>
          <button
            onClick={() => onEdit(tool)}
            className="rounded-lg bg-white/20 p-2 text-white hover:bg-white/30"
            title="编辑配置"
          >
            <Edit3 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="space-y-3 p-4">
        {/* Description */}
        <p className="line-clamp-2 text-sm text-gray-600">{tool.description}</p>

        {/* Status & Tags */}
        <div className="flex flex-wrap items-center gap-2">
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

        {/* Test Result */}
        {testResult && (
          <div
            className={`flex items-center gap-2 rounded-lg p-2 text-sm ${
              testResult.success
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-700'
            }`}
          >
            {testResult.success ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            <span className="truncate">{testResult.message}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-gray-100 pt-2">
          <button
            onClick={() => onTest(tool.toolId)}
            disabled={isTesting || !tool.implemented}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {isTesting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            测试
          </button>
          <button
            onClick={() => onToggle(tool.toolId, !tool.enabled)}
            className={`relative h-6 w-11 rounded-full transition-colors ${tool.enabled ? 'bg-green-500' : 'bg-gray-300'}`}
          >
            <div
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                tool.enabled ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>
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
  onEdit,
}: {
  skills: SkillConfig[];
  stats: SkillStats | null;
  layer: string;
  search: string;
  onLayerChange: (layer: string) => void;
  onSearchChange: (search: string) => void;
  onToggle: (skillId: string, enabled: boolean) => void;
  onEdit: (skill: SkillConfig) => void;
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
            icon={Layers}
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
          <SkillCard
            key={skill.skillId}
            skill={skill}
            onToggle={onToggle}
            onEdit={onEdit}
          />
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
  onEdit,
}: {
  skill: SkillConfig;
  onToggle: (skillId: string, enabled: boolean) => void;
  onEdit: (skill: SkillConfig) => void;
}) {
  const layerInfo =
    SKILL_LAYERS.find((l) => l.id === skill.layer) || SKILL_LAYERS[0];
  const LayerIcon = layerInfo.icon;
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`relative overflow-hidden rounded-xl border-2 bg-white shadow-sm transition-all hover:shadow-md ${
        skill.enabled ? 'border-gray-200' : 'border-gray-100 opacity-70'
      }`}
    >
      {/* Gradient Header */}
      <div className={`bg-gradient-to-r ${layerInfo.gradient} p-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 backdrop-blur">
              <LayerIcon className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-white">
                {skill.displayName || skill.name}
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/80">{layerInfo.name}</span>
                {skill.domain && (
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs text-white">
                    {skill.domain}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={() => onEdit(skill)}
            className="rounded-lg bg-white/20 p-2 text-white hover:bg-white/30"
            title="编辑配置"
          >
            <Edit3 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="space-y-3 p-4">
        {/* Description */}
        <p className="line-clamp-2 text-sm text-gray-600">
          {skill.description}
        </p>

        {/* Tags */}
        {skill.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {skill.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${layerInfo.color}`}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Dependencies */}
        {(skill.requiredTools.length > 0 ||
          skill.requiredSkills.length > 0) && (
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
              依赖项 ({skill.requiredTools.length + skill.requiredSkills.length}
              )
            </button>
            {expanded && (
              <div className="mt-2 space-y-1 rounded-lg bg-gray-50 p-2 text-xs">
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

        {/* Actions */}
        <div className="flex items-center justify-end border-t border-gray-100 pt-2">
          <button
            onClick={() => onToggle(skill.skillId, !skill.enabled)}
            className={`relative h-6 w-11 rounded-full transition-colors ${skill.enabled ? 'bg-green-500' : 'bg-gray-300'}`}
          >
            <div
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                skill.enabled ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>
      </div>
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
  onEdit,
  testing,
  testResults,
}: {
  servers: MCPServerConfig[];
  showAdd: boolean;
  onShowAddChange: (show: boolean) => void;
  onToggle: (serverId: string, enabled: boolean) => void;
  onConnect: (serverId: string) => void;
  onDisconnect: (serverId: string) => void;
  onAdd: (preset: (typeof PRESET_MCP_SERVERS)[0]) => void;
  onDelete: (serverId: string) => void;
  onEdit: (server: MCPServerConfig) => void;
  testing: string | null;
  testResults: Record<string, { success: boolean; message: string }>;
}) {
  return (
    <div className="space-y-6">
      {/* Add Server Section */}
      <div className="rounded-xl border border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 shadow-lg">
              <Server className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">MCP 服务器</h3>
              <p className="text-sm text-gray-600">添加外部工具能力扩展</p>
            </div>
          </div>
          <button
            onClick={() => onShowAddChange(!showAdd)}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
          >
            <Plus className="h-4 w-4" />
            添加服务器
          </button>
        </div>

        {showAdd && (
          <div className="mt-4 border-t border-purple-200 pt-4">
            <h4 className="mb-3 text-sm font-medium text-gray-700">
              预设服务器
            </h4>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {PRESET_MCP_SERVERS.map((preset) => {
                const isAdded = servers.some(
                  (s) => s.serverId === preset.serverId
                );
                return (
                  <div
                    key={preset.serverId}
                    className={`relative overflow-hidden rounded-xl border-2 transition-all ${
                      isAdded
                        ? 'cursor-not-allowed border-gray-100 opacity-60'
                        : 'border-gray-200 hover:border-purple-300 hover:shadow-md'
                    }`}
                  >
                    <div className={`bg-gradient-to-r ${preset.color} p-3`}>
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{preset.icon}</span>
                        <div>
                          <h4 className="font-bold text-white">
                            {preset.name}
                          </h4>
                          <p className="text-xs text-white/80">
                            {preset.description}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2 p-3">
                      <div className="flex flex-wrap gap-1">
                        {preset.features.map((f) => (
                          <span
                            key={f}
                            className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                      {preset.requiresApiKey && (
                        <div className="flex items-center gap-1 text-xs text-amber-600">
                          <AlertCircle className="h-3 w-3" />
                          需要 API Key
                        </div>
                      )}
                      <button
                        onClick={() => !isAdded && onAdd(preset)}
                        disabled={isAdded}
                        className={`w-full rounded-lg px-3 py-2 text-sm font-medium ${
                          isAdded
                            ? 'bg-gray-100 text-gray-400'
                            : 'bg-purple-600 text-white hover:bg-purple-700'
                        }`}
                      >
                        {isAdded ? '已添加' : '添加'}
                      </button>
                    </div>
                  </div>
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
          <div className="grid gap-4 md:grid-cols-2">
            {servers.map((server) => (
              <MCPServerCard
                key={server.serverId}
                server={server}
                onToggle={onToggle}
                onConnect={onConnect}
                onDisconnect={onDisconnect}
                onDelete={onDelete}
                onEdit={onEdit}
                testing={testing}
                testResult={testResults[`mcp-${server.serverId}`]}
              />
            ))}
          </div>
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
  onEdit,
  testing,
  testResult,
}: {
  server: MCPServerConfig;
  onToggle: (serverId: string, enabled: boolean) => void;
  onConnect: (serverId: string) => void;
  onDisconnect: (serverId: string) => void;
  onDelete: (serverId: string) => void;
  onEdit: (server: MCPServerConfig) => void;
  testing: string | null;
  testResult?: { success: boolean; message: string };
}) {
  const [expanded, setExpanded] = useState(false);
  const preset = PRESET_MCP_SERVERS.find((p) => p.serverId === server.serverId);
  const isConnecting = testing === `mcp-connect-${server.serverId}`;

  return (
    <div
      className={`rounded-xl border-2 bg-white shadow-sm transition-all ${
        server.enabled ? 'border-gray-200' : 'border-gray-100 opacity-70'
      }`}
    >
      {/* Header */}
      <div
        className={`bg-gradient-to-r ${preset?.color || 'from-gray-500 to-slate-500'} p-4`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{preset?.icon || '🔌'}</span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white">{server.name}</h3>
                {server.connected ? (
                  <span className="flex items-center gap-1 rounded-full bg-white/30 px-2 py-0.5 text-xs font-medium text-white">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
                    已连接
                  </span>
                ) : (
                  <span className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium text-white/70">
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                    未连接
                  </span>
                )}
              </div>
              <p className="text-xs text-white/80">{server.description}</p>
            </div>
          </div>
          <button
            onClick={() => onEdit(server)}
            className="rounded-lg bg-white/20 p-2 text-white hover:bg-white/30"
            title="编辑配置"
          >
            <Edit3 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="space-y-3 p-4">
        {/* Transport Info */}
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Server className="h-3 w-3" />
            {server.transport.toUpperCase()}
          </span>
          {server.tools.length > 0 && (
            <span className="flex items-center gap-1">
              <Wrench className="h-3 w-3" />
              {server.tools.length} 工具
            </span>
          )}
        </div>

        {/* Features */}
        {preset?.features && (
          <div className="flex flex-wrap gap-1">
            {preset.features.map((f) => (
              <span
                key={f}
                className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
              >
                {f}
              </span>
            ))}
          </div>
        )}

        {/* Test Result */}
        {testResult && (
          <div
            className={`flex items-center gap-2 rounded-lg p-2 text-sm ${
              testResult.success
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-700'
            }`}
          >
            {testResult.success ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            <span className="truncate">{testResult.message}</span>
          </div>
        )}

        {/* Tools Preview */}
        {server.tools.length > 0 && (
          <div>
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
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {server.tools.map((tool) => (
                  <div key={tool.name} className="rounded-lg bg-gray-50 p-2">
                    <div className="text-xs font-medium text-gray-900">
                      {tool.name}
                    </div>
                    <div className="truncate text-xs text-gray-500">
                      {tool.description}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-gray-100 pt-2">
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
                disabled={!server.enabled || isConnecting}
                className="flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
              >
                {isConnecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Power className="h-4 w-4" />
                )}
                连接
              </button>
            )}

            <button
              onClick={() => onDelete(server.serverId)}
              className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
              title="删除"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={() => onToggle(server.serverId, !server.enabled)}
            className={`relative h-6 w-11 rounded-full transition-colors ${server.enabled ? 'bg-green-500' : 'bg-gray-300'}`}
          >
            <div
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                server.enabled ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== Edit Dialogs ====================

function EditToolDialog({
  tool,
  onSave,
  onClose,
}: {
  tool: ToolConfig;
  onSave: (tool: ToolConfig) => void;
  onClose: () => void;
}) {
  const [editedTool, setEditedTool] = useState<ToolConfig>({ ...tool });
  const [newTag, setNewTag] = useState('');
  const categoryInfo =
    TOOL_CATEGORIES.find((c) => c.id === tool.category) || TOOL_CATEGORIES[0];

  const handleAddTag = () => {
    if (newTag.trim() && !editedTool.tags.includes(newTag.trim())) {
      setEditedTool({
        ...editedTool,
        tags: [...editedTool.tags, newTag.trim()],
      });
      setNewTag('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setEditedTool({
      ...editedTool,
      tags: editedTool.tags.filter((t) => t !== tag),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div
          className={`bg-gradient-to-r ${categoryInfo.gradient} rounded-t-xl p-4`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 backdrop-blur">
                <Wrench className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-white">编辑工具配置</h3>
                <p className="text-xs text-white/80">{tool.name}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg bg-white/20 p-2 text-white hover:bg-white/30"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] space-y-4 overflow-auto p-6">
          {/* Display Name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              显示名称
            </label>
            <input
              type="text"
              value={editedTool.displayName}
              onChange={(e) =>
                setEditedTool({ ...editedTool, displayName: e.target.value })
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              描述
            </label>
            <textarea
              value={editedTool.description}
              onChange={(e) =>
                setEditedTool({ ...editedTool, description: e.target.value })
              }
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Category (read-only) */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              分类
            </label>
            <div
              className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${categoryInfo.color}`}
            >
              {categoryInfo.name}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              标签
            </label>
            <div className="mb-2 flex flex-wrap gap-2">
              {editedTool.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700"
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                placeholder="添加标签"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={handleAddTag}
                className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
              >
                添加
              </button>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
            <div>
              <div className="font-medium text-gray-900">启用状态</div>
              <div className="text-xs text-gray-500">
                控制此工具是否对 Agent 可用
              </div>
            </div>
            <button
              onClick={() =>
                setEditedTool({ ...editedTool, enabled: !editedTool.enabled })
              }
              className={`relative h-6 w-11 rounded-full transition-colors ${
                editedTool.enabled ? 'bg-green-500' : 'bg-gray-300'
              }`}
            >
              <div
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                  editedTool.enabled ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </button>
          </div>

          {/* Implementation Status */}
          <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-3">
            <div className="flex-1">
              <div className="font-medium text-gray-900">实现状态</div>
              <div className="text-xs text-gray-500">
                此工具是否已在代码中实现
              </div>
            </div>
            {editedTool.implemented ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                <CheckCircle className="h-3 w-3" />
                已实现
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                <AlertCircle className="h-3 w-3" />
                仅定义
              </span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-gray-200 p-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={() => onSave(editedTool)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Save className="h-4 w-4" />
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function EditSkillDialog({
  skill,
  onSave,
  onClose,
}: {
  skill: SkillConfig;
  onSave: (skill: SkillConfig) => void;
  onClose: () => void;
}) {
  const [editedSkill, setEditedSkill] = useState<SkillConfig>({ ...skill });
  const [newTag, setNewTag] = useState('');
  const layerInfo =
    SKILL_LAYERS.find((l) => l.id === skill.layer) || SKILL_LAYERS[0];

  const handleAddTag = () => {
    if (newTag.trim() && !editedSkill.tags.includes(newTag.trim())) {
      setEditedSkill({
        ...editedSkill,
        tags: [...editedSkill.tags, newTag.trim()],
      });
      setNewTag('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setEditedSkill({
      ...editedSkill,
      tags: editedSkill.tags.filter((t) => t !== tag),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div
          className={`bg-gradient-to-r ${layerInfo.gradient} rounded-t-xl p-4`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 backdrop-blur">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-white">编辑技能配置</h3>
                <p className="text-xs text-white/80">{skill.name}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg bg-white/20 p-2 text-white hover:bg-white/30"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] space-y-4 overflow-auto p-6">
          {/* Display Name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              显示名称
            </label>
            <input
              type="text"
              value={editedSkill.displayName}
              onChange={(e) =>
                setEditedSkill({ ...editedSkill, displayName: e.target.value })
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              描述
            </label>
            <textarea
              value={editedSkill.description}
              onChange={(e) =>
                setEditedSkill({ ...editedSkill, description: e.target.value })
              }
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Layer & Domain */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                层次
              </label>
              <div
                className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${layerInfo.color}`}
              >
                {layerInfo.name}
              </div>
            </div>
            {editedSkill.domain && (
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  领域
                </label>
                <div className="inline-block rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
                  {editedSkill.domain}
                </div>
              </div>
            )}
          </div>

          {/* Tags */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              标签
            </label>
            <div className="mb-2 flex flex-wrap gap-2">
              {editedSkill.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700"
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                placeholder="添加标签"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={handleAddTag}
                className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
              >
                添加
              </button>
            </div>
          </div>

          {/* Dependencies */}
          {(editedSkill.requiredTools.length > 0 ||
            editedSkill.requiredSkills.length > 0) && (
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="mb-2 font-medium text-gray-900">依赖项</div>
              {editedSkill.requiredTools.length > 0 && (
                <div className="mb-1">
                  <span className="text-xs text-gray-500">依赖工具: </span>
                  <span className="text-xs text-gray-700">
                    {editedSkill.requiredTools.join(', ')}
                  </span>
                </div>
              )}
              {editedSkill.requiredSkills.length > 0 && (
                <div>
                  <span className="text-xs text-gray-500">依赖技能: </span>
                  <span className="text-xs text-gray-700">
                    {editedSkill.requiredSkills.join(', ')}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Status */}
          <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
            <div>
              <div className="font-medium text-gray-900">启用状态</div>
              <div className="text-xs text-gray-500">
                控制此技能是否对 Agent 可用
              </div>
            </div>
            <button
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

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-gray-200 p-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={() => onSave(editedSkill)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Save className="h-4 w-4" />
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function EditMCPDialog({
  server,
  onSave,
  onClose,
}: {
  server: MCPServerConfig;
  onSave: (server: MCPServerConfig) => void;
  onClose: () => void;
}) {
  const [editedServer, setEditedServer] = useState<MCPServerConfig>({
    ...server,
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const preset = PRESET_MCP_SERVERS.find((p) => p.serverId === server.serverId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div
          className={`bg-gradient-to-r ${preset?.color || 'from-gray-500 to-slate-500'} rounded-t-xl p-4`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{preset?.icon || '🔌'}</span>
              <div>
                <h3 className="font-bold text-white">编辑 MCP 服务器</h3>
                <p className="text-xs text-white/80">{server.serverId}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg bg-white/20 p-2 text-white hover:bg-white/30"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] space-y-4 overflow-auto p-6">
          {/* Name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              名称
            </label>
            <input
              type="text"
              value={editedServer.name}
              onChange={(e) =>
                setEditedServer({ ...editedServer, name: e.target.value })
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              描述
            </label>
            <textarea
              value={editedServer.description}
              onChange={(e) =>
                setEditedServer({
                  ...editedServer,
                  description: e.target.value,
                })
              }
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Transport Info */}
          <div className="rounded-lg bg-gray-50 p-3">
            <div className="mb-2 font-medium text-gray-900">连接信息</div>
            <div className="space-y-1 text-sm text-gray-600">
              <div>
                <span className="text-gray-500">Transport: </span>
                <span className="font-mono">{editedServer.transport}</span>
              </div>
              {editedServer.command && (
                <div>
                  <span className="text-gray-500">Command: </span>
                  <span className="font-mono">{editedServer.command}</span>
                </div>
              )}
              {editedServer.args && editedServer.args.length > 0 && (
                <div>
                  <span className="text-gray-500">Args: </span>
                  <span className="font-mono">
                    {editedServer.args.join(' ')}
                  </span>
                </div>
              )}
              {editedServer.url && (
                <div>
                  <span className="text-gray-500">URL: </span>
                  <span className="font-mono">{editedServer.url}</span>
                </div>
              )}
            </div>
          </div>

          {/* API Key */}
          {preset?.requiresApiKey && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                API Key
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={editedServer.apiKey || ''}
                  onChange={(e) =>
                    setEditedServer({ ...editedServer, apiKey: e.target.value })
                  }
                  placeholder="输入 API Key"
                  className="font-mono w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500">API Key 将被安全存储</p>
            </div>
          )}

          {/* Auto Connect */}
          <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
            <div>
              <div className="font-medium text-gray-900">自动连接</div>
              <div className="text-xs text-gray-500">服务器启动时自动连接</div>
            </div>
            <button
              onClick={() =>
                setEditedServer({
                  ...editedServer,
                  autoConnect: !editedServer.autoConnect,
                })
              }
              className={`relative h-6 w-11 rounded-full transition-colors ${
                editedServer.autoConnect ? 'bg-green-500' : 'bg-gray-300'
              }`}
            >
              <div
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                  editedServer.autoConnect ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </button>
          </div>

          {/* Status */}
          <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
            <div>
              <div className="font-medium text-gray-900">启用状态</div>
              <div className="text-xs text-gray-500">控制此服务器是否可用</div>
            </div>
            <button
              onClick={() =>
                setEditedServer({
                  ...editedServer,
                  enabled: !editedServer.enabled,
                })
              }
              className={`relative h-6 w-11 rounded-full transition-colors ${
                editedServer.enabled ? 'bg-green-500' : 'bg-gray-300'
              }`}
            >
              <div
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                  editedServer.enabled ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-gray-200 p-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={() => onSave(editedServer)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Save className="h-4 w-4" />
            保存
          </button>
        </div>
      </div>
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
