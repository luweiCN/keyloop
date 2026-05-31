use crate::content::{CodeSnippet, library::SourceCatalogEntry};
use crate::model::{Language, Mode, SessionRecord, TokenKind, TokenStat};
use crate::plan::PracticePlan;
use chrono::Local;
use std::collections::BTreeMap;
use std::fmt::Write as _;
use std::path::Path;

#[derive(Debug, Default)]
struct TokenAggregate {
    occurrences: u32,
    errors: u32,
    delay_sum: u64,
    duration_sum: u64,
}

impl TokenAggregate {
    fn add(&mut self, stat: &TokenStat) {
        self.occurrences += 1;
        self.errors += stat.errors;
        self.delay_sum += stat.start_delay_ms;
        self.duration_sum += stat.duration_ms;
    }

    fn add_legacy_errors(&mut self, errors: u32) {
        self.occurrences += 1;
        self.errors += errors;
    }

    fn avg_delay(&self) -> u64 {
        if self.occurrences == 0 {
            return 0;
        }
        self.delay_sum / u64::from(self.occurrences)
    }

    fn avg_duration(&self) -> u64 {
        if self.occurrences == 0 {
            return 0;
        }
        self.duration_sum / u64::from(self.occurrences)
    }

    fn score(&self) -> u64 {
        self.avg_delay() + self.avg_duration() / 2 + u64::from(self.errors) * 250
    }
}

