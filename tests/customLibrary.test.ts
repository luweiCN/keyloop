import { describe, expect, test } from "bun:test";

import {
  createCustomLibrary,
  librarySlugFromName,
  parseArticlePaste,
  parseSentenceBlocks,
  parseWordLines,
} from "../src/training/customLibrary";

describe("librarySlugFromName", () => {
  test("ascii name becomes kebab-case", () => {
    expect(librarySlugFromName("Kaoyan English 2026", [])).toBe("kaoyan-english-2026");
  });

  test("non-ascii name falls back to lib prefix", () => {
    expect(librarySlugFromName("考研英语", [])).toBe("lib");
  });

  test("conflict appends numeric suffix", () => {
    expect(librarySlugFromName("考研英语", ["lib"])).toBe("lib-2");
    expect(librarySlugFromName("web", ["web", "web-2"])).toBe("web-3");
  });
});

describe("parseWordLines", () => {
  test("plain word, colon meaning, and phrase detection", () => {
    const result = parseWordLines("apple\nmachine learning: 机器学习\nresilient：有弹性的\n\n");
    expect(result.entries).toEqual([
      { text: "apple", kind: "word" },
      { text: "machine learning", kind: "phrase", meaning_zh: "机器学习" },
      { text: "resilient", kind: "word", meaning_zh: "有弹性的" },
    ]);
    expect(result.errors).toEqual([]);
  });

  test("non-ascii word body is rejected with line number", () => {
    const result = parseWordLines("苹果: apple");
    expect(result.entries).toEqual([]);
    expect(result.errors).toEqual([{ line: 1, raw: "苹果: apple", reason: "non_ascii" }]);
  });
});

describe("parseSentenceBlocks", () => {
  test("blank-line separated blocks: first line text, rest is translation", () => {
    const input =
      "The weather is nice.\n今天天气很好。\n\nSee you tomorrow.\n\nLong one.\n第一行\n第二行";
    expect(parseSentenceBlocks(input)).toEqual([
      { text: "The weather is nice.", translation_zh: "今天天气很好。" },
      { text: "See you tomorrow." },
      { text: "Long one.", translation_zh: "第一行\n第二行" },
    ]);
  });
});

describe("parseArticlePaste", () => {
  test("two blocks pair paragraphs by line index", () => {
    const result = parseArticlePaste("Para one.\nPara two.\n\n第一段。\n第二段。");
    expect(result.paragraphs).toEqual([
      { text: "Para one.", translation_zh: "第一段。" },
      { text: "Para two.", translation_zh: "第二段。" },
    ]);
    expect(result.warnings).toEqual([]);
  });

  test("single block means no translation", () => {
    const result = parseArticlePaste("Para one.\nPara two.");
    expect(result.paragraphs).toEqual([{ text: "Para one." }, { text: "Para two." }]);
    expect(result.warnings).toEqual([]);
  });

  test("mismatched counts and extra blocks produce warnings", () => {
    const short = parseArticlePaste("P1.\nP2.\n\n译一。");
    expect(short.paragraphs).toEqual([
      { text: "P1.", translation_zh: "译一。" },
      { text: "P2." },
    ]);
    expect(short.warnings.length).toBe(1);
    const extra = parseArticlePaste("P1.\n\n译一。\n\n多余块");
    expect(extra.warnings.length).toBe(1);
  });
});

describe("createCustomLibrary", () => {
  test("creates empty library with injected time", () => {
    const library = createCustomLibrary("考研英语", [], { now: new Date("2026-06-11T00:00:00Z") });
    expect(library).toEqual({
      version: 1,
      slug: "lib",
      name: "考研英语",
      created_at: "2026-06-11T00:00:00.000Z",
      words: [],
      sentences: [],
      articles: [],
    });
  });
});
