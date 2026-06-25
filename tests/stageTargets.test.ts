import { describe, expect, test } from "bun:test";

import type { ContentLibrary } from "../src/content/library";
import type { CustomLibrary } from "../src/training/customLibrary";
import type { FormSpeed } from "../src/training/diagnosis";
import { formForCategory } from "../src/training/diagnosis";
import type { SkillProfile } from "../src/training/diagnosis";
import { estimatedMinutesFromChars } from "../src/training/prescription";
import {
  buildDailyPracticePlan,
  materializeStageLesson,
  buildEverydayMixStageTarget,
  buildProgrammingBasicsMixStageTarget,
  buildStageTarget,
  fitSymbolsTargetToBudget,
  refreshModuleMixTarget,
  selectSnippetsWithinBudget,
  symbolSupplementLines,
  usedCodeSnippetTexts,
  type BuildTargetContext,
} from "../src/training/targets";
import type { CodeSnippet } from "../src/content/snippets";
import { comprehensivePlanMinutes } from "../src/ui/opentui/routeLines";
import { defaultSessionRecord } from "../src/index";

/** 构造指定字符数的代码片段，用于验证按预算选片的边界行为 */
function coarseSnippet(chars: number, id: number): CodeSnippet {
  const prefix = `// snippet ${id}\n`;
  const body = "x".repeat(Math.max(0, chars - prefix.length));
  return {
    text: prefix + body,
    source: `test:coarse-${id}`,
    difficulty: "medium",
    score: 1,
    language: "solidity",
    framework: "",
    project: "test",
    level: "block",
  };
}

function stageLibrary(): ContentLibrary {
  return {
    warmup: ["asdf jkl;", "fdsa ;lkj", "a;sldkfj", "jkl; asdf"],
    foundation_drills: [
      {
        id: "home-row",
        title_zh: "中排",
        title_en: "Home row",
        hint_zh: "",
        hint_en: "",
        items: ["asdf jkl;", "sad fall;", "ask dad;", "lads flask;"],
      },
      {
        id: "number-row",
        title_zh: "数字行",
        title_en: "Number row",
        hint_zh: "",
        hint_en: "",
        items: ["1 2 3 4 5", "6 7 8 9 0", "12 34 56", "78 90 12"],
      },
      {
        id: "punctuation-edges",
        title_zh: "标点边界",
        title_en: "Punctuation edges",
        hint_zh: "",
        hint_en: "",
        items: ["; ; ;", "[ ] { }", "- = _ +", "/ ? . ,"],
      },
    ],
    word_chunks: [],
    common_words: ["today", "review"],
    everyday_english: { sources: [], entries: [] },
    everyday_words: {
      sources: [],
      entries: [
        "algorithm",
        "weather",
        "morning",
        "coffee",
        "window",
        "garden",
        "letter",
        "summer",
        "winter",
        "spring",
      ].map((word, index) => ({
        word,
        rank: index + 1,
        range: "200" as const,
        level: "cet4" as const,
        translation_zh: `释义${index}`,
        source_id: "test",
      })),
    },
    everyday_sentences: {
      sources: [],
      entries: [
        "The weather is nice today.",
        "She finished the report.",
        "He walks to work every day.",
        "The coffee tastes great.",
        "Birds sing in the morning.",
        "We watched a movie tonight.",
      ].map((text, index) => ({
        text,
        translation_zh: `句释${index}`,
        level: "cet4" as const,
        length: "short" as const,
        source_id: "test",
        source_title: "Test Source",
      })),
    },
    everyday_articles: {
      sources: [],
      entries: [
        {
          title: "A Day",
          level: "cet4" as const,
          length: "short" as const,
          source_id: "test",
          paragraphs: [
            { text: "It was a sunny day.", translation_zh: "晴天。" },
            { text: "We went outside.", translation_zh: "出门。" },
          ],
        },
      ],
    },
    everyday_word_decomposition: { sources: [], entries: [] },
    programming_words: [
      { word: "closure", note_zh: "闭包" },
      { word: "mutex", note_zh: "互斥锁" },
    ],
    code_snippets: [1, 2, 3, 4, 5].map((index) => ({
      text: `const value${index} = compute(${index});\nreturn value${index};`,
      source: `test:snippet-${index}`,
      language: "typescript",
      framework: "none",
      project: "test",
      level: "block" as const,
    })),
    long_words: [],
  };
}