pub fn today_report(records: &[SessionRecord], plan: &PracticePlan, language: Language) -> String {
    let today = Local::now().date_naive();
    let todays_records = records
        .iter()
        .filter(|record| record.started_at.with_timezone(&Local).date_naive() == today)
        .collect::<Vec<_>>();

    if todays_records.is_empty() {
        return match language {
            Language::Zh => format!(
                "今天还没有 KeyLoop 练习记录。\n\n推荐练习：{}\n运行：keyloop start",
                mode_label(plan.recommended_mode, language)
            ),
            Language::En => format!(
                "No KeyLoop sessions today.\n\nNext recommendation: {}\nRun: keyloop start",
                plan.recommended_mode
            ),
        };
    }

    let duration_ms = todays_records
        .iter()
        .map(|record| record.duration_ms)
        .sum::<u64>();
    let target_len = todays_records
        .iter()
        .map(|record| record.target_len)
        .sum::<usize>();
    let typed_len = todays_records
        .iter()
        .map(|record| effective_typed_len(record))
        .sum::<usize>();
    let correct_chars = todays_records
        .iter()
        .map(|record| record.correct_chars)
        .sum::<usize>();
    let errors = todays_records
        .iter()
        .map(|record| record.error_count)
        .sum::<u32>();
    let backspaces = todays_records
        .iter()
        .map(|record| record.backspace_count)
        .sum::<u32>();

    let minutes = duration_ms.max(1) as f64 / 60_000.0;
    let raw_wpm = typed_len as f64 / 5.0 / minutes;
    let wpm = correct_chars as f64 / 5.0 / minutes;
    let weighted_correct = todays_records
        .iter()
        .map(|record| {
            record.accuracy.clamp(0.0, 100.0) / 100.0 * effective_typed_len(record) as f64
        })
        .sum::<f64>();
    let accuracy = if typed_len > 0 {
        weighted_correct / typed_len as f64 * 100.0
    } else if target_len == 0 {
        0.0
    } else {
        correct_chars as f64 / target_len as f64 * 100.0
    };

    let mut by_kind = BTreeMap::<TokenKind, BTreeMap<String, TokenAggregate>>::new();
    let mut error_chars = BTreeMap::<String, u32>::new();
    for record in todays_records {
        for (ch, count) in &record.error_chars {
            *error_chars.entry(ch.clone()).or_default() += count;
        }
        if record.token_stats.is_empty() {
            for (token, errors) in &record.error_tokens {
                let kind = if is_word_like_token(token) {
                    TokenKind::Word
                } else {
                    TokenKind::Symbol
                };
                by_kind
                    .entry(kind)
                    .or_default()
                    .entry(token.clone())
                    .or_default()
                    .add_legacy_errors(*errors);
            }
        } else {
            for stat in &record.token_stats {
                by_kind
                    .entry(stat.kind)
                    .or_default()
                    .entry(stat.token.clone())
                    .or_default()
                    .add(stat);
            }
        }
    }

    let mut output = String::new();
    let _ = writeln!(
        output,
        "{}: {}",
        match language {
            Language::Zh => "今日练习",
            Language::En => "Today",
        },
        format_duration(duration_ms, language)
    );
    let _ = writeln!(output);
    let _ = writeln!(
        output,
        "{}:",
        match language {
            Language::Zh => "总体",
            Language::En => "Overall",
        }
    );
    let _ = writeln!(output, "  WPM: {wpm:.1}");
    let _ = writeln!(
        output,
        "  {}: {:.1}",
        match language {
            Language::Zh => "原始 WPM",
            Language::En => "Raw WPM",
        },
        raw_wpm
    );
    let _ = writeln!(
        output,
        "  {}: {:.1}%",
        match language {
            Language::Zh => "正确率",
            Language::En => "Accuracy",
        },
        accuracy
    );
    let _ = writeln!(
        output,
        "  {}: {}",
        match language {
            Language::Zh => "错误",
            Language::En => "Errors",
        },
        errors
    );
    let _ = writeln!(
        output,
        "  {}: {}",
        match language {
            Language::Zh => "退格",
            Language::En => "Backspace",
        },
        backspaces
    );

    append_token_section(
        &mut output,
        match language {
            Language::Zh => "单词 / 标识符 - 最慢：",
            Language::En => "Words / identifiers - slowest:",
        },
        by_kind.get(&TokenKind::Word),
        5,
        language,
    );
    append_token_section(
        &mut output,
        match language {
            Language::Zh => "符号 - 需要复盘：",
            Language::En => "Symbols - needs review:",
        },
        by_kind.get(&TokenKind::Symbol),
        5,
        language,
    );
    append_error_chars(&mut output, &error_chars, language);

    let _ = writeln!(output);
    let _ = writeln!(
        output,
        "{}:",
        match language {
            Language::Zh => "下一步",
            Language::En => "Next",
        }
    );
    for (index, advice) in plan.advice.iter().take(4).enumerate() {
        let _ = writeln!(output, "  {}. {}", index + 1, advice);
    }
    let _ = writeln!(
        output,
        "  {}: keyloop start",
        match language {
            Language::Zh => "运行",
            Language::En => "Run",
        }
    );

    output
}

