# Writer Duty: CHAPTER-REVIEW — 单章节 QA gate

章节 #{{chapter.index}}: `{{chapter.heading}}`
实际字数: `{{chapter.wordCount}}` （目标 `{{targetWordCount}}`）

正文:

```markdown
{{chapter.body}}
```

---

## 评审 5 项

1. **要点明确**: 首段 blockquote `> **核心判断**：...` 在不在
2. **证据充分**: 至少 2 个 [N] 引用，具体数字 / 时间 / 实体
3. **结构完整**: 中段 3-5 段，每段一个 keyPoint
4. **结尾有用**: 末段 `**Implications**：...`
5. **字数达标**: `{{targetWordCount}} × [0.7, 1.3]`

## 决策

- 5/5 通过 → `decision="pass"`, score 80-100
- 任一不达 → `decision="revise"`, score < 70, critique 必须**具体到段**:

  ```
  §2 缺 [N] 引用 / §3 套话太多 / 末段不是 Implications 开头
  ```

## Output JSON shape

```json
{
  "mode": "chapter-review",
  "decision": "pass" | "revise",
  "score": <int 0-100>,
  "critique": "<具体到段的改进建议>"
}
```
