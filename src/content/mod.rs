pub mod library;
mod snippets;

use crate::feedback;
use crate::model::{
    CodePracticeConfig, CodePracticeLevel, CodePracticeOption, CompletionState, DailyPracticePlan,
    EverydayEnglishSettings, EverydaySentenceLength, Language, LessonKind, MixProfile, Mode,
    PracticeLesson, PracticeTarget, SessionRecord, TrainingCategory, TrainingModule,
};
use crate::plan::{PLAN_HISTORY_DAYS, PracticePlan};
use anyhow::Result;
use chrono::{Duration, Local, Utc};
use library::{ContentLibrary, EverydayEntryKind, FoundationDrill};
use rand::seq::SliceRandom;
use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::path::Path;

pub use snippets::{CodeSnippet, extract_snippets};

pub use library::source_catalog;

pub use library::FoundationDrill as FoundationPracticeDrill;

pub fn code_practice_options() -> Result<Vec<CodePracticeOption>> {
    let library = library::load()?;
    Ok(snippets::code_practice_options(&library.code_snippets))
}

pub fn foundation_drills() -> Result<Vec<FoundationDrill>> {
    let library = library::load()?;
    Ok(library.foundation_drills)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EverydayPracticeScope {
    Common500,
    Common1000,
    Common5000,
    Sentences,
    Mix,
}

impl EverydayPracticeScope {
    fn source_slug(self) -> &'static str {
        match self {
            Self::Common500 => "common-500",
            Self::Common1000 => "common-1000",
            Self::Common5000 => "common-5000",
            Self::Sentences => "sentences",
            Self::Mix => "mix",
        }
    }

    fn tier_limit(self) -> u8 {
        match self {
            Self::Common500 => 2,
            Self::Common1000 | Self::Sentences | Self::Mix => 3,
            Self::Common5000 => 5,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProgrammingBasicsPractice {
    NumberSymbols,
    Operators,
    Naming,
    TechnicalTerms,
    Mix,
}

pub fn refresh_module_mix_target(
    lesson: &PracticeLesson,
    records: &[&SessionRecord],
    code_config: &CodePracticeConfig,
    everyday_settings: &EverydayEnglishSettings,
) -> Result<PracticeTarget> {
    let library = library::load()?;
    let owned_records = records.iter().copied().cloned().collect::<Vec<_>>();
    let plan = crate::plan::build_plan(&owned_records, Language::Zh);
    let mut build_state = PlanBuildState::from_records(records);
    let readiness = ModuleReadiness::from_records(records);
    let mut context = LessonBuildContext {
        records,
        repo: None,
        plan: &plan,
        library: &library,
        code_config,
        build_state: &mut build_state,
        readiness: &readiness,
    };

    match lesson.module {
        TrainingModule::FoundationInput => Ok(foundation_mix(&mut context)),
        TrainingModule::EverydayEnglish => Ok(everyday_english_mix(
            &plan,
            &library,
            *everyday_settings,
            lesson.mix_profile,
        )),
        TrainingModule::ProgrammingBasics => Ok(programming_basics_mix(&mut context)),
        TrainingModule::CodePractice => code_practice_mix(&mut context),
        _ => Ok(lesson.target.clone()),
    }
}

pub fn build_everyday_target(
    records: &[&SessionRecord],
    scope: EverydayPracticeScope,
    settings: EverydayEnglishSettings,
) -> Result<PracticeTarget> {
    let library = library::load()?;
    let owned_records = records.iter().copied().cloned().collect::<Vec<_>>();
    let plan = crate::plan::build_plan(&owned_records, Language::Zh);

    Ok(match scope {
        EverydayPracticeScope::Common500
        | EverydayPracticeScope::Common1000
        | EverydayPracticeScope::Common5000 => {
            everyday_word_target(&library, scope, settings.word_count)
        }
        EverydayPracticeScope::Sentences => everyday_sentence_target(&library, settings),
        EverydayPracticeScope::Mix => {
            everyday_english_mix(&plan, &library, settings, MixProfile::Standalone)
        }
    })
}

pub fn build_programming_basics_target(
    records: &[&SessionRecord],
    practice: ProgrammingBasicsPractice,
    code_config: &CodePracticeConfig,
) -> Result<PracticeTarget> {
    let library = library::load()?;
    let owned_records = records.iter().copied().cloned().collect::<Vec<_>>();
    let plan = crate::plan::build_plan(&owned_records, Language::Zh);

    Ok(match practice {
        ProgrammingBasicsPractice::NumberSymbols => {
            let mut items = Vec::new();
            append_from(&mut items, &library.number_drills, 4);
            append_from(&mut items, &library.symbols, 12);
            PracticeTarget {
                mode: Mode::Symbols,
                text: chunk_words(&items, 6).join("\n"),
                source: "keyloop:module:programming-basics:numbers-symbols".to_string(),
            }
        }
        ProgrammingBasicsPractice::Operators => {
            let mut items = Vec::new();
            append_from(&mut items, &language_symbol_items(&library, code_config), 8);
            fill_from(&mut items, &library.symbols, 18);
            PracticeTarget {
                mode: Mode::Symbols,
                text: chunk_words(&items, 6).join("\n"),
                source: "keyloop:module:programming-basics:operators-brackets-quotes".to_string(),
            }
        }
        ProgrammingBasicsPractice::Naming => PracticeTarget {
            mode: Mode::Case,
            text: build_lesson_naming(&plan, &library),
            source: "keyloop:module:programming-basics:naming".to_string(),
        },
        ProgrammingBasicsPractice::TechnicalTerms => PracticeTarget {
            mode: Mode::Words,
            text: build_lesson_words(&plan, &library),
            source: "keyloop:module:programming-basics:technical-terms".to_string(),
        },
        ProgrammingBasicsPractice::Mix => {
            let mut build_state = PlanBuildState::from_records(records);
            let readiness = ModuleReadiness::from_records(records);
            let mut context = LessonBuildContext {
                records,
                repo: None,
                plan: &plan,
                library: &library,
                code_config,
                build_state: &mut build_state,
                readiness: &readiness,
            };
            programming_basics_mix(&mut context)
        }
    })
}

pub fn build_daily_practice_plan(
    records: &[SessionRecord],
    repo: Option<&Path>,
    plan: &PracticePlan,
    code_config: &CodePracticeConfig,
) -> Result<DailyPracticePlan> {
    let library = library::load()?;
    let today = Local::now().date_naive();
    let completed_ms = records
        .iter()
        .filter(|record| record.started_at.with_timezone(&Local).date_naive() == today)
        .map(|record| record.duration_ms)
        .sum::<u64>();

    let recent_records = records.iter().collect::<Vec<_>>();
    let mut build_state = PlanBuildState::from_records(&recent_records);
    let readiness = ModuleReadiness::from_records(&recent_records);
    let mut build_context = LessonBuildContext {
        records: &recent_records,
        repo,
        plan,
        library: &library,
        code_config,
        build_state: &mut build_state,
        readiness: &readiness,
    };
    let mut occurrence_counts = std::collections::BTreeMap::<LessonKind, usize>::new();
    let mut lessons = Vec::new();
    for (kind, module, category) in comprehensive_module_sequence(&readiness, plan) {
        let lesson_id = next_lesson_id(kind, &mut occurrence_counts);
        let lesson =
            build_module_mix_lesson(lesson_id, kind, module, category, &mut build_context)?;
        build_context.build_state.observe_lesson(&lesson);
        lessons.push(lesson);
    }

    Ok(DailyPracticePlan {
        run_id: String::new(),
        run_number: 0,
        target_minutes: 20,
        completed_ms,
        lessons,
    })
}

struct LessonBuildContext<'a> {
    records: &'a [&'a SessionRecord],
    repo: Option<&'a Path>,
    plan: &'a PracticePlan,
    library: &'a ContentLibrary,
    code_config: &'a CodePracticeConfig,
    build_state: &'a mut PlanBuildState,
    readiness: &'a ModuleReadiness,
}

#[derive(Debug, Default)]
struct PlanBuildState {
    used_foundation_lines: HashSet<String>,
    used_code_snippet_texts: HashSet<String>,
}

impl PlanBuildState {
    fn from_records(records: &[&SessionRecord]) -> Self {
        Self {
            used_foundation_lines: records
                .iter()
                .filter(|record| record.source.starts_with("keyloop:foundation:"))
                .flat_map(|record| record.target_text.lines())
                .map(str::trim)
                .filter(|line| !line.is_empty())
                .map(ToOwned::to_owned)
                .collect(),
            used_code_snippet_texts: used_code_snippet_texts(records),
        }
    }

    fn observe_lesson(&mut self, lesson: &PracticeLesson) {
        match lesson.kind {
            LessonKind::Foundation => {
                self.used_foundation_lines.extend(
                    lesson
                        .target
                        .text
                        .lines()
                        .map(str::trim)
                        .filter(|line| !line.is_empty())
                        .map(ToOwned::to_owned),
                );
            }
            LessonKind::CodeBlock => {
                self.used_code_snippet_texts.extend(
                    lesson
                        .target
                        .text
                        .split("\n\n")
                        .map(str::trim)
                        .filter(|snippet| !snippet.is_empty())
                        .map(ToOwned::to_owned),
                );
            }
            _ => {}
        }
    }
}

#[derive(Debug, Default)]
struct ModuleReadiness {
    stable_modules: BTreeSet<TrainingModule>,
    weak_modules: BTreeSet<TrainingModule>,
}

impl ModuleReadiness {
    fn from_records(records: &[&SessionRecord]) -> Self {
        let recent_cutoff = Utc::now() - Duration::days(PLAN_HISTORY_DAYS);
        let mut stats = BTreeMap::<TrainingModule, ModulePerformance>::new();

        for record in records {
            if record.started_at < recent_cutoff || !is_adaptive_module(record.module) {
                continue;
            }
            let typed_len = effective_module_typed_len(record);
            if typed_len == 0 && record.target_len == 0 {
                continue;
            }
            stats
                .entry(record.module)
                .or_default()
                .add(record, typed_len);
        }

        let mut readiness = Self::default();
        for (module, performance) in stats {
            if performance.is_weak() {
                readiness.weak_modules.insert(module);
            } else if performance.is_stable() {
                readiness.stable_modules.insert(module);
            }
        }
        readiness
    }

    fn is_stable(&self, module: TrainingModule) -> bool {
        self.stable_modules.contains(&module)
    }

    fn is_weak(&self, module: TrainingModule) -> bool {
        self.weak_modules.contains(&module)
    }

    fn should_skip_module(&self, module: TrainingModule, plan: &PracticePlan) -> bool {
        module != TrainingModule::CodePractice
            && self.is_stable(module)
            && !self.is_weak(module)
            && !module_has_current_focus(module, plan)
    }
}

#[derive(Debug, Default)]
struct ModulePerformance {
    samples: u32,
    completed_samples: u32,
    typed_len: usize,
    correct_chars: usize,
    errors: u32,
    backspaces: u32,
}

impl ModulePerformance {
    fn add(&mut self, record: &SessionRecord, typed_len: usize) {
        self.samples += 1;
        if record.completion_state == CompletionState::Completed {
            self.completed_samples += 1;
        }
        self.typed_len += typed_len;
        self.correct_chars += record
            .correct_chars
            .max((record.accuracy.clamp(0.0, 100.0) / 100.0 * typed_len as f64).round() as usize);
        self.errors += record.error_count;
        self.backspaces += record.backspace_count;
    }

    fn accuracy(&self) -> f64 {
        if self.typed_len == 0 {
            return 0.0;
        }
        self.correct_chars as f64 / self.typed_len as f64 * 100.0
    }

    fn error_rate(&self) -> f64 {
        if self.typed_len == 0 {
            return 0.0;
        }
        f64::from(self.errors) / self.typed_len as f64 * 100.0
    }

    fn is_stable(&self) -> bool {
        self.completed_samples >= 3
            && self.typed_len >= 180
            && self.accuracy() >= 97.0
            && self.error_rate() <= 2.5
            && self.backspaces <= self.samples * 4
    }

    fn is_weak(&self) -> bool {
        self.samples >= 1
            && self.typed_len >= 20
            && (self.accuracy() < 92.0
                || self.error_rate() >= 8.0
                || self.backspaces >= self.samples * 12)
    }
}

fn is_adaptive_module(module: TrainingModule) -> bool {
    matches!(
        module,
        TrainingModule::FoundationInput
            | TrainingModule::EverydayEnglish
            | TrainingModule::ProgrammingBasics
            | TrainingModule::CodePractice
    )
}

fn module_has_current_focus(module: TrainingModule, plan: &PracticePlan) -> bool {
    match module {
        TrainingModule::FoundationInput => !plan.focus_keys.is_empty(),
        TrainingModule::EverydayEnglish => !plan.focus_words.is_empty(),
        TrainingModule::ProgrammingBasics => {
            !plan.focus_symbols.is_empty() || !plan.focus_words.is_empty()
        }
        TrainingModule::CodePractice => !plan.focus_code.is_empty(),
        _ => false,
    }
}

fn effective_module_typed_len(record: &SessionRecord) -> usize {
    if record.typed_len > 0 {
        return record.typed_len;
    }
    record.user_input.chars().count().max(record.correct_chars)
}

pub fn build_foundation_target(
    records: &[&SessionRecord],
    drill_id: &str,
    line_count: usize,
) -> Result<PracticeTarget> {
    let library = library::load()?;
    Ok(build_foundation_target_from_library(
        &library,
        records,
        drill_id,
        line_count,
        &HashSet::new(),
    ))
}

pub fn build_foundation_mix_target(records: &[&SessionRecord]) -> Result<PracticeTarget> {
    let library = library::load()?;
    let owned_records = records.iter().copied().cloned().collect::<Vec<_>>();
    let plan = crate::plan::build_plan(&owned_records, Language::Zh);
    let mut build_state = PlanBuildState::from_records(records);
    let readiness = ModuleReadiness::from_records(records);
    let code_config = CodePracticeConfig::default();
    let mut context = LessonBuildContext {
        records,
        repo: None,
        plan: &plan,
        library: &library,
        code_config: &code_config,
        build_state: &mut build_state,
        readiness: &readiness,
    };
    Ok(foundation_mix(&mut context))
}

fn build_foundation_target_from_library(
    library: &ContentLibrary,
    records: &[&SessionRecord],
    drill_id: &str,
    line_count: usize,
    extra_used: &HashSet<String>,
) -> PracticeTarget {
    let Some(drill) = library
        .foundation_drills
        .iter()
        .find(|drill| drill.id == drill_id)
        .or_else(|| library.foundation_drills.first())
    else {
        return PracticeTarget {
            mode: Mode::Chars,
            text: build_lesson_chars(library),
            source: "keyloop:foundation-fallback".to_string(),
        };
    };

    let mut used = used_foundation_lines(records, &drill.id);
    used.extend(extra_used.iter().cloned());
    let mut pool = drill
        .items
        .iter()
        .filter(|item| !used.contains(item.as_str()))
        .cloned()
        .collect::<Vec<_>>();
    if pool.len() < line_count {
        pool = drill.items.clone();
    }
    pool.shuffle(&mut rand::thread_rng());
    pool.truncate(line_count);

    PracticeTarget {
        mode: Mode::Chars,
        text: pool.join("\n"),
        source: format!("keyloop:foundation:{}", drill.id),
    }
}

fn build_module_mix_lesson(
    id: String,
    kind: LessonKind,
    module: TrainingModule,
    category: TrainingCategory,
    context: &mut LessonBuildContext<'_>,
) -> Result<PracticeLesson> {
    let target = match module {
        TrainingModule::FoundationInput => foundation_mix(context),
        TrainingModule::EverydayEnglish => everyday_english_mix(
            context.plan,
            context.library,
            EverydayEnglishSettings::default(),
            MixProfile::Comprehensive,
        ),
        TrainingModule::ProgrammingBasics => programming_basics_mix(context),
        TrainingModule::CodePractice => code_practice_mix(context)?,
        _ => unreachable!("unsupported comprehensive module"),
    };
    let estimated_minutes = module_estimated_minutes(module, context.readiness);
    let (reason_zh, reason_en) = module_reason(module, context.readiness);

    Ok(PracticeLesson {
        id,
        kind,
        module,
        category,
        mix_profile: MixProfile::Comprehensive,
        estimated_minutes,
        target,
        reason_zh,
        reason_en,
    })
}

fn module_estimated_minutes(module: TrainingModule, readiness: &ModuleReadiness) -> u16 {
    if readiness.is_stable(module) && module == TrainingModule::CodePractice {
        3
    } else {
        4
    }
}

fn module_reason(module: TrainingModule, readiness: &ModuleReadiness) -> (String, String) {
    let (mut zh, mut en) = match module {
        TrainingModule::FoundationInput => (
            "基础输入综合：覆盖 home/top/bottom row，并加重最近弱键。".to_string(),
            "Foundation mix: cover rows and increase recent weak keys.".to_string(),
        ),
        TrainingModule::EverydayEnglish => (
            "日常英语综合：常见词、词块和自然英文输入。".to_string(),
            "Everyday English mix: common words, chunks, and natural English.".to_string(),
        ),
        TrainingModule::ProgrammingBasics => (
            "编程基础综合：数字、符号、命名和技术词。".to_string(),
            "Programming basics mix: numbers, symbols, naming, and technical terms.".to_string(),
        ),
        TrainingModule::CodePractice => (
            "代码实战综合：把前面的弱点放回完整代码里。".to_string(),
            "Code practice mix: move weak items back into complete code.".to_string(),
        ),
        _ => unreachable!("unsupported comprehensive module"),
    };

    if readiness.is_weak(module) {
        zh.push_str(" 短复习：根据最近错项/慢项加权。");
        en.push_str(" Short review: weighted by recent errors and slow items.");
    } else if readiness.is_stable(module) {
        zh.push_str(" 已稳定：本轮降频或缩短。");
        en.push_str(" Stable: reduced or shortened this round.");
    }

    (zh, en)
}

fn next_lesson_id(
    kind: LessonKind,
    occurrence_counts: &mut std::collections::BTreeMap<LessonKind, usize>,
) -> String {
    let count = occurrence_counts.entry(kind).or_default();
    *count += 1;
    format!("daily:{}:{}", lesson_kind_slug(kind), count)
}

fn lesson_kind_slug(kind: LessonKind) -> &'static str {
    match kind {
        LessonKind::Foundation => "foundation",
        LessonKind::Warmup => "warmup",
        LessonKind::Chunks => "chunks",
        LessonKind::CommonWords => "common-words",
        LessonKind::Words => "words",
        LessonKind::Symbols => "symbols",
        LessonKind::Naming => "naming",
        LessonKind::CodeBlock => "code-block",
    }
}

