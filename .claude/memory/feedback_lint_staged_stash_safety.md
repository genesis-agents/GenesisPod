---
name: lint-staged-stash-mishap
description: lint-staged + commit-msg hook 双重失败时 stash/pop 错位会污染 commit 内容；多 session 并行风险更高
type: feedback
originSessionId: acdf2e58-962d-41b9-bf28-19d5d36e5773
---

事故：W4 commit 第一次因 commit-msg hook（subject case 不合规）失败，第二次重试时 lint-staged 的 backup stash 没正确 pop 完成 — 结果误把另一个 session 留在 working tree 里的 BYOK 未跟踪文件 + ai-chat.service.ts modification 装进了我的 commit。用户察觉后用 `git reset HEAD~1 --soft` + 手动 unstage BYOK 救场，再被另一个 agent 把我整套 W4 stash 起来（"OTHER-SESSION-notifications-WIP-2026-05-05"）以便他们独立 commit BYOK。

**Why**：lint-staged 在 commit 失败时尝试 restore，但 commit-msg hook 失败发生在 lint-staged restore 之后；retry 时 staged/unstaged 的边界已被搅乱；同时另一个 session 的并行 work 让现场更复杂。

**How to apply**：

- commit message 必须一次写对：subject 全小写 + body 行宽 ≤ 100，本仓 commitlint 严格执行
- 多 session 并行时，stash 提交前一定 `git status --short` 看哪些不是自己的；不是自己的文件不能进 commit
- 用 explicit 文件 path 列表 stage，**永远不用 `git add .` 或 `git add -A`**（CLAUDE.md 已警告，本次再次验证）
- 第一次 commit 失败后，第二次前先 `git status --short` 重新确认 staged/unstaged 边界
- 如果 working tree 已被搅乱，**先 `git reset --soft` 撤回 commit 看清现场**，再决定是 unstage 别人的文件还是把自己的工作 stash 起来再来一次
- 别人帮你 stash 时，stash 名应包含 session 标识（例 "OTHER-SESSION-xxx-WIP"）方便定位
- stash apply 后可能不是 1:1 干净（HEAD 已变），需要逐文件审查冲突；尤其涉及 biz-name leakage 这类架构修正的并行 commit

**2026-05-10 新成因 —— pathspec + lint-staged 工作流互冲**：

`git commit -- pathspec` 的语义是"从工作区取这些 path 提交"。lint-staged 流程：stash → prettier 改 → git add 改后版 → stash-pop。**stash-pop 把工作区滚回我手写版**（覆盖 prettier 的结果），然后 pathspec commit 从工作区读 = 把我手写版（非 prettier 版）写进 HEAD。INDEX 留在 prettier 版变成孤儿。`git status` 看到 `MM` 假象，但 HEAD 内容其实没问题。

清理：`git restore --staged <file>` 一条就够（让 INDEX 跟回 HEAD）。**根治**：见 [feedback_prettier_after_write.md](feedback_prettier_after_write.md) —— 写完代码立即跑 prettier，让 commit 时 lint-staged 找不到东西可改，不触发 stash → 整条工作流被绕过。
