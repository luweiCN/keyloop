# TODO / Follow-ups

待办与后续项。**grill 会话可基于本文件讨论"现在做哪个、怎么做"。**

## 薄弱诊断完整收敛（来自 ADR-0002）

本批源自 2026-06-20 综合训练 QA。ADR-0002 确立"薄弱只归因击键结构、内容单位不回流"，已落地综合训练**单词**路径（废 ③ 具体错词回流、留 ② 维度加权），剩余：

- [ ] **#1 符号薄弱诊断按编程语言区分**（设计待定，值得 grill 讨论）
  现 `focus_symbols` 是全局的、符号卡选语言是随机的（实测给到 Kotlin/C# 卡，与用户 pinned 的 typescript 脱节）。应按语言出卡 + 按语言诊断薄弱的符号 / 固定组合（如 JS `=>` vs Rust `::`）。
  待决点：全局诊断是否拆成按语言？符号卡语言如何与 pinned/code 偏好对齐？

- [ ] **#2 移除 legacy `plan.focus_words`**（扫尾）
  综合训练走的 `profile.focus.words` 已废；standalone / CLI 旧模块用的 `plan.focus_words` 仍在回流，为 ADR 一致性应清。

- [ ] **#3 移除代码内容回流 `plan.focus_code`**（扫尾）
  代码模块仍优先安排含错过标识符的片段；ADR-0002 认定代码片段也是内容单位、不应回流。

- [ ] **#4 严格跨天去重**（扫尾，锦上添花）
  #3 已用随机打乱缓解"数字每天一样"，未做硬性"排除昨天用过"。卡池大 + 已随机后重复概率已很低。

详见 `docs/adr/0002-weakness-only-by-keystroke-structure.md` 的"后果"段。

## 已知问题

- [ ] `tests/package.test.ts:56` 硬编码版本断言，需随发版同步（见 AGENTS.md「发版约定」）。
