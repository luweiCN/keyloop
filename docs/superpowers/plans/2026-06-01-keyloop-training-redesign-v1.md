# KeyLoop Training Redesign V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the duplicated flat comprehensive plan with module-level mixed groups, user-facing module structure, global code scope preferences, and a weak-point feedback path that later groups can consume.

**Architecture:** Keep the existing Rust binary and JSONL storage. Add compatibility-safe model fields and focused helper modules instead of rewriting the TUI at once. V1 uses the current `PracticeLesson` flow, but each comprehensive lesson becomes one module mix group generated from reusable module-level builders.

**Tech Stack:** Rust 2024, serde/serde_json, chrono, clap, crossterm, ratatui, current `content/*.json` corpora.

---

## File Structure

- Modify `src/model.rs`: add module/category enums, practice settings, weak feedback structs, and backward-compatible `PracticeLesson` / `SessionRecord` fields.
- Create `src/feedback.rs`: derive `GroupFeedback` from `SessionRecord` and merge it into run-level weak signals.
- Modify `src/content/mod.rs`: replace duplicate daily lesson sequencing with `foundation_mix`, `everyday_english_mix`, `programming_basics_mix`, and `code_practice_mix`.
- Modify `src/content/library.rs`: expose existing corpora to the new mix builders without changing content license boundaries.
- Modify `src/plan.rs`: preserve historical weak signal extraction and make it reusable by module builders.
- Modify `src/storage.rs`: extend `UserPreferences` persistence for global code scope and everyday settings.
- Modify `src/trainer/mod.rs`: add staged comprehensive target refresh and global code-scope selection persistence.
- Modify `src/trainer/copy.rs`: update labels from the old flat lesson vocabulary to the new module vocabulary.
- Modify `src/main.rs`: pass preferences/global code scope into plan generation.
- Modify `tests/cli_commands.rs`: add black-box checks for preferences and plan output where possible.

## Task 1: Compatibility-Safe Model Fields

**Files:**
- Modify: `src/model.rs`

- [ ] **Step 1: Add failing model compatibility tests**

Add tests inside `#[cfg(test)] mod tests` in `src/model.rs`:

```rust
#[test]
fn lesson_defaults_missing_module_fields() {
    let lesson: PracticeLesson = serde_json::from_str(
        r#"{
            "id": "daily:words:1",
            "kind": "words",
            "estimated_minutes": 3,
            "target": {"mode": "words", "text": "return value", "source": "test"},
            "reason_zh": "测试",
            "reason_en": "test"
        }"#,
    )
    .expect("legacy lesson should deserialize");

    assert_eq!(lesson.module, TrainingModule::ProgrammingBasics);
    assert_eq!(lesson.category, TrainingCategory::ProgrammingTerms);
    assert_eq!(lesson.mix_profile, MixProfile::Standalone);
}

#[test]
fn session_defaults_missing_module_fields() {
    let record: SessionRecord = serde_json::from_str(
        r#"{
            "started_at": "2026-05-30T00:00:00Z",
            "mode": "words",
            "source": "legacy",
            "duration_ms": 60000,
            "target_text": "hello",
            "user_input": "hello",
            "target_len": 5,
            "typed_len": 5,
            "correct_chars": 5,
            "wpm": 10.0,
            "raw_wpm": 10.0,
            "accuracy": 100.0,
            "error_count": 0,
            "backspace_count": 0
        }"#,
    )
    .expect("legacy session should deserialize");

    assert_eq!(record.module, TrainingModule::Unknown);
    assert_eq!(record.category, TrainingCategory::Unknown);
}
```

- [ ] **Step 2: Run model tests and verify they fail**

Run:

```bash
cargo test --locked model::tests::lesson_defaults_missing_module_fields model::tests::session_defaults_missing_module_fields
```

Expected: compile failure because `TrainingModule`, `TrainingCategory`, `MixProfile`, and new fields do not exist.

- [ ] **Step 3: Add enums, defaults, and fields**

Add these types after `LessonKind` in `src/model.rs`:

```rust
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TrainingModule {
    #[default]
    Unknown,
    Comprehensive,
    FoundationInput,
    EverydayEnglish,
    ProgrammingBasics,
    CodePractice,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TrainingCategory {
    #[default]
    Unknown,
    FoundationMix,
    HomeRow,
    TopRow,
    BottomRow,
    FingerTransitions,
    PunctuationEdges,
    LetterCombinations,
    BasicWords,
    EverydayWords,
    EverydayPhrases,
    EverydaySentences,
    EverydayMix,
    NumbersSymbols,
    OperatorsBracketsQuotes,
    ProgrammingTerms,
    NamingStyles,
    ProgrammingBasicsMix,
    CodeSnippet,
    CodeFunction,
    CodeFileFragment,
    CodeMix,
    Review,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MixProfile {
    #[default]
    Standalone,
    Comprehensive,
    Review,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EverydaySentenceLength {
    Short,
    Medium,
    Long,
    #[default]
    Mixed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct EverydayEnglishSettings {
    pub word_count: usize,
    pub sentence_length: EverydaySentenceLength,
    pub include_phrases: bool,
}

impl Default for EverydayEnglishSettings {
    fn default() -> Self {
        Self {
            word_count: 50,
            sentence_length: EverydaySentenceLength::Mixed,
            include_phrases: true,
        }
    }
}
```

Add fields to `PracticeLesson`:

```rust
    #[serde(default = "default_lesson_module")]
    pub module: TrainingModule,
    #[serde(default = "default_lesson_category")]
    pub category: TrainingCategory,
    #[serde(default)]
    pub mix_profile: MixProfile,
```

Add fields to `SessionRecord` and `Default`:

```rust
    #[serde(default)]
    pub module: TrainingModule,
    #[serde(default)]
    pub category: TrainingCategory,
```

Add helper functions:

```rust
fn default_lesson_module() -> TrainingModule {
    TrainingModule::ProgrammingBasics
}

fn default_lesson_category() -> TrainingCategory {
    TrainingCategory::ProgrammingTerms
}
```

- [ ] **Step 4: Update constructors**

Update the local `lesson(...)` helper in `src/content/mod.rs` later in Task 3. Temporarily set fields in existing literal tests in `src/storage.rs` with `..Default::default()` unavailable for `PracticeLesson`, or add explicit defaults:

```rust
module: TrainingModule::Unknown,
category: TrainingCategory::Unknown,
mix_profile: MixProfile::Standalone,
```

- [ ] **Step 5: Run model and storage tests**

Run:

```bash
cargo test --locked model::tests storage::tests
```

Expected: PASS after all literals are updated.

## Task 2: Weak-Point Feedback Types and Extraction

**Files:**
- Create: `src/feedback.rs`
- Modify: `src/main.rs`
- Modify: `src/plan.rs`
- Modify: `src/model.rs`

- [ ] **Step 1: Write feedback tests**

Create `src/feedback.rs` with tests first:

```rust
use crate::model::{GroupFeedback, KeyAction, SessionRecord, TokenKind};

pub fn group_feedback(record: &SessionRecord) -> GroupFeedback {
    let mut feedback = GroupFeedback::default();
    for (key, count) in &record.error_chars {
        feedback.error_keys.push((key.clone(), *count));
    }
    for stat in &record.token_stats {
        if stat.errors > 0 {
            feedback.error_tokens.push((stat.token.clone(), stat.errors));
        }
        if stat.start_delay_ms + stat.duration_ms >= 1_200 {
            feedback
                .slow_tokens
                .push((stat.token.clone(), stat.start_delay_ms + stat.duration_ms));
        }
    }
    for event in &record.key_events {
        if matches!(event.action, KeyAction::Insert) && !event.correct {
            let label = event
                .expected
                .or(event.input)
                .map(|ch| ch.to_string())
                .unwrap_or_else(|| "extra".to_string());
            feedback.error_keys.push((label, 1));
        }
    }
    feedback.normalize();
    feedback
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Mode, TokenStat};

    #[test]
    fn feedback_extracts_error_and_slow_tokens() {
        let record = SessionRecord {
            mode: Mode::Words,
            token_stats: vec![
                TokenStat {
                    token: "response".to_string(),
                    kind: TokenKind::Word,
                    start_delay_ms: 900,
                    duration_ms: 500,
                    errors: 1,
                },
                TokenStat {
                    token: "return".to_string(),
                    kind: TokenKind::Word,
                    start_delay_ms: 50,
                    duration_ms: 120,
                    errors: 0,
                },
            ],
            ..SessionRecord::default()
        };

        let feedback = group_feedback(&record);

        assert_eq!(feedback.error_tokens, vec![("response".to_string(), 1)]);
        assert_eq!(feedback.slow_tokens, vec![("response".to_string(), 1_400)]);
    }
}
```

