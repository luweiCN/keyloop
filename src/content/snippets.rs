use crate::model::{CodePracticeConfig, CodePracticeFacet, CodePracticeOption};
use anyhow::{Context, Result};
use ignore::WalkBuilder;
use rand::seq::SliceRandom;
use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, serde::Deserialize)]
pub struct BuiltinCodeSnippet {
    pub text: String,
    pub source: String,
    pub language: String,
    pub framework: String,
    pub project: String,
    pub level: CodeSnippetLevel,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CodeSnippetLevel {
    Block,
    Function,
    File,
}

impl CodeSnippetLevel {
    pub fn as_str(self) -> &'static str {
        match self {
            CodeSnippetLevel::Block => "block",
            CodeSnippetLevel::Function => "function",
            CodeSnippetLevel::File => "file",
        }
    }
}

#[derive(Debug, Clone)]
pub struct CodeSnippet {
    pub text: String,
    pub source: String,
    pub difficulty: String,
    pub score: usize,
    pub language: String,
    pub framework: String,
    pub project: String,
    pub level: CodeSnippetLevel,
}

impl CodeSnippet {
    pub fn from_builtin(snippet: &BuiltinCodeSnippet) -> Self {
        make_snippet_with_meta(
            normalize_snippet_text(&snippet.text),
            snippet.source.clone(),
            snippet.language.clone(),
            snippet.framework.clone(),
            snippet.project.clone(),
            snippet.level,
        )
    }
}

