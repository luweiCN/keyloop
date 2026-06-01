use super::{format_duration_short, format_practice_minutes, text, truncate};
use crate::feedback::is_numbered_template_identifier;
use crate::model::{KeyAction, KeyAggregate, Language, Mode, SessionRecord, TrainingModule};
use crate::plan::PLAN_HISTORY_DAYS;
use chrono::{Duration, Local, NaiveDate, Utc};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum KeyStatsSort {
    SlowestAverage,
    Fastest,
    SlowestSingle,
    HighestErrorRate,
    LowestConfidence,
}

impl KeyStatsSort {
    pub(super) fn next(self) -> Self {
        match self {
            KeyStatsSort::SlowestAverage => KeyStatsSort::Fastest,
            KeyStatsSort::Fastest => KeyStatsSort::SlowestSingle,
            KeyStatsSort::SlowestSingle => KeyStatsSort::HighestErrorRate,
            KeyStatsSort::HighestErrorRate => KeyStatsSort::LowestConfidence,
            KeyStatsSort::LowestConfidence => KeyStatsSort::SlowestAverage,
        }
    }

    pub(super) fn label(self, language: Language) -> &'static str {
        match (language, self) {
            (Language::Zh, KeyStatsSort::SlowestAverage) => "平均最慢",
            (Language::Zh, KeyStatsSort::Fastest) => "最快单次",
            (Language::Zh, KeyStatsSort::SlowestSingle) => "最慢单次",
            (Language::Zh, KeyStatsSort::HighestErrorRate) => "错误率最高",
            (Language::Zh, KeyStatsSort::LowestConfidence) => "信心最低",
            (Language::En, KeyStatsSort::SlowestAverage) => "slowest avg",
            (Language::En, KeyStatsSort::Fastest) => "fastest",
            (Language::En, KeyStatsSort::SlowestSingle) => "slowest single",
            (Language::En, KeyStatsSort::HighestErrorRate) => "highest error",
            (Language::En, KeyStatsSort::LowestConfidence) => "lowest confidence",
        }
    }
}

fn stats_overview_lines(records: &[&SessionRecord], language: Language) -> Vec<Line<'static>> {
    if records.is_empty() {
        return vec![Line::from(text(language, "stats_empty"))];
    }

    let (total_ms, active_ms, idle_ms) = timing_totals(records);
    let dates = stats_dates_from_records(records);
    let best_wpm = records
        .iter()
        .map(|record| record.wpm)
        .fold(0.0_f64, f64::max);
    let avg_wpm = aggregate_wpm(records);
    let avg_accuracy = weighted_accuracy(records);
    let lowest_error_rate = records
        .iter()
        .filter_map(|record| record_error_rate(record))
        .fold(f64::INFINITY, f64::min);
    let lowest_error_rate = if lowest_error_rate.is_finite() {
        lowest_error_rate
    } else {
        0.0
    };
    let total_errors = records.iter().map(|record| record.error_count).sum::<u32>();
    let total_backspaces = records
        .iter()
        .map(|record| record.backspace_count)
        .sum::<u32>();
    let worst_word = top_problem_tokens(records, true, 1)
        .first()
        .map(|entry| format!("{}({})", entry.token, entry.errors))
        .unwrap_or_else(|| text(language, "stats_none").to_string());
    let worst_key = top_key_errors(records, 1)
        .first()
        .map(|entry| format!("{}({})", entry.label, entry.count))
        .unwrap_or_else(|| text(language, "stats_none").to_string());
    let recent_records = recent_plan_records(records);
    let recommendation = training_recommendation_text(&recent_records, language);

    match language {
        Language::Zh => vec![
            Line::from(format!(
                "总览  {} 次 | {} 天 | 总时长 {} | active {} | idle {}",
                records.len(),
                dates.len(),
                format_duration_short(total_ms, language),
                format_duration_short(active_ms, language),
                format_duration_short(idle_ms, language)
            )),
            Line::from(format!(
                "速度  历史最高 WPM {best_wpm:.1} | 平均 WPM {avg_wpm:.1}"
            )),
            Line::from(format!(
                "质量  平均正确率 {avg_accuracy:.1}% | 最低错误率 {lowest_error_rate:.1}%"
            )),
            Line::from(format!(
                "错误  总错误 {} | 总退格 {} | {}",
                total_errors,
                total_backspaces,
                recent_activity_text(records, language)
            )),
            Line::from(vec![
                Span::styled("弱项  ", Style::default().fg(Color::LightRed)),
                Span::raw(format!("高错词 {worst_word} | 高错键 {worst_key}")),
            ]),
            Line::from(vec![
                Span::styled("综合计划  ", Style::default().fg(Color::LightGreen)),
                Span::raw(recommendation),
            ]),
        ],
        Language::En => vec![
            Line::from(format!(
                "Overview  {} sessions | {} days | total {} | active {} | idle {}",
                records.len(),
                dates.len(),
                format_duration_short(total_ms, language),
                format_duration_short(active_ms, language),
                format_duration_short(idle_ms, language)
            )),
            Line::from(format!(
                "Speed  best WPM {best_wpm:.1} | average WPM {avg_wpm:.1}"
            )),
            Line::from(format!(
                "Quality  average accuracy {avg_accuracy:.1}% | lowest error rate {lowest_error_rate:.1}%"
            )),
            Line::from(format!(
                "Errors  total {} | backspace {} | {}",
                total_errors,
                total_backspaces,
                recent_activity_text(records, language)
            )),
            Line::from(vec![
                Span::styled("Focus  ", Style::default().fg(Color::LightRed)),
                Span::raw(format!("word {worst_word} | key {worst_key}")),
            ]),
            Line::from(vec![
                Span::styled("Full plan  ", Style::default().fg(Color::LightGreen)),
                Span::raw(recommendation),
            ]),
        ],
    }
}

pub(super) fn stats_dashboard_lines(
    records: &[&SessionRecord],
    max_lines: usize,
    language: Language,
) -> Vec<Line<'static>> {
    if records.is_empty() {
        return vec![Line::from(text(language, "stats_empty"))];
    }
    if max_lines <= 12 {
        return compact_stats_dashboard_lines(records, max_lines, language);
    }

    let mut lines = Vec::new();
    for line in stats_overview_lines(records, language) {
        push_stats_line(&mut lines, max_lines, line);
    }
    push_stats_line(&mut lines, max_lines, Line::from(""));

    let remaining = max_lines.saturating_sub(lines.len());
    for line in stats_diagnosis_lines(records, remaining, language) {
        push_stats_line(&mut lines, max_lines, line);
    }

    lines
}

