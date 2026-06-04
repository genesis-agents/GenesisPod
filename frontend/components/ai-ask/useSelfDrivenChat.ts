'use client';

import { useCallback, useState } from 'react';
import {
  streamSelfDriven,
  type SelfDrivenMissionEvent,
} from '@/lib/api/self-driven-stream';

/** Minimal user-bubble shape; structurally assignable to the host Message type. */
interface SelfDrivenUserMessage {
  id: string;
  role: 'user';
  content: string;
  createdAt: string;
}

interface UseSelfDrivenChatOptions {
  /** Append a user bubble; the host maps it into its own message list. */
  appendUser: (msg: SelfDrivenUserMessage) => void;
}

/**
 * Self-Driven Team chat hook — owns the isolated SSE event stream so the host
 * page (a god-class file) stays thin and self-driven state never touches the
 * shared chat reducer.
 */
export function useSelfDrivenChat({ appendUser }: UseSelfDrivenChatOptions) {
  const [events, setEvents] = useState<SelfDrivenMissionEvent[]>([]);
  const reset = useCallback(() => setEvents([]), []);
  const run = useCallback(
    async (args: { prompt: string; token: string; signal: AbortSignal }) => {
      setEvents([]);
      appendUser({
        id: 'temp-user-' + Date.now(),
        role: 'user',
        content: args.prompt,
        createdAt: new Date().toISOString(),
      });
      await streamSelfDriven({
        prompt: args.prompt,
        token: args.token,
        signal: args.signal,
        onEvent: (ev) => setEvents((prev) => [...prev, ev]),
      });
    },
    [appendUser]
  );
  return { events, reset, run };
}