fn comprehensive_module_sequence(
    readiness: &ModuleReadiness,
    plan: &PracticePlan,
) -> Vec<(LessonKind, TrainingModule, TrainingCategory)> {
    let base = vec![
        (
            LessonKind::Foundation,
            TrainingModule::FoundationInput,
            TrainingCategory::FoundationMix,
        ),
        (
            LessonKind::CommonWords,
            TrainingModule::EverydayEnglish,
            TrainingCategory::EverydayMix,
        ),
        (
            LessonKind::Symbols,
            TrainingModule::ProgrammingBasics,
            TrainingCategory::ProgrammingBasicsMix,
        ),
        (
            LessonKind::CodeBlock,
            TrainingModule::CodePractice,
            TrainingCategory::CodeMix,
        ),
    ];
    let filtered = base
        .iter()
        .copied()
        .filter(|(_, module, _)| !readiness.should_skip_module(*module, plan))
        .collect::<Vec<_>>();

    if filtered.len() >= 3 { filtered } else { base }
}

fn foundation_mix(context: &mut LessonBuildContext<'_>) -> PracticeTarget {
    let drill_id = foundation_drill_for_keys(&context.plan.focus_keys);
    let mut target = build_foundation_target_from_library(
        context.library,
        context.records,
        drill_id,
        if context.plan.has_recent_history {
            8
        } else {
            6
        },
        &context.build_state.used_foundation_lines,
    );
    let mut warmup = repeat_pool(&context.library.warmup, 4);
    warmup.truncate(4);
    if !warmup.is_empty() {
        target.text = format!("{}\n{}", warmup.join("\n"), target.text);
    }
    target.source = format!("keyloop:module:foundation-mix:{drill_id}");
    target
}

