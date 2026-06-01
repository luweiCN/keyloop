use crate::model::{GroupFeedback, KeyAction, SessionRecord};

pub fn group_feedback(record: &SessionRecord) -> GroupFeedback {
    let mut feedback = GroupFeedback::default();
    for (key, count) in &record.error_chars {
        feedback.error_keys.push((key.clone(), *count));
    }
    for stat in &record.token_stats {
        if is_numbered_template_identifier(&stat.token) {
            continue;
        }
        if stat.errors > 0 {
            feedback
                .error_tokens
                .push((stat.token.clone(), stat.errors));
        }
        if stat.start_delay_ms + stat.duration_ms >= 1_200 {
            feedback
                .slow_tokens
                .push((stat.token.clone(), stat.start_delay_ms + stat.duration_ms));
        }
    }
    for event in &record.key_events {
        if matches!(event.action, KeyAction::Insert) && !event.correct {
            let label = event
                .expected
                .or(event.input)
                .map(|ch| ch.to_string())
                .unwrap_or_else(|| "extra".to_string());
            feedback.error_keys.push((label, 1));
        }
    }
    feedback.normalize();
    feedback
}

pub fn is_numbered_template_identifier(token: &str) -> bool {
    let chars = token.chars().collect::<Vec<_>>();
    let mut index = 1usize;
    while index + 1 < chars.len() {
        if !chars[index].is_ascii_digit() || !chars[index - 1].is_ascii_lowercase() {
            index += 1;
            continue;
        }
        let mut after_digits = index + 1;
        while after_digits < chars.len() && chars[after_digits].is_ascii_digit() {
            after_digits += 1;
        }
        if after_digits < chars.len()
            && (chars[after_digits].is_ascii_alphabetic()
                || chars[after_digits] == '_'
                || chars[after_digits] == '-')
        {
            return true;
        }
        index = after_digits;
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Mode, SessionRecord, TokenKind, TokenStat};

    #[test]
    fn feedback_extracts_error_and_slow_tokens() {
        let record = SessionRecord {
            mode: Mode::Words,
            token_stats: vec![
                TokenStat {
                    token: "response".to_string(),
                    kind: TokenKind::Word,
                    start_delay_ms: 900,
                    duration_ms: 500,
                    errors: 1,
                },
                TokenStat {
                    token: "transaction5Open".to_string(),
                    kind: TokenKind::Word,
                    start_delay_ms: 1_500,
                    duration_ms: 500,
                    errors: 2,
                },
                TokenStat {
                    token: "return".to_string(),
                    kind: TokenKind::Word,
                    start_delay_ms: 50,
                    duration_ms: 120,
                    errors: 0,
                },
            ],
            ..SessionRecord::default()
        };

        let feedback = group_feedback(&record);

        assert_eq!(feedback.error_tokens, vec![("response".to_string(), 1)]);
        assert_eq!(feedback.slow_tokens, vec![("response".to_string(), 1_400)]);
    }

    #[test]
    fn numbered_template_identifier_detection_avoids_common_code_names() {
        assert!(is_numbered_template_identifier("transaction5Open"));
        assert!(is_numbered_template_identifier("Module6Config"));
        assert!(is_numbered_template_identifier("module3-list"));
        assert!(!is_numbered_template_identifier("uint256"));
        assert!(!is_numbered_template_identifier("ERC20"));
        assert!(!is_numbered_template_identifier("H2Title"));
    }
}
