mod copy;
mod stats;
mod terminal;

use crate::content::{EverydayPracticeScope, FoundationPracticeDrill, ProgrammingBasicsPractice};
use crate::metrics;
use crate::model::{
    CodeFilterPreference, CodePracticeConfig, CodePracticeFacet, CodePracticeLevel,
    CodePracticeOption, CompletionState, DailyPracticePlan, KeyAction, KeyAggregate,
    KeyEventRecord, Language, LessonKind, Mode, PracticeLesson, PracticeTarget, SessionCheckpoint,
    SessionRecord, TrainingCategory, TrainingModule, UserPreferences,
};
use crate::{content, storage};
use anyhow::Result;
use chrono::{DateTime, Local, NaiveDate, Utc};
use copy::{lesson_color, lesson_purpose, lesson_title, text};
use crossterm::event::{self, Event, KeyCode, KeyEventKind, KeyModifiers};
use rand::seq::SliceRandom;
use ratatui::Frame;
use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span, Text};
use ratatui::widgets::{Block, BorderType, Borders, Gauge, Paragraph, Wrap};
use stats::*;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::time::{Duration, Instant};
use terminal::Tui;

const PRACTICE_PANEL_MAX_WIDTH: u16 = 92;
const MIN_TERMINAL_WIDTH: u16 = 72;
const MIN_TERMINAL_HEIGHT: u16 = 25;

