/**
 * SocialEventRelay — thin extends of harness EventRelayFramework with "social"
 * namespace prefix. Mirror of agent-playground-event-relay.
 */

import {
  DomainEventBus,
  EventRelayFramework,
} from "@/modules/ai-harness/facade";

export class SocialEventRelay extends EventRelayFramework {
  constructor(eventBus: DomainEventBus) {
    super(eventBus, "social");
  }
}
