/**
 * @deprecated Migrated to ai-kernel. This re-export shim maintains backward compatibility.
 */
export { MessageBusService as A2AMessageBusService } from "../../../ai-kernel/ipc/message-bus.service";
// Re-export types for backward compatibility
export type {
  A2AMessage,
  A2AMessageType,
} from "../../../ai-kernel/ipc/message-bus.service";
