'use client';

/**
 * Topic Collaboration Panel - 团队协作面板
 *
 * 展示Agent团队的协作动态和互动历史
 */

import { useTopicContent } from './TopicContentContext';

interface TopicCollaborationPanelProps {
  // TeamInteractionTabContent的props会传递进来
  TeamInteractionTabContent: React.ComponentType<{
    events: any[];
    wsEvents: any[];
    wsConnected: boolean;
    onClearEvents: () => void;
    persistedMessages: any[];
    persistedActivities: any[];
    missionStatus: any;
  }>;
  onClearEvents: () => void;
  persistedMessages: any[];
  persistedActivities: any[];
}

export function TopicCollaborationPanel({
  TeamInteractionTabContent,
  onClearEvents,
  persistedMessages,
  persistedActivities,
}: TopicCollaborationPanelProps) {
  const { researchEvents, wsEvents, wsConnected, missionStatus } =
    useTopicContent();

  const safeEvents = Array.isArray(researchEvents) ? researchEvents : [];

  return (
    <TeamInteractionTabContent
      events={safeEvents}
      wsEvents={wsEvents}
      wsConnected={wsConnected}
      onClearEvents={onClearEvents}
      persistedMessages={persistedMessages}
      persistedActivities={persistedActivities}
      missionStatus={missionStatus}
    />
  );
}
