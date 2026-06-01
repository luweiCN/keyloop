# KeyLoop Four-Category Menu Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current mixed top-level menu with the confirmed structure: Full practice, four primary training categories, and Stats. Each primary category opens a second-level menu with specialist items and a bottom comprehensive item.

**Architecture:** Keep full practice powered by `DailyPracticePlan`, but stop rendering daily plan lessons as top-level menu entries. Add trainer setup phases for Everyday English and Programming Basics, extend Foundation and Code setup to include a bottom comprehensive option, and add content target builders for standalone category drills. Daily full practice still uses the adaptive four-module generator.

**Tech Stack:** Rust 2024, ratatui TUI, existing `PracticeTarget`/`PracticeLesson` model, `cargo test --locked`, `cargo clippy --locked --all-targets -- -D warnings`.

---

## Confirmed Product Contract

Top-level menu:

```text
1. 综合练习
2. 基础练习
3. 日常练习
4. 编程基础
5. 编程实战
6. 数据统计
```

Second-level menus:

```text
基础练习
- existing foundation drills, such as Home row / Top row / Bottom row / transitions
- 基础综合

日常练习
- 常见 100 词
- 常见 500 词
- 常见 1000 词
- 日常句子
- 日常综合
```

For `常见 100/500/1000 词`, the selected corpus tier stays fixed while the group word count can be switched between `10 / 20 / 50 / 100`.

For `日常句子`, there is one entry only. Sentence length is switched inside the entry between `短 / 中 / 长 / 混合`.

```text
编程基础
- 数字和符号
- 操作符、括号和引号
- 命名和驼峰
- 技术词
- 编程基础综合

编程实战
- 代码块
- 函数块
- 文件片段
- 随机综合
- language/framework/project scope filters remain available in this setup screen
```

---

### Task 1: Top-Level Menu Contract Tests

**Files:**
- Modify: `src/trainer/mod.rs`
- Modify: `src/trainer/copy.rs`

- [ ] **Step 1: Write failing tests**

Add tests that assert `menu_len() == 6`, entering `日常练习` opens `Phase::EverydaySetup`, entering `编程基础` opens `Phase::ProgrammingSetup`, and the menu no longer uses `plan.lessons.len()` as top-level entries.

- [ ] **Step 2: Run red tests**

```bash
cargo test --locked trainer::tests::main_menu_uses_confirmed_four_category_structure
```

Expected: fail because current menu still renders daily lessons as top-level entries.

### Task 2: Content Builders For Standalone Category Drills

**Files:**
- Modify: `src/content/mod.rs`
- Modify: `src/model.rs`

- [ ] **Step 1: Write failing content tests**

Add tests for:

- Everyday word target respects corpus tier and word count.
- Everyday sentence target uses one entry with switchable `EverydaySentenceLength`.
- Programming basics specialist targets are shorter than the full mix and expose distinct sources.
- Code practice can filter by block/function/file level.

- [ ] **Step 2: Implement public builders**

Add focused builders:

- `build_everyday_target(records, category, settings)`
- `build_programming_basics_target(records, category, code_config)`
- `build_code_practice_target(records, repo, plan, code_config, code_level)`

Keep the existing comprehensive generators for full practice.

### Task 3: Everyday Setup Phase

**Files:**
- Modify: `src/trainer/mod.rs`
- Modify: `src/trainer/copy.rs`

- [ ] **Step 1: Add failing trainer tests**

Tests must cover:

- Everyday top-level menu opens setup.
- Everyday setup has exactly five visible entries.
- Word entries cycle group word count with left/right.
- Sentence entry cycles sentence length with left/right.
- Enter starts the selected standalone target.

- [ ] **Step 2: Implement phase and rendering**

Add `Phase::EverydaySetup`, `everyday_index`, word-count setting, and sentence-length setting. Save changed settings into `UserPreferences.everyday_english`.

### Task 4: Programming Basics Setup Phase

**Files:**
- Modify: `src/trainer/mod.rs`
- Modify: `src/trainer/copy.rs`

- [ ] **Step 1: Add failing trainer tests**

Tests must cover:

- Programming basics top-level menu opens setup.
- Selecting `命名和驼峰` starts a target with naming source.
- Selecting bottom comprehensive item starts the existing programming basics mix.

- [ ] **Step 2: Implement phase and rendering**

Add `Phase::ProgrammingSetup`, `programming_index`, specialist entries, and standalone completion behavior.

### Task 5: Foundation And Code Practice Second-Level Menus

**Files:**
- Modify: `src/trainer/mod.rs`
- Modify: `src/content/mod.rs`
- Modify: `src/content/snippets.rs`

- [ ] **Step 1: Add failing tests**

Tests must cover:

- Foundation setup has a bottom `基础综合` item and starts a mixed foundation target.
- Code setup has block/function/file/random modes.
- Code setup still supports language/framework/project filters.

- [ ] **Step 2: Implement behavior**

Extend the existing setup phases instead of creating unrelated flows.

### Task 6: Verification And Docs

**Files:**
- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/ROADMAP.en.md`

- [ ] **Step 1: Update docs to the confirmed menu**

Remove wording that says plan lessons appear directly in the top-level menu.

- [ ] **Step 2: Full verification**

```bash
cargo fmt --check
cargo test --locked --all-targets
cargo clippy --locked --all-targets -- -D warnings
cargo install --path . --locked --debug --force
/Users/luwei/.cargo/bin/keyloop plan
```

Expected: all pass and installed binary is updated.
