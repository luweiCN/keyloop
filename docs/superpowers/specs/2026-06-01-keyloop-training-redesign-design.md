# KeyLoop Training Redesign Design

Status: draft for review
Date: 2026-06-01

## Purpose

KeyLoop has outgrown the current flat exercise model. The current product already records key events, token stats, daily plans, code filters, and practice history, but the training structure is too flat and the comprehensive practice generator reuses standalone drill generators too directly. This causes full practice to feel repetitive and heavier than intended: for example, one comprehensive run can contain two full `top-row` foundation groups and two full symbol groups.

This redesign turns KeyLoop into a layered typing trainer:

- clear first-level training modules;
- focused second-level drills under each module;
- comprehensive practice built from small mixed blocks, not from whole standalone drills;
- trustworthy WPM, idle, key, token, and module statistics;
- data saved early enough that a crash or early exit does not lose completed work;
- content provenance that keeps the MIT project license clean.

## Requirements

1. Training modules must be understandable from the menu.
2. Comprehensive practice must use independent comprehensive generators instead of directly reusing full standalone drill generators.
3. Comprehensive practice must mix coverage and weak-point emphasis. A weak area should increase proportion inside a mixed block, not duplicate a whole block.
4. Mistakes and slow items from completed groups must feed later practice, both within the same comprehensive run and in future sessions.
5. Full practice must avoid repeated full groups of the same type such as two complete `top-row` groups or two complete symbol groups.
6. Standalone focused practice must remain available for users who want high-volume practice of one area.
7. Code practice filters must be easier to reuse and navigate, with recent and pinned choices near the top.
8. WPM, raw WPM, accuracy, active time, idle time, and consistency must use explicit, testable definitions.
9. Long idle gaps must not pollute slow-key or slow-token statistics.
10. Completed groups must be saved immediately after completion, not only when the TUI exits.
11. Key-level aggregate data must be updated during practice and persisted with debounce, not by synchronously writing on every keystroke.
12. Statistics must distinguish comprehensive practice, standalone practice, code focus, and module-level trends.
13. Content must not copy GPL/AGPL corpora or code from Monkeytype or keybr.com while KeyLoop remains MIT.

## Current-State Findings

Current code and docs show the following important constraints:

- `docs/ROADMAP.md` describes an 11-entry flat menu and a comprehensive plan made from lesson kinds such as warmup, chunks, words, symbols, naming, and code.
- `src/content/mod.rs` currently builds daily plans through `adaptive_lesson_sequence` and lesson-specific generators.
- `Foundation` currently resolves to a single drill such as `top-row` through `foundation_drill_for_keys`, then uses `build_foundation_target_from_library`.
- `Symbols` currently uses `build_lesson_symbols`, which can generate a long standalone-style symbol target.
- `src/main.rs` saves completed records after `trainer::run` returns, so completed groups are not appended to `sessions.jsonl` until the TUI exits.
- `src/metrics.rs` computes WPM as `correct_chars / 5 / minutes` and raw WPM as `insert_count / 5 / minutes`; this uses the common `5 chars = 1 word` basis, but the exact inclusion rules need to be aligned and documented.
- `src/trainer/mod.rs` already supports manual pause and excludes manual pause time from elapsed time, but it does not implement automatic idle exclusion.
- `docs/content/CATALOG.md` already states a license policy that GPL projects should only be used for structure, not copied materials.

## Reference Research

Monkeytype and keybr.com should guide design, not be copied.

Monkeytype takeaways:

- WPM uses a 5-character word basis.
- Raw WPM counts broader effective input throughput.
- Accuracy is keypress-based and does not erase errors just because the user backspaced.
- It records timing, AFK state, char stats, and key timing aggregates, but its per-key result page is not the exact feature KeyLoop needs.
- It has session-level missed-word, slow-word, and weak-character practice mechanisms.
- Its repository and corpus are GPL-3.0, so KeyLoop should not copy code or word lists while remaining MIT.

keybr.com takeaways:

- It stores speed internally as CPM and displays WPM by dividing by 5.
- It has per-key statistics such as hit count, miss count, time-to-type, filtered time-to-type, best time-to-type, confidence, and history.
- It uses confidence to focus weak keys and unlock future keys.
- It filters impossible/idle-like intervals from key statistics.
- Its repository and corpus should be treated conservatively as AGPL-3.0, so KeyLoop should not copy code, word lists, generated models, or book corpora while remaining MIT.