fn panel_block(title: &'static str) -> Block<'static> {
    Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .border_style(Style::default().fg(Color::Reset))
        .title(title)
}

fn analysis_block(title: &'static str) -> Block<'static> {
    panel_block(title).border_style(Style::default().fg(Color::Cyan))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Phase {
    Menu,
    Plan,
    FoundationSetup,
    EverydaySetup,
    ProgrammingSetup,
    CodeSetup,
    Settings,
    InterfaceLanguageSettings,
    CodeFilterSettings,
    Stats,
    Running,
    Complete,
    Summary,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LessonStatus {
    Done,
    Current,
    Pending,
}

struct App {
    phase: Phase,
    language: Language,
    plan: DailyPracticePlan,
    records: Vec<SessionRecord>,
    menu_index: usize,
    stats_view: StatsView,
    stats_day_index: usize,
    key_stats_sort: KeyStatsSort,
    foundation_drills: Vec<FoundationPracticeDrill>,
    foundation_index: usize,
    foundation_active: bool,
    foundation_group_count: usize,
    everyday_index: usize,
    everyday_active: bool,
    everyday_group_count: usize,
    programming_index: usize,
    programming_active: bool,
    programming_group_count: usize,
    code_options: Vec<CodePracticeOption>,
    code_level_index: usize,
    code_filter_index: usize,
    settings_index: usize,
    language_setting_index: usize,
    code_selected: Vec<bool>,
    preferences: UserPreferences,
    preferences_dirty: bool,
    code_specialist_active: bool,
    code_group_count: usize,
    single_lesson: Option<usize>,
    lesson_index: usize,
    target: Option<PracticeTarget>,
    target_chars: Vec<char>,
    input: Vec<char>,
    events: Vec<KeyEventRecord>,
    started_at: Option<DateTime<Utc>>,
    started: Option<Instant>,
    paused_at: Option<Instant>,
    paused_total: Duration,
    completed_records: Vec<SessionRecord>,
    last_saved_to: Option<PathBuf>,
    save_error: Option<String>,
    key_aggregates: Vec<KeyAggregate>,
    key_stats_dirty: bool,
    last_key_stats_flush: Instant,
    last_key_event_at_ms: Option<u64>,
    completed_lesson_indices: Vec<usize>,
    ignored_non_ascii: u32,
    exit_confirm: bool,
    quit: bool,
}

impl App {
    fn new(
        plan: DailyPracticePlan,
        records: Vec<SessionRecord>,
        language: Language,
        foundation_drills: Vec<FoundationPracticeDrill>,
        code_options: Vec<CodePracticeOption>,
        preferences: UserPreferences,
    ) -> Self {
        Self::new_with_key_aggregates(
            plan,
            records,
            language,
            foundation_drills,
            code_options,
            preferences,
            Vec::new(),
        )
    }

    fn new_with_key_aggregates(
        plan: DailyPracticePlan,
        records: Vec<SessionRecord>,
        language: Language,
        foundation_drills: Vec<FoundationPracticeDrill>,
        code_options: Vec<CodePracticeOption>,
        preferences: UserPreferences,
        key_aggregates: Vec<KeyAggregate>,
    ) -> Self {
        let code_selected = code_options
            .iter()
            .map(|option| {
                preferences
                    .global_code_filters
                    .contains(&CodeFilterPreference::from_option(option))
            })
            .collect::<Vec<_>>();
        let completed_lesson_indices = completed_lesson_indices_from_records(&plan, &records);
        let lesson_index = first_pending_lesson_index(&plan, &completed_lesson_indices);
        Self {
            phase: Phase::Menu,
            language,
            plan,
            records,
            menu_index: 0,
            stats_view: StatsView::Overview,
            stats_day_index: 0,
            key_stats_sort: KeyStatsSort::SlowestAverage,
            foundation_drills,
            foundation_index: 0,
            foundation_active: false,
            foundation_group_count: 0,
            everyday_index: 0,
            everyday_active: false,
            everyday_group_count: 0,
            programming_index: 0,
            programming_active: false,
            programming_group_count: 0,
            code_options,
            code_level_index: 0,
            code_filter_index: 0,
            settings_index: 0,
            language_setting_index: usize::from(language == Language::En),
            code_selected,
            preferences,
            preferences_dirty: false,
            code_specialist_active: false,
            code_group_count: 0,
            single_lesson: None,
            lesson_index,
            target: None,
            target_chars: Vec::new(),
            input: Vec::new(),
            events: Vec::new(),
            started_at: None,
            started: None,
            paused_at: None,
            paused_total: Duration::ZERO,
            completed_records: Vec::new(),
            last_saved_to: None,
            save_error: None,
            key_aggregates,
            key_stats_dirty: false,
            last_key_stats_flush: Instant::now(),
            last_key_event_at_ms: None,
            completed_lesson_indices,
            ignored_non_ascii: 0,
            exit_confirm: false,
            quit: false,
        }
    }

    fn current_lesson(&self) -> Option<&PracticeLesson> {
        self.plan.lessons.get(self.lesson_index)
    }

    fn menu_len(&self) -> usize {
        7
    }

    fn foundation_menu_index(&self) -> usize {
        1
    }

    fn everyday_menu_index(&self) -> usize {
        2
    }

    fn programming_menu_index(&self) -> usize {
        3
    }

    fn code_specialist_menu_index(&self) -> usize {
        4
    }

    fn settings_menu_index(&self) -> usize {
        5
    }

    fn stats_menu_index(&self) -> usize {
        6
    }

    fn completed_today_ms(&self) -> u64 {
        self.plan.completed_ms
            + self
                .completed_records
                .iter()
                .map(|record| record.duration_ms)
                .sum::<u64>()
    }

    fn target_minutes(&self) -> u16 {
        self.plan.target_minutes
    }

    fn begin_current(&mut self) {
        if self.current_lesson().is_none() {
            self.phase = Phase::Summary;
            return;
        }

        let Some(target) = self.refreshed_current_lesson_target() else {
            self.phase = Phase::Summary;
            return;
        };
        self.begin_target(target);
    }

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

    fn begin_target(&mut self, target: PracticeTarget) {
        let target_id = self
            .current_lesson()
            .map(|lesson| lesson.id.clone())
            .unwrap_or_else(|| target.source.clone());
        let checkpoint = SessionCheckpoint {
            target_id,
            target_hash: target_text_hash(&target.text),
            input_len: 0,
            active_ms: 0,
            idle_ms: 0,
            key_sample_count: key_sample_count(&self.key_aggregates),
            key_aggregates: self.key_aggregates.clone(),
        };
        if let Err(error) = storage::save_session_checkpoint(&checkpoint) {
            self.save_error = Some(error.to_string());
        }
        self.target_chars = target.text.chars().collect();
        self.target = Some(target);
        self.input.clear();
        self.events.clear();
        self.ignored_non_ascii = 0;
        self.exit_confirm = false;
        self.started_at = Some(Utc::now());
        self.started = Some(Instant::now());
        self.paused_at = None;
        self.paused_total = Duration::ZERO;
        self.last_key_event_at_ms = None;
        self.phase = Phase::Running;
    }

    fn repeat_current(&mut self) {
        if (self.foundation_active
            || self.everyday_active
            || self.programming_active
            || self.code_specialist_active)
            && let Some(target) = self.target.clone()
        {
            self.begin_target(target);
            return;
        }
        self.begin_current();
    }

    fn begin_next(&mut self) {
        if self.foundation_active {
            self.begin_next_foundation_group();
            return;
        }
        if self.everyday_active {
            self.begin_next_everyday_group();
            return;
        }
        if self.programming_active {
            self.begin_next_programming_group();
            return;
        }
        if self.code_specialist_active {
            self.begin_next_code_group();
            return;
        }
        if self.single_lesson.is_some() {
            self.phase = Phase::Summary;
            return;
        }
        if self.lesson_index + 1 >= self.plan.lessons.len() {
            self.phase = Phase::Summary;
            return;
        }
        self.lesson_index += 1;
        self.begin_current();
    }

    fn begin_foundation_drill(&mut self) {
        if self.foundation_drills.is_empty() && self.foundation_index == 0 {
            return;
        }
        self.foundation_active = true;
        self.foundation_group_count = 0;
        self.everyday_active = false;
        self.everyday_group_count = 0;
        self.programming_active = false;
        self.programming_group_count = 0;
        self.code_specialist_active = false;
        self.code_group_count = 0;
        self.single_lesson = None;
        self.begin_next_foundation_group();
    }

    fn begin_next_foundation_group(&mut self) {
        if self.foundation_index == self.foundation_drills.len() {
            let records = self.all_records();
            let target = content::build_foundation_mix_target(&records).unwrap_or_else(|error| {
                PracticeTarget {
                    mode: Mode::Chars,
                    text: "asdf jkl; qwer uiop\nzxcv bnm, fr ft ju jm".to_string(),
                    source: format!("keyloop:foundation-mix-error:{error}"),
                }
            });
            self.foundation_group_count += 1;
            self.begin_target(target);
            return;
        }
        let Some(drill) = self.foundation_drills.get(self.foundation_index) else {
            self.phase = Phase::Menu;
            return;
        };
        let records = self.all_records();
        let target =
            content::build_foundation_target(&records, &drill.id, 12).unwrap_or_else(|error| {
                PracticeTarget {
                    mode: Mode::Chars,
                    text: "asdf jkl; asdf jkl;\nfr ft fv fg jr ju jm jn".to_string(),
                    source: format!("keyloop:foundation-error:{error}"),
                }
            });
        self.foundation_group_count += 1;
        self.begin_target(target);
    }

    fn begin_everyday_practice(&mut self) {
        self.foundation_active = false;
        self.foundation_group_count = 0;
        self.everyday_active = true;
        self.everyday_group_count = 0;
        self.programming_active = false;
        self.programming_group_count = 0;
        self.code_specialist_active = false;
        self.code_group_count = 0;
        self.single_lesson = Some(usize::MAX);
        self.begin_next_everyday_group();
    }

    fn begin_next_everyday_group(&mut self) {
        let records = self.all_records();
        let target = content::build_everyday_target(
            &records,
            self.selected_everyday_scope(),
            self.preferences.everyday_english,
        )
        .unwrap_or_else(|error| PracticeTarget {
            mode: Mode::Words,
            text: "today tomorrow because before\npeople work learn practice".to_string(),
            source: format!("keyloop:everyday-error:{error}"),
        });
        self.everyday_group_count += 1;
        self.begin_target(target);
    }

    fn selected_everyday_scope(&self) -> EverydayPracticeScope {
        match self.everyday_index {
            0 => EverydayPracticeScope::Common500,
            1 => EverydayPracticeScope::Common1000,
            2 => EverydayPracticeScope::Common5000,
            3 => EverydayPracticeScope::Sentences,
            _ => EverydayPracticeScope::Mix,
        }
    }

    fn selected_everyday_category(&self) -> TrainingCategory {
        match self.selected_everyday_scope() {
            EverydayPracticeScope::Common500
            | EverydayPracticeScope::Common1000
            | EverydayPracticeScope::Common5000 => TrainingCategory::EverydayWords,
            EverydayPracticeScope::Sentences => TrainingCategory::EverydaySentences,
            EverydayPracticeScope::Mix => TrainingCategory::EverydayMix,
        }
    }

    fn cycle_everyday_word_count(&mut self, direction: isize) {
        let options = [10usize, 20, 50, 100];
        let current = self.preferences.everyday_english.word_count;
        let index = options
            .iter()
            .position(|value| *value == current)
            .unwrap_or(2);
        let next = cycle_index(index, options.len(), direction);
        self.preferences.everyday_english.word_count = options[next];
        self.preferences_dirty = true;
    }

    fn cycle_everyday_sentence_length(&mut self, direction: isize) {
        let options = [
            crate::model::EverydaySentenceLength::Short,
            crate::model::EverydaySentenceLength::Medium,
            crate::model::EverydaySentenceLength::Long,
            crate::model::EverydaySentenceLength::Mixed,
        ];
        let current = self.preferences.everyday_english.sentence_length;
        let index = options
            .iter()
            .position(|value| *value == current)
            .unwrap_or(3);
        let next = cycle_index(index, options.len(), direction);
        self.preferences.everyday_english.sentence_length = options[next];
        self.preferences_dirty = true;
    }

    fn refresh_running_everyday_target(&mut self) {
        if !self.everyday_active || self.phase != Phase::Running {
            return;
        }
        let records = self.all_records();
        let target = content::build_everyday_target(
            &records,
            self.selected_everyday_scope(),
            self.preferences.everyday_english,
        )
        .unwrap_or_else(|error| PracticeTarget {
            mode: Mode::Words,
            text: "today tomorrow because before\npeople work learn practice".to_string(),
            source: format!("keyloop:everyday-error:{error}"),
        });
        self.begin_target(target);
    }

    fn begin_programming_practice(&mut self) {
        self.foundation_active = false;
        self.foundation_group_count = 0;
        self.everyday_active = false;
        self.everyday_group_count = 0;
        self.programming_active = true;
        self.programming_group_count = 0;
        self.code_specialist_active = false;
        self.code_group_count = 0;
        self.single_lesson = Some(usize::MAX);
        self.begin_next_programming_group();
    }

    fn begin_next_programming_group(&mut self) {
        let records = self.all_records();
        let target = content::build_programming_basics_target(
            &records,
            self.selected_programming_practice(),
            &self.selected_code_config(),
        )
        .unwrap_or_else(|error| PracticeTarget {
            mode: Mode::Symbols,
            text: "=> !== === && ||\ncamelCase PascalCase CONSTANT_CASE".to_string(),
            source: format!("keyloop:programming-basics-error:{error}"),
        });
        self.programming_group_count += 1;
        self.begin_target(target);
    }

    fn selected_programming_practice(&self) -> ProgrammingBasicsPractice {
        match self.programming_index {
            0 => ProgrammingBasicsPractice::NumberSymbols,
            1 => ProgrammingBasicsPractice::Operators,
            2 => ProgrammingBasicsPractice::Naming,
            3 => ProgrammingBasicsPractice::TechnicalTerms,
            _ => ProgrammingBasicsPractice::Mix,
        }
    }

    fn selected_programming_category(&self) -> TrainingCategory {
        match self.selected_programming_practice() {
            ProgrammingBasicsPractice::NumberSymbols => TrainingCategory::NumbersSymbols,
            ProgrammingBasicsPractice::Operators => TrainingCategory::OperatorsBracketsQuotes,
            ProgrammingBasicsPractice::Naming => TrainingCategory::NamingStyles,
            ProgrammingBasicsPractice::TechnicalTerms => TrainingCategory::ProgrammingTerms,
            ProgrammingBasicsPractice::Mix => TrainingCategory::ProgrammingBasicsMix,
        }
    }

    fn begin_code_specialist(&mut self) {
        self.foundation_active = false;
        self.foundation_group_count = 0;
        self.everyday_active = false;
        self.everyday_group_count = 0;
        self.programming_active = false;
        self.programming_group_count = 0;
        self.code_specialist_active = true;
        self.code_group_count = 0;
        self.single_lesson = Some(self.code_lesson_index());
        self.lesson_index = self.code_lesson_index();
        self.begin_next_code_group();
    }

    fn begin_next_code_group(&mut self) {
        let config = self.code_group_config();
        let records = self.all_records();
        let target =
            content::build_code_specialist_target(&records, &config, 4).unwrap_or_else(|error| {
                PracticeTarget {
                    mode: Mode::Code,
                    text: "function retryLater() {\n  return true;\n}".to_string(),
                    source: format!("keyloop:code-specialist-error:{error}"),
                }
            });
        self.code_group_count += 1;
        self.begin_target(target);
    }

    fn code_group_config(&self) -> CodePracticeConfig {
        if self.code_level_index != 3 {
            return self.selected_code_config();
        }

        let mut rng = rand::thread_rng();
        let mut config = CodePracticeConfig {
            level: [
                CodePracticeLevel::Block,
                CodePracticeLevel::Function,
                CodePracticeLevel::File,
            ]
            .choose(&mut rng)
            .copied(),
            match_any: true,
            ..CodePracticeConfig::default()
        };
        let selected_preferences = self.selected_code_preferences();
        if let Some(preference) = selected_preferences.choose(&mut rng).cloned() {
            match preference.facet {
                CodePracticeFacet::Language => config.languages.push(preference.value),
                CodePracticeFacet::Framework => config.frameworks.push(preference.value),
                CodePracticeFacet::Project => config.projects.push(preference.value),
            }
        }
        config
    }

    fn code_lesson_index(&self) -> usize {
        self.plan
            .lessons
            .iter()
            .position(|lesson| lesson.kind == LessonKind::CodeBlock)
            .unwrap_or_else(|| self.plan.lessons.len().saturating_sub(1))
    }

    fn selected_code_config(&self) -> CodePracticeConfig {
        let mut config = CodePracticeConfig {
            level: self.selected_code_level(),
            match_any: true,
            ..CodePracticeConfig::default()
        };
        for (option, selected) in self.code_options.iter().zip(self.code_selected.iter()) {
            if !selected {
                continue;
            }
            match option.facet {
                CodePracticeFacet::Language => config.languages.push(option.value.clone()),
                CodePracticeFacet::Framework => config.frameworks.push(option.value.clone()),
                CodePracticeFacet::Project => config.projects.push(option.value.clone()),
            }
        }
        config
    }

    fn selected_code_level(&self) -> Option<CodePracticeLevel> {
        match self.code_level_index {
            0 => Some(CodePracticeLevel::Block),
            1 => Some(CodePracticeLevel::Function),
            2 => Some(CodePracticeLevel::File),
            _ => None,
        }
    }

    fn selected_code_labels(&self) -> Vec<String> {
        self.code_options
            .iter()
            .zip(self.code_selected.iter())
            .filter(|(_, selected)| **selected)
            .map(|(option, _)| option.value.clone())
            .collect()
    }

    fn selected_code_preferences(&self) -> Vec<CodeFilterPreference> {
        self.code_options
            .iter()
            .zip(self.code_selected.iter())
            .filter(|(_, selected)| **selected)
            .map(|(option, _)| CodeFilterPreference::from_option(option))
            .collect()
    }

    fn current_code_preference(&self) -> Option<CodeFilterPreference> {
        self.code_options
            .get(self.code_filter_index)
            .map(CodeFilterPreference::from_option)
    }

    fn sync_global_code_filters(&mut self) {
        self.preferences.global_code_filters = self.selected_code_preferences();
        self.preferences_dirty = true;
    }

    fn toggle_current_code_filter_pin(&mut self) {
        let Some(preference) = self.current_code_preference() else {
            return;
        };
        if code_filter_is_pinned(&self.preferences, &preference) {
            remove_code_filter_pin(&mut self.preferences, &preference);
        } else {
            pin_code_filter(&mut self.preferences, preference);
        }
        self.preferences_dirty = true;
        self.sort_code_options_preserving_state();
    }

    fn remove_current_code_filter_pin(&mut self) {
        let Some(preference) = self.current_code_preference() else {
            return;
        };
        if remove_code_filter_pin(&mut self.preferences, &preference) {
            self.preferences_dirty = true;
            self.sort_code_options_preserving_state();
        }
    }

    fn sort_code_options_preserving_state(&mut self) {
        let active = self.current_code_preference();
        let selected = self.selected_code_preferences();
        sort_code_options_by_preferences(&mut self.code_options, &self.preferences);
        self.code_selected = self
            .code_options
            .iter()
            .map(|option| selected.contains(&CodeFilterPreference::from_option(option)))
            .collect();
        if let Some(active) = active
            && let Some(index) = self
                .code_options
                .iter()
                .position(|option| CodeFilterPreference::from_option(option) == active)
        {
            self.code_filter_index = index;
        }
    }

    fn current_record(&self, completion_state: CompletionState) -> Option<SessionRecord> {
        let target = self.target.clone()?;
        let started_at = self.started_at?;

        let elapsed_ms = self.active_elapsed_ms()?;
        let user_input = self.input.iter().collect::<String>();
        let mut record = metrics::build_session_record(
            target,
            started_at,
            elapsed_ms,
            duration_ms(self.paused_total),
            user_input,
            self.events.clone(),
        );
        if self.is_comprehensive_active()
            && let Some(lesson) = self.current_lesson()
        {
            record.daily_run_id = self.plan.run_id.clone();
            record.lesson_id = lesson.id.clone();
            record.lesson_index = Some(self.lesson_index);
            record.module = lesson.module;
            record.category = lesson.category;
        } else if self.foundation_active {
            record.module = TrainingModule::FoundationInput;
            record.category = TrainingCategory::FoundationMix;
        } else if self.everyday_active {
            record.module = TrainingModule::EverydayEnglish;
            record.category = self.selected_everyday_category();
        } else if self.programming_active {
            record.module = TrainingModule::ProgrammingBasics;
            record.category = self.selected_programming_category();
        } else if self.code_specialist_active {
            record.module = TrainingModule::CodePractice;
            record.category = TrainingCategory::CodeMix;
        }
        record.completion_state = completion_state;
        Some(record)
    }

    fn complete(&mut self) {
        self.complete_with_saver(storage::append_session);
    }

    fn complete_with_saver<F>(&mut self, mut saver: F)
    where
        F: FnMut(&SessionRecord) -> Result<PathBuf>,
    {
        let Some(record) = self.current_record(CompletionState::Completed) else {
            return;
        };
        match saver(&record) {
            Ok(path) => {
                self.last_saved_to = Some(path);
                self.save_error = None;
                let _ = storage::clear_session_checkpoint();
            }
            Err(error) => {
                self.save_error = Some(error.to_string());
            }
        }
        self.flush_key_stats(true);
        self.completed_records.push(record);
        if self.is_comprehensive_active()
            && self.lesson_index < self.plan.lessons.len()
            && !self.completed_lesson_indices.contains(&self.lesson_index)
        {
            self.completed_lesson_indices.push(self.lesson_index);
        }
        self.exit_confirm = false;
        self.phase = Phase::Complete;
    }

    fn save_partial_and_quit(&mut self) {
        if !self.input.is_empty()
            && let Some(record) = self.current_record(CompletionState::Partial)
        {
            match storage::append_session(&record) {
                Ok(path) => {
                    self.last_saved_to = Some(path);
                    self.save_error = None;
                    let _ = storage::clear_session_checkpoint();
                }
                Err(error) => {
                    self.save_error = Some(error.to_string());
                }
            }
            self.completed_records.push(record);
        }
        self.flush_key_stats(true);
        self.exit_confirm = false;
        self.quit = true;
    }

    fn pause(&mut self) {
        if self.paused_at.is_none() {
            self.paused_at = Some(Instant::now());
        }
    }

    fn resume(&mut self) {
        if let Some(paused_at) = self.paused_at.take() {
            self.paused_total += paused_at.elapsed();
        }
        self.exit_confirm = false;
    }

    fn is_paused(&self) -> bool {
        self.paused_at.is_some()
    }

    fn active_elapsed(&self) -> Option<Duration> {
        let started = self.started?;
        let current_pause = self
            .paused_at
            .map(|paused_at| paused_at.elapsed())
            .unwrap_or_default();
        let paused = self.paused_total.saturating_add(current_pause);
        Some(started.elapsed().saturating_sub(paused))
    }

    fn active_elapsed_ms(&self) -> Option<u64> {
        self.active_elapsed().map(duration_ms)
    }

    fn reset_to_menu(&mut self) {
        self.flush_key_stats(true);
        self.clear_running_state();
        self.phase = Phase::Menu;
    }

    fn reset_to_parent_setup(&mut self) {
        self.flush_key_stats(true);
        let parent = if self.foundation_active {
            Phase::FoundationSetup
        } else if self.everyday_active {
            Phase::EverydaySetup
        } else if self.programming_active {
            Phase::ProgrammingSetup
        } else if self.code_specialist_active {
            Phase::CodeSetup
        } else {
            Phase::Menu
        };
        self.clear_running_state();
        self.phase = parent;
    }

    fn clear_running_state(&mut self) {
        self.single_lesson = None;
        self.foundation_active = false;
        self.foundation_group_count = 0;
        self.everyday_active = false;
        self.everyday_group_count = 0;
        self.programming_active = false;
        self.programming_group_count = 0;
        self.code_specialist_active = false;
        self.code_group_count = 0;
        self.lesson_index = self.first_pending_lesson_index();
        self.target = None;
        self.target_chars.clear();
        self.input.clear();
        self.events.clear();
        self.started_at = None;
        self.started = None;
        self.paused_at = None;
        self.paused_total = Duration::ZERO;
        self.ignored_non_ascii = 0;
        self.exit_confirm = false;
    }

    fn observe_key_event(&mut self, event: &KeyEventRecord) {
        let interval_ms = self
            .last_key_event_at_ms
            .map(|previous| event.at_ms.saturating_sub(previous))
            .unwrap_or(0);
        self.last_key_event_at_ms = Some(event.at_ms);
        storage::observe_key_event(&mut self.key_aggregates, event, interval_ms);
        if !matches!(event.action, KeyAction::AutoIndent) {
            self.key_stats_dirty = true;
            self.flush_key_stats(false);
        }
    }

    fn flush_key_stats(&mut self, force: bool) {
        if !self.key_stats_dirty {
            return;
        }
        if !force && self.last_key_stats_flush.elapsed() < Duration::from_secs(1) {
            return;
        }
        match storage::save_key_aggregates(&self.key_aggregates) {
            Ok(_) => {
                self.key_stats_dirty = false;
                self.last_key_stats_flush = Instant::now();
            }
            Err(error) => {
                self.save_error = Some(error.to_string());
            }
        }
    }

    fn choose_menu_item(&mut self) {
        if self.menu_index == 0 {
            self.single_lesson = None;
            self.lesson_index = self.first_pending_lesson_index();
            self.phase = Phase::Plan;
            return;
        }
        if self.menu_index == self.foundation_menu_index() {
            self.phase = Phase::FoundationSetup;
            return;
        }
        if self.menu_index == self.everyday_menu_index() {
            self.phase = Phase::EverydaySetup;
            return;
        }
        if self.menu_index == self.programming_menu_index() {
            self.phase = Phase::ProgrammingSetup;
            return;
        }
        if self.menu_index == self.code_specialist_menu_index() {
            self.phase = Phase::CodeSetup;
            return;
        }
        if self.menu_index == self.settings_menu_index() {
            self.phase = Phase::Settings;
            return;
        }
        if self.menu_index == self.stats_menu_index() {
            self.phase = Phase::Stats;
            self.stats_view = StatsView::Overview;
            self.clamp_stats_day();
        }
    }

    fn all_records(&self) -> Vec<&SessionRecord> {
        self.records
            .iter()
            .chain(self.completed_records.iter())
            .collect()
    }

    fn stats_dates(&self) -> Vec<NaiveDate> {
        stats_dates_from_records(&self.all_records())
    }

    fn clamp_stats_day(&mut self) {
        let len = self.stats_dates().len();
        if len == 0 {
            self.stats_day_index = 0;
        } else {
            self.stats_day_index = self.stats_day_index.min(len - 1);
        }
    }

    fn first_pending_lesson_index(&self) -> usize {
        first_pending_lesson_index(&self.plan, &self.completed_lesson_indices)
    }

    fn is_comprehensive_active(&self) -> bool {
        !self.foundation_active
            && !self.everyday_active
            && !self.programming_active
            && !self.code_specialist_active
            && self.single_lesson.is_none()
    }
}

fn completed_lesson_indices_from_records(
    plan: &DailyPracticePlan,
    records: &[SessionRecord],
) -> Vec<usize> {
    if !plan.run_id.is_empty() {
        let completed_lesson_ids = records
            .iter()
            .filter(|record| record.daily_run_id == plan.run_id)
            .filter(|record| !record.lesson_id.trim().is_empty())
            .filter(|record| record.completion_state == CompletionState::Completed)
            .map(|record| record.lesson_id.as_str())
            .collect::<std::collections::HashSet<_>>();
        return plan
            .lessons
            .iter()
            .enumerate()
            .filter(|(_, lesson)| completed_lesson_ids.contains(lesson.id.as_str()))
            .map(|(index, _)| index)
            .collect();
    }

    let today = Local::now().date_naive();
    let mut lesson_id_counts = std::collections::BTreeMap::<String, usize>::new();
    let mut legacy_source_counts = std::collections::BTreeMap::<String, usize>::new();
    for record in records
        .iter()
        .filter(|record| record.started_at.with_timezone(&Local).date_naive() == today)
    {
        if record.lesson_id.trim().is_empty() {
            *legacy_source_counts
                .entry(record.source.clone())
                .or_default() += 1;
        } else {
            *lesson_id_counts
                .entry(record.lesson_id.clone())
                .or_default() += 1;
        }
    }

    let unique_sources = unique_lesson_sources(plan);
    let mut completed = Vec::new();
    for (index, lesson) in plan.lessons.iter().enumerate() {
        if let Some(count) = lesson_id_counts.get_mut(&lesson.id)
            && *count > 0
        {
            completed.push(index);
            *count -= 1;
            continue;
        }

        if unique_sources.contains(&lesson.target.source)
            && let Some(count) = legacy_source_counts.get_mut(&lesson.target.source)
            && *count > 0
        {
            completed.push(index);
            *count -= 1;
        }
    }
    completed
}

fn unique_lesson_sources(plan: &DailyPracticePlan) -> std::collections::HashSet<String> {
    let mut counts = std::collections::BTreeMap::<String, usize>::new();
    for lesson in &plan.lessons {
        *counts.entry(lesson.target.source.clone()).or_default() += 1;
    }
    counts
        .into_iter()
        .filter_map(|(source, count)| (count == 1).then_some(source))
        .collect()
}

fn first_pending_lesson_index(plan: &DailyPracticePlan, completed: &[usize]) -> usize {
    (0..plan.lessons.len())
        .find(|index| !completed.contains(index))
        .unwrap_or(0)
}

fn sort_code_options_by_preferences(
    options: &mut [CodePracticeOption],
    preferences: &UserPreferences,
) {
    options.sort_by(|left, right| {
        code_filter_rank(preferences, &CodeFilterPreference::from_option(left))
            .cmp(&code_filter_rank(
                preferences,
                &CodeFilterPreference::from_option(right),
            ))
            .then_with(|| right.count.cmp(&left.count))
            .then_with(|| left.facet.cmp(&right.facet))
            .then_with(|| left.value.cmp(&right.value))
    });
}

fn code_filter_rank(preferences: &UserPreferences, preference: &CodeFilterPreference) -> usize {
    preferences
        .pinned_code_filters
        .iter()
        .position(|pinned| pinned == preference)
        .unwrap_or(usize::MAX)
}

fn code_filter_is_pinned(preferences: &UserPreferences, preference: &CodeFilterPreference) -> bool {
    preferences
        .pinned_code_filters
        .iter()
        .any(|pinned| pinned == preference)
}

fn pin_code_filter(preferences: &mut UserPreferences, preference: CodeFilterPreference) {
    remove_code_filter_pin(preferences, &preference);
    preferences.pinned_code_filters.insert(0, preference);
    preferences.pinned_code_filters.truncate(24);
}

fn remove_code_filter_pin(
    preferences: &mut UserPreferences,
    preference: &CodeFilterPreference,
) -> bool {
    let before = preferences.pinned_code_filters.len();
    preferences
        .pinned_code_filters
        .retain(|pinned| pinned != preference);
    preferences.pinned_code_filters.len() != before
}

fn cycle_index(index: usize, len: usize, direction: isize) -> usize {
    if len == 0 {
        return 0;
    }
    if direction >= 0 {
        (index + 1) % len
    } else {
        index.checked_sub(1).unwrap_or(len - 1)
    }
}

fn target_text_hash(text: &str) -> String {
    let mut hasher = DefaultHasher::new();
    text.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn key_sample_count(aggregates: &[KeyAggregate]) -> usize {
    aggregates
        .iter()
        .map(|aggregate| aggregate.sample_count.min(usize::MAX as u64) as usize)
        .sum()
}

pub struct RunResult {
    pub completed_records: Vec<SessionRecord>,
    pub last_saved_to: Option<PathBuf>,
}

pub fn run(
    plan: DailyPracticePlan,
    records: Vec<SessionRecord>,
    _language: Language,
) -> Result<RunResult> {
    let mut tui = Tui::enter()?;
    let foundation_drills = content::foundation_drills()?;
    let mut code_options = content::code_practice_options()?;
    let preferences = storage::load_preferences()?;
    let key_aggregates = storage::load_key_aggregates()?;
    sort_code_options_by_preferences(&mut code_options, &preferences);
    let language = preferences.interface_language;
    let mut app = App::new(
        plan,
        records,
        language,
        foundation_drills,
        code_options,
        preferences,
    );
    app.key_aggregates = key_aggregates;
    let mut next_running_tick = Instant::now() + Duration::from_secs(1);

    draw(&mut tui, &app)?;

    loop {
        if !event::poll(Duration::from_millis(250))? {
            if app.phase == Phase::Running && Instant::now() >= next_running_tick {
                draw(&mut tui, &app)?;
                next_running_tick = Instant::now() + Duration::from_secs(1);
            }
            continue;
        }

        match event::read()? {
            Event::Key(key) => {
                if key.kind != KeyEventKind::Press {
                    continue;
                }

                if key.code == KeyCode::Char('c') && key.modifiers.contains(KeyModifiers::CONTROL) {
                    break;
                }

                match app.phase {
                    Phase::Menu => handle_menu_key(&mut app, key.code),
                    Phase::Plan => handle_plan_key(&mut app, key.code),
                    Phase::FoundationSetup => handle_foundation_setup_key(&mut app, key.code),
                    Phase::EverydaySetup => handle_everyday_setup_key(&mut app, key.code),
                    Phase::ProgrammingSetup => handle_programming_setup_key(&mut app, key.code),
                    Phase::CodeSetup => handle_code_setup_key(&mut app, key.code),
                    Phase::Settings => handle_settings_key(&mut app, key.code),
                    Phase::InterfaceLanguageSettings => {
                        handle_language_settings_key(&mut app, key.code)
                    }
                    Phase::CodeFilterSettings => {
                        handle_code_filter_settings_key(&mut app, key.code)
                    }
                    Phase::Stats => handle_stats_key(&mut app, key.code),
                    Phase::Running => handle_running_key(&mut app, key.code, key.modifiers),
                    Phase::Complete => handle_complete_key(&mut app, key.code),
                    Phase::Summary => handle_summary_key(&mut app, key.code),
                }
            }
            Event::Resize(_, _) => {
                tui.terminal.clear()?;
            }
            _ => {}
        }

        if app.quit {
            break;
        }

        if app.phase == Phase::Running && app.input.len() >= app.target_chars.len() {
            app.complete();
        }

        draw(&mut tui, &app)?;
        if app.phase == Phase::Running {
            next_running_tick = Instant::now() + Duration::from_secs(1);
        }
    }

    app.flush_key_stats(true);
    if app.preferences_dirty {
        storage::save_preferences(&app.preferences)?;
    }

    Ok(RunResult {
        completed_records: app.completed_records,
        last_saved_to: app.last_saved_to,
    })
}

fn handle_menu_key(app: &mut App, code: KeyCode) {
    match code {
        KeyCode::Esc | KeyCode::Char('q') => app.quit = true,
        KeyCode::Enter => app.choose_menu_item(),
        KeyCode::Up | KeyCode::Char('k') | KeyCode::Char('K') => {
            app.menu_index = app.menu_index.saturating_sub(1);
        }
        KeyCode::Down | KeyCode::Char('j') | KeyCode::Char('J') => {
            app.menu_index = (app.menu_index + 1).min(app.menu_len().saturating_sub(1));
        }
        KeyCode::Char('0') if app.menu_len() >= 10 => {
            app.menu_index = 9.min(app.menu_len().saturating_sub(1));
        }
        KeyCode::Char(ch) if ('1'..='9').contains(&ch) => {
            if let Some(value) = ch.to_digit(10) {
                let index = (value - 1) as usize;
                if index < app.menu_len() {
                    app.menu_index = index;
                }
            }
        }
        _ => {}
    }
}

fn handle_plan_key(app: &mut App, code: KeyCode) {
    match code {
        KeyCode::Esc => app.reset_to_menu(),
        KeyCode::Char('q') => app.quit = true,
        KeyCode::Enter => app.begin_current(),
        _ => {}
    }
}

fn handle_foundation_setup_key(app: &mut App, code: KeyCode) {
    let foundation_len = app.foundation_drills.len() + 1;
    match code {
        KeyCode::Esc => app.reset_to_menu(),
        KeyCode::Char('q') | KeyCode::Char('Q') => app.quit = true,
        KeyCode::Enter => app.begin_foundation_drill(),
        KeyCode::Up | KeyCode::Char('k') | KeyCode::Char('K') => {
            app.foundation_index = app.foundation_index.saturating_sub(1);
        }
        KeyCode::Down | KeyCode::Char('j') | KeyCode::Char('J') => {
            app.foundation_index = (app.foundation_index + 1).min(foundation_len.saturating_sub(1));
        }
        KeyCode::Char(ch) if ('1'..='9').contains(&ch) => {
            if let Some(value) = ch.to_digit(10) {
                let index = (value - 1) as usize;
                if index < foundation_len {
                    app.foundation_index = index;
                }
            }
        }
        _ => {}
    }
}

fn handle_everyday_setup_key(app: &mut App, code: KeyCode) {
    match code {
        KeyCode::Esc => app.reset_to_menu(),
        KeyCode::Char('q') | KeyCode::Char('Q') => app.quit = true,
        KeyCode::Enter => app.begin_everyday_practice(),
        KeyCode::Left | KeyCode::Char('h') | KeyCode::Char('H') => {
            if app.everyday_index == 3 {
                app.cycle_everyday_sentence_length(-1);
            } else {
                app.cycle_everyday_word_count(-1);
            }
        }
        KeyCode::Right | KeyCode::Char('n') | KeyCode::Char('N') => {
            if app.everyday_index == 3 {
                app.cycle_everyday_sentence_length(1);
            } else {
                app.cycle_everyday_word_count(1);
            }
        }
        KeyCode::Up | KeyCode::Char('k') | KeyCode::Char('K') => {
            app.everyday_index = app.everyday_index.saturating_sub(1);
        }
        KeyCode::Down | KeyCode::Char('j') | KeyCode::Char('J') => {
            app.everyday_index = (app.everyday_index + 1).min(4);
        }
        KeyCode::Char(ch) if ('1'..='5').contains(&ch) => {
            if let Some(value) = ch.to_digit(10) {
                app.everyday_index = (value - 1) as usize;
            }
        }
        _ => {}
    }
}

fn handle_programming_setup_key(app: &mut App, code: KeyCode) {
    match code {
        KeyCode::Esc => app.reset_to_menu(),
        KeyCode::Char('q') | KeyCode::Char('Q') => app.quit = true,
        KeyCode::Enter => app.begin_programming_practice(),
        KeyCode::Up | KeyCode::Char('k') | KeyCode::Char('K') => {
            app.programming_index = app.programming_index.saturating_sub(1);
        }
        KeyCode::Down | KeyCode::Char('j') | KeyCode::Char('J') => {
            app.programming_index = (app.programming_index + 1).min(4);
        }
        KeyCode::Char(ch) if ('1'..='5').contains(&ch) => {
            if let Some(value) = ch.to_digit(10) {
                app.programming_index = (value - 1) as usize;
            }
        }
        _ => {}
    }
}

fn handle_code_setup_key(app: &mut App, code: KeyCode) {
    match code {
        KeyCode::Esc => app.reset_to_menu(),
        KeyCode::Char('q') | KeyCode::Char('Q') => app.quit = true,
        KeyCode::Enter => app.begin_code_specialist(),
        KeyCode::Left | KeyCode::Up | KeyCode::Char('h') | KeyCode::Char('H') => {
            app.code_level_index = app.code_level_index.saturating_sub(1);
        }
        KeyCode::Right
        | KeyCode::Down
        | KeyCode::Char('j')
        | KeyCode::Char('J')
        | KeyCode::Char('n')
        | KeyCode::Char('N') => {
            app.code_level_index = (app.code_level_index + 1).min(3);
        }
        KeyCode::Char(ch) if ('1'..='4').contains(&ch) => {
            if let Some(value) = ch.to_digit(10) {
                app.code_level_index = (value - 1) as usize;
            }
        }
        _ => {}
    }
}

fn handle_settings_key(app: &mut App, code: KeyCode) {
    match code {
        KeyCode::Esc => app.reset_to_menu(),
        KeyCode::Char('q') | KeyCode::Char('Q') => app.quit = true,
        KeyCode::Enter | KeyCode::Char(' ') => {
            if app.settings_index == 0 {
                app.language_setting_index = usize::from(app.language == Language::En);
                app.phase = Phase::InterfaceLanguageSettings;
            } else {
                app.phase = Phase::CodeFilterSettings;
            }
        }
        KeyCode::Up | KeyCode::Left | KeyCode::Char('k') | KeyCode::Char('K') => {
            app.settings_index = app.settings_index.saturating_sub(1);
        }
        KeyCode::Down | KeyCode::Right | KeyCode::Char('j') | KeyCode::Char('J') => {
            app.settings_index = (app.settings_index + 1).min(1);
        }
        KeyCode::Char(ch) if ('1'..='2').contains(&ch) => {
            if let Some(value) = ch.to_digit(10) {
                app.settings_index = (value - 1) as usize;
            }
        }
        _ => {}
    }
}

fn handle_language_settings_key(app: &mut App, code: KeyCode) {
    match code {
        KeyCode::Esc => app.phase = Phase::Settings,
        KeyCode::Char('q') | KeyCode::Char('Q') => app.quit = true,
        KeyCode::Enter | KeyCode::Char(' ') => {
            app.language = if app.language_setting_index == 0 {
                Language::Zh
            } else {
                Language::En
            };
            app.preferences.interface_language = app.language;
            app.preferences_dirty = true;
        }
        KeyCode::Up
        | KeyCode::Left
        | KeyCode::Char('h')
        | KeyCode::Char('H')
        | KeyCode::Char('k')
        | KeyCode::Char('K') => {
            app.language_setting_index = app.language_setting_index.saturating_sub(1);
        }
        KeyCode::Down
        | KeyCode::Right
        | KeyCode::Char('j')
        | KeyCode::Char('J')
        | KeyCode::Char('n')
        | KeyCode::Char('N') => {
            app.language_setting_index = (app.language_setting_index + 1).min(1);
        }
        KeyCode::Char('1') => app.language_setting_index = 0,
        KeyCode::Char('2') => app.language_setting_index = 1,
        _ => {}
    }
}

fn handle_code_filter_settings_key(app: &mut App, code: KeyCode) {
    match code {
        KeyCode::Esc => app.phase = Phase::Settings,
        KeyCode::Char('q') | KeyCode::Char('Q') => app.quit = true,
        KeyCode::Enter | KeyCode::Char(' ') => {
            if let Some(selected) = app.code_selected.get_mut(app.code_filter_index) {
                *selected = !*selected;
                app.sync_global_code_filters();
            }
        }
        KeyCode::Up | KeyCode::Char('k') | KeyCode::Char('K') => {
            app.code_filter_index = app.code_filter_index.saturating_sub(1);
        }
        KeyCode::Down | KeyCode::Char('j') | KeyCode::Char('J') => {
            app.code_filter_index =
                (app.code_filter_index + 1).min(app.code_options.len().saturating_sub(1));
        }
        KeyCode::Char('f') | KeyCode::Char('F') => app.toggle_current_code_filter_pin(),
        KeyCode::Char('d') | KeyCode::Char('D') | KeyCode::Delete => {
            app.remove_current_code_filter_pin();
        }
        _ => {}
    }
}

fn handle_stats_key(app: &mut App, code: KeyCode) {
    let dates_len = app.stats_dates().len();
    match code {
        KeyCode::Esc => app.reset_to_menu(),
        KeyCode::Char('q') => app.quit = true,
        KeyCode::Tab => {
            app.stats_view = next_stats_view(app.stats_view);
            if app.stats_view == StatsView::Daily {
                app.clamp_stats_day();
            }
        }
        KeyCode::Char('1') | KeyCode::Char('o') | KeyCode::Char('O') => {
            app.stats_view = StatsView::Overview;
        }
        KeyCode::Char('2') | KeyCode::Char('t') | KeyCode::Char('T') => {
            app.stats_view = StatsView::Today;
        }
        KeyCode::Char('3') | KeyCode::Char('f') | KeyCode::Char('F') => {
            app.stats_view = StatsView::Comprehensive;
        }
        KeyCode::Char('4') | KeyCode::Char('m') | KeyCode::Char('M') => {
            app.stats_view = StatsView::Modules;
        }
        KeyCode::Char('5') | KeyCode::Char('k') | KeyCode::Char('K') => {
            app.stats_view = StatsView::Keys;
        }
        KeyCode::Char('6') => {
            app.stats_view = StatsView::Tokens;
        }
        KeyCode::Char('7') | KeyCode::Char('c') | KeyCode::Char('C') => {
            app.stats_view = StatsView::Code;
        }
        KeyCode::Char('8') | KeyCode::Char('d') | KeyCode::Char('D') => {
            app.stats_view = StatsView::Daily;
            app.clamp_stats_day();
        }
        KeyCode::Char('s') | KeyCode::Char('S') if app.stats_view == StatsView::Keys => {
            app.key_stats_sort = app.key_stats_sort.next();
        }
        KeyCode::Left | KeyCode::Char('h') | KeyCode::Char('H') | KeyCode::Char('[')
            if app.stats_view == StatsView::Daily && dates_len > 0 =>
        {
            app.stats_day_index = (app.stats_day_index + 1).min(dates_len - 1);
        }
        KeyCode::Right | KeyCode::Char('j') | KeyCode::Char('J') | KeyCode::Char(']')
            if app.stats_view == StatsView::Daily =>
        {
            app.stats_day_index = app.stats_day_index.saturating_sub(1);
        }
        KeyCode::Home if app.stats_view == StatsView::Daily => app.stats_day_index = 0,
        KeyCode::End if app.stats_view == StatsView::Daily && dates_len > 0 => {
            app.stats_day_index = dates_len - 1;
        }
        _ => {}
    }
}

fn next_stats_view(view: StatsView) -> StatsView {
    match view {
        StatsView::Overview => StatsView::Today,
        StatsView::Today => StatsView::Comprehensive,
        StatsView::Comprehensive => StatsView::Modules,
        StatsView::Modules => StatsView::Keys,
        StatsView::Keys => StatsView::Tokens,
        StatsView::Tokens => StatsView::Code,
        StatsView::Code => StatsView::Daily,
        StatsView::Daily => StatsView::Overview,
    }
}

fn handle_complete_key(app: &mut App, code: KeyCode) {
    match code {
        KeyCode::Enter => app.begin_next(),
        KeyCode::Char('r') | KeyCode::Char('R') => app.repeat_current(),
        KeyCode::Esc => app.reset_to_menu(),
        KeyCode::Char('q') | KeyCode::Char('Q') => app.quit = true,
        _ => {}
    }
}

fn handle_summary_key(app: &mut App, code: KeyCode) {
    match code {
        KeyCode::Enter | KeyCode::Esc => app.reset_to_menu(),
        KeyCode::Char('q') | KeyCode::Char('Q') => app.quit = true,
        _ => {}
    }
}

fn handle_running_key(app: &mut App, code: KeyCode, modifiers: KeyModifiers) {
    if app.started.is_none() {
        return;
    }

    let pause_shortcut = is_pause_shortcut(code, modifiers);

    if app.exit_confirm {
        if pause_shortcut {
            app.resume();
            return;
        }
        match code {
            KeyCode::Enter | KeyCode::Char(' ') | KeyCode::Esc => app.resume(),
            KeyCode::Char('s') | KeyCode::Char('S') => app.save_partial_and_quit(),
            KeyCode::Char('m') | KeyCode::Char('M') => app.reset_to_parent_setup(),
            KeyCode::Char('q') | KeyCode::Char('Q') => app.quit = true,
            _ => {}
        }
        return;
    }

    if app.is_paused() {
        if pause_shortcut {
            app.resume();
            return;
        }
        match code {
            KeyCode::Enter | KeyCode::Char(' ') => app.resume(),
            KeyCode::Esc | KeyCode::Char('q') | KeyCode::Char('Q') => app.exit_confirm = true,
            _ => {}
        }
        return;
    }

    if pause_shortcut {
        app.pause();
        return;
    }

    if code == KeyCode::Esc {
        app.pause();
        app.exit_confirm = true;
        return;
    }

    if app.everyday_active && matches!(code, KeyCode::Left | KeyCode::Right) {
        if app.everyday_index == 3 {
            app.cycle_everyday_sentence_length(if code == KeyCode::Right { 1 } else { -1 });
        } else {
            app.cycle_everyday_word_count(if code == KeyCode::Right { 1 } else { -1 });
        }
        app.refresh_running_everyday_target();
        return;
    }

    match code {
        KeyCode::Backspace if !app.input.is_empty() => {
            app.input.pop();
            let position = app.input.len();
            let event = KeyEventRecord {
                at_ms: app.active_elapsed_ms().unwrap_or(0),
                action: KeyAction::Backspace,
                position,
                expected: app.target_chars.get(position).copied(),
                input: None,
                correct: false,
            };
            app.observe_key_event(&event);
            app.events.push(event);
        }
        KeyCode::Enter => push_char('\n', app),
        KeyCode::Tab => push_char('\t', app),
        KeyCode::Char(ch) => {
            if modifiers.contains(KeyModifiers::CONTROL) || modifiers.contains(KeyModifiers::ALT) {
                return;
            }
            if !ch.is_ascii() {
                app.ignored_non_ascii += 1;
                return;
            }
            push_char(ch, app);
        }
        _ => {}
    }
}

fn is_pause_shortcut(code: KeyCode, modifiers: KeyModifiers) -> bool {
    matches!(code, KeyCode::Char('p') | KeyCode::Char('P'))
        && modifiers.contains(KeyModifiers::CONTROL)
}

fn draw(tui: &mut Tui, app: &App) -> Result<()> {
    tui.terminal.draw(|frame| render(frame, app))?;
    Ok(())
}

fn render(frame: &mut Frame, app: &App) {
    let area = frame.area();
    if terminal_too_small(area) {
        frame.render_widget(
            Paragraph::new(text(app.language, "terminal_small")),
            frame.area(),
        );
        return;
    }

    match app.phase {
        Phase::Menu => render_menu(frame, area, app),
        Phase::Plan => render_plan(frame, area, app),
        Phase::FoundationSetup => render_foundation_setup(frame, area, app),
        Phase::EverydaySetup => render_everyday_setup(frame, area, app),
        Phase::ProgrammingSetup => render_programming_setup(frame, area, app),
        Phase::CodeSetup => render_code_setup(frame, area, app),
        Phase::Settings => render_settings(frame, area, app),
        Phase::InterfaceLanguageSettings => render_language_settings(frame, area, app),
        Phase::CodeFilterSettings => render_code_filter_settings(frame, area, app),
        Phase::Stats => render_stats(frame, area, app),
        Phase::Running => render_running(frame, area, app),
        Phase::Complete => render_complete(frame, area, app),
        Phase::Summary => render_summary(frame, area, app),
    }
}

fn terminal_too_small(area: Rect) -> bool {
    area.width < MIN_TERMINAL_WIDTH || area.height < MIN_TERMINAL_HEIGHT
}

fn render_menu(frame: &mut Frame, area: Rect, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([
            Constraint::Length(4),
            Constraint::Length(4),
            Constraint::Min(11),
            Constraint::Length(3),
        ])
        .split(area);

    render_header(
        frame,
        centered_width(chunks[0], PRACTICE_PANEL_MAX_WIDTH),
        app,
        None,
    );
    render_daily_progress(
        frame,
        centered_width(chunks[1], PRACTICE_PANEL_MAX_WIDTH),
        app,
    );

    let lines = vec![
        menu_line(
            app.menu_index == 0,
            1,
            text(app.language, "menu_comprehensive"),
            text(app.language, "menu_comprehensive_hint"),
            Color::Cyan,
        ),
        menu_line(
            app.menu_index == app.foundation_menu_index(),
            app.foundation_menu_index() + 1,
            text(app.language, "menu_foundation"),
            text(app.language, "menu_foundation_hint"),
            Color::LightGreen,
        ),
        menu_line(
            app.menu_index == app.everyday_menu_index(),
            app.everyday_menu_index() + 1,
            text(app.language, "menu_everyday"),
            text(app.language, "menu_everyday_hint"),
            Color::Green,
        ),
        menu_line(
            app.menu_index == app.programming_menu_index(),
            app.programming_menu_index() + 1,
            text(app.language, "menu_programming"),
            text(app.language, "menu_programming_hint"),
            Color::Yellow,
        ),
        menu_line(
            app.menu_index == app.code_specialist_menu_index(),
            app.code_specialist_menu_index() + 1,
            text(app.language, "menu_code_specialist"),
            text(app.language, "menu_code_specialist_hint"),
            Color::LightMagenta,
        ),
        menu_line(
            app.menu_index == app.settings_menu_index(),
            app.settings_menu_index() + 1,
            text(app.language, "menu_settings"),
            text(app.language, "menu_settings_hint"),
            Color::LightYellow,
        ),
        menu_line(
            app.menu_index == app.stats_menu_index(),
            app.stats_menu_index() + 1,
            text(app.language, "menu_stats"),
            text(app.language, "menu_stats_hint"),
            Color::LightBlue,
        ),
    ];

    frame.render_widget(
        Paragraph::new(lines).block(panel_block(text(app.language, "practice_menu"))),
        centered_width(chunks[2], PRACTICE_PANEL_MAX_WIDTH),
    );

    let help = vec![Line::from(text(app.language, "menu_help"))];
    frame.render_widget(
        Paragraph::new(help)
            .block(panel_block(text(app.language, "controls")))
            .wrap(Wrap { trim: false }),
        centered_width(chunks[3], PRACTICE_PANEL_MAX_WIDTH),
    );
}

fn menu_line(
    selected: bool,
    number: usize,
    title: &str,
    hint: &str,
    color: Color,
) -> Line<'static> {
    let marker = if selected { ">" } else { " " };
    let base_style = if selected {
        Style::default()
            .fg(Color::Black)
            .bg(color)
            .add_modifier(Modifier::BOLD)
    } else {
        Style::default().fg(color).add_modifier(Modifier::BOLD)
    };
    let hint_style = if selected {
        Style::default().fg(Color::Black).bg(color)
    } else {
        Style::default().fg(Color::Gray)
    };

    Line::from(vec![
        Span::styled(format!("{marker} {number}. "), base_style),
        Span::styled(title.to_string(), base_style),
        Span::styled("  ".to_string(), hint_style),
        Span::styled(truncate(hint, 48), hint_style),
    ])
}

fn lesson_status(app: &App, index: usize) -> LessonStatus {
    if app.completed_lesson_indices.contains(&index) {
        LessonStatus::Done
    } else if index == app.lesson_index && app.single_lesson.is_none() {
        LessonStatus::Current
    } else {
        LessonStatus::Pending
    }
}

fn lesson_status_text(status: LessonStatus, language: Language) -> &'static str {
    match status {
        LessonStatus::Done => text(language, "done"),
        LessonStatus::Current => text(language, "current"),
        LessonStatus::Pending => text(language, "pending"),
    }
}

fn lesson_status_style(status: LessonStatus) -> Style {
    match status {
        LessonStatus::Done => Style::default()
            .fg(Color::LightGreen)
            .add_modifier(Modifier::BOLD),
        LessonStatus::Current => Style::default()
            .fg(Color::Yellow)
            .add_modifier(Modifier::BOLD),
        LessonStatus::Pending => Style::default().fg(Color::Gray),
    }
}

fn render_plan(frame: &mut Frame, area: Rect, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([
            Constraint::Length(4),
            Constraint::Length(4),
            Constraint::Min(7),
            Constraint::Length(6),
            Constraint::Length(3),
        ])
        .split(area);

    render_header(
        frame,
        centered_width(chunks[0], PRACTICE_PANEL_MAX_WIDTH),
        app,
        None,
    );
    render_daily_progress(
        frame,
        centered_width(chunks[1], PRACTICE_PANEL_MAX_WIDTH),
        app,
    );

    let plan_area = centered_width(chunks[2], PRACTICE_PANEL_MAX_WIDTH);
    let compact_lessons = plan_area.height < app.plan.lessons.len() as u16 * 2 + 2;
    let lines = app
        .plan
        .lessons
        .iter()
        .enumerate()
        .flat_map(|(index, lesson)| {
            let status = lesson_status(app, index);
            let mut lesson_lines = vec![Line::from(vec![
                Span::styled(
                    format!("{}. ", index + 1),
                    Style::default().fg(Color::Yellow),
                ),
                Span::styled(
                    lesson_title(lesson.kind, app.language),
                    Style::default()
                        .fg(Color::White)
                        .add_modifier(Modifier::BOLD),
                ),
                Span::raw(format!("  {} min  ", lesson.estimated_minutes)),
                Span::styled(
                    lesson_status_text(status, app.language),
                    lesson_status_style(status),
                ),
            ])];

            if !compact_lessons {
                lesson_lines.push(Line::from(vec![
                    Span::raw("   "),
                    Span::styled(
                        lesson_purpose(lesson.kind, app.language),
                        Style::default().fg(Color::Gray),
                    ),
                ]));
            }

            lesson_lines
        })
        .collect::<Vec<_>>();

    frame.render_widget(
        Paragraph::new(lines)
            .block(panel_block(text(app.language, "today_plan")))
            .wrap(Wrap { trim: false }),
        plan_area,
    );

    render_plan_analysis(
        frame,
        centered_width(chunks[3], PRACTICE_PANEL_MAX_WIDTH),
        app,
    );

    let help = vec![
        Line::from(text(app.language, "plan_help")),
        Line::from(text(app.language, "daily_goal_hint")),
    ];
    frame.render_widget(
        Paragraph::new(help)
            .block(panel_block(text(app.language, "controls")))
            .wrap(Wrap { trim: false }),
        centered_width(chunks[4], PRACTICE_PANEL_MAX_WIDTH),
    );
}

fn render_plan_analysis(frame: &mut Frame, area: Rect, app: &App) {
    let mut lines = Vec::new();
    if let Some(lesson) = app.current_lesson() {
        lines.push(Line::from(vec![
            Span::styled(
                text(app.language, "analysis_current"),
                Style::default()
                    .fg(Color::Blue)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::raw("  "),
            Span::styled(
                lesson_title(lesson.kind, app.language),
                Style::default().add_modifier(Modifier::BOLD),
            ),
        ]));
        lines.push(Line::from(lesson_reason(lesson, app.language)));
    } else {
        lines.push(Line::from(text(app.language, "analysis_empty")));
    }
    lines.push(Line::from(text(app.language, "analysis_hint")));
    frame.render_widget(
        Paragraph::new(lines)
            .block(analysis_block(text(app.language, "analysis_title")))
            .wrap(Wrap { trim: false }),
        area,
    );
}

fn render_foundation_setup(frame: &mut Frame, area: Rect, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([
            Constraint::Length(4),
            Constraint::Length(4),
            Constraint::Min(10),
            Constraint::Length(4),
        ])
        .split(area);

    render_header(
        frame,
        centered_width(chunks[0], PRACTICE_PANEL_MAX_WIDTH),
        app,
        None,
    );
    render_daily_progress(
        frame,
        centered_width(chunks[1], PRACTICE_PANEL_MAX_WIDTH),
        app,
    );

    let drill_area = centered_width(chunks[2], PRACTICE_PANEL_MAX_WIDTH);
    let visible_rows = drill_area.height.saturating_sub(2).max(1) as usize;
    let item_count = app.foundation_drills.len() + 1;
    let (start, end) = visible_window(app.foundation_index, item_count, visible_rows);
    let mut lines = Vec::new();
    if item_count == 0 {
        lines.push(Line::from(text(app.language, "foundation_empty")));
    } else {
        for index in start..end {
            if let Some(drill) = app.foundation_drills.get(index) {
                lines.push(foundation_drill_line(
                    index == app.foundation_index,
                    index + 1,
                    drill,
                    app.language,
                ));
            } else {
                lines.push(setup_line(
                    index == app.foundation_index,
                    index + 1,
                    match app.language {
                        Language::Zh => "基础综合",
                        Language::En => "Foundation mix",
                    },
                    Color::LightGreen,
                ));
            }
        }
    }

    frame.render_widget(
        Paragraph::new(lines)
            .block(panel_block(text(app.language, "foundation_title")))
            .wrap(Wrap { trim: false }),
        drill_area,
    );

    let selected = app
        .foundation_drills
        .get(app.foundation_index)
        .map(|drill| foundation_drill_title(drill, app.language))
        .unwrap_or_else(|| match app.language {
            Language::Zh => "基础综合".to_string(),
            Language::En => "Foundation mix".to_string(),
        });
    let help = vec![
        Line::from(vec![
            Span::styled(
                text(app.language, "foundation_selected"),
                Style::default()
                    .fg(Color::LightGreen)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::raw(format!("  {selected}")),
        ]),
        Line::from(text(app.language, "foundation_help")),
    ];
    frame.render_widget(
        Paragraph::new(help)
            .block(panel_block(text(app.language, "controls")))
            .wrap(Wrap { trim: false }),
        centered_width(chunks[3], PRACTICE_PANEL_MAX_WIDTH),
    );
}

fn foundation_drill_line(
    selected: bool,
    number: usize,
    drill: &FoundationPracticeDrill,
    language: Language,
) -> Line<'static> {
    let marker = if selected { ">" } else { " " };
    let color = Color::LightGreen;
    let base_style = if selected {
        Style::default()
            .fg(Color::Black)
            .bg(color)
            .add_modifier(Modifier::BOLD)
    } else {
        Style::default().fg(color).add_modifier(Modifier::BOLD)
    };
    let hint_style = if selected {
        Style::default().fg(Color::Black).bg(color)
    } else {
        Style::default().fg(Color::Gray)
    };

    Line::from(vec![
        Span::styled(format!("{marker} {number}. "), base_style),
        Span::styled(foundation_drill_title(drill, language), base_style),
        Span::styled("  ".to_string(), hint_style),
        Span::styled(foundation_drill_hint(drill, language), hint_style),
        Span::styled(
            foundation_item_count(drill.items.len(), language),
            hint_style,
        ),
    ])
}

fn lesson_reason(lesson: &PracticeLesson, language: Language) -> String {
    let reason = match language {
        Language::Zh => lesson.reason_zh.clone(),
        Language::En => lesson.reason_en.clone(),
    };
    if reason.trim().is_empty() {
        lesson_purpose(lesson.kind, language).to_string()
    } else {
        reason
    }
}

fn foundation_drill_title(drill: &FoundationPracticeDrill, language: Language) -> String {
    match language {
        Language::Zh => drill.title_zh.clone(),
        Language::En => drill.title_en.clone(),
    }
}

fn foundation_drill_hint(drill: &FoundationPracticeDrill, language: Language) -> String {
    match language {
        Language::Zh => drill.hint_zh.clone(),
        Language::En => drill.hint_en.clone(),
    }
}

fn foundation_item_count(count: usize, language: Language) -> String {
    match language {
        Language::Zh => format!("  {count} 组"),
        Language::En if count == 1 => "  1 group".to_string(),
        Language::En => format!("  {count} groups"),
    }
}

fn render_everyday_setup(frame: &mut Frame, area: Rect, app: &App) {
    let lines = everyday_setup_lines(app);
    render_simple_setup(
        frame,
        area,
        app,
        text(app.language, "everyday_title"),
        text(app.language, "everyday_help"),
        lines,
    );
}

fn render_programming_setup(frame: &mut Frame, area: Rect, app: &App) {
    let lines = programming_setup_lines(app);
    render_simple_setup(
        frame,
        area,
        app,
        text(app.language, "programming_title"),
        text(app.language, "programming_help"),
        lines,
    );
}

fn render_simple_setup(
    frame: &mut Frame,
    area: Rect,
    app: &App,
    title: &'static str,
    help_text: &'static str,
    lines: Vec<Line<'static>>,
) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([
            Constraint::Length(4),
            Constraint::Length(4),
            Constraint::Min(10),
            Constraint::Length(3),
        ])
        .split(area);

    render_header(
        frame,
        centered_width(chunks[0], PRACTICE_PANEL_MAX_WIDTH),
        app,
        None,
    );
    render_daily_progress(
        frame,
        centered_width(chunks[1], PRACTICE_PANEL_MAX_WIDTH),
        app,
    );
    frame.render_widget(
        Paragraph::new(lines)
            .block(panel_block(title))
            .wrap(Wrap { trim: false }),
        centered_width(chunks[2], PRACTICE_PANEL_MAX_WIDTH),
    );
    frame.render_widget(
        Paragraph::new(vec![Line::from(help_text)])
            .block(panel_block(text(app.language, "controls")))
            .wrap(Wrap { trim: false }),
        centered_width(chunks[3], PRACTICE_PANEL_MAX_WIDTH),
    );
}

fn everyday_setup_lines(app: &App) -> Vec<Line<'static>> {
    let word_count = app.preferences.everyday_english.word_count;
    let sentence_length = sentence_length_label(
        app.preferences.everyday_english.sentence_length,
        app.language,
    );
    let labels = match app.language {
        Language::Zh => vec![
            format!("常见 500 词  本组 {word_count} 词"),
            format!("常见 1000 词  本组 {word_count} 词"),
            format!("常见 5000 词  本组 {word_count} 词"),
            format!("日常句子  长度 {sentence_length}"),
            format!("日常综合  {word_count} 词 / 句子 {sentence_length}"),
        ],
        Language::En => vec![
            format!("Top 500 words  {word_count} words"),
            format!("Top 1000 words  {word_count} words"),
            format!("Top 5000 words  {word_count} words"),
            format!("Everyday sentences  {sentence_length}"),
            format!("Everyday mix  {word_count} words / {sentence_length} sentences"),
        ],
    };
    labels
        .iter()
        .enumerate()
        .map(|(index, label)| {
            setup_line(index == app.everyday_index, index + 1, label, Color::Green)
        })
        .collect()
}

fn sentence_length_label(
    length: crate::model::EverydaySentenceLength,
    language: Language,
) -> &'static str {
    match language {
        Language::Zh => match length {
            crate::model::EverydaySentenceLength::Short => "短",
            crate::model::EverydaySentenceLength::Medium => "中",
            crate::model::EverydaySentenceLength::Long => "长",
            crate::model::EverydaySentenceLength::Mixed => "混合",
        },
        Language::En => match length {
            crate::model::EverydaySentenceLength::Short => "short",
            crate::model::EverydaySentenceLength::Medium => "medium",
            crate::model::EverydaySentenceLength::Long => "long",
            crate::model::EverydaySentenceLength::Mixed => "mixed",
        },
    }
}

fn programming_setup_lines(app: &App) -> Vec<Line<'static>> {
    let labels = match app.language {
        Language::Zh => [
            "数字和符号",
            "操作符、括号和引号",
            "命名和驼峰",
            "技术词",
            "编程基础综合",
        ],
        Language::En => [
            "Numbers and symbols",
            "Operators, brackets, and quotes",
            "Naming and case",
            "Technical terms",
            "Programming basics mix",
        ],
    };
    labels
        .iter()
        .enumerate()
        .map(|(index, label)| {
            setup_line(
                index == app.programming_index,
                index + 1,
                label,
                Color::Yellow,
            )
        })
        .collect()
}

