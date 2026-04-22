/**
 * HookRegistry — IHookRegistry 的默认实现
 *
 * Phase 1 完整实现：按 scope / priority 派发，支持阻断。
 */

import type {
  HookEvent,
  HookPayloadMap,
  IHookBinding,
  IHookRegistry,
  IHookResult,
  IContextEnvelope,
} from "../abstractions";

interface StoredBinding {
  binding: IHookBinding<HookEvent>;
  registrationOrder: number;
}

export class HookRegistry implements IHookRegistry {
  private readonly bindings = new Map<HookEvent, StoredBinding[]>();
  private counter = 0;

  register<E extends HookEvent>(binding: IHookBinding<E>): () => void {
    const event = binding.event;
    const list = this.bindings.get(event) ?? [];
    const stored: StoredBinding = {
      binding: binding as unknown as IHookBinding<HookEvent>,
      registrationOrder: this.counter++,
    };
    list.push(stored);
    // Sort: priority desc, then registration order asc
    list.sort((a, b) => {
      const pa = a.binding.priority ?? 0;
      const pb = b.binding.priority ?? 0;
      if (pa !== pb) return pb - pa;
      return a.registrationOrder - b.registrationOrder;
    });
    this.bindings.set(event, list);

    return () => {
      const current = this.bindings.get(event);
      if (!current) return;
      const idx = current.indexOf(stored);
      if (idx >= 0) current.splice(idx, 1);
    };
  }

  async dispatch<E extends HookEvent>(
    event: E,
    payload: HookPayloadMap[E],
    context: { agentId: string; envelope: IContextEnvelope },
  ): Promise<IHookResult> {
    const list = this.bindings.get(event) ?? [];
    for (const { binding } of list) {
      const result = await binding.handler(
        payload as HookPayloadMap[HookEvent],
        context,
      );
      if (result && typeof result === "object" && "block" in result && result.block) {
        return result;
      }
    }
    return {};
  }
}
