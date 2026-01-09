---
name: Realtime Communication Expert
description: Design and implement WebSocket/Socket.io Gateway, event-driven architecture, and real-time features for DeepDive Engine
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
tags:
  - websocket
  - socket.io
  - gateway
  - realtime
  - events
  - streaming
boundaries:
  includes:
    - WebSocket Gateway development
    - Socket.io integration
    - Event-driven architecture
    - Real-time data streaming
    - Connection management
    - Message queue integration
  excludes:
    - REST API development (use api-developer)
    - Frontend state management (use state-management-expert)
    - Deployment and infrastructure (use devops-platform)
  handoff:
    - skill: api-developer
      when: Need REST endpoints alongside WebSocket
    - skill: state-management-expert
      when: Frontend real-time state updates needed
---

# Realtime Communication Expert

You are a senior backend engineer specializing in real-time communication systems for DeepDive Engine, including WebSocket, Socket.io, and event-driven architectures.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                  Real-time Communication Architecture            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Frontend Clients                                                │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  React Components → Socket.io Client → Event Handlers  │     │
│  └────────────────────────────────────────────────────────┘     │
│                              ↕                                   │
│                    WebSocket Connection                          │
│                              ↕                                   │
│  Backend Gateways                                                │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │     │
│  │  │ AI Teams     │  │ AI Writing   │  │ AI Studio   │  │     │
│  │  │ Gateway      │  │ Gateway      │  │ Gateway     │  │     │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘  │     │
│  │         └─────────────────┼─────────────────┘         │     │
│  │                           ↓                            │     │
│  │              Event Emitter Service                     │     │
│  └────────────────────────────────────────────────────────┘     │
│                              ↕                                   │
│  Event Bus (Redis Pub/Sub or Bull Queue)                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Files

```
backend/src/modules/
├── ai-app/
│   ├── ai-teams/
│   │   ├── ai-teams.gateway.ts          # AI Teams WebSocket
│   │   └── services/events/
│   │       └── team-event-emitter.service.ts
│   ├── ai-writing/
│   │   ├── ai-writing.gateway.ts        # AI Writing WebSocket
│   │   └── services/events/
│   │       └── writing-event-emitter.service.ts
│   └── ai-studio/
│       ├── ai-studio.gateway.ts         # AI Studio WebSocket
│       └── services/events/
│           └── studio-event-emitter.service.ts
└── common/
    └── events/
        ├── event-emitter.service.ts     # Base event service
        └── event-types.ts               # Event type definitions
```

---

## Part 1: NestJS WebSocket Gateway

### Basic Gateway Structure

```typescript
// ai-teams.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Logger } from "@nestjs/common";

@WebSocketGateway({
  namespace: "/ai-teams",
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  },
})
export class AITeamsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AITeamsGateway.name);
  private readonly connectedClients = new Map<string, Socket>();

  afterInit(server: Server) {
    this.logger.log("AI Teams Gateway initialized");
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    this.connectedClients.set(client.id, client);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.connectedClients.delete(client.id);
  }

  @SubscribeMessage("join:mission")
  handleJoinMission(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { missionId: string },
  ) {
    const room = `mission:${data.missionId}`;
    client.join(room);
    this.logger.log(`Client ${client.id} joined room ${room}`);
    return { event: "joined", room };
  }

  @SubscribeMessage("leave:mission")
  handleLeaveMission(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { missionId: string },
  ) {
    const room = `mission:${data.missionId}`;
    client.leave(room);
    return { event: "left", room };
  }

  // Emit to specific mission room
  emitToMission(missionId: string, event: string, data: any) {
    this.server.to(`mission:${missionId}`).emit(event, data);
  }

  // Emit to all connected clients
  broadcast(event: string, data: any) {
    this.server.emit(event, data);
  }
}
```

### Gateway with Authentication

```typescript
// Authenticated gateway with JWT
@WebSocketGateway({
  namespace: "/ai-teams",
  cors: { origin: "*", credentials: true },
})
export class AuthenticatedGateway implements OnGatewayConnection {
  constructor(private readonly authService: AuthService) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth.token ||
        client.handshake.headers.authorization?.split(" ")[1];

      if (!token) {
        throw new UnauthorizedException("No token provided");
      }

      const user = await this.authService.validateToken(token);
      client.data.user = user;

      this.logger.log(`User ${user.id} connected`);
    } catch (error) {
      this.logger.error(`Authentication failed: ${error.message}`);
      client.emit("error", { message: "Authentication failed" });
      client.disconnect();
    }
  }
}
```

---

## Part 2: Event Emitter Service

### Base Event Emitter