function emptyProfile(
  overrides: Partial<SkillProfile["focus"]> = {},
  formSpeeds: FormSpeed[] = [],
): SkillProfile {
  return {
    dimensions: [],
    form_speeds: formSpeeds,
    focus: { words: [], code: [], chars: [], ...overrides },
    daily_active_minutes_7d: 0,
    generated_at: "2026-06-13T08:00:00Z",
  };
}

function wordCounts(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of text.split(/\s+/u).filter(Boolean)) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

function stageContext(): BuildTargetContext {
  return {
    records: [],
    plan: {
      focus_words: [],
      focus_symbols: [],
      focus_code: [],
      focus_keys: [],
      advice: [],
      recommended_mode: "mixed",
      has_recent_history: false,
    },
    library: stageLibrary(),
    random: () => 0.42,
  };
}

function customLibraryFixture(): CustomLibrary {
  return {
    version: 1,
    slug: "mine",
    name: "我的词库",
    created_at: "2026-06-01T00:00:00Z",
    words: [
      { id: "w1", text: "bespoke", kind: "word", meaning_zh: "定制的", source: "manual" },
    ],
    sentences: [{ id: "s1", text: "My custom sentence here.", translation_zh: "自建句。" }],
    articles: [],
  };
}

describe("daily plan lazy materialization", () => {
  test("lazy plan defers corpus generation until materialized", () => {
    const context = stageContext();
    const lazy = buildDailyPracticePlan(context, { targetMinutesOverride: 15, lazy: true });

    expect(lazy.lessons.length).toBeGreaterThan(0);
    for (const lesson of lazy.lessons) {
      // 惰性：有计划时长，但未组卷（target 文本为空 + 待组卷标记）
      expect(lesson.estimated_minutes).toBeGreaterThan(0);
      expect(lesson.target.text).toBe("");
      expect(lesson.pending).toBeDefined();
    }

    // 开练时组卷：materialize 后才生成真正的 target
    const materialized = materializeStageLesson(context, lazy.lessons[0]!);
    expect(materialized.target.text.length).toBeGreaterThan(0);
    expect(materialized.pending).toBeUndefined();
  });

  test("eager plan (default) still generates targets up front", () => {
    const context = stageContext();
    const eager = buildDailyPracticePlan(context, { targetMinutesOverride: 15 });
    expect(eager.lessons.every((lesson) => lesson.target.text.length > 0)).toBe(true);
    expect(eager.lessons.every((lesson) => lesson.pending === undefined)).toBe(true);
  });
});

describe("buildStageTarget articles", () => {
  test("concatenates multiple articles to fill the budget with per-article annotations", () => {
    const context = stageContext();
    context.library.everyday_articles.entries = ["First", "Second", "Third"].map((title) => ({
      title,
      level: "cet4" as const,
      length: "short" as const,
      source_id: "test",
      paragraphs: [
        { text: `Article ${title} paragraph one.`, translation_zh: `${title} 第一段。` },
        { text: `Article ${title} paragraph two.`, translation_zh: `${title} 第二段。` },
      ],
    }));

    const target = buildStageTarget(context, {
      stage: { form: "articles", char_budget: 1000 },
      profile: emptyProfile(),
    });

    const articleAnnotations = (target.annotations ?? []).filter(
      (annotation) => annotation.display === "article",
    );
    expect(articleAnnotations.length).toBeGreaterThan(1);
    for (const annotation of articleAnnotations) {
      expect(annotation.source_title).toBeDefined();
      expect(target.text.slice(annotation.start, annotation.end).length).toBeGreaterThan(0);
    }
    expect(new Set(articleAnnotations.map((a) => a.source_title)).size).toBeGreaterThan(1);
  });

  test("keeps a single article when the budget is tiny", () => {
    const target = buildStageTarget(stageContext(), {
      stage: { form: "articles", char_budget: 5 },
      profile: emptyProfile(),
    });
    const articleAnnotations = (target.annotations ?? []).filter(
      (annotation) => annotation.display === "article",
    );
    expect(articleAnnotations.length).toBe(1);
  });

  test("comprehensive article selection does not filter by previous practice records", () => {
    const context = stageContext();
    context.random = () => 0.99;
    context.library.everyday_articles.entries = Array.from({ length: 10 }, (_, index) => ({
      title: `${index === 0 ? "Recent" : "Fresh"} Article ${index}`,
      level: "cet4" as const,
      length: "short" as const,
      source_id: "test",
      paragraphs: [
        {
          text: `${index === 0 ? "Recent" : "Fresh"} article ${index} paragraph.`,
          translation_zh: `文${index}`,
        },
      ],
    }));
    context.records = [];

    const target = buildStageTarget(context, {
      stage: { form: "articles", char_budget: 5 },
      profile: emptyProfile(),
    });

    expect(target.text).toContain("Recent article 0");
  });
});

