'use client';

/**
 * 增强版资源 @ 提及选择器
 * Genspark 风格：显示资源缩略图、类型图标、AI 摘要
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useResourceStore } from '@/stores/aiOfficeStore';
import {
  PlayCircleIcon,
  DocumentTextIcon,
  GlobeAltIcon,
  PhotoIcon,
  TableCellsIcon,
  SparklesIcon,
  CheckIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import type { Resource } from '@/types/ai-office';

interface ResourceMentionMenuProps {
  isOpen: boolean;
  searchQuery: string;
  position: { top: number; left: number };
  selectedIndex: number;
  onSelect: (resourceId: string | 'all') => void;
  onClose: () => void;
  onNavigate: (direction: 'up' | 'down') => void;
}

// 资源类型图标映射
const getResourceIcon = (type: string) => {
  switch (type) {
    case 'youtube_video':
      return PlayCircleIcon;
    case 'academic_paper':
      return DocumentTextIcon;
    case 'web_page':
      return GlobeAltIcon;
    case 'image':
      return PhotoIcon;
    case 'spreadsheet':
      return TableCellsIcon;
    default:
      return DocumentTextIcon;
  }
};

// 资源类型颜色
const getResourceColor = (type: string): string => {
  switch (type) {
    case 'youtube_video':
      return 'text-red-500 bg-red-50';
    case 'academic_paper':
      return 'text-blue-500 bg-blue-50';
    case 'web_page':
      return 'text-green-500 bg-green-50';
    case 'image':
      return 'text-purple-500 bg-purple-50';
    case 'spreadsheet':
      return 'text-emerald-500 bg-emerald-50';
    default:
      return 'text-gray-500 bg-gray-50';
  }
};

// 资源类型标签
const getResourceTypeLabel = (type: string): string => {
  switch (type) {
    case 'youtube_video':
      return 'YouTube';
    case 'academic_paper':
      return '论文';
    case 'web_page':
      return '网页';
    case 'image':
      return '图片';
    case 'spreadsheet':
      return '表格';
    default:
      return '资源';
  }
};

export default function ResourceMentionMenu({
  isOpen,
  searchQuery,
  position,
  selectedIndex,
  onSelect,
  onClose,
  onNavigate,
}: ResourceMentionMenuProps) {
  const resources = useResourceStore((state) => state.resources);
  const selectedResourceIds = useResourceStore(
    (state) => state.selectedResourceIds
  );

  // 过滤资源
  const filteredResources = useMemo(() => {
    if (!searchQuery) return resources;
    const query = searchQuery.toLowerCase();
    return resources.filter((r) => {
      const title = r.metadata?.title?.toLowerCase() || '';
      const summary = r.aiAnalysis?.summary?.toLowerCase() || '';
      return title.includes(query) || summary.includes(query);
    });
  }, [resources, searchQuery]);

  // 键盘事件处理
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const totalOptions = filteredResources.length + 1; // +1 for @all

  return (
    <div
      className="fixed z-[100] w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        maxHeight: '360px',
      }}
    >
      {/* 搜索提示头 */}
      <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
        <MagnifyingGlassIcon className="h-4 w-4 text-gray-400" />
        <span className="text-xs text-gray-500">
          {searchQuery ? `搜索: "${searchQuery}"` : '输入关键词搜索资源'}
        </span>
        <span className="ml-auto text-xs text-gray-400">
          {filteredResources.length} 个结果
        </span>
      </div>

      {/* 可滚动内容区 */}
      <div className="max-h-72 overflow-y-auto">
        {/* @all 选项 */}
        <button
          onClick={() => onSelect('all')}
          className={`flex w-full items-center gap-3 px-4 py-3 transition-colors ${
            selectedIndex === 0 ? 'bg-blue-50' : 'hover:bg-gray-50'
          }`}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-500">
            <SparklesIcon className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 text-left">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-blue-600">@all</span>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                全部
              </span>
            </div>
            <p className="text-xs text-gray-500">
              引用所有 {resources.length} 个资源
            </p>
          </div>
          {selectedIndex === 0 && (
            <CheckIcon className="h-5 w-5 text-blue-500" />
          )}
        </button>

        {/* 分隔线 */}
        <div className="border-t border-gray-100" />

        {/* 已选择的资源（优先显示） */}
        {selectedResourceIds.length > 0 && (
          <>
            <div className="px-4 py-1.5">
              <span className="text-xs font-medium text-gray-400">已选择</span>
            </div>
            {filteredResources
              .filter((r) => selectedResourceIds.includes(r._id))
              .map((resource, idx) => {
                const Icon = getResourceIcon(resource.resourceType);
                const colorClass = getResourceColor(resource.resourceType);
                const globalIndex = idx + 1;
                const isSelected = selectedIndex === globalIndex;

                return (
                  <ResourceItem
                    key={resource._id}
                    resource={resource}
                    Icon={Icon}
                    colorClass={colorClass}
                    isSelected={isSelected}
                    isChecked={true}
                    onClick={() => onSelect(resource._id)}
                  />
                );
              })}
            <div className="border-t border-gray-100" />
          </>
        )}

        {/* 未选择的资源 */}
        <div className="px-4 py-1.5">
          <span className="text-xs font-medium text-gray-400">
            {selectedResourceIds.length > 0 ? '其他资源' : '所有资源'}
          </span>
        </div>
        {filteredResources
          .filter((r) => !selectedResourceIds.includes(r._id))
          .map((resource, idx) => {
            const Icon = getResourceIcon(resource.resourceType);
            const colorClass = getResourceColor(resource.resourceType);
            const selectedCount = filteredResources.filter((r) =>
              selectedResourceIds.includes(r._id)
            ).length;
            const globalIndex = idx + selectedCount + 1;
            const isSelected = selectedIndex === globalIndex;

            return (
              <ResourceItem
                key={resource._id}
                resource={resource}
                Icon={Icon}
                colorClass={colorClass}
                isSelected={isSelected}
                isChecked={false}
                onClick={() => onSelect(resource._id)}
              />
            );
          })}

        {/* 无结果提示 */}
        {filteredResources.length === 0 && (
          <div className="py-8 text-center">
            <DocumentTextIcon className="mx-auto mb-2 h-8 w-8 text-gray-300" />
            <p className="text-sm text-gray-500">未找到匹配的资源</p>
            <p className="mt-1 text-xs text-gray-400">尝试更改搜索关键词</p>
          </div>
        )}
      </div>

      {/* 底部提示 */}
      <div className="border-t border-gray-100 bg-gray-50 px-4 py-2">
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <kbd className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px]">
              Enter
            </kbd>
            选择
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px]">
              Esc
            </kbd>
            关闭
          </span>
        </div>
      </div>
    </div>
  );
}