- [ ] **Step 2: Add model structs**

Add to `src/model.rs`:

```rust
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct GroupFeedback {
    #[serde(default)]
    pub error_keys: Vec<(String, u32)>,
    #[serde(default)]
    pub slow_keys: Vec<(String, u64)>,
    #[serde(default)]
    pub error_tokens: Vec<(String, u32)>,
    #[serde(default)]
    pub slow_tokens: Vec<(String, u64)>,
    #[serde(default)]
    pub missed_symbols: Vec<(String, u32)>,
    #[serde(default)]
    pub backspace_clusters: Vec<(String, u32)>,
}

impl GroupFeedback {
    pub fn normalize(&mut self) {
        self.error_keys.sort();
        self.error_keys.dedup();
        self.slow_keys.sort();
        self.slow_keys.dedup();
        self.error_tokens.sort();
        self.error_tokens.dedup();
        self.slow_tokens.sort();
        self.slow_tokens.dedup();
        self.missed_symbols.sort();
        self.missed_symbols.dedup();
        self.backspace_clusters.sort();
        self.backspace_clusters.dedup();
    }
}
```

- [ ] **Step 3: Register module**

Add in `src/main.rs`:

```rust
mod feedback;
```

- [ ] **Step 4: Run feedback tests**

Run:

```bash
cargo test --locked feedback::tests
```

Expected: PASS.

## Task 3: Module Mix Builders

**Files:**
- Modify: `src/content/mod.rs`
- Modify: `src/model.rs`

- [ ] **Step 1: Write content tests**

Add tests at the bottom of `src/content/mod.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{
        EverydayEnglishSettings, MixProfile, TrainingCategory, TrainingModule,
    };

    #[test]
    fn daily_plan_has_one_main_group_per_module() {
        let records = Vec::new();
        let plan = crate::plan::build_plan(&records, crate::model::Language::Zh);
        let daily = build_daily_practice_plan(
            &records,
            None,
            &plan,
            &CodePracticeConfig::default(),
        )
        .expect("daily plan should build");

        let modules = daily
            .lessons
            .iter()
            .map(|lesson| lesson.module)
            .collect::<Vec<_>>();

        assert_eq!(
            modules,
            vec![
                TrainingModule::FoundationInput,
                TrainingModule::EverydayEnglish,
                TrainingModule::ProgrammingBasics,
                TrainingModule::CodePractice,
            ]
        );
    }

    #[test]
    fn everyday_mix_honors_word_count_setting() {
        let library = library::load().expect("library loads");
        let target = everyday_english_mix(
            &crate::plan::build_plan(&[], crate::model::Language::Zh),
            &library,
            EverydayEnglishSettings {
                word_count: 25,
                ..EverydayEnglishSettings::default()
            },
            MixProfile::Standalone,
        );

        let word_count = target.text.split_whitespace().count();
        assert!(word_count >= 25, "word_count={word_count}");
        assert!(word_count <= 40, "word_count={word_count}");
    }
}
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
cargo test --locked content::tests::daily_plan_has_one_main_group_per_module content::tests::everyday_mix_honors_word_count_setting
```

Expected: compile failure because `everyday_english_mix` and module fields are not wired.

- [ ] **Step 3: Replace daily sequence with module mix sequence**

