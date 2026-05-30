pub mod library;
mod snippets;

use crate::model::{
    CodePracticeConfig, CodePracticeOption, DailyPracticePlan, LessonKind, Mode, PracticeLesson,
    PracticeTarget, SessionRecord,
};
use crate::plan::PracticePlan;
use anyhow::Result;
use chrono::Local;
use library::ContentLibrary;
use rand::seq::SliceRandom;
use std::collections::HashSet;
use std::path::Path;

pub use snippets::{CodeSnippet, extract_snippets};

pub use library::source_catalog;

pub fn code_practice_options() -> Result<Vec<CodePracticeOption>> {
    let library = library::load()?;
    Ok(snippets::code_practice_options(&library.code_snippets))
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

    let lessons = vec![
        lesson(
            LessonKind::Warmup,
            3,
            PracticeTarget {
                mode: Mode::Chars,
                text: build_lesson_chars(&library),
                source: "keyloop:warmup".into(),
            },
        ),
        lesson(
            LessonKind::Chunks,
            3,
            PracticeTarget {
                mode: Mode::Words,
                text: build_lesson_word_chunks(&library),
                source: "keyloop:word-chunks".into(),
            },
        ),
        lesson(
            LessonKind::CommonWords,
            3,
            PracticeTarget {
                mode: Mode::Words,
                text: build_lesson_common_words(&library),
                source: "keyloop:common-english".into(),
            },
        ),
        lesson(
            LessonKind::Words,
            3,
            PracticeTarget {
                mode: Mode::Words,
                text: build_lesson_words(plan, &library),
                source: "keyloop:programming-words".into(),
            },
        ),
        lesson(
            LessonKind::Symbols,
            3,
            PracticeTarget {
                mode: Mode::Symbols,
                text: build_lesson_symbols(plan, &library),
                source: "keyloop:symbols".into(),
            },
        ),
        lesson(
            LessonKind::Naming,
            2,
            PracticeTarget {
                mode: Mode::Case,
                text: build_lesson_naming(&library),
                source: "keyloop:naming".into(),
            },
        ),
        lesson(
            LessonKind::CodeBlock,
            3,
            build_code_lesson_target(repo, plan, &library, code_config)?,
        ),
    ];

    Ok(DailyPracticePlan {
        target_minutes: 20,
        completed_ms,
        lessons,
    })
}

fn lesson(kind: LessonKind, estimated_minutes: u16, target: PracticeTarget) -> PracticeLesson {
    PracticeLesson {
        kind,
        estimated_minutes,
        target,
    }
}

fn build_lesson_chars(library: &ContentLibrary) -> String {
    let mut chunks = repeat_pool(&library.warmup, 10);
    chunks.truncate(10);
    chunks.join("\n")
}

fn build_lesson_word_chunks(library: &ContentLibrary) -> String {
    let mut chunks = repeat_pool(&library.word_chunks, 10);
    chunks.truncate(10);
    chunks.join("\n")
}

fn build_lesson_common_words(library: &ContentLibrary) -> String {
    let mut chosen = Vec::new();
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

fn build_lesson_naming(library: &ContentLibrary) -> String {
    let mut chunks = repeat_pool(&library.naming, 8);
    chunks.truncate(8);
    chunks.join("\n")
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
        assert!(library.common_words.len() >= 200);
        assert!(library.word_chunks.len() >= 50);
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
            advice: Vec::new(),
            recommended_mode: Mode::Chars,
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

    fn github_repo_from_source(source: &str) -> Option<String> {
        source
            .strip_prefix("github:")
            .and_then(|source| source.split(':').next())
            .map(ToOwned::to_owned)
    }
}
