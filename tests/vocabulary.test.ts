import { describe, expect, test } from "bun:test";

import { buildLongWordBreakdownTarget, type LongWordEntry } from "../src/index";

describe("long-word breakdown", () => {
  test("breakdown target uses whole-word and alias pattern", () => {
    const word: LongWordEntry = {
      word: "internationalization",
      parts: ["international", "ization"],
      aliases: ["i18n"],
      domain: "programming",
      tier: 3,
      source_id: "keyloop:test",
      note_zh: "internationalization",
    };

    const target = buildLongWordBreakdownTarget(word);

    expect(target.mode).toBe("words");
    expect(target.text).toBe(
      [
        "internationalization internationalization",
        "i18n internationalization",
      ].join("\n"),
    );
    expect(target.source).toBe("keyloop:module:word-breakdown:internationalization");
  });

  test("breakdown options control whole-word repetitions without splitting parts", () => {
    const word: LongWordEntry = {
      word: "serialization",
      parts: ["serial", "ization"],
      domain: "programming",
      tier: 2,
      source_id: "keyloop:test",
    };
    const target = buildLongWordBreakdownTarget(word, {
      partRepetitions: 2,
      wordRepetitions: 1,
    });
    expect(target.text).toBe("serialization");
  });
});