fn setup_line(selected: bool, number: usize, label: &str, color: Color) -> Line<'static> {
    let marker = if selected { ">" } else { " " };
    let style = if selected {
        Style::default()
            .fg(Color::Black)
            .bg(color)
            .add_modifier(Modifier::BOLD)
    } else {
        Style::default().fg(color).add_modifier(Modifier::BOLD)
    };
    Line::from(vec![Span::styled(
        format!("{marker} {number}. {label}"),
        style,
    )])
}

fn render_code_setup(frame: &mut Frame, area: Rect, app: &App) {
    render_simple_setup(
        frame,
        area,
        app,
        text(app.language, "code_setup_title"),
        text(app.language, "code_setup_help"),
        code_level_lines(app),
    );
}

fn render_settings(frame: &mut Frame, area: Rect, app: &App) {
    render_simple_setup(
        frame,
        area,
        app,
        text(app.language, "settings_title"),
        text(app.language, "settings_menu_help"),
        settings_menu_lines(app),
    );
}

fn settings_menu_lines(app: &App) -> Vec<Line<'static>> {
    let labels = match app.language {
        Language::Zh => ["界面语言设置", "编程语言设置"],
        Language::En => ["Interface language", "Programming language scope"],
    };
    labels
        .iter()
        .enumerate()
        .map(|(index, label)| {
            setup_line(
                index == app.settings_index,
                index + 1,
                label,
                Color::LightYellow,
            )
        })
        .collect()
}

