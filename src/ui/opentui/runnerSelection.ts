import type {
  CodePracticeConfig,
  EverydayEnglishSettings,
  PracticeLesson,
  SessionRecord,
  UserPreferences,
} from "../../domain/model";
import type { StartRunnerContext } from "../../cli";
import { buildPlan } from "../../training/plan";
import {
  materializeStageLesson,
  refreshModuleMixTarget,
  type BuildTargetContext,
} from "../../training/targets";
import {
  activateOpenTuiMenuItem,
  everydayLiveOptionSources,
  liveOptionsAvailableForSource,
  submenuForStandaloneItem,
  wordBreakdownLiveOptionSources,
  type OpenTuiAppState,
  type OpenTuiMenuItemId,
  type OpenTuiSubmenu,
} from "./appModel";

export interface LessonSelection {
  lesson: PracticeLesson;
  index: number;
}

export function firstUnfinishedLesson(
  context: StartRunnerContext,
  newRecords: SessionRecord[] = [],
): LessonSelection | undefined {
  const completedLessonIds = completedLessonsForRun(
    [...context.records, ...newRecords],
    context.dailyPlan.run_id,
  );
  const index = context.dailyPlan.lessons.findIndex(
    (lesson) => !completedLessonIds.has(lesson.id),
  );
  const lesson = context.dailyPlan.lessons[index];
  if (index < 0 || lesson === undefined) {
    return undefined;
  }
  return { lesson, index };
}

export function todayElapsedMsForRun(
  context: StartRunnerContext,
  newRecords: SessionRecord[] = [],
): number {
  return (
    (context.todayElapsedMs ?? context.dailyPlan.completed_ms) +
    newRecords.reduce((sum, record) => sum + record.duration_ms, 0)
  );
}

export async function saveCheckpointForSelection(
  context: StartRunnerContext,
  selection: LessonSelection,
): Promise<void> {
  try {
    await context.saveCheckpoint?.(selection.lesson, selection.lesson.target);
  } catch {
    return;
  }
}

export function refreshSelectionForCurrentRecords(
  context: StartRunnerContext,
  selection: LessonSelection,
  completedRecords: SessionRecord[],
): LessonSelection {
  const targetContext = refreshTargetContext(context, selection.lesson, completedRecords);
  if (targetContext === undefined) {
    return selection;
  }

  try {
    const target = refreshModuleMixTarget(selection.lesson, targetContext);
    return {
      ...selection,
      lesson: {
        ...selection.lesson,
        target,
      },
    };
  } catch {
    return selection;
  }
}

/**
 * 惰性组卷的开练接入：把 pending 阶段课在开练前真正组卷成可打 target。
 * 仅综合训练 pending 课需要（独立练习/已 eager 组卷的课 pending 为空，原样返回）。
 * 用 refreshedTargetContext 取上下文，因诊断屏首组 run_id 仍为空，
 * refreshSelectionForCurrentRecords 会跳过组卷，必须由此兜底。
 */
export function materializeSelection(
  context: StartRunnerContext,
  selection: LessonSelection,
  completedRecords: SessionRecord[],
): LessonSelection {
  if (selection.lesson.pending === undefined) {
    return selection;
  }
  const targetContext = refreshedTargetContext(context, completedRecords);
  if (targetContext === undefined) {
    return selection;
  }
  return {
    ...selection,
    lesson: materializeStageLesson(targetContext, selection.lesson),
  };
}

export function refreshTargetContext(
  context: StartRunnerContext,
  lesson: PracticeLesson,
  completedRecords: SessionRecord[],
): BuildTargetContext | undefined {
  if (
    context.targetContext === undefined ||
    context.dailyPlan.run_id.length === 0 ||
    lesson.mix_profile !== "comprehensive"
  ) {
    return undefined;
  }

  const records = [...context.records, ...completedRecords];
  return {
    ...context.targetContext,
    records,
    plan: buildPlan(records, context.language, context.now),
  };
}