describe("buildStageTarget words", () => {
  test("budget scales word count", () => {
    const small = buildStageTarget(stageContext(), {
      stage: { form: "words", char_budget: 45 },
      profile: emptyProfile(),
    });
    expect(small.text.split(" ").length).toBeGreaterThanOrEqual(6);
    expect([...small.text].length).toBeGreaterThanOrEqual(40);
  });

  test("单词模块不再回流具体薄弱词（focus_words 废弃，仅留维度加权②；ADR-0002）", () => {
    const withFocus = buildStageTarget(stageContext(), {
      stage: { form: "words", char_budget: 200 },
      profile: emptyProfile({ words: ["algorithm"] }),
    });
    const withoutFocus = buildStageTarget(stageContext(), {
      stage: { form: "words", char_budget: 200 },
      profile: emptyProfile(),
    });
    // focus.words（具体错词）不再改变选词；选材仅由随机 + 字符类/技能维度加权决定
    expect(withFocus.text).toBe(withoutFocus.text);
  });

  test("programming and custom library words join the pool", () => {
    const target = buildStageTarget(stageContext(), {
      stage: { form: "words", char_budget: 700 },
      profile: emptyProfile(),
      customLibraries: [customLibraryFixture()],
    });
    // 预算足够大时全池入选
    expect(target.text).toContain("closure");
    expect(target.text).toContain("bespoke");
  });

  test("符号卡不足预算时补充行随机化，不每次从同一段数字开始 (#3)", () => {
    const cycling = (values: number[]): (() => number) => {
      let i = 0;
      return () => values[i++ % values.length] ?? 0;
    };
    const base = { mode: "symbols" as const, text: "seed", source: "t" };
    const context = { ...stageContext(), library: { ...stageLibrary(), foundation_drills: [] } };
    const a = fitSymbolsTargetToBudget(
      { ...context, random: cycling([0.05, 0.95, 0.4, 0.6]) },
      base,
      60,
    );
    const b = fitSymbolsTargetToBudget(
      { ...context, random: cycling([0.9, 0.1, 0.7, 0.2]) },
      base,
      60,
    );
    expect(a.text).not.toBe(b.text);
  });

  test("large word budgets use a uniform repeat count before exploding unique words", () => {
    const context = stageContext();
    context.library.everyday_words.entries = Array.from({ length: 120 }, (_, index) => ({
      word: `word${String(index).padStart(3, "0")}`,
      rank: index + 1,
      range: "1000" as const,
      level: "cet4" as const,
      translation_zh: `词${index}`,
      source_id: "test",
    }));

    const target = buildStageTarget(context, {
      stage: { form: "words", char_budget: 700 },
      profile: emptyProfile({}, [{ form: "words", ewma_wpm: 70, samples: 20 }]),
      enabledModules: ["everyday_english"],
    });

    const counts = wordCounts(target.text);
    const repeatCounts = new Set(counts.values());
    expect(repeatCounts.size).toBe(1);
    expect([...repeatCounts][0]).toBeGreaterThan(1);
    expect(counts.size).toBeLessThanOrEqual(70);
    expect([...target.text].length).toBeGreaterThanOrEqual(600);
  });

  test("comprehensive word selection does not filter by previous practice records", () => {
    const context = stageContext();
    context.random = () => 0.99;
    context.library.everyday_words.entries = Array.from({ length: 20 }, (_, index) => ({
      word: `${index < 6 ? "recent" : "fresh"}${index}`,
      rank: index + 1,
      range: "1000" as const,
      level: "cet4" as const,
      translation_zh: `词${index}`,
      source_id: "test",
    }));
    context.records = [];

    const lcg = (seed: number): (() => number) => {
      let s = seed % 2147483647;
      if (s <= 0) s += 2147483646;
      const rand = (): number => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 5; i += 1) rand(); // 预热
      return rand;
    };
    // 无历史 → 弱键权重空 → 候选均匀；多次抽样中练过/未练的词都应能出现（不被历史排除）
    const appears = (word: string): boolean => {
      for (let i = 1; i <= 40; i += 1) {
        context.random = lcg(i);
        if (
          buildStageTarget(context, {
            stage: { form: "words", char_budget: 45 },
            profile: emptyProfile(),
            enabledModules: ["everyday_english"],
          }).text.includes(word)
        ) {
          return true;
        }
      }
      return false;
    };
    expect(appears("recent0")).toBe(true);
    expect(appears("fresh19")).toBe(true);
  });

  test("disabling programming module excludes programming words", () => {
    const target = buildStageTarget(stageContext(), {
      stage: { form: "words", char_budget: 700 },
      profile: emptyProfile(),
      enabledModules: ["foundation_input", "everyday_english"],
    });
    expect(target.text).not.toContain("closure");
  });
});

