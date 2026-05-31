use crate::model::{SessionRecord, UserPreferences};
use anyhow::{Context, Result};
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{CodeFilterPreference, CodePracticeFacet};

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
}
