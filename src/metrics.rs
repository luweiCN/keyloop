use crate::model::{
    CharStats, KeyAction, KeyEventRecord, PracticeTarget, SessionRecord, TokenKind, TokenStat,
};
use chrono::{DateTime, Utc};
use std::collections::BTreeMap;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct TokenSpan {
    pub token: String,
    pub kind: TokenKind,
    pub start: usize,
    pub end: usize,
}

const SYMBOL_PATTERNS: &[&str] = &[
    "!==", "===", "=>", "&&", "||", ">=", "<=", "?.", "??", "${}", "()", "[]", "{}", "<>", "''",
    "\"\"", "``", "::", "->", "+=", "-=", "*=", "/=", "_", "-", "=", "+", "*", "/", "\\", "?", "!",
    ":", ";", ",", ".", "(", ")", "[", "]", "{", "}", "<", ">", "'", "\"", "`",
];
const IDLE_THRESHOLD_MS: u64 = 10_000;

#[derive(Debug, Clone, Copy, Default)]
struct TimingBreakdown {
    active_ms: u64,
    idle_ms: u64,
    idle_pause_count: u32,
    start_to_first_key_ms: u64,
    last_key_to_end_ms: u64,
}

pub fn build_session_record(
    target: PracticeTarget,
    started_at: DateTime<Utc>,
    duration_ms: u64,
    manual_pause_ms: u64,
    user_input: String,
    key_events: Vec<KeyEventRecord>,
) -> SessionRecord {
    let target_chars: Vec<char> = target.text.chars().collect();
    let input_chars: Vec<char> = user_input.chars().collect();
    let target_len = target_chars.len();
    let insert_count = key_events
        .iter()
        .filter(|event| matches!(event.action, KeyAction::Insert))
        .count();
    let correct_insert_count = key_events
        .iter()
        .filter(|event| matches!(event.action, KeyAction::Insert) && event.correct)
        .count();
    let has_auto_indent = key_events
        .iter()
        .any(|event| matches!(event.action, KeyAction::AutoIndent));
    let backspace_count = key_events
        .iter()
        .filter(|event| matches!(event.action, KeyAction::Backspace))
        .count() as u32;
    let final_correct_chars = target_chars
        .iter()
        .zip(input_chars.iter())
        .filter(|(expected, actual)| expected == actual)
        .count();
    let correct_chars = if has_auto_indent {
        correct_insert_count
    } else {
        final_correct_chars
    };

    let mut error_chars = BTreeMap::<String, u32>::new();
    let error_count = key_events
        .iter()
        .filter(|event| matches!(event.action, KeyAction::Insert) && !event.correct)
        .inspect(|event| {
            let key = event
                .expected
                .or(event.input)
                .map(|ch| printable_char(ch).to_string())
                .unwrap_or_else(|| "<extra>".into());
            *error_chars.entry(key).or_default() += 1;
        })
        .count() as u32;
    let timing = timing_breakdown(duration_ms, &key_events);
    let adjusted_key_events = adjusted_key_events(&key_events, timing.start_to_first_key_ms);

    let minutes = (timing.active_ms.max(1) as f64) / 60_000.0;
    let raw_wpm = insert_count as f64 / 5.0 / minutes;
    let wpm = correct_chars as f64 / 5.0 / minutes;
    let accuracy = if insert_count == 0 {
        0.0
    } else {
        correct_insert_count as f64 / insert_count as f64 * 100.0
    };

    let token_stats = collect_token_stats(&target.text, &adjusted_key_events);
    let mut error_tokens = BTreeMap::<String, u32>::new();
    for stat in &token_stats {
        if stat.errors > 0 {
            *error_tokens.entry(stat.token.clone()).or_default() += stat.errors;
        }
    }

    let mut slow_tokens = token_stats.clone();
    slow_tokens.sort_by_key(|stat| {
        std::cmp::Reverse(stat.start_delay_ms + stat.duration_ms / 2 + u64::from(stat.errors) * 250)
    });
    slow_tokens.truncate(12);

    SessionRecord {
        id: Uuid::new_v4().to_string(),
        started_at,
        mode: target.mode,
        source: target.source,
        daily_run_id: String::new(),
        lesson_id: String::new(),
        lesson_index: None,
        completion_state: Default::default(),
        module: Default::default(),
        category: Default::default(),
        active_ms: timing.active_ms,
        idle_ms: timing.idle_ms,
        manual_pause_ms,
        idle_pause_count: timing.idle_pause_count,
        start_to_first_key_ms: timing.start_to_first_key_ms,
        last_key_to_end_ms: timing.last_key_to_end_ms,
        char_stats: CharStats {
            correct: correct_chars,
            incorrect: error_count as usize,
            extra: input_chars.len().saturating_sub(target_chars.len()),
            missed: target_len.saturating_sub(input_chars.len()),
        },
        duration_ms,
        target_text: target.text,
        user_input,
        target_len,
        typed_len: insert_count,
        correct_chars,
        wpm,
        raw_wpm,
        accuracy,
        error_count,
        backspace_count,
        error_chars,
        error_tokens,
        slow_tokens,
        token_stats,
        key_events,
    }
}

