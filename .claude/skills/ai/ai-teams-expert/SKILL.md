---
name: AI Teams Expert
description: Design and implement multi-agent collaboration systems, mission orchestration, and Canvas visualization for DeepDive Engine AI Teams
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
tags:
  - ai-teams
  - multi-agent
  - collaboration
  - canvas
  - orchestration
---

# AI Teams Expert

You are an expert at designing and implementing multi-agent AI collaboration systems for DeepDive Engine.

## AI Teams Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Teams System                           │
├─────────────────────────────────────────────────────────────┤
│                      Frontend (Next.js)                      │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ TeamCanvas  │  │ ChatPanel    │  │ MissionControl    │  │
│  │ (SVG/D3)    │  │              │  │                   │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                      Backend (NestJS)                        │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Mission     │  │ Task         │  │ Agent             │  │
│  │ Orchestrator│  │ Manager      │  │ Coordinator       │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                    AI Providers                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────┐   │
│  │ GPT-4   │  │ Claude  │  │  Grok   │  │   Gemini    │   │
│  └─────────┘  └─────────┘  └─────────┘  └─────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Key Files

```
frontend/components/ai-teams/
├── TeamCanvasModal.tsx         # Canvas visualization
├── TeamChatPanel.tsx           # Chat interface
├── MissionCard.tsx             # Mission display
├── AgentNode.tsx               # Agent visualization
└── TaskFlow.tsx                # Task flow diagram

backend/src/modules/ai/
├── ai-teams/
│   ├── mission.service.ts      # Mission orchestration
│   ├── task.service.ts         # Task management
│   ├── agent.service.ts        # Agent coordination
│   └── dto/
└── ai-core/
    └── ai-chat.service.ts      # AI provider abstraction
```

## Core Data Models

### Mission

```typescript
interface TeamMission {
  id: string;
  topicId: string;
  title: string;
  description: string;
  status: MissionStatus;

  // Team composition
  leaderId: string; // Team leader AI
  leader?: TopicAIMember;
  memberIds: string[]; // Team member AIs

  // Task management
  tasks: AgentTask[];

  // Results
  finalResult?: string;
  artifacts?: Artifact[];

  // Timestamps
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

enum MissionStatus {
  PENDING = "PENDING",
  PLANNING = "PLANNING",
  IN_PROGRESS = "IN_PROGRESS",
  REVIEW = "REVIEW",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}
```

### Agent Task

```typescript
interface AgentTask {
  id: string;
  missionId: string;

  // Task details
  title: string;
  description: string;
  priority: TaskPriority;

  // Assignment
  assignedToId: string;
  assignedTo?: TopicAIMember;

  // Status tracking
  status: AgentTaskStatus;

  // Results
  result?: string;
  leaderFeedback?: string;
  revisionCount: number;

  // Dependencies
  dependsOn?: string[]; // Task IDs this depends on

  // Timestamps
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

enum AgentTaskStatus {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  BLOCKED = "BLOCKED",
  AWAITING_REVIEW = "AWAITING_REVIEW",
  REVISION_NEEDED = "REVISION_NEEDED",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}
```

### AI Team Member

```typescript
interface TopicAIMember {
  id: string;
  topicId: string;

  // Identity
  displayName: string;
  avatar?: string;

  // AI configuration
  modelProvider: string; // 'openai' | 'anthropic' | 'xai' | 'google'
  modelId: string; // 'gpt-4o' | 'claude-3-opus' | 'grok-beta'

  // Role configuration
  role: AgentRole;
  systemPrompt?: string;
  expertiseAreas?: string[];

  // Settings
  temperature?: number;
  maxTokens?: number;

  // Status
  isActive: boolean;
  lastActiveAt?: Date;
}

enum AgentRole {
  LEADER = "leader",
  RESEARCHER = "researcher",
  ANALYST = "analyst",
  WRITER = "writer",
  REVIEWER = "reviewer",
  SPECIALIST = "specialist",
}
```

## Mission Orchestration Flow