fn compact_stats_dashboard_lines(
    records: &[&SessionRecord],
    max_lines: usize,
    language: Language,
) -> Vec<Line<'static>> {
    let (total_ms, active_ms, idle_ms) = timing_totals(records);
    let dates = stats_dates_from_records(records);
    let best_wpm = records
        .iter()
        .map(|record| record.wpm)
        .fold(0.0_f64, f64::max);
    let avg_wpm = aggregate_wpm(records);
    let avg_accuracy = weighted_accuracy(records);
    let total_errors = records.iter().map(|record| record.error_count).sum::<u32>();
    let total_backspaces = records
        .iter()
        .map(|record| record.backspace_count)
        .sum::<u32>();
    let worst_word = top_problem_tokens(records, true, 1)
        .first()
        .map(|entry| format!("{}({})", truncate(&entry.token, 12), entry.errors))
        .unwrap_or_else(|| text(language, "stats_none").to_string());
    let recent_records = recent_plan_records(records);
    let recommendation = training_recommendation_text(&recent_records, language);

    let mut lines = Vec::new();
    match language {
        Language::Zh => {
            push_stats_line(
                &mut lines,
                max_lines,
                Line::from(format!(
                    "总览  {} 次 | {} 天 | 总时长 {} | active {} | idle {}",
                    records.len(),
                    dates.len(),
                    format_duration_short(total_ms, language),
                    format_duration_short(active_ms, language),
                    format_duration_short(idle_ms, language)
                )),
            );
            push_stats_line(
                &mut lines,
                max_lines,
                Line::from(format!(
                    "速度  最高 WPM {best_wpm:.1} | 平均 {avg_wpm:.1} | 正确率 {avg_accuracy:.1}%"
                )),
            );
            push_stats_line(
                &mut lines,
                max_lines,
                Line::from(format!(
                    "错误  总错误 {total_errors} | 退格 {total_backspaces} | 高错词 {worst_word}"
                )),
            );
            push_stats_line(
                &mut lines,
                max_lines,
                Line::from(format!("综合计划  {recommendation}")),
            );
        }
        Language::En => {
            push_stats_line(
                &mut lines,
                max_lines,
                Line::from(format!(
                    "Overview  {} sessions | {} days | total {} | active {} | idle {}",
                    records.len(),
                    dates.len(),
                    format_duration_short(total_ms, language),
                    format_duration_short(active_ms, language),
                    format_duration_short(idle_ms, language)
                )),
            );
            push_stats_line(
                &mut lines,
                max_lines,
                Line::from(format!(
                    "Speed  best WPM {best_wpm:.1} | avg {avg_wpm:.1} | accuracy {avg_accuracy:.1}%"
                )),
            );
            push_stats_line(
                &mut lines,
                max_lines,
                Line::from(format!(
                    "Errors  total {total_errors} | backspace {total_backspaces} | worst word {worst_word}"
                )),
            );
            push_stats_line(
                &mut lines,
                max_lines,
                Line::from(format!("Full plan  {recommendation}")),
            );
        }
    }

    push_stats_line(&mut lines, max_lines, Line::from(""));
    push_stats_line(&mut lines, max_lines, heatmap_legend_line(language, true));
    let key_counts = aggregate_key_errors(records);
    for line in compact_keyboard_heatmap_lines(&key_counts) {
        push_stats_line(&mut lines, max_lines, line);
    }
    push_stats_line(
        &mut lines,
        max_lines,
        compact_diagnosis_line(
            match language {
                Language::Zh => "符号",
                Language::En => "Symbols",
            },
            Color::Yellow,
            compact_problem_text(top_problem_tokens(records, false, 3), language),
        ),
    );
    lines
}

#[derive(Debug, Clone)]
pub(super) struct ProblemToken {
    pub(super) token: String,
    pub(super) errors: u32,
    pub(super) count: u32,
    pub(super) score: u64,
}

#[derive(Debug, Clone)]
struct KeyProblem {
    label: String,
    pub(super) count: u32,
}

#[derive(Default)]
struct ProblemTokenAggregate {
    pub(super) errors: u32,
    pub(super) count: u32,
    pub(super) score: u64,
}

fn stats_diagnosis_lines(
    records: &[&SessionRecord],
    max_lines: usize,
    language: Language,
) -> Vec<Line<'static>> {
    if records.is_empty() {
        return vec![Line::from(text(language, "stats_empty"))];
    }
    if max_lines <= 8 {
        return compact_stats_diagnosis_lines(records, max_lines, language);
    }

    let mut lines = Vec::new();
    push_stats_line(
        &mut lines,
        max_lines,
        Line::from(vec![
            Span::styled(
                text(language, "stats_radar"),
                Style::default()
                    .fg(Color::Cyan)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::raw(match language {
                Language::Zh => "  全部历史",
                Language::En => "  all history",
            }),
        ]),
    );

    append_problem_bars(
        &mut lines,
        max_lines,
        text(language, "stats_error_words"),
        top_problem_tokens(records, true, 4),
        language,
    );
    append_problem_bars(
        &mut lines,
        max_lines,
        text(language, "stats_error_symbols"),
        top_problem_tokens(records, false, 3),
        language,
    );

    let key_counts = aggregate_key_errors(records);
    push_stats_line(
        &mut lines,
        max_lines,
        Line::from(vec![Span::styled(
            text(language, "stats_key_heat"),
            Style::default()
                .fg(Color::Yellow)
                .add_modifier(Modifier::BOLD),
        )]),
    );
    push_stats_line(&mut lines, max_lines, heatmap_legend_line(language, false));
    for line in keyboard_heatmap_lines(&key_counts) {
        push_stats_line(&mut lines, max_lines, line);
    }

    append_slow_bars(
        &mut lines,
        max_lines,
        text(language, "stats_slow_tokens"),
        top_slow_tokens(records, 3),
        language,
    );

    if lines.is_empty() {
        vec![Line::from(text(language, "stats_empty"))]
    } else {
        lines
    }
}

fn compact_stats_diagnosis_lines(
    records: &[&SessionRecord],
    max_lines: usize,
    language: Language,
) -> Vec<Line<'static>> {
    let (word_title, symbol_title, key_title, slow_title) = match language {
        Language::Zh => ("错词", "符号", "键位", "慢项"),
        Language::En => ("Words", "Symbols", "Keys", "Slow"),
    };
    let mut lines = Vec::new();
    push_stats_line(
        &mut lines,
        max_lines,
        Line::from(vec![
            Span::styled(
                text(language, "stats_radar"),
                Style::default()
                    .fg(Color::Cyan)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::raw(match language {
                Language::Zh => "  压缩视图",
                Language::En => "  compact view",
            }),
        ]),
    );
    push_stats_line(
        &mut lines,
        max_lines,
        compact_diagnosis_line(
            word_title,
            Color::LightRed,
            compact_problem_text(top_problem_tokens(records, true, 2), language),
        ),
    );
    push_stats_line(
        &mut lines,
        max_lines,
        compact_diagnosis_line(
            symbol_title,
            Color::Yellow,
            compact_problem_text(top_problem_tokens(records, false, 3), language),
        ),
    );
    push_stats_line(
        &mut lines,
        max_lines,
        compact_diagnosis_line(
            key_title,
            Color::LightGreen,
            compact_key_text(top_key_errors(records, 3), language),
        ),
    );
    push_stats_line(
        &mut lines,
        max_lines,
        compact_diagnosis_line(
            slow_title,
            Color::LightBlue,
            compact_slow_text(top_slow_tokens(records, 2), language),
        ),
    );
    lines
}

fn compact_diagnosis_line(title: &'static str, color: Color, value: String) -> Line<'static> {
    Line::from(vec![
        Span::styled(format!("{title:<6} "), Style::default().fg(color)),
        Span::raw(value),
    ])
}

fn training_recommendation_text(records: &[&SessionRecord], language: Language) -> String {
    let key = top_key_errors(records, 1).into_iter().next();
    let symbol = top_problem_tokens(records, false, 1).into_iter().next();
    let word = top_problem_tokens(records, true, 1).into_iter().next();

    match (language, key, symbol, word) {
        (Language::Zh, Some(key), _, _) if key.count >= 2 => {
            format!("下一次综合会优先加入键位专项：{}", key.label)
        }
        (Language::Zh, _, Some(symbol), _) if symbol.errors >= 2 => {
            format!("下一次综合会增加符号练习：{}", truncate(&symbol.token, 12))
        }
        (Language::Zh, _, _, Some(word)) if word.errors >= 2 => {
            format!(
                "下一次综合会增加词块/单词练习：{}",
                truncate(&word.token, 12)
            )
        }
        (Language::Zh, _, _, _) => "下一次综合会保持均衡计划。".to_string(),
        (Language::En, Some(key), _, _) if key.count >= 2 => {
            format!(
                "Next full practice will prioritize key drill: {}",
                key.label
            )
        }
        (Language::En, _, Some(symbol), _) if symbol.errors >= 2 => {
            format!(
                "Next full practice will add symbol work: {}",
                truncate(&symbol.token, 12)
            )
        }
        (Language::En, _, _, Some(word)) if word.errors >= 2 => {
            format!(
                "Next full practice will add word/chunk work: {}",
                truncate(&word.token, 12)
            )
        }
        (Language::En, _, _, _) => "Next full practice will stay balanced.".to_string(),
    }
}

fn recent_plan_records<'a>(records: &[&'a SessionRecord]) -> Vec<&'a SessionRecord> {
    let recent_cutoff = Utc::now() - Duration::days(PLAN_HISTORY_DAYS);
    records
        .iter()
        .copied()
        .filter(|record| record.started_at >= recent_cutoff)
        .collect()
}

