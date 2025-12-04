'use client';

import { useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import SettingsNav from '@/components/admin/SettingsNav';
import WhitelistManagement from '@/components/admin/WhitelistManagement';
import DataQualityManagement from '@/components/admin/DataQualityManagement';
import AIModelSettings from '@/components/admin/AIModelSettings';
import SystemSettings from '@/components/admin/SystemSettings';

type SettingsTab = 'whitelist' | 'quality' | 'ai-models' | 'system';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('whitelist');

  return (
    <div className="flex h-screen bg-gray-50/30">
      <Sidebar />
      <div className="flex-1 overflow-hidden">
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="border-b border-gray-100 bg-white/50 px-8 py-6 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/10">
                <svg
                  className="h-5 w-5 text-violet-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                </svg>
              </div>
              <h1 className="text-lg font-semibold text-gray-900">
                System Settings
              </h1>
            </div>
          </div>

          {/* Navigation Tabs */}
          <SettingsNav activeTab={activeTab} setActiveTab={setActiveTab} />

          {/* Content */}
          <div className="flex-1 overflow-auto">
            {activeTab === 'whitelist' && <WhitelistManagement />}
            {activeTab === 'quality' && <DataQualityManagement />}
            {activeTab === 'ai-models' && <AIModelSettings />}
            {activeTab === 'system' && <SystemSettings />}
          </div>
        </div>
      </div>
    </div>
  );
}
