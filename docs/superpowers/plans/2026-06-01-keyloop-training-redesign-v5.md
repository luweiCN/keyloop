# KeyLoop Adaptive Training Maturity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make comprehensive practice reduce stable modules, keep weak modules in one short review-oriented group, and explain those choices in lesson reasons.

**Architecture:** Keep V5 inside the existing content planner. Add a small `ModuleReadiness` helper in `src/content/mod.rs` that derives stable/weak module state from recent `SessionRecord`s, then use it when building the daily module sequence and lesson reasons. Reuse existing code difficulty selection for code stage progression.

**Tech Stack:** Rust 2024, existing `SessionRecord` model, `cargo test --locked`, `cargo clippy --locked --all-targets -- -D warnings`.

---

### Task 1: Module Readiness Tests

**Files:**
- Modify: `src/content/mod.rs`

- [ ] **Step 1: Write failing tests**

Add tests near the current adaptive daily plan tests:

```rust
#[test]
fn stable_foundation_module_reduces_daily_frequency() {
    let records = stable_module_records(TrainingModule::FoundationInput, TrainingCategory::FoundationMix);
    let plan = PracticePlan {
        focus_words: Vec::new(),
        focus_symbols: Vec::new(),
        focus_code: Vec::new(),
        focus_keys: Vec::new(),
        advice: Vec::new(),
        recommended_mode: Mode::Mixed,
        has_recent_history: true,
    };

    let daily = build_daily_practice_plan(&records, None, &plan, &CodePracticeConfig::default())
        .expect("adaptive plan should build");

    assert!(!daily.lessons.iter().any(|lesson| lesson.module == TrainingModule::FoundationInput));
    assert!(daily.lessons.len() >= 3);
}

#[test]
fn weak_foundation_module_stays_single_short_review_group() {
    let mut records = weak_module_records(TrainingModule::FoundationInput, TrainingCategory::FoundationMix);
    let plan = PracticePlan {
        focus_words: Vec::new(),
        focus_symbols: Vec::new(),
        focus_code: Vec::new(),
        focus_keys: vec!["j".to_string(), ";".to_string()],
        advice: Vec::new(),
        recommended_mode: Mode::Chars,
        has_recent_history: true,
    };

    let daily = build_daily_practice_plan(&records, None, &plan, &CodePracticeConfig::default())
        .expect("adaptive plan should build");
    let foundation = daily
        .lessons
        .iter()
        .filter(|lesson| lesson.module == TrainingModule::FoundationInput)
        .collect::<Vec<_>>();

    assert_eq!(foundation.len(), 1);
    assert!(foundation[0].estimated_minutes <= 4);
    assert!(foundation[0].reason_zh.contains("短复习"));
    records.clear();
}
```

Add helper records in the same test module:

```rust
fn stable_module_records(module: TrainingModule, category: TrainingCategory) -> Vec<SessionRecord> {
    (0..3)
        .map(|_| SessionRecord {
            module,
            category,
            typed_len: 120,
            target_len: 120,
            correct_chars: 118,
            accuracy: 98.5,
            error_count: 1,
            backspace_count: 1,
            completion_state: CompletionState::Completed,
            started_at: chrono::Utc::now(),
            ..SessionRecord::default()
        })
        .collect()
}

fn weak_module_records(module: TrainingModule, category: TrainingCategory) -> Vec<SessionRecord> {
    vec![SessionRecord {
        module,
        category,
        typed_len: 100,
        target_len: 100,
        correct_chars: 84,
        accuracy: 84.0,
        error_count: 16,
        backspace_count: 18,
        completion_state: CompletionState::Completed,
        started_at: chrono::Utc::now(),
        ..SessionRecord::default()
    }]
}
```

- [ ] **Step 2: Run red tests**

Run:

```bash
cargo test --locked content::tests::stable_foundation_module_reduces_daily_frequency
cargo test --locked content::tests::weak_foundation_module_stays_single_short_review_group
```

Expected: tests fail because the planner still always emits the foundation module and static reasons.

### Task 2: Readiness Model

**Files:**
- Modify: `src/content/mod.rs`

- [ ] **Step 1: Add readiness helper**

Add a private helper below `PlanBuildState`:

```rust
#[derive(Debug, Default)]
struct ModuleReadiness {
    stable_modules: BTreeSet<TrainingModule>,
    weak_modules: BTreeSet<TrainingModule>,
}
```

Compute per-module samples from recent records, ignoring `TrainingModule::Unknown`, `TrainingModule::Comprehensive`, and empty records where both `typed_len` and `target_len` are zero.

- [ ] **Step 2: Thread readiness into lesson building**

Add `readiness: &'a ModuleReadiness` to `LessonBuildContext<'a>`. Build it once in `build_daily_practice_plan` and `refresh_module_mix_target`.

- [ ] **Step 3: Verify readiness tests still fail for sequence/reason only**

Run the same two tests. Expected: the helper compiles, but behavior is still missing.

### Task 3: Stable Reduction and Weak Review Reasons

**Files:**
- Modify: `src/content/mod.rs`

- [ ] **Step 1: Filter stable modules from the daily sequence**

Change `comprehensive_module_sequence()` to accept `readiness` and `plan`. Skip a stable non-code module only when it is not weak and the current plan has no direct focus for that module. Keep at least three module groups so comprehensive practice remains broad.

- [ ] **Step 2: Make lesson reasons dynamic**

Replace static reason strings with a helper that appends:

- `短复习：根据最近错项/慢项加权。` for weak modules.
- `已稳定：本轮降频或缩短。` for stable modules that remain, such as code practice stage progression.

- [ ] **Step 3: Run green tests**

Run:

```bash
cargo test --locked content::tests::stable_foundation_module_reduces_daily_frequency
cargo test --locked content::tests::weak_foundation_module_stays_single_short_review_group
```

Expected: both tests pass.

### Task 4: Regression Verification

**Files:**
- Modify only if verification exposes a bug.

- [ ] **Step 1: Run full tests and lint**

Run:

```bash
cargo fmt --check
cargo test --locked --all-targets
cargo clippy --locked --all-targets -- -D warnings
```

- [ ] **Step 2: Verify CLI output**

Run:

```bash
cargo run --locked -- plan
cargo install --path . --locked --debug --force
/Users/luwei/.cargo/bin/keyloop plan
```

Expected: all commands complete and the installed binary still shows the current plan.