describe("buildStageTarget symbols", () => {
  test("falls back to foundation rows when programming disabled", () => {
    const target = buildStageTarget(stageContext(), {
      stage: { form: "symbols", char_budget: 80 },
      profile: emptyProfile(),
      enabledModules: ["foundation_input", "everyday_english"],
    });
    expect(target.source).toBe("keyloop:stage:symbols:foundation");
    expect(target.text.length).toBeGreaterThan(0);
  });

  test("focus words never leak into symbols stage", () => {
    const target = buildStageTarget(stageContext(), {
      stage: { form: "symbols", char_budget: 80 },
      profile: emptyProfile({ words: ["algorithm"] }),
      enabledModules: ["foundation_input"],
    });
    expect(target.text).not.toContain("algorithm");
  });
});

describe("buildStageTarget sentences", () => {
  test("budget scales sentence count", () => {
    const target = buildStageTarget(stageContext(), {
      stage: { form: "sentences", char_budget: 80 },
      profile: emptyProfile(),
    });
    expect(target.text.split("\n").length).toBeGreaterThanOrEqual(2);
    expect([...target.text].length).toBeGreaterThanOrEqual(70);
  });

  test("sentence stage varies sentences across sessions (no mistake replay, pure random)", () => {
    const context = stageContext();
    context.library.everyday_articles.entries = [];
    context.library.everyday_sentences.entries = Array.from({ length: 10 }, (_, index) => ({
      text: `Pool sentence ${String(index).padStart(2, "0")} carries enough words here.`,
      translation_zh: `池${index}`,
      level: "cet4" as const,
      length: "short" as const,
      source_id: "test",
      source_title: "Test Source",
    }));
    // 综合应用层不靶向、不回流错题：句子纯随机，不同会话开头不应固定为同一句
    const leadingLines = new Set<string>();
    for (const seed of [0.07, 0.43, 0.91]) {
      const target = buildStageTarget(
        { ...context, random: () => seed },
        {
          stage: { form: "sentences", char_budget: 220 },
          profile: emptyProfile(),
        },
      );
      leadingLines.add(target.text.split("\n")[0] ?? "");
    }
    expect(leadingLines.size).toBeGreaterThan(1);
  });

  test("custom library sentences join the pool", () => {
    const target = buildStageTarget(stageContext(), {
      stage: { form: "sentences", char_budget: 400 },
      profile: emptyProfile(),
      customLibraries: [customLibraryFixture()],
    });
    expect(target.text).toContain("My custom sentence here.");
  });

  test("large sentence budgets mix sentences with articles instead of dense sentence lists", () => {
    const context = stageContext();
    context.library.everyday_sentences.entries = Array.from({ length: 40 }, (_, index) => ({
      text: `Sentence ${String(index).padStart(2, "0")} has enough words for practice.`,
      translation_zh: `句${index}`,
      level: "cet4" as const,
      length: "short" as const,
      source_id: "test",
      source_title: "Test Source",
    }));
    context.library.everyday_articles.entries = Array.from({ length: 4 }, (_, index) => ({
      title: `Article ${index}`,
      level: "cet4" as const,
      length: "short" as const,
      source_id: "test",
      paragraphs: [
        {
          text: `Article ${index} paragraph one has enough words for practice.`,
          translation_zh: `文${index} 一。`,
        },
        {
          text: `Article ${index} paragraph two keeps the flow natural.`,
          translation_zh: `文${index} 二。`,
        },
      ],
    }));

    const target = buildStageTarget(context, {
      stage: { form: "sentences", char_budget: 800 },
      profile: emptyProfile({}, [{ form: "sentences", ewma_wpm: 70, samples: 20 }]),
    });

    const lineAnnotations = (target.annotations ?? []).filter(
      (annotation) => annotation.display === "line",
    );
    const articleAnnotations = (target.annotations ?? []).filter(
      (annotation) => annotation.display === "article",
    );
    expect(lineAnnotations.length).toBeLessThanOrEqual(12);
    expect(articleAnnotations.length).toBeGreaterThanOrEqual(1);
    expect([...target.text].length).toBeGreaterThanOrEqual(720);
  });

  test("comprehensive sentence selection does not filter by previous practice records", () => {
    const context = stageContext();
    context.random = () => 0.99;
    context.library.everyday_sentences.entries = Array.from({ length: 12 }, (_, index) => ({
      text: `${index < 2 ? "Recent" : "Fresh"} sentence ${index} for practice.`,
      translation_zh: `句${index}`,
      level: "cet4" as const,
      length: "short" as const,
      source_id: "test",
      source_title: "Test Source",
    }));
    context.records = [];

    const target = buildStageTarget(context, {
      stage: { form: "sentences", char_budget: 80 },
      profile: emptyProfile(),
    });

    expect(target.text).toContain("Recent sentence 0");
  });
});

