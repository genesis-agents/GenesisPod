import {
  AgentCommunicationTool,
  CommunicationOperation,
  MessageType,
  MessagePriority,
  MessageStatus,
} from "../agent-communication.tool";
import { BUILTIN_AGENTS } from "../../../../core/types/agent.types";
import { ToolContext } from "../../../abstractions/tool.interface";

// ============================================================================
// Mock factory
// ============================================================================

function createMockContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    executionId: "test-exec-id",
    toolId: "agent-communication",
    userId: "user-123",
    createdAt: new Date(),
    ...overrides,
  };
}

// ============================================================================
// Test suite
// ============================================================================

describe("AgentCommunicationTool", () => {
  let tool: AgentCommunicationTool;

  beforeEach(() => {
    // Fresh instance so in-memory stores are clean between tests
    tool = new AgentCommunicationTool();
  });

  // --------------------------------------------------------------------------
  // validateInput
  // --------------------------------------------------------------------------

  describe("validateInput", () => {
    it("should return true for a valid SEND operation with all required fields", () => {
      expect(
        tool.validateInput({
          operation: CommunicationOperation.SEND,
          fromAgent: BUILTIN_AGENTS.DOCS,
          toAgent: BUILTIN_AGENTS.DESIGNER,
          message: { subject: "Hello", content: "Please review this" },
        }),
      ).toBe(true);
    });

    it("should return false for SEND without toAgent", () => {
      expect(
        tool.validateInput({
          operation: CommunicationOperation.SEND,
          fromAgent: BUILTIN_AGENTS.DOCS,
          message: { subject: "Hello", content: "Review" },
        }),
      ).toBe(false);
    });

    it("should return false for SEND without message content", () => {
      expect(
        tool.validateInput({
          operation: CommunicationOperation.SEND,
          fromAgent: BUILTIN_AGENTS.DOCS,
          toAgent: BUILTIN_AGENTS.DESIGNER,
          message: { subject: "Hello", content: "" },
        }),
      ).toBe(false);
    });

    it("should return false for an unknown fromAgent", () => {
      expect(
        tool.validateInput({
          operation: CommunicationOperation.SEND,
          fromAgent: "unknown-agent",
          toAgent: BUILTIN_AGENTS.DESIGNER,
          message: { subject: "Hi", content: "Test" },
        }),
      ).toBe(false);
    });

    it("should return true for RECEIVE operation with only fromAgent", () => {
      expect(
        tool.validateInput({
          operation: CommunicationOperation.RECEIVE,
          fromAgent: BUILTIN_AGENTS.RESEARCHER,
        }),
      ).toBe(true);
    });

    it("should return true for LIST_INBOX with only fromAgent", () => {
      expect(
        tool.validateInput({
          operation: CommunicationOperation.LIST_INBOX,
          fromAgent: BUILTIN_AGENTS.RESEARCHER,
        }),
      ).toBe(true);
    });

    it("should return false for GET_STATUS without messageId", () => {
      expect(
        tool.validateInput({
          operation: CommunicationOperation.GET_STATUS,
          fromAgent: BUILTIN_AGENTS.DOCS,
        }),
      ).toBe(false);
    });

    it("should return true for BROADCAST with subject and content", () => {
      expect(
        tool.validateInput({
          operation: CommunicationOperation.BROADCAST,
          fromAgent: BUILTIN_AGENTS.RESEARCHER,
          message: { subject: "Alert", content: "System update" },
        }),
      ).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // SEND operation
  // --------------------------------------------------------------------------

  describe("send operation", () => {
    it("should send a message and return success: true with message details", async () => {
      const context = createMockContext();

      const result = await tool.execute(
        {
          operation: CommunicationOperation.SEND,
          fromAgent: BUILTIN_AGENTS.DOCS,
          toAgent: BUILTIN_AGENTS.DESIGNER,
          message: {
            subject: "Need cover image",
            content: "Please design a cover for the report",
          },
        },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.data?.success).toBe(true);
      expect(result.data?.operation).toBe(CommunicationOperation.SEND);
      expect(result.data?.message).toBeDefined();
    });

    it("should include the correct from/to agents in the sent message", async () => {
      const context = createMockContext();

      const result = await tool.execute(
        {
          operation: CommunicationOperation.SEND,
          fromAgent: BUILTIN_AGENTS.DOCS,
          toAgent: BUILTIN_AGENTS.DESIGNER,
          message: { subject: "Task", content: "Do this" },
        },
        context,
      );

      expect(result.data?.message?.from).toBe(BUILTIN_AGENTS.DOCS);
      expect(result.data?.message?.to).toBe(BUILTIN_AGENTS.DESIGNER);
    });

    it("should assign a unique message ID", async () => {
      const context = createMockContext();

      const result1 = await tool.execute(
        {
          operation: CommunicationOperation.SEND,
          fromAgent: BUILTIN_AGENTS.DOCS,
          toAgent: BUILTIN_AGENTS.DESIGNER,
          message: { subject: "First", content: "First message" },
        },
        context,
      );

      const result2 = await tool.execute(
        {
          operation: CommunicationOperation.SEND,
          fromAgent: BUILTIN_AGENTS.DOCS,
          toAgent: BUILTIN_AGENTS.DESIGNER,
          message: { subject: "Second", content: "Second message" },
        },
        context,
      );

      expect(result1.data?.message?.id).toBeTruthy();
      expect(result2.data?.message?.id).toBeTruthy();
      expect(result1.data?.message?.id).not.toBe(result2.data?.message?.id);
    });

    it("should use provided priority in the sent message", async () => {
      const context = createMockContext();

      const result = await tool.execute(
        {
          operation: CommunicationOperation.SEND,
          fromAgent: BUILTIN_AGENTS.DOCS,
          toAgent: BUILTIN_AGENTS.DESIGNER,
          message: {
            subject: "Urgent",
            content: "Do this now",
            priority: MessagePriority.URGENT,
          },
        },
        context,
      );

      expect(result.data?.message?.priority).toBe(MessagePriority.URGENT);
    });
  });

  // --------------------------------------------------------------------------
  // RECEIVE / LIST_INBOX operation
  // --------------------------------------------------------------------------

  describe("receive operation", () => {
    it("should return messages in the inbox after a send", async () => {
      const context = createMockContext();

      await tool.execute(
        {
          operation: CommunicationOperation.SEND,
          fromAgent: BUILTIN_AGENTS.DOCS,
          toAgent: BUILTIN_AGENTS.RESEARCHER,
          message: {
            subject: "Research request",
            content: "Investigate topic X",
          },
        },
        context,
      );

      const result = await tool.execute(
        {
          operation: CommunicationOperation.RECEIVE,
          fromAgent: BUILTIN_AGENTS.RESEARCHER,
        },
        context,
      );

      expect(result.data?.success).toBe(true);
      expect(result.data?.messages).toBeDefined();
      expect(result.data?.messages!.length).toBeGreaterThanOrEqual(1);
    });

    it("should return an empty message list for a clean inbox", async () => {
      const context = createMockContext();

      const result = await tool.execute(
        {
          operation: CommunicationOperation.RECEIVE,
          fromAgent: BUILTIN_AGENTS.SIMULATOR,
        },
        context,
      );

      expect(result.data?.success).toBe(true);
      expect(result.data?.messages).toEqual([]);
    });

    it("should respect the limit filter", async () => {
      const context = createMockContext();

      // Send 3 messages to the same agent
      for (let i = 0; i < 3; i++) {
        await tool.execute(
          {
            operation: CommunicationOperation.SEND,
            fromAgent: BUILTIN_AGENTS.DOCS,
            toAgent: BUILTIN_AGENTS.SLIDES,
            message: { subject: `Message ${i}`, content: `Content ${i}` },
          },
          context,
        );
      }

      const result = await tool.execute(
        {
          operation: CommunicationOperation.RECEIVE,
          fromAgent: BUILTIN_AGENTS.SLIDES,
          filter: { limit: 2 },
        },
        context,
      );

      expect(result.data?.messages!.length).toBeLessThanOrEqual(2);
    });
  });

  // --------------------------------------------------------------------------
  // BROADCAST operation
  // --------------------------------------------------------------------------

  describe("broadcast operation", () => {
    it("should broadcast a message to all other agents", async () => {
      const context = createMockContext();

      const result = await tool.execute(
        {
          operation: CommunicationOperation.BROADCAST,
          fromAgent: BUILTIN_AGENTS.RESEARCHER,
          message: { subject: "System update", content: "Update your tasks" },
        },
        context,
      );

      expect(result.data?.success).toBe(true);
      expect(result.data?.operation).toBe(CommunicationOperation.BROADCAST);
      expect(result.data?.messages).toBeDefined();
      // Should have sent to all agents except the sender
      const agentCount = Object.values(BUILTIN_AGENTS).length;
      expect(result.data?.messages!.length).toBe(agentCount - 1);
    });

    it("should mark broadcast messages with BROADCAST type", async () => {
      const context = createMockContext();

      const result = await tool.execute(
        {
          operation: CommunicationOperation.BROADCAST,
          fromAgent: BUILTIN_AGENTS.RESEARCHER,
          message: { subject: "Alert", content: "Important notice" },
        },
        context,
      );

      result.data?.messages?.forEach((msg) => {
        expect(msg.type).toBe(MessageType.BROADCAST);
      });
    });
  });

  // --------------------------------------------------------------------------
  // GET_STATUS operation
  // --------------------------------------------------------------------------

  describe("get_status operation", () => {
    it("should retrieve the status of a previously sent message", async () => {
      const context = createMockContext();

      const sendResult = await tool.execute(
        {
          operation: CommunicationOperation.SEND,
          fromAgent: BUILTIN_AGENTS.DOCS,
          toAgent: BUILTIN_AGENTS.DESIGNER,
          message: { subject: "Check this", content: "Details here" },
        },
        context,
      );

      const messageId = sendResult.data?.message?.id as string;

      const statusResult = await tool.execute(
        {
          operation: CommunicationOperation.GET_STATUS,
          fromAgent: BUILTIN_AGENTS.DOCS,
          messageId,
        },
        context,
      );

      expect(statusResult.data?.success).toBe(true);
      expect(statusResult.data?.message?.id).toBe(messageId);
    });

    it("should return success: false when message ID does not exist", async () => {
      const context = createMockContext();

      const result = await tool.execute(
        {
          operation: CommunicationOperation.GET_STATUS,
          fromAgent: BUILTIN_AGENTS.DOCS,
          messageId: "nonexistent-message-id",
        },
        context,
      );

      expect(result.data?.success).toBe(false);
      expect(result.data?.error).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // REPLY operation
  // --------------------------------------------------------------------------

  describe("reply operation", () => {
    it("should reply to an existing message with success: true", async () => {
      const context = createMockContext();

      const sendResult = await tool.execute(
        {
          operation: CommunicationOperation.SEND,
          fromAgent: BUILTIN_AGENTS.DOCS,
          toAgent: BUILTIN_AGENTS.DESIGNER,
          message: { subject: "Original request", content: "Please do X" },
        },
        context,
      );

      const originalMessageId = sendResult.data?.message?.id as string;

      const replyResult = await tool.execute(
        {
          operation: CommunicationOperation.REPLY,
          fromAgent: BUILTIN_AGENTS.DESIGNER,
          toAgent: BUILTIN_AGENTS.DOCS,
          messageId: originalMessageId,
          message: { subject: "Re: Original request", content: "Done" },
        },
        context,
      );

      expect(replyResult.data?.success).toBe(true);
      expect(replyResult.data?.message?.replyTo).toBe(originalMessageId);
    });

    it("should return success: false when replying to a non-existent message", async () => {
      const context = createMockContext();

      const result = await tool.execute(
        {
          operation: CommunicationOperation.REPLY,
          fromAgent: BUILTIN_AGENTS.DESIGNER,
          toAgent: BUILTIN_AGENTS.DOCS,
          messageId: "does-not-exist",
          message: { subject: "Re: Something", content: "Response" },
        },
        context,
      );

      expect(result.data?.success).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // MARK_READ operation
  // --------------------------------------------------------------------------

  describe("mark_read operation", () => {
    it("should mark a delivered message as read", async () => {
      const context = createMockContext();

      const sendResult = await tool.execute(
        {
          operation: CommunicationOperation.SEND,
          fromAgent: BUILTIN_AGENTS.DOCS,
          toAgent: BUILTIN_AGENTS.DESIGNER,
          message: { subject: "Read me", content: "Please read" },
        },
        context,
      );

      const messageId = sendResult.data?.message?.id as string;

      const markResult = await tool.execute(
        {
          operation: CommunicationOperation.MARK_READ,
          fromAgent: BUILTIN_AGENTS.DESIGNER,
          messageId,
        },
        context,
      );

      expect(markResult.data?.success).toBe(true);
      expect(markResult.data?.message?.status).toBe(MessageStatus.READ);
    });

    it("should return success: false when message ID does not exist", async () => {
      const context = createMockContext();

      const result = await tool.execute(
        {
          operation: CommunicationOperation.MARK_READ,
          fromAgent: BUILTIN_AGENTS.DESIGNER,
          messageId: "ghost-message-id",
        },
        context,
      );

      expect(result.data?.success).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Error handling
  // --------------------------------------------------------------------------

  describe("error handling", () => {
    it("should return data.success: false when an unknown operation reaches doExecute", async () => {
      // AgentCommunicationTool.validateInput() correctly returns false for unknown
      // operations (uses Object.values check). BaseTool.execute() does NOT call
      // validateInput — it goes straight to doExecute which returns { success: false }
      // from the default case. BaseTool wraps that as { success: true, data: { success: false } }.
      const context = createMockContext();

      // Force an operation value that passes the fromAgent check but fails the
      // operation enum check by calling execute() directly (bypassing validateInput).
      // The default branch in doExecute returns { success: false, error: "Unknown operation" }.
      const result = await tool.execute(
        {
          operation: "UNKNOWN_OPERATION" as CommunicationOperation,
          fromAgent: BUILTIN_AGENTS.DOCS,
        },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.data?.success).toBe(false);
      expect(result.data?.error).toBeDefined();
    });
  });
});
