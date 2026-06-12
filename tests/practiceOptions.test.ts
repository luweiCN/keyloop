import { describe, expect, test } from "bun:test";

import {
  everydayPracticeOptionItems,
  nextEverydaySettingsForControl,
  practiceOptionControlForIndex,
  practiceOptionsStateForContext,
  wordBreakdownRepeatControls,
} from "../src/ui/opentui/practiceOptions";
import type { EverydayEnglishSettings } from "../src/index";
import type { StartRunnerContext } from "../src/cli";

describe("practice option controls", () => {
  test("long-word repeat controls cover one through ten", () => {
    expect([...wordBreakdownRepeatControls]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test("everyday word options include repeat count from one through ten", () => {
    const settings = dailySettings({ word_repeats: 1 });

    expect(everydayPracticeOptionItems("everyday_words", settings, "zh")).toEqual([
      { id: "everyday_word_range", label: "词库范围", value: "常用 1000" },
      { id: "everyday_word_count", label: "每组单词", value: "20" },
      { id: "everyday_word_repeats", label: "单词重复", value: "1" },
    ]);
    expect(nextEverydaySettingsForControl(settings, "word_repeats", 1).word_repeats).toBe(2);
    expect(
      nextEverydaySettingsForControl(
        dailySettings({ word_repeats: 10 }),
        "word_repeats",
        1,
      ).word_repeats,
    ).toBe(1);
  });

  test("programming terms use whole-word repeat live options", () => {
    const context = {
      dailyPlan: { run_id: "" },
      sourceItem: "programming_terms",
      language: "en",
      targetContext: {
        programmingTermsSettings: {
          word_repeats: 4,
        },
      },
    } as StartRunnerContext;

    expect(practiceOptionsStateForContext(context, 0, "en").items).toEqual([
      { id: "programming_terms_word_repeats", label: "Word repeats", value: "4" },
    ]);
    expect(practiceOptionControlForIndex(context, 0)).toEqual({
      domain: "programming_terms",
      control: "word_repeats",
    });
  });
});

function dailySettings(
  overrides: Partial<EverydayEnglishSettings> = {},
): EverydayEnglishSettings {
  return {
    word_range: "1000",
    word_count: 20,
    word_repeats: 1,
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
