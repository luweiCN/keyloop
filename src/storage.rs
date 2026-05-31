use crate::model::{CompletionState, DailyPracticePlan, SessionRecord, UserPreferences};
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

pub fn append_session(record: &SessionRecord) -> Result<PathBuf> {
    let dir = data_dir()?;
    fs::create_dir_all(&dir)
        .with_context(|| format!("Failed to create data dir {}", dir.display()))?;

    let path = session_log_path()?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .with_context(|| format!("Failed to open {}", path.display()))?;

    let line = serde_json::to_string(record)?;
    writeln!(file, "{line}")?;
    Ok(path)
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
        CodeFilterPreference, CodePracticeFacet, LessonKind, Mode, PracticeLesson, PracticeTarget,
    };

    #[test]
    fn preferences_round_trip_to_json_file() {
        let dir =
            std::env::temp_dir().join(format!("keyloop-preferences-{}", uuid::Uuid::new_v4()));
        let path = dir.join("preferences.json");
        let preferences = UserPreferences {
            pinned_code_filters: vec![CodeFilterPreference {
                facet: CodePracticeFacet::Framework,
                value: "nestjs".to_string(),
            }],
        };

        save_preferences_to_path(&preferences, &path).expect("save preferences");
        let loaded = load_preferences_from_path(&path).expect("load preferences");

        assert_eq!(loaded.pinned_code_filters, preferences.pinned_code_filters);
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