pub(super) fn stats_today_lines(
    records: &[&SessionRecord],
    max_lines: usize,
    language: Language,
) -> Vec<Line<'static>> {
    let today = Local::now().date_naive();
    let todays_records = records
        .iter()
        .copied()
        .filter(|record| record.started_at.with_timezone(&Local).date_naive() == today)
        .collect::<Vec<_>>();
    if todays_records.is_empty() {
        return vec![Line::from(text(language, "stats_empty_day"))];
    }

    let comprehensive = todays_records
        .iter()
        .copied()
        .filter(|record| is_comprehensive_record(record))
        .collect::<Vec<_>>();
    let standalone = todays_records
        .iter()
        .copied()
        .filter(|record| !is_comprehensive_record(record))
        .collect::<Vec<_>>();

    let mut lines = Vec::new();
    push_stats_line(
        &mut lines,
        max_lines,
        Line::from(match language {
            Language::Zh => format!("今日 {} 次练习", todays_records.len()),
            Language::En => format!("Today {} sessions", todays_records.len()),
        }),
    );
    push_stats_line(
        &mut lines,
        max_lines,
        scope_summary_line(
            match language {
                Language::Zh => "综合练习",
                Language::En => "Full practice",
            },
            &comprehensive,
            language,
        ),
    );
    push_stats_line(
        &mut lines,
        max_lines,
        scope_summary_line(
            match language {
                Language::Zh => "专项练习",
                Language::En => "Standalone",
            },
            &standalone,
            language,
        ),
    );
    push_stats_line(&mut lines, max_lines, Line::from(""));
    push_stats_line(
        &mut lines,
        max_lines,
        compact_diagnosis_line(
            match language {
                Language::Zh => "错词",
                Language::En => "Words",
            },
            Color::LightRed,
            compact_problem_text(top_problem_tokens(&todays_records, true, 3), language),
        ),
    );
    push_stats_line(
        &mut lines,
        max_lines,
        compact_diagnosis_line(
            match language {
                Language::Zh => "键位",
                Language::En => "Keys",
            },
            Color::Yellow,
            compact_key_text(top_key_errors(&todays_records, 4), language),
        ),
    );
    lines
}

pub(super) fn stats_comprehensive_lines(
    records: &[&SessionRecord],
    max_lines: usize,
    language: Language,
) -> Vec<Line<'static>> {
    let mut runs = BTreeMap::<String, Vec<&SessionRecord>>::new();
    for record in records
        .iter()
        .copied()
        .filter(|record| is_comprehensive_record(record))
    {
        runs.entry(record.daily_run_id.clone())
            .or_default()
            .push(record);
    }
    if runs.is_empty() {
        return vec![Line::from(match language {
            Language::Zh => "还没有综合练习记录。",
            Language::En => "No full practice runs yet.",
        })];
    }

    let mut entries = runs.into_iter().collect::<Vec<_>>();
    entries.sort_by_key(|(_, records)| std::cmp::Reverse(latest_started_at(records)));

    let mut lines = Vec::new();
    push_stats_line(
        &mut lines,
        max_lines,
        Line::from(match language {
            Language::Zh => "综合练习运行",
            Language::En => "Full practice runs",
        }),
    );
    for (run_id, run_records) in entries {
        let modules = run_records
            .iter()
            .map(|record| record.module)
            .collect::<std::collections::BTreeSet<_>>()
            .len();
        let active_ms = run_records
            .iter()
            .map(|record| effective_active_ms(record))
            .sum::<u64>();
        let avg_wpm = aggregate_wpm(&run_records);
        push_stats_line(
            &mut lines,
            max_lines,
            Line::from(match language {
                Language::Zh => format!(
                    "{}  {} 组 | {} 模块 | active {} | WPM {:.1}",
                    truncate(&run_id, 18),
                    run_records.len(),
                    modules,
                    format_duration_short(active_ms, language),
                    avg_wpm
                ),
                Language::En => format!(
                    "{}  {} groups | {} modules | active {} | WPM {:.1}",
                    truncate(&run_id, 18),
                    run_records.len(),
                    modules,
                    format_duration_short(active_ms, language),
                    avg_wpm
                ),
            }),
        );
    }
    lines
}

pub(super) fn stats_module_lines(
    records: &[&SessionRecord],
    max_lines: usize,
    language: Language,
) -> Vec<Line<'static>> {
    let mut by_module = BTreeMap::<TrainingModule, Vec<&SessionRecord>>::new();
    for record in records.iter().copied() {
        by_module.entry(record.module).or_default().push(record);
    }
    if by_module.is_empty() {
        return vec![Line::from(text(language, "stats_empty"))];
    }

    let mut summaries = by_module
        .into_iter()
        .map(|(module, records)| ModuleSummary::from_records(module, records))
        .collect::<Vec<_>>();
    summaries.sort_by(|left, right| {
        right
            .error_rate
            .partial_cmp(&left.error_rate)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| left.module.cmp(&right.module))
    });

    let driver = summaries.first().cloned();
    let mut lines = Vec::new();
    if let Some(driver) = driver {
        push_stats_line(
            &mut lines,
            max_lines,
            Line::from(match language {
                Language::Zh => format!(
                    "下一轮驱动  {} | 错误率 {:.1}% | 正确率 {:.1}%",
                    module_label(driver.module, language),
                    driver.error_rate,
                    driver.accuracy
                ),
                Language::En => format!(
                    "Next driver  {} | error {:.1}% | accuracy {:.1}%",
                    module_label(driver.module, language),
                    driver.error_rate,
                    driver.accuracy
                ),
            }),
        );
    }
    push_stats_line(&mut lines, max_lines, Line::from(""));
    for summary in summaries {
        push_stats_line(
            &mut lines,
            max_lines,
            Line::from(match language {
                Language::Zh => format!(
                    "{}  {} 次 | active {} | WPM {:.1} | 错误率 {:.1}%",
                    module_label(summary.module, language),
                    summary.count,
                    format_duration_short(summary.active_ms, language),
                    summary.wpm,
                    summary.error_rate
                ),
                Language::En => format!(
                    "{}  {} sessions | active {} | WPM {:.1} | error {:.1}%",
                    module_label(summary.module, language),
                    summary.count,
                    format_duration_short(summary.active_ms, language),
                    summary.wpm,
                    summary.error_rate
                ),
            }),
        );
    }
    lines
}

pub(super) fn stats_token_lines(
    records: &[&SessionRecord],
    max_lines: usize,
    language: Language,
) -> Vec<Line<'static>> {
    let mut lines = Vec::new();
    push_stats_line(
        &mut lines,
        max_lines,
        Line::from(match language {
            Language::Zh => "Token 统计",
            Language::En => "Token stats",
        }),
    );
    append_problem_bars(
        &mut lines,
        max_lines,
        text(language, "stats_error_words"),
        top_problem_tokens(records, true, 4),
        language,
    );
    append_problem_bars(
        &mut lines,
        max_lines,
        text(language, "stats_error_symbols"),
        top_problem_tokens(records, false, 4),
        language,
    );
    append_slow_bars(
        &mut lines,
        max_lines,
        text(language, "stats_slow_tokens"),
        top_slow_tokens(records, 4),
        language,
    );
    lines
}

