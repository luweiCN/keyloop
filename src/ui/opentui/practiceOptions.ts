import type {
  CodePracticeConfig,
  EverydayEnglishSettings,
  UserPreferences,
} from "../../domain/model";
import type { StartRunnerContext } from "../../cli";
import type { OpenTuiMenuItemId, OpenTuiPracticeOptionsState } from "./appModel";
import {
  cloneCodeConfig,
  isLiveCustomLibraryWordOptionsEnabled,
  isLiveCodeSettingsEnabled,
  isLiveEverydayOptionsEnabled,
  isLiveWordBreakdownOptionsEnabled,
} from "./runnerSelection";
import {
  codeDifficultyLabel,
  codeLengthLabel,
  everydayLengthLabel,
  everydayLevelLabel,
  everydayWordRangeLabel,
} from "./labels";

export const codeDifficultyControls = ["adaptive", "all", "easy", "medium", "hard"] as const;

export const codeLengthControls = ["adaptive", "short", "medium", "long"] as const;

export const everydayWordRangeControls = ["200", "1000", "5000", "10000"] as const;

export const everydayWordCountControls = [10, 20, 30, 50] as const;

export const everydayLevelControls = [
  "high_school",
  "cet4",
  "cet6",
  "postgraduate",
  "toefl_ielts",
] as const;

export const everydayLengthControls = ["short", "medium", "long", "mixed"] as const;

export const everydaySentenceCountControls = [3, 5, 8, 10] as const;

export const everydayRepeatControls = [1, 3, 5] as const;

export const wordBreakdownRepeatControls = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export type LiveCodeControl = "difficulty" | "length" | "refresh";

export type LiveEverydayControl =
  | "word_range"
  | "word_count"
  | "word_repeats"
  | "sentence_level"
  | "sentence_length"
  | "sentence_count"
  | "article_level"
  | "article_length"
  | "decomposition_level"
  | "decomposition_word_count"
  | "decomposition_part_repeats"
  | "decomposition_word_repeats";

export type LiveWordBreakdownControl = "word_repeats";
export type LiveProgrammingTermsControl = "word_repeats";
export type LiveCustomLibraryControl = "word_repeats";
export type LiveWordAudioControl = "enabled";

export type PracticeOptionControl =
  | { domain: "code"; control: LiveCodeControl }
  | { domain: "everyday"; control: LiveEverydayControl }
  | { domain: "word_breakdown"; control: LiveWordBreakdownControl }
  | { domain: "programming_terms"; control: LiveProgrammingTermsControl }
  | { domain: "custom_library"; control: LiveCustomLibraryControl }
  | { domain: "word_audio"; control: LiveWordAudioControl };

export type PostCompletionAction =
  | "continue"
  | "repeat"
  | "stop"
  | "return"
  | "code_options"
  | "code_difficulty"
  | "code_length"
  | "code_refresh";

export function postCompletionActionForCodeControl(control: LiveCodeControl): PostCompletionAction {
  switch (control) {
    case "difficulty":
      return "code_difficulty";
    case "length":
      return "code_length";
    case "refresh":
      return "code_refresh";
  }
}

export function codeControlFromPostCompletionAction(
  action: PostCompletionAction,
): LiveCodeControl | undefined {
  switch (action) {
    case "code_difficulty":
      return "difficulty";
    case "code_length":
      return "length";
    case "code_refresh":
      return "refresh";
    default:
      return undefined;
  }
}





export function nextCodeConfigForControl(
  config: CodePracticeConfig,
  control: LiveCodeControl,
  direction: -1 | 1 = 1,
): CodePracticeConfig {
  const next = cloneCodeConfig(config);
  switch (control) {
    case "difficulty":
      next.difficulty = cycleCodeOption(
        codeDifficultyControls,
        next.difficulty ?? "adaptive",
        direction,
      );
      return next;
    case "length": {
      const nextLength = cycleCodeOption(codeLengthControls, next.size ?? "adaptive", direction);
      if (nextLength === "adaptive") {
        delete next.size;
      } else {
        next.size = nextLength;
      }
      return next;
    }
    case "refresh":
      return next;
  }
}

export function practiceOptionsStateForContext(
  context: StartRunnerContext,
  selectedIndex: number,
  language: StartRunnerContext["language"],
): OpenTuiPracticeOptionsState {
  const items = isLiveCodeSettingsEnabled(context)
    ? codePracticeOptionItems(context.codeConfig, language)
    : isLiveCustomLibraryWordOptionsEnabled(context)
      ? customLibraryPracticeOptionItems(
          customLibrarySettingsForContext(context),
          wordAudioSettingsForContext(context),
          language,
        )
    : isLiveWordBreakdownOptionsEnabled(context)
      ? context.sourceItem === "programming_terms"
        ? programmingTermsPracticeOptionItems(
            programmingTermsSettingsForContext(context),
            language,
            wordAudioSettingsForContext(context),
          )
        : wordBreakdownPracticeOptionItems(
            wordBreakdownSettingsForContext(context),
            language,
            wordAudioSettingsForContext(context),
          )
      : everydayPracticeOptionItems(
          context.sourceItem,
          everydaySettingsForContext(context),
          language,
          wordAudioSettingsForContext(context),
        );
  return {
    selected_index: Math.min(Math.max(selectedIndex, 0), items.length - 1),
    items,
  };
}

