import { describe, expect, test } from "bun:test";

import {
  everydayPracticeOptionItems,
  nextEverydaySettingsForControl,
  nextWordAudioSettingsForControl,
  practiceOptionControlForIndex,
  practiceOptionsStateForContext,
  wordBreakdownRepeatControls,
} from "../src/ui/opentui/practiceOptions";
import { defaultCodePracticeConfig, type EverydayEnglishSettings } from "../src/index";
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
      { id: "word_audio_enabled", label: "发音", value: "关" },
      { id: "word_audio_volume", label: "音量", value: "100%" },
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
      { id: "word_audio_enabled", label: "Pronunciation", value: "off" },
      { id: "word_audio_volume", label: "Volume", value: "100%" },
    ]);
    expect(practiceOptionControlForIndex(context, 0)).toEqual({
      domain: "programming_terms",
      control: "word_repeats",
    });
    expect(practiceOptionControlForIndex(context, 1)).toEqual({
      domain: "word_audio",
      control: "enabled",
    });
    expect(practiceOptionControlForIndex(context, 2)).toEqual({
      domain: "word_audio",
      control: "volume_percent",
    });
  });

  test("technical long words and custom library words expose pronunciation options", () => {
    const technicalContext = {
      dailyPlan: { run_id: "" },
      sourceItem: "technical_long_words",
      language: "zh",
      targetContext: {
        wordBreakdownSettings: {
          enabled_in_comprehensive: true,
          max_items_per_group: 6,
          word_repeats: 2,
        },
      },
    } as StartRunnerContext;
    expect(practiceOptionsStateForContext(technicalContext, 1, "zh").items).toEqual([
      { id: "word_breakdown_word_repeats", label: "完整词重复", value: "2" },
      { id: "word_audio_enabled", label: "发音", value: "关" },
      { id: "word_audio_volume", label: "音量", value: "100%" },
    ]);
    expect(practiceOptionControlForIndex(technicalContext, 1)).toEqual({
      domain: "word_audio",
      control: "enabled",
    });
    expect(practiceOptionControlForIndex(technicalContext, 2)).toEqual({
      domain: "word_audio",
      control: "volume_percent",
    });

    const libraryContext: StartRunnerContext = {
      dailyPlan: {
        run_id: "",
        run_number: 0,
        target_minutes: 0,
        completed_ms: 0,
        lessons: [],
      },
      records: [],
      sourceItem: "library_kind_kaoyan:words",
      language: "en",
      dataDir: "/tmp/keyloop",
      codeConfig: defaultCodePracticeConfig(),
      customLibrarySettings: {
        word_repeats: 3,
      },
      wordAudioSettings: {
        enabled: true,
        volume_percent: 70,
      },
    };
    expect(practiceOptionsStateForContext(libraryContext, 1, "en").items).toEqual([
      { id: "custom_library_word_repeats", label: "Word repeats", value: "3" },
      { id: "word_audio_enabled", label: "Pronunciation", value: "on" },
      { id: "word_audio_volume", label: "Volume", value: "70%" },
    ]);
    expect(practiceOptionControlForIndex(libraryContext, 0)).toEqual({
      domain: "custom_library",
      control: "word_repeats",
    });
    expect(practiceOptionControlForIndex(libraryContext, 1)).toEqual({
      domain: "word_audio",
      control: "enabled",
    });
    expect(practiceOptionControlForIndex(libraryContext, 2)).toEqual({
      domain: "word_audio",
      control: "volume_percent",
    });
  });

  test("word audio volume cycles through global volume steps", () => {
    expect(
      nextWordAudioSettingsForControl(
        { enabled: true, volume_percent: 100 },
        "volume_percent",
        1,
      ).volume_percent,
    ).toBe(0);
    expect(
      nextWordAudioSettingsForControl(
        { enabled: true, volume_percent: 0 },
        "volume_percent",
        -1,
      ).volume_percent,
    ).toBe(100);
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