pub fn plan_report(plan: &PracticePlan, language: Language) -> String {
    let mut output = String::new();
    let _ = writeln!(
        output,
        "{}",
        match language {
            Language::Zh => "下一轮 KeyLoop 计划",
            Language::En => "Next KeyLoop plan",
        }
    );
    let _ = writeln!(output);
    match language {
        Language::Zh => {
            let _ = writeln!(output, "每日目标: 20 分钟");
            let _ = writeln!(
                output,
                "默认路径: 热身 -> 英文词块 -> 英语高频词 -> 前端单词 -> 数字/符号 -> 命名 -> 短代码块"
            );
            let _ = writeln!(
                output,
                "当前偏重: {}",
                mode_label(plan.recommended_mode, language)
            );
        }
        Language::En => {
            let _ = writeln!(output, "Daily target: 20 minutes");
            let _ = writeln!(
                output,
                "Default path: warmup -> word chunks -> common English words -> frontend words -> numbers/symbols -> naming -> short code blocks"
            );
            let _ = writeln!(
                output,
                "Current emphasis: {}",
                mode_label(plan.recommended_mode, language)
            );
        }
    }
    write_list(
        &mut output,
        match language {
            Language::Zh => "键位热区",
            Language::En => "Key hot spots",
        },
        &plan.focus_keys,
    );
    write_list(
        &mut output,
        match language {
            Language::Zh => "单词 / 标识符重点",
            Language::En => "Words / identifiers",
        },
        &plan.focus_words,
    );
    write_list(
        &mut output,
        match language {
            Language::Zh => "符号",
            Language::En => "Symbols",
        },
        &plan.focus_symbols,
    );
    write_list(
        &mut output,
        match language {
            Language::Zh => "代码重点",
            Language::En => "Code focus",
        },
        &plan.focus_code,
    );
    let _ = writeln!(output);
    let _ = writeln!(
        output,
        "{}:",
        match language {
            Language::Zh => "建议",
            Language::En => "Advice",
        }
    );
    for (index, advice) in plan.advice.iter().enumerate() {
        let _ = writeln!(output, "  {}. {}", index + 1, advice);
    }
    let _ = writeln!(output);
    match language {
        Language::Zh => {
            let _ = writeln!(output, "课程形态：");
            let _ = writeln!(
                output,
                "  1. 打开软件后直接看到今日动态练习，难度由历史表现自动调整。"
            );
            let _ = writeln!(output, "  2. 可以零碎练，每次完成都会累计到今日进度。");
            let _ = writeln!(
                output,
                "  3. 综合训练会根据键位、错词、符号和代码慢项调整组别。"
            );
            let _ = writeln!(
                output,
                "  4. 代码块覆盖 TS/JS/Vue/Solidity/Rust/HTML/CSS/Less/Sass。"
            );
        }
        Language::En => {
            let _ = writeln!(output, "Lesson model:");
            let _ = writeln!(
                output,
                "  1. Open KeyLoop and start today's adaptive plan directly."
            );
            let _ = writeln!(
                output,
                "  2. Short sessions accumulate into daily progress."
            );
            let _ = writeln!(
                output,
                "  3. Full practice adapts from key, word, symbol, and code hot spots."
            );
            let _ = writeln!(
                output,
                "  4. Code blocks cover TS/JS/Vue/Solidity/Rust/HTML/CSS/Less/Sass."
            );
        }
    }
    output
}

pub fn session_summary(record: &SessionRecord, saved_to: &Path, language: Language) -> String {
    let slow_focus = record
        .slow_tokens
        .iter()
        .take(5)
        .map(|stat| stat.token.as_str())
        .collect::<Vec<_>>()
        .join(", ");

    match language {
        Language::Zh => format!(
            "已保存练习记录到 {}\n\n模式: {}\nWPM: {:.1} | 原始 WPM: {:.1} | 正确率: {:.1}% | 错误: {} | 退格: {}\n慢项: {}",
            saved_to.display(),
            mode_label(record.mode, language),
            record.wpm,
            record.raw_wpm,
            record.accuracy,
            record.error_count,
            record.backspace_count,
            slow_focus
        ),
        Language::En => format!(
            "Saved session to {}\n\nMode: {}\nWPM: {:.1} | Raw WPM: {:.1} | Accuracy: {:.1}% | Errors: {} | Backspace: {}\nSlow focus: {}",
            saved_to.display(),
            record.mode,
            record.wpm,
            record.raw_wpm,
            record.accuracy,
            record.error_count,
            record.backspace_count,
            slow_focus
        ),
    }
}

pub fn import_preview(path: &Path, snippets: &[CodeSnippet], language: Language) -> String {
    let mut output = String::new();
    match language {
        Language::Zh => {
            let _ = writeln!(
                output,
                "在 {} 中找到 {} 个候选片段",
                path.display(),
                snippets.len()
            );
        }
        Language::En => {
            let _ = writeln!(
                output,
                "Found {} candidate snippets in {}",
                snippets.len(),
                path.display()
            );
        }
    }

    for (index, snippet) in snippets.iter().take(12).enumerate() {
        let one_line = snippet.text.replace('\n', " / ");
        let _ = writeln!(
            output,
            "{}. [{} {} / {} / {} / {}] {} ({})",
            index + 1,
            difficulty_label(&snippet.difficulty, language),
            snippet.level.as_str(),
            snippet.language,
            snippet.framework,
            snippet.project,
            one_line,
            snippet.source
        );
    }

    if snippets.len() > 12 {
        match language {
            Language::Zh => {
                let _ = writeln!(output, "... 还有 {} 个", snippets.len() - 12);
            }
            Language::En => {
                let _ = writeln!(output, "... {} more", snippets.len() - 12);
            }
        }
    }

    output
}

