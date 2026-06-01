# KeyLoop Training Redesign V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make timing and persistence trustworthy: WPM uses active typing time, idle gaps do not poison slow-item stats, and completed groups are saved immediately instead of only after the TUI exits.

**Architecture:** Keep `SessionRecord` backward-compatible and add explicit timing/character fields with serde defaults. Centralize timing math in `src/metrics.rs` so report, trainer, and future key aggregates use one definition. Move save-on-complete into the TUI completion path and return saved metadata to `main` for summaries without double-writing.

**Tech Stack:** Rust 2024, serde/serde_json, chrono, crossterm/ratatui, current JSONL storage.

---

## File Structure

- Modify `src/model.rs`: add `TimingStats`, `CharStats`, `KeyAggregate`, `SessionCheckpoint`, and timing fields on `SessionRecord`.
- Modify `src/metrics.rs`: compute active time, idle time, first-key delay, last-key tail, char stats, and idle-adjusted token stats.
- Modify `src/trainer/mod.rs`: track manual pause time, save completed groups immediately, and expose save errors to the UI.
- Modify `src/main.rs`: stop appending already-saved records after `trainer::run`; only print the latest saved summary.
- Modify `src/storage.rs`: add append-safe helpers for key aggregates and current-session checkpoints.
- Modify `src/report.rs` / `src/trainer/stats.rs`: prefer active timing fields when present.
- Test files remain colocated in existing `#[cfg(test)]` modules and `tests/cli_commands.rs`.

## Task 1: Timing and Character Model Compatibility

**Files:**
- Modify: `src/model.rs`
- Modify: `src/metrics.rs`

- [ ] **Step 1: Write failing compatibility test**

Add to `src/model.rs` tests:

```rust
#[test]
fn session_record_defaults_missing_timing_fields() {
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

    assert_eq!(record.active_ms, 0);
    assert_eq!(record.idle_ms, 0);
    assert_eq!(record.manual_pause_ms, 0);
    assert_eq!(record.idle_pause_count, 0);
    assert_eq!(record.start_to_first_key_ms, 0);
    assert_eq!(record.last_key_to_end_ms, 0);
    assert_eq!(record.char_stats.correct, 0);
}
```

- [ ] **Step 2: Add model fields**

Add:

```rust
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct CharStats {
    pub correct: usize,
    pub incorrect: usize,
    pub extra: usize,
    pub missed: usize,
}
```

Add to `SessionRecord` and `Default`:

```rust
#[serde(default)]
pub active_ms: u64,
#[serde(default)]
pub idle_ms: u64,
#[serde(default)]
pub manual_pause_ms: u64,
#[serde(default)]
pub idle_pause_count: u32,
#[serde(default)]
pub start_to_first_key_ms: u64,
#[serde(default)]
pub last_key_to_end_ms: u64,
#[serde(default)]
pub char_stats: CharStats,
```

- [ ] **Step 3: Run compatibility tests**

Run:

```bash
cargo test --locked model::tests::session_record_defaults_missing_timing_fields
```

Expected: PASS.

## Task 2: Active-Time WPM and Idle Exclusion

**Files:**
- Modify: `src/metrics.rs`

- [ ] **Step 1: Write failing metric tests**

Add tests:

```rust
#[test]
fn wpm_excludes_start_delay_and_last_key_tail() {
    let target = PracticeTarget {
        mode: crate::model::Mode::Words,
        text: "abc".to_string(),
        source: "test".to_string(),
    };
    let events = vec![
        insert(5_000, 0, 'a', true),
        insert(5_500, 1, 'b', true),
        insert(6_000, 2, 'c', true),
    ];

    let record = build_session_record(target, Utc::now(), 20_000, "abc".to_string(), events);

    assert_eq!(record.start_to_first_key_ms, 5_000);
    assert_eq!(record.last_key_to_end_ms, 14_000);
    assert_eq!(record.active_ms, 1_000);
    assert!((record.wpm - 36.0).abs() < f64::EPSILON);
}

#[test]
fn idle_gap_excess_is_excluded_from_wpm_and_token_stats() {
    let target = PracticeTarget {
        mode: crate::model::Mode::Words,
        text: "ab cd".to_string(),
        source: "test".to_string(),
    };
    let events = vec![
        insert(100, 0, 'a', true),
        insert(200, 1, 'b', true),
        insert(20_300, 3, 'c', true),
        insert(20_400, 4, 'd', true),
    ];

    let record = build_session_record(target, Utc::now(), 20_500, "ab cd".to_string(), events);

    assert_eq!(record.idle_pause_count, 1);
    assert_eq!(record.idle_ms, 10_100);
    assert_eq!(record.active_ms, 10_200);
    let cd = record
        .token_stats
        .iter()
        .find(|stat| stat.token == "cd")
        .expect("cd token should be measured");
    assert_eq!(cd.start_delay_ms, 10_100);
}
```