// 资源项组件
interface ResourceItemProps {
  resource: Resource;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  colorClass: string;
  isSelected: boolean;
  isChecked: boolean;
  onClick: () => void;
}

function ResourceItem({
  resource,
  Icon,
  colorClass,
  isSelected,
  isChecked,
  onClick,
}: ResourceItemProps) {
  const title = resource.metadata?.title || '无标题';
  const summary =
    resource.aiAnalysis?.summary ||
    ('description' in resource.metadata ? resource.metadata.description : '') ||
    '';
  const typeLabel = getResourceTypeLabel(resource.resourceType);

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start gap-3 px-4 py-3 transition-colors ${
        isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
      }`}
    >
      {/* 缩略图/图标 */}
      <div
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${colorClass.split(' ')[1]}`}
      >
        {resource.resourceType === 'youtube_video' &&
        resource.metadata?.thumbnails?.medium ? (
          <img
            src={resource.metadata.thumbnails.medium}
            alt=""
            className="h-10 w-10 rounded-lg object-cover"
          />
        ) : (
          <Icon className={`h-5 w-5 ${colorClass.split(' ')[0]}`} />
        )}
      </div>

      {/* 内容 */}
      <div className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-gray-900">
            {title}
          </span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${colorClass}`}
          >
            {typeLabel}
          </span>
        </div>
        {summary && (
          <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">
            {summary.substring(0, 80)}...
          </p>
        )}
      </div>

      {/* 选中状态 */}
      {(isSelected || isChecked) && (
        <CheckIcon
          className={`h-5 w-5 flex-shrink-0 ${isChecked ? 'text-green-500' : 'text-blue-500'}`}
        />
      )}
    </button>
  );
}