pub fn source_catalog_report(sources: &[SourceCatalogEntry], language: Language) -> String {
    let mut output = String::new();
    match language {
        Language::Zh => {
            let _ = writeln!(output, "推荐代码语料来源（{} 个）", sources.len());
            let _ = writeln!(
                output,
                "这些来源用于内置语料选型和后续精确抽取；直接复制外部代码时需要保留 commit、path 和 line range。"
            );
        }
        Language::En => {
            let _ = writeln!(
                output,
                "Recommended code corpus sources ({})",
                sources.len()
            );
            let _ = writeln!(
                output,
                "These entries guide the built-in corpus and future exact extraction; directly copied external code must keep commit, path, and line-range metadata."
            );
        }
    }

    for source in sources {
        let _ = writeln!(
            output,
            "- {} [{}] {} | {} | {} | {} | {} | {}",
            source.repo,
            source.license_spdx,
            source.repo_url,
            source.source_id,
            source.retrieved_at,
            source.languages.join(", "),
            source.frameworks.join(", "),
            source.notes
        );
    }

    output
}

fn append_token_section(
    output: &mut String,
    title: &str,
    map: Option<&BTreeMap<String, TokenAggregate>>,
    limit: usize,
    language: Language,
) {
    let Some(map) = map else {
        return;
    };
    if map.is_empty() {
        return;
    }

    let mut items = map.iter().collect::<Vec<_>>();
    items.sort_by_key(|(_, aggregate)| std::cmp::Reverse(aggregate.score()));

    let _ = writeln!(output);
    let _ = writeln!(output, "{title}");
    for (token, aggregate) in items.into_iter().take(limit) {
        match language {
            Language::Zh => {
                let _ = writeln!(
                    output,
                    "  {:<18} 平均启动 {}ms，输入 {}ms，错误 {}",
                    token,
                    aggregate.avg_delay(),
                    aggregate.avg_duration(),
                    aggregate.errors
                );
            }
            Language::En => {
                let _ = writeln!(
                    output,
                    "  {:<18} avg start {}ms, type {}ms, errors {}",
                    token,
                    aggregate.avg_delay(),
                    aggregate.avg_duration(),
                    aggregate.errors
                );
            }
        }
    }
}

fn append_error_chars(
    output: &mut String,
    error_chars: &BTreeMap<String, u32>,
    language: Language,
) {
    if error_chars.is_empty() {
        return;
    }

    let mut items = error_chars.iter().collect::<Vec<_>>();
    items.sort_by_key(|(_, count)| std::cmp::Reverse(**count));

    let _ = writeln!(output);
    let _ = writeln!(
        output,
        "{}:",
        match language {
            Language::Zh => "错误字符",
            Language::En => "Error chars",
        }
    );
    for (ch, count) in items.into_iter().take(8) {
        let _ = writeln!(output, "  {ch:<8} {count}");
    }
}

fn write_list(output: &mut String, title: &str, items: &[String]) {
    if items.is_empty() {
        return;
    }
    let _ = writeln!(output);
    let _ = writeln!(output, "{title}:");
    let _ = writeln!(output, "  {}", items.join(", "));
}

fn format_duration(duration_ms: u64, language: Language) -> String {
    let seconds = duration_ms / 1000;
    let minutes = seconds / 60;
    let seconds = seconds % 60;
    if minutes > 0 {
        match language {
            Language::Zh => format!("{minutes} 分 {seconds} 秒"),
            Language::En => format!("{minutes}m {seconds}s"),
        }
    } else {
        match language {
            Language::Zh => format!("{seconds} 秒"),
            Language::En => format!("{seconds}s"),
        }
    }
}

