import { describe, expect, test } from "bun:test";

import type { ContentLibrary } from "../src/content/library";
import type { CustomLibrary } from "../src/training/customLibrary";
import { formForCategory } from "../src/training/diagnosis";
import type { SkillProfile } from "../src/training/diagnosis";
import { estimatedMinutesFromChars } from "../src/training/prescription";
import {
  buildDailyPracticePlan,
  buildEverydayMixStageTarget,
  buildProgrammingBasicsMixStageTarget,
  buildStageTarget,
  refreshModuleMixTarget,
  type BuildTargetContext,
} from "../src/training/targets";

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

function emptyProfile(overrides: Partial<SkillProfile["focus"]> = {}): SkillProfile {
  return {
    dimensions: [],
    form_speeds: [],
    focus: { words: [], sentences: [], code: [], chars: [], ...overrides },
    daily_active_minutes_7d: 0,
    generated_at: "2026-06-13T08:00:00Z",
  };
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

describe("buildStageTarget words", () => {
  test("budget scales word count", () => {
    const small = buildStageTarget(stageContext(), {
      stage: { form: "words", char_budget: 45 },
      profile: emptyProfile(),
    });
    // 45/7 ≈ 6 词（下限 6）
    expect(small.text.split(" ")).toHaveLength(6);
  });

  test("focus words flow back into words stage", () => {
    const target = buildStageTarget(stageContext(), {
      stage: { form: "words", char_budget: 45 },
      profile: emptyProfile({ words: ["algorithm"] }),
    });
    expect(target.text).toContain("algorithm");
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
    // 80/40 = 2 句
    expect(target.text.split("\n")).toHaveLength(2);
  });

  test("focus sentences flow back first", () => {
    const target = buildStageTarget(stageContext(), {
      stage: { form: "sentences", char_budget: 80 },
      profile: emptyProfile({ sentences: ["We watched a movie tonight."] }),
    });
    expect(target.text).toContain("We watched a movie tonight.");
  });

  test("custom library sentences join the pool", () => {
    const target = buildStageTarget(stageContext(), {
      stage: { form: "sentences", char_budget: 400 },
      profile: emptyProfile(),
      customLibraries: [customLibraryFixture()],
    });
    expect(target.text).toContain("My custom sentence here.");
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
      focus: { words: [], sentences: [], code: [], chars: [] },
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

  test("capitalization weak prioritizes uppercase-containing words", () => {
    const stage = { form: "words" as const, char_budget: 21 }; // count ≈ 3
    const weak = buildStageTarget(stageContext(), {
      stage,
      profile: profileWithWeak("capitalization"),
      customLibraries: [camelLib],
    });
    const normal = buildStageTarget(stageContext(), {
      stage,
      profile: emptyProfile(),
      customLibraries: [camelLib],
    });
    const countUpper = (text: string) =>
      text.split(" ").filter((w) => /[A-Z]/u.test(w)).length;
    // 弱项时 3 个驼峰词被排到最前，全部入选
    expect(countUpper(weak.text)).toBe(3);
    // 非弱项（纯随机）通常不会把 3 个驼峰词都排到前 3
    expect(countUpper(normal.text)).toBeLessThan(3);
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