export function codePracticeOptionItems(
  config: CodePracticeConfig,
  language: StartRunnerContext["language"],
): OpenTuiPracticeOptionsState["items"] {
  return [
    {
      id: "code_difficulty",
      label: language === "zh" ? "难度" : "Difficulty",
      value: codeDifficultyLabel(config.difficulty ?? "adaptive", language),
    },
    {
      id: "code_length",
      label: language === "zh" ? "长度" : "Length",
      value: codeLengthLabel(config.size ?? "adaptive", language),
    },
  ];
}

export function everydayPracticeOptionItems(
  sourceItem: OpenTuiMenuItemId | undefined,
  settings: EverydayEnglishSettings,
  language: StartRunnerContext["language"],
  wordAudio: UserPreferences["word_audio"] = { enabled: false },
): OpenTuiPracticeOptionsState["items"] {
  switch (sourceItem) {
    case "everyday_words":
      return [
        {
          id: "everyday_word_range",
          label: language === "zh" ? "词库范围" : "Word range",
          value: everydayWordRangeLabel(settings.word_range, language),
        },
        {
          id: "everyday_word_count",
          label: language === "zh" ? "每组单词" : "Words per group",
          value: String(settings.word_count),
        },
        {
          id: "everyday_word_repeats",
          label: language === "zh" ? "单词重复" : "Word repeats",
          value: String(settings.word_repeats),
        },
        wordAudioPracticeOptionItem(wordAudio, language),
      ];
    case "everyday_sentences":
      return [
        {
          id: "everyday_sentence_level",
          label: language === "zh" ? "词汇量" : "Vocabulary",
          value: everydayLevelLabel(settings.sentence_level, language),
        },
        {
          id: "everyday_sentence_length",
          label: language === "zh" ? "长度" : "Length",
          value: everydayLengthLabel(settings.sentence_length, language),
        },
        {
          id: "everyday_sentence_count",
          label: language === "zh" ? "每组句子" : "Sentences",
          value: String(settings.sentence_count),
        },
      ];
    case "everyday_articles":
      return [
        {
          id: "everyday_article_level",
          label: language === "zh" ? "词汇量" : "Vocabulary",
          value: everydayLevelLabel(settings.article_level, language),
        },
        {
          id: "everyday_article_length",
          label: language === "zh" ? "长度" : "Length",
          value: everydayLengthLabel(settings.article_length, language),
        },
      ];
    case "everyday_word_decomposition":
      return [
        {
          id: "everyday_decomposition_level",
          label: language === "zh" ? "词汇量" : "Vocabulary",
          value: everydayLevelLabel(settings.decomposition_level, language),
        },
        {
          id: "everyday_decomposition_word_count",
          label: language === "zh" ? "每组单词" : "Words per group",
          value: String(settings.decomposition_word_count),
        },
        {
          id: "everyday_decomposition_part_repeats",
          label: language === "zh" ? "拆分重复" : "Part repeats",
          value: String(settings.decomposition_part_repeats),
        },
        {
          id: "everyday_decomposition_word_repeats",
          label: language === "zh" ? "完整词重复" : "Whole repeats",
          value: String(settings.decomposition_word_repeats),
        },
      ];
    default:
      return [];
  }
}

export function wordBreakdownPracticeOptionItems(
  settings: UserPreferences["word_breakdown"],
  language: StartRunnerContext["language"],
  wordAudio: UserPreferences["word_audio"] = { enabled: false },
): OpenTuiPracticeOptionsState["items"] {
  return [
    {
      id: "word_breakdown_word_repeats",
      label: language === "zh" ? "完整词重复" : "Whole repeats",
      value: String(settings.word_repeats),
    },
    wordAudioPracticeOptionItem(wordAudio, language),
  ];
}

export function programmingTermsPracticeOptionItems(
  settings: UserPreferences["programming_terms"],
  language: StartRunnerContext["language"],
  wordAudio: UserPreferences["word_audio"] = { enabled: false },
): OpenTuiPracticeOptionsState["items"] {
  return [
    {
      id: "programming_terms_word_repeats",
      label: language === "zh" ? "单词重复" : "Word repeats",
      value: String(settings.word_repeats),
    },
    wordAudioPracticeOptionItem(wordAudio, language),
  ];
}

