'use client';

import { useState, useCallback } from 'react';
import {
  useConsciousness,
  useConsciousnessProfiles,
  type ConsciousnessProfile,
} from '@/hooks/domain/useConsciousness';
import { useI18n } from '@/lib/i18n/i18n-context';
import { logger } from '@/lib/utils/logger';
import {
  Brain,
  Plus,
  Upload,
  MessageCircle,
  Sparkles,
  ChevronRight,
  FileText,
  Loader2,
  CheckCircle2,
  Clock,
  Database,
} from 'lucide-react';
import { ProfileDetail } from './ProfileDetail';
import { AvatarChat } from './AvatarChat';

type View = 'list' | 'detail' | 'chat';

export default function ConsciousnessPage() {
  const { t } = useI18n();
  const {
    createProfile,
    deleteProfile,
  } = useConsciousness();

  const {
    data: profiles,
    loading: profilesLoading,
    refresh: refreshProfiles,
  } = useConsciousnessProfiles();

  const [currentView, setCurrentView] = useState<View>('list');
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    null,
  );
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileDesc, setNewProfileDesc] = useState('');

  // ─── Handlers ───

  const handleCreateProfile = useCallback(async () => {
    if (!newProfileName.trim()) return;
    try {
      const profile = await createProfile({
        name: newProfileName.trim(),
        description: newProfileDesc.trim() || undefined,
      });
      setNewProfileName('');
      setNewProfileDesc('');
      setIsCreating(false);
      setSelectedProfileId(profile.id);
      setCurrentView('detail');
      void refreshProfiles();
    } catch (error) {
      logger.error('Failed to create profile', error);
    }
  }, [newProfileName, newProfileDesc, createProfile, refreshProfiles]);

  const handleDeleteProfile = useCallback(
    async (profileId: string) => {
      try {
        await deleteProfile(profileId);
        if (selectedProfileId === profileId) {
          setCurrentView('list');
          setSelectedProfileId(null);
        }
        void refreshProfiles();
      } catch (error) {
        logger.error('Failed to delete profile', error);
      }
    },
    [deleteProfile, selectedProfileId, refreshProfiles],
  );

  const handleSelectProfile = useCallback((profileId: string) => {
    setSelectedProfileId(profileId);
    setCurrentView('detail');
  }, []);

  const handleStartChat = useCallback(
    (profileId: string, conversationId: string) => {
      setSelectedProfileId(profileId);
      setSelectedConversationId(conversationId);
      setCurrentView('chat');
    },
    [],
  );

  const handleBack = useCallback(() => {
    if (currentView === 'chat') {
      setCurrentView('detail');
      setSelectedConversationId(null);
    } else {
      setCurrentView('list');
      setSelectedProfileId(null);
    }
  }, [currentView]);

  // ─── Status Badge ───

  const StatusBadge = ({ status }: { status: ConsciousnessProfile['status'] }) => {
    const config: Record<
      string,
      { icon: typeof CheckCircle2; color: string; label: string }
    > = {
      DRAFT: { icon: FileText, color: 'text-gray-400', label: 'Draft' },
      COLLECTING: {
        icon: Database,
        color: 'text-blue-400',
        label: 'Collecting',
      },
      ANALYZING: {
        icon: Loader2,
        color: 'text-yellow-400',
        label: 'Analyzing',
      },
      READY: {
        icon: CheckCircle2,
        color: 'text-green-400',
        label: 'Ready',
      },
      ARCHIVED: { icon: Clock, color: 'text-gray-500', label: 'Archived' },
    };
    const cfg = config[status] || config.DRAFT;
    const Icon = cfg.icon;
    return (
      <span className={`flex items-center gap-1 text-xs ${cfg.color}`}>
        <Icon
          className={`h-3 w-3 ${status === 'ANALYZING' ? 'animate-spin' : ''}`}
        />
        {cfg.label}
      </span>
    );
  };

  // ─── Profile List View ───

  if (currentView === 'list') {
    return (
      <div className="flex-1 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Brain className="h-6 w-6 text-purple-400" />
            <div>
              <h1 className="text-xl font-semibold text-white">
                {t('consciousness.title', 'Consciousness Upload')}
              </h1>
              <p className="text-sm text-gray-400">
                {t(
                  'consciousness.subtitle',
                  'Create digital twins from your knowledge and personality',
                )}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t('consciousness.newProfile', 'New Profile')}
          </button>
        </div>

        {/* Create Form */}
        {isCreating && (
          <div className="p-6 border-b border-white/10 bg-white/5">
            <div className="max-w-lg space-y-3">
              <input
                type="text"
                placeholder={t(
                  'consciousness.profileNamePlaceholder',
                  'Profile name (e.g., "My Digital Twin")',
                )}
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                autoFocus
              />
              <textarea
                placeholder={t(
                  'consciousness.profileDescPlaceholder',
                  'Describe what this profile represents...',
                )}
                value={newProfileDesc}
                onChange={(e) => setNewProfileDesc(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreateProfile}
                  disabled={!newProfileName.trim()}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  {t('common.create', 'Create')}
                </button>
                <button
                  onClick={() => {
                    setIsCreating(false);
                    setNewProfileName('');
                    setNewProfileDesc('');
                  }}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-gray-300 rounded-lg transition-colors"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Profile List */}
        <div className="flex-1 overflow-y-auto p-6">
          {profilesLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
            </div>
          ) : !profiles || profiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Brain className="h-16 w-16 text-gray-600 mb-4" />
              <h3 className="text-lg font-medium text-gray-400 mb-2">
                {t(
                  'consciousness.empty',
                  'No consciousness profiles yet',
                )}
              </h3>
              <p className="text-sm text-gray-500 max-w-md">
                {t(
                  'consciousness.emptyDesc',
                  'Create your first digital twin by uploading your knowledge, writing samples, and personal data.',
                )}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {profiles.map((profile) => (
                <div
                  key={profile.id}
                  onClick={() => handleSelectProfile(profile.id)}
                  className="p-4 bg-white/5 border border-white/10 rounded-xl hover:border-purple-500/50 hover:bg-white/10 cursor-pointer transition-all group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-purple-600/30 flex items-center justify-center">
                        <Brain className="h-5 w-5 text-purple-400" />
                      </div>
                      <div>
                        <h3 className="font-medium text-white">
                          {profile.name}
                        </h3>
                        <StatusBadge status={profile.status} />
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-500 group-hover:text-purple-400 transition-colors" />
                  </div>

                  {profile.description && (
                    <p className="text-sm text-gray-400 mb-3 line-clamp-2">
                      {profile.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Upload className="h-3 w-3" />
                      {profile._count?.dataSources ?? profile.totalDataSources}{' '}
                      sources
                    </span>
                    <span className="flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      {profile._count?.memories ?? profile.totalMemories}{' '}
                      memories
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle className="h-3 w-3" />
                      {profile._count?.conversations ??
                        profile.totalConversations}{' '}
                      chats
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Profile Detail View ───

  if (currentView === 'detail' && selectedProfileId) {
    return (
      <ProfileDetail
        profileId={selectedProfileId}
        onBack={handleBack}
        onStartChat={handleStartChat}
        onDelete={handleDeleteProfile}
        onRefreshList={refreshProfiles}
      />
    );
  }

  // ─── Avatar Chat View ───

  if (
    currentView === 'chat' &&
    selectedProfileId &&
    selectedConversationId
  ) {
    return (
      <AvatarChat
        conversationId={selectedConversationId}
        onBack={handleBack}
      />
    );
  }

  return null;
}