pub fn extract_snippets(repo: &Path) -> Result<Vec<CodeSnippet>> {
    let repo = repo
        .canonicalize()
        .with_context(|| format!("Could not open {}", repo.display()))?;
    let mut snippets = Vec::new();

    for entry in WalkBuilder::new(&repo)
        .hidden(false)
        .git_ignore(true)
        .git_exclude(true)
        .ignore(true)
        .build()
        .filter_map(Result::ok)
    {
        let path = entry.path();
        if !path.is_file() || !is_supported_source(path) {
            continue;
        }

        let metadata = match fs::metadata(path) {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        if metadata.len() > 200_000 {
            continue;
        }

        let Ok(content) = fs::read_to_string(path) else {
            continue;
        };
        let relative = path.strip_prefix(&repo).unwrap_or(path);
        snippets.extend(snippets_from_file(&content, relative));
    }

    snippets.sort_by(|a, b| {
        difficulty_rank(&a.difficulty)
            .cmp(&difficulty_rank(&b.difficulty))
            .then_with(|| b.score.cmp(&a.score))
    });
    snippets.dedup_by(|a, b| a.text == b.text);
    Ok(snippets)
}

pub fn pick_code_snippets_excluding(
    snippets: &[CodeSnippet],
    plan_focus: &[String],
    code_config: &CodePracticeConfig,
    count: usize,
    excluded_texts: &HashSet<String>,
) -> Vec<CodeSnippet> {
    let focus = plan_focus
        .iter()
        .map(|item| item.to_lowercase())
        .collect::<Vec<_>>();

    let mut candidates = snippets
        .iter()
        .filter(|snippet| is_practice_code_block(&snippet.text))
        .filter(|snippet| matches_code_config(snippet, code_config))
        .filter(|snippet| !excluded_texts.contains(&snippet.text))
        .collect::<Vec<_>>();
    candidates.shuffle(&mut rand::thread_rng());
    if !focus.is_empty() {
        candidates.sort_by_key(|snippet| {
            std::cmp::Reverse(
                focus
                    .iter()
                    .filter(|term| snippet.text.to_lowercase().contains(term.as_str()))
                    .count(),
            )
        });
    }

    let mut selected = candidates
        .iter()
        .copied()
        .filter(|snippet| {
            focus.is_empty()
                || focus
                    .iter()
                    .any(|term| snippet.text.to_lowercase().contains(term))
        })
        .take(count)
        .cloned()
        .collect::<Vec<_>>();

    if selected.len() < count {
        for snippet in candidates {
            if selected.len() >= count {
                break;
            }
            if !selected.iter().any(|picked| picked.text == snippet.text) {
                selected.push(snippet.clone());
            }
        }
    }

    selected
}

pub fn pick_builtin_code(
    snippets: &[BuiltinCodeSnippet],
    plan_focus: &[String],
    code_config: &CodePracticeConfig,
    count: usize,
) -> Vec<CodeSnippet> {
    pick_builtin_code_excluding(snippets, plan_focus, code_config, count, &HashSet::new())
}

pub fn pick_builtin_code_excluding(
    snippets: &[BuiltinCodeSnippet],
    plan_focus: &[String],
    code_config: &CodePracticeConfig,
    count: usize,
    excluded_texts: &HashSet<String>,
) -> Vec<CodeSnippet> {
    let mut snippets = snippets
        .iter()
        .map(CodeSnippet::from_builtin)
        .filter(|snippet| matches_code_config(snippet, code_config))
        .filter(|snippet| !excluded_texts.contains(&snippet.text))
        .collect::<Vec<_>>();
    snippets.shuffle(&mut rand::thread_rng());
    snippets.sort_by_key(|snippet| {
        std::cmp::Reverse(
            plan_focus
                .iter()
                .filter(|term| snippet.text.contains(term.as_str()))
                .count(),
        )
    });
    snippets.into_iter().take(count).collect()
}

pub fn code_practice_options(snippets: &[BuiltinCodeSnippet]) -> Vec<CodePracticeOption> {
    let mut languages = BTreeMap::<String, usize>::new();
    let mut frameworks = BTreeMap::<String, usize>::new();
    let mut projects = BTreeMap::<String, usize>::new();

    for snippet in snippets {
        *languages.entry(snippet.language.clone()).or_default() += 1;
        *frameworks.entry(snippet.framework.clone()).or_default() += 1;
        if snippet.project != "keyloop-generated" {
            *projects.entry(snippet.project.clone()).or_default() += 1;
        }
    }

    let mut options = Vec::new();
    options.extend(sorted_options(CodePracticeFacet::Language, languages));
    options.extend(sorted_options(CodePracticeFacet::Framework, frameworks));
    options.extend(sorted_options(CodePracticeFacet::Project, projects));
    options
}

fn sorted_options(
    facet: CodePracticeFacet,
    counts: BTreeMap<String, usize>,
) -> Vec<CodePracticeOption> {
    let mut options = counts
        .into_iter()
        .map(|(value, count)| CodePracticeOption {
            facet,
            value,
            count,
        })
        .collect::<Vec<_>>();
    options.sort_by(|left, right| {
        right
            .count
            .cmp(&left.count)
            .then_with(|| left.value.cmp(&right.value))
    });
    options
}

fn is_practice_code_block(text: &str) -> bool {
    text.is_ascii() && text.lines().filter(|line| !line.trim().is_empty()).count() >= 2
}

fn matches_code_config(snippet: &CodeSnippet, config: &CodePracticeConfig) -> bool {
    if config.is_empty() {
        return true;
    }

    if config.match_any {
        return matches_any(&snippet.language, &config.languages)
            || matches_any(&snippet.framework, &config.frameworks)
            || matches_any(&snippet.project, &config.projects);
    }

    matches_optional(
        &snippet.language,
        config.language.as_deref(),
        &config.languages,
    ) && matches_optional(
        &snippet.framework,
        config.framework.as_deref(),
        &config.frameworks,
    ) && matches_optional(
        &snippet.project,
        config.project.as_deref(),
        &config.projects,
    )
}

fn matches_optional(value: &str, expected: Option<&str>, expected_many: &[String]) -> bool {
    expected
        .map(|expected| value.eq_ignore_ascii_case(expected))
        .unwrap_or(true)
        && (expected_many.is_empty() || matches_any(value, expected_many))
}

fn matches_any(value: &str, expected_many: &[String]) -> bool {
    expected_many
        .iter()
        .any(|expected| value.eq_ignore_ascii_case(expected))
}

fn snippets_from_file(content: &str, relative_path: &Path) -> Vec<CodeSnippet> {
    let lines: Vec<&str> = content.lines().collect();
    let mut snippets = Vec::new();

    for index in 0..lines.len() {
        let line = lines[index].trim();
        if !is_candidate_line(line) {
            continue;
        }

        let source = format!("{}:{}", relative_path.display(), index + 1);

        if opens_block_or_callback(line) {
            let text = capture_block(&lines, index);
            if text.chars().count() <= 240 {
                if text.is_ascii() {
                    snippets.push(make_snippet(text, source));
                }
                continue;
            }
        }

        if line.is_ascii() {
            snippets.push(make_snippet(line.to_string(), source));
        }
    }

    snippets
}

fn capture_block(lines: &[&str], start: usize) -> String {
    let mut raw_block = Vec::new();
    let mut brace_balance = 0i32;
    let mut paren_balance = 0i32;

    for line in lines.iter().skip(start).take(14) {
        let trimmed = line.trim();
        if trimmed.is_empty() && !raw_block.is_empty() {
            break;
        }

        brace_balance += char_count(trimmed, '{') as i32;
        brace_balance -= char_count(trimmed, '}') as i32;
        paren_balance += char_count(trimmed, '(') as i32;
        paren_balance -= char_count(trimmed, ')') as i32;
        raw_block.push(line.trim_end().to_string());

        if raw_block.len() > 1
            && brace_balance <= 0
            && paren_balance <= 0
            && (trimmed.ends_with('}') || trimmed.ends_with("};") || trimmed.ends_with(");"))
        {
            break;
        }
    }

    normalize_indent(&raw_block).join("\n")
}

fn normalize_snippet_text(text: &str) -> String {
    let lines = text
        .lines()
        .map(|line| line.trim_end().to_string())
        .collect::<Vec<_>>();
    normalize_indent(&lines).join("\n")
}

fn char_count(value: &str, target: char) -> usize {
    value.chars().filter(|ch| *ch == target).count()
}

fn normalize_indent(lines: &[String]) -> Vec<String> {
    let min_indent = lines
        .iter()
        .filter(|line| !line.trim().is_empty())
        .map(|line| leading_space_count(line))
        .min()
        .unwrap_or(0);

    lines
        .iter()
        .map(|line| strip_leading_spaces(line, min_indent))
        .collect()
}

fn leading_space_count(value: &str) -> usize {
    value
        .chars()
        .take_while(|ch| *ch == ' ' || *ch == '\t')
        .count()
}

fn strip_leading_spaces(value: &str, count: usize) -> String {
    value.chars().skip(count).collect()
}

fn make_snippet(text: String, source: String) -> CodeSnippet {
    let language = language_from_source(&source);
    make_snippet_with_meta(
        text,
        source,
        language,
        "local".to_string(),
        "local-repo".to_string(),
        CodeSnippetLevel::Block,
    )
}

fn make_snippet_with_meta(
    text: String,
    source: String,
    language: String,
    framework: String,
    project: String,
    level: CodeSnippetLevel,
) -> CodeSnippet {
    let len = text.chars().count();
    let symbol_count = text
        .chars()
        .filter(|ch| !ch.is_ascii_alphanumeric() && !ch.is_whitespace())
        .count();
    let lines = text.lines().count();
    let score = len / 8 + symbol_count * 2 + lines * 4;
    let difficulty = if score <= 16 {
        "easy"
    } else if score <= 34 {
        "medium"
    } else {
        "hard"
    }
    .to_string();

    CodeSnippet {
        text,
        source,
        difficulty,
        score,
        language,
        framework,
        project,
        level,
    }
}

fn language_from_source(source: &str) -> String {
    let path = source.split(':').next().unwrap_or(source);
    Path::new(path)
        .extension()
        .and_then(|extension| extension.to_str())
        .map(language_from_extension)
        .unwrap_or_else(|| "code".to_string())
}

fn language_from_extension(extension: &str) -> String {
    match extension.to_ascii_lowercase().as_str() {
        "ts" | "tsx" => "typescript",
        "js" | "jsx" | "mjs" | "cjs" => "javascript",
        "rs" => "rust",
        "sol" => "solidity",
        "css" => "css",
        "scss" | "sass" => "scss",
        "less" => "less",
        "html" => "html",
        "vue" => "vue",
        "svelte" => "svelte",
        "py" => "python",
        "go" => "go",
        "java" => "java",
        "rb" => "ruby",
        "php" => "php",
        "swift" => "swift",
        "kt" => "kotlin",
        other => other,
    }
    .to_string()
}

fn difficulty_rank(value: &str) -> usize {
    match value {
        "medium" => 0,
        "easy" => 1,
        _ => 2,
    }
}

fn is_supported_source(path: &Path) -> bool {
    let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
        return false;
    };
    if file_name.ends_with(".min.js")
        || file_name.ends_with(".lock")
        || file_name == "package-lock.json"
        || file_name == "pnpm-lock.yaml"
        || file_name == "yarn.lock"
    {
        return false;
    }

    matches!(
        extension(path).as_deref(),
        Some("rs")
            | Some("ts")
            | Some("tsx")
            | Some("js")
            | Some("jsx")
            | Some("mjs")
            | Some("cjs")
            | Some("py")
            | Some("go")
            | Some("java")
            | Some("rb")
            | Some("php")
            | Some("swift")
            | Some("kt")
            | Some("css")
            | Some("scss")
            | Some("sass")
            | Some("less")
            | Some("html")
            | Some("vue")
            | Some("svelte")
            | Some("sol")
    )
}

