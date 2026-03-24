'use client';

import { useState, useCallback } from 'react';
import {
  useConsciousness,
  useConsciousnessProfile,
  useConsciousnessMemories,
  useConsciousnessConversations,
  type ConsciousnessDataSource,
} from '@/hooks/domain/useConsciousness';
import { useI18n } from '@/lib/i18n/i18n-context';
import { logger } from '@/lib/utils/logger';
import {
  ArrowLeft,
  Brain,
  Upload,
  Sparkles,
  MessageCircle,
  Trash2,
  Plus,
  FileText,
  Loader2,
  CheckCircle2,
  BarChart3,
} from 'lucide-react';

interface ProfileDetailProps {
  profileId: string;
  onBack: () => void;
  onStartChat: (profileId: string, conversationId: string) => void;
  onDelete: (profileId: string) => void;
  onRefreshList: () => void;
}

const DATA_SOURCE_TYPES = [
  { value: 'TEXT', label: 'Text', icon: FileText },
  { value: 'DOCUMENT', label: 'Document', icon: FileText },
  { value: 'CHAT_HISTORY', label: 'Chat History', icon: MessageCircle },
  { value: 'NOTES', label: 'Notes', icon: FileText },
] as const;

export function ProfileDetail({
  profileId,
  onBack,
  onStartChat,
  onDelete,
  onRefreshList,
}: ProfileDetailProps) {
  const { t } = useI18n();
  const {
    addDataSource,
    deleteDataSource,
    analyzeProfile,
    isAnalyzing,
    createConversation,
  } = useConsciousness();

  const {
    data: profile,
    loading: profileLoading,
    refresh: refreshProfile,
  } = useConsciousnessProfile(profileId);

  const { data: memories } = useConsciousnessMemories(profileId);
  const {
    data: conversations,
    refresh: refreshConversations,
  } = useConsciousnessConversations(profileId);

  const [showAddSource, setShowAddSource] = useState(false);
  const [sourceType, setSourceType] = useState<string>('TEXT');
  const [sourceName, setSourceName] = useState('');
  const [sourceContent, setSourceContent] = useState('');
  const [activeTab, setActiveTab] = useState<'sources' | 'memories' | 'conversations'>('sources');

  // ─── Handlers ───

  const handleAddSource = useCallback(async () => {
    if (!sourceName.trim() || !sourceContent.trim()) return;
    try {
      await addDataSource(profileId, {
        type: sourceType,
        name: sourceName.trim(),
        content: sourceContent.trim(),
      });
      setSourceName('');
      setSourceContent('');
      setShowAddSource(false);
      void refreshProfile();
    } catch (error) {
      logger.error('Failed to add data source', error);
    }
  }, [profileId, sourceType, sourceName, sourceContent, addDataSource, refreshProfile]);

  const handleAnalyze = useCallback(async () => {
    try {
      await analyzeProfile(profileId);
      void refreshProfile();
      void onRefreshList();
    } catch (error) {
      logger.error('Failed to analyze profile', error);
    }
  }, [profileId, analyzeProfile, refreshProfile, onRefreshList]);

  const handleNewConversation = useCallback(async () => {
    if (!profile) return;
    try {
      const conversation = await createConversation(
        profileId,
        `Chat with ${profile.name}`,
      );
      void refreshConversations();
      onStartChat(profileId, conversation.id);
    } catch (error) {
      logger.error('Failed to create conversation', error);
    }
  }, [profileId, profile, createConversation, refreshConversations, onStartChat]);

  const handleDeleteSource = useCallback(
    async (sourceId: string) => {
      try {
        await deleteDataSource(profileId, sourceId);
        void refreshProfile();
      } catch (error) {
        logger.error('Failed to delete source', error);
      }
    },
    [profileId, deleteDataSource, refreshProfile],
  );

  if (profileLoading || !profile) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
      </div>
    );
  }

  const isReady = profile.status === 'READY';
  const hasUnprocessed =
    profile.dataSources?.some((s: ConsciousnessDataSource) => !s.isProcessed) ?? false;

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-400" />
          </button>
          <div className="h-10 w-10 rounded-full bg-purple-600/30 flex items-center justify-center">
            <Brain className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">
              {profile.name}
            </h2>
            {profile.description && (
              <p className="text-sm text-gray-400">{profile.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasUnprocessed && (
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {isAnalyzing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {isAnalyzing
                ? t('consciousness.analyzing', 'Analyzing...')
                : t('consciousness.analyze', 'Analyze')}
            </button>
          )}
          {isReady && (
            <button
              onClick={handleNewConversation}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
            >
              <MessageCircle className="h-4 w-4" />
              {t('consciousness.chat', 'Chat with Avatar')}
            </button>
          )}
          <button
            onClick={() => onDelete(profileId)}
            className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Personality Summary (when analyzed) */}
      {profile.personalityModel && (
        <div className="p-6 border-b border-white/10 bg-purple-900/10">
          <h3 className="text-sm font-medium text-purple-300 mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            {t('consciousness.personality', 'Personality Model')}
          </h3>
          <div className="grid grid-cols-5 gap-3">
            {Object.entries(
              profile.personalityModel as Record<string, number>,
            ).map(([trait, value]) => (
              <div key={trait} className="text-center">
                <div className="text-xs text-gray-400 mb-1 capitalize">
                  {trait}
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all"
                    style={{ width: `${(value as number) * 100}%` }}
                  />
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {((value as number) * 100).toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-white/10">
        {(
          [
            { key: 'sources', label: 'Data Sources', icon: Upload },
            { key: 'memories', label: 'Memories', icon: Sparkles },
            {
              key: 'conversations',
              label: 'Conversations',
              icon: MessageCircle,
            },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === key
                ? 'text-purple-400 border-b-2 border-purple-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Sources Tab */}
        {activeTab === 'sources' && (
          <div className="space-y-4">
            <button
              onClick={() => setShowAddSource(!showAddSource)}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4" />
              {t('consciousness.addSource', 'Add Data Source')}
            </button>

            {showAddSource && (
              <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-3">
                <div className="flex gap-2">
                  {DATA_SOURCE_TYPES.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setSourceType(value)}
                      className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                        sourceType === value
                          ? 'bg-purple-600 text-white'
                          : 'bg-white/10 text-gray-400 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Source name..."
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
                <textarea
                  placeholder="Paste your content here... (text, notes, chat logs, etc.)"
                  value={sourceContent}
                  onChange={(e) => setSourceContent(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleAddSource}
                    disabled={!sourceName.trim() || !sourceContent.trim()}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                  >
                    {t('common.add', 'Add')}
                  </button>
                  <button
                    onClick={() => setShowAddSource(false)}
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 text-gray-300 rounded-lg transition-colors"
                  >
                    {t('common.cancel', 'Cancel')}
                  </button>
                </div>
              </div>
            )}

            {profile.dataSources?.map((source: ConsciousnessDataSource) => (
              <div
                key={source.id}
                className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                      source.isProcessed
                        ? 'bg-green-600/20'
                        : 'bg-yellow-600/20'
                    }`}
                  >
                    {source.isProcessed ? (
                      <CheckCircle2 className="h-4 w-4 text-green-400" />
                    ) : (
                      <FileText className="h-4 w-4 text-yellow-400" />
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">
                      {source.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {source.type} &middot;{' '}
                      {source.isProcessed ? 'Processed' : 'Pending'}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteSource(source.id)}
                  className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}

            {(!profile.dataSources || profile.dataSources.length === 0) && (
              <p className="text-center text-gray-500 py-8">
                {t(
                  'consciousness.noSources',
                  'No data sources yet. Add text, documents, or chat logs to build your consciousness.',
                )}
              </p>
            )}
          </div>
        )}

        {/* Memories Tab */}
        {activeTab === 'memories' && (
          <div className="space-y-3">
            {memories && memories.length > 0 ? (
              memories.map((memory) => (
                <div
                  key={memory.id}
                  className="p-4 bg-white/5 border border-white/10 rounded-xl"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 text-xs bg-purple-600/30 text-purple-300 rounded-full">
                      {memory.category}
                    </span>
                    <span className="text-sm font-medium text-white">
                      {memory.topic}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400">{memory.content}</p>
                  <div className="flex gap-4 mt-2 text-xs text-gray-500">
                    <span>
                      Importance: {(memory.importance * 100).toFixed(0)}%
                    </span>
                    <span>
                      Confidence: {(memory.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-gray-500 py-8">
                {t(
                  'consciousness.noMemories',
                  'No memories extracted yet. Add data sources and run analysis.',
                )}
              </p>
            )}
          </div>
        )}

        {/* Conversations Tab */}
        {activeTab === 'conversations' && (
          <div className="space-y-3">
            {isReady && (
              <button
                onClick={handleNewConversation}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
              >
                <Plus className="h-4 w-4" />
                {t('consciousness.newConversation', 'New Conversation')}
              </button>
            )}

            {conversations && conversations.length > 0 ? (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => onStartChat(profileId, conv.id)}
                  className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl hover:border-purple-500/50 cursor-pointer transition-all"
                >
                  <div>
                    <div className="text-sm font-medium text-white">
                      {conv.title}
                    </div>
                    <div className="text-xs text-gray-500">
                      {conv._count?.messages ?? 0} messages
                    </div>
                  </div>
                  <MessageCircle className="h-4 w-4 text-gray-500" />
                </div>
              ))
            ) : (
              <p className="text-center text-gray-500 py-8">
                {isReady
                  ? t(
                      'consciousness.noConversations',
                      'No conversations yet. Start chatting with your avatar!',
                    )
                  : t(
                      'consciousness.notReady',
                      'Profile needs to be analyzed before you can chat with the avatar.',
                    )}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
