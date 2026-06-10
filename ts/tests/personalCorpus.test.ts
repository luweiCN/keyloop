import { describe, expect, test } from "bun:test";

import {
  buildPersonalArticleTarget,
  buildPersonalSentencesTarget,
  createPersonalArticleEntry,
  createPersonalSentenceEntry,
  parseArticleFile,
} from "../src/training/personalCorpus";

describe("personal corpus", () => {
  test("sentence target carries line translations as annotations", () => {
    const entries = [
      createPersonalSentenceEntry(
        { text: "Stay hungry, stay foolish.", translation_zh: "求知若饥，虚心若愚。" },
        { now: "2026-06-11T00:00:00.000Z", idFactory: () => "s1" },
      ),
      createPersonalSentenceEntry(
        { text: "Less is more." },
        { now: "2026-06-11T00:00:00.000Z", idFactory: () => "s2" },
      ),
    ];

    const target = buildPersonalSentencesTarget(entries, { random: () => 0 });

    expect(target.source).toBe("keyloop:custom:sentences");
    expect(target.text.split("\n")).toHaveLength(2);
    expect(target.text).toContain("Stay hungry, stay foolish.");
    const annotations = target.annotations ?? [];
    expect(annotations).toHaveLength(1); // only the translated sentence
    expect(annotations[0]?.display).toBe("line");
    expect(annotations[0]?.translation_zh).toBe("求知若饥，虚心若愚。");
    const span = target.text.slice(annotations[0]!.start, annotations[0]!.end);
    expect(span).toBe("Stay hungry, stay foolish.");
  });

  test("archived sentences are excluded", () => {
    const entry = {
      ...createPersonalSentenceEntry({ text: "Gone." }, { idFactory: () => "s3" }),
      archived: true,
    };
    expect(buildPersonalSentencesTarget([entry]).text).toBe("");
  });

  test("article file parser reads title, paragraphs, and > translations", () => {
    const parsed = parseArticleFile(
      [
        "# The Road Not Taken",
        "",
        "Two roads diverged in a yellow wood.",
        "",
        "> 黄色的树林里分出两条路。",
        "",
        "And sorry I could not travel both.",
      ].join("\n"),
      "fallback",
    );

    expect(parsed.title).toBe("The Road Not Taken");
    expect(parsed.paragraphs).toEqual([
      {
        text: "Two roads diverged in a yellow wood.",
        translation_zh: "黄色的树林里分出两条路。",
      },
      { text: "And sorry I could not travel both." },
    ]);
  });

  test("article target joins paragraphs with an article annotation", () => {
    const article = createPersonalArticleEntry(
      {
        title: "Notes",
        paragraphs: [
          { text: "First paragraph.", translation_zh: "第一段。" },
          { text: "Second paragraph.", translation_zh: "第二段。" },
        ],
      },
      { idFactory: () => "a1" },
    );

    const target = buildPersonalArticleTarget([article], { random: () => 0 });

    expect(target.text).toBe("First paragraph.\nSecond paragraph.");
    expect(target.source).toBe("keyloop:custom:articles:a1");
    expect(target.annotations?.[0]?.display).toBe("article");
    expect(target.annotations?.[0]?.translation_zh).toBe("第一段。\n第二段。");
  });
});
