import { describe, expect, test } from "bun:test";

import {
  parsePracticeLesson,
  parsePracticeTarget,
  parseSessionRecord,
  parseUserPreferences,
} from "../src/index";

describe("domain model compatibility", () => {
  test("session records default missing diagnostic and module fields", () => {
    const record = parseSessionRecord({
      started_at: "2026-05-30T00:00:00Z",
      mode: "words",
      source: "legacy",
      duration_ms: 60000,
      target_text: "hello",
      user_input: "hello",
      target_len: 5,
      typed_len: 5,
      correct_chars: 5,
      wpm: 10,
      raw_wpm: 10,
      accuracy: 100,
      error_count: 0,
      backspace_count: 0,
    });

    expect(record.id).toBe("legacy");
    expect(record.module).toBe("unknown");
    expect(record.category).toBe("unknown");
    expect(record.error_chars).toEqual({});
    expect(record.error_tokens).toEqual({});
    expect(record.slow_tokens).toEqual([]);
    expect(record.token_stats).toEqual([]);
    expect(record.key_events).toEqual([]);
    expect(record.active_ms).toBe(0);
    expect(record.char_stats).toEqual({
      correct: 0,
      incorrect: 0,
      extra: 0,
      missed: 0,
    });
  });

  test("practice lessons default missing module fields like Rust serde defaults", () => {
    const lesson = parsePracticeLesson({
      id: "daily-words-1",
      kind: "words",
      estimated_minutes: 3,
      target: { mode: "words", text: "return value", source: "test" },
      reason_zh: "test",
      reason_en: "test",
    });

    expect(lesson.module).toBe("programming_basics");
    expect(lesson.category).toBe("programming_terms");
    expect(lesson.mix_profile).toBe("standalone");
  });

  test("practice target preserves optional code block metadata", () => {
    const lesson = parsePracticeLesson({
      id: "daily-code-1",
      kind: "code_block",
      estimated_minutes: 4,
      target: {
        mode: "code",
        text: "const value = true;",
        source: "keyloop:code-corpus",
        code_blocks: [
          {
            start_line: 0,
            line_count: 1,
            language: "typescript",
            framework: "react",
            project: "web",
            source: "src/example.ts:1",
          },
        ],
      },
      reason_zh: "test",
      reason_en: "test",
    });

    expect(lesson.target.code_blocks).toEqual([
      {
        start_line: 0,
        line_count: 1,
        language: "typescript",
        framework: "react",
        project: "web",
        source: "src/example.ts:1",
      },
    ]);
  });

  test("practice target preserves optional translation annotations", () => {
    const target = parsePracticeTarget({
      mode: "words",
      text: "information",
      source: "keyloop:daily-english:words",
      annotations: [
        {
          start: 0,
          end: 11,
          translation_zh: "信息；资料",
          source_title: "Starter words",
        },
      ],
    });

    expect(target.annotations).toEqual([
      {
        start: 0,
        end: 11,
        translation_zh: "信息；资料",
        source_title: "Starter words",
      },
    ]);
  });

  test("daily English preferences default new option fields and clamp old word counts", () => {
    const defaults = parseUserPreferences({});
    const legacy = parseUserPreferences({
      everyday_english: {
        word_count: 25,
        sentence_length: "short",
        include_phrases: false,
      },
    });

    expect(defaults.everyday_english).toEqual({
      word_range: "1000",
      word_count: 20,
      sentence_level: "cet4",
      sentence_length: "mixed",
      sentence_count: 5,
      article_level: "cet4",
      article_length: "short",
      decomposition_level: "cet4",
      decomposition_word_count: 10,
      decomposition_part_repeats: 3,
      decomposition_word_repeats: 3,
      include_phrases: true,
    });
    expect(legacy.everyday_english.word_count).toBe(20);
    expect(legacy.everyday_english.sentence_length).toBe("short");
    expect(legacy.everyday_english.include_phrases).toBe(false);
  });
});
