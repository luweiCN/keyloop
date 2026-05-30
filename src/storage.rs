use crate::model::SessionRecord;
use anyhow::{Context, Result};
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;

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