fn everyday_english_mix(
    plan: &PracticePlan,
    library: &ContentLibrary,
    settings: EverydayEnglishSettings,
    profile: MixProfile,
) -> PracticeTarget {
    let corpus_words = everyday_words(library, 3);
    let common = corpus_words
        .iter()
        .chain(library.common_words.iter())
        .map(|word| word.as_str())
        .collect::<HashSet<_>>();
    let mut chosen = plan
        .focus_words
        .iter()
        .map(|word| word.to_ascii_lowercase())
        .filter(|word| common.contains(word.as_str()))
        .collect::<Vec<_>>();
    if corpus_words.is_empty() {
        fill_from(&mut chosen, &library.common_words, settings.word_count);
    } else {
        fill_from(&mut chosen, &corpus_words, settings.word_count);
    }
    let per_line = match profile {
        MixProfile::Comprehensive => 8,
        MixProfile::Standalone => 10,
        MixProfile::Review => 6,
    };
    let mut lines = chunk_words(&chosen, per_line);
    if settings.include_phrases {
        let phrases = everyday_phrases(library);
        if phrases.is_empty() {
            lines.push(build_lesson_word_chunks(plan, library));
        } else {
            lines.extend(chunk_words(&phrases, 3).into_iter().take(2));
        }
    }
    let sentences = everyday_sentences(library, settings.sentence_length);
    if !sentences.is_empty() {
        lines.extend(sentences.into_iter().take(match profile {
            MixProfile::Comprehensive => 3,
            MixProfile::Standalone => 5,
            MixProfile::Review => 2,
        }));
    }
    PracticeTarget {
        mode: Mode::Words,
        text: lines.join("\n"),
        source: format!(
            "keyloop:module:everyday-english:words-{}:sentences-{}",
            settings.word_count,
            sentence_length_slug(settings.sentence_length)
        ),
    }
}

fn everyday_word_target(
    library: &ContentLibrary,
    scope: EverydayPracticeScope,
    word_count: usize,
) -> PracticeTarget {
    let mut pool = everyday_words(library, scope.tier_limit());
    for word in &library.common_words {
        if pool.len() >= word_count {
            break;
        }
        if !pool.iter().any(|existing| existing == word) {
            pool.push(word.clone());
        }
    }
    pool.shuffle(&mut rand::thread_rng());
    pool.truncate(word_count);

    PracticeTarget {
        mode: Mode::Words,
        text: pool.join(" "),
        source: format!(
            "keyloop:module:everyday-english:{}:words-{}",
            scope.source_slug(),
            word_count
        ),
    }
}

fn everyday_sentence_target(
    library: &ContentLibrary,
    settings: EverydayEnglishSettings,
) -> PracticeTarget {
    let mut sentences = everyday_sentences(library, settings.sentence_length);
    sentences.shuffle(&mut rand::thread_rng());
    sentences.truncate(6);

    PracticeTarget {
        mode: Mode::Words,
        text: sentences.join("\n"),
        source: format!(
            "keyloop:module:everyday-english:sentences-{}",
            sentence_length_slug(settings.sentence_length)
        ),
    }
}

fn everyday_words(library: &ContentLibrary, tier_limit: u8) -> Vec<String> {
    library
        .everyday_english
        .entries
        .iter()
        .filter(|entry| !entry.source_id.trim().is_empty())
        .filter(|entry| {
            matches!(
                entry.domain,
                library::EverydayEntryDomain::Everyday | library::EverydayEntryDomain::Workplace
            )
        })
        .filter(|entry| entry.kind == EverydayEntryKind::Word)
        .filter(|entry| entry.tier.unwrap_or(u8::MAX) <= tier_limit)
        .map(|entry| entry.text.clone())
        .collect()
}

fn everyday_phrases(library: &ContentLibrary) -> Vec<String> {
    library
        .everyday_english
        .entries
        .iter()
        .filter(|entry| !entry.source_id.trim().is_empty())
        .filter(|entry| {
            matches!(
                entry.domain,
                library::EverydayEntryDomain::Everyday | library::EverydayEntryDomain::Workplace
            )
        })
        .filter(|entry| entry.kind == EverydayEntryKind::Phrase)
        .map(|entry| entry.text.clone())
        .collect()
}

fn everyday_sentences(library: &ContentLibrary, length: EverydaySentenceLength) -> Vec<String> {
    library
        .everyday_english
        .entries
        .iter()
        .filter(|entry| !entry.source_id.trim().is_empty())
        .filter(|entry| {
            matches!(
                entry.domain,
                library::EverydayEntryDomain::Everyday | library::EverydayEntryDomain::Workplace
            )
        })
        .filter(|entry| entry.kind == EverydayEntryKind::Sentence)
        .filter(|entry| length == EverydaySentenceLength::Mixed || entry.length == Some(length))
        .map(|entry| entry.text.clone())
        .collect()
}

#[cfg(test)]
fn everyday_meaning_lines(text: &str, max_words: usize) -> Vec<String> {
    let mut seen = BTreeSet::new();
    text.split(|ch: char| !ch.is_ascii_alphabetic())
        .filter(|word| !word.is_empty())
        .filter_map(|word| {
            let key = word.to_ascii_lowercase();
            let meaning = everyday_meaning_zh(&key)?;
            if !seen.insert(key.clone()) {
                return None;
            }
            Some(format!("{key}: {meaning}"))
        })
        .take(max_words)
        .collect()
}

pub fn everyday_word_meaning(word: &str) -> Option<&'static str> {
    everyday_meaning_zh(&word.to_ascii_lowercase())
}

fn everyday_meaning_zh(word: &str) -> Option<&'static str> {
    Some(match word {
        "about" => "关于",
        "after" => "在之后",
        "again" => "再次",
        "always" => "总是",
        "around" => "周围",
        "before" => "在之前",
        "better" => "更好",
        "between" => "在之间",
        "change" => "改变",
        "during" => "在期间",
        "enough" => "足够",
        "family" => "家庭",
        "friend" => "朋友",
        "garden" => "花园",
        "happen" => "发生",
        "inside" => "里面",
        "listen" => "听",
        "market" => "市场",
        "morning" => "早晨",
        "outside" => "外面",
        "practice" => "练习",
        "question" => "问题",
        "really" => "确实",
        "simple" => "简单",
        "today" => "今天",
        "tomorrow" => "明天",
        "together" => "一起",
        "usually" => "通常",
        "weather" => "天气",
        "without" => "没有",
        "already" => "已经",
        "another" => "另一个",
        "careful" => "小心的",
        "compare" => "比较",
        "deliver" => "交付",
        "discuss" => "讨论",
        "explain" => "解释",
        "follow" => "跟随",
        "improve" => "改进",
        "prepare" => "准备",
        "request" => "请求",
        "schedule" => "安排",
        "support" => "支持",
        "update" => "更新",
        "confirm" => "确认",
        "deadline" => "截止时间",
        "feedback" => "反馈",
        "priority" => "优先级",
        "progress" => "进展",
        "proposal" => "提案",
        "review" => "复盘/审查",
        "timeline" => "时间线",
        _ => return None,
    })
}

fn sentence_length_slug(length: EverydaySentenceLength) -> &'static str {
    match length {
        EverydaySentenceLength::Short => "short",
        EverydaySentenceLength::Medium => "medium",
        EverydaySentenceLength::Long => "long",
        EverydaySentenceLength::Mixed => "mixed",
    }
}