- [ ] **Step 2: Implement timing normalization**

Add `IDLE_THRESHOLD_MS: u64 = 10_000`.

Compute timing from key events:

- first key delay: first event timestamp;
- last-key tail: `duration_ms - last_event_timestamp`;
- idle excess: for every event gap greater than 10 seconds, add `gap - 10_000`;
- active_ms: `duration_ms - start_to_first_key_ms - last_key_to_end_ms - idle_ms`;
- adjusted token event timestamps subtract first-key delay and idle excess before each event.

- [ ] **Step 3: Use active time for WPM**

Use `active_ms.max(1)` for WPM/raw WPM minutes instead of `duration_ms`.

- [ ] **Step 4: Run metric tests**

Run:

```bash
cargo test --locked metrics::tests
```

Expected: PASS.

## Task 3: Manual Pause Timing

**Files:**
- Modify: `src/metrics.rs`
- Modify: `src/trainer/mod.rs`

- [ ] **Step 1: Extend record builder input**

Change `build_session_record` signature to accept `manual_pause_ms: u64`. Existing tests pass `0`.

- [ ] **Step 2: Pass trainer pause total**

In `App::current_record`, pass `duration_ms(self.paused_total)` as manual pause milliseconds.

- [ ] **Step 3: Add trainer test**

Extend `active_elapsed_excludes_accumulated_and_current_pause_time` or add a focused test asserting a completed record stores `manual_pause_ms`.

Run:

```bash
cargo test --locked trainer::tests::active_elapsed_excludes_accumulated_and_current_pause_time
```

Expected: PASS.

## Task 4: Save Completed Groups Immediately

**Files:**
- Modify: `src/trainer/mod.rs`
- Modify: `src/main.rs`
- Modify: `src/storage.rs`

- [ ] **Step 1: Add trainer persistence test using temporary `KEYLOOP_HOME`**

Test that after `App::complete()` the session log exists and contains the completed record before `trainer::run` returns.

- [ ] **Step 2: Add saved result type**

Add:

```rust
pub struct RunResult {
    pub completed_records: Vec<SessionRecord>,
    pub last_saved_to: Option<PathBuf>,
}
```

Change `trainer::run` to return `Result<RunResult>`.

- [ ] **Step 3: Save in `complete` and partial quit**

Move `storage::append_session(&record)` into `App::complete` and `save_partial_and_quit`. Store the latest path in `App`.

- [ ] **Step 4: Stop double-writing in `main`**

Change `main::start` to use returned `last_saved_to` for `session_summary` and remove the append loop.

- [ ] **Step 5: Run persistence tests**

Run:

```bash
cargo test --locked storage::tests trainer::tests tests::report_today_reads_jsonl_from_keyloop_home
```

Expected: PASS and no duplicate writes.

## Task 5: Key Aggregate and Checkpoint Paths

**Files:**
- Modify: `src/model.rs`
- Modify: `src/storage.rs`

- [ ] **Step 1: Add model structs**

Add `KeyAggregate` and `SessionCheckpoint` with serde defaults matching the design.

- [ ] **Step 2: Add storage path helpers**

Add:

```rust
pub fn key_stats_path() -> Result<PathBuf>
pub fn current_session_path() -> Result<PathBuf>
```

- [ ] **Step 3: Add append-safe placeholder persistence**

Add small helpers that write aggregate/checkpoint JSON atomically enough for V2:

```rust
pub fn save_session_checkpoint(checkpoint: &SessionCheckpoint) -> Result<PathBuf>
pub fn clear_session_checkpoint() -> Result<()>
```

- [ ] **Step 4: Run storage tests**

Run:

```bash
cargo test --locked storage::tests
```

Expected: PASS.

## Task 6: Final Verification

Run:

```bash
cargo fmt --check
cargo test --locked --all-targets
cargo clippy --locked -- -D warnings
tmpdir=$(mktemp -d); KEYLOOP_HOME="$tmpdir" cargo run --locked -- plan; rm -rf "$tmpdir"
cargo install --path . --locked --debug --force
```

Expected: all checks pass, and the local `/Users/luwei/.cargo/bin/keyloop` binary is replaced with the verified build.

## Self-Review Notes

- V2 does not add a new statistics dashboard page; it makes stored timing data correct so V3 can display it.
- Idle exclusion is based on event timestamps already adjusted for manual pauses by the trainer.
- If the TUI cannot safely show save errors in a polished way in this stage, returning the error from `complete` path and keeping the app running is preferable to silently dropping data.
