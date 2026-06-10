import { describe, expect, test } from "bun:test";

import type { CustomLibrary } from "../src/training/customLibrary";
import {
  buildLibraryArticleTarget,
  buildLibraryMixTarget,
  buildLibraryPhrasesTarget,
  buildLibrarySentencesTarget,
  buildLibraryWordsTarget,
} from "../src/training/customLibraryTargets";

const library: CustomLibrary = {
  version: 1,
  slug: "kaoyan",
  name: "考研英语",
  created_at: "2026-06-11T00:00:00.000Z",
  words: [
    { id: "w1", text: "abandon", kind: "word", meaning_zh: "v. 放弃", source: "dict" },
    { id: "w2", text: "machine learning", kind: "phrase", meaning_zh: "机器学习", source: "manual" },
    { id: "w3", text: "vivid", kind: "word", source: "dict" },
  ],
  sentences: [
    { id: "s1", text: "The weather is nice.", translation_zh: "今天天气很好。" },
    { id: "s2", text: "See you tomorrow." },
  ],
  articles: [
    {
      id: "a1",
      title: "My Day",
      paragraphs: [
        { text: "First paragraph.", translation_zh: "第一段。" },
        { text: "Second paragraph.", translation_zh: "第二段。" },
      ],
    },
  ],
};

const fixedRandom = () => 0;

describe("custom library targets", () => {
  test("words target chunks words and annotates meanings", () => {
    const target = buildLibraryWordsTarget(library, { random: fixedRandom });
    expect(target.mode).toBe("words");
    expect(target.text).toContain("abandon");
    expect(target.text).not.toContain("machine learning");
    const abandonStart = target.text.indexOf("abandon");
    expect(target.annotations).toContainEqual({
      start: abandonStart,
      end: abandonStart + "abandon".length,
      translation_zh: "v. 放弃",
      display: "word",
    });
    expect(target.source).toBe("keyloop:library:kaoyan:words");
  });

  test("phrases target puts one phrase per line", () => {
    const target = buildLibraryPhrasesTarget(library, { random: fixedRandom });
    expect(target.text.split("\n")).toEqual(["machine learning"]);
    expect(target.annotations?.[0]?.translation_zh).toBe("机器学习");
  });

  test("sentences target annotates per line", () => {
    const target = buildLibrarySentencesTarget(library, { random: fixedRandom, count: 2 });
    const lines = target.text.split("\n");
    expect(lines.length).toBe(2);
    expect(target.annotations?.length).toBe(1);
  });

  test("article target joins paragraphs with article annotation", () => {
    const target = buildLibraryArticleTarget(library, { random: fixedRandom });
    expect(target.text).toBe("First paragraph.\nSecond paragraph.");
    expect(target.annotations?.[0]?.display).toBe("article");
    expect(target.annotations?.[0]?.source_title).toBe("My Day");
  });

  test("empty article pool yields empty target", () => {
    const target = buildLibraryArticleTarget({ ...library, articles: [] }, { random: fixedRandom });
    expect(target.text).toBe("");
  });

  test("mix target includes available kinds and skips empty ones", () => {
    const target = buildLibraryMixTarget(library, { random: fixedRandom });
    expect(target.text).toContain("abandon");
    expect(target.text).toContain("machine learning");
    expect(target.text).toContain("The weather is nice.");
    expect(target.text).toContain("First paragraph.");
    const empty = buildLibraryMixTarget(
      { ...library, articles: [], sentences: [] },
      { random: fixedRandom },
    );
    expect(empty.text).not.toContain("First paragraph.");
    expect(empty.text).toContain("abandon");
  });
});
