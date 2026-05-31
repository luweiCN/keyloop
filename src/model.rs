use chrono::{DateTime, Utc};
use clap::ValueEnum;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ValueEnum)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    Zh,
    En,
}

impl Language {
    pub fn toggle(self) -> Self {
        match self {
            Language::Zh => Language::En,
            Language::En => Language::Zh,
        }
    }
}

impl fmt::Display for Language {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Language::Zh => write!(f, "中文"),
            Language::En => write!(f, "English"),
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, ValueEnum)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Chars,
    Numbers,
    Case,
    Words,
    Symbols,
    Code,
    #[default]
    Mixed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LessonKind {
    Foundation,
    Warmup,
    Chunks,
    CommonWords,
    Words,
    Symbols,
    Naming,
    CodeBlock,
}

#[derive(Debug, Clone)]
pub struct DailyPracticePlan {
    pub target_minutes: u16,
    pub completed_ms: u64,
    pub lessons: Vec<PracticeLesson>,
}

#[derive(Debug, Clone)]
pub struct PracticeLesson {
    pub kind: LessonKind,
    pub estimated_minutes: u16,
    pub target: PracticeTarget,
    pub reason_zh: String,
    pub reason_en: String,
}

impl fmt::Display for Mode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Mode::Chars => write!(f, "chars"),
            Mode::Numbers => write!(f, "numbers"),
            Mode::Case => write!(f, "case"),
            Mode::Words => write!(f, "words"),
            Mode::Symbols => write!(f, "symbols"),
            Mode::Code => write!(f, "code"),
            Mode::Mixed => write!(f, "mixed"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PracticeTarget {
    pub mode: Mode,
    pub text: String,
    pub source: String,
}

#[derive(Debug, Clone, Default)]
pub struct CodePracticeConfig {
    pub language: Option<String>,
    pub framework: Option<String>,
    pub project: Option<String>,
    pub languages: Vec<String>,
    pub frameworks: Vec<String>,
    pub projects: Vec<String>,
    pub match_any: bool,
}

impl CodePracticeConfig {
    pub fn is_empty(&self) -> bool {
        self.language.is_none()
            && self.framework.is_none()
            && self.project.is_none()
            && self.languages.is_empty()
            && self.frameworks.is_empty()
            && self.projects.is_empty()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CodePracticeFacet {
    Language,
    Framework,
    Project,
}

#[derive(Debug, Clone)]
pub struct CodePracticeOption {
    pub facet: CodePracticeFacet,
    pub value: String,
    pub count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct CodeFilterPreference {
    pub facet: CodePracticeFacet,
    pub value: String,
}

impl CodeFilterPreference {
    pub fn from_option(option: &CodePracticeOption) -> Self {
        Self {
            facet: option.facet,
            value: option.value.clone(),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct UserPreferences {
    #[serde(default)]
    pub pinned_code_filters: Vec<CodeFilterPreference>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionRecord {
    #[serde(default = "default_session_id")]
    pub id: String,
    #[serde(default = "default_started_at")]
    pub started_at: DateTime<Utc>,
    #[serde(default)]
    pub mode: Mode,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub duration_ms: u64,
    #[serde(default)]
    pub target_text: String,
    #[serde(default)]
    pub user_input: String,
    #[serde(default)]
    pub target_len: usize,
    #[serde(default)]
    pub typed_len: usize,
    #[serde(default)]
    pub correct_chars: usize,
    #[serde(default)]
    pub wpm: f64,
    #[serde(default)]
    pub raw_wpm: f64,
    #[serde(default)]
    pub accuracy: f64,
    #[serde(default)]
    pub error_count: u32,
    #[serde(default)]
    pub backspace_count: u32,
    #[serde(default)]
    pub error_chars: BTreeMap<String, u32>,
    #[serde(default)]
    pub error_tokens: BTreeMap<String, u32>,
    #[serde(default)]
    pub slow_tokens: Vec<TokenStat>,
    #[serde(default)]
    pub token_stats: Vec<TokenStat>,
    #[serde(default)]
    pub key_events: Vec<KeyEventRecord>,
}

impl Default for SessionRecord {
    fn default() -> Self {
        Self {
            id: default_session_id(),
            started_at: default_started_at(),
            mode: Mode::default(),
            source: String::new(),
            duration_ms: 0,
            target_text: String::new(),
            user_input: String::new(),
            target_len: 0,
            typed_len: 0,
            correct_chars: 0,
            wpm: 0.0,
            raw_wpm: 0.0,
            accuracy: 0.0,
            error_count: 0,
            backspace_count: 0,
            error_chars: BTreeMap::new(),
            error_tokens: BTreeMap::new(),
            slow_tokens: Vec::new(),
            token_stats: Vec::new(),
            key_events: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyEventRecord {
    pub at_ms: u64,
    pub action: KeyAction,
    pub position: usize,
    pub expected: Option<char>,
    pub input: Option<char>,
    pub correct: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum KeyAction {
    Insert,
    AutoIndent,
    Backspace,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenStat {
    pub token: String,
    pub kind: TokenKind,
    pub start_delay_ms: u64,
    pub duration_ms: u64,
    pub errors: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TokenKind {
    Word,
    Symbol,
    Code,
}

impl fmt::Display for TokenKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TokenKind::Word => write!(f, "word"),
            TokenKind::Symbol => write!(f, "symbol"),
            TokenKind::Code => write!(f, "code"),
        }
    }
}

fn default_session_id() -> String {
    "legacy".to_string()
}

fn default_started_at() -> DateTime<Utc> {
    DateTime::<Utc>::from(std::time::UNIX_EPOCH)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_record_defaults_missing_diagnostic_fields() {
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

        assert_eq!(record.id, "legacy");
        assert!(record.error_chars.is_empty());
        assert!(record.error_tokens.is_empty());
        assert!(record.slow_tokens.is_empty());
        assert!(record.token_stats.is_empty());
        assert!(record.key_events.is_empty());
    }
}
