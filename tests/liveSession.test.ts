import { describe, expect, test } from "bun:test";

import {
  applyLiveKey,
  createLiveSession,
  liveMetrics,
  sessionRecordFromLiveSession,
  type KeyEventRecord,
} from "../src/index";

describe("live session core parity", () => {
  test("live raw wpm counts backspaced inserts", () => {
    const events: KeyEventRecord[] = [
      {
        at_ms: 100,
        action: "insert",
        position: 0,
        expected: "a",
        input: "a",
        correct: true,
      },
      {
        at_ms: 200,
        action: "insert",
        position: 1,
        expected: "b",
        input: "x",
        correct: false,
      },
      {
        at_ms: 300,
        action: "backspace",
        position: 1,
        expected: "b",
        input: null,
        correct: false,
      },
      {
        at_ms: 400,
        action: "insert",
        position: 1,
        expected: "b",
        input: "b",
        correct: true,
      },
    ];

    const metrics = liveMetrics("ab", "ab", events, 60_000);

    expect(metrics.raw_wpm).toBe(0.6);
    expect(metrics.accuracy).toBeCloseTo((100 * 2) / 3, 4);
  });

  test("live accuracy keeps errors after backspacing to empty", () => {
    const events: KeyEventRecord[] = [
      {
        at_ms: 100,
        action: "insert",
        position: 0,
        expected: "a",
        input: "x",
        correct: false,
      },
      {
        at_ms: 200,
        action: "backspace",
        position: 0,
        expected: "a",
        input: null,
        correct: false,
      },
    ];

    const metrics = liveMetrics("a", "", events, 60_000);

    expect(metrics.errors).toBe(1);
    expect(metrics.accuracy).toBe(0);
  });

  test("auto indent changes live correct counting to insert correctness", () => {
    const events: KeyEventRecord[] = [
      {
        at_ms: 100,
        action: "insert",
        position: 0,
        expected: "\n",
        input: "\n",
        correct: true,
      },
      {
        at_ms: 100,
        action: "auto_indent",
        position: 1,
        expected: " ",
        input: " ",
        correct: true,
      },
      {
        at_ms: 100,
        action: "auto_indent",
        position: 2,
        expected: " ",
        input: " ",
        correct: true,
      },
    ];

    const metrics = liveMetrics("\n  x", "\n  ", events, 60_000);

    expect(metrics.wpm).toBe(0.2);
    expect(metrics.raw_wpm).toBe(0.2);
    expect(metrics.accuracy).toBe(100);
  });

  test("non-ascii and modified chars are ignored without recording events", () => {
    const session = createLiveSession({ mode: "words", text: "a", source: "test" });

    applyLiveKey(session, { kind: "char", value: "你" }, 10);
    applyLiveKey(session, { kind: "char", value: "a", ctrl: true }, 20);
    applyLiveKey(session, { kind: "char", value: "a", alt: true }, 30);

    expect(session.ignored_non_ascii).toBe(1);
    expect(session.input).toBe("");
    expect(session.events).toEqual([]);
  });

  test("char enter tab and backspace record Rust-compatible events", () => {
    const session = createLiveSession({
      mode: "mixed",
      text: "a\n\t",
      source: "test",
    });

    applyLiveKey(session, { kind: "char", value: "a" }, 10);
    applyLiveKey(session, { kind: "enter" }, 20);
    applyLiveKey(session, { kind: "tab" }, 30);
    applyLiveKey(session, { kind: "backspace" }, 40);

    expect(session.input).toBe("a\n");
    expect(session.events).toEqual([
      {
        at_ms: 10,
        action: "insert",
        position: 0,
        expected: "a",
        input: "a",
        correct: true,
      },
      {
        at_ms: 20,
        action: "insert",
        position: 1,
        expected: "\n",
        input: "\n",
        correct: true,
      },
      {
        at_ms: 30,
        action: "insert",
        position: 2,
        expected: "\t",
        input: "\t",
        correct: true,
      },
      {
        at_ms: 40,
        action: "backspace",
        position: 2,
        expected: "\t",
        input: null,
        correct: false,
      },
    ]);
  });

  test("enter stays a newline at word-separator spaces outside code mode", () => {
    const session = createLiveSession({
      mode: "words",
      text: "alpha beta",
      source: "test",
    });

    for (const char of "alpha") {
      applyLiveKey(session, { kind: "char", value: char }, 10);
    }
    applyLiveKey(session, { kind: "enter" }, 20);

    expect(session.input).toBe("alpha\n");
    expect(session.events.at(-1)).toEqual({
      at_ms: 20,
      action: "insert",
      position: 5,
      expected: " ",
      input: "\n",
      correct: false,
    });
  });

  test("enter still records a newline when the target expects newline", () => {
    const session = createLiveSession({
      mode: "words",
      text: "alpha\nbeta",
      source: "test",
    });

    for (const char of "alpha") {
      applyLiveKey(session, { kind: "char", value: char }, 10);
    }
    applyLiveKey(session, { kind: "enter" }, 20);

    expect(session.input).toBe("alpha\n");
    expect(session.events.at(-1)?.input).toBe("\n");
    expect(session.events.at(-1)?.correct).toBe(true);
  });

  test("code enter auto inserts expected indentation", () => {
    const session = createLiveSession({
      mode: "code",
      text: "\n  x",
      source: "test",
    });

    applyLiveKey(session, { kind: "enter" }, 10);

    expect(session.input).toBe("\n  ");
    expect(session.events.map((event) => event.action)).toEqual([
      "insert",
      "auto_indent",
      "auto_indent",
    ]);
    expect(session.events[1]).toEqual({
      at_ms: 10,
      action: "auto_indent",
      position: 1,
      expected: " ",
      input: " ",
      correct: true,
    });
  });

  test("input cannot grow beyond target length", () => {
    const session = createLiveSession({ mode: "words", text: "a", source: "test" });

    applyLiveKey(session, { kind: "char", value: "a" }, 10);
    applyLiveKey(session, { kind: "char", value: "b" }, 20);

    expect(session.input).toBe("a");
    expect(session.events).toHaveLength(1);
  });

  test("session record bridge reuses metrics and ignores auto indent as typed input", () => {
    const session = createLiveSession({
      mode: "code",
      text: "\n  x",
      source: "test",
    });

    applyLiveKey(session, { kind: "enter" }, 100);
    const record = sessionRecordFromLiveSession(session, {
      started_at: "2026-06-05T03:00:00.000Z",
      duration_ms: 1_000,
      manual_pause_ms: 250,
      completion_state: "partial",
    });

    expect(record.user_input).toBe("\n  ");
    expect(record.typed_len).toBe(1);
    expect(record.correct_chars).toBe(1);
    expect(record.manual_pause_ms).toBe(250);
    expect(record.completion_state).toBe("partial");
    expect(record.key_events.map((event) => event.action)).toEqual([
      "insert",
      "auto_indent",
      "auto_indent",
    ]);
  });

  test("session record bridge copies comprehensive lesson metadata", () => {
    const session = createLiveSession({
      mode: "words",
      text: "abc",
      source: "test",
    });

    applyLiveKey(session, { kind: "char", value: "a" }, 100);
    const record = sessionRecordFromLiveSession(session, {
      started_at: "2026-06-05T03:00:00.000Z",
      duration_ms: 1_000,
      completion_state: "completed",
      daily_run_id: "20260605-1",
      lesson_id: "lesson-1",
      lesson_index: 2,
      module: "programming_basics",
      category: "programming_terms",
    });

    expect(record.daily_run_id).toBe("20260605-1");
    expect(record.lesson_id).toBe("lesson-1");
    expect(record.lesson_index).toBe(2);
    expect(record.module).toBe("programming_basics");
    expect(record.category).toBe("programming_terms");
    expect(record.completion_state).toBe("completed");
  });
});
