'use client';

import { motion } from 'framer-motion';
import {
  Crown,
  Search,
  BarChart3,
  PenLine,
  ShieldCheck,
  Info,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import type {
  DiscussionMessage,
  DiscussionPhase,
  DiscussionRole,
} from '@/hooks';

interface AgentPanelProps {
  messages: DiscussionMessage[];
  typingAgent: { role: string; name: string } | null;
  directions: string[];
  currentPhase: DiscussionPhase;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  crown: Crown,
  search: Search,
  'bar-chart-3': BarChart3,
  'pen-line': PenLine,
  'shield-check': ShieldCheck,
  info: Info,
};

const ROLE_COLORS: Record<DiscussionRole, string> = {
  director: 'bg-purple-500',
  researcher: 'bg-blue-500',
  analyst: 'bg-amber-500',
  writer: 'bg-green-500',
  reviewer: 'bg-teal-500',
};

type AgentStatus = 'idle' | 'speaking' | 'searching' | 'writing';

interface Agent {
  role: DiscussionRole;
  name: string;
  icon: string;
}

function getAgentStatus(
  agent: Agent,
  typingAgent: { role: string; name: string } | null
): AgentStatus {
  if (!typingAgent) return 'idle';
  if (typingAgent.role === agent.role) {
    if (agent.role === 'researcher') return 'searching';
    if (agent.role === 'writer') return 'writing';
    return 'speaking';
  }
  return 'idle';
}

function extractAgentsFromMessages(messages: DiscussionMessage[]): Agent[] {
  const agentMap = new Map<string, Agent>();

  messages.forEach((msg) => {
    if (!agentMap.has(msg.agentRole)) {
      agentMap.set(msg.agentRole, {
        role: msg.agentRole,
        name: msg.agentName,
        icon: msg.agentIcon,
      });
    }
  });

  return Array.from(agentMap.values());
}

function StatusIndicator({ status }: { status: AgentStatus }) {
  if (status === 'speaking') {
    return (
      <motion.div
        className="h-2 w-2 rounded-full bg-blue-500"
        animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
        transition={{ repeat: Infinity, duration: 1.5 }}
      />
    );
  }

  if (status === 'searching') {
    return <Loader2 className="h-3 w-3 animate-spin text-blue-500" />;
  }

  if (status === 'writing') {
    return (
      <motion.div
        className="h-3 w-3 text-green-500"
        animate={{ opacity: [1, 0.3, 1] }}
        transition={{ repeat: Infinity, duration: 1 }}
      >
        <PenLine className="h-3 w-3" />
      </motion.div>
    );
  }

  return <div className="h-2 w-2 rounded-full bg-gray-300" />;
}

export function AgentPanel({
  messages,
  typingAgent,
  directions,
  currentPhase,
}: AgentPanelProps) {
  const agents = extractAgentsFromMessages(messages);

  return (
    <div className="flex w-[200px] flex-col border-r border-gray-200 bg-gray-50">
      {/* Agents List */}
      <div className="space-y-3 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          研究团队
        </h3>
        {agents.map((agent) => {
          const Icon = ICON_MAP[agent.icon] || Info;
          const status = getAgentStatus(agent, typingAgent);
          const colorClass = ROLE_COLORS[agent.role];

          return (
            <motion.div
              key={agent.role}
              className="flex items-center gap-2"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-white',
                  colorClass
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">
                  {agent.name}
                </p>
              </div>
              <StatusIndicator status={status} />
            </motion.div>
          );
        })}
      </div>

      {/* Research Directions */}
      {directions.length > 0 && (
        <>
          <div className="my-2 border-t border-gray-200" />
          <div className="space-y-2 px-4 pb-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              研究方向
            </h3>
            <div className="space-y-1.5">
              {directions.map((direction, index) => (
                <div
                  key={index}
                  className="flex cursor-pointer items-start gap-2 rounded-md p-2 text-sm text-gray-700 transition-all hover:bg-white hover:shadow-sm"
                >
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-semibold text-purple-600">
                    {index + 1}
                  </span>
                  <span className="flex-1 leading-tight">{direction}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