fn render_language_settings(frame: &mut Frame, area: Rect, app: &App) {
    render_simple_setup(
        frame,
        area,
        app,
        text(app.language, "language_settings_title"),
        text(app.language, "language_settings_help"),
        language_settings_lines(app),
    );
}

fn language_settings_lines(app: &App) -> Vec<Line<'static>> {
    let labels = match app.language {
        Language::Zh => ["中文", "English"],
        Language::En => ["Chinese", "English"],
    };
    labels
        .iter()
        .enumerate()
        .map(|(index, label)| {
            let current = if index == usize::from(app.language == Language::En) {
                match app.language {
                    Language::Zh => "  当前",
                    Language::En => "  current",
                }
            } else {
                ""
            };
            setup_line(
                index == app.language_setting_index,
                index + 1,
                &format!("{label}{current}"),
                Color::LightYellow,
            )
        })
        .collect()
}

fn render_code_filter_settings(frame: &mut Frame, area: Rect, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([
            Constraint::Length(4),
            Constraint::Length(4),
            Constraint::Min(10),
            Constraint::Length(4),
        ])
        .split(area);

    render_header(
        frame,
        centered_width(chunks[0], PRACTICE_PANEL_MAX_WIDTH),
        app,
        None,
    );
    render_daily_progress(
        frame,
        centered_width(chunks[1], PRACTICE_PANEL_MAX_WIDTH),
        app,
    );

    let options_area = centered_width(chunks[2], PRACTICE_PANEL_MAX_WIDTH);
    let mut lines = Vec::new();
    let visible_rows = options_area
        .height
        .saturating_sub(2 + lines.len() as u16)
        .max(1) as usize;
    let active_filter_index = app.code_filter_index;
    let (start, end) = visible_window(active_filter_index, app.code_options.len(), visible_rows);
    if app.code_options.is_empty() {
        lines.push(Line::from(text(app.language, "code_setup_empty")));
    } else {
        for index in start..end {
            let option = &app.code_options[index];
            let selected = app.code_selected.get(index).copied().unwrap_or(false);
            lines.push(code_option_line(
                index == active_filter_index,
                selected,
                code_filter_is_pinned(&app.preferences, &CodeFilterPreference::from_option(option)),
                option,
                app.language,
            ));
        }
    }

    frame.render_widget(
        Paragraph::new(lines)
            .block(panel_block(text(
                app.language,
                "code_filter_settings_title",
            )))
            .wrap(Wrap { trim: false }),
        options_area,
    );

    let selected = app.selected_code_labels();
    let summary = if selected.is_empty() {
        text(app.language, "code_setup_all").to_string()
    } else {
        selected.into_iter().take(8).collect::<Vec<_>>().join(", ")
    };
    let help = vec![
        Line::from(vec![
            Span::styled(
                text(app.language, "code_setup_selected"),
                Style::default()
                    .fg(Color::LightMagenta)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::raw(format!("  {summary}")),
        ]),
        Line::from(text(app.language, "code_filter_settings_help")),
    ];
    frame.render_widget(
        Paragraph::new(help)
            .block(panel_block(text(app.language, "controls")))
            .wrap(Wrap { trim: false }),
        centered_width(chunks[3], PRACTICE_PANEL_MAX_WIDTH),
    );
}

fn code_level_lines(app: &App) -> Vec<Line<'static>> {
    let labels = match app.language {
        Language::Zh => ["代码块", "函数块", "文件片段", "随机综合"],
        Language::En => ["Code blocks", "Functions", "File fragments", "Random mix"],
    };
    labels
        .iter()
        .enumerate()
        .map(|(index, label)| {
            setup_line(
                app.code_level_index == index,
                index + 1,
                label,
                Color::LightMagenta,
            )
        })
        .collect()
}

fn code_option_line(
    active: bool,
    selected: bool,
    pinned: bool,
    option: &CodePracticeOption,
    language: Language,
) -> Line<'static> {
    let marker = if active { ">" } else { " " };
    let checkbox = if selected { "[x]" } else { "[ ]" };
    let pin_marker = if pinned { "*" } else { " " };
    let color = match option.facet {
        CodePracticeFacet::Language => Color::Cyan,
        CodePracticeFacet::Framework => Color::LightGreen,
        CodePracticeFacet::Project => Color::Yellow,
    };
    let base_style = if active {
        Style::default()
            .fg(Color::Black)
            .bg(color)
            .add_modifier(Modifier::BOLD)
    } else {
        Style::default().fg(color)
    };
    let subtle_style = if active {
        Style::default().fg(Color::Black).bg(color)
    } else {
        Style::default().fg(Color::Gray)
    };

    Line::from(vec![
        Span::styled(format!("{marker} {checkbox}{pin_marker} "), base_style),
        Span::styled(code_facet_label(option.facet, language), base_style),
        Span::styled("  ".to_string(), subtle_style),
        Span::styled(option.value.clone(), base_style),
        Span::styled(
            match language {
                Language::Zh => format!("  {} 组", option.count),
                Language::En => format!("  {} snippets", option.count),
            },
            subtle_style,
        ),
    ])
}

fn code_facet_label(facet: CodePracticeFacet, language: Language) -> &'static str {
    match language {
        Language::Zh => match facet {
            CodePracticeFacet::Language => "语言",
            CodePracticeFacet::Framework => "框架",
            CodePracticeFacet::Project => "项目",
        },
        Language::En => match facet {
            CodePracticeFacet::Language => "language",
            CodePracticeFacet::Framework => "framework",
            CodePracticeFacet::Project => "project",
        },
    }
}

fn render_stats(frame: &mut Frame, area: Rect, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([
            Constraint::Length(4),
            Constraint::Length(3),
            Constraint::Min(8),
            Constraint::Length(3),
        ])
        .split(area);

    render_header(
        frame,
        centered_width(chunks[0], PRACTICE_PANEL_MAX_WIDTH),
        app,
        None,
    );

    let records = app.all_records();
    frame.render_widget(
        Paragraph::new(stats_tab_lines(app)).block(panel_block(text(app.language, "stats_tabs"))),
        centered_width(chunks[1], PRACTICE_PANEL_MAX_WIDTH),
    );

    let body = centered_width(chunks[2], PRACTICE_PANEL_MAX_WIDTH);
    match app.stats_view {
        StatsView::Overview => {
            let max_lines = body.height.saturating_sub(2) as usize;
            frame.render_widget(
                Paragraph::new(stats_dashboard_lines(&records, max_lines, app.language))
                    .block(panel_block(text(app.language, "stats_dashboard"))),
                body,
            );
        }
        StatsView::Today => {
            let max_lines = body.height.saturating_sub(2) as usize;
            frame.render_widget(
                Paragraph::new(stats_today_lines(&records, max_lines, app.language))
                    .block(panel_block(stats_view_title(app.stats_view, app.language))),
                body,
            );
        }
        StatsView::Comprehensive => {
            let max_lines = body.height.saturating_sub(2) as usize;
            frame.render_widget(
                Paragraph::new(stats_comprehensive_lines(&records, max_lines, app.language))
                    .block(panel_block(stats_view_title(app.stats_view, app.language))),
                body,
            );
        }
        StatsView::Modules => {
            let max_lines = body.height.saturating_sub(2) as usize;
            frame.render_widget(
                Paragraph::new(stats_module_lines(&records, max_lines, app.language))
                    .block(panel_block(stats_view_title(app.stats_view, app.language))),
                body,
            );
        }
        StatsView::Keys => {
            let max_lines = body.height.saturating_sub(2) as usize;
            frame.render_widget(
                Paragraph::new(key_stats_lines(
                    &app.key_aggregates,
                    app.key_stats_sort,
                    max_lines,
                    app.language,
                ))
                .block(panel_block(stats_view_title(app.stats_view, app.language))),
                body,
            );
        }
        StatsView::Tokens => {
            let max_lines = body.height.saturating_sub(2) as usize;
            frame.render_widget(
                Paragraph::new(stats_token_lines(&records, max_lines, app.language))
                    .block(panel_block(stats_view_title(app.stats_view, app.language))),
                body,
            );
        }
        StatsView::Code => {
            let max_lines = body.height.saturating_sub(2) as usize;
            frame.render_widget(
                Paragraph::new(stats_code_lines(&records, max_lines, app.language))
                    .block(panel_block(stats_view_title(app.stats_view, app.language))),
                body,
            );
        }
        StatsView::Daily => {
            let dates = stats_dates_from_records(&records);
            let detail_lines = if let Some(date) = dates.get(app.stats_day_index).copied() {
                let day_records = records_for_date(&records, date);
                let max_sessions = body.height.saturating_sub(9) as usize;
                stats_day_lines(
                    date,
                    app.stats_day_index,
                    dates.len(),
                    &day_records,
                    max_sessions,
                    app.language,
                )
            } else {
                vec![Line::from(text(app.language, "stats_empty"))]
            };
            frame.render_widget(
                Paragraph::new(detail_lines)
                    .block(panel_block(text(app.language, "stats_details"))),
                body,
            );
        }
    }

    frame.render_widget(
        Paragraph::new(stats_help_text(app))
            .block(panel_block(text(app.language, "controls")))
            .wrap(Wrap { trim: false }),
        centered_width(chunks[3], PRACTICE_PANEL_MAX_WIDTH),
    );
}

fn stats_tab_lines(app: &App) -> Line<'static> {
    let active_style = Style::default()
        .fg(Color::Black)
        .bg(Color::Cyan)
        .add_modifier(Modifier::BOLD);
    let inactive_style = Style::default().fg(Color::Indexed(250));
    let views = [
        StatsView::Overview,
        StatsView::Today,
        StatsView::Comprehensive,
        StatsView::Modules,
        StatsView::Keys,
        StatsView::Tokens,
        StatsView::Code,
        StatsView::Daily,
    ];
    let mut spans = Vec::new();
    for (index, view) in views.iter().copied().enumerate() {
        if index > 0 {
            spans.push(Span::raw(" "));
        }
        spans.push(Span::styled(
            format!(" {} {} ", index + 1, stats_view_title(view, app.language)),
            if app.stats_view == view {
                active_style
            } else {
                inactive_style
            },
        ));
    }
    spans.push(Span::raw(match app.language {
        Language::Zh => "  Tab 切换",
        Language::En => "  Tab cycles",
    }));
    Line::from(spans)
}

fn stats_view_title(view: StatsView, language: Language) -> &'static str {
    match (language, view) {
        (Language::Zh, StatsView::Overview) => "总览",
        (Language::Zh, StatsView::Today) => "今日",
        (Language::Zh, StatsView::Comprehensive) => "综合",
        (Language::Zh, StatsView::Modules) => "模块",
        (Language::Zh, StatsView::Keys) => "键位",
        (Language::Zh, StatsView::Tokens) => "Token",
        (Language::Zh, StatsView::Code) => "代码",
        (Language::Zh, StatsView::Daily) => "每日",
        (Language::En, StatsView::Overview) => "Overview",
        (Language::En, StatsView::Today) => "Today",
        (Language::En, StatsView::Comprehensive) => "Full practice",
        (Language::En, StatsView::Modules) => "Modules",
        (Language::En, StatsView::Keys) => "Keys",
        (Language::En, StatsView::Tokens) => "Tokens",
        (Language::En, StatsView::Code) => "Code",
        (Language::En, StatsView::Daily) => "Daily",
    }
}

fn stats_help_text(app: &App) -> String {
    match (app.language, app.stats_view) {
        (Language::Zh, StatsView::Keys) => {
            format!(
                "1-8 页面 | S 排序：{} | Esc 返回 | Q 退出",
                app.key_stats_sort.label(app.language)
            )
        }
        (Language::Zh, StatsView::Daily) => {
            "1-8 页面 | ←/→ 日期 | Home/End 首尾 | Esc 返回 | Q 退出".to_string()
        }
        (Language::Zh, _) => "1-8 页面 | Tab 切换 | Esc 返回 | Q 退出".to_string(),
        (Language::En, StatsView::Keys) => {
            format!(
                "1-8 pages | S sort: {} | Esc menu | Q quit",
                app.key_stats_sort.label(app.language)
            )
        }
        (Language::En, StatsView::Daily) => {
            "1-8 pages | Left/Right date | Home/End ends | Esc menu | Q quit".to_string()
        }
        (Language::En, _) => "1-8 pages | Tab cycle | Esc menu | Q quit".to_string(),
    }
}

fn render_running(frame: &mut Frame, area: Rect, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([
            Constraint::Length(4),
            Constraint::Length(3),
            Constraint::Length(4),
            Constraint::Length(4),
            Constraint::Min(5),
            Constraint::Length(3),
        ])
        .split(area);

    render_header(
        frame,
        centered_width(chunks[0], PRACTICE_PANEL_MAX_WIDTH),
        app,
        app.target.as_ref(),
    );
    render_lesson_banner(
        frame,
        centered_width(chunks[1], PRACTICE_PANEL_MAX_WIDTH),
        app,
    );
    render_running_context(
        frame,
        centered_width(chunks[2], PRACTICE_PANEL_MAX_WIDTH),
        app,
    );
    if app.exit_confirm {
        render_exit_confirmation(
            frame,
            centered_width(chunks[3], PRACTICE_PANEL_MAX_WIDTH),
            app.language,
        );
    } else if app.is_paused() {
        render_pause(
            frame,
            centered_width(chunks[3], PRACTICE_PANEL_MAX_WIDTH),
            app.language,
        );
    } else {
        render_metrics(
            frame,
            centered_width(chunks[3], PRACTICE_PANEL_MAX_WIDTH),
            &app.target_chars,
            &app.input,
            &app.events,
            app.active_elapsed().unwrap_or_default(),
            app.language,
        );
    }
    let show_word_meanings = target_shows_word_meanings(app);
    render_target(
        frame,
        centered_width(chunks[4], PRACTICE_PANEL_MAX_WIDTH),
        &app.target_chars,
        &app.input,
        app.language,
        show_word_meanings,
    );
    render_progress(
        frame,
        centered_width(chunks[5], PRACTICE_PANEL_MAX_WIDTH),
        &app.target_chars,
        &app.input,
        app.language,
    );
}

