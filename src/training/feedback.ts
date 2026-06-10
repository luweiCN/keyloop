import type { GroupFeedback, SessionRecord } from "../domain/model";
import { isNumberedTemplateIdentifier } from "./generatedIdentifier";

const GROUP_FEEDBACK_SLOW_TOKEN_THRESHOLD_MS = 1200;

export function groupFeedback(record: SessionRecord): GroupFeedback {
  const feedback = emptyGroupFeedback();
  for (const [key, count] of sortedObjectEntries(record.error_chars)) {
    feedback.error_keys.push([key, count]);
  }
  for (const stat of record.token_stats) {
    if (isNumberedTemplateIdentifier(stat.token)) {
      continue;
    }
    if (stat.errors > 0) {
      feedback.error_tokens.push([stat.token, stat.errors]);
    }
    const tokenMs = stat.start_delay_ms + stat.duration_ms;
    if (tokenMs >= GROUP_FEEDBACK_SLOW_TOKEN_THRESHOLD_MS) {
      feedback.slow_tokens.push([stat.token, tokenMs]);
    }
  }
  for (const event of record.key_events) {
    if (event.action === "insert" && !event.correct) {
      feedback.error_keys.push([event.expected ?? event.input ?? "extra", 1]);
    }
  }
  return normalizeGroupFeedback(feedback);
}

export function recentFeedbackTerms(records: SessionRecord[]): string[] {
  const terms: string[] = [];
  for (const record of records.slice(-4).reverse()) {
    const feedback = groupFeedback(record);
    terms.push(...feedback.error_tokens.map(([token]) => token));
    terms.push(...feedback.slow_tokens.map(([token]) => token));
    terms.push(...feedback.error_keys.map(([key]) => key));
  }
  return uniqueTerms(terms.filter((term) => term.trim() !== "")).slice(0, 12);
}

function emptyGroupFeedback(): GroupFeedback {
  return {
    error_keys: [],
    slow_keys: [],
    error_tokens: [],
    slow_tokens: [],
    missed_symbols: [],
    backspace_clusters: [],
  };
}

function normalizeGroupFeedback(feedback: GroupFeedback): GroupFeedback {
  return {
    error_keys: normalizePairs(feedback.error_keys),
    slow_keys: normalizePairs(feedback.slow_keys),
    error_tokens: normalizePairs(feedback.error_tokens),
    slow_tokens: normalizePairs(feedback.slow_tokens),
    missed_symbols: normalizePairs(feedback.missed_symbols),
    backspace_clusters: normalizePairs(feedback.backspace_clusters),
  };
}

function normalizePairs(pairs: Array<[string, number]>): Array<[string, number]> {
  const sorted = [...pairs].sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    const keyOrder = compareText(leftKey, rightKey);
    return keyOrder === 0 ? leftValue - rightValue : keyOrder;
  });
  const normalized: Array<[string, number]> = [];
  for (const pair of sorted) {
    const previous = normalized.at(-1);
    if (
      previous !== undefined &&
      previous[0] === pair[0] &&
      previous[1] === pair[1]
    ) {
      continue;
    }
    normalized.push(pair);
  }
  return normalized;
}

function sortedObjectEntries(object: Record<string, number>): Array<[string, number]> {
  return Object.entries(object).sort(([left], [right]) => compareText(left, right));
}

function uniqueTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const term of terms) {
    if (seen.has(term)) {
      continue;
    }
    seen.add(term);
    unique.push(term);
  }
  return unique;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
