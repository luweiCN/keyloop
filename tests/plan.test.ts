import { describe, expect, test } from "bun:test";

import { buildPlan, defaultSessionRecord, isNumberedTemplateIdentifier } from "../src/index";

describe("adaptive plan parity", () => {
  test("no history uses Rust-compatible baseline plan", () => {
    const plan = buildPlan([], "zh");

    expect(plan.has_recent_history).toBe(false);
    expect(plan.recommended_mode).toBe("chars");
    expect(plan.focus_words).toContain("return");
    expect(plan.focus_symbols).toContain("=>");
    expect(plan.focus_code).toContain("useState");
    expect(plan.advice[0]).toContain("还没有练习记录");
  });

  test("legacy error tokens populate word and symbol focus", () => {
    const record = defaultSessionRecord({
      started_at: new Date().toISOString(),
      typed_len: 10,
      accuracy: 80,
      error_tokens: {
        response: 3,
        "=>": 2,
      },
    });

    const plan = buildPlan([record], "zh");

    expect(plan.focus_words).toContain("response");
    expect(plan.focus_symbols).toContain("=>");
  });

  test("old numbered generated identifiers are filtered", () => {
    const record = defaultSessionRecord({
      started_at: new Date().toISOString(),
      typed_len: 10,
      accuracy: 80,
      token_stats: [
        {
          token: "transaction5Open",
          kind: "word",
          start_delay_ms: 2000,
          duration_ms: 500,
          errors: 5,
        },
        {
          token: "response",
          kind: "word",
          start_delay_ms: 500,
          duration_ms: 500,
          errors: 1,
        },
      ],
    });

    const plan = buildPlan([record], "zh");

    expect(isNumberedTemplateIdentifier("transaction5Open")).toBe(true);
    expect(isNumberedTemplateIdentifier("r2d2")).toBe(false);
    expect(plan.focus_words).not.toContain("transaction5Open");
    expect(plan.focus_words).toContain("response");
  });

  test("legacy error chars become key hotspots", () => {
    const record = defaultSessionRecord({
      started_at: new Date().toISOString(),
      typed_len: 10,
      accuracy: 80,
      error_chars: {
        J: 3,
        ";": 2,
      },
    });

    const plan = buildPlan([record], "zh");

    expect(plan.has_recent_history).toBe(true);
    expect(plan.focus_keys).toContain("j");
    expect(plan.focus_keys).toContain(";");
    expect(plan.advice.some((item) => item.includes("键位热区"))).toBe(true);
  });

  test("legacy typed length falls back to input length or correct chars", () => {
    const record = defaultSessionRecord({
      started_at: new Date().toISOString(),
      typed_len: 0,
      correct_chars: 20,
      accuracy: 100,
      user_input: "abcdefghijklmnopqrst",
    });

    const plan = buildPlan([record], "zh");

    expect(plan.advice.some((item) => item.includes("正确率低于 95%"))).toBe(false);
  });
});