export function customLibraryPracticeOptionItems(
  settings: UserPreferences["custom_library"],
  wordAudio: UserPreferences["word_audio"],
  language: StartRunnerContext["language"],
): OpenTuiPracticeOptionsState["items"] {
  return [
    {
      id: "custom_library_word_repeats",
      label: language === "zh" ? "单词重复" : "Word repeats",
      value: String(settings.word_repeats),
    },
    wordAudioPracticeOptionItem(wordAudio, language),
  ];
}

function wordAudioPracticeOptionItem(
  settings: UserPreferences["word_audio"],
  language: StartRunnerContext["language"],
): OpenTuiPracticeOptionsState["items"][number] {
  return {
    id: "word_audio_enabled",
    label: language === "zh" ? "发音" : "Pronunciation",
    value: onOffLabel(settings.enabled, language),
  };
}

export function nextPracticeOptionsIndex(
  context: StartRunnerContext,
  index: number,
  direction: -1 | 1,
): number {
  const count = practiceOptionsStateForContext(context, index, context.language).items.length;
  if (count === 0) {
    return 0;
  }
  return (index + direction + count) % count;
}

export function practiceOptionControlForIndex(
  context: StartRunnerContext,
  index: number,
): PracticeOptionControl | undefined {
  if (isLiveCodeSettingsEnabled(context)) {
    return { domain: "code", control: index <= 0 ? "difficulty" : "length" };
  }
  if (isLiveCustomLibraryWordOptionsEnabled(context)) {
    return index <= 0
      ? { domain: "custom_library", control: "word_repeats" }
      : { domain: "word_audio", control: "enabled" };
  }
  const sourceItem = context.sourceItem;
  if (!isLiveEverydayOptionsEnabled(context)) {
    if (isLiveWordBreakdownOptionsEnabled(context)) {
      if (index > 0) {
        return { domain: "word_audio", control: "enabled" };
      }
      if (context.sourceItem === "programming_terms") {
        return { domain: "programming_terms", control: "word_repeats" };
      }
      return { domain: "word_breakdown", control: "word_repeats" };
    }
    return undefined;
  }
  switch (sourceItem) {
    case "everyday_words":
      if (index > 2) {
        return { domain: "word_audio", control: "enabled" };
      }
      return {
        domain: "everyday",
        control: index <= 0 ? "word_range" : index === 1 ? "word_count" : "word_repeats",
      };
    case "everyday_sentences":
      return {
        domain: "everyday",
        control:
          index <= 0
            ? "sentence_level"
            : index === 1
              ? "sentence_length"
              : "sentence_count",
      };
    case "everyday_articles":
      return {
        domain: "everyday",
        control: index <= 0 ? "article_level" : "article_length",
      };
    case "everyday_word_decomposition": {
      const controls: LiveEverydayControl[] = [
        "decomposition_level",
        "decomposition_word_count",
        "decomposition_part_repeats",
        "decomposition_word_repeats",
      ];
      return { domain: "everyday", control: controls[index] ?? "decomposition_level" };
    }
    default:
      return undefined;
  }
}

export function wordAudioSettingsForContext(
  context: StartRunnerContext,
): UserPreferences["word_audio"] {
  return context.wordAudioSettings ?? { enabled: false };
}

export function customLibrarySettingsForContext(
  context: StartRunnerContext,
): UserPreferences["custom_library"] {
  return context.customLibrarySettings ?? { word_repeats: 1 };
}

export function wordBreakdownSettingsForContext(
  context: StartRunnerContext,
): UserPreferences["word_breakdown"] {
  return {
    enabled_in_comprehensive: true,
    max_items_per_group: 6,
    word_repeats: 2,
    ...context.targetContext?.wordBreakdownSettings,
  };
}

export function programmingTermsSettingsForContext(
  context: StartRunnerContext,
): UserPreferences["programming_terms"] {
  return {
    word_repeats: 1,
    ...context.targetContext?.programmingTermsSettings,
  };
}

export function everydaySettingsForContext(context: StartRunnerContext): EverydayEnglishSettings {
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
    ...context.targetContext?.everydaySettings,
  };
}

export function nextWordBreakdownSettingsForControl(
  settings: UserPreferences["word_breakdown"],
  control: LiveWordBreakdownControl,
  direction: -1 | 1,
): UserPreferences["word_breakdown"] {
  switch (control) {
    case "word_repeats":
      return {
        ...settings,
        word_repeats: cycleNumberOption(
          wordBreakdownRepeatControls,
          settings.word_repeats,
          direction,
        ),
      };
  }
}