In `build_daily_practice_plan`, replace the `adaptive_lesson_sequence` loop with:

```rust
let lesson_specs = comprehensive_module_sequence();
let mut lessons = Vec::new();
for (kind, module, category) in lesson_specs {
    let lesson_id = next_lesson_id(kind, &mut occurrence_counts);
    let lesson = build_module_mix_lesson(lesson_id, kind, module, category, &mut build_context)?;
    build_context.build_state.observe_lesson(&lesson);
    lessons.push(lesson);
}
```

Add:

```rust
fn comprehensive_module_sequence() -> Vec<(LessonKind, TrainingModule, TrainingCategory)> {
    vec![
        (
            LessonKind::Foundation,
            TrainingModule::FoundationInput,
            TrainingCategory::FoundationMix,
        ),
        (
            LessonKind::CommonWords,
            TrainingModule::EverydayEnglish,
            TrainingCategory::EverydayMix,
        ),
        (
            LessonKind::Symbols,
            TrainingModule::ProgrammingBasics,
            TrainingCategory::ProgrammingBasicsMix,
        ),
        (
            LessonKind::CodeBlock,
            TrainingModule::CodePractice,
            TrainingCategory::CodeMix,
        ),
    ]
}
```

- [ ] **Step 4: Add module mix lesson builder**

Add `build_module_mix_lesson` beside `build_lesson`:

```rust
fn build_module_mix_lesson(
    id: String,
    kind: LessonKind,
    module: TrainingModule,
    category: TrainingCategory,
    context: &mut LessonBuildContext<'_>,
) -> Result<PracticeLesson> {
    let (estimated_minutes, target, reason_zh, reason_en) = match module {
        TrainingModule::FoundationInput => (
            4,
            foundation_mix(context),
            "基础输入综合：覆盖 home/top/bottom row，并加重最近弱键。".to_string(),
            "Foundation mix: cover rows and increase recent weak keys.".to_string(),
        ),
        TrainingModule::EverydayEnglish => (
            4,
            everyday_english_mix(
                context.plan,
                context.library,
                EverydayEnglishSettings::default(),
                MixProfile::Comprehensive,
            ),
            "日常英语综合：常见词、词块和自然英文输入。".to_string(),
            "Everyday English mix: common words, chunks, and natural English.".to_string(),
        ),
        TrainingModule::ProgrammingBasics => (
            4,
            programming_basics_mix(context),
            "编程基础综合：数字、符号、命名和技术词。".to_string(),
            "Programming basics mix: numbers, symbols, naming, and technical terms.".to_string(),
        ),
        TrainingModule::CodePractice => (
            4,
            code_practice_mix(context)?,
            "代码实战综合：把前面的弱点放回完整代码里。".to_string(),
            "Code practice mix: move weak items back into complete code.".to_string(),
        ),
        _ => build_lesson(id.clone(), kind, context).map(|lesson| {
            return lesson;
        })?,
    };

    Ok(lesson_with_module(
        id,
        kind,
        module,
        category,
        MixProfile::Comprehensive,
        estimated_minutes,
        target,
        reason_zh,
        reason_en,
    ))
}
```

If Rust rejects the fallback arm type, remove the fallback arm and use `_ => unreachable!("unsupported comprehensive module")`.

- [ ] **Step 5: Add mix target helpers**

Add helpers using existing content functions:

