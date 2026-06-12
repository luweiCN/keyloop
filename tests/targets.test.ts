import { describe, expect, test } from "bun:test";

import {
  buildDailyPracticePlan,
  buildCodeMixPracticeTarget,
  buildCodeSpecialistPracticeTarget,
  buildEverydayPracticeTarget,
  buildFoundationPracticeTarget,
  buildLessonWords,
  buildLongWordBreakdownPracticeTarget,
  buildProgrammingBasicsPracticeTarget,
  everydayMeaningLines,
  refreshModuleMixTarget,
  defaultSessionRecord,
  identifierParts,
  type BuiltinCodeSnippet,
  type ContentLibrary,
  type EverydayEnglishSettings,
  type CodeSnippet,
  type PracticeLesson,
  type PracticePlan,
  type SessionRecord,
  type TrainingCategory,
  type TrainingModule,
} from "../src/index";

describe("target generation core", () => {
  test("identifier parts split acronym digit and camel boundaries", () => {
    expect(identifierParts("loadHTTP2Config")).toEqual([
      "load",
      "http",
      "2",
      "config",
    ]);
    expect(identifierParts("selected_visible_receipt_id")).toEqual([
      "selected",
      "visible",
      "receipt",
      "id",
    ]);
  });

  test("lesson words draw sixteen random words from the library", () => {
    const text = buildLessonWords(testLibrary());
    const words = text.split(/\s+/u);

    expect(words).toHaveLength(16);
    const library = testLibrary().programming_words.map((entry) => entry.word);
    for (const word of words) {
      expect(library).toContain(word);
    }
  });

  test("lesson words shuffle the library with injected random", () => {
    const text = buildLessonWords(
      {
        programming_words: ["term1", "term2", "term3", "term4", "term5"].map((word) => ({
          word,
          note_zh: "",
        })),
      },
      sequenceRandom([0, 0.99, 0.99, 0.99]),
    );
    const words = text.split(/\s+/u);

    expect(words[0]).toBe("term5");
    expect(words).toHaveLength(5);
  });

  test("programming word targets pass injected random to lesson words", () => {
    const library = testLibrary();
    library.programming_words = numberedLines("programmingTerm", 20).map((word) => ({
      word,
      note_zh: "",
    }));

    const originalRandom = Math.random;
    Math.random = () => 0.99;
    try {
      const standalone = buildProgrammingBasicsPracticeTarget(
        {
          records: [],
          plan: unfocusedPlan(),
          library,
          random: sequenceRandom([0, 0.99, 0.99, 0.99, 0.99]),
        },
        "programming_terms",
      );
      expect(standalone.text).toContain("programmingTerm 20");
    } finally {
      Math.random = originalRandom;
    }
  });

  test("everyday mix includes phrases and matching sentence length when enabled", () => {
    const target = buildEverydayPracticeTarget(
      {
        records: [],
        plan: testPlan(),
        library: testLibrary(),
        everydaySettings: {
          word_count: 10,
          sentence_length: "short",
          include_phrases: true,
        },
      },
      "mix",
    );

    expect(target.source).toBe(
      "keyloop:module:everyday-english:words-10:sentences-short",
    );
    expect(target.text).toContain("stand up");
    expect(target.text).toContain("Short daily sentence.");
    expect(target.text).not.toContain("This is a much longer workplace sentence.");
  });

  test("everyday mix omits phrase lines when phrase setting is disabled", () => {
    const target = buildEverydayPracticeTarget(
      {
        records: [],
        plan: testPlan(),
        library: testLibrary(),
        everydaySettings: {
          word_count: 10,
          sentence_length: "mixed",
          include_phrases: false,
        },
      },
      "mix",
    );

    expect(target.text).not.toContain("stand up");
    expect(target.text).not.toContain("check in");
    expect(target.text).toContain("Short daily sentence.");
  });

  test("everyday mix uses translated word and sentence corpora when available", () => {
    const library = testLibrary();
    library.everyday_words.entries = [
      dailyWord("people", 82, "200", "high_school", "人们"),
      dailyWord("information", 500, "1000", "cet4", "信息；资料"),
      dailyWord("development", 1300, "5000", "cet4", "发展；开发"),
    ];
    library.everyday_sentences.entries = [
      dailySentence("CET four short.", "四级短句。", "cet4", "short"),
      dailySentence("High school short.", "高中短句。", "high_school", "short"),
    ];

    const target = buildEverydayPracticeTarget(
      {
        records: [],
        plan: unfocusedPlan(),
        library,
        everydaySettings: dailySettings({
          word_range: "1000",
          word_count: 2,
          sentence_level: "cet4",
          sentence_length: "short",
        }),
        random: sequenceRandom([0, 0, 0]),
      },
      "mix",
    );

    expect(target.source).toBe(
      "keyloop:module:everyday-english:mix:words-1000:count-2:sentences-cet4:short:count-1",
    );
    expect(target.text).toContain("people");
    expect(target.text).toContain("information");
    expect(target.text).toContain("CET four short.");
    expect(target.text).not.toContain("development");
    expect(target.annotations?.map((annotation) => annotation.translation_zh)).toEqual(
      expect.arrayContaining(["人们", "信息", "四级短句。"]),
    );
  });

  test("everyday translated words flow as one space-separated stream without line breaks", () => {
    const library = testLibrary();
    library.everyday_words.entries = Array.from({ length: 12 }, (_, index) =>
      dailyWord(`word${index + 1}`, index + 1, "200", "high_school", `释义${index + 1}`),
    );

    const target = buildEverydayPracticeTarget(
      {
        records: [],
        plan: unfocusedPlan(),
        library,
        everydaySettings: dailySettings({ word_range: "200", word_count: 12 }),
        random: sequenceRandom([0, 0, 0]),
      },
      "words",
    );

    expect(target.text).not.toContain("\n");
    expect(target.text.split(" ")).toHaveLength(12);
    expect(target.annotations).toHaveLength(12);
  });

  test("everyday mix shuffles word pool with injected random", () => {
    const library = testLibrary();
    library.everyday_english.entries = numberedLines("everydayMixWord", 20).map((text) => ({
      text,
      kind: "word",
      tier: 1,
      length: null,
      domain: "everyday",
      source_id: "test",
    }));

    const originalRandom = Math.random;
    Math.random = () => 0.99;
    try {
      const target = buildEverydayPracticeTarget(
        {
          records: [],
          plan: unfocusedPlan(),
          library,
          everydaySettings: {
            word_count: 6,
            sentence_length: "short",
            include_phrases: false,
          },
          random: sequenceRandom([0, 0.99, 0.99, 0.99, 0.99]),
        },
        "mix",
      );

      expect(target.text).toContain("everydayMixWord 20");
    } finally {
      Math.random = originalRandom;
    }
  });

  test("everyday mix falls back to focus word chunks when phrase corpus is empty", () => {
    const library = testLibrary();
    library.everyday_english.entries = [
      ...numberedLines("everydayMixWord", 12).map((text) => ({
        text,
        kind: "word" as const,
        tier: 1,
        length: null,
        domain: "everyday" as const,
        source_id: "test",
      })),
      {
        text: "Short daily sentence.",
        kind: "sentence",
        tier: 1,
        length: "short",
        domain: "everyday",
        source_id: "test",
      },
    ];
    library.word_chunks = numberedLines("fallbackChunk", 12);

    const target = buildEverydayPracticeTarget(
      {
        records: [],
        plan: unfocusedPlan({ focus_words: ["selectedVisibleReceipt"] }),
        library,
        everydaySettings: {
          word_count: 6,
          sentence_length: "short",
          include_phrases: true,
        },
        random: sequenceRandom([
          ...Array.from({ length: 11 }, () => 0.5),
          0,
          0.99,
          0.99,
          0.99,
        ]),
      },
      "mix",
    );

    expect(target.text).toContain("selected visible receipt selectedVisibleReceipt");
    expect(target.text).toContain("fallbackChunk 12");
  });

  test("everyday targets ignore corpus entries with blank source ids", () => {
    const library = testLibrary();
    library.common_words = [];
    library.word_chunks = [];
    library.everyday_english.entries = [
      {
        text: "blankSourceWord",
        kind: "word",
        tier: 1,
        length: null,
        domain: "everyday",
        source_id: " ",
      },
      {
        text: "validSourceWord",
        kind: "word",
        tier: 1,
        length: null,
        domain: "everyday",
        source_id: "valid",
      },
      {
        text: "blank source phrase",
        kind: "phrase",
        tier: 1,
        length: null,
        domain: "everyday",
        source_id: "",
      },
      {
        text: "valid source phrase",
        kind: "phrase",
        tier: 1,
        length: null,
        domain: "everyday",
        source_id: "valid",
      },
      {
        text: "Blank source sentence.",
        kind: "sentence",
        tier: 1,
        length: "short",
        domain: "everyday",
        source_id: "",
      },
      {
        text: "Valid source sentence.",
        kind: "sentence",
        tier: 1,
        length: "short",
        domain: "everyday",
        source_id: "valid",
      },
    ];
    const context = {
      records: [],
      plan: unfocusedPlan(),
      library,
      everydaySettings: {
        word_count: 4,
        sentence_length: "short" as const,
        include_phrases: true,
      },
      random: sequenceRandom(Array.from({ length: 12 }, () => 0.99)),
    };

    const words = buildEverydayPracticeTarget(context, "words");
    const phrases = buildEverydayPracticeTarget(context, "phrases");
    const sentences = buildEverydayPracticeTarget(context, "sentences");

    expect(words.text).toContain("validSourceWord");
    expect(words.text).not.toContain("blankSourceWord");
    expect(phrases.text).toContain("valid source phrase");
    expect(phrases.text).not.toContain("blank source phrase");
    expect(sentences.text).toContain("Valid source sentence.");
    expect(sentences.text).not.toContain("Blank source sentence.");
  });

  test("everyday words target shuffles word pool with injected random", () => {
    const library = testLibrary();
    library.everyday_english.entries = numberedLines("everydayWord", 10).map((text) => ({
      text,
      kind: "word",
      tier: 1,
      length: null,
      domain: "everyday",
      source_id: "test",
    }));

    const target = buildEverydayPracticeTarget(
      {
        records: [],
        plan: unfocusedPlan(),
        library,
        everydaySettings: {
          word_count: 6,
          sentence_length: "short",
          include_phrases: false,
        },
        random: sequenceRandom([0, 0.99, 0.99, 0.99, 0.99]),
      },
      "words",
    );

    expect(target.text).toContain("everydayWord 10");
  });

  test("everyday word scopes use Rust tier limits and source slugs", () => {
    const library = testLibrary();
    library.common_words = [];
    library.everyday_english.entries = [
      {
        text: "tierTwoWord",
        kind: "word",
        tier: 2,
        length: null,
        domain: "everyday",
        source_id: "test",
      },
      {
        text: "tierThreeWord",
        kind: "word",
        tier: 3,
        length: null,
        domain: "everyday",
        source_id: "test",
      },
      {
        text: "tierFiveWord",
        kind: "word",
        tier: 5,
        length: null,
        domain: "everyday",
        source_id: "test",
      },
    ];
    const context = {
      records: [],
      plan: unfocusedPlan(),
      library,
      everydaySettings: {
        word_count: 10,
        sentence_length: "short" as const,
        include_phrases: false,
      },
      random: sequenceRandom(Array.from({ length: 8 }, () => 0.99)),
    };

    const common500 = buildEverydayPracticeTarget(context, "common_500");
    const common1000 = buildEverydayPracticeTarget(context, "common_1000");
    const common5000 = buildEverydayPracticeTarget(context, "common_5000");

    expect(common500.source).toBe("keyloop:module:everyday-english:common-500:words-10");
    expect(common500.text).toContain("tierTwoWord");
    expect(common500.text).not.toContain("tierThreeWord");
    expect(common500.text).not.toContain("tierFiveWord");
    expect(common1000.source).toBe("keyloop:module:everyday-english:common-1000:words-10");
    expect(common1000.text).toContain("tierThreeWord");
    expect(common1000.text).not.toContain("tierFiveWord");
    expect(common5000.source).toBe("keyloop:module:everyday-english:common-5000:words-10");
    expect(common5000.text).toContain("tierFiveWord");
  });

  test("everyday sentences target shuffles sentence pool with injected random", () => {
    const library = testLibrary();
    library.everyday_english.entries = numberedLines("Short sentence", 10).map((text) => ({
      text,
      kind: "sentence",
      tier: 1,
      length: "short",
      domain: "everyday",
      source_id: "test",
    }));

    const target = buildEverydayPracticeTarget(
      {
        records: [],
        plan: unfocusedPlan(),
        library,
        everydaySettings: {
          word_count: 6,
          sentence_length: "short",
          include_phrases: false,
        },
        random: sequenceRandom([0, 0.99, 0.99, 0.99, 0.99]),
      },
      "sentences",
    );

    expect(target.text).toContain("Short sentence 10");
  });

  test("everyday meaning lines return built-in Chinese glosses", () => {
    expect(everydayMeaningLines("practice today before unknown practice", 4)).toEqual([
      "practice: 练习",
      "today: 今天",
      "before: 在之前",
    ]);
  });

  test("everyday words target respects word range count and annotation spans", () => {
    const library = testLibrary();
    library.everyday_words.entries = [
      dailyWord("people", 82, "200", "high_school", "人们"),
      dailyWord("information", 500, "1000", "cet4", "信息；资料"),
      dailyWord("development", 1300, "5000", "cet4", "发展；开发"),
    ];

    const target = buildEverydayPracticeTarget(
      {
        records: [],
        plan: unfocusedPlan(),
        library,
        everydaySettings: dailySettings({ word_range: "1000", word_count: 2 }),
        random: sequenceRandom([0, 0]),
      },
      "words",
    );

    expect(target.text.split(/\s+/u)).toHaveLength(2);
    expect(target.text).toContain("people");
    expect(target.text).toContain("information");
    expect(target.text).not.toContain("development");
    expect(target.annotations?.map((annotation) => annotation.translation_zh)).toEqual(
      expect.arrayContaining(["人们", "信息"]),
    );
    for (const annotation of target.annotations ?? []) {
      expect(annotation.display).toBe("word");
      expect(target.text.slice(annotation.start, annotation.end).length).toBeGreaterThan(0);
    }
  });

  test("everyday word annotations keep one short common meaning", () => {
    const library = testLibrary();
    library.everyday_words.entries = [
      dailyWord("and", 3, "200", "high_school", "conj. 和, 与；[计] 与"),
      dailyWord("torch", 1000, "1000", "cet4", "n. 火把, 启发之物；[化] 火炬"),
      dailyWord("delicate", 1001, "5000", "cet4", "a. 精致的, 细腻的, 敏锐的"),
    ];

    const target = buildEverydayPracticeTarget(
      {
        records: [],
        plan: unfocusedPlan(),
        library,
        everydaySettings: dailySettings({ word_range: "5000", word_count: 3 }),
        random: sequenceRandom([0, 0, 0]),
      },
      "words",
    );

    expect(target.annotations?.map((annotation) => annotation.translation_zh)).toEqual(
      expect.arrayContaining(["和", "火把", "精致的"]),
    );
    expect(target.annotations?.map((annotation) => annotation.translation_zh)).not.toEqual(
      expect.arrayContaining(["conj. 和", "[计] 与", "n. 火把", "[化] 火炬"]),
    );
  });

  test("everyday sentences target respects level length count and annotations", () => {
    const library = testLibrary();
    library.everyday_sentences.entries = [
      dailySentence("High school short.", "高中短句。", "high_school", "short"),
      dailySentence("CET four short.", "四级短句。", "cet4", "short"),
      dailySentence("CET four long sentence for testing.", "四级长句。", "cet4", "long"),
    ];

    const target = buildEverydayPracticeTarget(
      {
        records: [],
        plan: unfocusedPlan(),
        library,
        everydaySettings: dailySettings({
          sentence_level: "cet4",
          sentence_length: "short",
          sentence_count: 1,
        }),
      },
      "sentences",
    );

    expect(target.text).toBe("CET four short.");
    expect(target.annotations).toEqual([
      {
        start: 0,
        end: "CET four short.".length,
        translation_zh: "四级短句。",
        source_title: "Test sentences",
        display: "line",
      },
    ]);
  });

  test("everyday articles target picks one matching article and keeps one full translation", () => {
    const library = testLibrary();
    library.everyday_articles.entries = [
      dailyArticle("Short", "cet4", "short", [["Short paragraph.", "短段落。"]]),
      dailyArticle("Medium", "cet6", "medium", [["First paragraph.", "第一段。"], ["Second paragraph.", "第二段。"]]),
    ];

    const target = buildEverydayPracticeTarget(
      {
        records: [],
        plan: unfocusedPlan(),
        library,
        everydaySettings: dailySettings({ article_level: "cet6", article_length: "medium" }),
      },
      "articles",
    );

    expect(target.text).toBe("First paragraph.\nSecond paragraph.");
    expect(target.annotations).toEqual([
      {
        start: 0,
        end: target.text.length,
        translation_zh: "第一段。\n第二段。",
        source_title: "Medium",
        display: "article",
      },
    ]);
  });

  test("everyday word decomposition repeats explicit parts and full words", () => {
    const library = testLibrary();
    library.everyday_word_decomposition.entries = [
      {
        word: "information",
        parts: ["in", "for", "ma", "tion"],
        translation_zh: "n. 信息；资料；情报；通知；消息；数据",
        level: "cet4",
        source_id: "test",
      },
    ];

    const target = buildEverydayPracticeTarget(
      {
        records: [],
        plan: unfocusedPlan(),
        library,
        everydaySettings: dailySettings({
          decomposition_level: "cet4",
          decomposition_word_count: 1,
          decomposition_part_repeats: 2,
          decomposition_word_repeats: 3,
        }),
      },
      "word_decomposition",
    );

    expect(target.text).toBe(
      "information in in for for ma ma tion tion information information information",
    );
    // Decomposition rows keep the full dictionary translation (not the concise
    // form) and display it as a line translation below the row.
    expect(target.annotations).toEqual([
      {
        start: 0,
        end: "information".length,
        translation_zh: "n. 信息；资料；情报；通知；消息；数据",
        display: "line",
      },
    ]);
  });














  test("refreshes programming basics mix from latest symbol records", () => {
    const lesson: PracticeLesson = {
      id: "daily:symbols:1",
      kind: "code_block",
      module: "programming_basics",
      category: "programming_basics_mix",
      mix_profile: "comprehensive",
      estimated_minutes: 4,
      target: {
        mode: "code",
        text: "fallback",
        source: "test:fallback",
      },
      reason_zh: "测试",
      reason_en: "test",
    };
    const record = defaultSessionRecord({
      token_stats: [
        {
          token: "=>",
          kind: "symbol",
          start_delay_ms: 100,
          duration_ms: 100,
          errors: 3,
        },
      ],
    });

    const target = refreshModuleMixTarget(lesson, {
      records: [record],
      plan: unfocusedPlan(),
      library: testLibrary(),
    });

    expect(target.source).toContain("keyloop:module:programming-basics-mix:");
    expect(target.text).not.toBe("fallback");
  });

  test("standalone long-word breakdown falls back when no due entries exist", () => {
    const library = testLibrary();
    library.long_words = [];

    const target = buildLongWordBreakdownPracticeTarget(
      {
        records: [],
        plan: {
          ...testPlan(),
          focus_words: ["return"],
        },
        library,
      },
      { profile: "standalone", domain: "programming", maxItems: 2 },
    );

    expect(target.source).toBe("keyloop:module:word-breakdown:internationalization");
    expect(target.text).toContain("international ization");
    expect(target.text).toContain("access ibility");
    expect(target.text).not.toContain("authentic ation");
  });

  test("standalone long-word breakdown hides non-literal parts", () => {
    const library = testLibrary();
    library.long_words = [
      {
        word: "maintainability",
        parts: ["maintainable", "ity"],
        domain: "programming",
        tier: 3,
        source_id: "test",
        note_zh: "可维护性",
      },
    ];

    const target = buildLongWordBreakdownPracticeTarget(
      {
        records: [],
        plan: testPlan(),
        library,
      },
      { profile: "standalone", domain: "programming", maxItems: 1 },
    );

    expect(target.text).toBe("maintainability maintainability");
    expect(target.text).not.toContain("maintainable ity");
  });

  test("standalone long-word breakdown annotates the word group end", () => {
    const library = testLibrary();
    library.long_words = [
      {
        word: "specification",
        parts: ["specific", "ation"],
        aliases: ["spec"],
        domain: "programming",
        tier: 2,
        source_id: "test",
        note_zh: "规格说明（技术规范）",
      },
    ];

    const target = buildLongWordBreakdownPracticeTarget(
      {
        records: [],
        plan: testPlan(),
        library,
      },
      { profile: "standalone", domain: "programming", maxItems: 1 },
    );

    const lastLine = "spec specification";
    const start = target.text.indexOf(lastLine);
    expect(target.text).toBe(
      "specific ation\nspecification specification\nspec specification",
    );
    expect(target.annotations).toEqual([
      {
        start,
        end: start + lastLine.length,
        translation_zh: "规格说明（技术规范）",
        display: "line",
      },
    ]);
  });

  test("daily practice plan keeps the four module sequence", () => {
    const plan = buildDailyPracticePlan({
      records: [],
      plan: testPlan(),
      library: testLibrary(),
    });

    expect(plan.target_minutes).toBe(20);
    expect(plan.lessons.map((lesson) => lesson.module)).toEqual([
      "foundation_input",
      "everyday_english",
      "programming_basics",
      "code_practice",
    ]);
    expect(plan.lessons.map((lesson) => lesson.id)).toEqual([
      "daily:foundation:1",
      "daily:common-words:1",
      "daily:symbols:1",
      "daily:code-block:1",
    ]);
  });

  test("daily plan completed time uses injected now", () => {
    const daily = buildDailyPracticePlan({
      records: [
        defaultSessionRecord({
          started_at: "2020-01-02T03:00:00.000Z",
          duration_ms: 60_000,
        }),
      ],
      plan: testPlan(),
      library: testLibrary(),
      now: new Date("2020-01-02T04:00:00.000Z"),
    });

    expect(daily.completed_ms).toBe(60_000);
  });

  test("daily plan readiness uses injected now", () => {
    const daily = buildDailyPracticePlan({
      records: stableModuleRecords(
        "foundation_input",
        "foundation_mix",
        "2020-01-02T03:00:00.000Z",
      ),
      plan: unfocusedPlan(),
      library: testLibrary(),
      now: new Date("2020-01-02T04:00:00.000Z"),
    });

    expect(daily.lessons.map((lesson) => lesson.module)).toEqual([
      "everyday_english",
      "programming_basics",
      "code_practice",
    ]);
  });

  test("daily foundation mix boosts drill probability from focus key hotspots", () => {
    const daily = buildDailyPracticePlan({
      records: [],
      plan: unfocusedPlan({ focus_keys: ["q"], has_recent_history: false }),
      library: foundationDrillLibrary(),
      random: sequenceRandom([0.1, ...Array.from({ length: 20 }, () => 0)]),
    });
    const foundation = daily.lessons.find(
      (lesson) => lesson.module === "foundation_input",
    );

    expect(foundation?.target.source).toBe("keyloop:module:foundation-mix:top-row");
    expect(foundation?.target.text).toContain("top row line");
    expect(foundation?.target.text).not.toContain("punctuation line 1");
  });

  test("daily foundation mix keeps non-focus drills possible with focus key hotspots", () => {
    const daily = buildDailyPracticePlan({
      records: [],
      plan: unfocusedPlan({ focus_keys: ["q"], has_recent_history: false }),
      library: foundationDrillLibrary(),
      random: sequenceRandom([0.99, ...Array.from({ length: 20 }, () => 0)]),
    });
    const foundation = daily.lessons.find(
      (lesson) => lesson.module === "foundation_input",
    );

    expect(foundation?.target.source).toBe(
      "keyloop:module:foundation-mix:punctuation-edges",
    );
    expect(foundation?.target.text).toContain("punctuation line");
    expect(foundation?.target.text).not.toContain("top row line");
  });

  test("daily foundation mix randomly selects a drill without focus key hotspots", () => {
    const daily = buildDailyPracticePlan({
      records: [],
      plan: unfocusedPlan({ focus_keys: [], has_recent_history: false }),
      library: foundationDrillLibrary(),
      random: sequenceRandom([0.5, ...Array.from({ length: 20 }, () => 0)]),
    });
    const foundation = daily.lessons.find(
      (lesson) => lesson.module === "foundation_input",
    );

    expect(foundation?.target.source).toBe(
      "keyloop:module:foundation-mix:index-fingers",
    );
    expect(foundation?.target.text).toContain("index finger line");
    expect(foundation?.target.text).not.toContain("home row line");
  });

  test("daily foundation mix avoids recently selected drill when randomizing", () => {
    const daily = buildDailyPracticePlan({
      records: [
        defaultSessionRecord({
          source: "keyloop:module:foundation-mix:home-row",
          target_text: "home row line 1",
        }),
      ],
      plan: unfocusedPlan({ focus_keys: [], has_recent_history: true }),
      library: foundationDrillLibrary(),
      random: sequenceRandom([0, ...Array.from({ length: 20 }, () => 0)]),
    });
    const foundation = daily.lessons.find(
      (lesson) => lesson.module === "foundation_input",
    );

    expect(foundation?.target.source).toBe("keyloop:module:foundation-mix:top-row");
    expect(foundation?.target.text).toContain("top row line");
    expect(foundation?.target.text).not.toContain("home row line");
  });

  test("daily foundation mix shuffles drill lines with injected random", () => {
    const daily = buildDailyPracticePlan({
      records: [],
      plan: unfocusedPlan({ focus_keys: ["q"], has_recent_history: false }),
      library: foundationDrillLibrary(),
      random: sequenceRandom([0.1, 0, 0.99, 0.99, 0.99, 0.99]),
    });
    const foundation = daily.lessons.find(
      (lesson) => lesson.module === "foundation_input",
    );

    expect(foundation?.target.text).toContain("top row line 10");
  });

  test("daily foundation mix avoids recently practiced drill lines", () => {
    const daily = buildDailyPracticePlan({
      records: [
        defaultSessionRecord({
          source: "keyloop:module:foundation-mix:home-row",
          target_text: "home row line 1",
        }),
        defaultSessionRecord({
          source: "keyloop:module:foundation-mix:top-row",
          target_text: "top row line 1",
        }),
        defaultSessionRecord({
          source: "keyloop:module:foundation-mix:bottom-row",
          target_text: "bottom row line 1",
        }),
        defaultSessionRecord({
          source: "keyloop:module:foundation-mix:index-fingers",
          target_text: "index finger line 1",
        }),
        defaultSessionRecord({
          source: "keyloop:module:foundation-mix:pinky-fingers",
          target_text: "pinky finger line 1",
        }),
        defaultSessionRecord({
          source: "keyloop:foundation:punctuation-edges",
          target_text: "punctuation line 1\npunctuation line 2",
        }),
      ],
      plan: unfocusedPlan({ focus_keys: [";"], has_recent_history: true }),
      library: foundationDrillLibrary(),
      random: sequenceRandom([0.6, ...Array.from({ length: 20 }, () => 0)]),
    });
    const foundation = daily.lessons.find(
      (lesson) => lesson.module === "foundation_input",
    );
    const lines = foundation?.target.text.split("\n") ?? [];
    const drillLines = lines.filter((line) => line.startsWith("punctuation line"));

    expect(drillLines).not.toContain("punctuation line 1");
    expect(drillLines).not.toContain("punctuation line 2");
    expect(drillLines.length).toBeGreaterThan(0);
  });

  test("daily foundation mix only avoids lines from the selected drill source", () => {
    const library = foundationDrillLibrary();
    const punctuation = library.foundation_drills.find(
      (drill) => drill.id === "punctuation-edges",
    );
    if (punctuation === undefined) {
      throw new Error("expected punctuation drill");
    }
    punctuation.items = ["shared line", ...numberedLines("punctuation line", 9)];

    const daily = buildDailyPracticePlan({
      records: [
        defaultSessionRecord({
          source: "keyloop:foundation:top-row",
          target_text: "shared line",
        }),
      ],
      plan: unfocusedPlan({ focus_keys: [";"], has_recent_history: true }),
      library,
      random: sequenceRandom(Array.from({ length: 20 }, () => 0.999)),
    });
    const foundation = daily.lessons.find(
      (lesson) => lesson.module === "foundation_input",
    );
    const lines = foundation?.target.text.split("\n") ?? [];

    expect(lines).toContain("shared line");
  });

  test("standalone foundation target uses the requested drill", () => {
    const target = buildFoundationPracticeTarget(
      {
        records: [],
        plan: unfocusedPlan({ has_recent_history: false }),
        library: foundationDrillLibrary(),
        random: sequenceRandom(Array.from({ length: 20 }, () => 0)),
      },
      "top-row",
    );

    expect(target.source).toBe("keyloop:foundation:top-row");
    expect(target.text).toContain("top row line");
    expect(target.text).not.toContain("punctuation line");
  });

  test("standalone foundation target keeps basic drills as short groups", () => {
    const library = testLibrary();
    library.foundation_drills = [
      foundationDrill("home-row", [
        "asdf jkl; asdf jkl; asdf jkl; asdf jkl; asdf jkl; asdf jkl;",
        "fdsa ;lkj fdsa ;lkj fdsa ;lkj fdsa ;lkj fdsa ;lkj fdsa ;lkj",
        "asdf fdsa jkl; ;lkj asdf fdsa jkl; ;lkj asdf fdsa jkl; ;lkj",
        "sass fall dad ask all sad lad hall flask salad half flask",
        "jaks dask flask salad half hall dash fall lad ask sad all",
      ]),
    ];

    const target = buildFoundationPracticeTarget(
      {
        records: [],
        plan: unfocusedPlan({ has_recent_history: true }),
        library,
        random: sequenceRandom(Array.from({ length: 20 }, () => 0)),
      },
      "home-row",
    );

    expect(target.text.length).toBeLessThanOrEqual(190);
    expect(target.text.split("\n").length).toBeGreaterThanOrEqual(2);
  });

  test("standalone foundation target keeps compact key drills substantial enough", () => {
    const library = testLibrary();
    library.foundation_drills = [
      foundationDrill("left-hand", [
        "asdf qwer zxcv",
        "aqz swx dec frv",
        "asdf aqz asdf aqz",
        "qwer zxcv qwer zxcv",
        "fast craft scarf",
        "adze craze fade",
      ]),
    ];

    const target = buildFoundationPracticeTarget(
      {
        records: [],
        plan: unfocusedPlan({ has_recent_history: false }),
        library,
        random: sequenceRandom(Array.from({ length: 20 }, () => 0)),
      },
      "left-hand",
    );

    expect(target.text.split("\n").length).toBeGreaterThanOrEqual(4);
    expect(target.text.length).toBeLessThanOrEqual(150);
  });

  test("standalone foundation target avoids recently practiced selected-drill lines", () => {
    const target = buildFoundationPracticeTarget(
      {
        records: [
          defaultSessionRecord({
            source: "keyloop:module:foundation-mix:top-row",
            target_text: "top row line 1\ntop row line 2",
          }),
        ],
        plan: unfocusedPlan({ has_recent_history: true }),
        library: foundationDrillLibrary(),
        random: sequenceRandom(Array.from({ length: 20 }, () => 0.999)),
      },
      "top-row",
    );
    const lines = target.text.split("\n");

    expect(lines).not.toContain("top row line 1");
    expect(lines).not.toContain("top row line 2");
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((line) => line.startsWith("top row line"))).toBe(true);
  });

  test("daily plan reduces stable non-code module frequency", () => {
    const daily = buildDailyPracticePlan({
      records: stableModuleRecords("foundation_input", "foundation_mix"),
      plan: unfocusedPlan(),
      library: testLibrary(),
    });

    expect(daily.lessons.map((lesson) => lesson.module)).toEqual([
      "everyday_english",
      "programming_basics",
      "code_practice",
    ]);
    expect(daily.lessons).not.toContainEqual(
      expect.objectContaining({ module: "foundation_input" }),
    );
  });

  test("daily plan keeps weak foundation as one short review group", () => {
    const daily = buildDailyPracticePlan({
      records: weakModuleRecords("foundation_input", "foundation_mix"),
      plan: unfocusedPlan({ focus_keys: ["j", ";"] }),
      library: testLibrary(),
    });

    const foundation = daily.lessons.filter(
      (lesson) => lesson.module === "foundation_input",
    );

    expect(foundation).toHaveLength(1);
    expect(foundation[0]?.estimated_minutes).toBeLessThanOrEqual(4);
    expect(foundation[0]?.reason_zh).toContain("短复习");
  });

  test("daily plan shortens stable code practice instead of skipping it", () => {
    const daily = buildDailyPracticePlan({
      records: stableModuleRecords("code_practice", "code_mix"),
      plan: unfocusedPlan(),
      library: testLibrary(),
    });

    const code = daily.lessons.find((lesson) => lesson.module === "code_practice");

    expect(code).toBeDefined();
    expect(code?.estimated_minutes).toBe(3);
    expect(code?.reason_zh).toContain("已稳定");
  });

  test("daily plan falls back to four modules when stable filtering would leave fewer than three", () => {
    const daily = buildDailyPracticePlan({
      records: [
        ...stableModuleRecords("foundation_input", "foundation_mix"),
        ...stableModuleRecords("everyday_english", "everyday_mix"),
      ],
      plan: unfocusedPlan(),
      library: testLibrary(),
    });

    expect(daily.lessons.map((lesson) => lesson.module)).toEqual([
      "foundation_input",
      "everyday_english",
      "programming_basics",
      "code_practice",
    ]);
  });






  test("daily code practice follows strong recent code performance with hard snippets", () => {
    const library = testLibrary();
    library.code_snippets = [
      ...easyCodeSnippets(),
      ...hardCodeSnippets(),
    ];

    const daily = buildDailyPracticePlan({
      records: strongCodeRecords(),
      plan: unfocusedPlan(),
      library,
    });
    const code = daily.lessons.find((lesson) => lesson.module === "code_practice");

    expect(code?.target.text).toContain("hardAlpha");
    expect(code?.target.text).not.toContain("easyAlpha");
  });

  test("daily code practice follows weak recent code performance with easy snippets", () => {
    const library = testLibrary();
    library.code_snippets = [
      ...hardCodeSnippets(),
      ...easyCodeSnippets(),
    ];

    const daily = buildDailyPracticePlan({
      records: weakCodeRecords(),
      plan: unfocusedPlan(),
      library,
    });
    const code = daily.lessons.find((lesson) => lesson.module === "code_practice");

    expect(code?.target.text).toContain("easyAlpha");
    expect(code?.target.text).not.toContain("hardAlpha");
  });

  test("daily code practice uses snippet picker focus ordering", () => {
    const library = testLibrary();
    library.code_snippets = [
      {
        language: "typescript",
        framework: "react",
        project: "test",
        level: "function",
        source: "fallback",
        text: "function fallbackValue() {\n  return fallback;\n}",
      },
      {
        language: "typescript",
        framework: "react",
        project: "test",
        level: "function",
        source: "selected",
        text: "function selectedValue() {\n  return selected;\n}",
      },
    ];

    const daily = buildDailyPracticePlan({
      records: [],
      plan: testPlan(),
      library,
    });
    const code = daily.lessons.find((lesson) => lesson.module === "code_practice");

    expect(code?.target.text.startsWith("function selectedValue")).toBe(true);
  });

  test("daily code practice honors code filter config", () => {
    const library = testLibrary();
    library.code_snippets = [
      {
        language: "typescript",
        framework: "react",
        project: "web",
        level: "function",
        source: "typescript",
        text: "function selectedValue() {\n  return selected;\n}",
      },
      {
        language: "solidity",
        framework: "foundry",
        project: "contracts",
        level: "function",
        source: "solidity",
        text: "function selectedOwner() public {\n  return owner;\n}",
      },
    ];

    const daily = buildDailyPracticePlan({
      records: [],
      plan: testPlan(),
      library,
      codeConfig: {
        language: "solidity",
        languages: [],
        frameworks: [],
        projects: [],
        match_any: false,
      },
    });
    const code = daily.lessons.find((lesson) => lesson.module === "code_practice");

    expect(code?.target.text).toContain("selectedOwner");
    expect(code?.target.text).not.toContain("selectedValue");
  });

  test("daily code practice can prefer local repo snippets", () => {
    const daily = buildDailyPracticePlan({
      records: [],
      plan: testPlan(),
      library: testLibrary(),
      localCodeSnippets: localCodeSnippets(1),
    });
    const code = daily.lessons.find((lesson) => lesson.module === "code_practice");

    expect(code?.target.text).toContain("localSelected1");
    expect(code?.target.text).toContain("selectedValue");
  });

  test("daily code practice limits repo-backed plans to three snippets", () => {
    const daily = buildDailyPracticePlan({
      records: [],
      plan: testPlan(),
      library: testLibrary(),
      localCodeSnippets: localCodeSnippets(4),
    });
    const code = daily.lessons.find((lesson) => lesson.module === "code_practice");

    expect(code?.target.text.split("\n\n")).toHaveLength(3);
  });

  test("daily code practice source labels built-in repo and fallback origins", () => {
    const builtInOnly = buildDailyPracticePlan({
      records: [],
      plan: testPlan(),
      library: testLibrary(),
    }).lessons.find((lesson) => lesson.module === "code_practice");
    expect(builtInOnly?.target.source).toBe("keyloop:code-corpus");

    const repoOnly = buildDailyPracticePlan({
      records: [],
      plan: testPlan(),
      library: testLibrary(),
      localCodeSource: "/tmp/project",
      localCodeSnippets: localCodeSnippets(3),
    }).lessons.find((lesson) => lesson.module === "code_practice");
    expect(repoOnly?.target.source).toBe("/tmp/project");
    const repoBlocks = repoOnly?.target.code_blocks ?? [];
    expect(repoBlocks.map((block) => block.start_line)).toEqual([0, 4, 8]);
    expect(repoBlocks.map((block) => block.line_count)).toEqual([3, 3, 3]);
    expect(repoBlocks.every((block) => block.language === "typescript")).toBe(true);
    expect(repoBlocks.every((block) => block.framework === "local")).toBe(true);
    expect(repoBlocks.every((block) => block.project === "local-repo")).toBe(true);
    expect(repoBlocks.map((block) => block.source).sort()).toEqual([
      "src/local1.ts:1",
      "src/local2.ts:1",
      "src/local3.ts:1",
    ]);

    const repoPlusFallback = buildDailyPracticePlan({
      records: [],
      plan: testPlan(),
      library: testLibrary(),
      localCodeSource: "/tmp/project",
      localCodeSnippets: localCodeSnippets(1),
    }).lessons.find((lesson) => lesson.module === "code_practice");
    expect(repoPlusFallback?.target.source).toBe("/tmp/project + keyloop:fallback-code");
  });

  test("code specialist target respects level filters and source labels", () => {
    const target = buildCodeSpecialistPracticeTarget(
      {
        records: [],
        plan: unfocusedPlan(),
        library: codeSpecialistLibrary(),
        codeConfig: {
          languages: ["rust"],
          frameworks: [],
          projects: [],
          level: "function",
          match_any: true,
        },
      },
      2,
    );

    expect(target.mode).toBe("code");
    expect(target.source).toBe("keyloop:code-specialist:level=function+lang=rust:2");
    const snippets = target.text.split("\n\n");
    expect(snippets).toHaveLength(2);
    expect(snippets.every((snippet) => snippet.startsWith("fn selected_"))).toBe(true);
    const specialistBlocks = target.code_blocks ?? [];
    expect(specialistBlocks.map((block) => block.start_line)).toEqual([0, 4]);
    expect(specialistBlocks.map((block) => block.line_count)).toEqual([3, 3]);
    expect(specialistBlocks.every((block) => block.language === "rust")).toBe(true);
    expect(specialistBlocks.every((block) => block.framework === "std")).toBe(true);
    expect(specialistBlocks.every((block) => block.project === "cli")).toBe(true);
    expect(target.text).not.toContain("const selectedValue");
    expect(target.text).not.toContain("struct SelectedFile");
  });

  test("code specialist target avoids recently practiced snippets", () => {
    const usedText = "fn selected_owner() {\n  return owner;\n}";
    const target = buildCodeSpecialistPracticeTarget(
      {
        records: [
          defaultSessionRecord({
            mode: "code",
            target_text: usedText,
          }),
        ],
        plan: unfocusedPlan(),
        library: codeSpecialistLibrary(),
        codeConfig: {
          languages: ["rust"],
          frameworks: [],
          projects: [],
          level: "function",
          match_any: true,
        },
      },
      2,
    );

    expect(target.text).not.toContain(usedText);
    expect(target.text).toContain("fn selected_registry");
    expect(target.text).toContain("fn selected_release");
  });

  test("code specialist target avoids recently practiced formatted snippets", () => {
    const library = testLibrary();
    library.code_snippets = [
      {
        language: "javascript",
        framework: "none",
        project: "test",
        level: "block",
        source: "js-used",
        text: 'if (used) { return "used"; }',
      },
      {
        language: "javascript",
        framework: "none",
        project: "test",
        level: "block",
        source: "js-fresh",
        text: 'if (fresh) { return "fresh"; }',
      },
    ];

    const target = buildCodeSpecialistPracticeTarget(
      {
        records: [
          defaultSessionRecord({
            mode: "code",
            target_text: 'if (used) {\n  return "used";\n}',
          }),
        ],
        plan: unfocusedPlan(),
        library,
        codeConfig: {
          languages: ["javascript"],
          frameworks: [],
          projects: [],
          level: "block",
          match_any: true,
          difficulty: "all",
        },
        random: sequenceRandom([0.99]),
      },
      1,
    );

    expect(target.text).toBe('if (fresh) {\n  return "fresh";\n}');
  });

  test("code specialist fallback keeps excluding recently practiced snippets", () => {
    const library = testLibrary();
    library.code_snippets = [
      {
        language: "javascript",
        framework: "none",
        project: "test",
        level: "block",
        difficulty: "easy",
        source: "js-used-easy",
        text: 'if (used) { return "used"; }',
      },
      {
        language: "javascript",
        framework: "none",
        project: "test",
        level: "block",
        difficulty: "medium",
        source: "js-fresh-medium",
        text: 'if (fresh) { return "fresh"; }',
      },
    ];

    const target = buildCodeSpecialistPracticeTarget(
      {
        records: [
          defaultSessionRecord({
            mode: "code",
            target_text: 'if (used) {\n  return "used";\n}',
          }),
        ],
        plan: unfocusedPlan(),
        library,
        codeConfig: {
          languages: ["javascript"],
          frameworks: [],
          projects: [],
          level: "block",
          match_any: true,
          difficulty: "easy",
        },
        random: sequenceRandom([0.99]),
      },
      1,
    );

    expect(target.text).toBe('if (fresh) {\n  return "fresh";\n}');
  });

  test("code mix target avoids recently practiced snippets", () => {
    const usedText = "fn selected_owner() {\n  return owner;\n}";
    const target = buildCodeMixPracticeTarget({
      records: [
        defaultSessionRecord({
          mode: "code",
          target_text: usedText,
        }),
      ],
      plan: unfocusedPlan(),
      library: codeSpecialistLibrary(),
      codeConfig: {
        languages: [],
        frameworks: [],
        projects: [],
        match_any: true,
      },
    });

    expect(target.text).not.toContain(usedText);
    expect(target.text.length).toBeGreaterThan(0);
  });

  test("code practice targets apply configured runtime code style", () => {
    const library = testLibrary();
    library.code_snippets = [
      {
        language: "javascript",
        framework: "express",
        project: "expressjs/express",
        level: "block",
        source: "js-block-style",
        text: 'if (val === true) {\n    return function(){ return "ok" };\n  }',
      },
    ];

    const target = buildCodeSpecialistPracticeTarget(
      {
        records: [],
        plan: unfocusedPlan(),
        library,
        codeConfig: {
          languages: ["javascript"],
          frameworks: [],
          projects: [],
          level: "block",
          match_any: true,
        },
        codeStyle: {
          formatter: "prettier",
          indent_style: "space",
          indent_width: 4,
          semicolons: "never",
          quotes: "single",
          trailing_commas: "none",
        },
      },
      1,
    );

    expect(target.text).toBe(
      "if (val === true) {\n    return function () {\n        return 'ok'\n    }\n}",
    );
    expect(target.code_blocks?.[0]?.line_count).toBe(5);
  });
});

