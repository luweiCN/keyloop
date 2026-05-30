use crate::model::{Language, Mode, SessionRecord, TokenKind};
use chrono::{Duration, Utc};
use std::collections::BTreeMap;

#[derive(Debug, Clone)]
pub struct PracticePlan {
    pub focus_words: Vec<String>,
    pub focus_symbols: Vec<String>,
    pub focus_code: Vec<String>,
    pub advice: Vec<String>,
    pub recommended_mode: Mode,
}

#[derive(Debug, Default)]
struct Aggregate {
    occurrences: u32,
    errors: u32,
    delay_sum: u64,
    duration_sum: u64,
}

impl Aggregate {
    fn add(&mut self, delay: u64, duration: u64, errors: u32) {
        self.occurrences += 1;
        self.errors += errors;
        self.delay_sum += delay;
        self.duration_sum += duration;
    }

    fn avg_delay(&self) -> f64 {
        if self.occurrences == 0 {
            return 0.0;
        }
        self.delay_sum as f64 / self.occurrences as f64
    }

    fn avg_duration(&self) -> f64 {
        if self.occurrences == 0 {
            return 0.0;
        }
        self.duration_sum as f64 / self.occurrences as f64
    }

    fn score(&self) -> f64 {
        self.avg_delay() + self.avg_duration() * 0.25 + f64::from(self.errors) * 300.0
    }
}

pub fn build_plan(records: &[SessionRecord], language: Language) -> PracticePlan {
    let recent_cutoff = Utc::now() - Duration::days(21);
    let recent: Vec<&SessionRecord> = records
        .iter()
        .filter(|record| record.started_at >= recent_cutoff)
        .collect();

    if recent.is_empty() {
        return PracticePlan {
            focus_words: vec![
                "return".into(),
                "function".into(),
                "current".into(),
                "response".into(),
                "useEffect".into(),
            ],
            focus_symbols: vec![
                "=>".into(),
                "!==".into(),
                "&&".into(),
                "_".into(),
                "{}".into(),
            ],
            focus_code: vec!["useState".into(), "items.map".into(), "!== null".into()],
            advice: no_history_advice(language),
            recommended_mode: Mode::Chars,
        };
    }

    let mut words = BTreeMap::<String, Aggregate>::new();
    let mut symbols = BTreeMap::<String, Aggregate>::new();
    let mut code_terms = BTreeMap::<String, Aggregate>::new();
    let mut total_typed = 0usize;
    let mut total_key_correct = 0usize;
    let mut total_backspaces = 0u32;

    for record in &recent {
        let typed_len = effective_typed_len(record);
        total_typed += typed_len;
        total_key_correct +=
            (record.accuracy.clamp(0.0, 100.0) / 100.0 * typed_len as f64).round() as usize;
        total_backspaces += record.backspace_count;

        if record.token_stats.is_empty() {
            for (token, errors) in &record.error_tokens {
                let aggregate = if is_word_like_token(token) {
                    words.entry(token.clone()).or_default()
                } else {
                    symbols.entry(token.clone()).or_default()
                };
                aggregate.add(0, 0, *errors);
            }
        } else {
            for stat in &record.token_stats {
                let aggregate = match stat.kind {
                    TokenKind::Word => words.entry(stat.token.clone()).or_default(),
                    TokenKind::Symbol => symbols.entry(stat.token.clone()).or_default(),
                    TokenKind::Code => code_terms.entry(stat.token.clone()).or_default(),
                };
                aggregate.add(stat.start_delay_ms, stat.duration_ms, stat.errors);
            }
        }
    }

    let focus_words = top_keys(&words, 16)
        .into_iter()
        .filter(|word| is_focus_word(word))
        .take(6)
        .collect::<Vec<_>>();
    let focus_symbols = top_keys(&symbols, 6);
    let mut focus_code = top_keys(&code_terms, 8)
        .into_iter()
        .filter(|term| term.chars().count() >= 2)
        .take(4)
        .collect::<Vec<_>>();
    for word in focus_words.iter().take(3) {
        if !focus_code.contains(word) {
            focus_code.push(word.clone());
        }
    }

    let accuracy = if total_typed == 0 {
        0.0
    } else {
        total_key_correct as f64 / total_typed as f64 * 100.0
    };

    let mut advice = Vec::new();
    if accuracy < 95.0 {
        advice.push(match language {
            Language::Zh => "正确率低于 95%。下一轮缩短一点，慢一点打准。".into(),
            Language::En => {
                "Accuracy is below 95%. Keep the next session shorter and type deliberately.".into()
            }
        });
    }
    if total_backspaces > recent.len() as u32 * 12 {
        advice.push(match language {
            Language::Zh => "退格偏多。放慢一点，避免反复修正。".into(),
            Language::En => {
                "Backspace count is high. Slow down slightly and avoid correction loops.".into()
            }
        });
    }
    if !focus_words.is_empty() {
        advice.push(match language {
            Language::Zh => format!("复盘单词和标识符：{}。", focus_words.join(", ")),
            Language::En => format!("Review words and identifiers: {}.", focus_words.join(", ")),
        });
    }
    if !focus_symbols.is_empty() {
        advice.push(match language {
            Language::Zh => format!("复盘代码符号：{}。", focus_symbols.join(", ")),
            Language::En => format!("Review code symbols: {}.", focus_symbols.join(", ")),
        });
    }
    if advice.is_empty() {
        advice.push(match language {
            Language::Zh => "表现比较稳定。可以用混合模式，并加入更多真实代码片段。".into(),
            Language::En => {
                "Performance looks stable. Use mixed mode and include more real code snippets."
                    .into()
            }
        });
    }

    let symbol_pressure = symbols.values().map(Aggregate::score).sum::<f64>();
    let word_pressure = words.values().map(Aggregate::score).sum::<f64>();
    let recommended_mode = if symbol_pressure > word_pressure * 1.15 {
        Mode::Symbols
    } else if word_pressure > symbol_pressure * 1.15 {
        Mode::Words
    } else {
        Mode::Mixed
    };

    PracticePlan {
        focus_words,
        focus_symbols,
        focus_code,
        advice,
        recommended_mode,
    }
}

