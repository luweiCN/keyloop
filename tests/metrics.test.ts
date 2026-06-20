import { describe, expect, test } from "bun:test";

import {
  buildSessionRecord,
  tokenSpans,
  type KeyEventRecord,
  type PracticeTarget,
} from "../src/index";

const target = (text: string): PracticeTarget => ({
  mode: "words",
  text,
  source: "test",
});

const insert = (
  at_ms: number,
  position: number,
  input: string,
  correct: boolean,
): KeyEventRecord => ({
  at_ms,
  action: "insert",
  position,
  expected: input,
  input,
  correct,
});

describe("metrics parity", () => {
  test("tokenizes words and programming symbols", () => {
    const tokens = tokenSpans("items.map((item) => item.id !== null)").map(
      (span) => span.token,
    );

    expect(tokens).toContain("items");
    expect(tokens).toContain("=>");
    expect(tokens).toContain("!==");
  });

  test("tokenSpans 对多字符符号组合做最长优先匹配", () => {
    const tok = (text: string): string[] => tokenSpans(text).map((span) => span.token);
    expect(tok("a === b")).toContain("===");
    expect(tok("a !== b")).toContain("!==");
    expect(tok("x => y")).toContain("=>");
    expect(tok("a ?? b")).toContain("??");
    expect(tok("obj?.prop")).toContain("?.");
    expect(tok("ns::name")).toContain("::");
    expect(tok("a && b")).toContain("&&");
    expect(tok("a || b")).toContain("||");
  });

  test("tokenSpans 识别单字符标点", () => {
    const tokens = tokenSpans("a;b,c.d:e").map((span) => span.token);
    expect(tokens).toContain(";");
    expect(tokens).toContain(",");
    expect(tokens).toContain(".");
    expect(tokens).toContain(":");
  });

  test("accuracy counts corrected mistakes", () => {
    const events: KeyEventRecord[] = [
      insert(100, 0, "a", true),
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
      insert(400, 1, "b", true),
      insert(500, 2, "c", true),
    ];

    const record = buildSessionRecord(
      target("abc"),
      "2026-05-30T00:00:00Z",
      1000,
      0,
      "abc",
      events,
    );

    expect(record.correct_chars).toBe(3);
    expect(record.typed_len).toBe(4);
    expect(record.error_count).toBe(1);
    expect(record.accuracy).toBe(75);
  });

  test("wpm excludes start delay and last key tail", () => {
    const record = buildSessionRecord(
      target("abc"),
      "2026-05-30T00:00:00Z",
      20000,
      0,
      "abc",
      [
        insert(5000, 0, "a", true),
        insert(5500, 1, "b", true),
        insert(6000, 2, "c", true),
      ],
    );

    expect(record.start_to_first_key_ms).toBe(5000);
    expect(record.last_key_to_end_ms).toBe(14000);
    expect(record.active_ms).toBe(1000);
    expect(record.wpm).toBe(36);
  });

  test("idle gap excess is excluded from wpm and token stats", () => {
    const record = buildSessionRecord(
      target("ab cd"),
      "2026-05-30T00:00:00Z",
      20500,
      0,
      "ab cd",
      [
        insert(100, 0, "a", true),
        insert(200, 1, "b", true),
        insert(20300, 3, "c", true),
        insert(20400, 4, "d", true),
      ],
    );
    const cd = record.token_stats.find((stat) => stat.token === "cd");

    expect(record.idle_pause_count).toBe(1);
    expect(record.idle_ms).toBe(10100);
    expect(record.active_ms).toBe(10200);
    expect(cd?.start_delay_ms).toBe(10000);
  });
});
