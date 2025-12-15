'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/layout/Sidebar';
import {
  useSettingsStore,
  AI_FEATURE_INFO,
  type AIFeatureSettings,
} from '@/stores/settingsStore';
import {
  FlaskConical,
  Sparkles,
  Zap,
  Layout,
  RotateCcw,
  MessageSquare,
} from 'lucide-react';

export default function Labs() {
  const { aiFeatures, setAIFeature, resetAIFeatures } = useSettingsStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex h-screen bg-gray-50">
        <Sidebar />
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" />
        </div>
      </div>
    );
  }

  const coreFeatures = AI_FEATURE_INFO.filter((f) => f.category === 'core');
  const betaFeatures = AI_FEATURE_INFO.filter((f) => f.category === 'beta');
  const uiFeatures = AI_FEATURE_INFO.filter((f) => f.category === 'ui');

  const getFeatureIcon = (icon: string) => {
    const iconClass = 'h-5 w-5';
    switch (icon) {
      case 'document':
        return (
          <svg
            className={iconClass}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        );
      case 'translate':
        return (
          <svg
            className={iconClass}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
            />
          </svg>
        );
      case 'sparkles':
        return <Sparkles className={iconClass} />;
      case 'users':
        return (
          <svg
            className={iconClass}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
        );
      case 'save':
        return (
          <svg
            className={iconClass}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
            />
          </svg>
        );
      case 'search':
        return (
          <svg
            className={iconClass}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        );
      case 'magic':
        return <Zap className={iconClass} />;
      case 'layout':
        return <Layout className={iconClass} />;
      case 'moon':
        return (
          <svg
            className={iconClass}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
            />
          </svg>
        );
      default:
        return <Sparkles className={iconClass} />;
    }
  };

  const renderFeatureCard = (
    feature: (typeof AI_FEATURE_INFO)[0],
    categoryColor: string
  ) => {
    const isEnabled = aiFeatures[feature.key];

    return (
      <div
        key={feature.key}
        className={`rounded-lg border bg-white p-5 transition-all ${
          isEnabled ? 'border-violet-200 shadow-md' : 'border-gray-200'
        }`}
      >
        <div className="flex items-start justify-between">
          <div className="flex flex-1 items-start gap-4">
            <div
              className={`rounded-lg p-2.5 ${
                isEnabled
                  ? `${categoryColor} text-white`
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {getFeatureIcon(feature.icon)}
            </div>
            <div className="flex-1">
              <div className="mb-1 flex items-center gap-2">
                <h3 className="font-semibold text-gray-900">{feature.name}</h3>
                {feature.category === 'beta' && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    Beta
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600">{feature.description}</p>
              {isEnabled && (
                <p className="mt-2 text-xs font-medium text-green-600">
                  Enabled
                </p>
              )}
            </div>
          </div>

          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={() =>
                setAIFeature(
                  feature.key,
                  !isEnabled as AIFeatureSettings[typeof feature.key]
                )
              }
              className="peer sr-only"
            />
            <div
              className={`peer h-6 w-11 rounded-full after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 ${
                isEnabled
                  ? 'bg-violet-600 peer-focus:ring-violet-300'
                  : 'bg-gray-200 peer-focus:ring-gray-300'
              }`}
            />
          </label>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
          <div className="flex items-center gap-3">
            <FlaskConical className="h-6 w-6 text-violet-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Labs</h1>
              <p className="text-sm text-gray-500">
                Customize your AI experience
              </p>
            </div>
          </div>
          <button
            onClick={resetAIFeatures}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50"
          >
            <RotateCcw className="h-4 w-4" />
            Reset to defaults
          </button>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-4xl">
            {/* Info Banner */}
            <div className="mb-6 rounded-lg border border-violet-200 bg-gradient-to-r from-violet-50 to-purple-50 p-4">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 flex-shrink-0 text-violet-600" />
                <div>
                  <h3 className="font-semibold text-violet-900">
                    AI Feature Controls
                  </h3>
                  <p className="mt-1 text-sm text-violet-700">
                    Toggle AI features on or off to customize your DeepDive
                    experience. Changes are saved automatically.
                  </p>
                </div>
              </div>
            </div>

            {/* Core AI Features */}
            <div className="mb-8">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-600">
                  {coreFeatures.filter((f) => aiFeatures[f.key]).length}
                </span>
                Core AI Features
              </h2>
              <div className="space-y-3">
                {coreFeatures.map((feature) =>
                  renderFeatureCard(feature, 'bg-violet-600')
                )}
              </div>
            </div>

            {/* Beta Features */}
            <div className="mb-8">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-600">
                  {betaFeatures.filter((f) => aiFeatures[f.key]).length}
                </span>
                Beta Features
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  Experimental
                </span>
              </h2>
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm text-amber-800">
                  Beta features are still in development. They may not work
                  perfectly and could change at any time.
                </p>
              </div>
              <div className="space-y-3">
                {betaFeatures.map((feature) =>
                  renderFeatureCard(feature, 'bg-amber-500')
                )}
              </div>
            </div>

            {/* UI Experiments */}
            <div className="mb-8">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-600">
                  {uiFeatures.filter((f) => aiFeatures[f.key]).length}
                </span>
                UI Experiments
              </h2>
              <div className="space-y-3">
                {uiFeatures.map((feature) =>
                  renderFeatureCard(feature, 'bg-blue-500')
                )}
              </div>
            </div>

            {/* Feedback CTA */}
            <div className="rounded-lg border border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100 p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100">
                  <MessageSquare className="h-6 w-6 text-violet-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">
                    Have feedback on these features?
                  </h3>
                  <p className="text-sm text-gray-600">
                    Your input helps us improve. Let us know what works and what
                    doesn't!
                  </p>
                </div>
                <Link
                  href="/feedback"
                  className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700"
                >
                  Send Feedback
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
                      d="M14 5l7 7m0 0l-7 7m7-7H3"
                    />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