export function isStandaloneRun(context: StartRunnerContext): boolean {
  return (
    context.dailyPlan.run_id.length === 0 &&
    context.sourceItem !== undefined &&
    context.sourceItem !== "comprehensive"
  );
}

export function refreshedStandaloneSelection(
  context: StartRunnerContext,
  selection: LessonSelection,
  completedRecords: SessionRecord[],
): LessonSelection {
  const sourceItem = context.sourceItem;
  const targetContext = refreshedTargetContext(context, completedRecords);
  if (sourceItem === undefined || targetContext === undefined) {
    return selection;
  }
  const submenu = submenuForStandaloneItem(sourceItem);
  const sourceState = stateForStandaloneRefresh(context, sourceItem, submenu);
  if (sourceState === undefined) {
    return selection;
  }
  const state = activateOpenTuiMenuItem(
    sourceState,
    sourceItem,
    targetContext,
  );
  if (state.route.screen !== "running") {
    return selection;
  }
  return {
    ...selection,
    lesson: {
      ...selection.lesson,
      target: state.route.target,
    },
  };
}

function stateForStandaloneRefresh(
  context: StartRunnerContext,
  sourceItem: string,
  submenu: OpenTuiSubmenu | undefined,
): OpenTuiAppState | undefined {
  const customLibrarySlug = customLibrarySlugFromWordsSource(sourceItem);
  if (customLibrarySlug !== undefined) {
    return {
      language: context.language,
      route: { screen: "library_menu", slug: customLibrarySlug },
      ...(context.customLibraries === undefined ? {} : { customLibraries: context.customLibraries }),
      ...(context.customLibrarySettings === undefined
        ? {}
        : { customLibrarySettings: context.customLibrarySettings }),
    };
  }
  return submenu === undefined
    ? undefined
    : { language: context.language, route: { screen: "submenu", menu: submenu } };
}

function customLibrarySlugFromWordsSource(sourceItem: string): string | undefined {
  if (!isCustomLibraryWordsSource(sourceItem)) {
    return undefined;
  }
  const spec = sourceItem.slice("library_kind_".length);
  return spec.slice(0, -":words".length);
}


export function refreshedTargetContext(
  context: StartRunnerContext,
  completedRecords: SessionRecord[],
): BuildTargetContext | undefined {
  if (context.targetContext === undefined) {
    return undefined;
  }
  const records = [...context.records, ...completedRecords];
  return {
    ...context.targetContext,
    records,
    plan: buildPlan(records, context.language, context.now),
  };
}

export function startRunnerContextWithCodeConfig(
  context: StartRunnerContext,
  codeConfig: CodePracticeConfig,
): StartRunnerContext {
  const next: StartRunnerContext = {
    ...context,
    codeConfig,
  };
  if (context.targetContext !== undefined) {
    next.targetContext = {
      ...context.targetContext,
      codeConfig,
    };
  }
  return next;
}

export function startRunnerContextWithEverydaySettings(
  context: StartRunnerContext,
  everydaySettings: EverydayEnglishSettings,
): StartRunnerContext {
  if (context.targetContext === undefined) {
    return context;
  }
  return {
    ...context,
    targetContext: {
      ...context.targetContext,
      everydaySettings,
    },
  };
}

export function startRunnerContextWithWordBreakdownSettings(
  context: StartRunnerContext,
  wordBreakdownSettings: UserPreferences["word_breakdown"],
): StartRunnerContext {
  if (context.targetContext === undefined) {
    return context;
  }
  return {
    ...context,
    targetContext: {
      ...context.targetContext,
      wordBreakdownSettings,
    },
  };
}

export function startRunnerContextWithProgrammingTermsSettings(
  context: StartRunnerContext,
  programmingTermsSettings: UserPreferences["programming_terms"],
): StartRunnerContext {
  if (context.targetContext === undefined) {
    return context;
  }
  return {
    ...context,
    targetContext: {
      ...context.targetContext,
      programmingTermsSettings,
    },
  };
}