fn timing_breakdown(duration_ms: u64, key_events: &[KeyEventRecord]) -> TimingBreakdown {
    let Some(first) = key_events.first() else {
        return TimingBreakdown::default();
    };
    let last = key_events.last().expect("first event exists");
    let start_to_first_key_ms = first.at_ms.min(duration_ms);
    let last_key_to_end_ms = duration_ms.saturating_sub(last.at_ms.min(duration_ms));
    let mut idle_ms = 0;
    let mut idle_pause_count = 0;
    for pair in key_events.windows(2) {
        let gap = pair[1].at_ms.saturating_sub(pair[0].at_ms);
        if gap > IDLE_THRESHOLD_MS {
            idle_pause_count += 1;
            idle_ms += gap - IDLE_THRESHOLD_MS;
        }
    }
    let active_ms = duration_ms
        .saturating_sub(start_to_first_key_ms)
        .saturating_sub(last_key_to_end_ms)
        .saturating_sub(idle_ms);

    TimingBreakdown {
        active_ms,
        idle_ms,
        idle_pause_count,
        start_to_first_key_ms,
        last_key_to_end_ms,
    }
}

fn adjusted_key_events(
    key_events: &[KeyEventRecord],
    start_to_first_key_ms: u64,
) -> Vec<KeyEventRecord> {
    let mut adjusted = Vec::with_capacity(key_events.len());
    let mut idle_excess_before = 0;
    let mut previous_at = None;
    for event in key_events {
        if let Some(previous_at) = previous_at {
            let gap = event.at_ms.saturating_sub(previous_at);
            if gap > IDLE_THRESHOLD_MS {
                idle_excess_before += gap - IDLE_THRESHOLD_MS;
            }
        }
        let mut event = event.clone();
        event.at_ms = event
            .at_ms
            .saturating_sub(start_to_first_key_ms)
            .saturating_sub(idle_excess_before);
        previous_at = Some(event.at_ms + start_to_first_key_ms + idle_excess_before);
        adjusted.push(event);
    }
    adjusted
}

pub fn token_spans(text: &str) -> Vec<TokenSpan> {
    let chars: Vec<char> = text.chars().collect();
    let mut spans = Vec::new();
    let mut index = 0;

    while index < chars.len() {
        if chars[index].is_whitespace() {
            index += 1;
            continue;
        }

        if is_word_start(chars[index]) {
            let start = index;
            index += 1;
            while index < chars.len() && is_word_continue(chars[index]) {
                index += 1;
            }
            let token: String = chars[start..index].iter().collect();
            let kind = if token == "_" {
                TokenKind::Symbol
            } else {
                TokenKind::Word
            };
            spans.push(TokenSpan {
                token,
                kind,
                start,
                end: index,
            });
            continue;
        }

        if let Some(pattern) = match_symbol_at(&chars, index) {
            let len = pattern.chars().count();
            spans.push(TokenSpan {
                token: pattern.to_string(),
                kind: TokenKind::Symbol,
                start: index,
                end: index + len,
            });
            index += len;
            continue;
        }

        spans.push(TokenSpan {
            token: chars[index].to_string(),
            kind: TokenKind::Code,
            start: index,
            end: index + 1,
        });
        index += 1;
    }

    spans
}

fn collect_token_stats(text: &str, key_events: &[KeyEventRecord]) -> Vec<TokenStat> {
    let spans = token_spans(text);
    let inserts: Vec<&KeyEventRecord> = key_events
        .iter()
        .filter(|event| matches!(event.action, KeyAction::Insert))
        .collect();

    let mut visible_at_ms = 0;
    let mut stats = Vec::new();

    for span in spans {
        let events: Vec<&KeyEventRecord> = inserts
            .iter()
            .copied()
            .filter(|event| {
                event.at_ms >= visible_at_ms
                    && event.position >= span.start
                    && event.position < span.end
            })
            .collect();

        if let (Some(first), Some(last)) = (events.first(), events.last()) {
            let errors = events.iter().filter(|event| !event.correct).count() as u32;
            stats.push(TokenStat {
                token: span.token,
                kind: span.kind,
                start_delay_ms: first.at_ms.saturating_sub(visible_at_ms),
                duration_ms: last.at_ms.saturating_sub(first.at_ms),
                errors,
            });
            visible_at_ms = last.at_ms;
        }
    }

    stats
}

