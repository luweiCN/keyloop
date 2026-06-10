import { describe, expect, test } from "bun:test";

import {
  defaultSessionRecord,
  groupFeedback,
  isNumberedTemplateIdentifier,
  recentFeedbackTerms,
} from "../src/index";

describe("group feedback parity", () => {
  test("extracts error and slow tokens while filtering generated identifiers", () => {
    const feedback = groupFeedback(
      defaultSessionRecord({
        error_chars: { J: 3 },
        token_stats: [
          {
            token: "response",
            kind: "word",
            start_delay_ms: 900,
            duration_ms: 500,
            errors: 1,
          },
          {
            token: "transaction5Open",
            kind: "word",
            start_delay_ms: 1500,
            duration_ms: 500,
            errors: 2,
          },
          {
            token: "return",
            kind: "word",
            start_delay_ms: 50,
            duration_ms: 120,
            errors: 0,
          },
        ],
        key_events: [
          {
            at_ms: 10,
            action: "insert",
            position: 0,
            expected: ";",
            input: "j",
            correct: false,
          },
        ],
      }),
    );

    expect(feedback.error_tokens).toEqual([["response", 1]]);
    expect(feedback.slow_tokens).toEqual([["response", 1400]]);
    expect(feedback.error_keys).toEqual([
      [";", 1],
      ["J", 3],
    ]);
  });

  test("keeps numbered template identifier detector compatible", () => {
    expect(isNumberedTemplateIdentifier("transaction5Open")).toBe(true);
    expect(isNumberedTemplateIdentifier("transaction10Open")).toBe(true);
    expect(isNumberedTemplateIdentifier("Module6Config")).toBe(true);
    expect(isNumberedTemplateIdentifier("module3-list")).toBe(true);
    expect(isNumberedTemplateIdentifier("uint256")).toBe(false);
    expect(isNumberedTemplateIdentifier("ERC20")).toBe(false);
    expect(isNumberedTemplateIdentifier("H2Title")).toBe(false);
    expect(isNumberedTemplateIdentifier("r2d2")).toBe(false);
    expect(isNumberedTemplateIdentifier("s3Bucket")).toBe(false);
    expect(isNumberedTemplateIdentifier("sha256Sum")).toBe(false);
  });

  test("recent feedback terms use latest records first and unique terms", () => {
    const older = defaultSessionRecord({
      error_chars: { a: 1 },
      token_stats: [
        {
          token: "response",
          kind: "word",
          start_delay_ms: 50,
          duration_ms: 100,
          errors: 1,
        },
      ],
    });
    const latest = defaultSessionRecord({
      error_chars: { ";": 1 },
      token_stats: [
        {
          token: "selected",
          kind: "word",
          start_delay_ms: 1300,
          duration_ms: 20,
          errors: 0,
        },
      ],
    });

    expect(recentFeedbackTerms([older, latest])).toEqual([
      "selected",
      ";",
      "response",
      "a",
    ]);
  });
});