fn render_complete(frame: &mut Frame, area: Rect, app: &App) {
    if app.completed_records.is_empty() {
        render_plan(frame, area, app);
        return;
    }

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([
            Constraint::Length(4),
            Constraint::Min(8),
            Constraint::Length(8),
            Constraint::Length(3),
        ])
        .split(area);

    render_header(
        frame,
        centered_width(chunks[0], PRACTICE_PANEL_MAX_WIDTH),
        app,
        app.target.as_ref(),
    );
    render_target(
        frame,
        centered_width(chunks[1], PRACTICE_PANEL_MAX_WIDTH),
        &app.target_chars,
        &app.input,
        app.language,
        false,
    );

    let record = app.completed_records.last().expect("record exists");
    let slow = record
        .slow_tokens
        .iter()
        .take(6)
        .map(|stat| stat.token.as_str())
        .collect::<Vec<_>>()
        .join(", ");
    let next_text = if app.foundation_active {
        text(app.language, "next_foundation_group")
    } else if app.everyday_active {
        text(app.language, "next_everyday_group")
    } else if app.programming_active {
        text(app.language, "next_programming_group")
    } else if app.code_specialist_active {
        text(app.language, "next_code_group")
    } else if app.single_lesson.is_some() || app.lesson_index + 1 >= app.plan.lessons.len() {
        text(app.language, "finish_today")
    } else {
        text(app.language, "next_lesson")
    };
    let slow_line = if slow.is_empty() {
        text(app.language, "slow_focus_empty").to_string()
    } else {
        format!("{}: {slow}", text(app.language, "slow_focus"))
    };
    let save_line = app.save_error.as_ref().map(|error| {
        format!(
            "{}: {error}",
            match app.language {
                Language::Zh => "保存失败",
                Language::En => "Save failed",
            }
        )
    });
    let next_reason = next_step_reason(app);
    let mut summary = vec![
        Line::from(vec![
            Span::styled(
                text(app.language, "session_complete"),
                Style::default()
                    .fg(Color::Green)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::raw(format!("  {next_text}")),
        ]),
        Line::from(format!(
            "WPM {:.1} | {} {:.1} | {} {:.1}% | {} {} | {} {}",
            record.wpm,
            text(app.language, "raw_wpm"),
            record.raw_wpm,
            text(app.language, "accuracy"),
            record.accuracy,
            text(app.language, "errors"),
            record.error_count,
            text(app.language, "backspace"),
            record.backspace_count
        )),
        Line::from(slow_line),
        Line::from(format!(
            "{}: {}",
            text(app.language, "next_reason"),
            next_reason
        )),
        Line::from(text(app.language, "complete_help")),
    ];
    if let Some(save_line) = save_line {
        summary.insert(3, Line::from(save_line));
    }
    frame.render_widget(
        Paragraph::new(summary)
            .block(panel_block(text(app.language, "result_title")))
            .wrap(Wrap { trim: false }),
        centered_width(chunks[2], PRACTICE_PANEL_MAX_WIDTH),
    );
    render_progress(
        frame,
        centered_width(chunks[3], PRACTICE_PANEL_MAX_WIDTH),
        &app.target_chars,
        &app.input,
        app.language,
    );
}

fn next_step_reason(app: &App) -> String {
    if app.foundation_active {
        return match app.language {
            Language::Zh => "继续同一个基础专项，并避开刚练过的行。".to_string(),
            Language::En => {
                "Continue the same foundation drill while avoiding recent lines.".to_string()
            }
        };
    }
    if app.everyday_active {
        return match app.language {
            Language::Zh => "继续当前日常专项，使用当前词数或句长设置。".to_string(),
            Language::En => {
                "Continue the current everyday drill with the selected word count or sentence length."
                    .to_string()
            }
        };
    }
    if app.programming_active {
        return match app.language {
            Language::Zh => "继续当前编程基础专项，保持单项聚焦。".to_string(),
            Language::En => "Continue the current programming basics drill.".to_string(),
        };
    }
    if app.code_specialist_active {
        return match app.language {
            Language::Zh => "继续当前代码筛选范围，并尽量避开刚练过的代码块。".to_string(),
            Language::En => {
                "Continue the current code filter and avoid recently practiced snippets."
                    .to_string()
            }
        };
    }
    if app.single_lesson.is_some() || app.lesson_index + 1 >= app.plan.lessons.len() {
        return match app.language {
            Language::Zh => "本轮已完成，进入今日总结。".to_string(),
            Language::En => "This round is complete; open today summary.".to_string(),
        };
    }
    app.plan
        .lessons
        .get(app.lesson_index + 1)
        .map(|lesson| lesson_reason(lesson, app.language))
        .unwrap_or_else(|| {
            match app.language {
                Language::Zh => "继续今日动态计划。",
                Language::En => "Continue today's adaptive plan.",
            }
            .to_string()
        })
}

fn render_summary(frame: &mut Frame, area: Rect, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([
            Constraint::Length(4),
            Constraint::Length(4),
            Constraint::Min(8),
            Constraint::Length(3),
        ])
        .split(area);

    render_header(
        frame,
        centered_width(chunks[0], PRACTICE_PANEL_MAX_WIDTH),
        app,
        None,
    );
    render_daily_progress(
        frame,
        centered_width(chunks[1], PRACTICE_PANEL_MAX_WIDTH),
        app,
    );

    let mut lines = Vec::new();
    for (index, record) in app.completed_records.iter().enumerate() {
        let lesson_index = app
            .completed_lesson_indices
            .get(index)
            .copied()
            .unwrap_or(index);
        let title = record_summary_title(app, record, lesson_index);
        lines.push(Line::from(format!(
            "{}. {}  WPM {:.1} | {} {:.1}% | {} {}",
            index + 1,
            title,
            record.wpm,
            text(app.language, "accuracy"),
            record.accuracy,
            text(app.language, "errors"),
            record.error_count
        )));
    }
    if lines.is_empty() {
        lines.push(Line::from(text(app.language, "no_completed_lessons")));
    }

    frame.render_widget(
        Paragraph::new(lines)
            .block(panel_block(text(app.language, "today_summary")))
            .wrap(Wrap { trim: false }),
        centered_width(chunks[2], PRACTICE_PANEL_MAX_WIDTH),
    );
    frame.render_widget(
        Paragraph::new(text(app.language, "summary_help"))
            .block(panel_block(text(app.language, "controls"))),
        centered_width(chunks[3], PRACTICE_PANEL_MAX_WIDTH),
    );
}

fn record_summary_title(app: &App, record: &SessionRecord, lesson_index: usize) -> String {
    if let Some(drill_id) = record.source.strip_prefix("keyloop:foundation:")
        && let Some(drill) = app
            .foundation_drills
            .iter()
            .find(|drill| drill.id == drill_id)
    {
        return foundation_drill_title(drill, app.language);
    }

    app.plan
        .lessons
        .get(lesson_index)
        .map(|lesson| lesson_title(lesson.kind, app.language).to_string())
        .unwrap_or_else(|| text(app.language, "lesson").to_string())
}

fn render_header(frame: &mut Frame, area: Rect, app: &App, target: Option<&PracticeTarget>) {
    let source = target
        .map(|target| target.source.as_str())
        .unwrap_or(text(app.language, "not_started"));
    let progress = match app.phase {
        Phase::Menu if app.menu_index == 0 => match app.language {
            Language::Zh => format!(
                "{} {} 组",
                text(app.language, "menu_mode_label"),
                app.plan.lessons.len()
            ),
            Language::En => format!(
                "{} {} lessons",
                text(app.language, "menu_mode_label"),
                app.plan.lessons.len()
            ),
        },
        Phase::Stats => text(app.language, "stats_title").to_string(),
        Phase::FoundationSetup => text(app.language, "menu_foundation").to_string(),
        Phase::EverydaySetup => text(app.language, "menu_everyday").to_string(),
        Phase::ProgrammingSetup => text(app.language, "menu_programming").to_string(),
        Phase::CodeSetup => text(app.language, "menu_code_specialist").to_string(),
        Phase::Settings => text(app.language, "menu_settings").to_string(),
        Phase::InterfaceLanguageSettings => {
            text(app.language, "language_settings_title").to_string()
        }
        Phase::CodeFilterSettings => text(app.language, "code_filter_settings_title").to_string(),
        Phase::Menu if app.menu_index == app.foundation_menu_index() => {
            text(app.language, "menu_foundation").to_string()
        }
        Phase::Menu if app.menu_index == app.everyday_menu_index() => {
            text(app.language, "menu_everyday").to_string()
        }
        Phase::Menu if app.menu_index == app.programming_menu_index() => {
            text(app.language, "menu_programming").to_string()
        }
        Phase::Menu if app.menu_index == app.code_specialist_menu_index() => {
            text(app.language, "menu_code_specialist").to_string()
        }
        Phase::Menu if app.menu_index == app.settings_menu_index() => {
            text(app.language, "menu_settings").to_string()
        }
        Phase::Menu if app.menu_index == app.stats_menu_index() => {
            text(app.language, "stats_title").to_string()
        }
        Phase::Menu => text(app.language, "practice_menu").to_string(),
        _ if app.foundation_active => match app.language {
            Language::Zh => format!("基础第 {} 组", app.foundation_group_count.max(1)),
            Language::En => format!("foundation group {}", app.foundation_group_count.max(1)),
        },
        _ if app.everyday_active => match app.language {
            Language::Zh => format!("日常第 {} 组", app.everyday_group_count.max(1)),
            Language::En => format!("everyday group {}", app.everyday_group_count.max(1)),
        },
        _ if app.programming_active => match app.language {
            Language::Zh => format!("编程基础第 {} 组", app.programming_group_count.max(1)),
            Language::En => format!(
                "programming basics group {}",
                app.programming_group_count.max(1)
            ),
        },
        _ => format!(
            "{} {}/{}",
            text(app.language, "lesson_progress"),
            app.lesson_index.min(app.plan.lessons.len()) + 1,
            app.plan.lessons.len()
        ),
    };
    let title = Line::from(vec![
        Span::styled(
            "KeyLoop",
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
        ),
        Span::raw("  "),
        Span::styled(progress, Style::default().fg(Color::Yellow)),
        Span::raw("  "),
        Span::styled(
            format!(
                "{}: {}",
                text(app.language, "source_label"),
                truncate(source, 48)
            ),
            Style::default().fg(Color::Gray),
        ),
    ]);
    let mut help = vec![
        Span::styled("Esc", Style::default().fg(Color::Yellow)),
        Span::raw(format!(
            " {}  ",
            if app.phase == Phase::Running {
                running_help(app.language, app.is_paused(), app.exit_confirm)
            } else {
                text(app.language, "esc_help")
            }
        )),
        Span::styled(
            text(app.language, "ime_help"),
            Style::default().fg(Color::Gray),
        ),
    ];
    if app.ignored_non_ascii > 0 {
        help.push(Span::raw("  "));
        help.push(Span::styled(
            format!(
                "{}: {}",
                text(app.language, "ignored_non_ascii"),
                app.ignored_non_ascii
            ),
            Style::default().fg(Color::Red),
        ));
    }
    frame.render_widget(
        Paragraph::new(vec![title, Line::from(help)])
            .block(panel_block(text(app.language, "status_title"))),
        area,
    );
}

fn render_daily_progress(frame: &mut Frame, area: Rect, app: &App) {
    let completed_ms = app.completed_today_ms();
    let target_ms = u64::from(app.target_minutes()) * 60_000;
    let completed = format_practice_minutes(completed_ms);
    let target = app.target_minutes();
    let status = if completed_ms >= target_ms {
        let over = completed_ms.saturating_sub(target_ms);
        match app.language {
            Language::Zh => format!("已达成，超过 {} min", format_practice_minutes(over)),
            Language::En => format!("done, {} min over", format_practice_minutes(over)),
        }
    } else {
        let remaining = target_ms.saturating_sub(completed_ms);
        match app.language {
            Language::Zh => format!("还差 {} min", format_practice_minutes(remaining)),
            Language::En => format!("{} min remaining", format_practice_minutes(remaining)),
        }
    };
    let line = Line::from(vec![
        Span::styled(
            text(app.language, "daily_target"),
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
        ),
        Span::raw(format!("  {completed} / {target} min  |  ")),
        Span::styled(
            status,
            Style::default().fg(if completed_ms >= target_ms {
                Color::Green
            } else {
                Color::Yellow
            }),
        ),
    ]);

    frame.render_widget(
        Paragraph::new(vec![
            line,
            Line::from(text(app.language, "daily_goal_hint")),
        ])
        .block(panel_block(text(app.language, "daily_progress")))
        .wrap(Wrap { trim: false }),
        area,
    );
}

fn render_lesson_banner(frame: &mut Frame, area: Rect, app: &App) {
    if app.foundation_active {
        let Some(drill) = app.foundation_drills.get(app.foundation_index) else {
            return;
        };
        let line = Line::from(vec![
            Span::styled(
                foundation_drill_title(drill, app.language),
                Style::default()
                    .fg(Color::LightGreen)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::raw("  "),
            Span::styled(
                format!(
                    "{} {}",
                    text(app.language, "lesson"),
                    app.foundation_group_count.max(1)
                ),
                Style::default().fg(Color::Gray),
            ),
        ]);
        frame.render_widget(
            Paragraph::new(vec![line]).block(panel_block(text(app.language, "current_lesson"))),
            area,
        );
        return;
    }

    let Some(lesson) = app.current_lesson() else {
        return;
    };
    let line = Line::from(vec![
        Span::styled(
            lesson_title(lesson.kind, app.language),
            Style::default()
                .fg(lesson_color(lesson.kind))
                .add_modifier(Modifier::BOLD),
        ),
        Span::raw("  "),
        Span::styled(
            format!(
                "{} {}/{}",
                text(app.language, "lesson_progress"),
                app.lesson_index.min(app.plan.lessons.len()) + 1,
                app.plan.lessons.len()
            ),
            Style::default().fg(Color::Gray),
        ),
    ]);
    frame.render_widget(
        Paragraph::new(vec![line]).block(panel_block(text(app.language, "current_lesson"))),
        area,
    );
}

fn render_lesson_diagnosis(frame: &mut Frame, area: Rect, app: &App) {
    frame.render_widget(
        Paragraph::new(current_diagnosis(app))
            .block(analysis_block(text(app.language, "diagnosis_title")))
            .wrap(Wrap { trim: false }),
        area,
    );
}

fn render_running_context(frame: &mut Frame, area: Rect, app: &App) {
    if app.everyday_active {
        render_everyday_running_context(frame, area, app);
    } else {
        render_lesson_diagnosis(frame, area, app);
    }
}

fn render_everyday_running_context(frame: &mut Frame, area: Rect, app: &App) {
    let Some(target) = app.target.as_ref() else {
        return;
    };
    let title = match app.language {
        Language::Zh => "当前练习",
        Language::En => "Current practice",
    };
    let settings = everyday_running_settings_line(app, target);
    let switch_hint = match (app.language, app.everyday_index == 3) {
        (Language::Zh, true) => "←/→ 切换句长并立即刷新",
        (Language::Zh, false) => "←/→ 切换词数并立即刷新",
        (Language::En, true) => "Left/Right switches sentence length and refreshes",
        (Language::En, false) => "Left/Right switches word count and refreshes",
    };

    frame.render_widget(
        Paragraph::new(vec![Line::from(settings), Line::from(switch_hint)])
            .block(panel_block(title))
            .wrap(Wrap { trim: false }),
        area,
    );
}

fn everyday_running_settings_line(app: &App, target: &PracticeTarget) -> String {
    let target_chars = target.text.chars().count();
    let target_words = target.text.split_whitespace().count();
    match app.language {
        Language::Zh => {
            let scope = everyday_scope_label(app);
            if app.everyday_index == 3 {
                format!(
                    "{scope}  句长 {}  目标 {} 句 / {target_chars} 字符",
                    sentence_length_label(
                        app.preferences.everyday_english.sentence_length,
                        app.language
                    ),
                    target
                        .text
                        .lines()
                        .filter(|line| !line.trim().is_empty())
                        .count()
                )
            } else {
                format!(
                    "{scope}  本组 {} 词  目标 {target_words} 词 / {target_chars} 字符",
                    app.preferences.everyday_english.word_count
                )
            }
        }
        Language::En => {
            let scope = everyday_scope_label(app);
            if app.everyday_index == 3 {
                format!(
                    "{scope}  length {}  target {} sentences / {target_chars} chars",
                    sentence_length_label(
                        app.preferences.everyday_english.sentence_length,
                        app.language
                    ),
                    target
                        .text
                        .lines()
                        .filter(|line| !line.trim().is_empty())
                        .count()
                )
            } else {
                format!(
                    "{scope}  group {} words  target {target_words} words / {target_chars} chars",
                    app.preferences.everyday_english.word_count
                )
            }
        }
    }
}

fn everyday_scope_label(app: &App) -> &'static str {
    match (app.language, app.selected_everyday_scope()) {
        (Language::Zh, EverydayPracticeScope::Common500) => "常见 500 词",
        (Language::Zh, EverydayPracticeScope::Common1000) => "常见 1000 词",
        (Language::Zh, EverydayPracticeScope::Common5000) => "常见 5000 词",
        (Language::Zh, EverydayPracticeScope::Sentences) => "日常句子",
        (Language::Zh, EverydayPracticeScope::Mix) => "日常综合",
        (Language::En, EverydayPracticeScope::Common500) => "Top 500 words",
        (Language::En, EverydayPracticeScope::Common1000) => "Top 1000 words",
        (Language::En, EverydayPracticeScope::Common5000) => "Top 5000 words",
        (Language::En, EverydayPracticeScope::Sentences) => "Everyday sentences",
        (Language::En, EverydayPracticeScope::Mix) => "Everyday mix",
    }
}

fn current_diagnosis(app: &App) -> String {
    if app.foundation_active {
        return app
            .foundation_drills
            .get(app.foundation_index)
            .map(|drill| foundation_drill_hint(drill, app.language).to_string())
            .unwrap_or_else(|| text(app.language, "diagnosis_empty").to_string());
    }
    if app.code_specialist_active {
        let selected = app.selected_code_labels();
        if selected.is_empty() {
            return match app.language {
                Language::Zh => {
                    "代码实战使用全部内置代码语料，并尽量避开最近练过的代码块。".to_string()
                }
                Language::En => {
                    "Code practice uses the full corpus and avoids recently practiced snippets."
                        .to_string()
                }
            };
        }
        let scope = selected.into_iter().take(6).collect::<Vec<_>>().join(", ");
        return match app.language {
            Language::Zh => {
                format!("代码实战范围：{scope}。会连续生成新代码块，并避开最近练过的内容。")
            }
            Language::En => {
                format!(
                    "Code practice scope: {scope}. New groups avoid recently practiced snippets."
                )
            }
        };
    }
    app.current_lesson()
        .map(|lesson| lesson_reason(lesson, app.language))
        .unwrap_or_else(|| text(app.language, "diagnosis_empty").to_string())
}

fn render_target(
    frame: &mut Frame,
    area: Rect,
    target_chars: &[char],
    input: &[char],
    language: Language,
    show_word_meanings: bool,
) {
    let block = panel_block(text(language, "ghost_title"));
    let inner = block.inner(area);
    frame.render_widget(block, area);

    let inner_width = inner.width.max(1) as usize;
    let inner_height = inner.height.max(1);
    let wrapped = if show_word_meanings {
        word_meaning_target_lines(target_chars, input, inner_width)
            .unwrap_or_else(|| target_lines(target_chars, input, inner_width))
    } else {
        target_lines(target_chars, input, inner_width)
    };
    let scroll = scroll_offset(wrapped.current_line, wrapped.lines.len(), inner_height);

    let paragraph = Paragraph::new(Text::from(wrapped.lines))
        .style(Style::default().fg(Color::Reset).bg(Color::Reset))
        .scroll((scroll, 0));
    frame.render_widget(paragraph, inner);
}

fn target_shows_word_meanings(app: &App) -> bool {
    app.everyday_active
        && matches!(
            app.selected_everyday_scope(),
            EverydayPracticeScope::Common500
                | EverydayPracticeScope::Common1000
                | EverydayPracticeScope::Common5000
        )
}

fn render_metrics(
    frame: &mut Frame,
    area: Rect,
    target_chars: &[char],
    input: &[char],
    events: &[KeyEventRecord],
    elapsed: Duration,
    language: Language,
) {
    let metrics = live_metrics(target_chars, input, events, elapsed);
    let metric_line = Line::from(vec![
        Span::styled(
            format!("WPM {:.1}", metrics.wpm),
            Style::default()
                .fg(Color::Green)
                .add_modifier(Modifier::BOLD),
        ),
        Span::raw("  "),
        Span::styled(
            format!("{} {:.1}", text(language, "raw_wpm"), metrics.raw_wpm),
            Style::default().fg(Color::Gray),
        ),
        Span::raw("  "),
        Span::styled(
            format!("{} {:.1}%", text(language, "accuracy"), metrics.accuracy),
            Style::default().fg(if metrics.accuracy >= 95.0 {
                Color::Green
            } else {
                Color::Yellow
            }),
        ),
        Span::raw("  "),
        Span::styled(
            format!("{} {}", text(language, "errors"), metrics.errors),
            Style::default().fg(Color::Red),
        ),
        Span::raw("  "),
        Span::styled(
            format!("{} {}", text(language, "backspace"), metrics.backspaces),
            Style::default().fg(Color::Yellow),
        ),
    ]);
    frame.render_widget(
        Paragraph::new(vec![metric_line]).block(panel_block(text(language, "metrics_title"))),
        area,
    );
}

fn render_pause(frame: &mut Frame, area: Rect, language: Language) {
    let lines = match language {
        Language::Zh => vec![
            Line::from(vec![
                Span::styled(
                    "已暂停",
                    Style::default()
                        .fg(Color::Yellow)
                        .add_modifier(Modifier::BOLD),
                ),
                Span::raw("  计时已停止，当前输入会保留。"),
            ]),
            Line::from("Ctrl+P/Enter/Space 继续 | Esc 退出选项"),
        ],
        Language::En => vec![
            Line::from(vec![
                Span::styled(
                    "Paused",
                    Style::default()
                        .fg(Color::Yellow)
                        .add_modifier(Modifier::BOLD),
                ),
                Span::raw("  Timer is stopped and current input is kept."),
            ]),
            Line::from("Ctrl+P/Enter/Space resume | Esc exit options"),
        ],
    };

    frame.render_widget(
        Paragraph::new(lines)
            .block(panel_block(match language {
                Language::Zh => "暂停",
                Language::En => "Pause",
            }))
            .wrap(Wrap { trim: false }),
        area,
    );
}

fn render_exit_confirmation(frame: &mut Frame, area: Rect, language: Language) {
    let lines = match language {
        Language::Zh => vec![
            Line::from(vec![
                Span::styled(
                    "已暂停",
                    Style::default()
                        .fg(Color::Yellow)
                        .add_modifier(Modifier::BOLD),
                ),
                Span::raw("  你的输入还在，没有丢。"),
            ]),
            Line::from(
                "Enter/Space/Esc 继续 | S 保存当前进度并退出 | M 返回菜单不保存 | Q 退出不保存",
            ),
        ],
        Language::En => vec![
            Line::from(vec![
                Span::styled(
                    "Paused",
                    Style::default()
                        .fg(Color::Yellow)
                        .add_modifier(Modifier::BOLD),
                ),
                Span::raw("  Your current input is still here."),
            ]),
            Line::from(
                "Enter/Space/Esc resume | S save partial and exit | M menu without saving | Q quit without saving",
            ),
        ],
    };

    frame.render_widget(
        Paragraph::new(lines)
            .block(panel_block(match language {
                Language::Zh => "退出确认",
                Language::En => "Exit confirmation",
            }))
            .wrap(Wrap { trim: false }),
        area,
    );
}

fn render_progress(
    frame: &mut Frame,
    area: Rect,
    target_chars: &[char],
    input: &[char],
    language: Language,
) {
    let ratio = if target_chars.is_empty() {
        0.0
    } else {
        input.len() as f64 / target_chars.len() as f64
    }
    .clamp(0.0, 1.0);

    let label = format!("{}/{}", input.len(), target_chars.len());
    frame.render_widget(
        Gauge::default()
            .block(panel_block(text(language, "progress_title")))
            .gauge_style(Style::default().fg(Color::Cyan))
            .ratio(ratio)
            .label(label),
        area,
    );
}

fn running_help(language: Language, is_paused: bool, exit_confirm: bool) -> &'static str {
    match (language, is_paused, exit_confirm) {
        (Language::Zh, _, true) => "已暂停，按 Enter/Space/Esc 继续",
        (Language::En, _, true) => "paused, Enter/Space/Esc resumes",
        (Language::Zh, true, false) => "已暂停，Ctrl+P/Enter/Space 继续",
        (Language::En, true, false) => "paused, Ctrl+P/Enter/Space resumes",
        (Language::Zh, false, false) => "Ctrl+P 暂停 | Esc 退出选项",
        (Language::En, false, false) => "Ctrl+P pause | Esc exit options",
    }
}

fn push_char(ch: char, app: &mut App) {
    if app.input.len() >= app.target_chars.len() {
        return;
    }

    let position = app.input.len();
    let expected = app.target_chars.get(position).copied();
    let correct = expected == Some(ch);
    app.input.push(ch);
    let event = KeyEventRecord {
        at_ms: app.active_elapsed_ms().unwrap_or(0),
        action: KeyAction::Insert,
        position,
        expected,
        input: Some(ch),
        correct,
    };
    app.observe_key_event(&event);
    app.events.push(event);
    if correct
        && ch == '\n'
        && matches!(
            app.target.as_ref().map(|target| target.mode),
            Some(Mode::Code)
        )
    {
        auto_insert_code_indent(app);
    }
}

fn auto_insert_code_indent(app: &mut App) {
    while app.input.len() < app.target_chars.len()
        && app.target_chars.get(app.input.len()) == Some(&' ')
    {
        let position = app.input.len();
        app.input.push(' ');
        app.events.push(KeyEventRecord {
            at_ms: app.active_elapsed_ms().unwrap_or(0),
            action: KeyAction::AutoIndent,
            position,
            expected: Some(' '),
            input: Some(' '),
            correct: true,
        });
    }
}

struct WrappedLines {
    lines: Vec<Line<'static>>,
    current_line: usize,
}

