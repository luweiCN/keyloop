# AGENTS.md

KeyLoop：面向程序员的终端打字训练工具（TypeScript / Bun / OpenTUI）。

## 给 agent / grill 会话的导航

- **领域术语**：`CONTEXT.md`（击键结构、薄弱诊断、靶向训练层、内容练习层、错题回流等）
- **关键决策**：`docs/adr/`（0001 应用层不回流、0002 薄弱只归因击键结构、0003 折行光标）
- **待办 / follow-up**：`TODO.md` —— **grill 会话可从这里拿出待办，讨论"现在做哪个、怎么做"**
- **产品路线**：`docs/ROADMAP.md`

## 命令

- 测试：`bun test tests`
- 类型检查：`bun run typecheck`

## 发版约定（重要，勿踩坑）

`release.yml` 由 **push `main`** 自动触发：建 tag + GitHub Release + 更新 Homebrew tap。

- 发版 = 改 `package.json` 的 `version` + push `main`，CI 全自动完成其余。
- **绝不手动 push tag** —— 会让 workflow 的"tag 已存在"检查跳过整个发布（空跑）。
- 发版同时**必须同步** `tests/package.test.ts` 里硬编码的版本断言，否则该测试会一直红。
- Bash 沙箱会拦截 `git push` 的网络写，push 时需放开沙箱。