fn programming_basics_mix(context: &mut LessonBuildContext<'_>) -> PracticeTarget {
    let mut lines = Vec::new();
    let feedback_terms = recent_feedback_terms(context.records);
    if !feedback_terms.is_empty() {
        lines.push(chunk_words(&feedback_terms, 4).join("\n"));
    }
    lines.push(build_lesson_symbols(
        context.plan,
        context.library,
        context.code_config,
    ));
    lines.push(build_lesson_naming(context.plan, context.library));
    lines.push(build_lesson_words(context.plan, context.library));
    PracticeTarget {
        mode: Mode::Symbols,
        text: lines.join("\n"),
        source: "keyloop:module:programming-basics-mix".to_string(),
    }
}

fn recent_feedback_terms(records: &[&SessionRecord]) -> Vec<String> {
    let mut terms = records
        .iter()
        .rev()
        .take(4)
        .flat_map(|record| {
            let feedback = feedback::group_feedback(record);
            feedback
                .error_tokens
                .into_iter()
                .map(|(token, _)| token)
                .chain(feedback.slow_tokens.into_iter().map(|(token, _)| token))
                .chain(feedback.error_keys.into_iter().map(|(key, _)| key))
        })
        .filter(|term| !term.trim().is_empty())
        .collect::<Vec<_>>();
    terms = unique_focus(&terms);
    terms.truncate(12);
    terms
}

fn code_practice_mix(context: &mut LessonBuildContext<'_>) -> Result<PracticeTarget> {
    let mut target = build_code_lesson_target(
        context.records,
        context.repo,
        context.plan,
        context.library,
        context.code_config,
        &context.build_state.used_code_snippet_texts,
    )?;
    target.source = "keyloop:module:code-practice-mix".to_string();
    Ok(target)
}

fn foundation_drill_for_keys(keys: &[String]) -> &'static str {
    if keys
        .iter()
        .any(|key| matches!(key.as_str(), ";" | "'" | "/" | "," | "." | "`" | "-" | "="))
    {
        return "punctuation-edges";
    }
    if keys.iter().any(|key| {
        matches!(
            key.as_str(),
            "q" | "w" | "e" | "r" | "t" | "y" | "u" | "i" | "o" | "p"
        )
    }) {
        return "top-row";
    }
    if keys
        .iter()
        .any(|key| matches!(key.as_str(), "z" | "x" | "c" | "v" | "b" | "n" | "m"))
    {
        return "bottom-row";
    }
    if keys.iter().any(|key| {
        matches!(
            key.as_str(),
            "f" | "g" | "h" | "j" | "r" | "t" | "y" | "u" | "v" | "b" | "n" | "m"
        )
    }) {
        return "index-fingers";
    }
    if keys
        .iter()
        .any(|key| matches!(key.as_str(), "a" | "q" | "z" | "p" | "[" | "]" | "\\"))
    {
        return "pinky-fingers";
    }
    "home-row"
}

fn build_lesson_chars(library: &ContentLibrary) -> String {
    let mut chunks = repeat_pool(&library.warmup, 10);
    chunks.truncate(10);
    chunks.join("\n")
}

fn build_lesson_word_chunks(plan: &PracticePlan, library: &ContentLibrary) -> String {
    let mut chunks = focus_word_chunks(&plan.focus_words);
    let remaining = 10usize.saturating_sub(chunks.len());
    append_from(&mut chunks, &library.word_chunks, remaining);
    chunks.truncate(10);
    chunks.join("\n")
}

fn build_lesson_words(plan: &PracticePlan, library: &ContentLibrary) -> String {
    let mut chosen = unique_focus(&plan.focus_words);
    fill_from(&mut chosen, &library.programming_words, 16);
    chosen.truncate(16);
    chunk_words(&chosen, 4).join("\n")
}

fn build_lesson_symbols(
    plan: &PracticePlan,
    library: &ContentLibrary,
    code_config: &CodePracticeConfig,
) -> String {
    let mut chosen = unique_focus(&plan.focus_symbols);
    let mut specific = language_symbol_items(library, code_config);
    specific.shuffle(&mut rand::thread_rng());
    append_from(&mut chosen, &specific, 6);
    fill_from(&mut chosen, &library.symbols, 18);
    append_from(&mut chosen, &library.number_drills, 2);
    chosen.truncate(26);
    chunk_words(&chosen, 5).join("\n")
}

fn language_symbol_items(
    library: &ContentLibrary,
    code_config: &CodePracticeConfig,
) -> Vec<String> {
    if code_config.is_empty() {
        return Vec::new();
    }

    let mut items = Vec::new();
    for set in &library.language_symbols {
        if symbol_set_matches(
            set.language.as_deref(),
            &code_config.language,
            &code_config.languages,
        ) || symbol_set_matches(
            set.framework.as_deref(),
            &code_config.framework,
            &code_config.frameworks,
        ) {
            items.extend(set.items.iter().cloned());
        }
    }
    items
}

fn symbol_set_matches(value: Option<&str>, single: &Option<String>, many: &[String]) -> bool {
    let Some(value) = value else {
        return false;
    };
    single
        .as_deref()
        .map(|expected| value.eq_ignore_ascii_case(expected))
        .unwrap_or(false)
        || many
            .iter()
            .any(|expected| value.eq_ignore_ascii_case(expected))
}

fn build_lesson_naming(plan: &PracticePlan, library: &ContentLibrary) -> String {
    let mut chunks = focus_naming_lines(&plan.focus_words);
    let remaining = 5usize.saturating_sub(chunks.len());
    append_from(&mut chunks, &library.naming, remaining);
    chunks.truncate(5);
    chunks.join("\n")
}

fn focus_word_chunks(words: &[String]) -> Vec<String> {
    let mut chunks = Vec::new();
    for word in words.iter().take(5) {
        let original = word.trim();
        let parts = identifier_parts(original);
        if parts.len() >= 2 {
            let part_line = parts.iter().take(5).cloned().collect::<Vec<_>>().join(" ");
            chunks.push(unique_line_items([part_line, original.to_string()]));
            continue;
        }

        let Some(word) = parts.first() else {
            continue;
        };
        if word.chars().count() < 4 {
            continue;
        }
        let letters = word.chars().collect::<Vec<_>>();
        let prefix = letters.iter().take(3).collect::<String>();
        let suffix = letters
            .iter()
            .rev()
            .take(3)
            .copied()
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<String>();
        chunks.push(format!("{prefix} {suffix} {word} {word}"));
    }
    chunks
}

fn focus_naming_lines(words: &[String]) -> Vec<String> {
    let mut lines = Vec::new();
    for word in words.iter().take(4) {
        let original = word.trim();
        let parts = identifier_parts(original);
        if parts.is_empty() || parts.iter().map(|part| part.len()).sum::<usize>() < 4 {
            continue;
        }
        let camel = camel_case(&parts);
        let pascal = pascal_case(&parts);
        let constant = parts
            .iter()
            .map(|part| part.to_ascii_uppercase())
            .collect::<Vec<_>>()
            .join("_");
        lines.push(unique_line_items([
            original.to_string(),
            camel,
            pascal.clone(),
            format!("get{pascal}"),
            constant,
        ]));
    }
    lines
}

fn identifier_parts(value: &str) -> Vec<String> {
    let chars = value.chars().collect::<Vec<_>>();
    let mut parts = Vec::new();
    let mut current = String::new();

    for (index, ch) in chars.iter().copied().enumerate() {
        if !ch.is_ascii_alphanumeric() {
            push_identifier_part(&mut parts, &mut current);
            continue;
        }

        if !current.is_empty() && starts_identifier_boundary(&chars, index) {
            push_identifier_part(&mut parts, &mut current);
        }
        current.push(ch.to_ascii_lowercase());
    }
    push_identifier_part(&mut parts, &mut current);
    parts
}

fn starts_identifier_boundary(chars: &[char], index: usize) -> bool {
    if index == 0 {
        return false;
    }
    let ch = chars[index];
    let prev = chars[index - 1];
    if !prev.is_ascii_alphanumeric() {
        return false;
    }
    if ch.is_ascii_digit() {
        return !prev.is_ascii_digit();
    }
    if prev.is_ascii_digit() {
        return true;
    }
    if ch.is_ascii_uppercase() && prev.is_ascii_lowercase() {
        return true;
    }
    ch.is_ascii_uppercase()
        && prev.is_ascii_uppercase()
        && chars
            .get(index + 1)
            .is_some_and(|next| next.is_ascii_lowercase())
}

fn push_identifier_part(parts: &mut Vec<String>, current: &mut String) {
    if !current.is_empty() {
        parts.push(std::mem::take(current));
    }
}

fn camel_case(parts: &[String]) -> String {
    let Some((first, rest)) = parts.split_first() else {
        return String::new();
    };
    let mut output = first.clone();
    for part in rest {
        output.push_str(&capitalize_ascii(part));
    }
    output
}

fn pascal_case(parts: &[String]) -> String {
    parts
        .iter()
        .map(|part| capitalize_ascii(part))
        .collect::<String>()
}

fn capitalize_ascii(value: &str) -> String {
    let mut chars = value.chars();
    let Some(first) = chars.next() else {
        return String::new();
    };
    first.to_ascii_uppercase().to_string() + chars.as_str()
}

fn unique_line_items(items: impl IntoIterator<Item = String>) -> String {
    let mut seen = HashSet::new();
    items
        .into_iter()
        .filter(|item| !item.trim().is_empty())
        .filter(|item| seen.insert(item.to_ascii_lowercase()))
        .collect::<Vec<_>>()
        .join(" ")
}