fn mode_label(mode: Mode, language: Language) -> &'static str {
    match language {
        Language::Zh => match mode {
            Mode::Chars => "基础字符",
            Mode::Numbers => "数字",
            Mode::Case => "大小写",
            Mode::Words => "单词 / 标识符",
            Mode::Symbols => "符号",
            Mode::Code => "代码",
            Mode::Mixed => "混合",
        },
        Language::En => match mode {
            Mode::Chars => "chars",
            Mode::Numbers => "numbers",
            Mode::Case => "case",
            Mode::Words => "words",
            Mode::Symbols => "symbols",
            Mode::Code => "code",
            Mode::Mixed => "mixed",
        },
    }
}

fn difficulty_label(value: &str, language: Language) -> &str {
    match language {
        Language::Zh => match value {
            "easy" => "简单",
            "medium" => "中等",
            "hard" => "困难",
            _ => value,
        },
        Language::En => match value {
            "easy" => "easy",
            "medium" => "medium",
            "hard" => "hard",
            _ => value,
        },
    }
}

fn is_word_like_token(token: &str) -> bool {
    token.chars().any(|ch| ch.is_ascii_alphabetic())
        && token
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
}

fn effective_typed_len(record: &SessionRecord) -> usize {
    if record.typed_len > 0 {
        return record.typed_len;
    }
    record.user_input.chars().count().max(record.correct_chars)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn today_record() -> SessionRecord {
        SessionRecord {
            started_at: Local::now().with_timezone(&chrono::Utc),
            duration_ms: 60_000,
            target_len: 3,
            typed_len: 4,
            correct_chars: 3,
            wpm: 36.0,
            raw_wpm: 48.0,
            accuracy: 75.0,
            ..SessionRecord::default()
        }
    }

    fn empty_plan() -> PracticePlan {
        PracticePlan {
            focus_words: Vec::new(),
            focus_symbols: Vec::new(),
            focus_code: Vec::new(),
            focus_keys: Vec::new(),
            advice: Vec::new(),
            recommended_mode: Mode::Mixed,
            has_recent_history: false,
        }
    }

    #[test]
    fn today_report_uses_saved_accuracy_metric() {
        let report = today_report(&[today_record()], &empty_plan(), Language::Zh);

        assert!(report.contains("正确率: 75.0%"));
        assert!(!report.contains("正确率: 100.0%"));
        assert!(report.contains("运行: keyloop start"));
        assert!(!report.contains("keyloop start mixed"));
    }

    #[test]
    fn today_report_uses_effective_typed_len_for_legacy_records() {
        let mut legacy = today_record();
        legacy.typed_len = 0;
        legacy.correct_chars = 3;
        legacy.user_input = "abc".to_string();
        legacy.accuracy = 50.0;
        let mut modern = today_record();
        modern.typed_len = 1;
        modern.accuracy = 100.0;

        let report = today_report(&[legacy, modern], &empty_plan(), Language::Zh);

        assert!(report.contains("正确率: 62.5%"));
    }

    #[test]
    fn today_report_uses_legacy_error_tokens() {
        let mut record = today_record();
        record.token_stats.clear();
        record.error_tokens.insert("function".to_string(), 2);
        record.error_tokens.insert("=>".to_string(), 1);

        let report = today_report(&[record], &empty_plan(), Language::Zh);

        assert!(report.contains("function"));
        assert!(report.contains("=>"));
    }

    #[test]
    fn token_aggregate_score_includes_typing_duration() {
        let slow_to_type = TokenAggregate {
            occurrences: 1,
            errors: 0,
            delay_sum: 10,
            duration_sum: 2_000,
        };
        let slow_to_start = TokenAggregate {
            occurrences: 1,
            errors: 0,
            delay_sum: 500,
            duration_sum: 0,
        };

        assert!(slow_to_type.score() > slow_to_start.score());
    }
}
