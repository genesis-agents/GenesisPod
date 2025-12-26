'use client';

/**
 * GlobalStylePanel - PPT 全局样式管理面板
 *
 * 功能：
 * 1. 显示和编辑页脚、页眉、安全区域配置
 * 2. 颜色方案管理
 * 3. 批量应用样式到所有页面
 * 4. 支持实时预览
 *
 * API 调用：
 * - GET /api/ai-office/ppt/{id}/global-style - 获取全局样式
 * - POST /api/ai-office/ppt/{id}/global-style - 保存全局样式
 * - POST /api/ai-office/ppt/{id}/batch-update - 批量更新样式
 */

import React, { useState, useEffect } from 'react';
import {
  Settings,
  Save,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Palette,
  Layout,
  Type,
  AlertCircle,
  Check,
  Loader2,
} from 'lucide-react';
import { useApiGet, useApiPost } from '@/hooks/core/useApi';

// ============================================
// 类型定义
// ============================================

interface TextStyle {
  fontSize: number;
  fontFamily: string;
  color: string;
  fontWeight?: 'normal' | 'bold' | 'lighter';
  fontStyle?: 'normal' | 'italic';
}

interface FooterConfig {
  format: string;
  position: 'bottom-left' | 'bottom-center' | 'bottom-right';
  style: TextStyle;
  icon?: string;
  brand?: string;
}

interface HeaderConfig {
  content: string;
  position: 'top-left' | 'top-center' | 'top-right';
  style: TextStyle;
}

interface SafeAreaConfig {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface GlobalStyleConfig {
  header?: HeaderConfig;
  footer?: FooterConfig;
  safeArea?: SafeAreaConfig;
  colorScheme?: {
    primary: string;
    secondary: string;
    accent: string;
    text: string;
    background: string;
  };
  fontFamily?: string;
  baseFontSize?: number;
}

interface GlobalStylePanelProps {
  pptId: string;
  onStyleApplied?: () => void;
  className?: string;
}

// ============================================
// 子组件 - 折叠面板
// ============================================

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  icon,
  children,
  defaultOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700"
      >
        <div className="flex items-center gap-3">
          <div className="text-blue-500">{icon}</div>
          <span className="font-medium text-gray-900 dark:text-white">
            {title}
          </span>
        </div>
        {isOpen ? (
          <ChevronUp className="h-5 w-5 text-gray-400" />
        ) : (
          <ChevronDown className="h-5 w-5 text-gray-400" />
        )}
      </button>
      {isOpen && (
        <div className="border-t border-gray-200 p-4 dark:border-gray-700">
          {children}
        </div>
      )}
    </div>
  );
};

// ============================================
// 主组件
// ============================================