```rust
fn foundation_mix(context: &mut LessonBuildContext<'_>) -> PracticeTarget {
    let drill_id = foundation_drill_for_keys(&context.plan.focus_keys);
    let mut target = build_foundation_target_from_library(
        context.library,
        context.records,
        drill_id,
        6,
        &context.build_state.used_foundation_lines,
    );
    let warmup = repeat_pool(&context.library.warmup, 4);
    if !warmup.is_empty() {
        target.text = format!("{}\n{}", warmup.join("\n"), target.text);
    }
    target.source = format!("keyloop:module:foundation-mix:{drill_id}");
    target
}

fn everyday_english_mix(
    plan: &PracticePlan,
    library: &ContentLibrary,
    settings: EverydayEnglishSettings,
    profile: MixProfile,
) -> PracticeTarget {
    let mut chosen = plan
        .focus_words
        .iter()
        .map(|word| word.to_ascii_lowercase())
        .filter(|word| library.common_words.iter().any(|item| item == word))
        .collect::<Vec<_>>();
    fill_from(&mut chosen, &library.common_words, settings.word_count);
    let per_line = match profile {
        MixProfile::Comprehensive => 8,
        MixProfile::Standalone => 10,
        MixProfile::Review => 6,
    };
    PracticeTarget {
        mode: Mode::Words,
        text: chunk_words(&chosen, per_line).join("\n"),
        source: format!("keyloop:module:everyday-english:words-{}", settings.word_count),
    }
}

fn programming_basics_mix(context: &mut LessonBuildContext<'_>) -> PracticeTarget {
    let mut lines = Vec::new();
    lines.push(build_lesson_symbols(
        context.plan,
        context.library,
        context.code_config,
    ));
    lines.push(build_lesson_naming(context.plan, context.library));
    let terms = build_lesson_words(context.plan, context.library);
    lines.push(terms);
    PracticeTarget {
        mode: Mode::Symbols,
        text: lines.join("\n"),
        source: "keyloop:module:programming-basics-mix".to_string(),
    }
}

fn code_practice_mix(context: &mut LessonBuildContext<'_>) -> Result<PracticeTarget> {
    let mut target = build_code_lesson_target(
        context.records,
        context.repo,
        context.plan,
        context.library,
        context.code_config,
        &context.build_state.used_code_snippet_texts,
    )?;
    target.source = "keyloop:module:code-practice-mix".to_string();
    Ok(target)
}
```

- [ ] **Step 6: Add lesson constructor with module metadata**

Replace the existing `lesson(...)` helper body with a call to:

```rust
fn lesson_with_module(
    id: impl Into<String>,
    kind: LessonKind,
    module: TrainingModule,
    category: TrainingCategory,
    mix_profile: MixProfile,
    estimated_minutes: u16,
    target: PracticeTarget,
    reason_zh: impl Into<String>,
    reason_en: impl Into<String>,
) -> PracticeLesson {
    PracticeLesson {
        id: id.into(),
        kind,
        module,
        category,
        mix_profile,
        estimated_minutes,
        target,
        reason_zh: reason_zh.into(),
        reason_en: reason_en.into(),
    }
}
```

Keep the old `lesson(...)` helper as a compatibility wrapper:

```rust
fn lesson(
    id: impl Into<String>,
    kind: LessonKind,
    estimated_minutes: u16,
    target: PracticeTarget,
    reason_zh: impl Into<String>,
    reason_en: impl Into<String>,
) -> PracticeLesson {
    lesson_with_module(
        id,
        kind,
        default_module_for_kind(kind),
        default_category_for_kind(kind),
        MixProfile::Standalone,
        estimated_minutes,
        target,
        reason_zh,
        reason_en,
    )
}
```

Add `default_module_for_kind` and `default_category_for_kind` near `lesson_kind_slug`.

- [ ] **Step 7: Run content tests**

Run:

```bash
cargo test --locked content::tests
```

Expected: PASS.

## Task 4: Persist Global Code Scope and Everyday Settings

**Files:**
- Modify: `src/model.rs`
- Modify: `src/storage.rs`
- Modify: `src/main.rs`
- Modify: `src/trainer/mod.rs`

- [ ] **Step 1: Add preference round-trip test**

Update `preferences_round_trip_to_json_file` in `src/storage.rs`:

```rust
let preferences = UserPreferences {
    pinned_code_filters: vec![CodeFilterPreference {
        facet: CodePracticeFacet::Framework,
        value: "nestjs".to_string(),
    }],
    global_code_filters: vec![CodeFilterPreference {
        facet: CodePracticeFacet::Language,
        value: "solidity".to_string(),
    }],
    everyday_english: EverydayEnglishSettings {
        word_count: 25,
        sentence_length: EverydaySentenceLength::Short,
        include_phrases: true,
    },
};
```