fn extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
}

fn is_candidate_line(line: &str) -> bool {
    if line.len() < 12 || line.len() > 140 {
        return false;
    }
    if line.starts_with("//")
        || line.starts_with("/*")
        || line.starts_with('*')
        || line.starts_with('#')
    {
        return false;
    }

    let has_code_signal = [
        "const ",
        "let ",
        "var ",
        "function ",
        "return ",
        "import ",
        "export ",
        "if ",
        "for ",
        "while ",
        "=>",
        "useState",
        "useEffect",
        "className",
        "async ",
        "await ",
    ]
    .iter()
    .any(|needle| line.contains(needle));

    has_code_signal
        || line
            .chars()
            .filter(|ch| "(){}[]<>=!&|_.".contains(*ch))
            .count()
            >= 4
}

fn opens_block_or_callback(line: &str) -> bool {
    line.ends_with('{') || line.contains("=>") || line.contains("function ")
}

#[allow(dead_code)]
fn _canonical_or_original(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_snippet_difficulty() {
        let snippet = make_snippet(
            "const value = items.map((item) => item.id);".into(),
            "x:1".into(),
        );
        assert!(snippet.score > 0);
        assert!(!snippet.difficulty.is_empty());
    }

    #[test]
    fn preserves_relative_indent_in_blocks() {
        let content = "  if (value) {\n    return value;\n  }";
        let snippets = snippets_from_file(content, Path::new("sample.ts"));
        assert!(
            snippets
                .iter()
                .any(|snippet| snippet.text == "if (value) {\n  return value;\n}")
        );
    }

    #[test]
    fn normalizes_builtin_common_indent_and_trailing_spaces() {
        let snippet = BuiltinCodeSnippet {
            text: "    function value() {  \n      return 1;  \n    }  ".to_string(),
            source: "keyloop:test".to_string(),
            language: "javascript".to_string(),
            framework: "web".to_string(),
            project: "test".to_string(),
            level: CodeSnippetLevel::Function,
        };

        let normalized = CodeSnippet::from_builtin(&snippet);

        assert_eq!(normalized.text, "function value() {\n  return 1;\n}");
    }

    #[test]
    fn code_lesson_picker_skips_single_line_snippets() {
        let snippets = vec![
            CodeSnippet {
                text: "const value = getValue();".to_string(),
                source: "single.ts:1".to_string(),
                score: 1,
                difficulty: "easy".to_string(),
                language: "typescript".to_string(),
                framework: "local".to_string(),
                project: "local-repo".to_string(),
                level: CodeSnippetLevel::Block,
            },
            CodeSnippet {
                text: "function readValue() {\n  return getValue();\n}".to_string(),
                source: "block.ts:1".to_string(),
                score: 10,
                difficulty: "medium".to_string(),
                language: "typescript".to_string(),
                framework: "local".to_string(),
                project: "local-repo".to_string(),
                level: CodeSnippetLevel::Function,
            },
        ];

        let picked = pick_code_snippets_excluding(
            &snippets,
            &[],
            &CodePracticeConfig::default(),
            3,
            &HashSet::new(),
        );

        assert_eq!(picked.len(), 1);
        assert!(picked[0].text.contains('\n'));
        assert!(!picked[0].text.contains("const value = getValue();"));
    }

    #[test]
    fn snippet_extraction_skips_non_ascii_blocks() {
        let content = r#"
function label() {
  return "设置";
}

function value() {
  return "settings";
}
"#;

        let snippets = snippets_from_file(content, Path::new("sample.ts"));

        assert!(!snippets.iter().any(|snippet| snippet.text.contains("设置")));
        assert!(
            snippets
                .iter()
                .any(|snippet| snippet.text.contains("settings"))
        );
    }
}