function testPlan(): PracticePlan {
  return {
    focus_words: ["selected", "pending", "performance", "selected"],
    focus_symbols: ["=>", "!=="],
    focus_code: ["selected"],
    focus_keys: [";"],
    advice: [],
    recommended_mode: "mixed",
    has_recent_history: true,
  };
}

function unfocusedPlan(overrides: Partial<PracticePlan> = {}): PracticePlan {
  return {
    ...testPlan(),
    focus_words: [],
    focus_symbols: [],
    focus_code: [],
    focus_keys: [],
    ...overrides,
  };
}

function stableModuleRecords(
  module: TrainingModule,
  category: TrainingCategory,
  startedAt = new Date().toISOString(),
): SessionRecord[] {
  return Array.from({ length: 3 }, () =>
    defaultSessionRecord({
      module,
      category,
      typed_len: 120,
      target_len: 120,
      correct_chars: 118,
      accuracy: 98.5,
      error_count: 1,
      backspace_count: 1,
      completion_state: "completed",
      started_at: startedAt,
    }),
  );
}

function weakModuleRecords(
  module: TrainingModule,
  category: TrainingCategory,
): SessionRecord[] {
  return [
    defaultSessionRecord({
      module,
      category,
      typed_len: 100,
      target_len: 100,
      correct_chars: 84,
      accuracy: 84,
      error_count: 16,
      backspace_count: 18,
      completion_state: "completed",
      started_at: new Date().toISOString(),
    }),
  ];
}