#[derive(Clone)]
struct WordMeaningPair {
    meaning: Option<&'static str>,
    start: usize,
    end: usize,
    word_width: usize,
    meaning_width: usize,
    cell_width: usize,
}

struct PlacedWordMeaningPair {
    pair: WordMeaningPair,
    col: usize,
}

fn word_meaning_target_lines(
    target_chars: &[char],
    input: &[char],
    width: usize,
) -> Option<WrappedLines> {
    let pairs = word_meaning_pairs(target_chars)?;
    if !pairs.iter().any(|pair| pair.meaning.is_some()) {
        return None;
    }
    let rows = pack_word_meaning_pairs(pairs, width.max(1));
    if rows.is_empty() {
        return None;
    }

    let cursor = input.len().min(target_chars.len());
    let mut lines = Vec::with_capacity(rows.len() * 2);
    let mut current_line = 0usize;
    for (row_index, row) in rows.iter().enumerate() {
        if row_contains_cursor(row, row_index + 1 == rows.len(), cursor, target_chars.len()) {
            current_line = lines.len();
        }
        lines.push(render_word_meaning_target_row(row, target_chars, input));
        lines.push(render_word_meaning_row(row));
    }

    Some(WrappedLines {
        lines,
        current_line,
    })
}

fn word_meaning_pairs(target_chars: &[char]) -> Option<Vec<WordMeaningPair>> {
    if target_chars.contains(&'\n') {
        return None;
    }
    let mut index = 0usize;
    let mut pairs = Vec::new();
    while index < target_chars.len() {
        while index < target_chars.len() && target_chars[index].is_whitespace() {
            index += 1;
        }
        if index >= target_chars.len() {
            break;
        }
        let start = index;
        let mut word = String::new();
        while index < target_chars.len() && !target_chars[index].is_whitespace() {
            word.push(target_chars[index]);
            index += 1;
        }
        let end = index;
        let meaning = content::everyday_word_meaning(&word);
        let word_width = text_width(&word);
        let meaning_width = meaning.map(text_width).unwrap_or(0);
        pairs.push(WordMeaningPair {
            meaning,
            start,
            end,
            word_width,
            meaning_width,
            cell_width: word_width.max(meaning_width),
        });
    }
    (!pairs.is_empty()).then_some(pairs)
}

fn pack_word_meaning_pairs(
    pairs: Vec<WordMeaningPair>,
    width: usize,
) -> Vec<Vec<PlacedWordMeaningPair>> {
    let mut rows = Vec::new();
    let mut row = Vec::new();
    let mut col = 0usize;

    for pair in pairs {
        let gap = if row.is_empty() { 0 } else { 2 };
        if !row.is_empty() && col + gap + pair.cell_width > width {
            rows.push(row);
            row = Vec::new();
            col = 0;
        }
        let start_col = if row.is_empty() { 0 } else { col + 2 };
        col = start_col + pair.cell_width;
        row.push(PlacedWordMeaningPair {
            pair,
            col: start_col,
        });
    }

    if !row.is_empty() {
        rows.push(row);
    }
    rows
}

fn row_contains_cursor(
    row: &[PlacedWordMeaningPair],
    is_last_row: bool,
    cursor: usize,
    target_len: usize,
) -> bool {
    let Some(first) = row.first() else {
        return false;
    };
    let Some(last) = row.last() else {
        return false;
    };
    let mut row_end = last.pair.end;
    if row_end < target_len {
        row_end += 1;
    }
    (cursor >= first.pair.start && cursor < row_end)
        || (is_last_row && cursor >= first.pair.start && cursor >= target_len)
}

fn render_word_meaning_target_row(
    row: &[PlacedWordMeaningPair],
    target_chars: &[char],
    input: &[char],
) -> Line<'static> {
    let mut spans = Vec::<Span>::new();
    let mut col = 0usize;
    for placed in row {
        push_padding(&mut spans, placed.col.saturating_sub(col));
        col = placed.col;
        for (index, expected) in target_chars
            .iter()
            .copied()
            .enumerate()
            .take(placed.pair.end)
            .skip(placed.pair.start)
        {
            spans.push(styled_target_char(index, expected, input));
        }
        col += placed.pair.word_width;
        if placed.pair.end < target_chars.len() && target_chars[placed.pair.end] == ' ' {
            spans.push(styled_target_char(placed.pair.end, ' ', input));
            col += 1;
        }
    }
    Line::from(spans)
}

fn render_word_meaning_row(row: &[PlacedWordMeaningPair]) -> Line<'static> {
    let mut spans = Vec::<Span>::new();
    let mut col = 0usize;
    for placed in row {
        push_padding(&mut spans, placed.col.saturating_sub(col));
        col = placed.col;
        if let Some(meaning) = placed.pair.meaning {
            spans.push(Span::styled(meaning.to_string(), meaning_text_style()));
            col += placed.pair.meaning_width;
        }
    }
    Line::from(spans)
}

fn styled_target_char(index: usize, expected: char, input: &[char]) -> Span<'static> {
    let mut style = match input.get(index) {
        Some(actual) if *actual == expected => correct_text_style(),
        Some(_) => wrong_text_style(),
        None => pending_text_style(),
    };
    if index == input.len() {
        style = style
            .fg(Color::Black)
            .bg(Color::Yellow)
            .add_modifier(Modifier::BOLD);
    }
    Span::styled(display_char(expected), style)
}

fn push_padding(spans: &mut Vec<Span<'static>>, count: usize) {
    if count > 0 {
        spans.push(Span::raw(" ".repeat(count)));
    }
}

fn target_lines(target_chars: &[char], input: &[char], width: usize) -> WrappedLines {
    let mut lines = Vec::<Line>::new();
    let mut spans = Vec::<Span>::new();
    let mut col = 0usize;
    let mut current_line = 0usize;

    for (index, expected) in target_chars.iter().copied().enumerate() {
        if index == input.len() {
            current_line = lines.len();
        }

        if expected == '\n' {
            if !spans.is_empty() && col + 1 > width {
                push_line(&mut lines, &mut spans);
                if index == input.len() {
                    current_line = lines.len();
                }
            }
            let mut style = match input.get(index) {
                Some('\n') => correct_text_style(),
                Some(_) => wrong_text_style(),
                None => pending_text_style(),
            };
            if index == input.len() {
                style = style
                    .fg(Color::Black)
                    .bg(Color::Yellow)
                    .add_modifier(Modifier::BOLD);
            }
            spans.push(Span::styled("⏎", style));
            push_line(&mut lines, &mut spans);
            col = 0;
            continue;
        }

        let expected_width = display_width(expected);
        if !spans.is_empty() && col + expected_width > width {
            push_line(&mut lines, &mut spans);
            col = 0;
            if index == input.len() {
                current_line = lines.len();
            }
        }

        let mut style = match input.get(index) {
            Some(actual) if *actual == expected => correct_text_style(),
            Some(_) => wrong_text_style(),
            None => pending_text_style(),
        };
        if index == input.len() {
            style = style
                .fg(Color::Black)
                .bg(Color::Yellow)
                .add_modifier(Modifier::BOLD);
        }

        spans.push(Span::styled(display_char(expected), style));
        col += expected_width;
    }

    if input.len() >= target_chars.len() {
        current_line = lines.len();
    }
    if spans.is_empty() && lines.is_empty() {
        spans.push(Span::styled(" ", cursor_style()));
    }
    push_line(&mut lines, &mut spans);

    WrappedLines {
        lines,
        current_line,
    }
}

fn push_line(lines: &mut Vec<Line<'static>>, spans: &mut Vec<Span<'static>>) {
    lines.push(Line::from(std::mem::take(spans)));
}

fn scroll_offset(current_line: usize, total_lines: usize, view_height: u16) -> u16 {
    let view_height = view_height as usize;
    if total_lines <= view_height || view_height == 0 {
        return 0;
    }

    let half = view_height / 2;
    let max_scroll = total_lines.saturating_sub(view_height);
    current_line.saturating_sub(half).min(max_scroll) as u16
}

fn visible_window(active: usize, total: usize, height: usize) -> (usize, usize) {
    if total == 0 || height == 0 {
        return (0, 0);
    }
    let start = active
        .saturating_sub(height / 2)
        .min(total.saturating_sub(height));
    let end = (start + height).min(total);
    (start, end)
}

fn display_char(ch: char) -> String {
    match ch {
        '\t' => "  ".to_string(),
        other => other.to_string(),
    }
}

fn display_width(ch: char) -> usize {
    match ch {
        '\t' => 2,
        '\u{1100}'..='\u{115F}'
        | '\u{2E80}'..='\u{A4CF}'
        | '\u{AC00}'..='\u{D7A3}'
        | '\u{F900}'..='\u{FAFF}'
        | '\u{FE10}'..='\u{FE19}'
        | '\u{FE30}'..='\u{FE6F}'
        | '\u{FF00}'..='\u{FF60}'
        | '\u{FFE0}'..='\u{FFE6}' => 2,
        _ => 1,
    }
}

fn text_width(value: &str) -> usize {
    value.chars().map(display_width).sum()
}

fn format_practice_minutes(ms: u64) -> String {
    let minutes = ms as f64 / 60_000.0;
    if (minutes - minutes.round()).abs() < 0.05 {
        format!("{minutes:.0}")
    } else {
        format!("{minutes:.1}")
    }
}

fn format_duration_short(ms: u64, language: Language) -> String {
    if ms < 60_000 {
        let seconds = if ms == 0 {
            0
        } else {
            ((ms + 500) / 1000).clamp(1, 59)
        };
        return match language {
            Language::Zh => format!("{seconds} 秒"),
            Language::En => format!("{seconds}s"),
        };
    }

    let total_minutes = (ms + 30_000) / 60_000;
    let hours = total_minutes / 60;
    let minutes = total_minutes % 60;
    match (language, hours, minutes) {
        (Language::Zh, 0, minutes) => format!("{minutes} 分钟"),
        (Language::Zh, hours, 0) => format!("{hours} 小时"),
        (Language::Zh, hours, minutes) => format!("{hours} 小时 {minutes} 分钟"),
        (Language::En, 0, minutes) => format!("{minutes}m"),
        (Language::En, hours, 0) => format!("{hours}h"),
        (Language::En, hours, minutes) => format!("{hours}h {minutes}m"),
    }
}

fn cursor_style() -> Style {
    Style::default()
        .fg(Color::Black)
        .bg(Color::Yellow)
        .add_modifier(Modifier::BOLD)
}

fn pending_text_style() -> Style {
    Style::default().fg(Color::Indexed(250)).bg(Color::Reset)
}

fn meaning_text_style() -> Style {
    Style::default().fg(Color::Indexed(110)).bg(Color::Reset)
}

fn correct_text_style() -> Style {
    Style::default().fg(Color::LightGreen).bg(Color::Reset)
}

fn wrong_text_style() -> Style {
    Style::default()
        .fg(Color::LightRed)
        .bg(Color::Reset)
        .add_modifier(Modifier::BOLD | Modifier::UNDERLINED)
}

struct LiveMetrics {
    wpm: f64,
    raw_wpm: f64,
    accuracy: f64,
    errors: u32,
    backspaces: u32,
}

fn live_metrics(
    target_chars: &[char],
    input: &[char],
    events: &[KeyEventRecord],
    elapsed: Duration,
) -> LiveMetrics {
    let final_correct = target_chars
        .iter()
        .zip(input.iter())
        .filter(|(expected, actual)| expected == actual)
        .count();
    let insert_count = events
        .iter()
        .filter(|event| matches!(event.action, KeyAction::Insert))
        .count();
    let correct_insert_count = events
        .iter()
        .filter(|event| matches!(event.action, KeyAction::Insert) && event.correct)
        .count();
    let has_auto_indent = events
        .iter()
        .any(|event| matches!(event.action, KeyAction::AutoIndent));
    let correct = if has_auto_indent {
        correct_insert_count
    } else {
        final_correct
    };
    let accuracy = if insert_count == 0 {
        100.0
    } else {
        correct_insert_count as f64 / insert_count as f64 * 100.0
    };
    let minutes = elapsed.as_millis().max(1) as f64 / 60_000.0;
    let raw_wpm = insert_count as f64 / 5.0 / minutes;
    let wpm = correct as f64 / 5.0 / minutes;
    let errors = events
        .iter()
        .filter(|event| matches!(event.action, KeyAction::Insert) && !event.correct)
        .count() as u32;
    let backspaces = events
        .iter()
        .filter(|event| matches!(event.action, KeyAction::Backspace))
        .count() as u32;

    LiveMetrics {
        wpm,
        raw_wpm,
        accuracy,
        errors,
        backspaces,
    }
}

fn duration_ms(duration: Duration) -> u64 {
    duration.as_millis().min(u128::from(u64::MAX)) as u64
}

fn truncate(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.to_string();
    }

    let head = value
        .chars()
        .take(max_chars.saturating_sub(3))
        .collect::<String>();
    format!("{head}...")
}