pub(super) fn stats_code_lines(
    records: &[&SessionRecord],
    max_lines: usize,
    language: Language,
) -> Vec<Line<'static>> {
    let code_records = records
        .iter()
        .copied()
        .filter(|record| record.mode == Mode::Code || record.module == TrainingModule::CodePractice)
        .collect::<Vec<_>>();
    if code_records.is_empty() {
        return vec![Line::from(match language {
            Language::Zh => "还没有代码实战记录。",
            Language::En => "No code practice records yet.",
        })];
    }

    let mut lines = Vec::new();
    push_stats_line(
        &mut lines,
        max_lines,
        scope_summary_line(
            match language {
                Language::Zh => "代码实战",
                Language::En => "Code practice",
            },
            &code_records,
            language,
        ),
    );
    push_stats_line(
        &mut lines,
        max_lines,
        compact_diagnosis_line(
            match language {
                Language::Zh => "符号",
                Language::En => "Symbols",
            },
            Color::Yellow,
            compact_problem_text(top_problem_tokens(&code_records, false, 5), language),
        ),
    );
    push_stats_line(
        &mut lines,
        max_lines,
        compact_diagnosis_line(
            match language {
                Language::Zh => "慢项",
                Language::En => "Slow",
            },
            Color::LightBlue,
            compact_slow_text(top_slow_tokens(&code_records, 4), language),
        ),
    );
    lines
}

pub(super) fn key_stats_lines(
    aggregates: &[KeyAggregate],
    sort: KeyStatsSort,
    max_lines: usize,
    language: Language,
) -> Vec<Line<'static>> {
    if aggregates.is_empty() {
        return vec![Line::from(match language {
            Language::Zh => "还没有键位统计。完成练习后这里会显示每个按键的速度和错误率。",
            Language::En => "No key stats yet. Complete practice to collect per-key timing.",
        })];
    }

    let mut entries = aggregates.to_vec();
    entries.sort_by(|left, right| compare_key_aggregate(left, right, sort));

    let mut lines = Vec::new();
    push_stats_line(
        &mut lines,
        max_lines,
        Line::from(match language {
            Language::Zh => format!("键位统计  排序: {}", sort.label(language)),
            Language::En => format!("Key stats  sort: {}", sort.label(language)),
        }),
    );
    push_stats_line(
        &mut lines,
        max_lines,
        Line::from(match language {
            Language::Zh => "key        samples  avg   fast  slow  err   conf",
            Language::En => "key        samples  avg   fast  slow  err   conf",
        }),
    );
    for aggregate in entries {
        push_stats_line(
            &mut lines,
            max_lines,
            Line::from(format!(
                "{:<10} {:>7} {:>4.0} {:>5} {:>5} {:>4.0}% {:>5.2}",
                truncate(&aggregate.key, 10),
                aggregate.sample_count,
                aggregate.avg_ms,
                aggregate.fastest_ms,
                aggregate.slowest_ms,
                aggregate.error_rate,
                aggregate.confidence
            )),
        );
    }
    lines
}

pub(super) fn stats_day_lines(
    date: NaiveDate,
    index: usize,
    total_dates: usize,
    records: &[&SessionRecord],
    max_sessions: usize,
    language: Language,
) -> Vec<Line<'static>> {
    if records.is_empty() {
        return vec![Line::from(text(language, "stats_empty_day"))];
    }

    let (total_ms, active_ms, idle_ms) = timing_totals(records);
    let best_wpm = records
        .iter()
        .map(|record| record.wpm)
        .fold(0.0_f64, f64::max);
    let avg_wpm = aggregate_wpm(records);
    let avg_accuracy = weighted_accuracy(records);
    let error_count = records.iter().map(|record| record.error_count).sum::<u32>();
    let backspace_count = records
        .iter()
        .map(|record| record.backspace_count)
        .sum::<u32>();
    let minutes = active_ms as f64 / 60_000.0;
    let bar = minute_bar(minutes, 20.0, 18);
    let day_words = compact_problem_text(top_problem_tokens(records, true, 2), language);
    let day_keys = compact_key_text(top_key_errors(records, 4), language);

    if max_sessions == 0 {
        return match language {
            Language::Zh => vec![
                Line::from(format!("日期 {date} ({}/{})", index + 1, total_dates)),
                Line::from(format!(
                    "{} 次 | {} | active {} | idle {} | {} / 20 min",
                    records.len(),
                    format_duration_short(total_ms, language),
                    format_duration_short(active_ms, language),
                    format_duration_short(idle_ms, language),
                    format_practice_minutes(total_ms)
                )),
                Line::from(format!("WPM 最高 {best_wpm:.1} | 平均 {avg_wpm:.1}")),
                Line::from(format!(
                    "正确率 {avg_accuracy:.1}% | 错 {error_count} | 退 {backspace_count}"
                )),
                Line::from(vec![
                    Span::styled("错词  ", Style::default().fg(Color::LightRed)),
                    Span::raw(day_words),
                ]),
                Line::from(vec![
                    Span::styled("键位  ", Style::default().fg(Color::Yellow)),
                    Span::raw(day_keys),
                ]),
            ],
            Language::En => vec![
                Line::from(format!("Date {date} ({}/{})", index + 1, total_dates)),
                Line::from(format!(
                    "{} sessions | {} | active {} | idle {} | {} / 20 min",
                    records.len(),
                    format_duration_short(total_ms, language),
                    format_duration_short(active_ms, language),
                    format_duration_short(idle_ms, language),
                    format_practice_minutes(total_ms)
                )),
                Line::from(format!("WPM best {best_wpm:.1} | avg {avg_wpm:.1}")),
                Line::from(format!(
                    "Acc {avg_accuracy:.1}% | err {error_count} | back {backspace_count}"
                )),
                Line::from(vec![
                    Span::styled("Words  ", Style::default().fg(Color::LightRed)),
                    Span::raw(day_words),
                ]),
                Line::from(vec![
                    Span::styled("Keys  ", Style::default().fg(Color::Yellow)),
                    Span::raw(day_keys),
                ]),
            ],
        };
    }

    let mut lines = match language {
        Language::Zh => vec![
            Line::from(format!(
                "日期 {}  ({}/{})  ←/→ 切换日期",
                date,
                index + 1,
                total_dates
            )),
            Line::from(format!(
                "当天 {} 次 | {} | active {} | idle {} | 最高 WPM {best_wpm:.1} | 平均 WPM {avg_wpm:.1} | 正确率 {avg_accuracy:.1}%",
                records.len(),
                format_duration_short(total_ms, language),
                format_duration_short(active_ms, language),
                format_duration_short(idle_ms, language)
            )),
            Line::from(format!(
                "进度 [{bar}] {minutes:.1} / 20 min | 错误 {error_count} | 退格 {backspace_count}"
            )),
            Line::from(vec![
                Span::styled("当天错词  ", Style::default().fg(Color::LightRed)),
                Span::raw(day_words),
            ]),
            Line::from(vec![
                Span::styled("当天键位  ", Style::default().fg(Color::Yellow)),
                Span::raw(day_keys),
            ]),
        ],
        Language::En => vec![
            Line::from(format!(
                "Date {}  ({}/{})  Left/Right switches date",
                date,
                index + 1,
                total_dates
            )),
            Line::from(format!(
                "Day {} sessions | {} | active {} | idle {} | best WPM {best_wpm:.1} | avg WPM {avg_wpm:.1} | accuracy {avg_accuracy:.1}%",
                records.len(),
                format_duration_short(total_ms, language),
                format_duration_short(active_ms, language),
                format_duration_short(idle_ms, language)
            )),
            Line::from(format!(
                "Target [{bar}] {minutes:.1} / 20 min | errors {error_count} | backspace {backspace_count}"
            )),
            Line::from(vec![
                Span::styled("Day words  ", Style::default().fg(Color::LightRed)),
                Span::raw(day_words),
            ]),
            Line::from(vec![
                Span::styled("Day keys  ", Style::default().fg(Color::Yellow)),
                Span::raw(day_keys),
            ]),
        ],
    };

    lines.push(Line::from(""));

    for (session_index, record) in records.iter().take(max_sessions).enumerate() {
        lines.push(session_line(session_index, record, language));
    }
    if records.len() > max_sessions {
        let remaining = records.len() - max_sessions;
        lines.push(Line::from(match language {
            Language::Zh => format!("还有 {remaining} 次练习未显示，放大终端可查看更多。"),
            Language::En => format!("{remaining} more sessions hidden. Enlarge the terminal."),
        }));
    }

    lines
}