function strongCodeRecords(): SessionRecord[] {
  return [
    defaultSessionRecord({
      mode: "code",
      typed_len: 240,
      target_len: 240,
      accuracy: 98,
      wpm: 28,
      error_count: 2,
      duration_ms: 120_000,
    }),
  ];
}

function weakCodeRecords(): SessionRecord[] {
  return [
    defaultSessionRecord({
      mode: "code",
      typed_len: 100,
      target_len: 120,
      accuracy: 88,
      wpm: 8,
      error_count: 20,
      duration_ms: 120_000,
    }),
  ];
}

function localCodeSnippets(count: number): CodeSnippet[] {
  return Array.from({ length: count }, (_, index): CodeSnippet => ({
    text: `function localSelected${index + 1}() {\n  return selected;\n}`,
    source: `src/local${index + 1}.ts:1`,
    difficulty: "medium",
    score: 20 + index,
    language: "typescript",
    framework: "local",
    project: "local-repo",
    level: "function",
  }));
}

function foundationDrillLibrary(): ContentLibrary {
  const library = testLibrary();
  library.warmup = ["warmup left", "warmup right"];
  library.foundation_drills = [
    foundationDrill("home-row", numberedLines("home row line", 10)),
    foundationDrill("top-row", numberedLines("top row line", 10)),
    foundationDrill("bottom-row", numberedLines("bottom row line", 10)),
    foundationDrill("index-fingers", numberedLines("index finger line", 10)),
    foundationDrill("pinky-fingers", numberedLines("pinky finger line", 10)),
    foundationDrill("punctuation-edges", numberedLines("punctuation line", 10)),
  ];
  return library;
}