fn no_history_advice(language: Language) -> Vec<String> {
    match language {
        Language::Zh => vec![
            "还没有练习记录。先从基础字符开始，建立一条基准数据。".into(),
            "先把正确率打稳，再追速度，这样后续分析才有用。".into(),
        ],
        Language::En => vec![
            "No history yet. Start with a mixed baseline session.".into(),
            "Focus on accuracy before speed so the data is useful.".into(),
        ],
    }
}

fn top_keys(map: &BTreeMap<String, Aggregate>, limit: usize) -> Vec<String> {
    let mut scored: Vec<(&String, &Aggregate)> = map.iter().collect();
    scored.sort_by(|(_, a), (_, b)| {
        b.score()
            .partial_cmp(&a.score())
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    scored
        .into_iter()
        .filter(|(_, aggregate)| aggregate.occurrences > 0)
        .take(limit)
        .map(|(key, _)| key.clone())
        .collect()
}

fn is_focus_word(word: &str) -> bool {
    let len = word.chars().count();
    if len < 3 {
        return false;
    }
    word.chars().any(|ch| ch.is_ascii_uppercase()) || len >= 5
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

    #[test]
    fn build_plan_uses_legacy_error_tokens() {
        let mut record = SessionRecord {
            started_at: Utc::now(),
            typed_len: 10,
            accuracy: 80.0,
            ..SessionRecord::default()
        };
        record.error_tokens.insert("response".to_string(), 3);
        record.error_tokens.insert("=>".to_string(), 2);

        let plan = build_plan(&[record], Language::Zh);

        assert!(plan.focus_words.contains(&"response".to_string()));
        assert!(plan.focus_symbols.contains(&"=>".to_string()));
    }

    #[test]
    fn build_plan_uses_legacy_typed_len_fallback() {
        let record = SessionRecord {
            started_at: Utc::now(),
            typed_len: 0,
            correct_chars: 20,
            accuracy: 100.0,
            user_input: "abcdefghijklmnopqrst".to_string(),
            ..SessionRecord::default()
        };

        let plan = build_plan(&[record], Language::Zh);

        assert!(
            !plan
                .advice
                .iter()
                .any(|item| item.contains("正确率低于 95%"))
        );
    }
}
