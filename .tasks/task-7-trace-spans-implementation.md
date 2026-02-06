# Task 7: Add TraceCollectorService Spans to AiChatService

## Summary

Successfully added observability support to `AiChatService.chat()` by integrating `TraceCollectorService` span recording. This enables end-to-end tracing of LLM calls across the AI Engine.

## Changes Made

### 1. Updated AiChatService (`ai-chat.service.ts`)

#### Imports

- Added import for `TraceCollectorService` from observability module

#### Constructor

- Added `@Optional() private readonly traceCollector?: TraceCollectorService` parameter
- Ensures backward compatibility with optional injection

#### ChatCompletionOptions Interface

- Added `traceId?: string` field to enable trace propagation

#### chat() Method Options

- Added `traceId?: string` parameter to the method signature

#### Span Recording Logic

Added span recording at key points:

**Start of chat():**

```typescript
let spanId: string | undefined;
if (this.traceCollector && traceId) {
  spanId = this.traceCollector.addSpan(traceId, {
    name: "ai-chat",
    type: "llm_call",
    metadata: {
      modelType,
      providedModel,
      messageCount: messages.length,
      hasSystemPrompt: !!systemPrompt,
      hasTaskProfile: !!taskProfile,
    },
  });
}
```

**End of chat() - Success:**

```typescript
if (this.traceCollector && spanId) {
  this.traceCollector.endSpan(spanId, {
    status: "success",
    output: {
      model: result.model,
      tokensUsed: result.tokensUsed,
      apiKeySource: result.apiKeySource,
      attemptCount: attempt + 1,
    },
  });
}
```

**End of chat() - Error:**

```typescript
if (this.traceCollector && spanId) {
  this.traceCollector.endSpan(spanId, {
    status: "error",
    error: `Error message`,
    output: {
      /* error context */
    },
  });
}
```

#### Coverage Points

Span ending added at:

1. Path B (direct API key) - success and error paths
2. Guardrails input block
3. Guardrails output block
4. Successful response after fallback
5. All models failed error

### 2. Updated Tests (`ai-chat.service.spec.ts`)

#### Imports

- Added `TraceCollectorService` import

#### Mock Setup

- Added `mockTraceCollectorService` with `addSpan` and `endSpan` methods
- Added to test module providers

#### New Test Suite: "Trace Integration"

Added 4 comprehensive tests:

1. **should record trace span when traceId is provided** - Verifies span creation and ending on success
2. **should not record trace span when traceId is not provided** - Ensures no-op when traceId missing
3. **should end trace span with error status on failure** - Verifies error tracking
4. **should work when trace collector not available** - Ensures backward compatibility

### 3. Module Configuration

No changes needed to `ai-engine-llm.module.ts` because:

- `TraceCollectorService` is provided in parent `AiEngineModule` (line 139)
- `AiEngineModule` is marked as `@Global()` (line 90)
- Service is exported from `AiEngineModule` (line 179)
- Automatically available via NestJS DI to all child modules

## Architecture Integration

### Trace Flow

```
AI App Layer
    ↓
AiChatService.chat(options: { ..., traceId })
    ↓ (if traceId provided)
TraceCollectorService.addSpan(traceId, spanData)
    ↓
[LLM API Call]
    ↓
TraceCollectorService.endSpan(spanId, result)
```

### Metadata Captured

- **Input**: modelType, providedModel, messageCount, hasSystemPrompt, hasTaskProfile
- **Output**: model, tokensUsed, apiKeySource, attemptCount (on success)
- **Error**: error message, triedModels (on failure)

## Benefits

1. **Observability**: Full visibility into LLM call execution
2. **Performance Tracking**: Duration automatically calculated by TraceCollectorService
3. **Error Tracking**: Captures failure reasons and contexts
4. **Fallback Analysis**: Records attempt count and model switches
5. **Zero Breaking Changes**: Optional parameter, backward compatible

## Testing

All 65 tests pass, including 4 new trace integration tests:

- ✅ Span recording with traceId
- ✅ No-op without traceId
- ✅ Error span recording
- ✅ Works without TraceCollectorService

## Usage Example

```typescript
// In AI App layer
const traceId = this.traceCollector.startTrace({
  name: "research-query",
  type: "research_mission",
});

const result = await this.aiChatService.chat({
  messages: [{ role: "user", content: "Research AI trends" }],
  modelType: AIModelType.CHAT,
  traceId, // ← Pass traceId for observability
});

this.traceCollector.endTrace(traceId, { status: "success" });

// View trace
const trace = this.traceCollector.getTrace(traceId);
// trace.spans includes the "ai-chat" span with full metadata
```

## Files Modified

1. `backend/src/modules/ai-engine/llm/services/ai-chat.service.ts`
   - Added TraceCollectorService injection
   - Added traceId parameter support
   - Added span recording at 6 key points

2. `backend/src/modules/ai-engine/llm/services/__tests__/ai-chat.service.spec.ts`
   - Added TraceCollectorService mock
   - Added 4 trace integration tests
   - Fixed unused import warning

## Next Steps

This implementation enables:

- Task 8: Update AI Research to use trace spans
- Task 9: Add trace spans to other AI Apps
- Future: UI visualization of trace data via GET /ai/observability/traces/:id

## Related Documentation

- TraceCollectorService: `backend/src/modules/ai-engine/observability/trace-collector.service.ts`
- Trace Interfaces: `backend/src/modules/ai-engine/observability/trace.interface.ts`
- Architecture Plan: `.tasks/ai-engine-architecture-fix-plan.md`