## Information Architecture

The top-level menu becomes:

```text
1. Comprehensive Practice
2. Foundation Input
3. Everyday English
4. Programming Basics
5. Code Practice
6. Statistics
```

Chinese labels:

```text
1. 综合练习
2. 基础输入
3. 日常英语
4. 编程基础
5. 代码实战
6. 数据统计
```

### Foundation Input

Purpose: strengthen keyboard and basic English input mechanics.

Second-level entries:

- Home row
- Top row
- Bottom row
- Finger transitions
- Punctuation edges
- Letter combinations
- Basic words
- Foundation mix

`Foundation mix` combines the entries above. If top row is weak, top row lines get more weight, but home row, bottom row, and transition material still appear.

### Everyday English

Purpose: fill the current gap in ordinary English words and natural sentence input.

Second-level entries:

- High-frequency words Tier 1
- High-frequency words Tier 2
- High-frequency words Tier 3
- Common phrases
- Everyday short sentences
- Workplace communication sentences
- Everyday English mix

The names stay as tiers until KeyLoop has a clean licensed word-frequency source. The final boundaries should be based on coverage and difficulty, not arbitrary 100/500/1000 labels.

Everyday word practice must support per-session amount controls. The user should be able to enter a high-frequency word tier and change how many words appear in each group without leaving the practice flow. The setting should have sane presets rather than free-form complexity, for example:

```text
Word count per group: 25 / 50 / 100
```

The exact presets can be tuned after real use, but the product requirement is that everyday word drills are not locked to one fixed group size.

Everyday sentence practice must support length categories because sentence practice has a different fatigue profile from word practice:

```text
Sentence length: short / medium / long / mixed
```

The corpus must store enough metadata to support this split. A practical first version can classify by word count and character count while preserving source text and license metadata.

`Everyday English mix` should use the same underlying generator as top-level comprehensive practice. It combines tiered words, common phrases, and sentence material according to the user's amount and sentence-length settings plus recent weak points.

### Programming Basics

Purpose: train developer input elements that are not yet full code blocks.

Second-level entries:

- Numbers and symbols
- Operators, brackets, and quotes
- Keywords and common APIs
- Naming styles: `camelCase`, `PascalCase`, `CONSTANT_CASE`, `snake_case`
- Technical terms: Web3, frontend, backend, DevOps
- Programming basics mix

### Code Practice

Purpose: train realistic code units.

Flow:

1. Choose language, framework, and project filters.
2. Choose target shape:
   - snippet/block;
   - function block;
   - file fragment;
   - random mix.

Code filter UX must:

- normalize duplicates across language, framework, and project facets;
- keep recent and pinned filters near the top;
- restore previous selections by default;
- support presets such as Web3 frontend, Solidity, React/Vue, Rust;
- avoid forcing the user to scroll through a long list every session.

Language, framework, and project scope must become a global training preference, not only an option inside Code Practice. Comprehensive practice and Programming Basics may also draw code terms, technical vocabulary, symbols, and code blocks; if the global scope includes only Solidity and Web3 frontend, comprehensive practice should not unexpectedly select unrelated Rust, NestJS, or CSS-heavy content.

Global scope behavior:

- Code Practice can still override scope for the current session.
- The top-level preference stores recent and pinned scopes.
- Comprehensive Practice reads the global scope by default.
- Programming Basics uses the global scope for technical terms, language-specific symbols, and naming/API vocabulary.
- Everyday English is unaffected by code language scope unless a future mode explicitly mixes workplace technical English.

### Statistics

Purpose: make training diagnosis trustworthy and actionable.

Second-level views:

- Overview
- Today
- Comprehensive runs
- Module trends
- Key statistics
- Token and word statistics
- Code practice statistics

## Comprehensive Practice Design

Comprehensive practice must be generated by a dedicated planner:

```text
ComprehensivePlanBuilder
  foundation_mix
  everyday_english_mix
  programming_basics_mix
  code_practice_mix
  weak_point_feedback
  optional_review_micro_block
```