export const GlobalStylePanel: React.FC<GlobalStylePanelProps> = ({
  pptId,
  onStyleApplied,
  className = '',
}) => {
  // 状态管理
  const [config, setConfig] = useState<GlobalStyleConfig>({
    header: {
      content: '',
      position: 'top-center',
      style: {
        fontSize: 12,
        fontFamily: 'Noto Sans SC, sans-serif',
        color: '#64748b',
        fontWeight: 'normal',
      },
    },
    footer: {
      format: '第{page}页',
      position: 'bottom-center',
      style: {
        fontSize: 12,
        fontFamily: 'Noto Sans SC, sans-serif',
        color: '#64748b',
        fontWeight: 'normal',
      },
      brand: '',
      icon: '',
    },
    safeArea: {
      top: 40,
      bottom: 40,
      left: 60,
      right: 60,
    },
    colorScheme: {
      primary: '#1e3a5f',
      secondary: '#0891b2',
      accent: '#f59e0b',
      text: '#1e293b',
      background: '#ffffff',
    },
    fontFamily: 'Noto Sans SC, sans-serif',
    baseFontSize: 16,
  });

  const [applyToPages, setApplyToPages] = useState<'all' | 'custom'>('all');
  const [customPages, setCustomPages] = useState<string>('');

  // API Hooks
  const {
    data: globalStyleData,
    loading: loadingStyle,
    execute: fetchGlobalStyle,
  } = useApiGet<{ success: boolean; globalStyle: GlobalStyleConfig | null }>(
    `/api/ai-office/ppt/${pptId}/global-style`,
    { immediate: true }
  );

  const { execute: saveGlobalStyle, loading: savingStyle } = useApiPost(
    `/api/ai-office/ppt/${pptId}/global-style`
  );

  const { execute: batchUpdate, loading: applyingStyle } = useApiPost(
    `/api/ai-office/ppt/${pptId}/batch-update`
  );

  // 加载全局样式
  useEffect(() => {
    if (globalStyleData?.success && globalStyleData.globalStyle) {
      setConfig({
        ...config,
        ...globalStyleData.globalStyle,
      });
    }
  }, [globalStyleData]);

  // ============================================
  // 事件处理
  // ============================================

  const handleSaveConfig = async () => {
    try {
      await saveGlobalStyle(config);
      alert('全局样式已保存');
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败，请重试');
    }
  };

  const handleApplyToSlides = async () => {
    try {
      // 解析目标页面
      let targetSlides: number[] | undefined;
      if (applyToPages === 'custom') {
        targetSlides = customPages
          .split(',')
          .map((p) => parseInt(p.trim()))
          .filter((p) => !isNaN(p));

        if (targetSlides.length === 0) {
          alert('请输入有效的页码，例如：1,2,3');
          return;
        }
      }

      // 批量更新页脚
      if (config.footer) {
        await batchUpdate({
          operation: 'update_footer',
          config: config.footer,
          targetSlides,
        });
      }

      // 批量更新页眉
      if (config.header?.content) {
        await batchUpdate({
          operation: 'update_header',
          config: config.header,
          targetSlides,
        });
      }

      // 批量更新安全区域
      if (config.safeArea) {
        await batchUpdate({
          operation: 'update_safe_area',
          config: config.safeArea,
          targetSlides,
        });
      }

      // 保存全局样式
      await saveGlobalStyle(config);

      alert('样式应用成功！');
      onStyleApplied?.();
    } catch (error) {
      console.error('应用样式失败:', error);
      alert('应用失败，请重试');
    }
  };

  const handleReset = () => {
    if (confirm('确定要重置为默认配置吗？')) {
      fetchGlobalStyle();
    }
  };

  // ============================================
  // 渲染
  // ============================================

  if (loadingStyle) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-500">加载配置中...</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-blue-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            全局样式设置
          </h2>
        </div>
        <button
          onClick={handleReset}
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
          title="重置配置"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* 页脚配置 */}
      <CollapsibleSection
        title="页脚设置"
        icon={<Type className="h-5 w-5" />}
        defaultOpen
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              格式化字符串
            </label>
            <input
              type="text"
              value={config.footer?.format || ''}
              onChange={(e) =>
                setConfig({
                  ...config,
                  footer: { ...config.footer!, format: e.target.value },
                })
              }
              placeholder="例如：第{page}页 | {brand}"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
            <p className="mt-1 text-xs text-gray-500">
              支持占位符：{'{page}'} 页码, {'{brand}'} 品牌名, {'{icon}'} 图标
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                品牌名
              </label>
              <input
                type="text"
                value={config.footer?.brand || ''}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    footer: { ...config.footer!, brand: e.target.value },
                  })
                }
                placeholder="DeepDive"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                位置
              </label>
              <select
                value={config.footer?.position || 'bottom-center'}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    footer: {
                      ...config.footer!,
                      position: e.target.value as any,
                    },
                  })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="bottom-left">左下</option>
                <option value="bottom-center">居中</option>
                <option value="bottom-right">右下</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                字体大小
              </label>
              <input
                type="number"
                value={config.footer?.style.fontSize || 12}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    footer: {
                      ...config.footer!,
                      style: {
                        ...config.footer!.style,
                        fontSize: parseInt(e.target.value),
                      },
                    },
                  })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                颜色
              </label>
              <input
                type="color"
                value={config.footer?.style.color || '#64748b'}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    footer: {
                      ...config.footer!,
                      style: { ...config.footer!.style, color: e.target.value },
                    },
                  })
                }
                className="h-10 w-full rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-600"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                粗细
              </label>
              <select
                value={config.footer?.style.fontWeight || 'normal'}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    footer: {
                      ...config.footer!,
                      style: {
                        ...config.footer!.style,
                        fontWeight: e.target.value as any,
                      },
                    },
                  })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="normal">正常</option>
                <option value="bold">粗体</option>
                <option value="lighter">细体</option>
              </select>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* 页眉配置 */}
      <CollapsibleSection title="页眉设置" icon={<Type className="h-5 w-5" />}>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              内容
            </label>
            <input
              type="text"
              value={config.header?.content || ''}
              onChange={(e) =>
                setConfig({
                  ...config,
                  header: { ...config.header!, content: e.target.value },
                })
              }
              placeholder="例如：AI 驱动的演示文稿"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                位置
              </label>
              <select
                value={config.header?.position || 'top-center'}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    header: {
                      ...config.header!,
                      position: e.target.value as any,
                    },
                  })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="top-left">左上</option>
                <option value="top-center">居中</option>
                <option value="top-right">右上</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                字体大小
              </label>
              <input
                type="number"
                value={config.header?.style.fontSize || 12}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    header: {
                      ...config.header!,
                      style: {
                        ...config.header!.style,
                        fontSize: parseInt(e.target.value),
                      },
                    },
                  })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* 安全区域配置 */}
      <CollapsibleSection
        title="安全区域"
        icon={<Layout className="h-5 w-5" />}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            定义内容距离边缘的最小距离（像素）
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                顶部
              </label>
              <input
                type="number"
                value={config.safeArea?.top || 40}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    safeArea: {
                      ...config.safeArea!,
                      top: parseInt(e.target.value),
                    },
                  })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                底部
              </label>
              <input
                type="number"
                value={config.safeArea?.bottom || 40}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    safeArea: {
                      ...config.safeArea!,
                      bottom: parseInt(e.target.value),
                    },
                  })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                左侧
              </label>
              <input
                type="number"
                value={config.safeArea?.left || 60}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    safeArea: {
                      ...config.safeArea!,
                      left: parseInt(e.target.value),
                    },
                  })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                右侧
              </label>
              <input
                type="number"
                value={config.safeArea?.right || 60}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    safeArea: {
                      ...config.safeArea!,
                      right: parseInt(e.target.value),
                    },
                  })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* 颜色方案配置 */}
      <CollapsibleSection
        title="颜色方案"
        icon={<Palette className="h-5 w-5" />}
      >
        <div className="grid grid-cols-2 gap-4">
          {Object.entries({
            primary: '主色',
            secondary: '辅助色',
            accent: '强调色',
            text: '文字色',
            background: '背景色',
          }).map(([key, label]) => (
            <div key={key}>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {label}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={
                    config.colorScheme?.[
                      key as keyof typeof config.colorScheme
                    ] || '#ffffff'
                  }
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      colorScheme: {
                        ...config.colorScheme!,
                        [key]: e.target.value,
                      },
                    })
                  }
                  className="h-10 w-16 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-600"
                />
                <input
                  type="text"
                  value={
                    config.colorScheme?.[
                      key as keyof typeof config.colorScheme
                    ] || ''
                  }
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      colorScheme: {
                        ...config.colorScheme!,
                        [key]: e.target.value,
                      },
                    })
                  }
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* 应用范围选择 */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          应用到页面
        </label>
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="applyRange"
                value="all"
                checked={applyToPages === 'all'}
                onChange={(e) => setApplyToPages(e.target.value as 'all')}
                className="text-blue-500 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                所有页面
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="applyRange"
                value="custom"
                checked={applyToPages === 'custom'}
                onChange={(e) => setApplyToPages(e.target.value as 'custom')}
                className="text-blue-500 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                指定页面
              </span>
            </label>
          </div>
          {applyToPages === 'custom' && (
            <input
              type="text"
              value={customPages}
              onChange={(e) => setCustomPages(e.target.value)}
              placeholder="例如：1,2,3,5-8"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          )}
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSaveConfig}
          disabled={savingStyle}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
        >
          {savingStyle ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          <span>保存配置</span>
        </button>
        <button
          onClick={handleApplyToSlides}
          disabled={applyingStyle}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {applyingStyle ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          <span>应用到页面</span>
        </button>
      </div>

      {/* 提示信息 */}
      <div className="flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div>
          <p className="font-medium">提示</p>
          <p className="mt-1 text-xs">
            保存配置：仅保存设置，不修改现有页面
            <br />
            应用到页面：将当前配置批量应用到选定的页面
          </p>
        </div>
      </div>
    </div>
  );
};

export default GlobalStylePanel;
