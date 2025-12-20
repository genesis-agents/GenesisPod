/**
 * TopicEventEmitter Service
 *
 * Breaks circular dependency between AiTeamsGateway and AiResponseService.
 * Gateway registers its emit function here, services use this to emit events.
 */

import { Injectable, Logger } from "@nestjs/common";

export type TopicEmitHandler = (
  topicId: string,
  event: string,
  data: unknown,
) => Promise<void>;

@Injectable()
export class TopicEventEmitterService {
  private readonly logger = new Logger(TopicEventEmitterService.name);
  private emitHandler?: TopicEmitHandler;

  /**
   * Register the emit handler (called by AiTeamsGateway)
   */
  registerEmitHandler(handler: TopicEmitHandler): void {
    this.emitHandler = handler;
    this.logger.log("Topic emit handler registered");
  }

  /**
   * Emit an event to a topic (called by services)
   */
  async emitToTopic(
    topicId: string,
    event: string,
    data: unknown,
  ): Promise<void> {
    if (!this.emitHandler) {
      this.logger.warn(
        `No emit handler registered, skipping event: ${event} for topic: ${topicId}`,
      );
      return;
    }

    try {
      await this.emitHandler(topicId, event, data);
    } catch (error) {
      this.logger.error(`Failed to emit event ${event}:`, error);
    }
  }
}
