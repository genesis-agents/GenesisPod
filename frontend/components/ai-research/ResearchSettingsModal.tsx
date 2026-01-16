'use client';

/**
 * ResearchSettingsModal - 研究设置弹窗
 *
 * 提供研究专题的各项配置选项
 */

import { useState, useCallback, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { useTopicResearchStore } from '@/stores/topicResearchStore';
import { KnowledgeBaseSelector } from '@/components/shared/selectors';
import {
  Settings,
  Trash2,
  Download,
  RefreshCw,
  Users,
  Clock,
  BookOpen,
  Eye,
  Lock,
  Globe,
} from 'lucide-react';

interface ResearchSettingsModalProps {
  open: boolean;
  onClose: () => void;
  topicId: string;
  onClearMessages?: () => void;
}

type VisibilityType = 'private' | 'team' | 'public';

export function ResearchSettingsModal({
  open,
  onClose,
  topicId,
  onClearMessages,
}: ResearchSettingsModalProps) {
  const { teamMessages, resetTopicData, currentTopic } =
    useTopicResearchStore();
  const [isClearing, setIsClearing] = useState(false);
  const [selectedKnowledgeBases, setSelectedKnowledgeBases] = useState<
    string[]
  >([]);
  const [visibility, setVisibility] = useState<VisibilityType>('private');
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Initialize from currentTopic
  useEffect(() => {
    if (currentTopic) {
      // Set visibility from topic
      if (currentTopic.visibility) {
        setVisibility(currentTopic.visibility as VisibilityType);
      }
      // Knowledge base IDs would need to be loaded from backend or stored elsewhere
    }
  }, [currentTopic]);

  // Save knowledge base and visibility settings
  const handleSaveSettings = useCallback(async () => {
    setIsSavingSettings(true);
    try {
      // TODO: Call API to update topic config
      // await updateTopicConfig(topicId, { knowledgeBaseIds: selectedKnowledgeBases, visibility });
      console.log('Saving settings:', { selectedKnowledgeBases, visibility });
    } finally {
      setIsSavingSettings(false);
    }
  }, [selectedKnowledgeBases, visibility]);

  // 清除所有消息（WebSocket + 持久化）
  const handleClearAllMessages = useCallback(async () => {
    setIsClearing(true);
    try {
      // 清除 WebSocket 消息
      onClearMessages?.();

      // 清除 store 中的持久化消息
      // 注意：这会清除当前 topic 的所有协作数据
      resetTopicData();

      // 可选：调用后端 API 清除数据库中的消息
      // await clearTeamMessages(topicId);
    } finally {
      setIsClearing(false);
    }
  }, [onClearMessages, resetTopicData]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="研究设置"
      subtitle="配置研究专题的各项参数"
      size="md"
      footer={
        <Button variant="outline" onClick={onClose}>
          关闭
        </Button>
      }
    >
      <div className="space-y-6">
        {/* 消息管理 */}
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
              <RefreshCw className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h4 className="font-medium text-gray-900">消息管理</h4>
              <p className="text-sm text-gray-500">
                当前有 {teamMessages.length} 条协作消息
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearAllMessages}
            disabled={isClearing || teamMessages.length === 0}
            className="w-full"
          >
            {isClearing ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                清除中...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                清除所有协作消息
              </>
            )}
          </Button>
        </div>

        {/* 知识库配置 */}
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100">
              <BookOpen className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h4 className="font-medium text-gray-900">关联知识库</h4>
              <p className="text-sm text-gray-500">
                选择研究时优先使用的知识库
              </p>
            </div>
          </div>
          <KnowledgeBaseSelector
            selectedIds={selectedKnowledgeBases}
            onSelectionChange={setSelectedKnowledgeBases}
            multiple={true}
            maxSelections={5}
            placeholder="选择关联的知识库 (可选)"
          />
        </div>

        {/* 可见性设置 */}
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-100">
              <Eye className="h-5 w-5 text-cyan-600" />
            </div>
            <div>
              <h4 className="font-medium text-gray-900">可见性设置</h4>
              <p className="text-sm text-gray-500">控制谁可以访问此研究专题</p>
            </div>
          </div>
          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
              <input
                type="radio"
                name="visibility"
                checked={visibility === 'private'}
                onChange={() => setVisibility('private')}
                className="h-4 w-4 text-blue-600"
              />
              <Lock className="h-4 w-4 text-gray-500" />
              <div>
                <span className="text-sm font-medium text-gray-900">私有</span>
                <p className="text-xs text-gray-500">仅自己可见</p>
              </div>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
              <input
                type="radio"
                name="visibility"
                checked={visibility === 'team'}
                onChange={() => setVisibility('team')}
                className="h-4 w-4 text-blue-600"
              />
              <Users className="h-4 w-4 text-gray-500" />
              <div>
                <span className="text-sm font-medium text-gray-900">团队</span>
                <p className="text-xs text-gray-500">团队成员可见</p>
              </div>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
              <input
                type="radio"
                name="visibility"
                checked={visibility === 'public'}
                onChange={() => setVisibility('public')}
                className="h-4 w-4 text-blue-600"
              />
              <Globe className="h-4 w-4 text-gray-500" />
              <div>
                <span className="text-sm font-medium text-gray-900">公开</span>
                <p className="text-xs text-gray-500">所有人可见</p>
              </div>
            </label>
          </div>
        </div>

        {/* 导出设置 */}
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
              <Download className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h4 className="font-medium text-gray-900">导出设置</h4>
              <p className="text-sm text-gray-500">配置报告导出格式和选项</p>
            </div>
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" defaultChecked className="rounded" />
              导出时包含参考来源
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" defaultChecked className="rounded" />
              导出时包含可信度分析
            </label>
          </div>
        </div>

        {/* 团队配置（预留） */}
        <div className="rounded-lg border border-gray-200 p-4 opacity-60">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
              <Users className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h4 className="font-medium text-gray-900">团队配置</h4>
              <p className="text-sm text-gray-500">
                自定义研究团队组成（即将推出）
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            配置研究员数量、角色分配等选项
          </p>
        </div>

        {/* 自动保存设置（预留） */}
        <div className="rounded-lg border border-gray-200 p-4 opacity-60">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100">
              <Clock className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <h4 className="font-medium text-gray-900">自动保存</h4>
              <p className="text-sm text-gray-500">
                配置自动保存间隔（即将推出）
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-400">研究进度每 5 分钟自动保存一次</p>
        </div>
      </div>
    </Modal>
  );
}