```typescript
class MissionOrchestrator {
  async executeMission(missionId: string): Promise<void> {
    const mission = await this.getMission(missionId);

    // Phase 1: Planning
    await this.updateStatus(missionId, MissionStatus.PLANNING);
    const tasks = await this.planTasks(mission);
    await this.saveTasks(missionId, tasks);

    // Phase 2: Execution
    await this.updateStatus(missionId, MissionStatus.IN_PROGRESS);
    await this.executeTasks(mission, tasks);

    // Phase 3: Review
    await this.updateStatus(missionId, MissionStatus.REVIEW);
    const finalResult = await this.consolidateResults(mission);

    // Phase 4: Complete
    await this.completeMission(missionId, finalResult);
  }

  async planTasks(mission: TeamMission): Promise<AgentTask[]> {
    const leader = await this.getAgent(mission.leaderId);

    const planningPrompt = `
      As team leader, plan tasks for mission: "${mission.title}"
      Description: ${mission.description}

      Team members available:
      ${mission.memberIds.map((id) => this.describeMember(id)).join("\n")}

      Create a detailed task breakdown with assignments.
      Output JSON: [{ title, description, assignedToId, priority, dependsOn }]
    `;

    const response = await this.aiService.chat(leader, planningPrompt);
    return JSON.parse(response);
  }

  async executeTasks(mission: TeamMission, tasks: AgentTask[]): Promise<void> {
    // Sort by dependencies
    const sortedTasks = this.topologicalSort(tasks);

    for (const task of sortedTasks) {
      // Wait for dependencies
      await this.waitForDependencies(task);

      // Execute task
      await this.executeTask(mission, task);

      // Leader review
      await this.leaderReview(mission, task);
    }
  }

  async executeTask(mission: TeamMission, task: AgentTask): Promise<void> {
    const agent = await this.getAgent(task.assignedToId);

    await this.updateTaskStatus(task.id, AgentTaskStatus.IN_PROGRESS);

    const taskPrompt = `
      Task: ${task.title}
      Description: ${task.description}

      Context from completed tasks:
      ${await this.getCompletedTasksContext(mission)}

      Complete this task and provide a detailed result.
    `;

    const result = await this.aiService.chat(agent, taskPrompt);

    await this.updateTask(task.id, {
      result,
      status: AgentTaskStatus.AWAITING_REVIEW,
    });
  }

  async leaderReview(mission: TeamMission, task: AgentTask): Promise<void> {
    const leader = await this.getAgent(mission.leaderId);

    const reviewPrompt = `
      Review task result:
      Task: ${task.title}
      Result: ${task.result}

      Evaluate quality and completeness.
      If acceptable, respond: {"approved": true, "feedback": "..."}
      If needs revision, respond: {"approved": false, "feedback": "..."}
    `;

    const review = await this.aiService.chat(leader, reviewPrompt);
    const { approved, feedback } = JSON.parse(review);

    if (approved) {
      await this.updateTask(task.id, {
        status: AgentTaskStatus.COMPLETED,
        leaderFeedback: feedback,
      });
    } else {
      await this.updateTask(task.id, {
        status: AgentTaskStatus.REVISION_NEEDED,
        leaderFeedback: feedback,
        revisionCount: task.revisionCount + 1,
      });

      // Re-execute with feedback
      await this.reviseTask(mission, task, feedback);
    }
  }
}
```

## Canvas Visualization

```typescript
// TeamCanvasModal.tsx - Key visualization components

// Node positioning algorithm
function calculateNodePositions(
  leaderId: string,
  agents: TopicAIMember[],
  width: number,
  height: number,
  tasksByAgent: Map<string, AgentTask[]>
): Map<string, { x: number; y: number }> {
  const positions = new Map();
  const centerX = width / 2;

  // Leader at top center
  if (leaderId) {
    positions.set(leaderId, { x: centerX, y: 90 });
  }

  // Workers in rows below, sorted by activity
  const workers = agents.filter(a => a.id !== leaderId);
  const sortedWorkers = sortByActivity(workers, tasksByAgent);

  // Distribute in grid layout
  const nodesPerRow = Math.ceil(Math.sqrt(workers.length));
  sortedWorkers.forEach((worker, index) => {
    const row = Math.floor(index / nodesPerRow);
    const col = index % nodesPerRow;
    positions.set(worker.id, {
      x: calculateX(col, nodesPerRow, width),
      y: 250 + row * 160,
    });
  });

  return positions;
}

// Connection lines with animated particles
function renderTaskConnection(
  leaderPos: Position,
  agentPos: Position,
  task: AgentTask
): JSX.Element {
  const connectionColor = getTaskConnectionColor(task.status);
  const isActive = task.status === 'IN_PROGRESS';

  return (
    <g key={task.id}>
      {/* Curved path */}
      <path
        d={`M ${leaderPos.x} ${leaderPos.y + 40}
            Q ${midX} ${midY}
            ${agentPos.x} ${agentPos.y - 40}`}
        stroke={connectionColor}
        strokeWidth={isActive ? 4 : 2}
        fill="none"
      />

      {/* Animated particle for active tasks */}
      {isActive && (
        <circle r="6" fill={connectionColor}>
          <animateMotion
            dur="2s"
            repeatCount="indefinite"
            path={pathD}
          />
        </circle>
      )}
    </g>
  );
}
```

## Real-time Updates

```typescript
// WebSocket events for live collaboration view
interface TeamEvent {
  type: TeamEventType;
  missionId: string;
  payload: any;
  timestamp: Date;
}

enum TeamEventType {
  MISSION_STARTED = "mission_started",
  TASK_ASSIGNED = "task_assigned",
  TASK_STARTED = "task_started",
  TASK_COMPLETED = "task_completed",
  TASK_REVISION = "task_revision",
  AGENT_TYPING = "agent_typing",
  MISSION_COMPLETED = "mission_completed",
}

// Frontend subscription
useEffect(() => {
  const socket = io("/ai-teams");

  socket.on("team_event", (event: TeamEvent) => {
    switch (event.type) {
      case TeamEventType.AGENT_TYPING:
        setTypingAIs((prev) => new Set([...prev, event.payload.agentId]));
        break;
      case TeamEventType.TASK_COMPLETED:
        updateTask(event.payload.taskId, { status: "COMPLETED" });
        break;
      // ... handle other events
    }
  });

  return () => socket.disconnect();
}, [missionId]);
```

## Your Responsibilities

1. Design multi-agent collaboration workflows
2. Implement mission orchestration logic
3. Build Canvas visualization with D3/SVG
4. Handle real-time updates via WebSocket
5. Manage task dependencies and execution order
6. Implement leader review and feedback loops
7. Optimize agent communication and coordination
8. Ensure robust error handling and recovery
