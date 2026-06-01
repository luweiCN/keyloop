use crate::model::{
    CompletionState, DailyPracticePlan, KeyAction, KeyAggregate, KeyEventRecord, SessionCheckpoint,
    SessionRecord, UserPreferences,
};
use anyhow::{Context, Result};
use chrono::{DateTime, Local, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};

pub fn data_dir() -> Result<PathBuf> {
    if let Ok(path) = std::env::var("KEYLOOP_HOME") {
        return Ok(PathBuf::from(path));
    }

    let home = dirs::home_dir().context("Could not find home directory")?;
    Ok(home.join(".keyloop"))
}

pub fn session_log_path() -> Result<PathBuf> {
    Ok(data_dir()?.join("sessions.jsonl"))
}

pub fn preferences_path() -> Result<PathBuf> {
    Ok(data_dir()?.join("preferences.json"))
}

pub fn daily_runs_path() -> Result<PathBuf> {
    Ok(data_dir()?.join("daily_runs.json"))
}

pub fn key_stats_path() -> Result<PathBuf> {
    Ok(data_dir()?.join("key_stats.json"))
}

pub fn current_session_path() -> Result<PathBuf> {
    Ok(data_dir()?.join("current_session.json"))
}

pub fn append_session(record: &SessionRecord) -> Result<PathBuf> {
    let dir = data_dir()?;
    fs::create_dir_all(&dir)
        .with_context(|| format!("Failed to create data dir {}", dir.display()))?;

    let path = session_log_path()?;
    append_session_to_path(record, &path)
}

pub fn append_session_to_path(record: &SessionRecord, path: &Path) -> Result<PathBuf> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("Failed to create data dir {}", parent.display()))?;
    }
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .with_context(|| format!("Failed to open {}", path.display()))?;

    let line = serde_json::to_string(record)?;
    writeln!(file, "{line}")?;
    Ok(path.to_path_buf())
}

pub fn load_sessions() -> Result<Vec<SessionRecord>> {
    let path = session_log_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let file = OpenOptions::new()
        .read(true)
        .open(&path)
        .with_context(|| format!("Failed to read {}", path.display()))?;

    let mut records = Vec::new();
    for line in BufReader::new(file).lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }

        match serde_json::from_str::<SessionRecord>(&line) {
            Ok(record) => records.push(record),
            Err(error) => eprintln!("Skipped invalid session record: {error}"),
        }
    }

    Ok(records)
}

pub fn load_key_aggregates() -> Result<Vec<KeyAggregate>> {
    load_key_aggregates_from_path(&key_stats_path()?)
}

pub fn save_key_aggregates(aggregates: &[KeyAggregate]) -> Result<PathBuf> {
    let path = key_stats_path()?;
    save_key_aggregates_to_path(aggregates, &path)?;
    Ok(path)
}

fn load_key_aggregates_from_path(path: &Path) -> Result<Vec<KeyAggregate>> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data =
        fs::read_to_string(path).with_context(|| format!("Failed to read {}", path.display()))?;
    serde_json::from_str(&data).with_context(|| format!("Failed to parse {}", path.display()))
}

fn save_key_aggregates_to_path(aggregates: &[KeyAggregate], path: &Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("Failed to create data dir {}", parent.display()))?;
    }
    let data = serde_json::to_string_pretty(aggregates)?;
    fs::write(path, data).with_context(|| format!("Failed to write {}", path.display()))
}

pub fn observe_key_event(
    aggregates: &mut Vec<KeyAggregate>,
    event: &KeyEventRecord,
    interval_ms: u64,
) {
    if matches!(event.action, KeyAction::AutoIndent) {
        return;
    }

    let key = key_label(event);
    let aggregate = match aggregates.iter_mut().find(|aggregate| aggregate.key == key) {
        Some(aggregate) => aggregate,
        None => {
            aggregates.push(KeyAggregate {
                key: key.clone(),
                ..KeyAggregate::default()
            });
            aggregates.last_mut().expect("just pushed aggregate")
        }
    };

    let previous_samples = aggregate.sample_count;
    aggregate.sample_count += 1;
    if event.correct && matches!(event.action, KeyAction::Insert) {
        aggregate.hit_count += 1;
    } else {
        aggregate.miss_count += 1;
    }

    let filtered_interval = interval_ms.min(10_000);
    aggregate.avg_ms = rolling_average(aggregate.avg_ms, previous_samples, filtered_interval);
    aggregate.filtered_avg_ms = rolling_average(
        aggregate.filtered_avg_ms,
        previous_samples,
        filtered_interval,
    );
    if filtered_interval > 0 {
        aggregate.fastest_ms = if aggregate.fastest_ms == 0 {
            filtered_interval
        } else {
            aggregate.fastest_ms.min(filtered_interval)
        };
        aggregate.slowest_ms = aggregate.slowest_ms.max(filtered_interval);
    }
    aggregate.error_rate = aggregate.miss_count as f64 / aggregate.sample_count as f64 * 100.0;
    aggregate.confidence = if aggregate.filtered_avg_ms > 0.0 {
        220.0 / aggregate.filtered_avg_ms
    } else {
        0.0
    };
    aggregate.last_seen_at = Some(Utc::now());
}

