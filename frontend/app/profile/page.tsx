'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/lib/i18n';
import {
  useThemeStore,
  USER_MESSAGE_STYLES,
  AI_MESSAGE_STYLES,
} from '@/stores';
import { config } from '@/lib/utils/config';
import {
  getConnections,
  getConnectUrl,
  disconnectNotion,
  NotionConnection,
} from '@/services/notion/api';
import { GoogleDriveConnectionCard } from '@/components/library/integrations/google-drive/GoogleDriveConnectionCard';
import { FeishuBindingCard } from '@/components/library/integrations/feishu/FeishuBindingCard';
import ClientDate from '@/components/common/ClientDate';
import { SettingsSectionCard } from '@/components/common/cards/SettingsSectionCard';

import { logger } from '@/lib/utils/logger';
interface UserStats {
  userId: string;
  memberSince: string;
  stats: {
    bookmarked: number;
    viewed: number;
    comments: number;
    notes: number;
    reports: number;
    chatSessions: number;
    topicsCreated: number;
    imagesGenerated: number;
  };
  activity: {
    recentActivityCount: number;
    breakdown: Array<{ type: string; count: number }>;
  };
}

function ProfileContent() {
  const { t } = useTranslation();
  const { user, isLoading, accessToken } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read initial tab from URL query parameter.
  // ★ 旧路径兼容：'api-keys' / 'my-models' 已迁移到 /me/ai，此页直接跳转。
  const rawTab = searchParams?.get('tab');
  if (rawTab === 'api-keys' || rawTab === 'my-models') {
    if (typeof window !== 'undefined') {
      window.location.replace(
        `/me/ai?tab=${rawTab === 'my-models' ? 'models' : 'keys'}`
      );
    }
  }
  const initialTab =
    (rawTab as 'profile' | 'settings' | 'stats' | 'integrations') || 'profile';
  const [activeTab, setActiveTab] = useState<
    'profile' | 'settings' | 'stats' | 'integrations'
  >(initialTab);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Integrations state
  const [notionConnections, setNotionConnections] = useState<
    NotionConnection[]
  >([]);
  const [integrationsLoading, setIntegrationsLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // Redirect to home if not logged in
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  // Real user data from auth
  const [userData, setUserData] = useState({
    name: user?.username || '',
    email: user?.email || '',
    bio: user?.bio || '',
    interests: user?.interests || [],
  });
  const [newInterest, setNewInterest] = useState('');

  // Update userData when user changes
  useEffect(() => {
    if (user) {
      setUserData({
        name: user.username || user.email?.split('@')[0] || 'User',
        email: user.email || '',
        bio: user.bio || '',
        interests: user.interests || [],
      });
    }
  }, [user]);

  const [settings, setSettings] = useState({
    emailNotifications: true,
    recommendationNotifications: true,
    weeklyDigest: false,
    darkMode: false,
    language: 'en',
  });

  const {
    userMessageStyle,
    aiMessageStyle,
    setUserMessageStyle,
    setAiMessageStyle,
  } = useThemeStore();

  // Fetch user stats
  const fetchUserStats = useCallback(async () => {
    if (!accessToken) return;

    setStatsLoading(true);
    try {
      const response = await fetch(`${config.apiUrl}/auth/stats`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (response.ok) {
        const result = await response.json();
        // API returns { success: true, data: stats } format
        const data = result?.data ?? result;
        setUserStats(data);
      }
    } catch (error) {
      logger.error('Failed to fetch user stats:', error);
    } finally {
      setStatsLoading(false);
    }
  }, [accessToken]);

  // Fetch stats when tab changes to stats
  useEffect(() => {
    if (activeTab === 'stats' && !userStats && accessToken) {
      fetchUserStats();
    }
  }, [activeTab, userStats, accessToken, fetchUserStats]);

  // Fetch integrations (Notion connections)
  const fetchIntegrations = useCallback(async () => {
    setIntegrationsLoading(true);
    try {
      const result = await getConnections();
      setNotionConnections(result.connections);
    } catch (error) {
      logger.error('Failed to fetch integrations:', error);
    } finally {
      setIntegrationsLoading(false);
    }
  }, []);

  // Fetch integrations when tab changes
  useEffect(() => {
    if (activeTab === 'integrations') {
      fetchIntegrations();
    }
  }, [activeTab, fetchIntegrations]);

  // Connect Notion
  const handleConnectNotion = async () => {
    setConnecting(true);
    try {
      const result = await getConnectUrl();
      window.location.href = result.url;
    } catch (error) {
      logger.error('Failed to connect Notion:', error);
      setMessage({
        type: 'error',
        text: 'Failed to connect Notion. Please try again.',
      });
      setConnecting(false);
    }
  };

  // Disconnect Notion
  const handleDisconnectNotion = async (connectionId: string) => {
    if (
      !confirm('Are you sure you want to disconnect this Notion workspace?')
    ) {
      return;
    }
    try {
      await disconnectNotion(connectionId);
      await fetchIntegrations();
      setMessage({
        type: 'success',
        text: 'Notion workspace disconnected successfully.',
      });
    } catch (error) {
      logger.error('Failed to disconnect Notion:', error);
      setMessage({
        type: 'error',
        text: 'Failed to disconnect. Please try again.',
      });
    }
  };

  // Removed formatDate function - using ClientDate component instead

  // Add interest
  const handleAddInterest = () => {
    if (
      newInterest.trim() &&
      !userData.interests.includes(newInterest.trim())
    ) {
      setUserData({
        ...userData,
        interests: [...userData.interests, newInterest.trim()],
      });
      setNewInterest('');
    }
  };

  // Remove interest
  const handleRemoveInterest = (index: number) => {
    setUserData({
      ...userData,
      interests: userData.interests.filter(
        (_: string, i: number) => i !== index
      ),
    });
  };

  // Save profile changes
  const handleSaveProfile = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch(`${config.apiUrl}/auth/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          username: userData.name,
          bio: userData.bio,
          interests: userData.interests,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update profile');
      }

      setMessage({
        type: 'success',
        text: 'Profile updated successfully!',
      });

      // Reload to refresh user state
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      logger.error('Failed to update profile:', error);
      setMessage({
        type: 'error',
        text: 'Failed to update profile. Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600"></div>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return null;
  }

  return (
    <AppShell>
      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
          <h1 className="text-2xl font-bold text-gray-900">
            {t('profile.header')}
          </h1>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-4xl">
            {/* 提示：API Keys 和 我的模型 已独立到 /me/ai */}
            <div className="mb-5 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    AI 配置已独立
                  </div>
                  <div className="text-xs text-gray-600">
                    「API Keys」和「我的模型」已搬到独立入口，方便管理
                  </div>
                </div>
              </div>
              <Link
                href="/me/ai"
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
              >
                前往管理 →
              </Link>
            </div>

            {/* Tabs */}
            <div className="mb-6 flex items-center gap-4 border-b border-gray-200">
              <button
                onClick={() => setActiveTab('profile')}
                className={`px-4 py-2 font-medium transition-colors ${
                  activeTab === 'profile'
                    ? 'border-b-2 border-red-600 text-red-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {t('profile.tabs.profile')}
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`px-4 py-2 font-medium transition-colors ${
                  activeTab === 'settings'
                    ? 'border-b-2 border-red-600 text-red-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {t('profile.tabs.settings')}
              </button>
              <button
                onClick={() => setActiveTab('stats')}
                className={`px-4 py-2 font-medium transition-colors ${
                  activeTab === 'stats'
                    ? 'border-b-2 border-red-600 text-red-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {t('profile.tabs.stats')}
              </button>
              <button
                onClick={() => setActiveTab('integrations')}
                className={`px-4 py-2 font-medium transition-colors ${
                  activeTab === 'integrations'
                    ? 'border-b-2 border-red-600 text-red-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {t('profile.tabs.integrations')}
              </button>
            </div>

            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="space-y-6">
                {/* Avatar Section */}
                <SettingsSectionCard title={t('profile.profilePicture')}>
                  <div className="flex items-center gap-4">
                    <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-gray-200">
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt={user.username || user.email}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-cyan-400 text-3xl font-bold text-white">
                          {userData.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">
                        {t('profile.managedByGoogle')}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {t('profile.updateGoogleProfile')}
                      </p>
                    </div>
                  </div>
                </SettingsSectionCard>

                {/* Basic Info */}
                <SettingsSectionCard title={t('profile.basicInfo')}>
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        {t('profile.name')}
                      </label>
                      <input
                        type="text"
                        value={userData.name}
                        onChange={(e) =>
                          setUserData({ ...userData, name: e.target.value })
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        {t('profile.email')}
                      </label>
                      <input
                        type="email"
                        value={userData.email}
                        disabled
                        className="w-full rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-gray-500"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        {t('profile.emailCannotChange')}
                      </p>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        {t('profile.bio')}
                      </label>
                      <textarea
                        value={userData.bio}
                        onChange={(e) =>
                          setUserData({ ...userData, bio: e.target.value })
                        }
                        rows={3}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </div>
                  </div>
                </SettingsSectionCard>

                {/* Interests */}
                <SettingsSectionCard title={t('profile.researchInterests')}>
                  <div className="mb-3 flex flex-wrap gap-2">
                    {userData.interests.map((interest: string, idx: number) => (
                      <span
                        key={idx}
                        className="flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700"
                      >
                        {interest}
                        <button
                          onClick={() => handleRemoveInterest(idx)}
                          className="ml-1 text-red-600 hover:text-red-800"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newInterest}
                      onChange={(e) => setNewInterest(e.target.value)}
                      onKeyPress={(e) =>
                        e.key === 'Enter' && handleAddInterest()
                      }
                      placeholder={t('profile.enterInterest')}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                    <button
                      onClick={handleAddInterest}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                    >
                      {t('profile.add')}
                    </button>
                  </div>
                </SettingsSectionCard>

                {/* Message */}
                {message && (
                  <div
                    className={`flex items-center gap-2 rounded-md border px-4 py-3 ${
                      message.type === 'success'
                        ? 'border-green-200 bg-green-50 text-green-800'
                        : 'border-red-200 bg-red-50 text-red-800'
                    }`}
                  >
                    <span className="text-sm font-medium">{message.text}</span>
                  </div>
                )}

                {/* Save Button */}
                <div className="flex justify-end">
                  <button
                    onClick={handleSaveProfile}
                    disabled={saving}
                    className="rounded-lg bg-red-600 px-6 py-2 font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? t('profile.saving') : t('profile.saveChanges')}
                  </button>
                </div>
              </div>
            )}

            {/* Settings Tab */}
            {activeTab === 'settings' && (
              <div className="space-y-6">
                {/* Chat Appearance Settings */}
                <SettingsSectionCard title={t('profile.chatAppearance')}>
                  <div className="space-y-6">
                    {/* User Message Style */}
                    <div>
                      <p className="mb-3 font-medium text-gray-900">
                        {t('profile.myMessageStyle')}
                      </p>
                      <div className="flex flex-wrap gap-3">
                        {USER_MESSAGE_STYLES.map((style) => (
                          <button
                            key={style.id}
                            onClick={() => setUserMessageStyle(style.value)}
                            className={`group relative flex h-12 w-12 items-center justify-center rounded-full ring-offset-2 transition-all ${style.preview} ${
                              userMessageStyle === style.value
                                ? 'ring-2 ring-gray-900'
                                : 'hover:scale-110'
                            }`}
                            title={style.name}
                          >
                            {userMessageStyle === style.value && (
                              <svg
                                className="h-5 w-5 text-white"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* AI Message Style */}
                    <div>
                      <p className="mb-3 font-medium text-gray-900">
                        {t('profile.aiMessageStyle')}
                      </p>
                      <div className="flex flex-wrap gap-3">
                        {AI_MESSAGE_STYLES.map((style) => (
                          <button
                            key={style.id}
                            onClick={() => setAiMessageStyle(style.value)}
                            className={`group relative flex h-12 w-12 items-center justify-center rounded-full ring-offset-2 transition-all ${style.preview} ${
                              aiMessageStyle === style.value
                                ? 'ring-2 ring-gray-900'
                                : 'hover:scale-110'
                            }`}
                            title={style.name}
                          >
                            {aiMessageStyle === style.value && (
                              <svg
                                className="h-5 w-5 text-gray-900"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Preview */}
                    <div className="mt-4 rounded-xl bg-gray-50 p-4">
                      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-500">
                        {t('profile.preview')}
                      </p>
                      <div className="space-y-4">
                        <div className="flex justify-end">
                          <div
                            className={`max-w-[80%] rounded-2xl rounded-tr-none px-4 py-3 text-sm shadow-sm ${userMessageStyle}`}
                          >
                            <p>How do I customize my chat appearance?</p>
                          </div>
                        </div>
                        <div className="flex justify-start">
                          <div
                            className={`max-w-[80%] rounded-2xl rounded-tl-none px-4 py-3 text-sm ${aiMessageStyle}`}
                          >
                            <p>
                              You can select different colors and styles for
                              both your messages and my responses using the
                              options above. Changes are saved automatically!
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </SettingsSectionCard>

                {/* Notification Preferences */}
                <SettingsSectionCard title={t('profile.notificationPrefs')}>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">
                          {t('profile.emailNotifications')}
                        </p>
                        <p className="text-sm text-gray-500">
                          {t('profile.emailNotificationsDesc')}
                        </p>
                      </div>
                      <label className="relative inline-flex cursor-pointer items-center">
                        <input
                          type="checkbox"
                          checked={settings.emailNotifications}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              emailNotifications: e.target.checked,
                            })
                          }
                          className="peer sr-only"
                        />
                        <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-red-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300"></div>
                      </label>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">
                          {t('profile.recommendationNotifications')}
                        </p>
                        <p className="text-sm text-gray-500">
                          {t('profile.recommendationNotificationsDesc')}
                        </p>
                      </div>
                      <label className="relative inline-flex cursor-pointer items-center">
                        <input
                          type="checkbox"
                          checked={settings.recommendationNotifications}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              recommendationNotifications: e.target.checked,
                            })
                          }
                          className="peer sr-only"
                        />
                        <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-red-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300"></div>
                      </label>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">
                          {t('profile.weeklyDigest')}
                        </p>
                        <p className="text-sm text-gray-500">
                          {t('profile.weeklyDigestDesc')}
                        </p>
                      </div>
                      <label className="relative inline-flex cursor-pointer items-center">
                        <input
                          type="checkbox"
                          checked={settings.weeklyDigest}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              weeklyDigest: e.target.checked,
                            })
                          }
                          className="peer sr-only"
                        />
                        <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-red-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300"></div>
                      </label>
                    </div>
                  </div>
                </SettingsSectionCard>

                {/* Appearance Settings */}
                <SettingsSectionCard title={t('profile.appearance')}>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">
                          {t('profile.darkMode')}
                        </p>
                        <p className="text-sm text-gray-500">
                          {t('profile.darkModeDesc')}
                        </p>
                      </div>
                      <label className="relative inline-flex cursor-pointer items-center">
                        <input
                          type="checkbox"
                          checked={settings.darkMode}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              darkMode: e.target.checked,
                            })
                          }
                          className="peer sr-only"
                        />
                        <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-red-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300"></div>
                      </label>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        {t('profile.language')}
                      </label>
                      <select
                        value={settings.language}
                        onChange={(e) =>
                          setSettings({ ...settings, language: e.target.value })
                        }
                        className="rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                      >
                        <option value="en">{t('language.en')}</option>
                        <option value="zh">{t('language.zh')}</option>
                      </select>
                    </div>
                  </div>
                </SettingsSectionCard>

                {/* Save Button */}
                <div className="flex justify-end">
                  <button className="rounded-lg bg-red-600 px-6 py-2 font-medium text-white transition-colors hover:bg-red-700">
                    {t('profile.saveSettings')}
                  </button>
                </div>
              </div>
            )}

            {/* Statistics Tab */}
            {activeTab === 'stats' && (
              <div className="space-y-6">
                {statsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-red-600"></div>
                  </div>
                ) : (
                  <>
                    {/* Main Stats Cards */}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-lg border border-gray-200 bg-white p-6">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-600">
                            {t('profile.stats.bookmarked')}
                          </p>
                          <svg
                            className="h-5 w-5 text-red-600"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                          </svg>
                        </div>
                        <p className="text-3xl font-bold text-gray-900">
                          {userStats?.stats.bookmarked ?? 0}
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-white p-6">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-600">
                            {t('profile.stats.resourcesViewed')}
                          </p>
                          <svg
                            className="h-5 w-5 text-blue-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                        </div>
                        <p className="text-3xl font-bold text-gray-900">
                          {userStats?.stats.viewed ?? 0}
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-white p-6">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-600">
                            {t('profile.stats.comments')}
                          </p>
                          <svg
                            className="h-5 w-5 text-green-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                            />
                          </svg>
                        </div>
                        <p className="text-3xl font-bold text-gray-900">
                          {userStats?.stats.comments ?? 0}
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-white p-6">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-600">
                            {t('profile.stats.memberSince')}
                          </p>
                          <svg
                            className="h-5 w-5 text-purple-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                        </div>
                        <p className="text-lg font-bold text-gray-900">
                          {userStats?.memberSince ? (
                            <ClientDate
                              date={userStats.memberSince}
                              format="date"
                              locale="en-US"
                              dateOptions={{ year: 'numeric', month: 'long' }}
                            />
                          ) : user?.createdAt ? (
                            <ClientDate
                              date={user.createdAt}
                              format="date"
                              locale="en-US"
                              dateOptions={{ year: 'numeric', month: 'long' }}
                            />
                          ) : (
                            'N/A'
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Secondary Stats */}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-lg border border-gray-200 bg-white p-6">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-600">
                            {t('profile.stats.notes')}
                          </p>
                          <svg
                            className="h-5 w-5 text-yellow-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                        </div>
                        <p className="text-3xl font-bold text-gray-900">
                          {userStats?.stats.notes ?? 0}
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-white p-6">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-600">
                            {t('profile.stats.reports')}
                          </p>
                          <svg
                            className="h-5 w-5 text-indigo-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                        </div>
                        <p className="text-3xl font-bold text-gray-900">
                          {userStats?.stats.reports ?? 0}
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-white p-6">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-600">
                            {t('profile.stats.aiChats')}
                          </p>
                          <svg
                            className="h-5 w-5 text-cyan-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                            />
                          </svg>
                        </div>
                        <p className="text-3xl font-bold text-gray-900">
                          {userStats?.stats.chatSessions ?? 0}
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-white p-6">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-600">
                            {t('profile.stats.imagesGenerated')}
                          </p>
                          <svg
                            className="h-5 w-5 text-pink-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                        </div>
                        <p className="text-3xl font-bold text-gray-900">
                          {userStats?.stats.imagesGenerated ?? 0}
                        </p>
                      </div>
                    </div>

                    {/* Recent Activity */}
                    <SettingsSectionCard
                      title={t('profile.stats.recentActivity')}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
                          <span className="text-2xl font-bold text-blue-600">
                            {userStats?.activity.recentActivityCount ?? 0}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">
                            {t('profile.stats.totalActivities')}
                          </p>
                          {userStats?.activity.breakdown &&
                            userStats.activity.breakdown.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {userStats.activity.breakdown.map((item) => (
                                  <span
                                    key={item.type}
                                    className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600"
                                  >
                                    {item.type}: {item.count}
                                  </span>
                                ))}
                              </div>
                            )}
                        </div>
                      </div>
                    </SettingsSectionCard>

                    {/* AI Teams Created */}
                    <SettingsSectionCard
                      title={t('profile.stats.aiTeamsCreated')}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-purple-100">
                          <span className="text-2xl font-bold text-purple-600">
                            {userStats?.stats.topicsCreated ?? 0}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">
                            {t('profile.stats.aiTeamsDesc')}
                          </p>
                        </div>
                      </div>
                    </SettingsSectionCard>
                  </>
                )}
              </div>
            )}

            {/* Integrations Tab */}
            {activeTab === 'integrations' && (
              <div className="space-y-6">
                {/* Notion Integration */}
                <SettingsSectionCard
                  icon={
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-900">
                      <svg
                        className="h-7 w-7 text-white"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466l1.823 1.447zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952l1.448.327s0 .84-1.168.84l-3.22.186c-.094-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.62c-.094-.42.14-1.026.793-1.073l3.456-.233 4.763 7.279V9.014l-1.215-.14c-.093-.513.28-.886.747-.933l3.223-.186z" />
                      </svg>
                    </div>
                  }
                  title={t('profile.integrations.notionIntegration')}
                  description={t('profile.integrations.notionDesc')}
                >
                  {integrationsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-900" />
                    </div>
                  ) : notionConnections.length > 0 ? (
                    <div className="space-y-4">
                      {/* Connected Workspaces */}
                      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <svg
                            className="h-5 w-5 text-green-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          <span className="font-medium text-green-800">
                            {t('profile.integrations.connectedWorkspaces')}
                          </span>
                        </div>
                        <div className="space-y-3">
                          {notionConnections.map((conn) => (
                            <div
                              key={conn.id}
                              className="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm"
                            >
                              <div className="flex items-center gap-3">
                                {conn.workspaceIcon ? (
                                  conn.workspaceIcon.startsWith('http') ? (
                                    <img
                                      src={conn.workspaceIcon}
                                      alt=""
                                      className="h-8 w-8 rounded-md object-cover"
                                    />
                                  ) : (
                                    <span className="text-2xl">
                                      {conn.workspaceIcon}
                                    </span>
                                  )
                                ) : (
                                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-200">
                                    <svg
                                      className="h-5 w-5 text-gray-500"
                                      viewBox="0 0 24 24"
                                      fill="currentColor"
                                    >
                                      <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466l1.823 1.447z" />
                                    </svg>
                                  </div>
                                )}
                                <div>
                                  <p className="font-medium text-gray-900">
                                    {conn.workspaceName || 'Notion Workspace'}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {conn.pagesCount || 0} pages · Last synced:{' '}
                                    {conn.lastSyncAt ? (
                                      <ClientDate
                                        date={conn.lastSyncAt}
                                        format="date"
                                        locale="en-US"
                                      />
                                    ) : (
                                      'Never'
                                    )}
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={() => handleDisconnectNotion(conn.id)}
                                className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                              >
                                {t('profile.integrations.disconnect')}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Add Another Workspace */}
                      <button
                        onClick={handleConnectNotion}
                        disabled={connecting}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 py-3 text-sm font-medium text-gray-600 transition-colors hover:border-gray-400 hover:bg-gray-50"
                      >
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 4v16m8-8H4"
                          />
                        </svg>
                        {t('profile.integrations.addWorkspace')}
                      </button>

                      {/* Quick Link to Library */}
                      <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4">
                        <div>
                          <p className="font-medium text-gray-900">
                            {t('profile.integrations.viewNotionPages')}
                          </p>
                          <p className="text-sm text-gray-500">
                            {t('profile.integrations.accessSyncedPages')}
                          </p>
                        </div>
                        <Link
                          href="/library?tab=notion"
                          className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
                        >
                          {t('profile.integrations.openLibrary')}
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Setup Guide */}
                      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                        <h3 className="mb-3 font-medium text-blue-900">
                          {t('profile.integrations.setupGuide')}
                        </h3>
                        <div className="space-y-4">
                          <div className="flex gap-3">
                            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                              1
                            </div>
                            <div>
                              <p className="font-medium text-blue-900">
                                {t('profile.integrations.clickConnect')}
                              </p>
                              <p className="text-sm text-blue-700">
                                {t('profile.integrations.redirectToNotion')}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-3">
                            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                              2
                            </div>
                            <div>
                              <p className="font-medium text-blue-900">
                                {t('profile.integrations.selectPages')}
                              </p>
                              <p className="text-sm text-blue-700">
                                {t('profile.integrations.selectPagesDesc')}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-3">
                            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                              3
                            </div>
                            <div>
                              <p className="font-medium text-blue-900">
                                {t('profile.integrations.startSyncing')}
                              </p>
                              <p className="text-sm text-blue-700">
                                {t('profile.integrations.startSyncingDesc')}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Connect Button */}
                      <button
                        onClick={handleConnectNotion}
                        disabled={connecting}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-6 py-3 font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
                      >
                        {connecting ? (
                          <>
                            <svg
                              className="h-5 w-5 animate-spin"
                              fill="none"
                              viewBox="0 0 24 24"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              />
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                              />
                            </svg>
                            {t('profile.integrations.connecting')}
                          </>
                        ) : (
                          <>
                            <svg
                              className="h-5 w-5"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                            >
                              <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466l1.823 1.447z" />
                            </svg>
                            {t('profile.integrations.connectNotion')}
                          </>
                        )}
                      </button>

                      {/* Privacy Note */}
                      <p className="text-center text-xs text-gray-500">
                        {t('profile.integrations.privacyNote')}
                      </p>
                    </div>
                  )}
                </SettingsSectionCard>

                {/* Google Drive Integration */}
                <GoogleDriveConnectionCard />

                {/* Feishu Integration */}
                <FeishuBindingCard />

                {/* Other Integrations - Coming Soon */}
                <SettingsSectionCard
                  title={t('profile.integrations.moreIntegrations')}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    {/* Obsidian */}
                    <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4 opacity-60">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
                          <svg
                            className="h-6 w-6 text-purple-600"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">Obsidian</p>
                          <p className="text-xs text-gray-500">
                            {t('profile.integrations.comingSoon')}
                          </p>
                        </div>
                      </div>
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-500">
                        {t('profile.integrations.comingSoon')}
                      </span>
                    </div>

                    {/* Zotero */}
                    <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4 opacity-60">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
                          <svg
                            className="h-6 w-6 text-red-600"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">Zotero</p>
                          <p className="text-xs text-gray-500">
                            {t('profile.integrations.comingSoon')}
                          </p>
                        </div>
                      </div>
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-500">
                        {t('profile.integrations.comingSoon')}
                      </span>
                    </div>

                    {/* Roam Research */}
                    <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4 opacity-60">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                          <svg
                            className="h-6 w-6 text-blue-600"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <circle cx="12" cy="12" r="10" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            Roam Research
                          </p>
                          <p className="text-xs text-gray-500">
                            {t('profile.integrations.comingSoon')}
                          </p>
                        </div>
                      </div>
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-500">
                        {t('profile.integrations.comingSoon')}
                      </span>
                    </div>
                  </div>
                </SettingsSectionCard>

                {/* Message display */}
                {message && (
                  <div
                    className={`flex items-center gap-2 rounded-md border px-4 py-3 ${
                      message.type === 'success'
                        ? 'border-green-200 bg-green-50 text-green-800'
                        : 'border-red-200 bg-red-50 text-red-800'
                    }`}
                  >
                    <span className="text-sm font-medium">{message.text}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </AppShell>
  );
}

export default function Profile() {
  return <ProfileContent />;
}
