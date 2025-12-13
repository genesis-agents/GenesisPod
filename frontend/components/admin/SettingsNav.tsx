'use client';

type SettingsTab =
  | 'whitelist'
  | 'quality'
  | 'ai-models'
  | 'external-api'
  | 'storage'
  | 'users'
  | 'system';

interface SettingsNavProps {
  activeTab: SettingsTab;
  setActiveTab: (tab: SettingsTab) => void;
}

export default function SettingsNav({
  activeTab,
  setActiveTab,
}: SettingsNavProps) {
  const tabs = [
    {
      id: 'whitelist' as SettingsTab,
      label: 'Source Whitelists',
      description: 'Configure domain whitelists for each resource type',
      icon: (active: boolean) => (
        <svg
          className={`h-5 w-5 transition-colors ${active ? 'text-violet-600' : 'text-gray-500'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12l2 2 4-4m7 0a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
    },
    {
      id: 'quality' as SettingsTab,
      label: 'Quality Rules',
      description: 'Configure quality scoring and filtering rules',
      icon: (active: boolean) => (
        <svg
          className={`h-5 w-5 transition-colors ${active ? 'text-violet-600' : 'text-gray-500'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
      ),
    },
    {
      id: 'ai-models' as SettingsTab,
      label: 'AI Models',
      description: 'Configure AI models and API settings',
      icon: (active: boolean) => (
        <svg
          className={`h-5 w-5 transition-colors ${active ? 'text-violet-600' : 'text-gray-500'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
      ),
    },
    {
      id: 'external-api' as SettingsTab,
      label: 'External APIs',
      description: 'Configure external API integrations',
      icon: (active: boolean) => (
        <svg
          className={`h-5 w-5 transition-colors ${active ? 'text-violet-600' : 'text-gray-500'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
          />
        </svg>
      ),
    },
    {
      id: 'storage' as SettingsTab,
      label: 'Storage',
      description: 'Configure file storage settings',
      icon: (active: boolean) => (
        <svg
          className={`h-5 w-5 transition-colors ${active ? 'text-violet-600' : 'text-gray-500'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
          />
        </svg>
      ),
    },
    {
      id: 'users' as SettingsTab,
      label: 'Users',
      description: 'Manage user accounts and permissions',
      icon: (active: boolean) => (
        <svg
          className={`h-5 w-5 transition-colors ${active ? 'text-violet-600' : 'text-gray-500'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      ),
    },
    {
      id: 'system' as SettingsTab,
      label: 'System',
      description: 'General system settings and configurations',
      icon: (active: boolean) => (
        <svg
          className={`h-5 w-5 transition-colors ${active ? 'text-violet-600' : 'text-gray-500'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      ),
    },
  ];

  return (
    <div className="border-b border-gray-100 bg-white/50 backdrop-blur-sm">
      <div className="px-8">
        <nav className="flex space-x-1" aria-label="Settings tabs">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="group relative px-4 py-3.5 transition-all"
                title={tab.description}
              >
                <div className="flex items-center gap-2">
                  {tab.icon(isActive)}
                  <span
                    className={`text-sm font-medium transition-colors ${
                      isActive
                        ? 'text-gray-900'
                        : 'text-gray-700 group-hover:text-gray-900'
                    }`}
                  >
                    {tab.label}
                  </span>
                </div>

                {/* Active indicator - bottom border */}
                <div
                  className={`absolute bottom-0 left-0 right-0 h-0.5 transition-all ${
                    isActive ? 'bg-violet-600' : 'bg-transparent'
                  }`}
                  style={{
                    opacity: isActive ? 1 : 0,
                  }}
                />
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