#[derive(Clone)]
struct ModuleSummary {
    module: TrainingModule,
    count: usize,
    active_ms: u64,
    wpm: f64,
    accuracy: f64,
    error_rate: f64,
}

impl ModuleSummary {
    fn from_records(module: TrainingModule, records: Vec<&SessionRecord>) -> Self {
        let active_ms = records
            .iter()
            .map(|record| effective_active_ms(record))
            .sum::<u64>();
        let target_len = records
            .iter()
            .map(|record| record.target_len)
            .sum::<usize>();
        let errors = records.iter().map(|record| record.error_count).sum::<u32>();
        let error_rate = if target_len == 0 {
            0.0
        } else {
            f64::from(errors) / target_len as f64 * 100.0
        };
        Self {
            module,
            count: records.len(),
            active_ms,
            wpm: aggregate_wpm(&records),
            accuracy: weighted_accuracy(&records),
            error_rate,
        }
    }
}

fn scope_summary_line(
    title: &'static str,
    records: &[&SessionRecord],
    language: Language,
) -> Line<'static> {
    let (_, active_ms, _) = timing_totals(records);
    let wpm = aggregate_wpm(records);
    let accuracy = weighted_accuracy(records);
    Line::from(match language {
        Language::Zh => format!(
            "{title}  {} 次 | active {} | WPM {:.1} | 正确率 {:.1}%",
            records.len(),
            format_duration_short(active_ms, language),
            wpm,
            accuracy
        ),
        Language::En => format!(
            "{title}  {} sessions | active {} | WPM {:.1} | accuracy {:.1}%",
            records.len(),
            format_duration_short(active_ms, language),
            wpm,
            accuracy
        ),
    })
}

fn is_comprehensive_record(record: &SessionRecord) -> bool {
    !record.daily_run_id.trim().is_empty()
}

fn latest_started_at(records: &[&SessionRecord]) -> chrono::DateTime<Utc> {
    records
        .iter()
        .map(|record| record.started_at)
        .max()
        .unwrap_or_else(Utc::now)
}

fn module_label(module: TrainingModule, language: Language) -> &'static str {
    match language {
        Language::Zh => match module {
            TrainingModule::Unknown => "未知模块",
            TrainingModule::Comprehensive => "综合练习",
            TrainingModule::FoundationInput => "基础输入",
            TrainingModule::EverydayEnglish => "日常英语",
            TrainingModule::ProgrammingBasics => "编程基础",
            TrainingModule::CodePractice => "代码实战",
        },
        Language::En => match module {
            TrainingModule::Unknown => "Unknown",
            TrainingModule::Comprehensive => "Full practice",
            TrainingModule::FoundationInput => "Foundation input",
            TrainingModule::EverydayEnglish => "Everyday English",
            TrainingModule::ProgrammingBasics => "Programming basics",
            TrainingModule::CodePractice => "Code practice",
        },
    }
}

fn compare_key_aggregate(
    left: &KeyAggregate,
    right: &KeyAggregate,
    sort: KeyStatsSort,
) -> std::cmp::Ordering {
    let ordering = match sort {
        KeyStatsSort::SlowestAverage => right
            .avg_ms
            .partial_cmp(&left.avg_ms)
            .unwrap_or(std::cmp::Ordering::Equal),
        KeyStatsSort::Fastest => left
            .fastest_ms
            .cmp(&right.fastest_ms)
            .then_with(|| right.sample_count.cmp(&left.sample_count)),
        KeyStatsSort::SlowestSingle => right.slowest_ms.cmp(&left.slowest_ms),
        KeyStatsSort::HighestErrorRate => right
            .error_rate
            .partial_cmp(&left.error_rate)
            .unwrap_or(std::cmp::Ordering::Equal),
        KeyStatsSort::LowestConfidence => left
            .confidence
            .partial_cmp(&right.confidence)
            .unwrap_or(std::cmp::Ordering::Equal),
    };
    ordering
        .then_with(|| right.sample_count.cmp(&left.sample_count))
        .then_with(|| left.key.cmp(&right.key))
}

fn push_stats_line(lines: &mut Vec<Line<'static>>, max_lines: usize, line: Line<'static>) {
    if lines.len() < max_lines {
        lines.push(line);
    }
}

fn append_problem_bars(
    lines: &mut Vec<Line<'static>>,
    max_lines: usize,
    title: &'static str,
    entries: Vec<ProblemToken>,
    language: Language,
) {
    push_stats_line(
        lines,
        max_lines,
        Line::from(vec![Span::styled(
            title,
            Style::default()
                .fg(Color::Yellow)
                .add_modifier(Modifier::BOLD),
        )]),
    );
    if entries.is_empty() {
        push_stats_line(
            lines,
            max_lines,
            Line::from(Span::styled(
                text(language, "stats_none"),
                Style::default().fg(Color::Gray),
            )),
        );
        return;
    }

    let max_errors = entries.iter().map(|entry| entry.errors).max().unwrap_or(1);
    for entry in entries {
        push_stats_line(
            lines,
            max_lines,
            problem_token_bar_line(entry, max_errors, language),
        );
    }
}

fn append_slow_bars(
    lines: &mut Vec<Line<'static>>,
    max_lines: usize,
    title: &'static str,
    entries: Vec<ProblemToken>,
    language: Language,
) {
    push_stats_line(
        lines,
        max_lines,
        Line::from(vec![Span::styled(
            title,
            Style::default()
                .fg(Color::Yellow)
                .add_modifier(Modifier::BOLD),
        )]),
    );
    if entries.is_empty() {
        push_stats_line(
            lines,
            max_lines,
            Line::from(Span::styled(
                text(language, "stats_none"),
                Style::default().fg(Color::Gray),
            )),
        );
        return;
    }

    let max_score = entries.iter().map(|entry| entry.score).max().unwrap_or(1);
    for entry in entries {
        push_stats_line(
            lines,
            max_lines,
            slow_token_bar_line(entry, max_score, language),
        );
    }
}

fn problem_token_bar_line(
    entry: ProblemToken,
    max_errors: u32,
    language: Language,
) -> Line<'static> {
    let label = truncate(&entry.token.replace('\n', "\\n").replace('\t', "\\t"), 12);
    let bar = value_bar(entry.errors as f64, max_errors as f64, 8);
    let color = heat_color(entry.errors, max_errors);
    let count_label = match language {
        Language::Zh => format!("{}错/{}次", entry.errors, entry.count),
        Language::En => format!("{}e/{}x", entry.errors, entry.count),
    };
    Line::from(vec![
        Span::styled(
            format!("{label:<12} "),
            Style::default().fg(Color::Indexed(250)),
        ),
        Span::styled(bar, Style::default().fg(color)),
        Span::raw(" "),
        Span::styled(count_label, Style::default().fg(Color::Gray)),
    ])
}