It must not directly insert full standalone `Foundation`, `Symbols`, or code focus groups.

The planner should call the same module-level mix generators that are exposed as second-level module entries. This keeps standalone module mix practice and top-level comprehensive practice consistent:

```text
Foundation Input -> Foundation mix -> foundation_mix(...)
Everyday English -> Everyday English mix -> everyday_english_mix(...)
Programming Basics -> Programming basics mix -> programming_basics_mix(...)
Code Practice -> Random mix -> code_practice_mix(...)
Comprehensive Practice -> calls the same mix generators in sequence
```

The difference is orchestration, not a separate incompatible content model. A user who practices `Everyday English mix` standalone should see the same content logic that comprehensive practice uses for its everyday English step.

Comprehensive practice should be staged rather than fully materialized at the start. The run can decide the module order and approximate budgets up front, but each group should be generated just before it starts, using:

- global training preferences;
- historical weak points;
- the latest completed group result from the same run;
- the module's own mix settings.

This lets a mistake in an earlier group affect later content without rebuilding the whole session UI or creating duplicate full drills.

### Generated Shape

A normal comprehensive run should contain:

1. Foundation input mixed block.
2. Everyday English mixed block.
3. Programming basics mixed block.
4. Code practice block.
5. Optional short review micro-block.

Each numbered item is a real group in the TUI: the user finishes one group, sees a result page, then moves to the next group. The run should not be so small that it feels like a demo; it should still deliver a meaningful practice session across the main modules.

Group size is controlled by module settings and adaptive difficulty. Comprehensive practice should usually call the normal module mix generator with a "comprehensive" profile rather than a tiny sample profile. The optional review micro-block is the only intentionally tiny block.

The duration target is a guide, not a hard daily cap, but the generated content must be internally consistent with the displayed estimate. A block estimated at 3 minutes must not contain 1,300+ characters of dense symbols.

### Module Mix Settings

Each module-level mix generator accepts settings that can be used both in standalone module mix practice and in top-level comprehensive practice.

Everyday English settings:

```text
word_tier: tier1 / tier2 / tier3 / mixed
word_count: 25 / 50 / 100
sentence_length: short / medium / long / mixed
include_phrases: true / false
```

Foundation settings:

```text
row_mix: home / top / bottom / mixed
transition_focus: none / fingers / punctuation / mixed
line_count_profile: short / normal / extended
```

Programming Basics settings:

```text
symbol_density: low / medium / high
naming_style: camel / pascal / constant / snake / mixed
technical_scope: global / web3 / frontend / backend / mixed
line_count_profile: short / normal / extended
```

Code Practice settings:

```text
scope: global / temporary override
shape: snippet / function / file_fragment / mixed
difficulty: adaptive
```

Comprehensive practice uses the user's global settings and adaptive history to select these options. Standalone module mix screens let the user change the relevant settings directly.

### Weighting Rules

Each module has a coverage baseline and weak-point weights.

Foundation example:

```text
home row baseline: 1
top row baseline: 1
bottom row baseline: 1
finger transitions baseline: 1
punctuation edges baseline: 1

top row weak: +2
punctuation weak: +1
```

Generated result: top row appears more often, but not exclusively.

Programming basics example:

```text
numbers baseline: 1
symbols baseline: 1
naming baseline: 1
technical terms baseline: 1

symbols weak: +2
CONSTANT_CASE weak: +1
```

Generated result: symbols appear more often inside the same mixed programming basics block. It does not create a second full symbol group.

### Repetition Rules

- A module can contribute at most one main block to a comprehensive run.
- A drill subtype can appear multiple times inside a mixed block by weight, but must not occupy the whole block unless the user explicitly chose standalone practice.
- The optional review micro-block may repeat the weakest area, but it is limited to 2-3 lines and must be labeled as a review.
- If all module metrics are stable, comprehensive practice can omit lower-value material and focus on maintenance.
- Comprehensive practice should preserve enough total practice volume to be useful. Avoid solving repetition by shrinking the run into a token sample; solve it by mixing better inside each module group.

### Adaptive Difficulty

Each module receives a readiness score from recent history:

```text
readiness = weighted_accuracy
          + speed_confidence
          - error_rate_penalty
          - backspace_penalty
          - low_sample_uncertainty
```