- [ ] **Step 2: Extend preferences model**

Change `UserPreferences` in `src/model.rs`:

```rust
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct UserPreferences {
    #[serde(default)]
    pub pinned_code_filters: Vec<CodeFilterPreference>,
    #[serde(default)]
    pub global_code_filters: Vec<CodeFilterPreference>,
    #[serde(default)]
    pub everyday_english: EverydayEnglishSettings,
}
```

- [ ] **Step 3: Merge CLI code config with global preferences**

Add helper in `src/main.rs`:

```rust
fn code_config_from_preferences(preferences: &model::UserPreferences) -> CodePracticeConfig {
    let mut config = CodePracticeConfig {
        match_any: true,
        ..CodePracticeConfig::default()
    };
    for filter in &preferences.global_code_filters {
        match filter.facet {
            model::CodePracticeFacet::Language => config.languages.push(filter.value.clone()),
            model::CodePracticeFacet::Framework => config.frameworks.push(filter.value.clone()),
            model::CodePracticeFacet::Project => config.projects.push(filter.value.clone()),
        }
    }
    config
}
```

Inside `start`, load preferences before planning and merge with CLI overrides:

```rust
let preferences = storage::load_preferences()?;
let mut effective_code_config = code_config_from_preferences(&preferences);
if !code_config.is_empty() {
    effective_code_config = code_config;
}
```

Pass `&effective_code_config` to `build_daily_practice_plan`.

- [ ] **Step 4: Save selected code filters as global scope**

In `remember_selected_code_filters`, after pinning filters, set:

```rust
self.preferences.global_code_filters = self.selected_code_preferences();
```

This makes the next comprehensive practice use the same scope.

- [ ] **Step 5: Run storage and CLI tests**

Run:

```bash
cargo test --locked storage::tests cli::tests tests::plan_command_is_localized_and_uses_isolated_home
```

Expected: PASS.

## Task 5: Staged Weak-Point Feedback Within Comprehensive Runs

**Files:**
- Modify: `src/trainer/mod.rs`
- Modify: `src/content/mod.rs`
- Modify: `src/model.rs`

- [ ] **Step 1: Add unit test for completed records influencing next generated target**

Add a content test:

```rust
#[test]
fn weak_symbol_record_increases_programming_mix_focus() {
    let records = vec![SessionRecord {
        error_tokens: BTreeMap::from([("=>".to_string(), 3)]),
        token_stats: vec![TokenStat {
            token: "=>".to_string(),
            kind: TokenKind::Symbol,
            start_delay_ms: 100,
            duration_ms: 100,
            errors: 3,
        }],
        ..SessionRecord::default()
    }];
    let plan = crate::plan::build_plan(&records, crate::model::Language::Zh);
    let daily = build_daily_practice_plan(
        &records,
        None,
        &plan,
        &CodePracticeConfig::default(),
    )
    .expect("daily plan should build");
    let programming = daily
        .lessons
        .iter()
        .find(|lesson| lesson.module == TrainingModule::ProgrammingBasics)
        .expect("programming module exists");

    assert!(programming.target.text.contains("=>"));
}
```

- [ ] **Step 2: Ensure completed records are part of all future generation**

`App::all_records()` already chains `records` and `completed_records`. Keep using it wherever a standalone target is generated. For comprehensive staged regeneration, add:

```rust
fn refreshed_current_lesson_target(&self) -> Option<PracticeTarget> {
    let lesson = self.current_lesson()?;
    if !self.is_comprehensive_active() {
        return Some(lesson.target.clone());
    }
    let records = self.all_records();
    content::refresh_module_mix_target(
        lesson,
        &records,
        &self.selected_code_config(),
        &self.preferences.everyday_english,
    )
    .ok()
    .or_else(|| Some(lesson.target.clone()))
}
```

Then change `begin_current` to use `refreshed_current_lesson_target`.

- [ ] **Step 3: Add `refresh_module_mix_target`**

In `src/content/mod.rs`:

```rust
pub fn refresh_module_mix_target(
    lesson: &PracticeLesson,
    records: &[&SessionRecord],
    code_config: &CodePracticeConfig,
    everyday_settings: &EverydayEnglishSettings,
) -> Result<PracticeTarget> {
    let library = library::load()?;
    let owned_records = records.iter().copied().cloned().collect::<Vec<_>>();
    let plan = crate::plan::build_plan(&owned_records, crate::model::Language::Zh);
    let mut build_state = PlanBuildState::from_records(records);
    let mut context = LessonBuildContext {
        records,
        repo: None,
        plan: &plan,
        library: &library,
        code_config,
        build_state: &mut build_state,
    };
    match lesson.module {
        TrainingModule::FoundationInput => Ok(foundation_mix(&mut context)),
        TrainingModule::EverydayEnglish => Ok(everyday_english_mix(
            &plan,
            &library,
            *everyday_settings,
            lesson.mix_profile,
        )),
        TrainingModule::ProgrammingBasics => Ok(programming_basics_mix(&mut context)),
        TrainingModule::CodePractice => code_practice_mix(&mut context),
        _ => Ok(lesson.target.clone()),
    }
}
```

- [ ] **Step 4: Run staged feedback tests**

Run:

```bash
cargo test --locked content::tests::weak_symbol_record_increases_programming_mix_focus
```

Expected: PASS.

## Task 6: TUI Copy and Menu Shape

**Files:**
- Modify: `src/trainer/copy.rs`
- Modify: `src/trainer/mod.rs`

- [ ] **Step 1: Update lesson titles**

Change `lesson_title` mappings:

```rust
LessonKind::Foundation => "基础输入：综合键位",
LessonKind::CommonWords => "日常英语：常用词句",
LessonKind::Symbols => "编程基础：符号和命名",
LessonKind::CodeBlock => "代码实战：完整代码块",
```

and English equivalents:

```rust
LessonKind::Foundation => "Foundation input: mixed keys",
LessonKind::CommonWords => "Everyday English: words and sentences",
LessonKind::Symbols => "Programming basics: symbols and naming",
LessonKind::CodeBlock => "Code practice: complete code",
```

- [ ] **Step 2: Update menu labels**

Change copy keys:

```rust
"menu_foundation" => "基础输入",
"menu_foundation_hint" => "Home/top/bottom row、过渡和基础词专项",
"menu_code_specialist" => "代码实战",
"menu_code_specialist_hint" => "使用全局语言/框架范围练完整代码块",
```

- [ ] **Step 3: Run formatting and trainer compile tests**

Run:

```bash
cargo fmt --check
cargo test --locked trainer::copy
```

Expected: `cargo fmt --check` passes. The second command may report `running 0 tests`; that is acceptable if compilation succeeds.

## Task 7: End-to-End Verification

**Files:**
- No new files unless tests reveal a focused bug.

- [ ] **Step 1: Run full test suite**

Run:

```bash
cargo test --locked --all-targets
```

Expected: PASS.

- [ ] **Step 2: Run clippy**

Run:

```bash
cargo clippy --locked -- -D warnings
```

Expected: PASS.

- [ ] **Step 3: Run plan command in isolated home**

Run:

```bash
KEYLOOP_HOME="$(mktemp -d)" cargo run --locked -- plan
```

Expected stdout includes:

```text
下一轮 KeyLoop 计划
```

- [ ] **Step 4: Inspect generated plan shape with tests**

Run:

```bash
cargo test --locked content::tests::daily_plan_has_one_main_group_per_module -- --nocapture
```

Expected: PASS, proving the comprehensive plan contains one module group each for foundation, everyday English, programming basics, and code practice.

## Self-Review Notes

- V1 intentionally does not finish the V2 idle/WPM persistence redesign.
- V1 uses existing clean corpora only; no Monkeytype/keybr corpus import is included.
- Everyday sentence length metadata is modeled in preferences now, but true sentence corpora land in V4 when clean provenance is added.
- Staged generation is implemented by refreshing the next module target before it starts; this is enough for weak feedback without rewriting the entire TUI state machine.
