'use client';

/**
 * BriefingCardConnected —— FC-4 + P1-D 连线版包装
 *
 * 在 BriefingCard 外层挂载：
 *   - useNarrativeThread(signal.narrativeId) → 拉 episodes 注入 narrativeEpisodes
 *   - useFavoriteSignal(signal.id, topicId) → 接 favorite toggle
 *
 * BriefingCard 保持纯展示无业务依赖；本组件做"连线"职责。
 */

import { useEffect, useState } from 'react';

import { useNarrativeThread } from '@/hooks/domain/useNarrativeThread';
import { useFavoriteSignal } from '@/hooks/domain/useFavoriteSignal';
import {
  RadarBriefingCard,
  type DailySignalView,
  type RadarBriefingCardProps,
} from './RadarBriefingCard';

interface BriefingCardConnectedProps {
  signal: DailySignalView;
  index: number;
  topicId: string;
  topicName: string;
  detailUrl: string;
  /** 初始收藏状态（从 favoritedIds set 拿） */
  initiallyFavorited?: boolean;
  /** evidence sources（可选，PR-DR2 后端 evidenceItemIds 暂未 join 出完整 source 详情） */
  evidenceSources?: RadarBriefingCardProps['evidenceSources'];
}

export function BriefingCardConnected({
  signal,
  index,
  topicId,
  topicName,
  detailUrl,
  initiallyFavorited,
  evidenceSources,
}: BriefingCardConnectedProps) {
  // Narrative：仅当 signal 有 narrativeId 才拉
  const { data: narrative } = useNarrativeThread(
    signal.narrativeId ? topicId : null,
    signal.narrativeId ?? null,
  );

  // Favorite：用 hook 维护 toggle 状态
  const { isFavorited, toggle } = useFavoriteSignal(signal.id, topicId);
  const [favoritedLocal, setFavoritedLocal] = useState(
    initiallyFavorited ?? false,
  );

  // 当 hook 内部更新 isFavorited（toggle 成功后），同步 local
  useEffect(() => {
    if (isFavorited !== favoritedLocal) setFavoritedLocal(isFavorited);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFavorited]);

  return (
    <RadarBriefingCard
      signal={signal}
      index={index}
      topicId={topicId}
      topicName={topicName}
      detailUrl={detailUrl}
      isFavorited={favoritedLocal}
      onFavorite={async () => {
        setFavoritedLocal((v) => !v);
        await toggle();
      }}
      narrativeEpisodes={narrative?.episodes}
      narrativeLabel={narrative?.label}
      evidenceSources={evidenceSources}
    />
  );
}