The exact formula should be implemented in tests and tuned with real records. The model should avoid treating a fast but inaccurate key as mastered.

Difficulty actions:

- low readiness: shorter content, more foundation, more repetition;
- medium readiness: mixed module coverage with weak-point emphasis;
- high readiness: reduce frequency or move to maintenance;
- very high readiness over multiple sessions: skip that subtype in comprehensive practice unless it becomes weak again.

### Weak-Point Feedback Loop

After every completed group, KeyLoop should derive a small `GroupFeedback` summary:

```text
slow_keys
error_keys
slow_tokens
error_tokens
missed_symbols
backspace_clusters
module_score
category_score
```

This feedback updates two stores:

- `RunWeakPointState`: in-memory signals used by the remaining groups in the current comprehensive run.
- `HistoricalWeakPointPool`: persisted or derived signals used by future sessions and statistics.

The feedback loop should affect later practice by weight, not by blunt repetition:

- if `top row` letters are weak, the next foundation or word material includes more words and letter patterns using those keys;
- if symbols such as `{`, `}`, `;`, or `=>` are weak, programming basics and code practice include more natural examples containing those symbols;
- if a word, phrase, or code token is repeatedly wrong, it can enter a short review pool;
- if a key or token is only slow because of an idle gap, it must not enter the weak pool.

The optional review micro-block at the end of comprehensive practice may use the strongest weak signals from the run. It should be short and labeled as review so the user understands why those items reappear.

## Metrics Design

### Time Model

Store:

- `started_at`;
- `ended_at`;
- `active_ms`;
- `idle_ms`;
- `manual_pause_ms`;
- `idle_pause_count`;
- `start_to_first_key_ms`;
- `last_key_to_end_ms`.

Typing starts on the first accepted input. Time before the first accepted input must not lower WPM.

### Idle Model

Default idle threshold:

```text
idle_threshold_ms = 10_000
```

If the gap between accepted key events exceeds the threshold:

- the excess gap is counted as idle;
- active time excludes it;
- key interval aggregates exclude it;
- token start delay and token duration exclude it;
- the UI shows that idle time was not counted.

Manual pause remains explicit and is tracked separately.

### WPM

Internal speed unit:

```text
CPM = characters_per_minute
WPM = CPM / 5
```

Displayed metrics:

- WPM: correct effective input per active minute, divided by 5.
- Raw WPM: all valid insert throughput per active minute, divided by 5.
- Accuracy: keypress accuracy, so corrected mistakes still count as mistakes.

Implementation must document exact character inclusion rules:

- correct normal inserts;
- spaces and newlines;
- code indentation;
- automatic indentation;
- backspaced inserts;
- extra characters;
- missed characters.

### Character Stats

Each session stores:

```text
char_stats:
  correct
  incorrect
  extra
  missed
```

### Key Stats

Key-level aggregate fields:

```text
key
sample_count
hit_count
miss_count
avg_ms
fastest_ms
slowest_ms
filtered_avg_ms
error_rate
confidence
last_seen_at
```

`confidence` uses a key-specific target interval:

```text
confidence = target_ms / filtered_avg_ms
```

Confidence above `1.0` means the key is meeting the current target.

### Token Stats

Continue storing token stats, but make idle exclusion explicit. Token stats support:

- slow words;
- error words;
- slow symbols;
- error symbols;
- code terms.

## Persistence Design

Current behavior saves completed records only after the TUI exits. The new design saves at three levels.

### 1. Live Aggregate Persistence

During practice:

- key aggregates update in memory on every accepted key event;
- disk writes are debounced every 1-3 seconds;
- writes are small aggregate snapshots or an append-only aggregate journal;
- no synchronous disk write happens on every keystroke.

Suggested path:

```text
~/.keyloop/key_stats.json
```

or:

```text
~/.keyloop/key_stats.jsonl
```

The final format should favor easy recovery and append safety.

### 2. Completed Group Persistence

On each completed group:

- append `SessionRecord` immediately to `sessions.jsonl`;
- update daily run completion state;
- keep in-memory UI state consistent with the saved record;
- show save errors in the TUI instead of silently losing the record.

### 3. Draft Checkpoint Persistence

During an in-progress group:

- store enough state to recover or diagnose partial work after a crash;
- include current target id, target text hash, input length, active time, idle time, and aggregate key stats;
- do not require full raw event recovery in V1.

Suggested path:

```text
~/.keyloop/current_session.json
```

On clean completion or explicit discard, remove the checkpoint.

## Content and License Policy

KeyLoop remains MIT unless the project owner explicitly changes the license.

Rules:

- Do not copy Monkeytype code or corpora into KeyLoop while KeyLoop remains MIT.
- Do not copy keybr.com code, word lists, generated models, or book corpora into KeyLoop while KeyLoop remains MIT.
- Do not use "merge, reshuffle, delete some items, add some items" as a way to relicense GPL/AGPL content.
- It is allowed to study structure, fields, scoring ideas, and training strategy.
- It is allowed to create KeyLoop-owned corpora from clean sources.

Allowed content sources:

- hand-authored KeyLoop content;
- user-local imports;
- user-local code repository scanning;
- public-domain text;
- permissively licensed word-frequency data;
- permissively licensed programming reference material where license and provenance are recorded.

Every generated or imported corpus file must have source metadata:

```text
source_name
source_url
license
retrieved_at
generation_script
included_fields
notes
```

Existing `content/source_catalog.json` can be extended, or a dedicated `content/SOURCES.md` can be added.

## Data Model Impact

Expected new or changed structures:

```text
TrainingModule
TrainingCategory
TrainingDrill
ComprehensiveBlock
ModuleScore
GroupFeedback
RunWeakPointState
HistoricalWeakPointPool
KeyAggregate
CharStats
TimingStats
SessionCheckpoint
CodeFilterPreset
RecentCodeFilter
GlobalTrainingPreferences
EverydayEnglishSettings
ModuleMixSettings
```

Potential `GlobalTrainingPreferences` fields:

```text
language_filters
framework_filters
project_filters
code_scope_presets
everyday_word_count
everyday_sentence_length
last_module_mix_settings
```

Existing `SessionRecord` should remain backward-compatible through serde defaults. New fields should default cleanly for legacy records.

Potential `SessionRecord` additions:

```text
module
category
drill_id
active_ms
idle_ms
manual_pause_ms
idle_pause_count
start_to_first_key_ms
last_key_to_end_ms
char_stats
consistency
```

## Implementation Plan

### V1: Training Structure and Comprehensive Generator

Goals:

- replace the flat menu with six top-level modules;
- add second-level menus;
- build a dedicated comprehensive generator;
- feed weak signals from completed groups into later groups;
- stop repeated full `Foundation` and `Symbols` groups;
- keep standalone focused practice available.

Main work:

1. Introduce module/category/drill model types.
2. Map existing content files into the new model.
3. Split standalone generators from comprehensive generators.
4. Implement reusable module mix generators: `foundation_mix`, `everyday_english_mix`, `programming_basics_mix`, `code_practice_mix`.
5. Make standalone module mix entries and top-level comprehensive practice call the same module mix generators.
6. Add everyday word-count and sentence-length controls.
7. Add global training scope preferences for language/framework/project filters.
8. Add `GroupFeedback` and `RunWeakPointState` so completed groups influence later groups in the same comprehensive run.
9. Add tests proving comprehensive practice mixes weak areas without duplicating full groups.
10. Update TUI menu copy and navigation.

Acceptance checks:

- a generated comprehensive plan has at most one main block per module;
- top-row weakness increases top-row material inside foundation mix but still includes other foundation material;
- symbol weakness increases symbol content inside programming basics mix but does not create a second full symbol group;
- comprehensive practice has meaningful volume because it runs module mix groups sequentially rather than shrinking every module to a tiny sample;
- standalone module mix and top-level comprehensive use the same underlying mix generator behavior;
- errors and slow items from an earlier comprehensive group can increase relevant material in a later group without creating a duplicate full drill;
- everyday word drills can vary word count per group;
- everyday sentence drills can use short, medium, long, or mixed sentence categories;
- global language/framework/project scope affects comprehensive and code practice content;
- standalone top-row and standalone symbol practice still work;
- existing session records still load.

### V2: Metrics, Idle, and Persistence

Goals:

- make WPM and raw WPM explicit and comparable;
- exclude idle gaps from active timing and slow-item stats;
- save each completed group immediately;
- persist key aggregates safely.

