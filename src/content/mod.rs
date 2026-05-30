pub mod library;
mod snippets;

use crate::model::{
    CodePracticeConfig, CodePracticeOption, DailyPracticePlan, LessonKind, Mode, PracticeLesson,
    PracticeTarget, SessionRecord,
};
use crate::plan::PracticePlan;
use anyhow::Result;
use chrono::Local;
use library::{ContentLibrary, FoundationDrill};
use rand::seq::SliceRandom;
use std::collections::HashSet;
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
    let mut lessons = Vec::new();
    for kind in adaptive_lesson_sequence(plan) {
        lessons.push(build_lesson(
            kind,
            &recent_records,
            repo,
            plan,
            &library,
            code_config,
        )?);
    }

    Ok(DailyPracticePlan {
        target_minutes: 20,
        completed_ms,
        lessons,
    })
}

pub fn build_foundation_target(
    records: &[&SessionRecord],
    drill_id: &str,
    line_count: usize,
) -> Result<PracticeTarget> {
    let library = library::load()?;
    Ok(build_foundation_target_from_library(
        &library, records, drill_id, line_count,
    ))
}

fn build_foundation_target_from_library(
    library: &ContentLibrary,
    records: &[&SessionRecord],
    drill_id: &str,
    line_count: usize,
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

    let used = used_foundation_lines(records, &drill.id);
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

fn lesson(
    kind: LessonKind,
    estimated_minutes: u16,
    target: PracticeTarget,
    reason_zh: impl Into<String>,
    reason_en: impl Into<String>,
) -> PracticeLesson {
    PracticeLesson {
        kind,
        estimated_minutes,
        target,
        reason_zh: reason_zh.into(),
        reason_en: reason_en.into(),
    }
}

fn build_lesson(
    kind: LessonKind,
    records: &[&SessionRecord],
    repo: Option<&Path>,
    plan: &PracticePlan,
    library: &ContentLibrary,
    code_config: &CodePracticeConfig,
) -> Result<PracticeLesson> {
    let (estimated_minutes, target, reason_zh, reason_en) = match kind {
        LessonKind::Foundation => {
            let drill_id = foundation_drill_for_keys(&plan.focus_keys);
            let target = build_foundation_target_from_library(library, records, drill_id, 12);
            (
                3,
                target,
                if plan.focus_keys.is_empty() {
                    "没有明显键位热区，先做基础键位校准。".to_string()
                } else {
                    format!(
                        "高错键位集中在 {}，先做对应基础专项。",
                        plan.focus_keys.join(", ")
                    )
                },
                if plan.focus_keys.is_empty() {
                    "No clear key hot spot yet; calibrate base keys first.".to_string()
                } else {
                    format!(
                        "Key errors cluster around {}; start with a matching foundation drill.",
                        plan.focus_keys.join(", ")
                    )
                },
            )
        }
        LessonKind::Warmup => (
            3,
            PracticeTarget {
                mode: Mode::Chars,
                text: build_lesson_chars(library),
                source: "keyloop:warmup".into(),
            },
            "先稳住基础键位，给后面的词块和代码降噪。".to_string(),
            "Stabilize base keys before word and code work.".to_string(),
        ),
        LessonKind::Chunks => (
            3,
            PracticeTarget {
                mode: Mode::Words,
                text: build_lesson_word_chunks(plan, library),
                source: "keyloop:word-chunks".into(),
            },
            if plan.focus_words.is_empty() {
                "拆常见英文词块，降低拼写停顿。".to_string()
            } else {
                format!(
                    "把高错词 {} 拆成前缀、后缀和字母块练。",
                    short_list(&plan.focus_words, 4)
                )
            },
            if plan.focus_words.is_empty() {
                "Break common English chunks to reduce spelling pauses.".to_string()
            } else {
                format!(
                    "Break high-error words {} into prefixes, suffixes, and letter chunks.",
                    short_list(&plan.focus_words, 4)
                )
            },
        ),
        LessonKind::CommonWords => (
            3,
            PracticeTarget {
                mode: Mode::Words,
                text: build_lesson_common_words(plan, library),
                source: "keyloop:common-english".into(),
            },
            "补真正高频英文词，避免只会敲代码词。".to_string(),
            "Practice common English words, not only code vocabulary.".to_string(),
        ),
        LessonKind::Words => (
            3,
            PracticeTarget {
                mode: Mode::Words,
                text: build_lesson_words(plan, library),
                source: "keyloop:programming-words".into(),
            },
            if plan.focus_words.is_empty() {
                "补前端和程序员高频词。".to_string()
            } else {
                format!(
                    "优先复盘高错词和标识符：{}。",
                    short_list(&plan.focus_words, 5)
                )
            },
            if plan.focus_words.is_empty() {
                "Practice frontend and programming vocabulary.".to_string()
            } else {
                format!(
                    "Prioritize high-error words and identifiers: {}.",
                    short_list(&plan.focus_words, 5)
                )
            },
        ),
        LessonKind::Symbols => (
            3,
            PracticeTarget {
                mode: Mode::Symbols,
                text: build_lesson_symbols(plan, library),
                source: "keyloop:symbols".into(),
            },
            if plan.focus_symbols.is_empty() {
                "补数字、括号、箭头、比较符等代码符号。".to_string()
            } else {
                format!(
                    "符号错误偏高，优先练：{}。",
                    short_list(&plan.focus_symbols, 6)
                )
            },
            if plan.focus_symbols.is_empty() {
                "Practice numbers, brackets, arrows, and comparison symbols.".to_string()
            } else {
                format!(
                    "Symbol errors are high; prioritize {}.",
                    short_list(&plan.focus_symbols, 6)
                )
            },
        ),
        LessonKind::Naming => (
            2,
            PracticeTarget {
                mode: Mode::Case,
                text: build_lesson_naming(plan, library),
                source: "keyloop:naming".into(),
            },
            "补 camelCase、PascalCase 和 API 命名切换。".to_string(),
            "Practice camelCase, PascalCase, and API naming transitions.".to_string(),
        ),
        LessonKind::CodeBlock => (
            3,
            build_code_lesson_target(repo, plan, library, code_config)?,
            if plan.focus_code.is_empty() {
                "最后进入完整代码块，验证前面专项能不能迁移到真实代码。".to_string()
            } else {
                format!(
                    "把慢项/错项 {} 放回完整代码块里练。",
                    short_list(&plan.focus_code, 4)
                )
            },
            if plan.focus_code.is_empty() {
                "Finish with complete code blocks to transfer drills into real code.".to_string()
            } else {
                format!(
                    "Put slow or error-prone terms {} back into complete code blocks.",
                    short_list(&plan.focus_code, 4)
                )
            },
        ),
    };

    Ok(lesson(
        kind,
        estimated_minutes,
        target,
        reason_zh,
        reason_en,
    ))
}

fn adaptive_lesson_sequence(plan: &PracticePlan) -> Vec<LessonKind> {
    if !plan.has_recent_history {
        return vec![
            LessonKind::Warmup,
            LessonKind::Chunks,
            LessonKind::CommonWords,
            LessonKind::Words,
            LessonKind::Symbols,
            LessonKind::Naming,
            LessonKind::CodeBlock,
        ];
    }

    let mut sequence = Vec::new();
    sequence.push(if plan.focus_keys.is_empty() {
        LessonKind::Warmup
    } else {
        LessonKind::Foundation
    });
    sequence.push(LessonKind::Chunks);

    if plan.recommended_mode == Mode::Symbols {
        sequence.push(LessonKind::Symbols);
        sequence.push(LessonKind::Words);
    } else {
        sequence.push(LessonKind::Words);
        sequence.push(LessonKind::Symbols);
    }

    sequence.push(LessonKind::Naming);
    sequence.push(LessonKind::CodeBlock);

    let boosters = adaptive_boosters(plan);
    let target_len = 6 + boosters.len().clamp(1, 2);
    for booster in boosters {
        if sequence.len() >= target_len {
            break;
        }
        sequence.push(booster);
    }
    for fallback in [
        LessonKind::CommonWords,
        LessonKind::Symbols,
        LessonKind::Words,
        LessonKind::CodeBlock,
    ] {
        if sequence.len() >= target_len {
            break;
        }
        sequence.push(fallback);
    }

    sequence.truncate(target_len);
    sequence
}

fn adaptive_boosters(plan: &PracticePlan) -> Vec<LessonKind> {
    let mut boosters = Vec::new();
    if plan.focus_keys.len() >= 2 {
        boosters.push(LessonKind::Foundation);
    }
    if plan.focus_symbols.len() >= 2 {
        boosters.push(LessonKind::Symbols);
    }
    if plan.focus_words.len() >= 2 {
        boosters.push(LessonKind::Words);
    }
    if plan.focus_code.len() >= 2 {
        boosters.push(LessonKind::CodeBlock);
    }
    boosters
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

fn short_list(items: &[String], limit: usize) -> String {
    let mut picked = items
        .iter()
        .filter(|item| !item.trim().is_empty())
        .take(limit)
        .map(|item| short_item(item, 18))
        .collect::<Vec<_>>();
    if picked.is_empty() {
        return "none".to_string();
    }
    if items.len() > picked.len() {
        picked.push("...".to_string());
    }
    picked.join(", ")
}

fn short_item(item: &str, max_chars: usize) -> String {
    if item.chars().count() <= max_chars {
        return item.to_string();
    }
    let head = item
        .chars()
        .take(max_chars.saturating_sub(3))
        .collect::<String>();
    format!("{head}...")
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

fn build_lesson_common_words(plan: &PracticePlan, library: &ContentLibrary) -> String {
    let common = library
        .common_words
        .iter()
        .map(|word| word.as_str())
        .collect::<HashSet<_>>();
    let mut chosen = plan
        .focus_words
        .iter()
        .map(|word| word.to_ascii_lowercase())
        .filter(|word| common.contains(word.as_str()))
        .take(8)
        .collect::<Vec<_>>();
    fill_from(&mut chosen, &library.common_words, 56);
    chunk_words(&chosen, 8).join("\n")
}

fn build_lesson_words(plan: &PracticePlan, library: &ContentLibrary) -> String {
    let mut chosen = unique_focus(&plan.focus_words);
    fill_from(&mut chosen, &library.programming_words, 35);
    chunk_words(&chosen, 7).join("\n")
}

fn build_lesson_symbols(plan: &PracticePlan, library: &ContentLibrary) -> String {
    let mut chosen = unique_focus(&plan.focus_symbols);
    fill_from(&mut chosen, &library.symbols, 48);
    append_from(&mut chosen, &library.number_drills, 3);
    chunk_words(&chosen, 8).join("\n")
}

fn build_lesson_naming(plan: &PracticePlan, library: &ContentLibrary) -> String {
    let mut chunks = focus_naming_lines(&plan.focus_words);
    let remaining = 8usize.saturating_sub(chunks.len());
    append_from(&mut chunks, &library.naming, remaining);
    chunks.truncate(8);
    chunks.join("\n")
}

fn focus_word_chunks(words: &[String]) -> Vec<String> {
    let mut chunks = Vec::new();
    for word in words.iter().take(5) {
        let letters = word
            .chars()
            .filter(|ch| ch.is_ascii_alphabetic())
            .map(|ch| ch.to_ascii_lowercase())
            .collect::<Vec<_>>();
        if letters.len() < 4 {
            continue;
        }
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
        let word = letters.iter().collect::<String>();
        chunks.push(format!("{prefix} {suffix} {word} {word}"));
    }
    chunks
}

fn focus_naming_lines(words: &[String]) -> Vec<String> {
    let mut lines = Vec::new();
    for word in words.iter().take(4) {
        let normalized = word
            .chars()
            .filter(|ch| ch.is_ascii_alphanumeric())
            .collect::<String>();
        if normalized.len() < 4 {
            continue;
        }
        let lower = normalized.to_ascii_lowercase();
        let pascal = pascal_case(&lower);
        lines.push(format!("{lower} {pascal} get{pascal} set{pascal}"));
    }
    lines
}

fn pascal_case(value: &str) -> String {
    let mut chars = value.chars();
    let Some(first) = chars.next() else {
        return String::new();
    };
    first.to_ascii_uppercase().to_string() + chars.as_str()
}

fn build_code_lesson_target(
    repo: Option<&Path>,
    plan: &PracticePlan,
    library: &ContentLibrary,
    code_config: &CodePracticeConfig,
) -> Result<PracticeTarget> {
    let (snippets, scan_error) = match repo {
        Some(repo) => match extract_snippets(repo) {
            Ok(snippets) => (snippets, None),
            Err(error) => (Vec::new(), Some(error.to_string())),
        },
        None => (Vec::new(), None),
    };
    let mut picked = snippets::pick_code_snippets(&snippets, &plan.focus_code, code_config, 3);
    let repo_count = picked.len();
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

    Ok(PracticeTarget {
        mode: Mode::Code,
        text: join_snippets(&snippets::pick_builtin_code(
            &library.code_snippets,
            &plan.focus_code,
            code_config,
            4,
        )),
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
    let mut picked = snippets::pick_builtin_code_excluding(
        &library.code_snippets,
        &[],
        code_config,
        count,
        &used,
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
    let mut parts = Vec::new();
    append_filter_label(&mut parts, "lang", &config.languages);
    append_filter_label(&mut parts, "framework", &config.frameworks);
    append_filter_label(&mut parts, "project", &config.projects);
    if parts.is_empty() {
        parts.push("all".to_string());
    }
    format!("keyloop:code-specialist:{}:{picked_count}", parts.join("+"))
}

fn append_filter_label(parts: &mut Vec<String>, label: &str, values: &[String]) {
    if !values.is_empty() {
        parts.push(format!("{label}={}", values.join(",")));
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

    #[test]
    fn content_library_loads_external_json() {
        let library = library::load().expect("content json should load");
        assert!(library.foundation_drills.len() >= 12);
        assert!(library.warmup.len() >= 180);
        assert!(library.common_words.len() >= 400);
        assert!(library.word_chunks.len() >= 300);
        assert!(library.programming_words.len() >= 800);
        assert!(library.symbols.len() >= 200);
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
    fn code_corpus_has_enough_language_and_framework_targets() {
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
    fn build_daily_plan_keeps_seven_lesson_flow() {
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
        assert_eq!(daily.lessons.len(), 7);
        assert_eq!(daily.lessons[0].kind, LessonKind::Warmup);
        assert_eq!(daily.lessons[6].kind, LessonKind::CodeBlock);
        assert_eq!(daily.lessons[6].target.source, "keyloop:code-corpus");
        assert!(!daily.lessons[6].target.text.trim().is_empty());
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

        assert!((7..=8).contains(&daily.lessons.len()));
        assert_eq!(daily.lessons[0].kind, LessonKind::Foundation);
        assert_eq!(daily.lessons[2].kind, LessonKind::Symbols);
        assert!(
            daily
                .lessons
                .iter()
                .any(|lesson| lesson.reason_zh.contains("高错"))
        );
        assert!(
            daily
                .lessons
                .iter()
                .any(|lesson| lesson.target.text.contains("response"))
        );
    }

    fn github_repo_from_source(source: &str) -> Option<String> {
        source
            .strip_prefix("github:")
            .and_then(|source| source.split(':').next())
            .map(ToOwned::to_owned)
    }
}