function foundationDrill(id: string, items: string[]): ContentLibrary["foundation_drills"][number] {
  return {
    id,
    title_zh: id,
    title_en: id,
    hint_zh: id,
    hint_en: id,
    items,
  };
}

function numberedLines(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}`);
}

function sequenceRandom(values: number[]): () => number {
  let index = 0;
  return () => values[index++] ?? 0.5;
}

function easyCodeSnippets(): BuiltinCodeSnippet[] {
  return ["Alpha", "Beta", "Gamma", "Delta"].map((name) => ({
    language: "typescript",
    framework: "react",
    project: "test",
    level: "function",
    source: `easy-${name}`,
    text: `return easy${name};`,
  }));
}

function hardCodeSnippets(): BuiltinCodeSnippet[] {
  return ["Alpha", "Beta", "Gamma", "Delta"].map((name) => ({
    language: "typescript",
    framework: "react",
    project: "test",
    level: "function",
    source: `hard-${name}`,
    text: [
      `function hard${name}(records: Array<{ id: string; enabled: boolean }>) {`,
      `  const visible = records.filter((record) => record.enabled && record.id !== "archived");`,
      `  return visible.map((record) => \`\${record.id}:\${record.enabled}\`).join(",");`,
      `}`,
    ].join("\n"),
  }));
}