Main work:

1. Add `TimingStats`, `CharStats`, and key aggregate structures.
2. Refactor metric calculation around active time.
3. Implement automatic idle detection.
4. Add immediate save-on-group-complete.
5. Add debounced key aggregate persistence.
6. Add recovery-safe checkpoint file.

Acceptance checks:

- first-key delay does not lower WPM;
- a gap over 10 seconds increments idle time and does not create a slow key/token;
- completed groups appear in `sessions.jsonl` before TUI exit;
- key aggregate writes do not happen synchronously per keypress;
- legacy reports still work.

### V3: Statistics Redesign

Goals:

- make stats actionable by module, key, token, and practice type.

Main work:

1. Add statistics views: overview, today, comprehensive runs, module trends, key stats, token stats, code stats.
2. Separate comprehensive practice from standalone practice.
3. Add key sorting modes: slowest average, fastest, slowest single interval, highest error rate, lowest confidence.
4. Add recent trend summaries.
5. Show which weak keys, tokens, words, or symbols were fed into later practice.

Acceptance checks:

- today's report shows comprehensive and standalone totals separately;
- key stats can show fastest, average, slowest, error rate, and sample count;
- module trends show which module drives the next comprehensive plan;
- statistics can explain why a weak item reappeared in review or later practice;
- reports remain readable in terminal widths already supported by the TUI.

### V4: Clean Corpus Expansion

Goals:

- add everyday English and workplace English without GPL/AGPL contamination.

Main work:

1. Define corpus schema for high-frequency words, phrases, daily sentences, and workplace sentences.
2. Add source metadata for every corpus.
3. Add generation scripts for permissively licensed or public-domain sources.
4. Add import path for user-local corpora.
5. Integrate everyday English into standalone and comprehensive practice.

Acceptance checks:

- every new corpus entry has source metadata;
- no Monkeytype/keybr corpus file is copied;
- everyday English module can generate standalone and comprehensive material;
- source report lists corpus provenance.

### V5: Adaptive Training Maturity

Goals:

- make comprehensive practice progressively smarter.

Main work:

1. Add confidence-based module and key readiness.
2. Add weak-item review pool.
3. Add stable-item frequency reduction.
4. Add simple stage progression for code practice.
5. Add tests around stable vs weak module behavior.

Acceptance checks:

- stable keys/categories reduce frequency over time;
- weak keys/categories increase weight without duplicating full standalone groups;
- review micro-blocks are short and clearly labeled;
- plan reasons explain why each module appears.

## Migration Strategy

- Keep existing content files usable during V1.
- Add new model fields with serde defaults.
- Keep old `sessions.jsonl` valid.
- Add new storage files without rewriting old records.
- Provide report logic that handles mixed old and new records.
- Update docs after each version lands.

## Open Review Decisions

These are the decisions the user should confirm before implementation:

1. Top-level menu labels:
   - `综合练习 / 基础输入 / 日常英语 / 编程基础 / 代码实战 / 数据统计`
2. Code practice naming:
   - use `代码实战` for full code blocks and `编程基础` for symbols, naming, keywords, and technical terms.
3. Everyday English tiers:
   - use Tier 1/2/3 until clean word-frequency source boundaries are selected.
4. Everyday English amount controls:
   - word drills support selectable group sizes, initially `25 / 50 / 100` words.
   - sentence drills support `short / medium / long / mixed` length categories.
5. Global training scope:
   - language, framework, and project filters are global training preferences.
   - Code Practice may override them for the current session, but Comprehensive Practice reads the global scope by default.
6. Comprehensive practice volume:
   - top-level Comprehensive Practice calls each module's reusable mix generator as a real sequential group.
   - it should feel like a meaningful session, not a tiny sample, while still avoiding duplicated full standalone drills.
7. Weak-point feedback:
   - errors and slow items from completed groups should affect later groups in the same comprehensive run.
   - persisted weak signals should also affect future standalone mix and comprehensive sessions.
8. Idle threshold:
   - default to 10 seconds.
9. License policy:
   - keep KeyLoop MIT and do not copy GPL/AGPL corpora.
10. Implementation order:
   - V1 training structure first, then V2 metrics and persistence.