describe("buildStageTarget code and keys", () => {
  test("code snippet count follows budget", () => {
    // 预算充足：库存 5 片都装得下
    const big = buildStageTarget(stageContext(), {
      stage: { form: "code", char_budget: 900 },
      profile: emptyProfile(),
    });
    expect(big.code_blocks?.length).toBe(5);

    // 预算很小：按预算累加截断到更少片，总量受 1.3× 容差约束（不再固定 180/片）
    const small = buildStageTarget(stageContext(), {
      stage: { form: "code", char_budget: 100 },
      profile: emptyProfile(),
    });
    expect(small.code_blocks?.length).toBeGreaterThanOrEqual(1);
    expect(small.code_blocks?.length).toBeLessThan(5);
    expect([...small.text].length).toBeLessThanOrEqual(Math.round(100 * 1.3));
  });

  test("keys stage reuses foundation mix", () => {
    const target = buildStageTarget(stageContext(), {
      stage: { form: "keys", char_budget: 180 },
      profile: emptyProfile(),
    });
    expect(target.source).toContain("keyloop:module:foundation-mix");
  });

  test("articles stage picks an article", () => {
    const target = buildStageTarget(stageContext(), {
      stage: { form: "articles", char_budget: 300 },
      profile: emptyProfile(),
    });
    expect(target.text).toContain("It was a sunny day.");
  });

  test("code stage refills the budget by reusing older snippets when fresh ones run out", () => {
    const context = stageContext();
    context.codeConfig = { difficulty: "all" };
    context.library.code_snippets = Array.from({ length: 20 }, (_, index) => ({
      text: `function compute${String(index).padStart(2, "0")}(alpha, beta) {\n  return alpha + beta + ${index};\n}`,
      source: `test:snippet-${index}`,
      language: "typescript",
      framework: "none",
      project: "test",
      level: "block" as const,
    }));
    // 最近把全部片段都练过：旧逻辑会把它们永久排除，代码段几乎为空、填不满预算
    context.records = context.library.code_snippets.map((snippet) =>
      defaultSessionRecord({ mode: "code", category: "code_mix", target_text: snippet.text }),
    );
    const target = buildStageTarget(context, {
      stage: { form: "code", char_budget: 1000 },
      profile: emptyProfile(),
    });
    expect([...target.text].length).toBeGreaterThanOrEqual(700);
  });

  test("symbolSupplementLines returns a large generic literal/symbol pool, independent of foundation drills", () => {
    const context = stageContext();
    // 真实 foundation_drills 的 number-row/punctuation-edges 是按宽度硬折行的英文语篇
    context.library.foundation_drills = [
      {
        id: "number-row",
        title_zh: "",
        title_en: "",
        hint_zh: "",
        hint_en: "",
        items: [
          "cent of the students may type less than 20 words per minute.",
          "and then a dozen seize Dan. In a daze he sees the zoo seized.",
        ],
      },
      {
        id: "punctuation-edges",
        title_zh: "",
        title_en: "",
        hint_zh: "",
        hint_en: "",
        items: ["in just the mood to end her quota of visits in sixteen weeks."],
      },
    ];
    const lines = symbolSupplementLines(context);
    // 池足够大：冷门 / 符号不足的语言靠它兜底 8-10 分钟也不循环重复同几行
    expect(lines.length).toBeGreaterThanOrEqual(40);
    // 绝不泄漏 foundation 的折行英文语篇
    expect(lines.some((line) => /\b(students|minute|dozen|seize|quota)\b/.test(line))).toBe(false);
    // 每行都是真实字面量 / 运算符（含符号或数字），而非自然语言句
    for (const line of lines) {
      expect(/[^A-Za-z\s]/.test(line)).toBe(true);
    }
  });

  test("selectSnippetsWithinBudget relaxes the ceiling when a coarse next snippet would otherwise leave it severely underfilled", () => {
    // 第一片中等(50% 预算)、后续片很大：旧逻辑因第二片超 1.3× 容差直接 break，只剩 1 片 ~500(严重欠填)
    const snippets: CodeSnippet[] = [
      coarseSnippet(500, 0),
      coarseSnippet(850, 1),
      coarseSnippet(850, 2),
    ];
    const result = selectSnippetsWithinBudget(snippets, 1000);
    const chars = result.reduce((sum, snippet) => sum + [...snippet.text].length, 0);
    expect(chars).toBeGreaterThanOrEqual(1000);
  });

  test("selectSnippetsWithinBudget keeps the tolerance ceiling when already acceptably filled", () => {
    // 第一片已达 85% 预算：轻微欠填不放宽，保持防超量上限(不超 1.3×)
    const snippets: CodeSnippet[] = [coarseSnippet(850, 0), coarseSnippet(850, 1)];
    const result = selectSnippetsWithinBudget(snippets, 1000);
    const chars = result.reduce((sum, snippet) => sum + [...snippet.text].length, 0);
    expect(chars).toBeLessThanOrEqual(Math.round(1000 * 1.3));
  });

  test("usedCodeSnippetTexts only excludes snippets within the recent window", () => {
    const records = Array.from({ length: 50 }, (_, index) =>
      defaultSessionRecord({ mode: "code", category: "code_mix", target_text: `snippet ${index}` }),
    );
    const used = usedCodeSnippetTexts(records);
    expect(used.has("snippet 49")).toBe(true);
    expect(used.has("snippet 0")).toBe(false);
  });
});