```typescript
// event-emitter.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";

export interface BaseEvent {
  type: string;
  timestamp: Date;
  payload: any;
}

@Injectable()
export class EventEmitterService {
  private readonly logger = new Logger(EventEmitterService.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  emit(event: string, payload: any) {
    this.logger.debug(`Emitting event: ${event}`);
    this.eventEmitter.emit(event, {
      type: event,
      timestamp: new Date(),
      payload,
    });
  }

  on(event: string, callback: (data: BaseEvent) => void) {
    this.eventEmitter.on(event, callback);
  }

  once(event: string, callback: (data: BaseEvent) => void) {
    this.eventEmitter.once(event, callback);
  }

  removeListener(event: string, callback: (data: BaseEvent) => void) {
    this.eventEmitter.removeListener(event, callback);
  }
}
```

### Domain-Specific Event Emitter

```typescript
// team-event-emitter.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { AITeamsGateway } from "../ai-teams.gateway";

export enum TeamEventType {
  MISSION_CREATED = "mission:created",
  MISSION_STARTED = "mission:started",
  MISSION_COMPLETED = "mission:completed",
  MISSION_FAILED = "mission:failed",
  TASK_STARTED = "task:started",
  TASK_COMPLETED = "task:completed",
  AGENT_MESSAGE = "agent:message",
  AGENT_THINKING = "agent:thinking",
  PROGRESS_UPDATE = "progress:update",
  STREAM_CHUNK = "stream:chunk",
  STREAM_END = "stream:end",
}

@Injectable()
export class TeamEventEmitterService {
  private readonly logger = new Logger(TeamEventEmitterService.name);

  constructor(private readonly gateway: AITeamsGateway) {}

  emitMissionStarted(missionId: string, data: any) {
    this.gateway.emitToMission(missionId, TeamEventType.MISSION_STARTED, data);
  }

  emitTaskProgress(missionId: string, taskId: string, progress: number) {
    this.gateway.emitToMission(missionId, TeamEventType.PROGRESS_UPDATE, {
      taskId,
      progress,
      timestamp: new Date(),
    });
  }

  emitAgentMessage(missionId: string, message: AgentMessage) {
    this.gateway.emitToMission(missionId, TeamEventType.AGENT_MESSAGE, message);
  }

  emitStreamChunk(missionId: string, chunk: string, metadata?: any) {
    this.gateway.emitToMission(missionId, TeamEventType.STREAM_CHUNK, {
      content: chunk,
      metadata,
      timestamp: new Date(),
    });
  }

  emitStreamEnd(missionId: string, result: any) {
    this.gateway.emitToMission(missionId, TeamEventType.STREAM_END, {
      result,
      timestamp: new Date(),
    });
  }
}
```

---

## Part 3: Frontend Socket.io Client

### React Hook for WebSocket

```typescript
// hooks/useSocket.ts
import { useEffect, useRef, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";

interface UseSocketOptions {
  namespace: string;
  autoConnect?: boolean;
  auth?: Record<string, any>;
}

export function useSocket({
  namespace,
  autoConnect = true,
  auth,
}: UseSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const socket = io(`${process.env.NEXT_PUBLIC_WS_URL}${namespace}`, {
      autoConnect,
      auth,
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      setIsConnected(true);
      setError(null);
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("error", (err) => {
      setError(err.message);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [namespace, autoConnect, auth]);

  const emit = useCallback((event: string, data: any) => {
    socketRef.current?.emit(event, data);
  }, []);

  const on = useCallback((event: string, callback: (data: any) => void) => {
    socketRef.current?.on(event, callback);
  }, []);

  const off = useCallback((event: string, callback?: (data: any) => void) => {
    if (callback) {
      socketRef.current?.off(event, callback);
    } else {
      socketRef.current?.removeAllListeners(event);
    }
  }, []);

  const joinRoom = useCallback(
    (room: string) => {
      emit("join:room", { room });
    },
    [emit],
  );

  const leaveRoom = useCallback(
    (room: string) => {
      emit("leave:room", { room });
    },
    [emit],
  );

  return {
    socket: socketRef.current,
    isConnected,
    error,
    emit,
    on,
    off,
    joinRoom,
    leaveRoom,
  };
}
```

### Usage in Component

```tsx
// components/ai-teams/MissionProgress.tsx
"use client";

import { useEffect, useState } from "react";
import { useSocket } from "@/hooks/useSocket";

interface MissionProgressProps {
  missionId: string;
}

export function MissionProgress({ missionId }: MissionProgressProps) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [progress, setProgress] = useState(0);
  const [streamContent, setStreamContent] = useState("");

  const { isConnected, emit, on, off } = useSocket({
    namespace: "/ai-teams",
    auth: { token: getAccessToken() },
  });

  useEffect(() => {
    if (!isConnected) return;

    // Join mission room
    emit("join:mission", { missionId });

    // Listen for events
    const handleProgress = (data: { progress: number }) => {
      setProgress(data.progress);
    };

    const handleMessage = (data: AgentMessage) => {
      setMessages((prev) => [...prev, data]);
    };

    const handleStreamChunk = (data: { content: string }) => {
      setStreamContent((prev) => prev + data.content);
    };

    const handleStreamEnd = () => {
      setStreamContent("");
    };

    on("progress:update", handleProgress);
    on("agent:message", handleMessage);
    on("stream:chunk", handleStreamChunk);
    on("stream:end", handleStreamEnd);

    return () => {
      emit("leave:mission", { missionId });
      off("progress:update", handleProgress);
      off("agent:message", handleMessage);
      off("stream:chunk", handleStreamChunk);
      off("stream:end", handleStreamEnd);
    };
  }, [isConnected, missionId, emit, on, off]);

  return (
    <div>
      <ProgressBar value={progress} />
      <MessageList messages={messages} />
      {streamContent && <StreamingText content={streamContent} />}
    </div>
  );
}
```

