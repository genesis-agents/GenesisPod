/**
 * Version changelog configuration
 * 版本更新日志配置
 */

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: {
    type: 'feature' | 'fix' | 'improvement' | 'breaking';
    description: string;
  }[];
}

export const CURRENT_VERSION = '0.3.0';

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.3.0',
    date: '2025-01-21',
    changes: [
      {
        type: 'feature',
        description:
          'Profile个人信息编辑功能 - 支持修改用户名、个人简介和研究兴趣',
      },
      {
        type: 'feature',
        description: '兴趣标签管理 - 可以添加和删除研究兴趣标签',
      },
      {
        type: 'improvement',
        description: '用户认证体验优化 - 登录按钮移至侧边栏，Profile菜单项',
      },
    ],
  },
  {
    version: '0.2.0',
    date: '2025-01-20',
    changes: [
      {
        type: 'feature',
        description: 'Google OAuth 登录 - 支持使用Google账号登录',
      },
      {
        type: 'feature',
        description: 'My Library功能 - 查看和管理收藏的论文和资源',
      },
      {
        type: 'fix',
        description: '修复My Library无法显示书签的问题',
      },
    ],
  },
  {
    version: '0.1.0',
    date: '2025-01-15',
    changes: [
      {
        type: 'feature',
        description: '论文搜索和浏览功能',
      },
      {
        type: 'feature',
        description: '书签收藏功能',
      },
      {
        type: 'feature',
        description: 'AI总结和翻译功能',
      },
    ],
  },
];

/**
 * Get the latest changelog entry
 */
export function getLatestChangelog(): ChangelogEntry {
  return CHANGELOG[0];
}

/**
 * Check if there's a new version
 */
export function hasNewVersion(): boolean {
  if (typeof window === 'undefined') return false;

  const lastSeenVersion = localStorage.getItem('lastSeenVersion');
  return !lastSeenVersion || lastSeenVersion !== CURRENT_VERSION;
}

/**
 * Mark current version as seen
 */
export function markVersionAsSeen(): void {
  if (typeof window === 'undefined') return;

  localStorage.setItem('lastSeenVersion', CURRENT_VERSION);
}

/**
 * Get change type display info
 */
export function getChangeTypeInfo(type: ChangelogEntry['changes'][0]['type']): {
  label: string;
  color: string;
} {
  switch (type) {
    case 'feature':
      return { label: '新功能', color: 'bg-green-100 text-green-800' };
    case 'fix':
      return { label: '修复', color: 'bg-red-100 text-red-800' };
    case 'improvement':
      return { label: '优化', color: 'bg-blue-100 text-blue-800' };
    case 'breaking':
      return { label: '破坏性更新', color: 'bg-orange-100 text-orange-800' };
  }
}