describe("module mix stage targets (secondary menus)", () => {
  test("everyday mix combines words and sentences, excludes programming words", () => {
    const target = buildEverydayMixStageTarget(
      stageContext(),
      emptyProfile({ words: ["algorithm"] }),
      [customLibraryFixture()],
    );
    // focus 回流 + 自建词库混入
    expect(target.text).toContain("algorithm");
    expect(target.text).toContain("bespoke");
    // 句子段存在（库中句子之一出现）
    expect(target.text).toMatch(/\./u);
    expect(target.text.split("\n").length).toBeGreaterThan(1);
    // 编程词不进日常综合
    expect(target.text).not.toContain("closure");
    expect(target.source).toBe("keyloop:module:everyday-english:mix:adaptive");
  });

  test("programming mix combines programming words and symbols, excludes everyday words", () => {
    const target = buildProgrammingBasicsMixStageTarget(
      stageContext(),
      emptyProfile(),
    );
    expect(target.text).toContain("closure");
    expect(target.text).not.toContain("weather");
    expect(target.source).toBe("keyloop:module:programming-basics:mix:adaptive");
  });
});

describe("buildDailyPracticePlan (stage-based)", () => {
  test("plan lessons follow prescription stages with stage ids", () => {
    const plan = buildDailyPracticePlan({
      ...stageContext(),
      now: new Date("2026-06-13T08:00:00Z"),
    });
    expect(plan.lessons.length).toBeGreaterThanOrEqual(3);
    expect(plan.lessons[0]?.id).toBe("stage:keys:1");
    expect(plan.lessons[0]?.category).toBe("foundation_mix");
    const forms = plan.lessons.map((lesson) => lesson.id.split(":")[1]);
    expect(forms).toContain("words");
    // 无历史 → 15 分钟默认
    expect(plan.target_minutes).toBe(15);
    // 每课带理由
    for (const lesson of plan.lessons) {
      expect(lesson.reason_zh.length).toBeGreaterThan(0);
      expect(lesson.mix_profile).toBe("comprehensive");
    }
  });

  test("disabled modules remove their stages from the plan", () => {
    const plan = buildDailyPracticePlan({
      ...stageContext(),
      now: new Date("2026-06-13T08:00:00Z"),
      enabledModules: ["foundation_input", "everyday_english"],
    });
    const forms = plan.lessons.map((lesson) => lesson.id.split(":")[1]);
    expect(forms).not.toContain("code");
  });

  test("refreshModuleMixTarget regenerates stage lessons by form", () => {
    const context = { ...stageContext(), now: new Date("2026-06-13T08:00:00Z") };
    const plan = buildDailyPracticePlan(context);
    const wordsLesson = plan.lessons.find((lesson) => lesson.id.startsWith("stage:words"));
    expect(wordsLesson).toBeDefined();
    const refreshed = refreshModuleMixTarget(wordsLesson!, context);
    expect(refreshed.source).toContain("keyloop:stage:words");
  });
});

