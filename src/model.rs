use chrono::{DateTime, Utc};
use clap::ValueEnum;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fmt;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, ValueEnum)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    #[default]
    Zh,
    En,
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
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

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct CharStats {
    pub correct: usize,
    pub incorrect: usize,
    pub extra: usize,
    pub missed: usize,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct KeyAggregate {
    pub key: String,
    pub sample_count: u64,
    pub hit_count: u64,
    pub miss_count: u64,
    pub avg_ms: f64,
    pub fastest_ms: u64,
    pub slowest_ms: u64,
    pub filtered_avg_ms: f64,
    pub error_rate: f64,
    pub confidence: f64,
    pub last_seen_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct SessionCheckpoint {
    pub target_id: String,
    pub target_hash: String,
    pub input_len: usize,
    pub active_ms: u64,
    pub idle_ms: u64,
    pub key_sample_count: usize,
    #[serde(default)]
    pub key_aggregates: Vec<KeyAggregate>,
}

impl LessonKind {
    pub fn slug(self) -> &'static str {
        match self {
            LessonKind::Foundation => "foundation",
            LessonKind::Warmup => "warmup",
            LessonKind::Chunks => "chunks",
            LessonKind::CommonWords => "common_words",
            LessonKind::Words => "words",
            LessonKind::Symbols => "symbols",
            LessonKind::Naming => "naming",
            LessonKind::CodeBlock => "code_block",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyPracticePlan {
    #[serde(default)]
    pub run_id: String,
    #[serde(default)]
    pub run_number: u16,
    pub target_minutes: u16,
    pub completed_ms: u64,
    pub lessons: Vec<PracticeLesson>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PracticeLesson {
    #[serde(default)]
    pub id: String,
    pub kind: LessonKind,
    #[serde(default = "default_lesson_module")]
    pub module: TrainingModule,
    #[serde(default = "default_lesson_category")]
    pub category: TrainingCategory,
    #[serde(default)]
    pub mix_profile: MixProfile,
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
    pub level: Option<CodePracticeLevel>,
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
            && self.level.is_none()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CodePracticeLevel {
    Block,
    Function,
    File,
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
    pub interface_language: Language,
    #[serde(default)]
    pub pinned_code_filters: Vec<CodeFilterPreference>,
    #[serde(default)]
    pub global_code_filters: Vec<CodeFilterPreference>,
    #[serde(default)]
    pub everyday_english: EverydayEnglishSettings,
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
    pub daily_run_id: String,
    #[serde(default)]
    pub lesson_id: String,
    #[serde(default)]
    pub lesson_index: Option<usize>,
    #[serde(default)]
    pub completion_state: CompletionState,
    #[serde(default)]
    pub module: TrainingModule,
    #[serde(default)]
    pub category: TrainingCategory,
    #[serde(default)]
    pub duration_ms: u64,
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
            daily_run_id: String::new(),
            lesson_id: String::new(),
            lesson_index: None,
            completion_state: CompletionState::default(),
            module: TrainingModule::default(),
            category: TrainingCategory::default(),
            duration_ms: 0,
            active_ms: 0,
            idle_ms: 0,
            manual_pause_ms: 0,
            idle_pause_count: 0,
            start_to_first_key_ms: 0,
            last_key_to_end_ms: 0,
            char_stats: CharStats::default(),
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

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CompletionState {
    #[default]
    Completed,
    Partial,
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

fn default_lesson_module() -> TrainingModule {
    TrainingModule::ProgrammingBasics
}

fn default_lesson_category() -> TrainingCategory {
    TrainingCategory::ProgrammingTerms
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
        assert!(record.lesson_id.is_empty());
        assert!(record.error_chars.is_empty());
        assert!(record.error_tokens.is_empty());
        assert!(record.slow_tokens.is_empty());
        assert!(record.token_stats.is_empty());
        assert!(record.key_events.is_empty());
    }

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
}