export function nextProgrammingTermsSettingsForControl(
  settings: UserPreferences["programming_terms"],
  control: LiveProgrammingTermsControl,
  direction: -1 | 1,
): UserPreferences["programming_terms"] {
  switch (control) {
    case "word_repeats":
      return {
        ...settings,
        word_repeats: cycleNumberOption(
          wordBreakdownRepeatControls,
          settings.word_repeats,
          direction,
        ),
      };
  }
}

export function nextCustomLibrarySettingsForControl(
  settings: UserPreferences["custom_library"],
  control: LiveCustomLibraryControl,
  direction: -1 | 1,
): UserPreferences["custom_library"] {
  switch (control) {
    case "word_repeats":
      return {
        ...settings,
        word_repeats: cycleNumberOption(
          wordBreakdownRepeatControls,
          settings.word_repeats,
          direction,
        ),
      };
  }
}

export function nextWordAudioSettingsForControl(
  settings: UserPreferences["word_audio"],
  _control: LiveWordAudioControl,
): UserPreferences["word_audio"] {
  return { ...settings, enabled: !settings.enabled };
}

export function nextEverydaySettingsForControl(
  settings: EverydayEnglishSettings,
  control: LiveEverydayControl,
  direction: -1 | 1,
): EverydayEnglishSettings {
  switch (control) {
    case "word_range":
      return {
        ...settings,
        word_range: cycleStringOption(everydayWordRangeControls, settings.word_range, direction),
      };
    case "word_count":
      return {
        ...settings,
        word_count: cycleNumberOption(everydayWordCountControls, settings.word_count, direction),
      };
    case "word_repeats":
      return {
        ...settings,
        word_repeats: cycleNumberOption(
          wordBreakdownRepeatControls,
          settings.word_repeats,
          direction,
        ),
      };
    case "sentence_level":
      return {
        ...settings,
        sentence_level: cycleStringOption(everydayLevelControls, settings.sentence_level, direction),
      };
    case "sentence_length":
      return {
        ...settings,
        sentence_length: cycleStringOption(everydayLengthControls, settings.sentence_length, direction),
      };
    case "sentence_count":
      return {
        ...settings,
        sentence_count: cycleNumberOption(
          everydaySentenceCountControls,
          settings.sentence_count,
          direction,
        ),
      };
    case "article_level":
      return {
        ...settings,
        article_level: cycleStringOption(everydayLevelControls, settings.article_level, direction),
      };
    case "article_length":
      return {
        ...settings,
        article_length: cycleStringOption(everydayLengthControls, settings.article_length, direction),
      };
    case "decomposition_level":
      return {
        ...settings,
        decomposition_level: cycleStringOption(
          everydayLevelControls,
          settings.decomposition_level,
          direction,
        ),
      };
    case "decomposition_word_count":
      return {
        ...settings,
        decomposition_word_count: cycleNumberOption(
          everydayWordCountControls,
          settings.decomposition_word_count,
          direction,
        ),
      };
    case "decomposition_part_repeats":
      return {
        ...settings,
        decomposition_part_repeats: cycleNumberOption(
          everydayRepeatControls,
          settings.decomposition_part_repeats,
          direction,
        ),
      };
    case "decomposition_word_repeats":
      return {
        ...settings,
        decomposition_word_repeats: cycleNumberOption(
          everydayRepeatControls,
          settings.decomposition_word_repeats,
          direction,
        ),
      };
  }
}

export function cycleCodeOption<const T extends readonly string[]>(
  values: T,
  current: T[number],
  direction: -1 | 1,
): T[number] {
  const fallback = values[0];
  if (fallback === undefined) {
    throw new Error("code option list is empty");
  }
  const index = values.indexOf(current);
  const currentIndex = index === -1 ? 0 : index;
  return values[(currentIndex + direction + values.length) % values.length] ?? fallback;
}

function onOffLabel(enabled: boolean, language: StartRunnerContext["language"]): string {
  return language === "zh" ? (enabled ? "开" : "关") : enabled ? "on" : "off";
}

export function cycleStringOption<const T extends readonly string[]>(
  values: T,
  current: T[number],
  direction: -1 | 1,
): T[number] {
  const fallback = values[0];
  if (fallback === undefined) {
    throw new Error("string option list is empty");
  }
  const index = values.indexOf(current);
  const currentIndex = index === -1 ? 0 : index;
  return values[(currentIndex + direction + values.length) % values.length] ?? fallback;
}

export function cycleNumberOption<const T extends readonly number[]>(
  values: T,
  current: number,
  direction: -1 | 1,
): T[number] {
  const fallback = values[0];
  if (fallback === undefined) {
    throw new Error("number option list is empty");
  }
  const index = values.indexOf(current);
  const currentIndex = index === -1 ? 0 : index;
  return values[(currentIndex + direction + values.length) % values.length] ?? fallback;
}