fn slow_token_bar_line(entry: ProblemToken, max_score: u64, language: Language) -> Line<'static> {
    let label = truncate(&entry.token.replace('\n', "\\n").replace('\t', "\\t"), 12);
    let bar = value_bar(entry.score as f64, max_score as f64, 8);
    let avg_score = if entry.count == 0 {
        0
    } else {
        entry.score / u64::from(entry.count)
    };
    let color = if entry.score == max_score {
        Color::LightRed
    } else {
        Color::Yellow
    };
    let count_label = match language {
        Language::Zh => format!("{}ms/{}次", avg_score, entry.count),
        Language::En => format!("{}ms/{}x", avg_score, entry.count),
    };
    Line::from(vec![
        Span::styled(
            format!("{label:<12} "),
            Style::default().fg(Color::Indexed(250)),
        ),
        Span::styled(bar, Style::default().fg(color)),
        Span::raw(" "),
        Span::styled(count_label, Style::default().fg(Color::Gray)),
    ])
}

fn compact_problem_text(entries: Vec<ProblemToken>, language: Language) -> String {
    if entries.is_empty() {
        return text(language, "stats_none").to_string();
    }
    entries
        .into_iter()
        .map(|entry| format!("{}({})", truncate(&entry.token, 10), entry.errors))
        .collect::<Vec<_>>()
        .join("  ")
}

fn compact_key_text(entries: Vec<KeyProblem>, language: Language) -> String {
    if entries.is_empty() {
        return text(language, "stats_none").to_string();
    }
    entries
        .into_iter()
        .map(|entry| format!("{}({})", entry.label, entry.count))
        .collect::<Vec<_>>()
        .join("  ")
}

fn compact_slow_text(entries: Vec<ProblemToken>, language: Language) -> String {
    if entries.is_empty() {
        return text(language, "stats_none").to_string();
    }
    entries
        .into_iter()
        .map(|entry| {
            let avg_score = if entry.count == 0 {
                0
            } else {
                entry.score / u64::from(entry.count)
            };
            format!("{}({}ms)", truncate(&entry.token, 10), avg_score)
        })
        .collect::<Vec<_>>()
        .join("  ")
}

pub(super) fn top_problem_tokens(
    records: &[&SessionRecord],
    words: bool,
    limit: usize,
) -> Vec<ProblemToken> {
    let mut aggregate = BTreeMap::<String, ProblemTokenAggregate>::new();
    for record in records {
        if record.token_stats.is_empty() {
            for (token, errors) in &record.error_tokens {
                if *errors == 0
                    || is_numbered_template_identifier(token)
                    || is_word_like_token(token) != words
                {
                    continue;
                }
                let token = normalize_problem_token(token, words);
                let entry = aggregate.entry(token).or_default();
                entry.errors += *errors;
                entry.count += 1;
                entry.score += u64::from(*errors) * 1_000;
            }
            continue;
        }

        for stat in &record.token_stats {
            if stat.errors == 0
                || is_numbered_template_identifier(&stat.token)
                || is_word_like_token(&stat.token) != words
            {
                continue;
            }
            let token = normalize_problem_token(&stat.token, words);
            let entry = aggregate.entry(token).or_default();
            entry.errors += stat.errors;
            entry.count += 1;
            entry.score +=
                u64::from(stat.errors) * 1_000 + stat.start_delay_ms + stat.duration_ms / 2;
        }
    }
    sorted_problem_tokens(aggregate, limit)
}

fn top_slow_tokens(records: &[&SessionRecord], limit: usize) -> Vec<ProblemToken> {
    let mut aggregate = BTreeMap::<String, ProblemTokenAggregate>::new();
    for record in records {
        if record.token_stats.is_empty() {
            for (token, errors) in &record.error_tokens {
                if *errors == 0 || is_numbered_template_identifier(token) {
                    continue;
                }
                let token = normalize_problem_token(token, is_word_like_token(token));
                let entry = aggregate.entry(token).or_default();
                entry.errors += *errors;
                entry.count += 1;
                entry.score += u64::from(*errors) * 1_000;
            }
            continue;
        }

        for stat in &record.token_stats {
            if is_numbered_template_identifier(&stat.token) {
                continue;
            }
            let token = normalize_problem_token(&stat.token, is_word_like_token(&stat.token));
            let entry = aggregate.entry(token).or_default();
            entry.errors += stat.errors;
            entry.count += 1;
            entry.score +=
                stat.start_delay_ms + stat.duration_ms / 2 + u64::from(stat.errors) * 750;
        }
    }
    sorted_problem_tokens(aggregate, limit)
}

fn sorted_problem_tokens(
    aggregate: BTreeMap<String, ProblemTokenAggregate>,
    limit: usize,
) -> Vec<ProblemToken> {
    let mut entries = aggregate
        .into_iter()
        .map(|(token, aggregate)| ProblemToken {
            token,
            errors: aggregate.errors,
            count: aggregate.count,
            score: aggregate.score,
        })
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then_with(|| right.errors.cmp(&left.errors))
            .then_with(|| left.token.cmp(&right.token))
    });
    entries.truncate(limit);
    entries
}

fn is_word_like_token(token: &str) -> bool {
    token.chars().any(|ch| ch.is_ascii_alphabetic())
        && token
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
}

fn normalize_problem_token(token: &str, words: bool) -> String {
    if words && token.chars().all(|ch| ch.is_ascii_alphabetic()) {
        token.to_ascii_lowercase()
    } else {
        token.to_string()
    }
}

pub(super) fn aggregate_key_errors(records: &[&SessionRecord]) -> BTreeMap<String, u32> {
    let mut counts = BTreeMap::<String, u32>::new();
    for record in records {
        for event in &record.key_events {
            if matches!(event.action, KeyAction::Insert) && !event.correct {
                let label = event
                    .expected
                    .or(event.input)
                    .map(key_bucket_for_char)
                    .unwrap_or_else(|| "extra".to_string());
                *counts.entry(label).or_default() += 1;
            }
        }
    }

    for record in records {
        if record.key_events.is_empty() {
            for (label, count) in &record.error_chars {
                *counts.entry(key_bucket_for_label(label)).or_default() += count;
            }
        }
    }

    counts
}

fn top_key_errors(records: &[&SessionRecord], limit: usize) -> Vec<KeyProblem> {
    let counts = aggregate_key_errors(records);
    let mut entries = counts
        .into_iter()
        .map(|(label, count)| KeyProblem { label, count })
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| {
        right
            .count
            .cmp(&left.count)
            .then_with(|| left.label.cmp(&right.label))
    });
    entries.truncate(limit);
    entries
}

fn keyboard_heatmap_lines(counts: &BTreeMap<String, u32>) -> Vec<Line<'static>> {
    keyboard_heatmap_rows(counts, false)
}

fn compact_keyboard_heatmap_lines(counts: &BTreeMap<String, u32>) -> Vec<Line<'static>> {
    keyboard_heatmap_rows(counts, true)
}

fn keyboard_heatmap_rows(counts: &BTreeMap<String, u32>, compact: bool) -> Vec<Line<'static>> {
    let max = counts.values().copied().max().unwrap_or(0);
    let full_rows: &[&[&str]] = &[
        &[
            "`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=",
        ],
        &[
            "q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "[", "]", "\\",
        ],
        &[
            "a", "s", "d", "f", "g", "h", "j", "k", "l", ";", "'", "enter",
        ],
        &["z", "x", "c", "v", "b", "n", "m", ",", ".", "/"],
        &["tab", "space"],
    ];
    let compact_rows: &[&[&str]] = &[
        &[
            "`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=",
        ],
        &[
            "q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "[", "]", "\\",
        ],
        &[
            "a", "s", "d", "f", "g", "h", "j", "k", "l", ";", "'", "enter",
        ],
        &[
            "z", "x", "c", "v", "b", "n", "m", ",", ".", "/", "tab", "space",
        ],
    ];
    let rows = if compact { compact_rows } else { full_rows };

    rows.iter()
        .map(|row| {
            let mut spans = Vec::new();
            for (index, key) in row.iter().enumerate() {
                let count = counts.get(*key).copied().unwrap_or(0);
                if index > 0 {
                    spans.push(Span::raw(" "));
                }
                spans.push(Span::styled(
                    heatmap_key_label(key),
                    heat_cell_style(count, max),
                ));
            }
            Line::from(spans)
        })
        .collect()
}

