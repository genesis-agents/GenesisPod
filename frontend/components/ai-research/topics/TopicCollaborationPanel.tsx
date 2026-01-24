'use client';

/**
 * Topic Collaboration Panel - 团队协作面板
 *
 * 展示Agent团队的协作动态和互动历史
 */

import { useTopicContent } from './TopicContentContext';
import type { TopicMessage, TeamMission } from '@/types/ai-teams';

interface AgentActivity {
  id: string;
  type: string;
  content: string;
  timestamp: string;
  agentId?: string;
  agentName?: string;
}

interface ResearchEvent {
  type: string;
  data: unknown;
  timestamp: string;
}

interface TopicCollaborationPanelProps {
  // TeamInteractionTabContent的props会传递进来
  TeamInteractionTabContent: React.ComponentType<{
    events: ResearchEvent[];
    wsEvents: unknown[];
    wsConnected: boolean;
    onClearEvents: () => void;
    persistedMessages: TopicMessage[];
    persistedActivities: AgentActivity[];
    missionStatus: TeamMission | null;
  }>;
  onClearEvents: () => void;
  persistedMessages: TopicMessage[];
  persistedActivities: AgentActivity[];
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