fn centered_width(area: Rect, max_width: u16) -> Rect {
    let width = area.width.min(max_width);
    let left_padding = area.width.saturating_sub(width) / 2;
    Rect {
        x: area.x + left_padding,
        width,
        ..area
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{MixProfile, TrainingCategory, TrainingModule};
    use ratatui::{Terminal, backend::TestBackend};

    #[test]
    fn live_raw_wpm_counts_backspaced_inserts() {
        let events = vec![
            KeyEventRecord {
                at_ms: 100,
                action: KeyAction::Insert,
                position: 0,
                expected: Some('a'),
                input: Some('a'),
                correct: true,
            },
            KeyEventRecord {
                at_ms: 200,
                action: KeyAction::Insert,
                position: 1,
                expected: Some('b'),
                input: Some('x'),
                correct: false,
            },
            KeyEventRecord {
                at_ms: 300,
                action: KeyAction::Backspace,
                position: 1,
                expected: Some('b'),
                input: None,
                correct: false,
            },
            KeyEventRecord {
                at_ms: 400,
                action: KeyAction::Insert,
                position: 1,
                expected: Some('b'),
                input: Some('b'),
                correct: true,
            },
        ];

        let metrics = live_metrics(&['a', 'b'], &['a', 'b'], &events, Duration::from_secs(60));

        assert_eq!(metrics.raw_wpm, 0.6);
        assert!((metrics.accuracy - 100.0 * 2.0 / 3.0).abs() < 0.0001);
    }

    #[test]
    fn live_accuracy_keeps_errors_after_backspacing_to_empty() {
        let events = vec![
            KeyEventRecord {
                at_ms: 100,
                action: KeyAction::Insert,
                position: 0,
                expected: Some('a'),
                input: Some('x'),
                correct: false,
            },
            KeyEventRecord {
                at_ms: 200,
                action: KeyAction::Backspace,
                position: 0,
                expected: Some('a'),
                input: None,
                correct: false,
            },
        ];

        let metrics = live_metrics(&['a'], &[], &events, Duration::from_secs(60));

        assert_eq!(metrics.errors, 1);
        assert_eq!(metrics.accuracy, 0.0);
    }

    #[test]
    fn weighted_accuracy_uses_typed_len() {
        let short = SessionRecord {
            typed_len: 1,
            accuracy: 0.0,
            ..SessionRecord::default()
        };
        let long = SessionRecord {
            typed_len: 99,
            accuracy: 100.0,
            ..SessionRecord::default()
        };
        let records = vec![&short, &long];

        assert_eq!(weighted_accuracy(&records), 99.0);
    }

    #[test]
    fn weighted_accuracy_uses_effective_typed_len_for_legacy_records() {
        let legacy = SessionRecord {
            typed_len: 0,
            correct_chars: 3,
            user_input: "abc".to_string(),
            accuracy: 50.0,
            ..SessionRecord::default()
        };
        let modern = SessionRecord {
            typed_len: 1,
            accuracy: 100.0,
            ..SessionRecord::default()
        };
        let records = vec![&legacy, &modern];

        assert_eq!(weighted_accuracy(&records), 62.5);
    }

    #[test]
    fn aggregate_wpm_uses_total_chars_and_duration() {
        let short = SessionRecord {
            duration_ms: 60_000,
            correct_chars: 50,
            wpm: 10.0,
            ..SessionRecord::default()
        };
        let long = SessionRecord {
            duration_ms: 540_000,
            correct_chars: 450,
            wpm: 50.0,
            ..SessionRecord::default()
        };
        let records = vec![&short, &long];

        assert_eq!(aggregate_wpm(&records), 10.0);
    }

    #[test]
    fn aggregate_wpm_uses_active_time_when_available() {
        let record = SessionRecord {
            duration_ms: 60_000,
            active_ms: 30_000,
            idle_ms: 30_000,
            correct_chars: 150,
            wpm: 30.0,
            ..SessionRecord::default()
        };
        let records = vec![&record];

        assert_eq!(aggregate_wpm(&records), 60.0);
    }

    #[test]
    fn running_key_ignores_non_ascii_without_recording_input() {
        let plan = DailyPracticePlan {
            run_id: String::new(),
            run_number: 0,
            target_minutes: 20,
            completed_ms: 0,
            lessons: Vec::new(),
        };
        let mut app = App::new(
            plan,
            Vec::new(),
            Language::Zh,
            Vec::new(),
            Vec::new(),
            UserPreferences::default(),
        );
        app.started = Some(Instant::now());
        app.target_chars = vec!['a'];

        handle_running_key(&mut app, KeyCode::Char('你'), KeyModifiers::NONE);

        assert_eq!(app.ignored_non_ascii, 1);
        assert!(app.input.is_empty());
        assert!(app.events.is_empty());
    }

    #[test]
    fn running_esc_opens_confirmation_without_losing_input() {
        let mut app = running_app_with_input();

        handle_running_key(&mut app, KeyCode::Esc, KeyModifiers::NONE);

        assert_eq!(app.phase, Phase::Running);
        assert!(app.exit_confirm);
        assert!(app.is_paused());
        assert_eq!(app.input, vec!['a']);
        assert_eq!(app.events.len(), 1);
        assert!(!app.quit);
    }

    #[test]
    fn running_ctrl_p_pauses_and_resumes_without_losing_input() {
        let mut app = running_app_with_input();

        handle_running_key(&mut app, KeyCode::Char('p'), KeyModifiers::CONTROL);

        assert!(app.is_paused());
        assert!(!app.exit_confirm);
        assert_eq!(app.input, vec!['a']);

        handle_running_key(&mut app, KeyCode::Char('b'), KeyModifiers::NONE);

        assert_eq!(app.input, vec!['a']);
        assert_eq!(app.events.len(), 1);

        handle_running_key(&mut app, KeyCode::Char('p'), KeyModifiers::CONTROL);
        handle_running_key(&mut app, KeyCode::Char('b'), KeyModifiers::NONE);

        assert!(!app.is_paused());
        assert_eq!(app.input, vec!['a', 'b']);
        assert_eq!(app.events.len(), 2);
    }

    #[test]
    fn running_plain_p_is_typed_instead_of_pausing() {
        let mut app = running_app_with_input();

        handle_running_key(&mut app, KeyCode::Char('p'), KeyModifiers::NONE);

        assert!(!app.is_paused());
        assert_eq!(app.input, vec!['a', 'p']);
        assert_eq!(app.events.len(), 2);
        assert_eq!(app.events[1].input, Some('p'));
    }

    #[test]
    fn settings_page_shows_two_entries_instead_of_flat_code_filters() {
        let mut app = empty_app_with_code_options(vec![
            code_option(CodePracticeFacet::Language, "typescript", 120),
            code_option(CodePracticeFacet::Framework, "nestjs", 30),
        ]);
        app.phase = Phase::Settings;
        app.settings_index = 0;

        let screen = render_app_to_text(&app, 100, 30);
        let compact = compact_screen(&screen);

        assert!(compact.contains("界面语言设置"), "{screen}");
        assert!(compact.contains("编程语言设置"), "{screen}");
        assert!(!screen.contains("typescript"), "{screen}");
        assert!(!screen.contains("nestjs"), "{screen}");
    }

    #[test]
    fn settings_page_opens_language_and_code_scope_subpages() {
        let mut app = empty_app_with_code_options(vec![code_option(
            CodePracticeFacet::Language,
            "typescript",
            120,
        )]);
        app.phase = Phase::Settings;

        handle_settings_key(&mut app, KeyCode::Enter);
        assert_eq!(app.phase, Phase::InterfaceLanguageSettings);

        app.phase = Phase::Settings;
        app.settings_index = 1;
        handle_settings_key(&mut app, KeyCode::Enter);
        assert_eq!(app.phase, Phase::CodeFilterSettings);
    }

    #[test]
    fn language_settings_toggles_interface_language() {
        let mut app = empty_app_with_code_options(Vec::new());
        app.phase = Phase::InterfaceLanguageSettings;

        handle_language_settings_key(&mut app, KeyCode::Down);
        handle_language_settings_key(&mut app, KeyCode::Enter);

        assert_eq!(app.language, Language::En);
        assert_eq!(app.preferences.interface_language, Language::En);
        assert!(app.preferences_dirty);
    }

    #[test]
    fn code_filter_settings_toggles_multiple_facets() {
        let mut app = empty_app_with_code_options(vec![
            code_option(CodePracticeFacet::Language, "typescript", 120),
            code_option(CodePracticeFacet::Framework, "nestjs", 30),
            code_option(CodePracticeFacet::Language, "solidity", 120),
        ]);
        app.phase = Phase::CodeFilterSettings;

        handle_code_filter_settings_key(&mut app, KeyCode::Char(' '));
        handle_code_filter_settings_key(&mut app, KeyCode::Down);
        handle_code_filter_settings_key(&mut app, KeyCode::Char(' '));

        let config = app.selected_code_config();
        assert!(config.match_any);
        assert_eq!(config.languages, vec!["typescript"]);
        assert_eq!(config.frameworks, vec!["nestjs"]);
        assert!(app.preferences_dirty);
        assert_eq!(
            app.preferences.global_code_filters,
            vec![
                CodeFilterPreference {
                    facet: CodePracticeFacet::Language,
                    value: "typescript".to_string(),
                },
                CodeFilterPreference {
                    facet: CodePracticeFacet::Framework,
                    value: "nestjs".to_string(),
                },
            ]
        );
    }

    #[test]
    fn code_filter_settings_a_does_not_change_selection() {
        let mut app = empty_app_with_code_options(vec![
            code_option(CodePracticeFacet::Language, "typescript", 120),
            code_option(CodePracticeFacet::Framework, "nestjs", 30),
        ]);
        app.phase = Phase::CodeFilterSettings;
        app.code_selected = vec![true, false];
        app.sync_global_code_filters();
        app.preferences_dirty = false;

        handle_code_filter_settings_key(&mut app, KeyCode::Char('A'));
        assert_eq!(app.code_selected, vec![true, false]);
        assert_eq!(app.preferences.global_code_filters.len(), 1);
        assert!(!app.preferences_dirty);
    }

    #[test]
    fn code_filter_settings_c_does_not_clear_selection() {
        let mut app = empty_app_with_code_options(vec![
            code_option(CodePracticeFacet::Language, "typescript", 120),
            code_option(CodePracticeFacet::Framework, "nestjs", 30),
        ]);
        app.phase = Phase::CodeFilterSettings;
        app.code_selected = vec![true, false];
        app.sync_global_code_filters();
        app.preferences_dirty = false;

        handle_code_filter_settings_key(&mut app, KeyCode::Char('C'));

        assert_eq!(app.code_selected, vec![true, false]);
        assert_eq!(app.preferences.global_code_filters.len(), 1);
        assert!(!app.preferences_dirty);
    }

    #[test]
    fn code_setup_selects_file_level_and_uses_global_filter_scope() {
        let preferences = UserPreferences {
            global_code_filters: vec![CodeFilterPreference {
                facet: CodePracticeFacet::Language,
                value: "typescript".to_string(),
            }],
            ..UserPreferences::default()
        };
        let mut app = empty_app_with_code_options_and_preferences(
            vec![
                code_option(CodePracticeFacet::Language, "typescript", 120),
                code_option(CodePracticeFacet::Framework, "nestjs", 30),
            ],
            preferences,
        );
        app.phase = Phase::CodeSetup;

        handle_code_setup_key(&mut app, KeyCode::Char('3'));
        handle_code_setup_key(&mut app, KeyCode::Enter);

        let config = app.selected_code_config();
        assert_eq!(config.level, Some(CodePracticeLevel::File));
        assert_eq!(config.languages, vec!["typescript"]);
        assert!(config.frameworks.is_empty());
        assert!(app.code_specialist_active);
        let source = &app.target.as_ref().expect("code target").source;
        assert!(source.contains("level=file"));
        assert!(source.contains("lang=typescript"));
    }

    #[test]
    fn code_setup_no_longer_toggles_code_filters() {
        let mut app = empty_app_with_code_options(vec![
            code_option(CodePracticeFacet::Language, "typescript", 120),
            code_option(CodePracticeFacet::Framework, "nestjs", 30),
        ]);
        app.phase = Phase::CodeSetup;

        handle_code_setup_key(&mut app, KeyCode::Char(' '));
        handle_code_setup_key(&mut app, KeyCode::Down);

        let config = app.selected_code_config();
        assert!(config.languages.is_empty());
        assert!(config.frameworks.is_empty());
        assert_eq!(app.code_level_index, 1);
    }

    #[test]
    fn code_setup_supports_up_down_for_level_navigation() {
        let mut app = empty_app_with_code_options(Vec::new());
        app.phase = Phase::CodeSetup;
        app.code_level_index = 1;

        handle_code_setup_key(&mut app, KeyCode::Down);
        assert_eq!(app.code_level_index, 2);

        handle_code_setup_key(&mut app, KeyCode::Up);
        assert_eq!(app.code_level_index, 1);
    }

    #[test]
    fn code_setup_defaults_to_first_level() {
        let app = empty_app_with_code_options(Vec::new());

        assert_eq!(app.code_level_index, 0);
    }

    #[test]
    fn code_options_sort_pinned_preferences_first() {
        let mut options = vec![
            code_option(CodePracticeFacet::Language, "typescript", 120),
            code_option(CodePracticeFacet::Framework, "nestjs", 30),
            code_option(CodePracticeFacet::Language, "solidity", 120),
        ];
        let preferences = UserPreferences {
            pinned_code_filters: vec![CodeFilterPreference {
                facet: CodePracticeFacet::Framework,
                value: "nestjs".to_string(),
            }],
            ..UserPreferences::default()
        };

        sort_code_options_by_preferences(&mut options, &preferences);

        assert_eq!(options[0].facet, CodePracticeFacet::Framework);
        assert_eq!(options[0].value, "nestjs");
    }

    #[test]
    fn settings_can_pin_selected_code_filter_without_changing_language_row() {
        let mut app = empty_app_with_code_options(vec![
            code_option(CodePracticeFacet::Language, "typescript", 120),
            code_option(CodePracticeFacet::Framework, "nestjs", 30),
            code_option(CodePracticeFacet::Language, "solidity", 120),
        ]);
        app.phase = Phase::Settings;

        handle_settings_key(&mut app, KeyCode::Char('f'));
        assert!(app.preferences.pinned_code_filters.is_empty());

        app.phase = Phase::CodeFilterSettings;
        handle_code_filter_settings_key(&mut app, KeyCode::Char(' '));
        handle_code_filter_settings_key(&mut app, KeyCode::Char('f'));

        assert!(app.preferences_dirty);
        assert_eq!(
            app.preferences.pinned_code_filters,
            vec![CodeFilterPreference {
                facet: CodePracticeFacet::Language,
                value: "typescript".to_string(),
            }]
        );
        assert_eq!(
            app.preferences.global_code_filters,
            vec![CodeFilterPreference {
                facet: CodePracticeFacet::Language,
                value: "typescript".to_string(),
            }]
        );
    }

    #[test]
    fn settings_can_remove_current_code_filter_pin() {
        let preferences = UserPreferences {
            pinned_code_filters: vec![CodeFilterPreference {
                facet: CodePracticeFacet::Language,
                value: "typescript".to_string(),
            }],
            ..UserPreferences::default()
        };
        let mut app = empty_app_with_code_options_and_preferences(
            vec![
                code_option(CodePracticeFacet::Language, "typescript", 120),
                code_option(CodePracticeFacet::Framework, "nestjs", 30),
            ],
            preferences,
        );
        app.phase = Phase::CodeFilterSettings;

        handle_code_filter_settings_key(&mut app, KeyCode::Char('d'));

        assert!(app.preferences.pinned_code_filters.is_empty());
        assert!(app.preferences_dirty);
    }

    #[test]
    fn menu_foundation_opens_setup_after_comprehensive() {
        let mut app = empty_app_with_foundation_drills(vec![foundation_drill("home-row")]);
        app.menu_index = app.foundation_menu_index();

        handle_menu_key(&mut app, KeyCode::Enter);

        assert_eq!(app.phase, Phase::FoundationSetup);
    }

    #[test]
    fn main_menu_uses_confirmed_four_category_structure() {
        let plan = DailyPracticePlan {
            run_id: String::new(),
            run_number: 0,
            target_minutes: 20,
            completed_ms: 0,
            lessons: vec![
                practice_lesson(LessonKind::Foundation, "keyloop:foundation"),
                practice_lesson(LessonKind::CommonWords, "keyloop:everyday"),
                practice_lesson(LessonKind::Symbols, "keyloop:programming"),
                practice_lesson(LessonKind::CodeBlock, "keyloop:code"),
            ],
        };
        let app = App::new(
            plan,
            Vec::new(),
            Language::En,
            vec![foundation_drill("home-row")],
            Vec::new(),
            UserPreferences::default(),
        );

        assert_eq!(app.menu_len(), 7);
        let screen = render_app_to_text(&app, 100, 30);
        assert!(screen.contains("Full practice"));
        assert!(screen.contains("Foundation practice"));
        assert!(screen.contains("Everyday practice"));
        assert!(screen.contains("Programming basics"));
        assert!(screen.contains("Code practice"));
        assert!(screen.contains("Settings"));
        assert!(screen.contains("Stats"));
        assert!(!screen.contains("Everyday English: words and sentences"));
        assert!(!screen.contains("Programming basics: symbols and naming"));
    }

    #[test]
    fn main_menu_everyday_and_programming_open_second_level_menus() {
        let mut app = empty_app_with_foundation_drills(vec![foundation_drill("home-row")]);

        app.menu_index = 2;
        handle_menu_key(&mut app, KeyCode::Enter);
        assert_eq!(app.phase, Phase::EverydaySetup);

        app.reset_to_menu();
        app.menu_index = 3;
        handle_menu_key(&mut app, KeyCode::Enter);
        assert_eq!(app.phase, Phase::ProgrammingSetup);
    }

    #[test]
    fn main_menu_settings_opens_global_settings() {
        let mut app = empty_app_with_foundation_drills(vec![foundation_drill("home-row")]);
        app.menu_index = app.settings_menu_index();

        handle_menu_key(&mut app, KeyCode::Enter);

        assert_eq!(app.phase, Phase::Settings);
    }

    #[test]
    fn copy_uses_new_training_module_labels() {
        assert_eq!(text(Language::Zh, "menu_foundation"), "基础练习");
        assert_eq!(text(Language::Zh, "menu_everyday"), "日常练习");
        assert_eq!(text(Language::Zh, "menu_programming"), "编程基础");
        assert_eq!(text(Language::Zh, "menu_code_specialist"), "编程实战");
        assert_eq!(text(Language::Zh, "menu_settings"), "全局设置");
        assert_eq!(
            lesson_title(LessonKind::Foundation, Language::Zh),
            "基础输入：综合键位"
        );
        assert_eq!(
            lesson_title(LessonKind::CommonWords, Language::Zh),
            "日常英语：常用词句"
        );
        assert_eq!(
            lesson_title(LessonKind::Symbols, Language::Zh),
            "编程基础：符号和命名"
        );
        assert_eq!(
            lesson_title(LessonKind::CodeBlock, Language::Zh),
            "代码实战：完整代码块"
        );
    }

    #[test]
    fn foundation_setup_starts_selected_drill() {
        let mut app = empty_app_with_foundation_drills(vec![
            foundation_drill("home-row"),
            foundation_drill("vertical-ladders"),
        ]);
        app.phase = Phase::FoundationSetup;

        handle_foundation_setup_key(&mut app, KeyCode::Down);
        handle_foundation_setup_key(&mut app, KeyCode::Enter);

        assert!(app.foundation_active);
        assert_eq!(app.foundation_group_count, 1);
        assert_eq!(app.phase, Phase::Running);
        assert!(
            app.target
                .as_ref()
                .expect("foundation target")
                .source
                .contains("vertical-ladders")
        );
    }

    #[test]
    fn foundation_setup_bottom_item_starts_foundation_mix() {
        let mut app = empty_app_with_foundation_drills(vec![
            foundation_drill("home-row"),
            foundation_drill("top-row"),
        ]);
        app.phase = Phase::FoundationSetup;
        app.foundation_index = app.foundation_drills.len();

        handle_foundation_setup_key(&mut app, KeyCode::Enter);

        assert!(app.foundation_active);
        assert_eq!(app.phase, Phase::Running);
        let source = &app.target.as_ref().expect("foundation mix target").source;
        assert!(source.contains("foundation-mix"));
    }

    #[test]
    fn foundation_completion_enter_starts_another_group() {
        let mut app = empty_app_with_foundation_drills(vec![foundation_drill("home-row")]);
        app.phase = Phase::FoundationSetup;
        handle_foundation_setup_key(&mut app, KeyCode::Enter);
        let first_source = app.target.as_ref().expect("first target").source.clone();
        app.complete();

        handle_complete_key(&mut app, KeyCode::Enter);

        assert!(app.foundation_active);
        assert_eq!(app.foundation_group_count, 2);
        assert_eq!(app.phase, Phase::Running);
        assert_eq!(
            app.target.as_ref().expect("second target").source,
            first_source
        );
    }

    #[test]
    fn everyday_setup_switches_word_count_and_starts_word_scope() {
        let mut app = empty_app_with_foundation_drills(vec![foundation_drill("home-row")]);
        app.phase = Phase::EverydaySetup;

        handle_everyday_setup_key(&mut app, KeyCode::Right);
        handle_everyday_setup_key(&mut app, KeyCode::Enter);

        assert!(app.everyday_active);
        assert_eq!(app.preferences.everyday_english.word_count, 100);
        assert_eq!(app.phase, Phase::Running);
        let source = &app.target.as_ref().expect("everyday target").source;
        assert!(source.contains("common-500"));
        assert!(source.contains("words-100"));
    }

    #[test]
    fn running_everyday_word_count_switch_refreshes_current_target() {
        let mut app = empty_app_with_foundation_drills(vec![foundation_drill("home-row")]);
        app.phase = Phase::EverydaySetup;
        handle_everyday_setup_key(&mut app, KeyCode::Enter);
        app.input = vec!['x'];
        let first_source = app.target.as_ref().expect("first target").source.clone();

        handle_running_key(&mut app, KeyCode::Right, KeyModifiers::NONE);

        assert_eq!(app.phase, Phase::Running);
        assert!(app.input.is_empty());
        assert_eq!(app.preferences.everyday_english.word_count, 100);
        let next_source = &app.target.as_ref().expect("refreshed target").source;
        assert_ne!(next_source, &first_source);
        assert!(next_source.contains("common-500"));
        assert!(next_source.contains("words-100"));
    }

    #[test]
    fn running_everyday_sentence_length_switch_refreshes_current_target() {
        let mut app = empty_app_with_foundation_drills(vec![foundation_drill("home-row")]);
        app.phase = Phase::EverydaySetup;
        app.everyday_index = 3;
        handle_everyday_setup_key(&mut app, KeyCode::Enter);
        app.input = vec!['x'];

        handle_running_key(&mut app, KeyCode::Right, KeyModifiers::NONE);

        assert_eq!(app.phase, Phase::Running);
        assert!(app.input.is_empty());
        assert_eq!(
            app.preferences.everyday_english.sentence_length,
            crate::model::EverydaySentenceLength::Short
        );
        let source = &app
            .target
            .as_ref()
            .expect("refreshed sentence target")
            .source;
        assert!(source.contains("sentences-short"));
    }

    #[test]
    fn running_everyday_screen_shows_settings_and_meanings_in_visible_panel() {
        let mut app = empty_app_with_foundation_drills(vec![foundation_drill("home-row")]);
        app.phase = Phase::Running;
        app.everyday_active = true;
        app.everyday_group_count = 1;
        app.target = Some(PracticeTarget {
            mode: Mode::Words,
            text: "practice today before".to_string(),
            source: "keyloop:module:everyday-english:common-500:words-50".to_string(),
        });
        app.target_chars = app.target.as_ref().expect("target").text.chars().collect();
        app.started_at = Some(Utc::now());
        app.started = Some(Instant::now());

        let screen = render_app_to_text(&app, 100, 32);
        let compact = compact_screen(&screen);

        assert!(compact.contains("当前练习"), "{screen}");
        assert!(compact.contains("常见500词"), "{screen}");
        assert!(compact.contains("本组50词"), "{screen}");
        assert!(compact.contains("目标3词/21字符"), "{screen}");
        assert!(compact.contains("←/→切换词数并立即刷新"), "{screen}");
        assert!(!compact.contains("practice:练习"), "{screen}");
        assert!(!compact.contains("训练诊断"), "{screen}");

        let rows = compact_screen_rows(&screen);
        let settings_row = row_index_containing(&rows, "当前练习").expect("settings row");
        let target_row = row_index_containing(&rows, "跟打文本").expect("target panel row");
        let word_row = row_index_containing(&rows, "practicetodaybefore").expect("word row");
        let meaning_row = rows
            .iter()
            .enumerate()
            .skip(word_row + 1)
            .find(|(_, row)| row.contains("练习"))
            .map(|(index, _)| index)
            .expect("meaning row");
        assert_eq!(meaning_row, word_row + 1, "{screen}");
        assert!(word_row > target_row, "{screen}");
        assert!(meaning_row > settings_row + 2, "{screen}");
    }

    #[test]
    fn running_everyday_switch_updates_visible_settings_panel() {
        let mut app = empty_app_with_foundation_drills(vec![foundation_drill("home-row")]);
        app.phase = Phase::EverydaySetup;
        handle_everyday_setup_key(&mut app, KeyCode::Enter);

        handle_running_key(&mut app, KeyCode::Right, KeyModifiers::NONE);

        let screen = render_app_to_text(&app, 100, 32);
        let compact = compact_screen(&screen);
        assert!(compact.contains("本组100词"), "{screen}");
        assert!(compact.contains("←/→切换词数并立即刷新"), "{screen}");
    }

    #[test]
    fn everyday_sentence_entry_switches_sentence_length_without_extra_entries() {
        let mut app = empty_app_with_foundation_drills(vec![foundation_drill("home-row")]);
        app.phase = Phase::EverydaySetup;
        app.everyday_index = 3;

        handle_everyday_setup_key(&mut app, KeyCode::Right);
        handle_everyday_setup_key(&mut app, KeyCode::Enter);

        assert!(app.everyday_active);
        assert_eq!(
            app.preferences.everyday_english.sentence_length,
            crate::model::EverydaySentenceLength::Short
        );
        let source = &app.target.as_ref().expect("sentence target").source;
        assert!(source.contains("sentences-short"));
    }

    #[test]
    fn programming_setup_starts_selected_specialist_target() {
        let mut app = empty_app_with_foundation_drills(vec![foundation_drill("home-row")]);
        app.phase = Phase::ProgrammingSetup;
        app.programming_index = 2;

        handle_programming_setup_key(&mut app, KeyCode::Enter);

        assert!(app.programming_active);
        assert_eq!(app.phase, Phase::Running);
        let source = &app.target.as_ref().expect("programming target").source;
        assert!(source.contains("naming"));
    }

    #[test]
    fn menu_code_specialist_opens_setup_before_stats() {
        let mut app = empty_app_with_code_options(vec![code_option(
            CodePracticeFacet::Language,
            "typescript",
            120,
        )]);
        app.menu_index = app.code_specialist_menu_index();

        handle_menu_key(&mut app, KeyCode::Enter);

        assert_eq!(app.phase, Phase::CodeSetup);
    }

    #[test]
    fn app_resumes_comprehensive_from_first_unfinished_lesson_today() {
        let plan = DailyPracticePlan {
            run_id: "today-1".to_string(),
            run_number: 1,
            target_minutes: 20,
            completed_ms: 60_000,
            lessons: vec![
                practice_lesson(LessonKind::Warmup, "keyloop:warmup"),
                practice_lesson(LessonKind::Symbols, "keyloop:symbols"),
            ],
        };
        let record = SessionRecord {
            started_at: Local::now().with_timezone(&Utc),
            source: "keyloop:warmup".to_string(),
            daily_run_id: "today-1".to_string(),
            lesson_id: "daily:keyloop:warmup:1".to_string(),
            lesson_index: Some(0),
            completion_state: CompletionState::Completed,
            duration_ms: 60_000,
            ..SessionRecord::default()
        };

        let mut app = App::new(
            plan,
            vec![record],
            Language::Zh,
            Vec::new(),
            Vec::new(),
            UserPreferences::default(),
        );

        assert_eq!(app.completed_lesson_indices, vec![0]);
        assert_eq!(app.lesson_index, 1);
        handle_menu_key(&mut app, KeyCode::Enter);
        assert_eq!(app.phase, Phase::Plan);
        assert_eq!(app.lesson_index, 1);
    }

    #[test]
    fn standalone_foundation_completion_does_not_complete_daily_lesson() {
        let plan = DailyPracticePlan {
            run_id: "today-1".to_string(),
            run_number: 1,
            target_minutes: 20,
            completed_ms: 0,
            lessons: vec![practice_lesson(
                LessonKind::Foundation,
                "keyloop:foundation:home-row",
            )],
        };
        let mut app = App::new(
            plan,
            Vec::new(),
            Language::Zh,
            vec![foundation_drill("home-row")],
            Vec::new(),
            UserPreferences::default(),
        );

        app.phase = Phase::FoundationSetup;
        handle_foundation_setup_key(&mut app, KeyCode::Enter);
        app.input = app.target_chars.clone();
        app.complete();

        assert!(app.completed_lesson_indices.is_empty());
        let record = app.completed_records.last().expect("foundation record");
        assert!(record.daily_run_id.is_empty());
        assert!(record.lesson_id.is_empty());
        assert_eq!(record.lesson_index, None);
    }

    #[test]
    fn standalone_everyday_completion_does_not_complete_comprehensive_plan() {
        let plan = DailyPracticePlan {
            run_id: "today-1".to_string(),
            run_number: 1,
            target_minutes: 20,
            completed_ms: 0,
            lessons: vec![
                practice_lesson(LessonKind::Foundation, "keyloop:foundation:home-row"),
                practice_lesson(LessonKind::CodeBlock, "keyloop:code-corpus"),
            ],
        };
        let mut app = App::new(
            plan,
            Vec::new(),
            Language::Zh,
            Vec::new(),
            Vec::new(),
            UserPreferences::default(),
        );

        app.phase = Phase::EverydaySetup;
        handle_everyday_setup_key(&mut app, KeyCode::Enter);
        app.input = app.target_chars.clone();
        app.complete();

        assert!(app.completed_lesson_indices.is_empty());
        let record = app.completed_records.last().expect("single lesson record");
        assert!(record.daily_run_id.is_empty());
        assert!(record.lesson_id.is_empty());
        assert_eq!(record.lesson_index, None);
    }

    #[test]
    fn resume_uses_lesson_id_for_repeated_sources() {
        let mut first = practice_lesson(LessonKind::Symbols, "keyloop:symbols");
        first.id = "daily:symbols:1".to_string();
        let mut second = practice_lesson(LessonKind::Symbols, "keyloop:symbols");
        second.id = "daily:symbols:2".to_string();
        let plan = DailyPracticePlan {
            run_id: "today-1".to_string(),
            run_number: 1,
            target_minutes: 20,
            completed_ms: 60_000,
            lessons: vec![first, second],
        };
        let record = SessionRecord {
            started_at: Local::now().with_timezone(&Utc),
            source: "keyloop:symbols".to_string(),
            daily_run_id: "today-1".to_string(),
            lesson_id: "daily:symbols:2".to_string(),
            lesson_index: Some(1),
            completion_state: CompletionState::Completed,
            duration_ms: 60_000,
            ..SessionRecord::default()
        };

        let app = App::new(
            plan,
            vec![record],
            Language::Zh,
            Vec::new(),
            Vec::new(),
            UserPreferences::default(),
        );

        assert_eq!(app.completed_lesson_indices, vec![1]);
        assert_eq!(app.lesson_index, 0);
    }

    #[test]
    fn resume_does_not_guess_legacy_records_for_repeated_sources() {
        let mut first = practice_lesson(LessonKind::Words, "keyloop:programming-words");
        first.id = "daily:words:1".to_string();
        let mut second = practice_lesson(LessonKind::Words, "keyloop:programming-words");
        second.id = "daily:words:2".to_string();
        let plan = DailyPracticePlan {
            run_id: "today-1".to_string(),
            run_number: 1,
            target_minutes: 20,
            completed_ms: 60_000,
            lessons: vec![first, second],
        };
        let legacy_record = SessionRecord {
            started_at: Local::now().with_timezone(&Utc),
            source: "keyloop:programming-words".to_string(),
            duration_ms: 60_000,
            ..SessionRecord::default()
        };

        let app = App::new(
            plan,
            vec![legacy_record],
            Language::Zh,
            Vec::new(),
            Vec::new(),
            UserPreferences::default(),
        );

        assert!(app.completed_lesson_indices.is_empty());
        assert_eq!(app.lesson_index, 0);
    }

    #[test]
    fn code_enter_auto_inserts_expected_indentation() {
        let mut app = empty_app_with_code_options(Vec::new());
        app.phase = Phase::Running;
        app.target = Some(PracticeTarget {
            mode: Mode::Code,
            text: "\n  x".to_string(),
            source: "test".to_string(),
        });
        app.target_chars = vec!['\n', ' ', ' ', 'x'];
        app.started_at = Some(Utc::now());
        app.started = Some(Instant::now());

        handle_running_key(&mut app, KeyCode::Enter, KeyModifiers::NONE);

        assert_eq!(app.input, vec!['\n', ' ', ' ']);
        assert!(matches!(app.events[0].action, KeyAction::Insert));
        assert!(matches!(app.events[1].action, KeyAction::AutoIndent));
        assert!(matches!(app.events[2].action, KeyAction::AutoIndent));
        let record = app
            .current_record(CompletionState::Completed)
            .expect("partial code record should build");
        assert_eq!(record.typed_len, 1);
        assert_eq!(record.correct_chars, 1);
    }

    #[test]
    fn running_exit_confirmation_esc_resumes_practice() {
        let mut app = running_app_with_input();
        handle_running_key(&mut app, KeyCode::Esc, KeyModifiers::NONE);

        assert!(app.is_paused());

        handle_running_key(&mut app, KeyCode::Esc, KeyModifiers::NONE);

        assert_eq!(app.phase, Phase::Running);
        assert!(!app.exit_confirm);
        assert!(!app.is_paused());
        assert_eq!(app.input, vec!['a']);
        assert!(!app.quit);
    }

    #[test]
    fn running_exit_confirmation_can_save_partial_record() {
        let mut app = running_app_with_input();
        handle_running_key(&mut app, KeyCode::Esc, KeyModifiers::NONE);

        handle_running_key(&mut app, KeyCode::Char('s'), KeyModifiers::NONE);

        assert!(app.quit);
        assert_eq!(app.completed_records.len(), 1);
        assert!(app.completed_lesson_indices.is_empty());
        let record = &app.completed_records[0];
        assert_eq!(record.user_input, "a");
        assert_eq!(record.target_len, 3);
        assert_eq!(record.typed_len, 1);
    }

    #[test]
    fn complete_and_summary_escape_return_to_menu_instead_of_quitting() {
        let mut complete = running_app_with_input();
        complete.complete();

        handle_complete_key(&mut complete, KeyCode::Esc);

        assert_eq!(complete.phase, Phase::Menu);
        assert!(!complete.quit);
        assert_eq!(complete.completed_records.len(), 1);

        let mut summary = empty_app_with_code_options(Vec::new());
        summary.phase = Phase::Summary;

        handle_summary_key(&mut summary, KeyCode::Esc);

        assert_eq!(summary.phase, Phase::Menu);
        assert!(!summary.quit);
    }

    #[test]
    fn active_elapsed_excludes_accumulated_and_current_pause_time() {
        let mut app = running_app_with_input();
        app.started = Some(Instant::now() - Duration::from_secs(60));
        app.paused_total = Duration::from_secs(45);
        app.paused_at = Some(Instant::now() - Duration::from_secs(10));

        let active = app
            .active_elapsed()
            .expect("running app should have elapsed time");

        assert!(active >= Duration::from_secs(5));
        assert!(active < Duration::from_secs(7));
    }

    #[test]
    fn completed_record_stores_manual_pause_time() {
        let mut app = running_app_with_input();
        app.paused_total = Duration::from_secs(45);

        let record = app
            .current_record(CompletionState::Completed)
            .expect("record should build");

        assert_eq!(record.manual_pause_ms, 45_000);
    }

    #[test]
    fn complete_saves_record_immediately() {
        let dir =
            std::env::temp_dir().join(format!("keyloop-immediate-save-{}", uuid::Uuid::new_v4()));
        let path = dir.join("sessions.jsonl");
        let mut app = running_app_with_input();

        app.complete_with_saver(|record| storage::append_session_to_path(record, &path));

        assert_eq!(app.completed_records.len(), 1);
        assert_eq!(app.last_saved_to.as_deref(), Some(path.as_path()));
        let data = std::fs::read_to_string(&path).expect("session should be written immediately");
        assert!(data.contains(&app.completed_records[0].id));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn running_event_timestamps_use_active_elapsed() {
        let mut app = running_app_with_input();
        app.started = Some(Instant::now() - Duration::from_secs(60));
        app.paused_total = Duration::from_secs(55);

        handle_running_key(&mut app, KeyCode::Char('b'), KeyModifiers::NONE);

        let event = app
            .events
            .last()
            .expect("typed character should be recorded");
        assert!(event.at_ms >= 5_000);
        assert!(event.at_ms < 7_000);
    }

    #[test]
    fn running_key_updates_key_aggregate_in_memory() {
        let mut app = empty_app_with_code_options(Vec::new());
        app.phase = Phase::Running;
        app.target = Some(PracticeTarget {
            mode: Mode::Words,
            text: "ab".to_string(),
            source: "test".to_string(),
        });
        app.target_chars = vec!['a', 'b'];
        app.started_at = Some(Utc::now());
        app.started = Some(Instant::now());

        handle_running_key(&mut app, KeyCode::Char('a'), KeyModifiers::NONE);
        handle_running_key(&mut app, KeyCode::Char('x'), KeyModifiers::NONE);

        let a = app
            .key_aggregates
            .iter()
            .find(|aggregate| aggregate.key == "a")
            .expect("typed key should be tracked");
        let b = app
            .key_aggregates
            .iter()
            .find(|aggregate| aggregate.key == "b")
            .expect("expected key for wrong input should be tracked");
        assert_eq!(a.hit_count, 1);
        assert_eq!(b.miss_count, 1);
        assert!(app.key_stats_dirty);
    }

    #[test]
    fn running_exit_confirmation_menu_is_explicit_discard() {
        let mut app = running_app_with_input();
        handle_running_key(&mut app, KeyCode::Esc, KeyModifiers::NONE);

        handle_running_key(&mut app, KeyCode::Char('m'), KeyModifiers::NONE);

        assert_eq!(app.phase, Phase::Menu);
        assert!(!app.exit_confirm);
        assert!(app.input.is_empty());
        assert!(app.completed_records.is_empty());
    }

    #[test]
    fn running_exit_confirmation_menu_returns_to_parent_setup() {
        let mut app = empty_app_with_foundation_drills(vec![foundation_drill("home-row")]);
        app.phase = Phase::EverydaySetup;
        handle_everyday_setup_key(&mut app, KeyCode::Enter);
        handle_running_key(&mut app, KeyCode::Esc, KeyModifiers::NONE);

        handle_running_key(&mut app, KeyCode::Char('m'), KeyModifiers::NONE);

        assert_eq!(app.phase, Phase::EverydaySetup);
        assert!(!app.everyday_active);
        assert!(app.target.is_none());
    }

    #[test]
    fn menu_zero_key_does_not_select_first_item() {
        let plan = DailyPracticePlan {
            run_id: String::new(),
            run_number: 0,
            target_minutes: 20,
            completed_ms: 0,
            lessons: Vec::new(),
        };
        let mut app = App::new(
            plan,
            Vec::new(),
            Language::Zh,
            Vec::new(),
            Vec::new(),
            UserPreferences::default(),
        );
        app.menu_index = app.stats_menu_index();

        handle_menu_key(&mut app, KeyCode::Char('0'));

        assert_eq!(app.menu_index, app.stats_menu_index());
    }

    #[test]
    fn target_lines_marks_wrong_newline_input() {
        let wrapped = target_lines(&['a', '\n', 'b'], &['a', 'x'], 16);

        assert_eq!(wrapped.lines.len(), 2);
        assert_eq!(wrapped.lines[0].spans.len(), 2);
        assert_eq!(wrapped.lines[0].spans[1].content.as_ref(), "⏎");
        assert_eq!(wrapped.lines[0].spans[1].style, wrong_text_style());
    }

    #[test]
    fn target_lines_wraps_newline_marker_at_width_boundary() {
        let wrapped = target_lines(&['a', '\n', 'b'], &[], 1);

        assert_eq!(wrapped.lines[0].spans[0].content.as_ref(), "a");
        assert_eq!(wrapped.lines[1].spans[0].content.as_ref(), "⏎");
        assert_eq!(wrapped.lines[2].spans[0].content.as_ref(), "b");
    }

    #[test]
    fn target_lines_wraps_wide_tab_before_overflow() {
        let wrapped = target_lines(&['a', '\t', 'b'], &[], 2);

        assert_eq!(wrapped.lines[0].spans[0].content.as_ref(), "a");
        assert_eq!(wrapped.lines[1].spans[0].content.as_ref(), "  ");
        assert_eq!(wrapped.lines[2].spans[0].content.as_ref(), "b");
    }

    #[test]
    fn word_meaning_target_lines_wrap_pairs_by_width_and_align_meanings() {
        let target = "practice today before".chars().collect::<Vec<_>>();

        let wrapped = word_meaning_target_lines(&target, &[], 18).expect("word meanings");
        let lines = wrapped.lines.iter().map(line_text).collect::<Vec<_>>();

        assert_eq!(lines.len(), 4, "{lines:#?}");
        assert!(lines[0].contains("practice"), "{lines:#?}");
        assert!(lines[0].contains("today"), "{lines:#?}");
        assert!(!lines[0].contains("before"), "{lines:#?}");
        assert!(lines[2].contains("before"), "{lines:#?}");
        assert_eq!(
            visual_col(&lines[1], "练习"),
            visual_col(&lines[0], "practice")
        );
        assert_eq!(
            visual_col(&lines[1], "今天"),
            visual_col(&lines[0], "today")
        );
        assert_eq!(
            visual_col(&lines[3], "在之前"),
            visual_col(&lines[2], "before")
        );
    }

    #[test]
    fn word_meaning_lines_use_readable_secondary_color() {
        let target = "practice".chars().collect::<Vec<_>>();

        let wrapped = word_meaning_target_lines(&target, &[], 24).expect("word meanings");
        let meaning_span = wrapped.lines[1]
            .spans
            .iter()
            .find(|span| span.content.as_ref().contains("练习"))
            .expect("meaning span");

        assert_eq!(meaning_span.style, meaning_text_style());
        assert_ne!(meaning_span.style.fg, Some(Color::DarkGray));
    }

    #[test]
    fn terminal_small_guard_matches_running_layout_height() {
        assert!(terminal_too_small(Rect::new(0, 0, 80, 24)));
        assert!(!terminal_too_small(Rect::new(0, 0, 80, 25)));
        assert!(terminal_too_small(Rect::new(0, 0, 71, 30)));
        assert!(!terminal_too_small(Rect::new(0, 0, 72, 30)));
    }

    #[test]
    fn render_smoke_covers_primary_tui_phases() {
        let mut app = renderable_app(Language::En);

        for (phase, expected) in [
            (Phase::Menu, "Practice menu"),
            (Phase::Plan, "Today's practice"),
            (Phase::FoundationSetup, "Foundation input"),
            (Phase::CodeSetup, "Code practice setup"),
            (Phase::Settings, "Settings"),
            (Phase::Stats, "Stats"),
        ] {
            app.phase = phase;
            let screen = render_app_to_text(&app, 100, 32);
            assert!(
                screen.contains(expected),
                "expected {phase:?} screen to contain {expected:?}\n{screen}"
            );
        }

        let running = running_render_app();
        let running_screen = render_app_to_text(&running, 100, 32);
        assert!(running_screen.contains("Training diagnosis"));
        assert!(running_screen.contains("test reason"));
        assert!(running_screen.contains("Ghost text"));
        assert!(running_screen.contains("WPM"));

        let mut complete = running_render_app();
        complete.complete();
        let complete_screen = render_app_to_text(&complete, 100, 32);
        assert!(complete_screen.contains("Lesson complete"));
        assert!(complete_screen.contains("Result"));
    }

    #[test]
    fn render_small_terminal_shows_clear_guard_message() {
        let app = renderable_app(Language::En);
        let screen = render_app_to_text(&app, 60, 20);

        assert!(screen.contains("Terminal is too small for KeyLoop."));
        assert!(!screen.contains("Practice menu"));
    }

    #[test]
    fn stats_tabs_cover_v3_pages() {
        let mut app = renderable_app(Language::En);
        app.phase = Phase::Stats;
        app.records = vec![
            SessionRecord {
                started_at: Local::now().with_timezone(&Utc),
                daily_run_id: "20260601-1".to_string(),
                module: TrainingModule::FoundationInput,
                category: TrainingCategory::FoundationMix,
                duration_ms: 60_000,
                active_ms: 30_000,
                correct_chars: 150,
                accuracy: 98.0,
                ..SessionRecord::default()
            },
            SessionRecord {
                started_at: Local::now().with_timezone(&Utc),
                mode: Mode::Code,
                module: TrainingModule::CodePractice,
                category: TrainingCategory::CodeSnippet,
                duration_ms: 90_000,
                active_ms: 45_000,
                correct_chars: 120,
                error_count: 4,
                accuracy: 92.0,
                ..SessionRecord::default()
            },
        ];

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
            assert!(
                screen.contains(expected),
                "expected stats screen to contain {expected:?}\n{screen}"
            );
        }
    }

    #[test]
    fn short_duration_keeps_seconds_under_one_minute() {
        assert_eq!(format_duration_short(0, Language::Zh), "0 秒");
        assert_eq!(format_duration_short(29_000, Language::Zh), "29 秒");
        assert_eq!(format_duration_short(29_000, Language::En), "29s");
        assert_eq!(format_duration_short(59_500, Language::Zh), "59 秒");
        assert_eq!(format_duration_short(59_500, Language::En), "59s");
        assert_eq!(format_duration_short(60_000, Language::Zh), "1 分钟");
    }

    #[test]
    fn record_error_rate_ignores_empty_legacy_targets() {
        let empty = SessionRecord::default();
        let valid = SessionRecord {
            target_len: 100,
            error_count: 5,
            ..SessionRecord::default()
        };

        assert_eq!(record_error_rate(&empty), None);
        assert_eq!(record_error_rate(&valid), Some(5.0));
    }

    #[test]
    fn top_problem_tokens_uses_legacy_error_tokens() {
        let mut record = SessionRecord::default();
        record.error_tokens.insert("response".to_string(), 3);

        let records = vec![&record];
        let tokens = top_problem_tokens(&records, true, 1);

        assert_eq!(tokens[0].token, "response");
        assert_eq!(tokens[0].errors, 3);
    }

    #[test]
    fn aggregate_key_errors_merges_new_and_legacy_records() {
        let new_record = SessionRecord {
            key_events: vec![KeyEventRecord {
                at_ms: 10,
                action: KeyAction::Insert,
                position: 0,
                expected: Some('a'),
                input: Some('x'),
                correct: false,
            }],
            ..SessionRecord::default()
        };
        let mut legacy_record = SessionRecord::default();
        legacy_record.error_chars.insert("b".to_string(), 2);

        let records = vec![&new_record, &legacy_record];
        let counts = aggregate_key_errors(&records);

        assert_eq!(counts.get("a"), Some(&1));
        assert_eq!(counts.get("b"), Some(&2));
    }

    fn running_app_with_input() -> App {
        let mut app = empty_app_with_code_options(Vec::new());
        app.phase = Phase::Running;
        app.target = Some(PracticeTarget {
            mode: Mode::Words,
            text: "abc".to_string(),
            source: "test".to_string(),
        });
        app.target_chars = vec!['a', 'b', 'c'];
        app.started_at = Some(Utc::now());
        app.started = Some(Instant::now());
        handle_running_key(&mut app, KeyCode::Char('a'), KeyModifiers::NONE);
        app
    }

    fn running_render_app() -> App {
        let mut app = renderable_app(Language::En);
        app.phase = Phase::Running;
        app.target = Some(PracticeTarget {
            mode: Mode::Code,
            text: "function value() {\n  return 1;\n}".to_string(),
            source: "render-test".to_string(),
        });
        app.target_chars = app.target.as_ref().expect("target").text.chars().collect();
        app.started_at = Some(Utc::now());
        app.started = Some(Instant::now() - Duration::from_secs(30));
        handle_running_key(&mut app, KeyCode::Char('f'), KeyModifiers::NONE);
        handle_running_key(&mut app, KeyCode::Char('u'), KeyModifiers::NONE);
        handle_running_key(&mut app, KeyCode::Char('n'), KeyModifiers::NONE);
        app
    }

    fn renderable_app(language: Language) -> App {
        let plan = DailyPracticePlan {
            run_id: "render-run".to_string(),
            run_number: 1,
            target_minutes: 20,
            completed_ms: 90_000,
            lessons: vec![
                practice_lesson(LessonKind::Warmup, "keyloop:warmup"),
                practice_lesson(LessonKind::Symbols, "keyloop:symbols"),
                practice_lesson(LessonKind::CodeBlock, "keyloop:code-corpus"),
            ],
        };
        App::new(
            plan,
            Vec::new(),
            language,
            vec![foundation_drill("home-row"), foundation_drill("top-row")],
            vec![
                code_option(CodePracticeFacet::Language, "typescript", 120),
                code_option(CodePracticeFacet::Framework, "react", 100),
            ],
            UserPreferences::default(),
        )
    }

    fn render_app_to_text(app: &App, width: u16, height: u16) -> String {
        let backend = TestBackend::new(width, height);
        let mut terminal = Terminal::new(backend).expect("test terminal should initialize");
        terminal
            .draw(|frame| render(frame, app))
            .expect("render should not fail");
        terminal
            .backend()
            .buffer()
            .content
            .chunks(width as usize)
            .map(|row| row.iter().map(|cell| cell.symbol()).collect::<String>())
            .collect::<Vec<_>>()
            .join("\n")
    }

    fn compact_screen(screen: &str) -> String {
        screen.chars().filter(|ch| *ch != ' ').collect()
    }

    fn compact_screen_rows(screen: &str) -> Vec<String> {
        screen
            .lines()
            .map(|line| line.chars().filter(|ch| *ch != ' ').collect())
            .collect()
    }

    fn line_text(line: &Line<'static>) -> String {
        line.spans
            .iter()
            .map(|span| span.content.as_ref())
            .collect()
    }

    fn visual_col(line: &str, needle: &str) -> Option<usize> {
        let mut col = 0usize;
        for (index, ch) in line.char_indices() {
            if line[index..].starts_with(needle) {
                return Some(col);
            }
            col += display_width(ch);
        }
        None
    }

    fn row_index_containing(rows: &[String], text: &str) -> Option<usize> {
        rows.iter().position(|row| row.contains(text))
    }

    fn empty_app_with_code_options(code_options: Vec<CodePracticeOption>) -> App {
        empty_app_with_options(Vec::new(), code_options)
    }

    fn empty_app_with_code_options_and_preferences(
        code_options: Vec<CodePracticeOption>,
        preferences: UserPreferences,
    ) -> App {
        empty_app_with_options_and_preferences(Vec::new(), code_options, preferences)
    }

    fn empty_app_with_foundation_drills(foundation_drills: Vec<FoundationPracticeDrill>) -> App {
        empty_app_with_options(foundation_drills, Vec::new())
    }

    fn empty_app_with_options(
        foundation_drills: Vec<FoundationPracticeDrill>,
        code_options: Vec<CodePracticeOption>,
    ) -> App {
        empty_app_with_options_and_preferences(
            foundation_drills,
            code_options,
            UserPreferences::default(),
        )
    }

    fn empty_app_with_options_and_preferences(
        foundation_drills: Vec<FoundationPracticeDrill>,
        code_options: Vec<CodePracticeOption>,
        preferences: UserPreferences,
    ) -> App {
        let plan = DailyPracticePlan {
            run_id: String::new(),
            run_number: 0,
            target_minutes: 20,
            completed_ms: 0,
            lessons: Vec::new(),
        };
        App::new(
            plan,
            Vec::new(),
            Language::Zh,
            foundation_drills,
            code_options,
            preferences,
        )
    }

    fn code_option(facet: CodePracticeFacet, value: &str, count: usize) -> CodePracticeOption {
        CodePracticeOption {
            facet,
            value: value.to_string(),
            count,
        }
    }

    fn foundation_drill(id: &str) -> FoundationPracticeDrill {
        FoundationPracticeDrill {
            id: id.to_string(),
            title_zh: format!("基础 {id}"),
            title_en: format!("Foundation {id}"),
            hint_zh: "专项练习".to_string(),
            hint_en: "Focused drill".to_string(),
            items: (0..24)
                .map(|index| format!("asdf jkl; {id} {index}"))
                .collect(),
        }
    }

    fn practice_lesson(kind: LessonKind, source: &str) -> PracticeLesson {
        PracticeLesson {
            id: format!("daily:{source}:1"),
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
            reason_zh: "测试原因".to_string(),
            reason_en: "test reason".to_string(),
        }
    }
}