fn build_code_lesson_target(
    records: &[&SessionRecord],
    repo: Option<&Path>,
    plan: &PracticePlan,
    library: &ContentLibrary,
    code_config: &CodePracticeConfig,
    excluded_code_texts: &HashSet<String>,
) -> Result<PracticeTarget> {
    let difficulty = code_difficulty_for_records(records);
    let (snippets, scan_error) = match repo {
        Some(repo) => match extract_snippets(repo) {
            Ok(snippets) => (snippets, None),
            Err(error) => (Vec::new(), Some(error.to_string())),
        },
        None => (Vec::new(), None),
    };
    let mut picked = snippets::pick_code_snippets_excluding_by_difficulty(
        &snippets,
        &plan.focus_code,
        code_config,
        3,
        excluded_code_texts,
        difficulty,
    );
    let repo_count = picked.len();
    if picked.len() < 3 {
        for fallback in snippets::pick_builtin_code_excluding_by_difficulty(
            &library.code_snippets,
            &plan.focus_code,
            code_config,
            3 - picked.len(),
            excluded_code_texts,
            difficulty,
        ) {
            if !picked.iter().any(|snippet| snippet.text == fallback.text) {
                picked.push(fallback);
            }
        }
    }
    if picked.len() < 3 {
        for fallback in snippets::pick_builtin_code(
            &library.code_snippets,
            &plan.focus_code,
            code_config,
            3 - picked.len(),
        ) {
            if !picked.iter().any(|snippet| snippet.text == fallback.text) {
                picked.push(fallback);
            }
        }
    }
    if repo_count > 0 {
        return Ok(PracticeTarget {
            mode: Mode::Code,
            text: join_snippets(&picked),
            source: match repo {
                Some(repo) if repo_count == picked.len() => repo.display().to_string(),
                Some(repo) => format!("{} + keyloop:fallback-code", repo.display()),
                None => "keyloop:code-corpus".to_string(),
            },
        });
    }

    let mut picked = snippets::pick_builtin_code_excluding_by_difficulty(
        &library.code_snippets,
        &plan.focus_code,
        code_config,
        4,
        excluded_code_texts,
        difficulty,
    );
    if picked.len() < 4 {
        for fallback in snippets::pick_builtin_code(
            &library.code_snippets,
            &plan.focus_code,
            code_config,
            4 - picked.len(),
        ) {
            if !picked.iter().any(|snippet| snippet.text == fallback.text) {
                picked.push(fallback);
            }
        }
    }

    Ok(PracticeTarget {
        mode: Mode::Code,
        text: join_snippets(&picked),
        source: scan_error
            .map(|error| format!("keyloop:code-corpus (repo scan failed: {error})"))
            .unwrap_or_else(|| "keyloop:code-corpus".into()),
    })
}

pub fn build_code_specialist_target(
    records: &[&SessionRecord],
    code_config: &CodePracticeConfig,
    count: usize,
) -> Result<PracticeTarget> {
    let library = library::load()?;
    let used = used_code_snippet_texts(records);
    let difficulty = code_difficulty_for_records(records);
    let mut picked = snippets::pick_builtin_code_excluding_by_difficulty(
        &library.code_snippets,
        &[],
        code_config,
        count,
        &used,
        difficulty,
    );

    if picked.len() < count {
        for fallback in snippets::pick_builtin_code(
            &library.code_snippets,
            &[],
            code_config,
            count - picked.len(),
        ) {
            if !picked.iter().any(|snippet| snippet.text == fallback.text) {
                picked.push(fallback);
            }
        }
    }

    Ok(PracticeTarget {
        mode: Mode::Code,
        text: join_snippets(&picked),
        source: code_specialist_source(code_config, picked.len()),
    })
}