function codeSpecialistLibrary(): ContentLibrary {
  const library = testLibrary();
  library.code_snippets = [
    {
      language: "rust",
      framework: "std",
      project: "cli",
      level: "function",
      source: "rust-function-owner",
      text: "fn selected_owner() {\n  return owner;\n}",
    },
    {
      language: "rust",
      framework: "std",
      project: "cli",
      level: "function",
      source: "rust-function-registry",
      text: "fn selected_registry() {\n  return registry;\n}",
    },
    {
      language: "rust",
      framework: "std",
      project: "cli",
      level: "function",
      source: "rust-function-release",
      text: "fn selected_release() {\n  return release;\n}",
    },
    {
      language: "typescript",
      framework: "react",
      project: "web",
      level: "function",
      source: "ts-function",
      text: "function selectedValue() {\n  return selected;\n}",
    },
    {
      language: "rust",
      framework: "std",
      project: "cli",
      level: "file",
      source: "rust-file",
      text: "struct SelectedFile {\n  owner: String,\n}",
    },
    {
      language: "rust",
      framework: "std",
      project: "cli",
      level: "block",
      source: "rust-block",
      text: "const selectedValue = owner;\nreturn selectedValue;",
    },
  ];
  return library;
}

function testLibrary(): ContentLibrary {
  return {
    warmup: ["asdf jkl;", "fdsa ;lkj", "a;sldkfj", "jkl; asdf"],
    foundation_drills: [
      {
        id: "punctuation-edges",
        title_zh: "标点边界",
        title_en: "Punctuation edges",
        hint_zh: "",
        hint_en: "",
        items: ["; ; ;", "[ ] { }", "- = _ +", "/ ? . ,", "' \" `"],
      },
    ],
    word_chunks: ["per form ance", "select ed pending"],
    common_words: ["today", "review", "support", "practice"],
    everyday_english: {
      sources: [],
      entries: [
        {
          text: "today",
          kind: "word",
          tier: 1,
          length: null,
          domain: "everyday",
          source_id: "test",
        },
        {
          text: "stand up",
          kind: "phrase",
          tier: 1,
          length: null,
          domain: "everyday",
          source_id: "test",
        },
        {
          text: "check in",
          kind: "phrase",
          tier: 1,
          length: null,
          domain: "workplace",
          source_id: "test",
        },
        {
          text: "Short daily sentence.",
          kind: "sentence",
          tier: 1,
          length: "short",
          domain: "everyday",
          source_id: "test",
        },
        {
          text: "This is a much longer workplace sentence.",
          kind: "sentence",
          tier: 2,
          length: "long",
          domain: "workplace",
          source_id: "test",
        },
      ],
    },
    everyday_words: {
      sources: [],
      entries: [],
    },
    everyday_sentences: {
      sources: [],
      entries: [],
    },
    everyday_articles: {
      sources: [],
      entries: [],
    },
    everyday_word_decomposition: {
      sources: [],
      entries: [],
    },
    programming_words: [
      "enabled",
      "visible",
      "archived",
      "configuration",
      "initialization",
      "authorization",
      "authentication",
      "compatibility",
      "serialization",
      "synchronization",
      "subscription",
      "preference",
      "receipt",
      "variant",
      "registry",
      "release",
    ].map((word) => ({ word, note_zh: "" })),
    code_snippets: [
      {
        language: "typescript",
        framework: "react",
        project: "test",
        level: "function",
        source: "test",
        text: "function selectedValue() {\n  return selected;\n}",
      },
    ],
    long_words: [
      {
        word: "internationalization",
        parts: ["international", "ization"],
        aliases: ["i18n"],
        domain: "programming",
        tier: 3,
        source_id: "test",
      },
    ],
  };
}

