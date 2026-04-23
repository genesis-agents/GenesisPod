# Mock Fixture Templates

3 个手工编写的高质量模板，用于程序化扩展出 20 个 fixture。

| 文件                     | TopicType  | Depth    | 复制次数            |
| ------------------------ | ---------- | -------- | ------------------- |
| `macro-standard.ts`      | MACRO      | standard | ×3 variants         |
| `technology-thorough.ts` | TECHNOLOGY | thorough | ×3 variants（更长） |
| `company-standard.ts`    | COMPANY    | standard | ×2 variants         |
| `event-standard.ts`      | EVENT      | standard | ×2 variants         |

合计 10 topic × 2 depth = 20 fixtures（见 `generate-mock-fixtures.ts`）。

## 设计原则

- **结构真**：Prisma model 字段齐全，能被 Golden runner 直接消费
- **内容合理**：LLM prompt/response 是真实 research 场景的简化版
- **规模真实**：standard ~30 LLM calls + 1500 字报告；thorough ~80 calls + 3500 字
- **可复用**：template 只写"骨架"，variant 注入 topic 名与少量差异化字段