describe("stage detection survives daily-run id rewrite", () => {
  test("refreshModuleMixTarget keeps stage path after id rewrite", () => {
    const context = { ...stageContext(), now: new Date("2026-06-13T08:00:00Z") };
    const plan = buildDailyPracticePlan(context);
    const sentencesLesson = plan.lessons.find((lesson) =>
      lesson.id.startsWith("stage:sentences"),
    );
    expect(sentencesLesson).toBeDefined();
    // 模拟 assignDailyRunMetadata 的 id 重写（丢失 stage: 前缀）
    const rewritten = {
      ...sentencesLesson!,
      id: "20260613-1-abc123-03-words",
    };
    const refreshed = refreshModuleMixTarget(rewritten, context);
    // 必须仍走句子形态生成器，而不是退化为旧的 everyday mix
    expect(refreshed.source).toContain("keyloop:stage:sentences");
    expect(refreshed.annotations?.some((item) => item.display === "line")).toBe(true);
  });
});

describe("buildStageTarget symbols budget", () => {
  test("small budget trims the symbols corpus, large budget keeps it", () => {
    const big = buildStageTarget(stageContext(), {
      stage: { form: "symbols", char_budget: 4000 },
      profile: emptyProfile(),
    });
    const small = buildStageTarget(stageContext(), {
      stage: { form: "symbols", char_budget: 90 },
      profile: emptyProfile(),
    });
    // 小预算行数更少，且裁剪后内容不超预算太多（保留至少 1 行）
    const bigLines = big.text.split("\n").length;
    const smallLines = small.text.split("\n").length;
    expect(smallLines).toBeGreaterThanOrEqual(1);
    expect(smallLines).toBeLessThan(bigLines);
    expect(small.text.length).toBeLessThanOrEqual(big.text.length);
    // code_blocks 行数与实际行数一致
    expect(small.code_blocks?.[0]?.line_count).toBe(smallLines);
  });

  test("large symbol budgets are filled beyond one basics card set", () => {
    const target = buildStageTarget(stageContext(), {
      stage: { form: "symbols", char_budget: 900 },
      profile: emptyProfile(),
    });

    expect([...target.text].length).toBeGreaterThanOrEqual(720);
    expect(target.code_blocks?.[0]?.line_count).toBe(target.text.split("\n").length);
  });
});

