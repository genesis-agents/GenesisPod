---
paths:
  - "**/*.spec.ts"
  - "**/*.test.ts"
  - "**/__tests__/**"
---

# 测试规则

## 测试文件位置

- 单元测试：与源文件同目录，后缀 `.spec.ts`
- E2E 测试：`tests/e2e/` 目录

## AAA 模式

```typescript
describe("UserService", () => {
  describe("create", () => {
    it("should create user with valid data", async () => {
      // Arrange - 准备测试数据
      const createDto = { name: "Test", email: "test@example.com" };

      // Act - 执行被测方法
      const result = await service.create(createDto);

      // Assert - 验证结果
      expect(result).toMatchObject({
        name: "Test",
        email: "test@example.com",
      });
    });
  });
});
```

## 覆盖率要求

- 整体覆盖率: >= 80%
- 关键模块覆盖率: >= 90%
- 新代码覆盖率: >= 85%

## Mock 规范

```typescript
// 使用 jest.mock 隔离依赖
jest.mock("@/modules/ai-engine/llm/services/ai-chat.service");

// Mock 实现要有意义
const mockAiChatService = {
  chat: jest.fn().mockResolvedValue({
    content: "mock response",
    tokensUsed: 100,
  }),
};
```

## 边界条件必测

- 空值/undefined 输入
- 空数组/空对象
- 边界数值 (0, -1, MAX_VALUE)
- 错误路径和异常
- 并发/竞态条件
