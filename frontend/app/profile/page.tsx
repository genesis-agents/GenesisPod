'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/contexts/AuthContext';
import {
  useThemeStore,
  USER_MESSAGE_STYLES,
  AI_MESSAGE_STYLES,
} from '@/stores/themeStore';
import { config } from '@/lib/config';

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
  const { user, isLoading, accessToken } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'profile' | 'settings' | 'stats'>(
    'profile'
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

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
        name: user.username || user.email.split('@')[0],
        email: user.email,
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
        const data = await response.json();
        setUserStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch user stats:', error);
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

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
    });
  };

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
      console.error('Failed to update profile:', error);
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
    <div className="flex h-screen bg-gray-50">
      <Sidebar />

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Profile & Settings
          </h1>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-4xl">
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
                Profile
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`px-4 py-2 font-medium transition-colors ${
                  activeTab === 'settings'
                    ? 'border-b-2 border-red-600 text-red-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Settings
              </button>
              <button
                onClick={() => setActiveTab('stats')}
                className={`px-4 py-2 font-medium transition-colors ${
                  activeTab === 'stats'
                    ? 'border-b-2 border-red-600 text-red-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Statistics
              </button>
            </div>

            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="space-y-6">
                {/* Avatar Section */}
                <div className="rounded-lg border border-gray-200 bg-white p-6">
                  <h2 className="mb-4 text-lg font-semibold">
                    Profile Picture
                  </h2>
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
                        Profile picture is managed by Google
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Update your Google profile to change your avatar
                      </p>
                    </div>
                  </div>
                </div>

                {/* Basic Info */}
                <div className="rounded-lg border border-gray-200 bg-white p-6">
                  <h2 className="mb-4 text-lg font-semibold">
                    Basic Information
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Name
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
                        Email
                      </label>
                      <input
                        type="email"
                        value={userData.email}
                        disabled
                        className="w-full rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-gray-500"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Email cannot be changed
                      </p>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Bio
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
                </div>

                {/* Interests */}
                <div className="rounded-lg border border-gray-200 bg-white p-6">
                  <h2 className="mb-4 text-lg font-semibold">
                    Research Interests
                  </h2>
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
                      placeholder="Enter interest..."
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                    <button
                      onClick={handleAddInterest}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                    >
                      Add
                    </button>
                  </div>
                </div>

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
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            )}

            {/* Settings Tab */}
            {activeTab === 'settings' && (
              <div className="space-y-6">
                {/* Chat Appearance Settings */}
                <div className="rounded-lg border border-gray-200 bg-white p-6">
                  <h2 className="mb-4 text-lg font-semibold">
                    Chat Appearance
                  </h2>
                  <div className="space-y-6">
                    {/* User Message Style */}
                    <div>
                      <p className="mb-3 font-medium text-gray-900">
                        My Message Style
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
                        AI Message Style
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
                        Preview
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
                </div>

                {/* Notification Preferences */}
                <div className="rounded-lg border border-gray-200 bg-white p-6">
                  <h2 className="mb-4 text-lg font-semibold">
                    Notification Preferences
                  </h2>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">
                          Email Notifications
                        </p>
                        <p className="text-sm text-gray-500">
                          Receive email updates about your activity
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
                          Recommendation Notifications
                        </p>
                        <p className="text-sm text-gray-500">
                          Get notified about new paper recommendations
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
                          Weekly Digest
                        </p>
                        <p className="text-sm text-gray-500">
                          Receive a weekly summary of trending papers
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
                </div>

                {/* Appearance Settings */}
                <div className="rounded-lg border border-gray-200 bg-white p-6">
                  <h2 className="mb-4 text-lg font-semibold">Appearance</h2>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">Dark Mode</p>
                        <p className="text-sm text-gray-500">
                          Use dark theme across the application
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
                        Language
                      </label>
                      <select
                        value={settings.language}
                        onChange={(e) =>
                          setSettings({ ...settings, language: e.target.value })
                        }
                        className="rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                      >
                        <option value="en">English</option>
                        <option value="zh">中文</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end">
                  <button className="rounded-lg bg-red-600 px-6 py-2 font-medium text-white transition-colors hover:bg-red-700">
                    Save Settings
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
                            Bookmarked
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
                            Resources Viewed
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
                            Comments
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
                            Member Since
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
                          {userStats?.memberSince
                            ? formatDate(userStats.memberSince)
                            : user?.createdAt
                              ? formatDate(user.createdAt)
                              : 'N/A'}
                        </p>
                      </div>
                    </div>

                    {/* Secondary Stats */}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-lg border border-gray-200 bg-white p-6">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-600">
                            Notes
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
                            Reports
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
                            AI Chats
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
                            Images Generated
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
                    <div className="rounded-lg border border-gray-200 bg-white p-6">
                      <h2 className="mb-4 text-lg font-semibold">
                        Recent Activity (Last 30 Days)
                      </h2>
                      <div className="flex items-center gap-4">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
                          <span className="text-2xl font-bold text-blue-600">
                            {userStats?.activity.recentActivityCount ?? 0}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">
                            Total activities in the last 30 days
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
                    </div>

                    {/* AI Teams Created */}
                    <div className="rounded-lg border border-gray-200 bg-white p-6">
                      <h2 className="mb-4 text-lg font-semibold">
                        AI Teams Created
                      </h2>
                      <div className="flex items-center gap-4">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-purple-100">
                          <span className="text-2xl font-bold text-purple-600">
                            {userStats?.stats.topicsCreated ?? 0}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">
                            AI Teams topics you have created
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function Profile() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Avoid hydration mismatch by not rendering until mounted
  if (!isMounted) {
    return null;
  }

  return <ProfileContent />;
}