fn heatmap_legend_line(language: Language, compact: bool) -> Line<'static> {
    let label = match (language, compact) {
        (Language::Zh, true) => "键位热力图",
        (Language::Zh, false) => "颜色深度",
        (Language::En, true) => "Key heatmap",
        (Language::En, false) => "Intensity",
    };
    let mut spans = vec![
        Span::styled(
            label,
            Style::default()
                .fg(Color::Yellow)
                .add_modifier(Modifier::BOLD),
        ),
        Span::raw("  "),
    ];
    for level in 0..=4 {
        if level > 0 {
            spans.push(Span::raw(" "));
        }
        spans.push(Span::styled(
            "    ",
            heat_cell_style_for_level(level, level == 4),
        ));
    }
    spans.push(Span::raw(match language {
        Language::Zh => "  少 -> 多",
        Language::En => "  low -> high",
    }));
    Line::from(spans)
}

fn heatmap_key_label(key: &str) -> String {
    let label = match key {
        "enter" => "ENT",
        "space" => "SPC",
        "tab" => "TAB",
        "\\" => "\\",
        other => other,
    };
    format!("{label:^4}")
}

fn heat_cell_style(value: u32, max: u32) -> Style {
    heat_cell_style_for_level(heat_level(value, max), value > 0 && value == max)
}

fn heat_cell_style_for_level(level: u8, strongest: bool) -> Style {
    let (fg, bg) = match level {
        0 => (Color::Indexed(250), Color::Indexed(236)),
        1 => (Color::White, Color::Indexed(65)),
        2 => (Color::Black, Color::Indexed(178)),
        3 => (Color::Black, Color::Indexed(166)),
        _ => (Color::White, Color::Indexed(160)),
    };
    let mut style = Style::default().fg(fg).bg(bg);
    if strongest {
        style = style.add_modifier(Modifier::BOLD);
    }
    style
}

fn heat_level(value: u32, max: u32) -> u8 {
    if value == 0 || max == 0 {
        return 0;
    }
    let ratio = value as f64 / max as f64;
    if ratio >= 0.75 {
        4
    } else if ratio >= 0.5 {
        3
    } else if ratio >= 0.25 {
        2
    } else {
        1
    }
}

fn key_bucket_for_label(label: &str) -> String {
    match label {
        "<space>" => "space".to_string(),
        "\\n" => "enter".to_string(),
        "\\t" => "tab".to_string(),
        _ => label
            .chars()
            .next()
            .map(key_bucket_for_char)
            .unwrap_or_default(),
    }
}

fn key_bucket_for_char(ch: char) -> String {
    match ch {
        '!' | '1' => "1",
        '@' | '2' => "2",
        '#' | '3' => "3",
        '$' | '4' => "4",
        '%' | '5' => "5",
        '^' | '6' => "6",
        '&' | '7' => "7",
        '*' | '8' => "8",
        '(' | '9' => "9",
        ')' | '0' => "0",
        '_' | '-' => "-",
        '+' | '=' => "=",
        '~' | '`' => "`",
        '{' | '[' => "[",
        '}' | ']' => "]",
        '|' | '\\' => "\\",
        ':' | ';' => ";",
        '"' | '\'' => "'",
        '<' | ',' => ",",
        '>' | '.' => ".",
        '?' | '/' => "/",
        ' ' => "space",
        '\n' => "enter",
        '\t' => "tab",
        ch if ch.is_ascii_alphabetic() => {
            return ch.to_ascii_lowercase().to_string();
        }
        ch => return ch.to_string(),
    }
    .to_string()
}

fn value_bar(value: f64, max: f64, width: usize) -> String {
    if max <= 0.0 {
        return "░".repeat(width);
    }
    let filled = ((value / max).clamp(0.0, 1.0) * width as f64)
        .ceil()
        .max(1.0) as usize;
    let mut bar = String::with_capacity(width);
    for index in 0..width {
        if index < filled {
            bar.push('█');
        } else {
            bar.push('░');
        }
    }
    bar
}

fn heat_color(value: u32, max: u32) -> Color {
    if value == 0 || max == 0 {
        return Color::DarkGray;
    }
    let ratio = value as f64 / max as f64;
    if ratio >= 0.75 {
        Color::LightRed
    } else if ratio >= 0.45 {
        Color::Yellow
    } else {
        Color::LightGreen
    }
}

fn session_line(index: usize, record: &SessionRecord, language: Language) -> Line<'static> {
    let started = record.started_at.with_timezone(&Local).format("%H:%M");
    let duration = format_duration_short(record.duration_ms, language);
    let source = truncate(&record.source, 22);
    match language {
        Language::Zh => Line::from(format!(
            "{}. {}  {}  WPM {:.1} | 正确率 {:.1}% | 错误 {} | 退格 {} | {}",
            index + 1,
            started,
            duration,
            record.wpm,
            record.accuracy,
            record.error_count,
            record.backspace_count,
            source
        )),
        Language::En => Line::from(format!(
            "{}. {}  {}  WPM {:.1} | acc {:.1}% | err {} | back {} | {}",
            index + 1,
            started,
            duration,
            record.wpm,
            record.accuracy,
            record.error_count,
            record.backspace_count,
            source
        )),
    }
}

pub(super) fn stats_dates_from_records(records: &[&SessionRecord]) -> Vec<NaiveDate> {
    let mut dates = BTreeMap::<NaiveDate, ()>::new();
    for record in records {
        dates.insert(record.started_at.with_timezone(&Local).date_naive(), ());
    }
    dates.keys().rev().copied().collect()
}

pub(super) fn records_for_date<'a>(
    records: &[&'a SessionRecord],
    date: NaiveDate,
) -> Vec<&'a SessionRecord> {
    let mut day_records = records
        .iter()
        .copied()
        .filter(|record| record.started_at.with_timezone(&Local).date_naive() == date)
        .collect::<Vec<_>>();
    day_records.sort_by_key(|record| record.started_at);
    day_records
}

fn recent_activity_text(records: &[&SessionRecord], language: Language) -> String {
    let dates = stats_dates_from_records(records);
    let mut parts = Vec::new();
    for date in dates.iter().take(2) {
        let day_records = records_for_date(records, *date);
        let minutes = day_records
            .iter()
            .map(|record| record.duration_ms)
            .sum::<u64>() as f64
            / 60_000.0;
        parts.push(format!(
            "{} {} {:.1}m",
            date.format("%m-%d"),
            minute_bar(minutes, 20.0, 6),
            minutes
        ));
    }
    if parts.is_empty() {
        return text(language, "stats_no_recent").to_string();
    }
    match language {
        Language::Zh => format!("最近 {}", parts.join("  ")),
        Language::En => format!("recent {}", parts.join("  ")),
    }
}

fn minute_bar(value: f64, target: f64, width: usize) -> String {
    let ratio = if target <= 0.0 {
        1.0
    } else {
        (value / target).clamp(0.0, 1.0)
    };
    let filled = (ratio * width as f64).round() as usize;
    let mut bar = String::with_capacity(width);
    for index in 0..width {
        if index < filled {
            bar.push('█');
        } else {
            bar.push('░');
        }
    }
    bar
}