export function startRunnerContextWithRuntimeSettings(
  context: StartRunnerContext,
  codeConfig: CodePracticeConfig,
  everydaySettings: EverydayEnglishSettings | undefined,
  wordBreakdownSettings?: UserPreferences["word_breakdown"] | undefined,
  programmingTermsSettings?: UserPreferences["programming_terms"] | undefined,
  wordAudioSettings?: UserPreferences["word_audio"] | undefined,
  customLibrarySettings?: UserPreferences["custom_library"] | undefined,
): StartRunnerContext {
  const withCode = startRunnerContextWithCodeConfig(context, codeConfig);
  const withEveryday = everydaySettings === undefined
    ? withCode
    : startRunnerContextWithEverydaySettings(withCode, everydaySettings);
  const withWordBreakdown = wordBreakdownSettings === undefined
    ? withEveryday
    : startRunnerContextWithWordBreakdownSettings(withEveryday, wordBreakdownSettings);
  const withProgrammingTerms = programmingTermsSettings === undefined
    ? withWordBreakdown
    : startRunnerContextWithProgrammingTermsSettings(
        withWordBreakdown,
        programmingTermsSettings,
      );
  return {
    ...withProgrammingTerms,
    ...(wordAudioSettings === undefined ? {} : { wordAudioSettings }),
    ...(customLibrarySettings === undefined ? {} : { customLibrarySettings }),
  };
}

export function cloneCodeConfig(config: CodePracticeConfig): CodePracticeConfig {
  return {
    ...config,
    languages: [...config.languages],
    frameworks: [...config.frameworks],
    projects: [...config.projects],
  };
}

export function completedLessonsForRun(records: SessionRecord[], runId: string): Set<string> {
  return new Set(
    records
      .filter((record) => record.daily_run_id === runId)
      .filter((record) => record.completion_state === "completed")
      .map((record) => record.lesson_id),
  );
}

export async function saveRecordIfAvailable(
  context: StartRunnerContext,
  record: SessionRecord,
): Promise<void> {
  try {
    await context.saveRecord?.(record);
  } catch {
    return;
  }
}

export function isStandaloneTargetRefreshEnabled(context: StartRunnerContext): boolean {
  if (
    context.dailyPlan.run_id.length !== 0 ||
    context.sourceItem === undefined ||
    context.targetContext === undefined
  ) {
    return false;
  }
  const submenu = submenuForStandaloneItem(context.sourceItem);
  return submenu === "foundation" || submenu === "everyday" || submenu === "code";
}

export function isLiveCodeSettingsEnabled(context: StartRunnerContext): boolean {
  return (
    context.dailyPlan.run_id.length === 0 &&
    context.sourceItem !== undefined &&
    submenuForStandaloneItem(context.sourceItem) === "code" &&
    context.targetContext !== undefined
  );
}

export function isLiveEverydayOptionsEnabled(context: StartRunnerContext): boolean {
  return (
    context.dailyPlan.run_id.length === 0 &&
    context.targetContext !== undefined &&
    context.sourceItem !== undefined &&
    everydayLiveOptionSources.has(context.sourceItem)
  );
}

export function isLiveWordBreakdownOptionsEnabled(context: StartRunnerContext): boolean {
  return (
    context.dailyPlan.run_id.length === 0 &&
    context.targetContext !== undefined &&
    context.sourceItem !== undefined &&
    wordBreakdownLiveOptionSources.has(context.sourceItem)
  );
}

export function isLiveCustomLibraryWordOptionsEnabled(context: StartRunnerContext): boolean {
  return (
    context.dailyPlan.run_id.length === 0 &&
    context.sourceItem !== undefined &&
    isCustomLibraryWordsSource(context.sourceItem)
  );
}

export function isLivePracticeOptionsEnabled(context: StartRunnerContext): boolean {
  return (
    isLiveCodeSettingsEnabled(context) ||
    isLiveEverydayOptionsEnabled(context) ||
    isLiveWordBreakdownOptionsEnabled(context) ||
    isLiveCustomLibraryWordOptionsEnabled(context)
  );
}

export function isCustomLibraryWordsSource(sourceItem: string): boolean {
  return sourceItem.startsWith("library_kind_") && sourceItem.endsWith(":words");
}