function dailySettings(
  overrides: Partial<EverydayEnglishSettings> = {},
): EverydayEnglishSettings {
  return {
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
    ...overrides,
  };
}

function dailyWord(
  word: string,
  rank: number,
  range: ContentLibrary["everyday_words"]["entries"][number]["range"],
  level: ContentLibrary["everyday_words"]["entries"][number]["level"],
  translation: string,
): ContentLibrary["everyday_words"]["entries"][number] {
  return {
    word,
    rank,
    range,
    level,
    translation_zh: translation,
    source_id: "test",
  };
}

function dailySentence(
  text: string,
  translation: string,
  level: ContentLibrary["everyday_sentences"]["entries"][number]["level"],
  length: ContentLibrary["everyday_sentences"]["entries"][number]["length"],
): ContentLibrary["everyday_sentences"]["entries"][number] {
  return {
    text,
    translation_zh: translation,
    level,
    length,
    source_id: "test",
    source_title: "Test sentences",
  };
}

function dailyArticle(
  title: string,
  level: ContentLibrary["everyday_articles"]["entries"][number]["level"],
  length: ContentLibrary["everyday_articles"]["entries"][number]["length"],
  paragraphs: Array<[string, string]>,
): ContentLibrary["everyday_articles"]["entries"][number] {
  return {
    title,
    level,
    length,
    source_id: "test",
    paragraphs: paragraphs.map(([text, translation_zh]) => ({ text, translation_zh })),
  };
}
