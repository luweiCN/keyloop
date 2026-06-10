# TS Everyday Word Breakdown Injection

## Goal

在 TS 核心目标生成中补齐迁移文档要求：综合练习里的 Everyday English mix 可以注入 everyday/workplace 域的长词拆解题。

## Scope

- 只改 TS 非 UI 核心目标生成逻辑。
- 复用现有个人词库排序、长词拆解行生成、`word_breakdown` 综合练习偏好。
- 不改变 standalone Everyday English mix 的现有行为。
- 不修改 Rust 源码。

## Success Criteria

1. Everyday English 综合练习会优先注入 due 的 everyday/workplace 个人词库拆解题。
   - verify: `bun test ts/tests/targets.test.ts`
2. `word_breakdown.enabled_in_comprehensive=false` 会关闭 Everyday English 综合注入。
   - verify: `bun test ts/tests/targets.test.ts`
3. `word_breakdown.max_items_per_group` 会限制 Everyday English 综合注入数量。
   - verify: `bun test ts/tests/targets.test.ts`
4. TS 全量测试、类型检查、Rust 回归、diff 检查通过。
   - verify: `bun test ts/tests && bun run typecheck`
   - verify: `cargo test --locked --all-targets`
   - verify: `git diff --check`

## Implementation Steps

- [x] 写 Everyday mix 长词拆解注入的 RED 测试。
- [x] 实现 everyday/workplace 域候选选择与注入。
- [x] 运行聚焦测试和全量验证。
- [x] 更新本计划文档状态并汇报。