fn match_symbol_at(chars: &[char], index: usize) -> Option<&'static str> {
    SYMBOL_PATTERNS.iter().copied().find(|pattern| {
        let pattern_chars: Vec<char> = pattern.chars().collect();
        let end = index + pattern_chars.len();
        end <= chars.len() && chars[index..end] == pattern_chars
    })
}

fn is_word_start(ch: char) -> bool {
    ch.is_ascii_alphabetic() || ch == '_'
}

fn is_word_continue(ch: char) -> bool {
    ch.is_ascii_alphanumeric() || ch == '_'
}

fn printable_char(ch: char) -> String {
    match ch {
        '\n' => "\\n".into(),
        '\t' => "\\t".into(),
        ' ' => "<space>".into(),
        other => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokenizes_words_and_programming_symbols() {
        let tokens: Vec<String> = token_spans("items.map((item) => item.id !== null)")
            .into_iter()
            .map(|span| span.token)
            .collect();

        assert!(tokens.contains(&"items".to_string()));
        assert!(tokens.contains(&"=>".to_string()));
        assert!(tokens.contains(&"!==".to_string()));
    }

    #[test]
    fn accuracy_counts_corrected_mistakes() {
        let target = PracticeTarget {
            mode: crate::model::Mode::Words,
            text: "abc".to_string(),
            source: "test".to_string(),
        };
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
            KeyEventRecord {
                at_ms: 500,
                action: KeyAction::Insert,
                position: 2,
                expected: Some('c'),
                input: Some('c'),
                correct: true,
            },
        ];

        let record = build_session_record(target, Utc::now(), 1000, 0, "abc".to_string(), events);

        assert_eq!(record.correct_chars, 3);
        assert_eq!(record.typed_len, 4);
        assert_eq!(record.error_count, 1);
        assert_eq!(record.accuracy, 75.0);
    }

    #[test]
    fn wpm_excludes_start_delay_and_last_key_tail() {
        let target = PracticeTarget {
            mode: crate::model::Mode::Words,
            text: "abc".to_string(),
            source: "test".to_string(),
        };
        let events = vec![
            insert(5_000, 0, 'a', true),
            insert(5_500, 1, 'b', true),
            insert(6_000, 2, 'c', true),
        ];

        let record = build_session_record(target, Utc::now(), 20_000, 0, "abc".to_string(), events);

        assert_eq!(record.start_to_first_key_ms, 5_000);
        assert_eq!(record.last_key_to_end_ms, 14_000);
        assert_eq!(record.active_ms, 1_000);
        assert!((record.wpm - 36.0).abs() < f64::EPSILON);
    }

    #[test]
    fn idle_gap_excess_is_excluded_from_wpm_and_token_stats() {
        let target = PracticeTarget {
            mode: crate::model::Mode::Words,
            text: "ab cd".to_string(),
            source: "test".to_string(),
        };
        let events = vec![
            insert(100, 0, 'a', true),
            insert(200, 1, 'b', true),
            insert(20_300, 3, 'c', true),
            insert(20_400, 4, 'd', true),
        ];

        let record =
            build_session_record(target, Utc::now(), 20_500, 0, "ab cd".to_string(), events);

        assert_eq!(record.idle_pause_count, 1);
        assert_eq!(record.idle_ms, 10_100);
        assert_eq!(record.active_ms, 10_200);
        let cd = record
            .token_stats
            .iter()
            .find(|stat| stat.token == "cd")
            .expect("cd token should be measured");
        assert_eq!(cd.start_delay_ms, 10_000);
    }

    #[test]
    fn token_stats_ignore_obsolete_events_after_cross_token_retype() {
        let events = vec![
            insert(100, 0, 'f', true),
            insert(200, 1, 'o', true),
            insert(300, 2, 'o', true),
            insert(400, 4, 'b', true),
            insert(500, 5, 'a', true),
            insert(600, 6, 'x', false),
            insert(900, 2, 'o', true),
            insert(1000, 4, 'b', true),
            insert(1100, 5, 'a', true),
            insert(1200, 6, 'r', true),
        ];

        let stats = collect_token_stats("foo bar", &events);
        let bar = stats
            .iter()
            .find(|stat| stat.token == "bar")
            .expect("bar token should be measured");

        assert_eq!(bar.start_delay_ms, 100);
        assert_eq!(bar.duration_ms, 200);
        assert_eq!(bar.errors, 0);
    }

    fn insert(at_ms: u64, position: usize, input: char, correct: bool) -> KeyEventRecord {
        KeyEventRecord {
            at_ms,
            action: KeyAction::Insert,
            position,
            expected: Some(input),
            input: Some(input),
            correct,
        }
    }
}