describe("buildStageTarget words skill feature-biasing", () => {
  function profileWithWeak(dim: SkillProfile["dimensions"][number]["id"]): SkillProfile {
    return {
      dimensions: [
        {
          id: dim,
          samples: 5,
          events: 100,
          ewma_error_rate: 10,
          ewma_speed: 200,
          trend: "stable",
          status: "weak",
        },
      ],
      form_speeds: [],
      focus: { words: [], code: [], chars: [] },
      daily_active_minutes_7d: 0,
      generated_at: "2026-06-13T08:00:00Z",
    };
  }
  const camelLib: CustomLibrary = {
    version: 1,
    slug: "camel",
    name: "camel",
    created_at: "2026-06-01T00:00:00Z",
    words: [
      { id: "c1", text: "useEffect", kind: "word", source: "manual" },
      { id: "c2", text: "getUserName", kind: "word", source: "manual" },
      { id: "c3", text: "ApiClient", kind: "word", source: "manual" },
    ],
    sentences: [],
    articles: [],
  };

  test("capitalization weak biases toward uppercase-containing words", () => {
    const stage = { form: "words" as const, char_budget: 80 };
    const lcg = (seed: number): (() => number) => {
      let s = seed % 2147483647;
      if (s <= 0) s += 2147483646;
      const rand = (): number => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 5; i += 1) rand(); // 预热
      return rand;
    };
    const countUpper = (text: string): number =>
      text.split(" ").filter((w) => /[A-Z]/u.test(w)).length;
    const totalUpper = (profile: SkillProfile): number => {
      let total = 0;
      for (let i = 1; i <= 40; i += 1) {
        const context = { ...stageContext(), random: lcg(i) };
        total += countUpper(
          buildStageTarget(context, { stage, profile, customLibraries: [camelLib] }).text,
        );
      }
      return total;
    };
    // 弱项时大写/驼峰词被加权偏重（非置顶）：多次抽样累计应明显多于非弱项
    expect(totalUpper(profileWithWeak("capitalization"))).toBeGreaterThan(totalUpper(emptyProfile()));
  });
});

test("comprehensive lesson estimated_minutes is recomputed from real target chars, not the quota", () => {
  // records 为空 → profile.form_speeds 无样本 → 回算用冷启动 wpm（与传 [] 等价）
  const plan = buildDailyPracticePlan(stageContext(), { targetMinutesOverride: 20 });
  expect(plan.lessons.length).toBeGreaterThan(0);
  for (const lesson of plan.lessons) {
    const form = formForCategory(lesson.category);
    if (form === null) {
      continue;
    }
    const chars = [...lesson.target.text].length;
    expect(lesson.estimated_minutes).toBe(estimatedMinutesFromChars(chars, form, []));
  }
});

test("code stage fills snippets up to the char budget, keeping whole snippets", () => {
  // stageLibrary 的 code_snippets 每片 ~41 字符；旧逻辑 clamp(round(120/180),1,5)=1 片，
  // 新逻辑按预算累加应 ≥2 片
  const target = buildStageTarget(stageContext(), {
    stage: { form: "code", char_budget: 120 },
    profile: emptyProfile(),
  });
  const blocks = target.code_blocks ?? [];
  const chars = [...target.text].length;
  expect(blocks.length).toBeGreaterThanOrEqual(2);
  // 总量不超预算 × 1.3 容差
  expect(chars).toBeLessThanOrEqual(Math.round(120 * 1.3));
  // 每片完整：各 block 行数 + 片间空行 == 文本总行数（没有被截断）
  const blockLines = blocks.reduce((sum, b) => sum + b.line_count, 0);
  const gaps = Math.max(blocks.length - 1, 0);
  expect(blockLines + gaps).toBe(target.text.split("\n").length);
});

test("comprehensivePlanMinutes sums lesson estimated_minutes (honest plan time)", () => {
  const plan = buildDailyPracticePlan(stageContext(), { targetMinutesOverride: 20 });
  const expected = plan.lessons.reduce((sum, lesson) => sum + lesson.estimated_minutes, 0);
  expect(comprehensivePlanMinutes(plan)).toBe(expected);
});
