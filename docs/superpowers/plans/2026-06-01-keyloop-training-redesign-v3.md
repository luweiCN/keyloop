# KeyLoop Training Redesign V3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign KeyLoop statistics so practice data is actionable by today, comprehensive run, module, key, token, and code practice type.

**Architecture:** Keep the current terminal UI and JSON/JSONL storage. Add focused aggregation helpers in `src/trainer/stats.rs`, route them through additional `StatsView` states in `src/trainer/mod.rs`, and update `src/report.rs` so CLI today reports match the new comprehensive-vs-standalone split. Use existing `SessionRecord`, `KeyAggregate`, and V1/V2 timing fields rather than introducing a database migration.

**Tech Stack:** Rust 2024, serde/serde_json, chrono, ratatui, current `SessionRecord` JSONL and `key_stats.json`.

---

## File Structure

- Modify `src/report.rs`: split today report totals into comprehensive and standalone practice while preserving legacy records.
- Modify `src/trainer/stats.rs`: add reusable aggregators and line renderers for today, comprehensive runs, module trends, key stats, token stats, and code stats.
- Modify `src/trainer/mod.rs`: expand `StatsView`, add key-stat sorting state, route keys/tabs/help/rendering to new stats pages.
- Modify `src/trainer/copy.rs`: add labels and help copy for new stats pages.
- Tests stay colocated in existing `#[cfg(test)]` modules.

## Task 1: Today Report Scope Split

**Files:**
- Modify: `src/report.rs`

- [ ] **Step 1: Write failing report test**

Add a test asserting that `today_report` separates comprehensive records (`daily_run_id` present) from standalone records (`daily_run_id` empty):

```rust
#[test]
fn today_report_separates_comprehensive_and_standalone_totals() {
    let mut comprehensive = today_record();
    comprehensive.daily_run_id = "20260601-1".to_string();
    comprehensive.duration_ms = 60_000;
    comprehensive.active_ms = 30_000;

    let mut standalone = today_record();
    standalone.daily_run_id = String::new();
    standalone.duration_ms = 120_000;
    standalone.active_ms = 60_000;

    let report = today_report(&[comprehensive, standalone], &empty_plan(), Language::Zh);

    assert!(report.contains("综合练习: 1 次 / active 30 秒"));
    assert!(report.contains("专项练习: 1 次 / active 1 分 0 秒"));
}
```

- [ ] **Step 2: Run red test**

Run:

```bash
cargo test --locked report::tests::today_report_separates_comprehensive_and_standalone_totals
```

Expected: FAIL because the split line does not exist.

- [ ] **Step 3: Implement scope aggregation**

Add helpers in `src/report.rs`:

```rust
fn is_comprehensive_record(record: &SessionRecord) -> bool {
    !record.daily_run_id.trim().is_empty()
}

fn scoped_record_counts(records: &[&SessionRecord]) -> ((usize, u64), (usize, u64)) {
    let mut comprehensive = (0usize, 0u64);
    let mut standalone = (0usize, 0u64);
    for record in records {
        let bucket = if is_comprehensive_record(record) {
            &mut comprehensive
        } else {
            &mut standalone
        };
        bucket.0 += 1;
        bucket.1 += effective_active_ms(record);
    }
    (comprehensive, standalone)
}
```

Render two lines in the `Overall` section after the backspace line.

- [ ] **Step 4: Run report tests**

Run:

```bash
cargo test --locked report::tests
```

Expected: PASS.

## Task 2: Stats View Model and Navigation

**Files:**
- Modify: `src/trainer/mod.rs`
- Modify: `src/trainer/copy.rs`

- [ ] **Step 1: Write failing navigation/render smoke test**

Extend `render_smoke_covers_primary_tui_phases` or add:

```rust
#[test]
fn stats_tabs_cover_v3_pages() {
    let mut app = renderable_app(Language::En);
    app.phase = Phase::Stats;

    for (key, expected) in [
        (KeyCode::Char('2'), "Today"),
        (KeyCode::Char('3'), "Full practice"),
        (KeyCode::Char('4'), "Modules"),
        (KeyCode::Char('5'), "Keys"),
        (KeyCode::Char('6'), "Tokens"),
        (KeyCode::Char('7'), "Code"),
    ] {
        handle_stats_key(&mut app, key);
        let screen = render_app_to_text(&app, 110, 34);
        assert!(screen.contains(expected), "missing {expected}\n{screen}");
    }
}
```

- [ ] **Step 2: Run red test**

Run:

```bash
cargo test --locked trainer::tests::stats_tabs_cover_v3_pages
```

Expected: FAIL because only overview/details exist.