fn join_snippets(snippets: &[CodeSnippet]) -> String {
    snippets
        .iter()
        .map(|snippet| snippet.text.as_str())
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn used_code_snippet_texts(records: &[&SessionRecord]) -> HashSet<String> {
    records
        .iter()
        .filter(|record| record.mode == Mode::Code)
        .flat_map(|record| record.target_text.split("\n\n"))
        .map(str::trim)
        .filter(|snippet| !snippet.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

fn code_difficulty_for_records(records: &[&SessionRecord]) -> Option<&'static str> {
    let code_records = records
        .iter()
        .copied()
        .filter(|record| record.mode == Mode::Code && record.typed_len > 0)
        .collect::<Vec<_>>();
    if code_records.is_empty() {
        return None;
    }

    let total_typed = code_records
        .iter()
        .map(|record| record.typed_len.max(record.target_len))
        .sum::<usize>();
    let total_errors = code_records
        .iter()
        .map(|record| record.error_count as usize)
        .sum::<usize>();
    let weighted_accuracy = code_records
        .iter()
        .map(|record| record.accuracy * record.typed_len.max(1) as f64)
        .sum::<f64>()
        / code_records
            .iter()
            .map(|record| record.typed_len.max(1) as f64)
            .sum::<f64>();
    let weighted_wpm = code_records
        .iter()
        .map(|record| record.wpm * record.duration_ms.max(1) as f64)
        .sum::<f64>()
        / code_records
            .iter()
            .map(|record| record.duration_ms.max(1) as f64)
            .sum::<f64>();
    let error_rate = if total_typed == 0 {
        0.0
    } else {
        total_errors as f64 / total_typed as f64 * 100.0
    };

    if weighted_accuracy >= 97.0 && weighted_wpm >= 24.0 && error_rate <= 3.0 {
        Some("hard")
    } else if weighted_accuracy >= 94.0 && weighted_wpm >= 16.0 && error_rate <= 6.0 {
        Some("medium")
    } else {
        Some("easy")
    }
}

fn used_foundation_lines(records: &[&SessionRecord], drill_id: &str) -> HashSet<String> {
    let source = format!("keyloop:foundation:{drill_id}");
    records
        .iter()
        .filter(|record| record.source == source)
        .flat_map(|record| record.target_text.lines())
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

fn code_specialist_source(config: &CodePracticeConfig, picked_count: usize) -> String {
    let mut parts = vec![format!("level={}", code_level_slug(config.level))];
    append_filter_label(&mut parts, "lang", &config.languages);
    append_filter_label(&mut parts, "framework", &config.frameworks);
    append_filter_label(&mut parts, "project", &config.projects);
    format!("keyloop:code-specialist:{}:{picked_count}", parts.join("+"))
}

fn append_filter_label(parts: &mut Vec<String>, label: &str, values: &[String]) {
    if !values.is_empty() {
        parts.push(format!("{label}={}", values.join(",")));
    }
}

fn code_level_slug(level: Option<CodePracticeLevel>) -> &'static str {
    match level {
        Some(CodePracticeLevel::Block) => "block",
        Some(CodePracticeLevel::Function) => "function",
        Some(CodePracticeLevel::File) => "file",
        None => "mixed",
    }
}

fn unique_focus(focus: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    focus
        .iter()
        .filter(|item| !item.trim().is_empty())
        .filter(|item| seen.insert(item.to_lowercase()))
        .cloned()
        .collect()
}

fn fill_from(chosen: &mut Vec<String>, source: &[String], target_len: usize) {
    let mut pool = source.to_vec();
    pool.shuffle(&mut rand::thread_rng());

    for item in pool {
        if chosen.len() >= target_len {
            break;
        }
        if !chosen.iter().any(|existing| existing == &item) {
            chosen.push(item);
        }
    }
}

fn append_from(chosen: &mut Vec<String>, source: &[String], count: usize) {
    let target_len = chosen.len() + count;
    let mut pool = source.to_vec();
    pool.shuffle(&mut rand::thread_rng());

    for item in pool {
        if chosen.len() >= target_len {
            break;
        }
        if !chosen.iter().any(|existing| existing == &item) {
            chosen.push(item);
        }
    }
}

fn repeat_pool(source: &[String], target_len: usize) -> Vec<String> {
    let mut output = Vec::new();
    while output.len() < target_len {
        let mut pool = source.to_vec();
        pool.shuffle(&mut rand::thread_rng());
        output.extend(pool);
    }
    output.truncate(target_len);
    output
}

fn chunk_words(items: &[String], chunk_size: usize) -> Vec<String> {
    items
        .chunks(chunk_size)
        .map(|chunk| chunk.join(" "))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{CompletionState, TokenKind, TokenStat};

    #[test]
    fn content_library_loads_external_json() {
        let library = library::load().expect("content json should load");
        assert!(library.foundation_drills.len() >= 12);
        assert!(library.warmup.len() >= 180);
        assert!(library.common_words.len() >= 400);
        assert!(library.word_chunks.len() >= 300);
        assert!(library.programming_words.len() >= 800);
        assert!(library.symbols.len() >= 200);
        assert!(library.language_symbols.len() >= 8);
        assert!(library.number_drills.len() >= 80);
        assert!(library.naming.len() >= 300);
        assert!(library.code_snippets.len() >= 1_000);

        let catalog = library::source_catalog().expect("source catalog should load");
        assert!(catalog.iter().any(|source| {
            source.repo == "vitejs/vite"
                && source.license_spdx == "MIT"
                && source
                    .languages
                    .iter()
                    .any(|language| language == "typescript")
                && source
                    .frameworks
                    .iter()
                    .any(|framework| framework == "vite")
                && source.repo_url.starts_with("https://github.com/")
                && !source.source_id.is_empty()
                && !source.retrieved_at.is_empty()
                && !source.notes.is_empty()
        }));
    }

    #[test]
    fn everyday_corpus_entries_have_source_metadata() {
        let library = library::load().expect("content json should load");

        assert!(library.everyday_english.entries.len() >= 80);
        for entry in &library.everyday_english.entries {
            assert!(!entry.text.trim().is_empty());
            assert!(
                library
                    .everyday_english
                    .sources
                    .iter()
                    .any(|source| source.source_id == entry.source_id),
                "missing source metadata for {}",
                entry.text
            );
        }
        for source in &library.everyday_english.sources {
            assert!(!source.source_name.trim().is_empty());
            assert!(!source.source_url.trim().is_empty());
            assert!(!source.license.trim().is_empty());
            assert!(!source.generation_script.trim().is_empty());
            assert!(!source.included_fields.is_empty());
        }
    }

    #[test]
    fn everyday_corpus_can_merge_user_local_entries() {
        let mut base = library::EverydayEnglishCorpus {
            sources: vec![library::EverydayCorpusSource {
                source_id: "keyloop:base".to_string(),
                source_name: "Base corpus".to_string(),
                source_url: "keyloop://base".to_string(),
                license: "MIT".to_string(),
                retrieved_at: "2026-06-01".to_string(),
                generation_script: "manual-curation".to_string(),
                included_fields: vec!["text".to_string(), "source_id".to_string()],
                notes: "Base test corpus.".to_string(),
            }],
            entries: vec![library::EverydayCorpusEntry {
                text: "today".to_string(),
                kind: EverydayEntryKind::Word,
                tier: Some(1),
                length: None,
                domain: library::EverydayEntryDomain::Everyday,
                source_id: "keyloop:base".to_string(),
            }],
        };
        let extra = library::EverydayEnglishCorpus {
            sources: vec![library::EverydayCorpusSource {
                source_id: "user:daily".to_string(),
                source_name: "User daily English".to_string(),
                source_url: "file:///tmp/daily.json".to_string(),
                license: "user-provided".to_string(),
                retrieved_at: "2026-06-01".to_string(),
                generation_script: "user-local-json".to_string(),
                included_fields: vec!["text".to_string(), "kind".to_string()],
                notes: "Local user corpus.".to_string(),
            }],
            entries: vec![library::EverydayCorpusEntry {
                text: "standup summary".to_string(),
                kind: EverydayEntryKind::Phrase,
                tier: Some(2),
                length: None,
                domain: library::EverydayEntryDomain::Workplace,
                source_id: "user:daily".to_string(),
            }],
        };

        library::merge_everyday_corpus(&mut base, extra);

        assert!(
            base.sources
                .iter()
                .any(|source| source.source_id == "user:daily")
        );
        assert!(
            base.entries
                .iter()
                .any(|entry| entry.text == "standup summary")
        );
    }

    #[test]
    fn foundation_drills_are_large_and_unique() {
        let library = library::load().expect("content json should load");
        let mut ids = HashSet::new();

        for drill in &library.foundation_drills {
            assert!(
                ids.insert(drill.id.as_str()),
                "duplicate drill id {}",
                drill.id
            );
            assert!(drill.items.len() >= 40, "{} has too few items", drill.id);
            assert!(!drill.title_zh.trim().is_empty());
            assert!(!drill.title_en.trim().is_empty());
            assert!(!drill.hint_zh.trim().is_empty());
            assert!(!drill.hint_en.trim().is_empty());
        }
    }

    #[test]
    fn foundation_target_avoids_recent_lines() {
        let first = build_foundation_target(&[], "home-row", 12)
            .expect("first foundation target should build");
        let record = SessionRecord {
            mode: Mode::Chars,
            source: first.source.clone(),
            target_text: first.text.clone(),
            ..SessionRecord::default()
        };
        let records = vec![&record];

        let second = build_foundation_target(&records, "home-row", 12)
            .expect("second foundation target should build");

        let first_lines = first.text.lines().map(str::trim).collect::<HashSet<_>>();
        assert!(
            second
                .text
                .lines()
                .map(str::trim)
                .all(|line| !first_lines.contains(line))
        );
    }

    #[test]
    fn code_corpus_has_enough_language_framework_and_level_targets() {
        let library = library::load().expect("content json should load");
        for language in [
            "typescript",
            "javascript",
            "vue",
            "solidity",
            "rust",
            "html",
            "css",
            "scss",
            "less",
        ] {
            let count = library
                .code_snippets
                .iter()
                .filter(|snippet| snippet.language == language)
                .count();
            assert!(count >= 120, "{language} has only {count} snippets");
        }

        let frameworks = library
            .code_snippets
            .iter()
            .map(|snippet| snippet.framework.as_str())
            .collect::<HashSet<_>>();
        for framework in frameworks {
            let count = library
                .code_snippets
                .iter()
                .filter(|snippet| snippet.framework == framework)
                .count();
            assert!(count >= 100, "{framework} has only {count} snippets");
        }

        for level in [
            snippets::CodeSnippetLevel::Block,
            snippets::CodeSnippetLevel::Function,
            snippets::CodeSnippetLevel::File,
        ] {
            let count = library
                .code_snippets
                .iter()
                .filter(|snippet| snippet.level == level)
                .count();
            assert!(count >= 100, "{} has only {count} snippets", level.as_str());
        }

        let react_config = CodePracticeConfig {
            framework: Some("react".to_string()),
            ..CodePracticeConfig::default()
        };
        let solidity_config = CodePracticeConfig {
            language: Some("solidity".to_string()),
            ..CodePracticeConfig::default()
        };

        let react = snippets::pick_builtin_code(&library.code_snippets, &[], &react_config, 5);
        let solidity =
            snippets::pick_builtin_code(&library.code_snippets, &[], &solidity_config, 5);

        assert_eq!(react.len(), 5);
        assert!(
            react
                .iter()
                .all(|snippet| snippet.framework.eq_ignore_ascii_case("react"))
        );
        assert_eq!(solidity.len(), 5);
        assert!(
            solidity
                .iter()
                .all(|snippet| snippet.language.eq_ignore_ascii_case("solidity"))
        );
    }

    #[test]
    fn code_difficulty_follows_recent_code_performance() {
        let strong = SessionRecord {
            mode: Mode::Code,
            typed_len: 240,
            target_len: 240,
            accuracy: 98.0,
            wpm: 28.0,
            error_count: 2,
            duration_ms: 120_000,
            ..SessionRecord::default()
        };
        let weak = SessionRecord {
            mode: Mode::Code,
            typed_len: 100,
            target_len: 120,
            accuracy: 88.0,
            wpm: 8.0,
            error_count: 20,
            duration_ms: 120_000,
            ..SessionRecord::default()
        };

        assert_eq!(code_difficulty_for_records(&[&strong]), Some("hard"));
        assert_eq!(code_difficulty_for_records(&[&weak]), Some("easy"));
        assert_eq!(code_difficulty_for_records(&[]), None);
    }

    #[test]
    fn builtin_picker_can_filter_by_difficulty() {
        let library = library::load().expect("content json should load");
        let picked = snippets::pick_builtin_code_excluding_by_difficulty(
            &library.code_snippets,
            &[],
            &CodePracticeConfig::default(),
            8,
            &HashSet::new(),
            Some("hard"),
        );

        assert_eq!(picked.len(), 8);
        assert!(picked.iter().all(|snippet| snippet.difficulty == "hard"));
    }

    #[test]
    fn code_practice_can_filter_by_level() {
        let library = library::load().expect("content json should load");
        let config = CodePracticeConfig {
            level: Some(CodePracticeLevel::Function),
            ..CodePracticeConfig::default()
        };

        let picked = snippets::pick_builtin_code(&library.code_snippets, &[], &config, 12);

        assert_eq!(picked.len(), 12);
        assert!(
            picked
                .iter()
                .all(|snippet| snippet.level == snippets::CodeSnippetLevel::Function)
        );
    }

    #[test]
    fn generated_code_corpus_does_not_repeat_snippet_text() {
        let library = library::load().expect("content json should load");
        let mut seen = HashSet::new();

        for snippet in library
            .code_snippets
            .iter()
            .filter(|snippet| snippet.source.starts_with("keyloop:generated:"))
        {
            assert!(
                seen.insert(snippet.text.as_str()),
                "duplicate generated snippet: {}",
                snippet.source
            );
        }
    }

    #[test]
    fn generated_code_corpus_avoids_numbered_template_identifiers() {
        let library = library::load().expect("content json should load");

        for snippet in library
            .code_snippets
            .iter()
            .filter(|snippet| snippet.source.starts_with("keyloop:generated:"))
        {
            assert!(
                numbered_template_identifier(&snippet.text).is_none(),
                "numbered generated identifier in {}: {}",
                snippet.source,
                snippet.text
            );
        }
    }

    #[test]
    fn code_practice_options_include_languages_frameworks_and_projects() {
        let options = code_practice_options().expect("code options should load");

        assert!(options.iter().any(|option| {
            option.facet == crate::model::CodePracticeFacet::Language
                && option.value == "typescript"
        }));
        assert!(options.iter().any(|option| {
            option.facet == crate::model::CodePracticeFacet::Framework && option.value == "nestjs"
        }));
        assert!(options.iter().any(|option| {
            option.facet == crate::model::CodePracticeFacet::Project && option.value == "nextjs"
        }));
    }

    #[test]
    fn code_specialist_config_can_match_multiple_selected_tags() {
        let library = library::load().expect("content json should load");
        let config = CodePracticeConfig {
            languages: vec!["solidity".to_string()],
            frameworks: vec!["nestjs".to_string()],
            match_any: true,
            ..CodePracticeConfig::default()
        };

        let picked = snippets::pick_builtin_code(&library.code_snippets, &[], &config, 20);

        assert_eq!(picked.len(), 20);
        assert!(picked.iter().any(|snippet| snippet.language == "solidity"));
        assert!(picked.iter().any(|snippet| snippet.framework == "nestjs"));
        assert!(
            picked
                .iter()
                .all(|snippet| { snippet.language == "solidity" || snippet.framework == "nestjs" })
        );
    }

    #[test]
    fn symbol_lesson_can_include_language_specific_sets() {
        let library = library::load().expect("content json should load");
        let plan = PracticePlan {
            focus_words: Vec::new(),
            focus_symbols: Vec::new(),
            focus_code: Vec::new(),
            focus_keys: Vec::new(),
            advice: Vec::new(),
            recommended_mode: Mode::Symbols,
            has_recent_history: false,
        };
        let config = CodePracticeConfig {
            languages: vec!["rust".to_string()],
            match_any: true,
            ..CodePracticeConfig::default()
        };

        let target = build_lesson_symbols(&plan, &library, &config);

        assert!(target.contains("Result<T, E>") || target.contains(":: ->"));
    }

    #[test]
    fn code_specialist_avoids_recently_practiced_snippets() {
        let config = CodePracticeConfig {
            languages: vec!["rust".to_string()],
            match_any: true,
            ..CodePracticeConfig::default()
        };
        let first = build_code_specialist_target(&[], &config, 4)
            .expect("first specialist target should build");
        let record = SessionRecord {
            mode: Mode::Code,
            target_text: first.text.clone(),
            ..SessionRecord::default()
        };
        let records = vec![&record];

        let second = build_code_specialist_target(&records, &config, 4)
            .expect("second specialist target should build");

        let first_snippets = first
            .text
            .split("\n\n")
            .map(str::trim)
            .collect::<HashSet<_>>();
        assert!(
            second
                .text
                .split("\n\n")
                .map(str::trim)
                .all(|snippet| !first_snippets.contains(snippet))
        );
    }

    #[test]
    fn builtin_code_snippets_have_clean_indentation() {
        let library = library::load().expect("content json should load");
        for snippet in &library.code_snippets {
            let normalized = snippets::CodeSnippet::from_builtin(snippet);
            for line in normalized.text.lines() {
                assert!(
                    !line.ends_with(' ') && !line.ends_with('\t'),
                    "{} has trailing whitespace",
                    snippet.source
                );
            }
            assert!(
                !normalized.text.contains('\t'),
                "{} contains tab indentation",
                snippet.source
            );
        }
    }

    #[test]
    fn source_catalog_covers_all_github_code_sources() {
        let library = library::load().expect("content json should load");
        let catalog = library::source_catalog().expect("source catalog should load");
        let github_repos = library
            .code_snippets
            .iter()
            .filter_map(|snippet| github_repo_from_source(&snippet.source))
            .collect::<HashSet<_>>();

        for repo in github_repos {
            let Some(source) = catalog.iter().find(|source| source.repo == repo) else {
                panic!("missing source catalog entry for {repo}");
            };
            assert_eq!(source.source_id, format!("github:{repo}"));
            assert!(!source.license_spdx.trim().is_empty());
            assert_ne!(source.license_spdx, "NOASSERTION");
        }
    }

    #[test]
    fn daily_plan_has_one_main_group_per_module() {
        let plan = PracticePlan {
            focus_words: Vec::new(),
            focus_symbols: Vec::new(),
            focus_code: Vec::new(),
            focus_keys: Vec::new(),
            advice: Vec::new(),
            recommended_mode: Mode::Chars,
            has_recent_history: false,
        };
        let daily = build_daily_practice_plan(&[], None, &plan, &CodePracticeConfig::default())
            .expect("plan should build");

        assert_eq!(daily.target_minutes, 20);
        assert_eq!(daily.lessons.len(), 4);
        let modules = daily
            .lessons
            .iter()
            .map(|lesson| lesson.module)
            .collect::<Vec<_>>();
        assert_eq!(
            modules,
            vec![
                TrainingModule::FoundationInput,
                TrainingModule::EverydayEnglish,
                TrainingModule::ProgrammingBasics,
                TrainingModule::CodePractice,
            ]
        );
        assert_eq!(daily.lessons[3].kind, LessonKind::CodeBlock);
        assert_eq!(
            daily.lessons[3].target.source,
            "keyloop:module:code-practice-mix"
        );
        assert!(!daily.lessons[3].target.text.trim().is_empty());
    }

    #[test]
    fn everyday_mix_honors_word_count_setting() {
        let library = library::load().expect("library loads");
        let target = everyday_english_mix(
            &PracticePlan {
                focus_words: Vec::new(),
                focus_symbols: Vec::new(),
                focus_code: Vec::new(),
                focus_keys: Vec::new(),
                advice: Vec::new(),
                recommended_mode: Mode::Words,
                has_recent_history: false,
            },
            &library,
            EverydayEnglishSettings {
                word_count: 25,
                include_phrases: false,
                ..EverydayEnglishSettings::default()
            },
            MixProfile::Standalone,
        );

        let word_count = target
            .text
            .lines()
            .take_while(|line| !line.ends_with(['.', '!', '?']))
            .flat_map(str::split_whitespace)
            .count();
        assert!(word_count >= 25, "word_count={word_count}");
        assert!(word_count <= 40, "word_count={word_count}");
    }

    #[test]
    fn everyday_mix_uses_sentence_length_setting_from_clean_corpus() {
        let library = library::load().expect("library loads");
        let target = everyday_english_mix(
            &PracticePlan {
                focus_words: Vec::new(),
                focus_symbols: Vec::new(),
                focus_code: Vec::new(),
                focus_keys: Vec::new(),
                advice: Vec::new(),
                recommended_mode: Mode::Words,
                has_recent_history: false,
            },
            &library,
            EverydayEnglishSettings {
                word_count: 25,
                sentence_length: crate::model::EverydaySentenceLength::Short,
                include_phrases: true,
            },
            MixProfile::Standalone,
        );

        assert!(target.source.contains("sentences-short"));
        assert!(target.text.lines().any(|line| line.contains('.')));
    }

    #[test]
    fn everyday_word_target_respects_scope_and_group_word_count() {
        let target = build_everyday_target(
            &[],
            EverydayPracticeScope::Common500,
            EverydayEnglishSettings {
                word_count: 10,
                include_phrases: false,
                sentence_length: EverydaySentenceLength::Mixed,
            },
        )
        .expect("everyday target should build");

        assert_eq!(target.mode, Mode::Words);
        assert!(target.source.contains("common-500"));
        assert!(target.source.contains("words-10"));
        assert!(target.text.split_whitespace().count() >= 10);
        assert!(!target.text.contains('\n'));
        assert!(!target.text.contains('.'));
    }

    #[test]
    fn everyday_meaning_lines_returns_chinese_glosses_for_displayed_words() {
        let lines = everyday_meaning_lines("practice today before unknown practice", 4);

        assert_eq!(
            lines,
            vec!["practice: 练习", "today: 今天", "before: 在之前"]
        );
    }

    fn numbered_template_identifier(text: &str) -> Option<String> {
        let chars = text.chars().collect::<Vec<_>>();
        let mut index = 0usize;
        while index < chars.len() {
            if !chars[index].is_ascii_alphabetic() {
                index += 1;
                continue;
            }
            let start = index;
            index += 1;
            while index < chars.len()
                && (chars[index].is_ascii_alphanumeric()
                    || chars[index] == '_'
                    || chars[index] == '-')
            {
                index += 1;
            }
            let token = chars[start..index].iter().collect::<String>();
            let token_chars = token.chars().collect::<Vec<_>>();
            let mut digit_index = 1usize;
            while digit_index + 1 < token_chars.len() {
                if !token_chars[digit_index].is_ascii_digit() {
                    digit_index += 1;
                    continue;
                }
                let mut after_digits = digit_index + 1;
                while after_digits < token_chars.len() && token_chars[after_digits].is_ascii_digit()
                {
                    after_digits += 1;
                }
                if after_digits < token_chars.len()
                    && (token_chars[after_digits].is_ascii_alphabetic()
                        || token_chars[after_digits] == '_'
                        || token_chars[after_digits] == '-')
                {
                    return Some(token);
                }
                digit_index = after_digits;
            }
        }
        None
    }

    #[test]
    fn everyday_sentence_target_uses_single_entry_with_switchable_length() {
        let target = build_everyday_target(
            &[],
            EverydayPracticeScope::Sentences,
            EverydayEnglishSettings {
                word_count: 50,
                include_phrases: false,
                sentence_length: EverydaySentenceLength::Short,
            },
        )
        .expect("sentence target should build");

        assert_eq!(target.mode, Mode::Words);
        assert!(target.source.contains("sentences-short"));
        assert!(
            target
                .text
                .lines()
                .all(|line| line.ends_with(['.', '!', '?']))
        );
    }

    #[test]
    fn programming_basics_specialist_targets_have_distinct_sources() {
        let records = Vec::<&SessionRecord>::new();

        let naming = build_programming_basics_target(
            &records,
            ProgrammingBasicsPractice::Naming,
            &CodePracticeConfig::default(),
        )
        .expect("naming target should build");
        let terms = build_programming_basics_target(
            &records,
            ProgrammingBasicsPractice::TechnicalTerms,
            &CodePracticeConfig::default(),
        )
        .expect("technical terms target should build");

        assert!(naming.source.contains("naming"));
        assert!(terms.source.contains("technical-terms"));
        assert_ne!(naming.text, terms.text);
    }

    #[test]
    fn programming_basics_targets_stay_lightweight() {
        let records = Vec::<&SessionRecord>::new();
        for practice in [
            ProgrammingBasicsPractice::NumberSymbols,
            ProgrammingBasicsPractice::Operators,
            ProgrammingBasicsPractice::Naming,
            ProgrammingBasicsPractice::TechnicalTerms,
        ] {
            let target =
                build_programming_basics_target(&records, practice, &CodePracticeConfig::default())
                    .expect("specialist target should build");

            assert!(
                target.text.chars().count() <= 650,
                "{practice:?} produced {} chars",
                target.text.chars().count()
            );
        }
    }

    #[test]
    fn programming_basics_mix_stays_shorter_than_code_practice() {
        let records = Vec::<&SessionRecord>::new();
        let target = build_programming_basics_target(
            &records,
            ProgrammingBasicsPractice::Mix,
            &CodePracticeConfig::default(),
        )
        .expect("mix target should build");

        assert!(
            target.text.chars().count() <= 850,
            "programming basics mix produced {} chars",
            target.text.chars().count()
        );
    }

    #[test]
    fn refresh_module_mix_target_uses_latest_symbol_errors() {
        let lesson = PracticeLesson {
            id: "daily:programming:1".to_string(),
            kind: LessonKind::Symbols,
            module: TrainingModule::ProgrammingBasics,
            category: TrainingCategory::ProgrammingBasicsMix,
            mix_profile: MixProfile::Comprehensive,
            estimated_minutes: 4,
            target: PracticeTarget {
                mode: Mode::Symbols,
                text: "fallback".to_string(),
                source: "test:fallback".to_string(),
            },
            reason_zh: "测试".to_string(),
            reason_en: "test".to_string(),
        };
        let record = SessionRecord {
            token_stats: vec![TokenStat {
                token: "=>".to_string(),
                kind: TokenKind::Symbol,
                start_delay_ms: 100,
                duration_ms: 100,
                errors: 3,
            }],
            ..SessionRecord::default()
        };
        let records = vec![&record];

        let target = refresh_module_mix_target(
            &lesson,
            &records,
            &CodePracticeConfig::default(),
            &EverydayEnglishSettings::default(),
        )
        .expect("target should refresh");

        assert!(target.text.contains("=>"));
        assert_eq!(target.source, "keyloop:module:programming-basics-mix");
    }

    #[test]
    fn adaptive_daily_plan_uses_key_and_symbol_hotspots() {
        let plan = PracticePlan {
            focus_words: vec!["response".to_string(), "current".to_string()],
            focus_symbols: vec!["=>".to_string(), "!==".to_string()],
            focus_code: vec!["response".to_string()],
            focus_keys: vec!["j".to_string(), ";".to_string()],
            advice: Vec::new(),
            recommended_mode: Mode::Symbols,
            has_recent_history: true,
        };
        let daily = build_daily_practice_plan(&[], None, &plan, &CodePracticeConfig::default())
            .expect("adaptive plan should build");

        assert_eq!(daily.lessons.len(), 4);
        assert_eq!(daily.lessons[0].kind, LessonKind::Foundation);
        assert_eq!(daily.lessons[2].kind, LessonKind::Symbols);
        assert!(
            daily
                .lessons
                .iter()
                .any(|lesson| lesson.reason_zh.contains("弱键"))
        );
        assert!(
            daily
                .lessons
                .iter()
                .any(|lesson| lesson.target.text.contains("response"))
        );
    }

    #[test]
    fn adaptive_daily_plan_assigns_stable_unique_lesson_ids() {
        let plan = PracticePlan {
            focus_words: Vec::new(),
            focus_symbols: Vec::new(),
            focus_code: vec!["useState".to_string(), "response".to_string()],
            focus_keys: Vec::new(),
            advice: Vec::new(),
            recommended_mode: Mode::Mixed,
            has_recent_history: true,
        };

        let daily = build_daily_practice_plan(&[], None, &plan, &CodePracticeConfig::default())
            .expect("adaptive plan should build");
        let ids = daily
            .lessons
            .iter()
            .map(|lesson| lesson.id.as_str())
            .collect::<HashSet<_>>();

        assert_eq!(ids.len(), daily.lessons.len());
        assert!(
            daily
                .lessons
                .iter()
                .any(|lesson| lesson.id == "daily:code-block:1")
        );
    }

    #[test]
    fn adaptive_daily_plan_does_not_repeat_code_snippets_within_plan() {
        let plan = PracticePlan {
            focus_words: Vec::new(),
            focus_symbols: Vec::new(),
            focus_code: vec!["useState".to_string(), "response".to_string()],
            focus_keys: Vec::new(),
            advice: Vec::new(),
            recommended_mode: Mode::Mixed,
            has_recent_history: true,
        };

        let daily = build_daily_practice_plan(&[], None, &plan, &CodePracticeConfig::default())
            .expect("adaptive plan should build");
        let mut seen = HashSet::new();
        let mut code_lesson_count = 0;
        for lesson in daily
            .lessons
            .iter()
            .filter(|lesson| lesson.kind == LessonKind::CodeBlock)
        {
            code_lesson_count += 1;
            for snippet in lesson.target.text.split("\n\n").map(str::trim) {
                assert!(seen.insert(snippet), "duplicate snippet in daily plan");
            }
        }

        assert_eq!(code_lesson_count, 1);
    }

    #[test]
    fn stable_foundation_module_reduces_daily_frequency() {
        let records = stable_module_records(
            TrainingModule::FoundationInput,
            TrainingCategory::FoundationMix,
        );
        let plan = PracticePlan {
            focus_words: Vec::new(),
            focus_symbols: Vec::new(),
            focus_code: Vec::new(),
            focus_keys: Vec::new(),
            advice: Vec::new(),
            recommended_mode: Mode::Mixed,
            has_recent_history: true,
        };

        let daily =
            build_daily_practice_plan(&records, None, &plan, &CodePracticeConfig::default())
                .expect("adaptive plan should build");

        assert!(
            !daily
                .lessons
                .iter()
                .any(|lesson| lesson.module == TrainingModule::FoundationInput)
        );
        assert!(daily.lessons.len() >= 3);
    }

    #[test]
    fn weak_foundation_module_stays_single_short_review_group() {
        let records = weak_module_records(
            TrainingModule::FoundationInput,
            TrainingCategory::FoundationMix,
        );
        let plan = PracticePlan {
            focus_words: Vec::new(),
            focus_symbols: Vec::new(),
            focus_code: Vec::new(),
            focus_keys: vec!["j".to_string(), ";".to_string()],
            advice: Vec::new(),
            recommended_mode: Mode::Chars,
            has_recent_history: true,
        };

        let daily =
            build_daily_practice_plan(&records, None, &plan, &CodePracticeConfig::default())
                .expect("adaptive plan should build");
        let foundation = daily
            .lessons
            .iter()
            .filter(|lesson| lesson.module == TrainingModule::FoundationInput)
            .collect::<Vec<_>>();

        assert_eq!(foundation.len(), 1);
        assert!(foundation[0].estimated_minutes <= 4);
        assert!(foundation[0].reason_zh.contains("短复习"));
    }

    fn stable_module_records(
        module: TrainingModule,
        category: TrainingCategory,
    ) -> Vec<SessionRecord> {
        (0..3)
            .map(|_| SessionRecord {
                module,
                category,
                typed_len: 120,
                target_len: 120,
                correct_chars: 118,
                accuracy: 98.5,
                error_count: 1,
                backspace_count: 1,
                completion_state: CompletionState::Completed,
                started_at: chrono::Utc::now(),
                ..SessionRecord::default()
            })
            .collect()
    }

    fn weak_module_records(
        module: TrainingModule,
        category: TrainingCategory,
    ) -> Vec<SessionRecord> {
        vec![SessionRecord {
            module,
            category,
            typed_len: 100,
            target_len: 100,
            correct_chars: 84,
            accuracy: 84.0,
            error_count: 16,
            backspace_count: 18,
            completion_state: CompletionState::Completed,
            started_at: chrono::Utc::now(),
            ..SessionRecord::default()
        }]
    }

    #[test]
    fn focus_identifier_lines_preserve_programmer_boundaries() {
        let words = vec![
            "NEXT_PUBLIC_CHAIN_ID".to_string(),
            "useEffect".to_string(),
            "VITE_API_BASE_URL".to_string(),
        ];

        let chunks = focus_word_chunks(&words).join("\n");
        let naming = focus_naming_lines(&words).join("\n");

        assert!(chunks.contains("next public chain id NEXT_PUBLIC_CHAIN_ID"));
        assert!(chunks.contains("use effect useEffect"));
        assert!(naming.contains("nextPublicChainId"));
        assert!(naming.contains("NEXT_PUBLIC_CHAIN_ID"));
        assert!(naming.contains("VITE_API_BASE_URL"));
        assert!(!chunks.contains("nextpublicchainid"));
        assert!(!naming.contains("Nextpublicchainid"));
    }

    fn github_repo_from_source(source: &str) -> Option<String> {
        source
            .strip_prefix("github:")
            .and_then(|source| source.split(':').next())
            .map(ToOwned::to_owned)
    }
}