pub(super) fn record_error_rate(record: &SessionRecord) -> Option<f64> {
    if record.target_len == 0 {
        return None;
    }
    Some(f64::from(record.error_count) / record.target_len as f64 * 100.0)
}

fn average(values: impl Iterator<Item = f64>) -> f64 {
    let mut count = 0usize;
    let mut sum = 0.0;
    for value in values {
        count += 1;
        sum += value;
    }
    if count == 0 { 0.0 } else { sum / count as f64 }
}

pub(super) fn weighted_accuracy(records: &[&SessionRecord]) -> f64 {
    let typed_len = records
        .iter()
        .map(|record| effective_typed_len(record))
        .sum::<usize>();
    if typed_len == 0 {
        return average(records.iter().map(|record| record.accuracy));
    }

    records
        .iter()
        .map(|record| {
            record.accuracy.clamp(0.0, 100.0) / 100.0 * effective_typed_len(record) as f64
        })
        .sum::<f64>()
        / typed_len as f64
        * 100.0
}

fn effective_typed_len(record: &SessionRecord) -> usize {
    if record.typed_len > 0 {
        return record.typed_len;
    }
    record.user_input.chars().count().max(record.correct_chars)
}

fn effective_active_ms(record: &SessionRecord) -> u64 {
    if record.active_ms > 0 {
        return record.active_ms;
    }
    record.duration_ms
}

fn timing_totals(records: &[&SessionRecord]) -> (u64, u64, u64) {
    let total_ms = records.iter().map(|record| record.duration_ms).sum::<u64>();
    let active_ms = records
        .iter()
        .map(|record| effective_active_ms(record))
        .sum::<u64>();
    let idle_ms = records.iter().map(|record| record.idle_ms).sum::<u64>();
    (total_ms, active_ms, idle_ms)
}

pub(super) fn aggregate_wpm(records: &[&SessionRecord]) -> f64 {
    let active_ms = records
        .iter()
        .map(|record| effective_active_ms(record))
        .sum::<u64>();
    if active_ms == 0 {
        return average(records.iter().map(|record| record.wpm));
    }

    let correct_chars = records
        .iter()
        .map(|record| record.correct_chars)
        .sum::<usize>();
    let minutes = active_ms.max(1) as f64 / 60_000.0;
    correct_chars as f64 / 5.0 / minutes
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{CompletionState, KeyAggregate, TrainingCategory, TrainingModule};

    fn plain_lines(lines: Vec<Line<'static>>) -> String {
        lines
            .into_iter()
            .map(|line| {
                line.spans
                    .into_iter()
                    .map(|span| span.content.into_owned())
                    .collect::<String>()
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    #[test]
    fn overview_recommendation_uses_recent_plan_window() {
        let mut old_record = SessionRecord {
            started_at: Utc::now() - Duration::days(PLAN_HISTORY_DAYS + 5),
            duration_ms: 60_000,
            ..SessionRecord::default()
        };
        old_record.error_chars.insert("j".to_string(), 5);
        let recent_record = SessionRecord {
            started_at: Utc::now() - Duration::days(1),
            duration_ms: 60_000,
            ..SessionRecord::default()
        };
        let records = vec![&old_record, &recent_record];

        let rendered = stats_overview_lines(&records, Language::Zh)
            .into_iter()
            .map(|line| {
                line.spans
                    .into_iter()
                    .map(|span| span.content.into_owned())
                    .collect::<String>()
            })
            .collect::<Vec<_>>()
            .join("\n");

        assert!(rendered.contains("下一次综合会保持均衡计划"));
        assert!(!rendered.contains("键位专项：j"));
    }

    #[test]
    fn stats_today_lines_split_comprehensive_and_standalone() {
        let comprehensive = SessionRecord {
            started_at: Local::now().with_timezone(&Utc),
            daily_run_id: "20260601-1".to_string(),
            duration_ms: 60_000,
            active_ms: 30_000,
            correct_chars: 150,
            accuracy: 100.0,
            ..SessionRecord::default()
        };
        let standalone = SessionRecord {
            started_at: Local::now().with_timezone(&Utc),
            duration_ms: 120_000,
            active_ms: 60_000,
            correct_chars: 100,
            accuracy: 90.0,
            ..SessionRecord::default()
        };
        let records = vec![&comprehensive, &standalone];

        let rendered = plain_lines(stats_today_lines(&records, 8, Language::Zh));

        assert!(rendered.contains("综合练习  1 次"));
        assert!(rendered.contains("专项练习  1 次"));
        assert!(rendered.contains("active 30 秒"));
        assert!(rendered.contains("active 1 分钟"));
    }

    #[test]
    fn comprehensive_run_lines_group_by_daily_run_id() {
        let first = SessionRecord {
            daily_run_id: "run-a".to_string(),
            module: TrainingModule::FoundationInput,
            completion_state: CompletionState::Completed,
            active_ms: 30_000,
            correct_chars: 120,
            accuracy: 96.0,
            ..SessionRecord::default()
        };
        let second = SessionRecord {
            daily_run_id: "run-a".to_string(),
            module: TrainingModule::ProgrammingBasics,
            completion_state: CompletionState::Completed,
            active_ms: 60_000,
            correct_chars: 180,
            accuracy: 90.0,
            ..SessionRecord::default()
        };
        let standalone = SessionRecord {
            active_ms: 60_000,
            ..SessionRecord::default()
        };
        let records = vec![&first, &second, &standalone];

        let rendered = plain_lines(stats_comprehensive_lines(&records, 8, Language::En));

        assert!(rendered.contains("run-a"));
        assert!(rendered.contains("2 groups"));
        assert!(rendered.contains("2 modules"));
    }

    #[test]
    fn module_stats_identifies_weakest_module_driver() {
        let foundation = SessionRecord {
            module: TrainingModule::FoundationInput,
            category: TrainingCategory::FoundationMix,
            active_ms: 60_000,
            correct_chars: 180,
            target_len: 120,
            error_count: 2,
            accuracy: 98.0,
            ..SessionRecord::default()
        };
        let code = SessionRecord {
            module: TrainingModule::CodePractice,
            category: TrainingCategory::CodeSnippet,
            active_ms: 60_000,
            correct_chars: 120,
            target_len: 100,
            error_count: 12,
            accuracy: 88.0,
            ..SessionRecord::default()
        };
        let records = vec![&foundation, &code];

        let rendered = plain_lines(stats_module_lines(&records, 8, Language::En));

        assert!(rendered.contains("Next driver"));
        assert!(rendered.contains("Code practice"));
    }

    #[test]
    fn key_stats_lines_can_sort_by_error_rate_and_show_timing_columns() {
        let aggregates = vec![
            KeyAggregate {
                key: "a".to_string(),
                sample_count: 10,
                hit_count: 9,
                miss_count: 1,
                avg_ms: 120.0,
                fastest_ms: 80,
                slowest_ms: 260,
                filtered_avg_ms: 120.0,
                error_rate: 10.0,
                confidence: 1.8,
                last_seen_at: None,
            },
            KeyAggregate {
                key: "b".to_string(),
                sample_count: 5,
                hit_count: 2,
                miss_count: 3,
                avg_ms: 200.0,
                fastest_ms: 100,
                slowest_ms: 500,
                filtered_avg_ms: 200.0,
                error_rate: 60.0,
                confidence: 0.8,
                last_seen_at: None,
            },
        ];

        let rendered = plain_lines(key_stats_lines(
            &aggregates,
            KeyStatsSort::HighestErrorRate,
            8,
            Language::En,
        ));

        assert!(rendered.contains("fast"));
        assert!(rendered.contains("avg"));
        assert!(rendered.contains("slow"));
        assert!(rendered.contains("err"));
        assert!(rendered.contains("samples"));
        assert!(rendered.find("\nb").unwrap() < rendered.find("\na").unwrap());
    }
}