- [ ] **Step 3: Expand `StatsView`**

Change `StatsView` to:

```rust
enum StatsView {
    Overview,
    Today,
    Comprehensive,
    Modules,
    Keys,
    Tokens,
    Code,
    Daily,
}
```

Update Tab cycling, number shortcuts, date navigation guards, tab labels, and help copy.

- [ ] **Step 4: Run navigation test**

Run:

```bash
cargo test --locked trainer::tests::stats_tabs_cover_v3_pages
```

Expected: PASS once placeholder renderers are wired.

## Task 3: Aggregation Pages

**Files:**
- Modify: `src/trainer/stats.rs`
- Modify: `src/trainer/mod.rs`

- [ ] **Step 1: Write failing aggregation tests**

Add focused tests in `src/trainer/mod.rs` or `src/trainer/stats.rs`:

```rust
#[test]
fn stats_today_lines_split_comprehensive_and_standalone() { /* build records and assert labels */ }

#[test]
fn module_stats_identifies_weakest_module_driver() { /* build two module records and assert driver */ }

#[test]
fn comprehensive_run_lines_group_by_daily_run_id() { /* build same run id records and assert count */ }
```

- [ ] **Step 2: Run red tests**

Run:

```bash
cargo test --locked stats_today_lines_split_comprehensive_and_standalone module_stats_identifies_weakest_module_driver comprehensive_run_lines_group_by_daily_run_id
```

Expected: FAIL because functions do not exist.

- [ ] **Step 3: Implement line renderers**

Add public-to-module functions:

```rust
pub(super) fn stats_today_lines(...)
pub(super) fn stats_comprehensive_lines(...)
pub(super) fn stats_module_lines(...)
pub(super) fn stats_token_lines(...)
pub(super) fn stats_code_lines(...)
```

Keep each renderer line-based and width-safe by truncating labels through existing `truncate`.

- [ ] **Step 4: Wire renderers**

Update `render_stats` to call the new line functions for each `StatsView`.

- [ ] **Step 5: Run aggregation and render tests**

Run:

```bash
cargo test --locked trainer::tests::stats_tabs_cover_v3_pages trainer::stats::tests
```

Expected: PASS.

## Task 4: Key Stats Page and Sort Modes

**Files:**
- Modify: `src/trainer/stats.rs`
- Modify: `src/trainer/mod.rs`

- [ ] **Step 1: Write failing key stats sort test**

Add test:

```rust
#[test]
fn key_stats_lines_can_sort_by_error_rate_and_show_timing_columns() {
    let aggregates = vec![/* two KeyAggregate values */];
    let lines = key_stats_lines(&aggregates, KeyStatsSort::ErrorRate, 8, Language::En);
    let rendered = plain_lines(lines);

    assert!(rendered.contains("fast"));
    assert!(rendered.contains("avg"));
    assert!(rendered.contains("slow"));
    assert!(rendered.contains("err"));
    assert!(rendered.contains("samples"));
}
```

- [ ] **Step 2: Run red test**

Run:

```bash
cargo test --locked key_stats_lines_can_sort_by_error_rate_and_show_timing_columns
```

Expected: FAIL because `KeyStatsSort` / key stats renderer do not exist.

- [ ] **Step 3: Implement key stats renderer**

Add `KeyStatsSort` with modes:

```rust
SlowestAverage,
Fastest,
SlowestSingle,
HighestErrorRate,
LowestConfidence,
```

Render columns for key, samples, avg, fastest, slowest, error rate, confidence.

- [ ] **Step 4: Wire sort cycling**

Add `key_stats_sort` field to `App`. In Keys view, `S` cycles sort mode. Help text names the current sort.

- [ ] **Step 5: Run key stats tests**

Run:

```bash
cargo test --locked key_stats_lines_can_sort_by_error_rate_and_show_timing_columns stats_tabs_cover_v3_pages
```

Expected: PASS.

## Task 5: Final Verification

Run:

```bash
cargo fmt --check
cargo test --locked --all-targets
cargo clippy --locked -- -D warnings
cargo run --locked -- plan
cargo install --path . --locked --debug --force
/Users/luwei/.cargo/bin/keyloop plan | sed -n '1,18p'
```

Expected: all checks pass and the local binary is replaced with the verified build.

## Self-Review Notes

- V3 does not import new corpora; that remains V4.
- V3 should not rewrite old session records.
- Key stats page uses `key_stats.json` aggregates from V2. Legacy sessions still contribute to error heatmap and token pages through `SessionRecord`.
- If terminal height is limited, pages must degrade by truncating lines rather than overflowing.