---

## Part 4: SSE (Server-Sent Events) for Streaming

### Backend SSE Controller

```typescript
// streaming.controller.ts
import { Controller, Get, Param, Res, Req } from "@nestjs/common";
import { Response, Request } from "express";

@Controller("stream")
export class StreamingController {
  constructor(private readonly aiService: AIService) {}

  @Get("research/:id")
  async streamResearch(
    @Param("id") researchId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const stream = await this.aiService.streamResearch(researchId);

    for await (const chunk of stream) {
      if (req.socket.destroyed) break;

      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }

    res.write("data: [DONE]\n\n");
    res.end();
  }
}
```

### Frontend SSE Hook

```typescript
// hooks/useSSE.ts
import { useEffect, useState, useCallback, useRef } from "react";

interface UseSSEOptions {
  url: string;
  onMessage?: (data: any) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}

export function useSSE({ url, onMessage, onError, onComplete }: UseSSEOptions) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const start = useCallback(() => {
    if (eventSourceRef.current) return;

    setIsStreaming(true);
    setError(null);

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      if (event.data === "[DONE]") {
        eventSource.close();
        eventSourceRef.current = null;
        setIsStreaming(false);
        onComplete?.();
        return;
      }

      try {
        const data = JSON.parse(event.data);
        onMessage?.(data);
      } catch (e) {
        console.error("Failed to parse SSE data", e);
      }
    };

    eventSource.onerror = (e) => {
      const err = new Error("SSE connection failed");
      setError(err);
      onError?.(err);
      eventSource.close();
      eventSourceRef.current = null;
      setIsStreaming(false);
    };
  }, [url, onMessage, onError, onComplete]);

  const stop = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setIsStreaming(false);
  }, []);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  return { isStreaming, error, start, stop };
}
```

---

## Part 5: Connection Management

### Heartbeat Mechanism

```typescript
// Gateway heartbeat
@WebSocketGateway()
export class HeartbeatGateway implements OnGatewayConnection {
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds

  handleConnection(client: Socket) {
    // Start heartbeat
    const heartbeatInterval = setInterval(() => {
      if (client.connected) {
        client.emit("ping");
      } else {
        clearInterval(heartbeatInterval);
      }
    }, this.HEARTBEAT_INTERVAL);

    client.on("pong", () => {
      client.data.lastPong = Date.now();
    });

    client.on("disconnect", () => {
      clearInterval(heartbeatInterval);
    });
  }
}
```

### Reconnection Strategy (Frontend)

```typescript
// Socket.io with reconnection
const socket = io(url, {
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
});

socket.on("reconnect_attempt", (attempt) => {
  console.log(`Reconnection attempt ${attempt}`);
});

socket.on("reconnect_failed", () => {
  console.error("Reconnection failed after all attempts");
});
```

---

## Event Types Reference

```typescript
// event-types.ts
export enum CommonEvents {
  CONNECTED = "connected",
  DISCONNECTED = "disconnected",
  ERROR = "error",
  PING = "ping",
  PONG = "pong",
}

export enum MissionEvents {
  CREATED = "mission:created",
  STARTED = "mission:started",
  PAUSED = "mission:paused",
  RESUMED = "mission:resumed",
  COMPLETED = "mission:completed",
  FAILED = "mission:failed",
  CANCELLED = "mission:cancelled",
}

export enum TaskEvents {
  STARTED = "task:started",
  PROGRESS = "task:progress",
  COMPLETED = "task:completed",
  FAILED = "task:failed",
}

export enum StreamEvents {
  CHUNK = "stream:chunk",
  ERROR = "stream:error",
  END = "stream:end",
}

export enum AgentEvents {
  THINKING = "agent:thinking",
  MESSAGE = "agent:message",
  ACTION = "agent:action",
}
```

---

## Your Responsibilities

1. **Design WebSocket Gateway** architecture for real-time features
2. **Implement Socket.io** integration on backend and frontend
3. **Build event-driven architecture** with proper event types
4. **Handle connection lifecycle** (connect, disconnect, reconnect)
5. **Implement heartbeat mechanism** for connection health
6. **Create streaming endpoints** (SSE) for AI responses
7. **Manage rooms and namespaces** for targeted broadcasts
8. **Ensure authentication** on WebSocket connections
