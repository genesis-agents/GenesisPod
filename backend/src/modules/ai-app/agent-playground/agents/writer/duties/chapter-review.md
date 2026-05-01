# Writer Duty: CHAPTER-REVIEW — 单章节 QA gate

章节 #{{chapter.index}}: `{{chapter.heading}}`
实际字数: `{{chapter.wordCount}}` （目标 `{{targetWordCount}}`）

正文:

```markdown
{{chapter.body}}
```

---

## 评审 6 项（与 TI 撰稿标准对齐）

1. **观点独立性**: 每段是否包含独立、具体、可被证伪的 thesis claim？
   - ✓ 段首给出独立判断（如「这意味着...」「核心原因在于...」「不能据此推出...」）
   - ✗ 段首仅复述章节标题或仅转述证据（无独立判断）

2. **去模板化**: 是否避免了 `> **核心判断**：` 首段 + `**Implications**：` 末段的固定八股？
   - 同一报告里所有章节用同一句式开头 = 不通过
   - 每章可有自己的开头/收尾节奏，但不允许同一模板复用

3. **证据充分**: 至少 2 个 `[N]` 引用，包含具体数字 / 时间 / 实体；引用嵌入论证句中（不堆在段尾）

4. **论证完整**: 中段 3~5 段，每段一个 keyPoint 充分展开 100~300 字（不写电报式短句独行）

5. **去套话**: 不出现「随着 X 的发展」「在当今」「众所周知」「综上所述」等模板开头

6. **字数达标**: `{{targetWordCount}} × [0.7, 1.3]`

## 决策

- 6/6 通过 → `decision="pass"`, score 80-100
- 任一不达 → `decision="revise"`, score < 70, critique 必须**具体到段**，标注是哪一项不达：

  ```
  §2 段首仅复述章节标题，需替换为独立判断（评审项 1）
  §3 末段套用「**Implications**：」模板前缀，需直接写启示句（评审项 2）
  §4 缺 [N] 引用（评审项 3）
  ```

## Output JSON shape

```json
{
  "mode": "chapter-review",
  "decision": "pass" | "revise",
  "score": <int 0-100>,
  "critique": "<具体到段，标注哪一项不达的改进建议>"
}
```
