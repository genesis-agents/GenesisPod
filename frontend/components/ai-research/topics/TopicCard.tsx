/**
 * Topic Card Component
 *
 * 显示研究专题的卡片
 */

import type { ResearchTopic } from '@/types/topic-research';
import { ResearchTopicType, DimensionStatus } from '@/types/topic-research';
import { useTranslation } from '@/lib/i18n';
import { ApplicationButton } from './ApplicationButton';

interface TopicCardProps {
  topic: ResearchTopic;
  currentUserId?: string; // ★ 用于判断是否显示申请按钮
  onClick: () => void;
  onDelete: () => void;
  onShare?: () => void; // 打开共享设置弹窗
  onShareToSocial?: () => void; // ★ 打开社交分享弹窗
  onEdit?: () => void; // ★ 编辑专题
  onVisibilityChange?: (visibility: 'PRIVATE' | 'SHARED' | 'PUBLIC') => void; // ★ 切换可见性
  onCopyLink?: () => void; // ★ 复制链接
}

// Edit icon
const EditIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
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
);

// Icons
const TrashIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
    />
  </svg>
);

const ClockIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const FileTextIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
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

const LinkIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
    />
  </svg>
);

// Share icon (same as AI Image)
const ShareIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
    />
  </svg>
);

// Visibility icons (LockClosedIcon removed as unused)
const LockClosedIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
    />
  </svg>
);

const UsersIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
    />
  </svg>
);

const GlobeIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

// Visibility config factory
const getVisibilityConfig = (t: (key: string) => string) => ({
  PRIVATE: {
    label: t('topicResearch.visibility.private'),
    icon: <LockClosedIcon className="h-3 w-3" />,
    color: 'bg-gray-100 text-gray-600',
  },
  SHARED: {
    label: t('topicResearch.visibility.team'),
    icon: <UsersIcon className="h-3 w-3" />,
    color: 'bg-blue-100 text-blue-600',
  },
  PUBLIC: {
    label: t('topicResearch.visibility.public'),
    icon: <GlobeIcon className="h-3 w-3" />,
    color: 'bg-green-100 text-green-600',
  },
});

// Topic type icons and colors factory
const getTopicTypeConfig = (
  t: (key: string) => string
): Record<
  ResearchTopicType,
  { icon: React.ReactNode; gradient: string; label: string }