fn key_label(event: &KeyEventRecord) -> String {
    match event.action {
        KeyAction::Insert => event
            .expected
            .or(event.input)
            .map(char_label)
            .unwrap_or_else(|| "extra".to_string()),
        KeyAction::Backspace => "backspace".to_string(),
        KeyAction::AutoIndent => "auto_indent".to_string(),
    }
}

fn char_label(ch: char) -> String {
    match ch {
        '\n' => "enter".to_string(),
        '\t' => "tab".to_string(),
        ' ' => "space".to_string(),
        _ => ch.to_string(),
    }
}

fn rolling_average(current: f64, previous_samples: u64, new_value: u64) -> f64 {
    if previous_samples == 0 {
        return new_value as f64;
    }
    (current * previous_samples as f64 + new_value as f64) / (previous_samples + 1) as f64
}

pub fn load_preferences() -> Result<UserPreferences> {
    load_preferences_from_path(&preferences_path()?)
}

pub fn save_preferences(preferences: &UserPreferences) -> Result<PathBuf> {
    let dir = data_dir()?;
    fs::create_dir_all(&dir)
        .with_context(|| format!("Failed to create data dir {}", dir.display()))?;
    let path = preferences_path()?;
    save_preferences_to_path(preferences, &path)?;
    Ok(path)
}

pub fn save_session_checkpoint(checkpoint: &SessionCheckpoint) -> Result<PathBuf> {
    let path = current_session_path()?;
    save_session_checkpoint_to_path(checkpoint, &path)?;
    Ok(path)
}

pub fn clear_session_checkpoint() -> Result<()> {
    clear_session_checkpoint_at_path(&current_session_path()?)
}

fn save_session_checkpoint_to_path(checkpoint: &SessionCheckpoint, path: &Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("Failed to create data dir {}", parent.display()))?;
    }
    let data = serde_json::to_string_pretty(checkpoint)?;
    fs::write(path, data).with_context(|| format!("Failed to write {}", path.display()))
}

fn clear_session_checkpoint_at_path(path: &Path) -> Result<()> {
    if path.exists() {
        fs::remove_file(path).with_context(|| format!("Failed to remove {}", path.display()))?;
    }
    Ok(())
}

pub fn load_or_create_daily_practice_plan(
    fresh_plan: DailyPracticePlan,
    records: &[SessionRecord],
) -> Result<DailyPracticePlan> {
    let path = daily_runs_path()?;
    let today = Local::now().date_naive();
    load_or_create_daily_practice_plan_from_path(&path, today, fresh_plan, records)
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct DailyRunStore {
    #[serde(default)]
    runs: Vec<StoredDailyRun>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredDailyRun {
    date: NaiveDate,
    created_at: DateTime<Utc>,
    plan: DailyPracticePlan,
}

fn load_or_create_daily_practice_plan_from_path(
    path: &Path,
    today: NaiveDate,
    fresh_plan: DailyPracticePlan,
    records: &[SessionRecord],
) -> Result<DailyPracticePlan> {
    let mut store = load_daily_run_store(path)?;
    let completed_ms = completed_ms_for_date(records, today);

    if let Some(entry) = store
        .runs
        .iter()
        .filter(|entry| entry.date == today)
        .max_by_key(|entry| entry.plan.run_number)
        && !daily_run_complete(&entry.plan, records)
    {
        let mut plan = entry.plan.clone();
        plan.completed_ms = completed_ms;
        return Ok(plan);
    }

    let run_number = store
        .runs
        .iter()
        .filter(|entry| entry.date == today)
        .map(|entry| entry.plan.run_number)
        .max()
        .unwrap_or(0)
        + 1;
    let mut plan = fresh_plan;
    plan.completed_ms = completed_ms;
    assign_daily_run_metadata(&mut plan, today, run_number);
    store.runs.push(StoredDailyRun {
        date: today,
        created_at: Utc::now(),
        plan: plan.clone(),
    });
    save_daily_run_store(path, &store)?;
    Ok(plan)
}

fn assign_daily_run_metadata(plan: &mut DailyPracticePlan, today: NaiveDate, run_number: u16) {
    let run_id = format!(
        "{}-{}-{}",
        today.format("%Y%m%d"),
        run_number,
        uuid::Uuid::new_v4().simple()
    );
    plan.run_id = run_id;
    plan.run_number = run_number;
    for (index, lesson) in plan.lessons.iter_mut().enumerate() {
        lesson.id = format!("{}-{:02}-{}", plan.run_id, index + 1, lesson.kind.slug());
    }
}

fn daily_run_complete(plan: &DailyPracticePlan, records: &[SessionRecord]) -> bool {
    if plan.lessons.is_empty() || plan.run_id.is_empty() {
        return false;
    }
    let completed_lesson_ids = records
        .iter()
        .filter(|record| record.daily_run_id == plan.run_id)
        .filter(|record| record.completion_state == CompletionState::Completed)
        .map(|record| record.lesson_id.as_str())
        .collect::<HashSet<_>>();
    plan.lessons
        .iter()
        .all(|lesson| completed_lesson_ids.contains(lesson.id.as_str()))
}

fn completed_ms_for_date(records: &[SessionRecord], date: NaiveDate) -> u64 {
    records
        .iter()
        .filter(|record| record.started_at.with_timezone(&Local).date_naive() == date)
        .map(|record| record.duration_ms)
        .sum()
}

fn load_preferences_from_path(path: &Path) -> Result<UserPreferences> {
    if !path.exists() {
        return Ok(UserPreferences::default());
    }

    let data =
        fs::read_to_string(path).with_context(|| format!("Failed to read {}", path.display()))?;
    serde_json::from_str(&data).with_context(|| format!("Failed to parse {}", path.display()))
}

fn save_preferences_to_path(preferences: &UserPreferences, path: &Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("Failed to create data dir {}", parent.display()))?;
    }
    let data = serde_json::to_string_pretty(preferences)?;
    fs::write(path, data).with_context(|| format!("Failed to write {}", path.display()))
}