> => ({
  [ResearchTopicType.MACRO]: {
    icon: (
      <svg
        className="h-6 w-6 text-white"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    gradient: 'from-blue-500 to-cyan-600',
    label: t('topicResearch.researchTypes.macro'),
  },
  [ResearchTopicType.TECHNOLOGY]: {
    icon: (
      <svg
        className="h-6 w-6 text-white"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
    ),
    gradient: 'from-purple-500 to-pink-600',
    label: t('topicResearch.researchTypes.technology'),
  },
  [ResearchTopicType.COMPANY]: {
    icon: (
      <svg
        className="h-6 w-6 text-white"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
        />
      </svg>
    ),
    gradient: 'from-emerald-500 to-teal-600',
    label: t('topicResearch.researchTypes.company'),
  },
});

export function TopicCard({
  topic,
  currentUserId,
  onClick,
  onDelete,
  onShare,
  onShareToSocial,
  onEdit,
  onVisibilityChange,
  onCopyLink,
}: TopicCardProps) {
  const { t } = useTranslation();
  const visibilityConfig = getVisibilityConfig(t);
  const topicTypeConfig = getTopicTypeConfig(t);

  // ★ 判断是否是自己的专题
  const isOwnTopic = currentUserId && topic.userId === currentUserId;
  // ★ 判断是否显示申请加入按钮：非自己的 SHARED/PUBLIC 专题
  const canApply =
    !isOwnTopic &&
    topic.visibility &&
    ['SHARED', 'PUBLIC'].includes(topic.visibility);

  // ★ 点击可见性标签打开共享设置弹窗
  const handleVisibilityClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOwnTopic || !onShare) return;
    onShare(); // 打开共享设置弹窗
  };
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return t('topicResearch.never');
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours === 0) {
        const diffMins = Math.floor(diffMs / (1000 * 60));
        return t('topicResearch.minutesAgo', { count: diffMins });
      }
      return t('topicResearch.hoursAgo', { count: diffHours });
    }
    if (diffDays === 1) return t('topicResearch.yesterday');
    if (diffDays < 7) return t('topicResearch.daysAgo', { count: diffDays });
    return date.toLocaleDateString('zh-CN');
  };

  const typeConfig = topicTypeConfig[topic.type];

  // ★ 优先使用 Mission 任务数据（与详情页保持一致），否则回退到维度统计
  const hasMissionData =
    topic.missionTotalTasks !== undefined && topic.missionTotalTasks > 0;
  const completedDimensions = hasMissionData
    ? (topic.missionCompletedTasks ?? 0)
    : (topic.dimensions?.filter((d) => d.status === DimensionStatus.COMPLETED)
        .length ?? 0);
  const totalDimensions = hasMissionData
    ? (topic.missionTotalTasks ?? 0)
    : (topic.dimensions?.length ?? 0);

  return (
    <div
      onClick={onClick}
      className="group relative cursor-pointer rounded-xl border border-gray-200 bg-white p-5 transition-all hover:border-violet-300 hover:shadow-lg"
    >
      {/* Action Buttons - Unified style: visibility + share + edit + delete (与 AI Teams/AI Writing 一致) */}
      {isOwnTopic && (
        <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {/* Visibility Toggle */}
          {onVisibilityChange && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                // Cycle: PRIVATE -> PUBLIC -> PRIVATE
                const nextVisibility =
                  topic.visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC';
                onVisibilityChange(nextVisibility);
              }}
              className={`rounded-lg bg-white p-1.5 shadow-sm transition-colors ${
                topic.visibility === 'PUBLIC'
                  ? 'text-green-500 hover:bg-green-50 hover:text-green-600'
                  : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
              }`}
              title={
                topic.visibility === 'PUBLIC'
                  ? t('topicResearch.topicCard.clickToSetPrivate')
                  : t('topicResearch.topicCard.clickToSetPublic')
              }
            >
              {topic.visibility === 'PUBLIC' ? (
                <GlobeIcon className="h-4 w-4" />
              ) : (
                <LockClosedIcon className="h-4 w-4" />
              )}
            </button>
          )}
          {/* ★ Share 按钮 - 仅 PUBLIC 可见性时显示 (与 AI Image/Teams 一致) */}
          {onShareToSocial && topic.visibility === 'PUBLIC' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onShareToSocial();
              }}
              className="rounded-lg bg-white p-1.5 text-gray-400 shadow-sm transition-colors hover:bg-cyan-50 hover:text-cyan-600"
              title={t('topicResearch.topicCard.shareToSocial')}
            >
              <ShareIcon className="h-4 w-4" />
            </button>
          )}
          {/* Edit Button */}
          {onEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="rounded-lg bg-white p-1.5 text-gray-400 shadow-sm transition-colors hover:bg-blue-50 hover:text-blue-600"
              title={t('topicResearch.topicCard.editTopic')}
            >
              <EditIcon className="h-4 w-4" />
            </button>
          )}
          {/* Delete Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="rounded-lg bg-white p-1.5 text-gray-400 shadow-sm transition-colors hover:bg-red-50 hover:text-red-600"
            title={t('topicResearch.topicCard.deleteTopic')}
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Topic Icon */}
      <div
        className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${typeConfig.gradient} shadow-md`}
      >
        {typeConfig.icon}
      </div>

      {/* Topic Type and Visibility Badges */}
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
          {typeConfig.label}
        </span>
        {topic.visibility &&
          (isOwnTopic && onShare ? (
            // ★ 自己的专题：点击打开共享设置弹窗
            <button
              onClick={handleVisibilityClick}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-all hover:ring-2 hover:ring-offset-1 ${
                visibilityConfig[topic.visibility]?.color ||
                'bg-gray-100 text-gray-600'
              } ${
                topic.visibility === 'PRIVATE'
                  ? 'hover:ring-gray-300'
                  : topic.visibility === 'SHARED'
                    ? 'hover:ring-blue-300'
                    : 'hover:ring-green-300'
              }`}
              title={t('topicResearch.topicCard.clickToShare')}
            >
              {visibilityConfig[topic.visibility]?.icon}
              {visibilityConfig[topic.visibility]?.label}
            </button>
          ) : (
            // 他人的专题：仅显示
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${visibilityConfig[topic.visibility]?.color || 'bg-gray-100 text-gray-600'}`}
            >
              {visibilityConfig[topic.visibility]?.icon}
              {visibilityConfig[topic.visibility]?.label}
            </span>
          ))}
      </div>

      {/* Topic Info */}
      <h3 className="line-clamp-1 font-semibold text-gray-900">{topic.name}</h3>
      {topic.description && (
        <p className="mt-1 line-clamp-2 text-sm text-gray-500">
          {topic.description}
        </p>
      )}

      {/* Stats */}
      <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <FileTextIcon className="h-3.5 w-3.5" />
          <span>
            {t('topicResearch.topicCard.reports', {
              count: topic.totalReports,
            })}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <LinkIcon className="h-3.5 w-3.5" />
          <span>
            {t('topicResearch.topicCard.sources', {
              count: topic.totalSources,
            })}
          </span>
        </div>
      </div>

      {/* Dimensions Progress */}
      {totalDimensions > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{t('topicResearch.topicCard.dimensionProgress')}</span>
            <span>
              {completedDimensions}/{totalDimensions}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${typeConfig.gradient}`}
              style={{
                width: `${(completedDimensions / totalDimensions) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Last Refresh + Application Button */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <ClockIcon className="h-3 w-3" />
          <span>
            {t('topicResearch.topicCard.lastRefresh')}:{' '}
            {formatDate(topic.lastRefreshAt)}
          </span>
        </div>

        {/* ★ 申请加入按钮 - 仅对非自己的 SHARED/PUBLIC 专题显示 */}
        {canApply && <ApplicationButton topicId={topic.id} />}
      </div>
    </div>
  );
}