fn load_daily_run_store(path: &Path) -> Result<DailyRunStore> {
    if !path.exists() {
        return Ok(DailyRunStore::default());
    }
    let data =
        fs::read_to_string(path).with_context(|| format!("Failed to read {}", path.display()))?;
    serde_json::from_str(&data).with_context(|| format!("Failed to parse {}", path.display()))
}

fn save_daily_run_store(path: &Path, store: &DailyRunStore) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("Failed to create data dir {}", parent.display()))?;
    }
    let data = serde_json::to_string_pretty(store)?;
    fs::write(path, data).with_context(|| format!("Failed to write {}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{
        CodeFilterPreference, CodePracticeFacet, EverydayEnglishSettings, EverydaySentenceLength,
        LessonKind, MixProfile, Mode, PracticeLesson, PracticeTarget, SessionCheckpoint,
        TrainingCategory, TrainingModule,
    };

    #[test]
    fn preferences_round_trip_to_json_file() {
        let dir =
            std::env::temp_dir().join(format!("keyloop-preferences-{}", uuid::Uuid::new_v4()));
        let path = dir.join("preferences.json");
        let preferences = UserPreferences {
            interface_language: crate::model::Language::En,
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

        save_preferences_to_path(&preferences, &path).expect("save preferences");
        let loaded = load_preferences_from_path(&path).expect("load preferences");

        assert_eq!(loaded.pinned_code_filters, preferences.pinned_code_filters);
        assert_eq!(loaded.global_code_filters, preferences.global_code_filters);
        assert_eq!(loaded.everyday_english, preferences.everyday_english);
        assert_eq!(loaded.interface_language, preferences.interface_language);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn daily_run_reuses_unfinished_plan_and_creates_next_after_completion() {
        let dir = std::env::temp_dir().join(format!("keyloop-daily-runs-{}", uuid::Uuid::new_v4()));
        let path = dir.join("daily_runs.json");
        let today = NaiveDate::from_ymd_opt(2026, 5, 31).expect("valid date");

        let first =
            load_or_create_daily_practice_plan_from_path(&path, today, test_plan("first"), &[])
                .expect("first run");
        let reused =
            load_or_create_daily_practice_plan_from_path(&path, today, test_plan("ignored"), &[])
                .expect("reused run");

        assert_eq!(reused.run_id, first.run_id);
        assert_eq!(reused.run_number, 1);

        let records = first
            .lessons
            .iter()
            .enumerate()
            .map(|(index, lesson)| SessionRecord {
                daily_run_id: first.run_id.clone(),
                lesson_id: lesson.id.clone(),
                lesson_index: Some(index),
                completion_state: CompletionState::Completed,
                ..SessionRecord::default()
            })
            .collect::<Vec<_>>();
        let second = load_or_create_daily_practice_plan_from_path(
            &path,
            today,
            test_plan("second"),
            &records,
        )
        .expect("second run");

        assert_ne!(second.run_id, first.run_id);
        assert_eq!(second.run_number, 2);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn partial_records_do_not_complete_daily_run() {
        let mut plan = test_plan("partial");
        assign_daily_run_metadata(
            &mut plan,
            NaiveDate::from_ymd_opt(2026, 5, 31).expect("valid date"),
            1,
        );
        let records = vec![SessionRecord {
            daily_run_id: plan.run_id.clone(),
            lesson_id: plan.lessons[0].id.clone(),
            lesson_index: Some(0),
            completion_state: CompletionState::Partial,
            ..SessionRecord::default()
        }];

        assert!(!daily_run_complete(&plan, &records));
    }

    #[test]
    fn session_checkpoint_round_trips_and_clears() {
        let dir = std::env::temp_dir().join(format!("keyloop-checkpoint-{}", uuid::Uuid::new_v4()));
        let path = dir.join("current_session.json");
        let checkpoint = SessionCheckpoint {
            target_id: "daily:foundation:1".to_string(),
            target_hash: "abc123".to_string(),
            input_len: 12,
            active_ms: 1_500,
            idle_ms: 10_000,
            key_sample_count: 5,
            key_aggregates: Vec::new(),
        };

        save_session_checkpoint_to_path(&checkpoint, &path).expect("save checkpoint");
        let saved = fs::read_to_string(&path).expect("checkpoint should exist");
        assert!(saved.contains("daily:foundation:1"));

        clear_session_checkpoint_at_path(&path).expect("clear checkpoint");
        assert!(!path.exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn key_aggregate_observes_hits_misses_and_intervals() {
        let mut aggregates = Vec::new();

        observe_key_event(
            &mut aggregates,
            &KeyEventRecord {
                at_ms: 100,
                action: KeyAction::Insert,
                position: 0,
                expected: Some('a'),
                input: Some('a'),
                correct: true,
            },
            120,
        );
        observe_key_event(
            &mut aggregates,
            &KeyEventRecord {
                at_ms: 400,
                action: KeyAction::Insert,
                position: 1,
                expected: Some('a'),
                input: Some('x'),
                correct: false,
            },
            500,
        );

        assert_eq!(aggregates.len(), 1);
        let aggregate = &aggregates[0];
        assert_eq!(aggregate.key, "a");
        assert_eq!(aggregate.sample_count, 2);
        assert_eq!(aggregate.hit_count, 1);
        assert_eq!(aggregate.miss_count, 1);
        assert_eq!(aggregate.fastest_ms, 120);
        assert_eq!(aggregate.slowest_ms, 500);
        assert_eq!(aggregate.avg_ms, 310.0);
        assert_eq!(aggregate.error_rate, 50.0);
        assert!(aggregate.confidence > 0.0);
        assert!(aggregate.last_seen_at.is_some());
    }

    #[test]
    fn key_aggregates_round_trip_json_file() {
        let dir = std::env::temp_dir().join(format!("keyloop-key-stats-{}", uuid::Uuid::new_v4()));
        let path = dir.join("key_stats.json");
        let aggregates = vec![KeyAggregate {
            key: "space".to_string(),
            sample_count: 3,
            hit_count: 2,
            miss_count: 1,
            avg_ms: 180.0,
            fastest_ms: 100,
            slowest_ms: 300,
            filtered_avg_ms: 180.0,
            error_rate: 33.3333,
            confidence: 1.2,
            last_seen_at: Some(Utc::now()),
        }];

        save_key_aggregates_to_path(&aggregates, &path).expect("save key aggregates");
        let loaded = load_key_aggregates_from_path(&path).expect("load key aggregates");

        assert_eq!(loaded, aggregates);
        let _ = fs::remove_dir_all(dir);
    }

    fn test_plan(label: &str) -> DailyPracticePlan {
        DailyPracticePlan {
            run_id: String::new(),
            run_number: 0,
            target_minutes: 20,
            completed_ms: 0,
            lessons: vec![
                test_lesson(LessonKind::Warmup, &format!("{label}:warmup")),
                test_lesson(LessonKind::Symbols, &format!("{label}:symbols")),
            ],
        }
    }

    fn test_lesson(kind: LessonKind, source: &str) -> PracticeLesson {
        PracticeLesson {
            id: String::new(),
            kind,
            module: TrainingModule::Unknown,
            category: TrainingCategory::Unknown,
            mix_profile: MixProfile::Standalone,
            estimated_minutes: 3,
            target: PracticeTarget {
                mode: Mode::Words,
                text: "abc".to_string(),
                source: source.to_string(),
            },
            reason_zh: "测试".to_string(),
            reason_en: "test".to_string(),
        }
    }
}
