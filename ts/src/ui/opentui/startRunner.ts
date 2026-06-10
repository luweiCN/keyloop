import type {
  CodePracticeConfig,
  CompletionState,
  EverydayEnglishSettings,
  PracticeLesson,
  SessionRecord,
} from "../../domain/model";
import type { StartRunner, StartRunnerContext, StartRunnerResult } from "../../cli";
import {
  applyLiveKey,
  createLiveSession,
  liveMetrics,
  sessionRecordFromLiveSession,
  type LiveKey,
  type LiveSessionState,
} from "../../training/liveSession";
import {
  activateOpenTuiMenuItem,
  createOpenTuiCodeSettingsConfirmationState,
  createOpenTuiCompletionState,
  createOpenTuiExitConfirmationState,
  createOpenTuiPracticeOptionsState,
  createOpenTuiSummaryState,
  type OpenTuiAppState,
  type OpenTuiMenuItemId,
  type OpenTuiPracticeOptionsState,
  type OpenTuiSubmenu,
  type OpenTuiRunningLiveState,
} from "./appModel";
import { buildPlan } from "../../training/plan";
import {
  refreshModuleMixTarget,
  type BuildTargetContext,
} from "../../training/targets";
import {
  renderOpenTuiAppOnce,
  type OpenTuiKeyEvent,
  type OpenTuiRenderer,
  type OpenTuiRendererKit,
} from "./renderer";
import {
  codeDifficultyLabel,
  codeLengthLabel,
  everydayLengthLabel,
  everydayLevelLabel,
  everydayWordRangeLabel,
} from "./labels";

const IDLE_AUTO_PAUSE_MS = 10_000;
const codeDifficultyControls = ["adaptive", "all", "easy", "medium", "hard"] as const;
const codeLengthControls = ["adaptive", "short", "medium", "long"] as const;
const everydayWordRangeControls = ["200", "1000", "5000", "10000"] as const;
const everydayWordCountControls = [10, 20, 30, 50] as const;
const everydayLevelControls = [
  "high_school",
  "cet4",
  "cet6",
  "postgraduate",
  "toefl_ielts",
] as const;
const everydayLengthControls = ["short", "medium", "long", "mixed"] as const;
const everydaySentenceCountControls = [3, 5, 8, 10] as const;
const everydayRepeatControls = [1, 3, 5] as const;

export interface OpenTuiStartRunnerOptions {
  kit?: OpenTuiRendererKit;
  nowMs?: () => number;
  timerIntervalMs?: number;
}

interface LessonSelection {
  lesson: PracticeLesson;
  index: number;
}

type LiveCodeControl = "difficulty" | "length" | "refresh";
type LiveEverydayControl =
  | "word_range"
  | "word_count"
  | "sentence_level"
  | "sentence_length"
  | "sentence_count"
  | "article_level"
  | "article_length"
  | "decomposition_level"
  | "decomposition_word_count"
  | "decomposition_part_repeats"
  | "decomposition_word_repeats";
type PracticeOptionControl =
  | { domain: "code"; control: LiveCodeControl }
  | { domain: "everyday"; control: LiveEverydayControl };
type PostCompletionAction =
  | "continue"
  | "repeat"
  | "stop"
  | "return"
  | "code_options"
  | "code_difficulty"
  | "code_length"
  | "code_refresh";

interface LessonRunResult {
  record: SessionRecord | null;
  renderer?: OpenTuiRenderer;
}

interface PostCompletionResult {
  action: PostCompletionAction;
  renderer: OpenTuiRenderer;
}

export function createOpenTuiStartRunner(
  options: OpenTuiStartRunnerOptions = {},
): StartRunner {
  return async (context) => openTuiStartRunner(context, options);
}

async function openTuiStartRunner(
  context: StartRunnerContext,
  options: OpenTuiStartRunnerOptions,
): Promise<StartRunnerResult> {
  const completedRecords: SessionRecord[] = [];
  let forcedSelection: LessonSelection | undefined;
  let reusableRenderer = context.initialRenderer;
  let runtimeCodeConfig = cloneCodeConfig(context.codeConfig);
  let runtimeEverydaySettings =
    context.targetContext?.everydaySettings === undefined
      ? undefined
      : everydaySettingsForContext(context);
  let openPracticeOptionsOnNextRun = false;

  for (;;) {
    const runtimeContext = startRunnerContextWithRuntimeSettings(
      context,
      runtimeCodeConfig,
      runtimeEverydaySettings,
    );
    const shouldOpenPracticeOptions = openPracticeOptionsOnNextRun;
    const forced = forcedSelection;
    const storedSelection = forced ?? firstUnfinishedLesson(runtimeContext, completedRecords);
    forcedSelection = undefined;
    openPracticeOptionsOnNextRun = false;
    if (storedSelection === undefined) {
      reusableRenderer?.destroy?.();
      return { completedRecords };
    }
    const selection =
      forced === undefined
        ? refreshSelectionForCurrentRecords(runtimeContext, storedSelection, completedRecords)
        : storedSelection;
    await saveCheckpointForSelection(runtimeContext, selection);
    const todayElapsedBeforeLesson = todayElapsedMsForRun(runtimeContext, completedRecords);

    const renderer = await rendererForRunningState(
      runningStateForLesson(runtimeContext, selection.lesson, undefined, todayElapsedBeforeLesson),
      options,
      reusableRenderer,
    );
    reusableRenderer = undefined;
    if (renderer.keyInput === undefined) {
      return { completedRecords };
    }

    const runResult = await runLessonUntilComplete(
      runtimeContext,
      selection,
      renderer,
      options,
      todayElapsedBeforeLesson,
      (nextConfig) => {
        runtimeCodeConfig = cloneCodeConfig(nextConfig);
      },
      (nextSettings) => {
        runtimeEverydaySettings = { ...nextSettings };
      },
      shouldOpenPracticeOptions,
    );
    const record = runResult.record;
    if (record === null) {
      if (runResult.renderer !== undefined && context.returnState !== undefined) {
        await runResult.renderer.renderState?.(context.returnState);
        return {
          completedRecords,
          renderer: runResult.renderer,
          state: context.returnState,
        };
      }
      return { completedRecords };
    }

    completedRecords.push(record);
    if (record.completion_state === "partial") {
      return { completedRecords };
    }

    const nextSelection = isStandaloneRun(context)
      ? undefined
      : firstUnfinishedLesson(context, completedRecords);
    const nextLesson =
      nextSelection === undefined
        ? undefined
        : refreshSelectionForCurrentRecords(
            context,
            nextSelection,
            completedRecords,
          ).lesson;
    const completionResult = await showCompletionPage(
      context,
      record,
      nextLesson,
      selection.lesson,
      runResult.renderer,
      options,
      todayElapsedBeforeLesson,
    );
    if (completionResult.action === "return") {
      if (context.returnState !== undefined) {
        await completionResult.renderer.renderState?.(context.returnState);
        return {
          completedRecords,
          renderer: completionResult.renderer,
          state: context.returnState,
        };
      }
      completionResult.renderer.destroy?.();
      return { completedRecords };
    }

    if (completionResult.action === "stop") {
      completionResult.renderer.destroy?.();
      return { completedRecords };
    }

    reusableRenderer = completionResult.renderer;

    if (completionResult.action === "code_options") {
      const nextContext = startRunnerContextWithCodeConfig(context, runtimeCodeConfig);
      forcedSelection = refreshedStandaloneSelection(nextContext, selection, completedRecords);
      openPracticeOptionsOnNextRun = true;
      continue;
    }

    const completionCodeControl = codeControlFromPostCompletionAction(completionResult.action);
    if (completionCodeControl !== undefined) {
      const nextCodeConfig = nextCodeConfigForControl(runtimeCodeConfig, completionCodeControl);
      runtimeCodeConfig = cloneCodeConfig(nextCodeConfig);
      const nextContext = startRunnerContextWithCodeConfig(context, runtimeCodeConfig);
      forcedSelection = refreshedStandaloneSelection(nextContext, selection, completedRecords);
      continue;
    }

    if (completionResult.action === "repeat") {
      forcedSelection = selection;
      continue;
    }

    if (nextSelection === undefined) {
      if (isStandaloneRun(context)) {
        forcedSelection = refreshedStandaloneSelection(
          context,
          selection,
          completedRecords,
        );
        continue;
      }
      await showSummaryPage(context, completedRecords, options, reusableRenderer);
      return { completedRecords };
    }
  }
}

async function rendererForRunningState(
  state: OpenTuiAppState,
  options: OpenTuiStartRunnerOptions,
  reusableRenderer: OpenTuiRenderer | undefined,
): Promise<OpenTuiRenderer> {
  return rendererForState(state, options, reusableRenderer);
}

async function rendererForState(
  state: OpenTuiAppState,
  options: OpenTuiStartRunnerOptions,
  reusableRenderer: OpenTuiRenderer | undefined,
): Promise<OpenTuiRenderer> {
  if (reusableRenderer === undefined) {
    return renderOpenTuiAppOnce(state, options.kit);
  }
  if (reusableRenderer.renderState === undefined) {
    reusableRenderer.destroy?.();
    return renderOpenTuiAppOnce(state, options.kit);
  }
  await reusableRenderer.renderState(state);
  return reusableRenderer;
}

function firstUnfinishedLesson(
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

function todayElapsedMsForRun(
  context: StartRunnerContext,
  newRecords: SessionRecord[] = [],
): number {
  return (
    (context.todayElapsedMs ?? context.dailyPlan.completed_ms) +
    newRecords.reduce((sum, record) => sum + record.duration_ms, 0)
  );
}

async function saveCheckpointForSelection(
  context: StartRunnerContext,
  selection: LessonSelection,
): Promise<void> {
  try {
    await context.saveCheckpoint?.(selection.lesson, selection.lesson.target);
  } catch {
    return;
  }
}

function refreshSelectionForCurrentRecords(
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

function refreshTargetContext(
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

function isStandaloneRun(context: StartRunnerContext): boolean {
  return (
    context.dailyPlan.run_id.length === 0 &&
    context.sourceItem !== undefined &&
    context.sourceItem !== "comprehensive"
  );
}

function refreshedStandaloneSelection(
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
  if (submenu === undefined) {
    return selection;
  }
  const state = activateOpenTuiMenuItem(
    { language: context.language, route: { screen: "submenu", menu: submenu } },
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

function submenuForStandaloneItem(itemId: OpenTuiMenuItemId): OpenTuiSubmenu | undefined {
  switch (itemId) {
    case "foundation_home_row":
    case "foundation_top_row":
    case "foundation_bottom_row":
    case "foundation_number_row":
    case "foundation_symbols":
    case "foundation_left_hand":
    case "foundation_right_hand":
    case "foundation_index_fingers":
    case "foundation_middle_fingers":
    case "foundation_ring_fingers":
    case "foundation_pinky_fingers":
    case "foundation_horizontal_rolls":
    case "foundation_vertical_ladders":
    case "foundation_diagonal_crossovers":
    case "foundation_letter_combinations":
    case "foundation_capitalization":
    case "foundation_mix":
      return "foundation";
    case "everyday_common_500":
    case "everyday_common_1000":
    case "everyday_common_5000":
    case "everyday_words":
    case "everyday_phrases":
    case "everyday_sentences":
    case "everyday_articles":
    case "everyday_word_decomposition":
    case "long_word_breakdown":
    case "everyday_mix":
      return "everyday";
    case "operators_brackets_quotes":
    case "programming_terms":
    case "naming_styles":
    case "technical_long_words":
    case "my_vocabulary":
    case "programming_basics_mix":
      return "programming";
    case "code_blocks":
    case "code_functions":
    case "code_file_fragments":
    case "code_mix":
      return "code";
    default:
      return undefined;
  }
}

function refreshedTargetContext(
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

function startRunnerContextWithCodeConfig(
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

function startRunnerContextWithEverydaySettings(
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

function startRunnerContextWithRuntimeSettings(
  context: StartRunnerContext,
  codeConfig: CodePracticeConfig,
  everydaySettings: EverydayEnglishSettings | undefined,
): StartRunnerContext {
  const withCode = startRunnerContextWithCodeConfig(context, codeConfig);
  return everydaySettings === undefined
    ? withCode
    : startRunnerContextWithEverydaySettings(withCode, everydaySettings);
}

function cloneCodeConfig(config: CodePracticeConfig): CodePracticeConfig {
  return {
    ...config,
    languages: [...config.languages],
    frameworks: [...config.frameworks],
    projects: [...config.projects],
  };
}

function completedLessonsForRun(records: SessionRecord[], runId: string): Set<string> {
  return new Set(
    records
      .filter((record) => record.daily_run_id === runId)
      .filter((record) => record.completion_state === "completed")
      .map((record) => record.lesson_id),
  );
}

async function saveRecordIfAvailable(
  context: StartRunnerContext,
  record: SessionRecord,
): Promise<void> {
  try {
    await context.saveRecord?.(record);
  } catch {
    return;
  }
}

function runningStateForLesson(
  context: StartRunnerContext,
  lesson: PracticeLesson,
  live?: OpenTuiRunningLiveState,
  todayElapsedMs: number = context.todayElapsedMs ?? context.dailyPlan.completed_ms,
): OpenTuiAppState {
  const liveState = live ?? liveStateFromTarget(lesson.target);
  const route: Extract<OpenTuiAppState["route"], { screen: "running" }> = {
    screen: "running",
    source_item: context.sourceItem ?? "comprehensive",
    target: lesson.target,
    lesson,
    live: liveState,
  };
  return {
    language: context.language,
    speed_unit: context.speedUnit ?? "wpm",
    route: {
      ...route,
    },
    ...(context.targetContext?.everydaySettings === undefined
      ? {}
      : { everydaySettings: everydaySettingsForContext(context) }),
    today_elapsed_ms: todayElapsedMs,
  };
}

function liveStateFromTarget(target: PracticeLesson["target"]): OpenTuiRunningLiveState {
  return {
    input: "",
    elapsed_ms: 0,
    key_events: [],
    metrics: liveMetrics(target.text, "", [], 0),
  };
}

async function runLessonUntilComplete(
  context: StartRunnerContext,
  initialSelection: LessonSelection,
  initialRenderer: OpenTuiRenderer,
  options: OpenTuiStartRunnerOptions,
  todayElapsedBeforeLesson: number,
  onCodeConfigChange: (config: CodePracticeConfig) => void,
  onEverydaySettingsChange: (settings: EverydayEnglishSettings) => void,
  openPracticeOptionsInitially = false,
): Promise<LessonRunResult> {
  let currentContext = context;
  let selection = initialSelection;
  let startedAtMs: number | undefined;
  let session = createLiveSession(selection.lesson.target);

  if (isSessionComplete(session.input, selection.lesson.target.text)) {
    const completedAtMs = nowMs(options);
    const record = sessionRecordFromLiveSession(session, {
      ...recordOptions(context, selection, "completed"),
      started_at: new Date(completedAtMs).toISOString(),
      duration_ms: 0,
    });
    await saveRecordIfAvailable(context, record);
    return { record, renderer: initialRenderer };
  }

  return new Promise<LessonRunResult>((resolve) => {
    let renderer = initialRenderer;
    let settled = false;
    let exitConfirmation = false;
    let codeSettingsConfirmation = false;
    let practiceOptionsOpen = false;
    let practiceOptionsSelectedIndex = 0;
    let codeControlInFlight = false;
    let pendingCodeConfig: CodePracticeConfig | undefined;
    let pausedAtMs: number | undefined;
    let pausedTotalMs = 0;
    let resumeOnNextInput = false;
    let lastInputAtMs: number | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    const activeElapsedMs = (currentMs: number): number => {
      if (startedAtMs === undefined) {
        return 0;
      }
      const wallElapsed = Math.max(currentMs - startedAtMs, 0);
      const currentPause =
        pausedAtMs === undefined ? 0 : Math.max(currentMs - pausedAtMs, 0);
      return Math.max(wallElapsed - pausedTotalMs - currentPause, 0);
    };
    const togglePause = (currentMs: number): void => {
      if (pausedAtMs === undefined) {
        pausedAtMs = currentMs;
        return;
      }
      pausedTotalMs += Math.max(currentMs - pausedAtMs, 0);
      pausedAtMs = undefined;
      lastInputAtMs = currentMs;
    };
    const pause = (currentMs: number): void => {
      if (pausedAtMs === undefined) {
        pausedAtMs = currentMs;
      }
    };
    const resume = (currentMs: number): void => {
      if (pausedAtMs === undefined) {
        return;
      }
      pausedTotalMs += Math.max(currentMs - pausedAtMs, 0);
      pausedAtMs = undefined;
      lastInputAtMs = currentMs;
    };
    const settleRecord = async (record: SessionRecord | null): Promise<void> => {
      if (record !== null) {
        await saveRecordIfAvailable(currentContext, record);
      }
      settle(record, record?.completion_state === "completed");
    };
    const replaceRenderer = async (state: OpenTuiAppState): Promise<void> => {
      renderer.keyInput?.off("keypress", handleKeypress);
      renderer.destroy?.();
      renderer = await renderOpenTuiAppOnce(state, options.kit);
      if (renderer.keyInput === undefined) {
        settle(null);
        return;
      }
      renderer.keyInput.on("keypress", handleKeypress);
    };
    const transitionRenderer = async (state: OpenTuiAppState): Promise<void> => {
      if (renderer.renderState !== undefined) {
        await renderer.renderState(state);
        return;
      }
      await replaceRenderer(state);
    };
    const renderRunning = async (elapsedMs: number, paused = false): Promise<void> => {
      const nextState = runningStateForLesson(
        currentContext,
        selection.lesson,
        liveStateFromSession(session, elapsedMs, paused),
        todayElapsedBeforeLesson,
      );
      if (renderer.renderState === undefined) {
        renderer.requestRender?.();
        return;
      }
      await renderer.renderState(nextState);
    };
    const renderCurrentRunning = async (currentMs: number): Promise<void> => {
      await renderRunning(activeElapsedMs(currentMs), pausedAtMs !== undefined);
    };
    const renderTimerTick = async (): Promise<void> => {
      if (
        settled ||
        exitConfirmation ||
        codeSettingsConfirmation ||
        startedAtMs === undefined
      ) {
        return;
      }
      const currentMs = nowMs(options);
      if (
        pausedAtMs === undefined &&
        lastInputAtMs !== undefined &&
        currentMs - lastInputAtMs >= IDLE_AUTO_PAUSE_MS
      ) {
        // Rewind the pause to the last keystroke so the whole idle stretch is
        // excluded from the elapsed clock and scores.
        pausedAtMs = lastInputAtMs;
        resumeOnNextInput = true;
        await renderCurrentRunning(currentMs);
        return;
      }
      if (pausedAtMs !== undefined) {
        return;
      }
      await renderCurrentRunning(currentMs);
    };
    const clearTimer = (): void => {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    };
    const startTimer = (): void => {
      const intervalMs = options.timerIntervalMs ?? 1_000;
      if (intervalMs <= 0 || timer !== undefined) {
        return;
      }
      timer = setInterval(() => {
        void renderTimerTick();
      }, intervalMs);
    };
    const startLessonClock = (currentMs: number): void => {
      if (startedAtMs !== undefined) {
        return;
      }
      startedAtMs = currentMs;
      pausedAtMs = undefined;
      pausedTotalMs = 0;
      startTimer();
    };
    const refreshCodeTarget = async (
      nextConfig: CodePracticeConfig,
      currentMs: number,
      refreshOptions: { keepPracticeOptionsOpen?: boolean } = {},
    ): Promise<void> => {
      currentContext = startRunnerContextWithCodeConfig(currentContext, nextConfig);
      onCodeConfigChange(nextConfig);
      selection = refreshedStandaloneSelection(currentContext, selection, []);
      session = createLiveSession(selection.lesson.target);
      startedAtMs = undefined;
      pausedTotalMs = 0;
      pausedAtMs = undefined;
      resumeOnNextInput = false;
      clearTimer();
      await saveCheckpointForSelection(currentContext, selection);
      if (refreshOptions.keepPracticeOptionsOpen === true) {
        pausedAtMs = currentMs;
        practiceOptionsOpen = true;
        await renderPracticeOptions(currentMs);
        return;
      }
      await transitionRenderer(
        runningStateForLesson(
          currentContext,
          selection.lesson,
          liveStateFromSession(session, 0),
          todayElapsedBeforeLesson,
        ),
      );
    };
    const refreshEverydayTarget = async (
      nextSettings: EverydayEnglishSettings,
      currentMs: number,
      refreshOptions: { keepPracticeOptionsOpen?: boolean } = {},
    ): Promise<void> => {
      currentContext = startRunnerContextWithEverydaySettings(currentContext, nextSettings);
      onEverydaySettingsChange(nextSettings);
      selection = refreshedStandaloneSelection(currentContext, selection, []);
      session = createLiveSession(selection.lesson.target);
      startedAtMs = undefined;
      pausedTotalMs = 0;
      pausedAtMs = undefined;
      resumeOnNextInput = false;
      clearTimer();
      await saveCheckpointForSelection(currentContext, selection);
      if (refreshOptions.keepPracticeOptionsOpen === true) {
        pausedAtMs = currentMs;
        practiceOptionsOpen = true;
        await renderPracticeOptions(currentMs);
        return;
      }
      await transitionRenderer(
        runningStateForLesson(
          currentContext,
          selection.lesson,
          liveStateFromSession(session, 0),
          todayElapsedBeforeLesson,
        ),
      );
    };
    const refreshStandaloneTarget = async (currentMs: number): Promise<void> => {
      selection = refreshedStandaloneSelection(currentContext, selection, []);
      session = createLiveSession(selection.lesson.target);
      startedAtMs = undefined;
      pausedTotalMs = 0;
      pausedAtMs = undefined;
      resumeOnNextInput = false;
      clearTimer();
      await saveCheckpointForSelection(currentContext, selection);
      await transitionRenderer(
        runningStateForLesson(
          currentContext,
          selection.lesson,
          liveStateFromSession(session, 0),
          todayElapsedBeforeLesson,
        ),
      );
    };
    const restartCurrentGroup = async (currentMs: number): Promise<void> => {
      session = createLiveSession(selection.lesson.target);
      startedAtMs = undefined;
      pausedTotalMs = 0;
      pausedAtMs = undefined;
      resumeOnNextInput = false;
      clearTimer();
      await saveCheckpointForSelection(currentContext, selection);
      await transitionRenderer(
        runningStateForLesson(
          currentContext,
          selection.lesson,
          liveStateFromSession(session, 0),
          todayElapsedBeforeLesson,
        ),
      );
    };
    const showExitConfirmation = async (currentMs: number): Promise<void> => {
      pause(currentMs);
      exitConfirmation = true;
      codeSettingsConfirmation = false;
      await transitionRenderer(
        createOpenTuiExitConfirmationState(
          currentContext.language,
          selection.lesson.target,
          {
            lesson: selection.lesson,
            sourceItem: currentContext.sourceItem ?? "comprehensive",
            live: liveStateFromSession(session, activeElapsedMs(currentMs), true),
            speedUnit: currentContext.speedUnit ?? "wpm",
            todayElapsedMs: todayElapsedBeforeLesson,
          },
        ),
      );
    };
    const showCodeSettingsConfirmation = async (
      nextConfig: CodePracticeConfig,
      currentMs: number,
    ): Promise<void> => {
      pause(currentMs);
      pendingCodeConfig = nextConfig;
      exitConfirmation = false;
      codeSettingsConfirmation = true;
      await transitionRenderer(
        createOpenTuiCodeSettingsConfirmationState(
          currentContext.language,
          selection.lesson.target,
          {
            lesson: selection.lesson,
            sourceItem: currentContext.sourceItem ?? "comprehensive",
            live: liveStateFromSession(session, activeElapsedMs(currentMs), true),
            speedUnit: currentContext.speedUnit ?? "wpm",
            todayElapsedMs: todayElapsedBeforeLesson,
          },
        ),
      );
    };
    const renderPracticeOptions = async (currentMs: number): Promise<void> => {
      await transitionRenderer(
        createOpenTuiPracticeOptionsState(
          currentContext.language,
          selection.lesson.target,
          {
            lesson: selection.lesson,
            sourceItem: currentContext.sourceItem ?? "comprehensive",
            live: liveStateFromSession(session, activeElapsedMs(currentMs), true),
            practiceOptions: practiceOptionsStateForContext(
              currentContext,
              practiceOptionsSelectedIndex,
              currentContext.language,
            ),
            everydaySettings: currentContext.targetContext?.everydaySettings,
            speedUnit: currentContext.speedUnit ?? "wpm",
            todayElapsedMs: todayElapsedBeforeLesson,
          },
        ),
      );
    };
    const showPracticeOptions = async (currentMs: number): Promise<void> => {
      pause(currentMs);
      exitConfirmation = false;
      codeSettingsConfirmation = false;
      practiceOptionsOpen = true;
      pendingCodeConfig = undefined;
      await renderPracticeOptions(currentMs);
    };
    const applyPracticeOptionChange = async (
      direction: -1 | 1,
      currentMs: number,
    ): Promise<void> => {
      const option = practiceOptionControlForIndex(currentContext, practiceOptionsSelectedIndex);
      if (option === undefined) {
        return;
      }
      if (option.domain === "code") {
        const nextConfig = nextCodeConfigForControl(
          currentContext.codeConfig,
          option.control,
          direction,
        );
        await refreshCodeTarget(nextConfig, currentMs, { keepPracticeOptionsOpen: true });
        return;
      }
      const nextSettings = nextEverydaySettingsForControl(
        everydaySettingsForContext(currentContext),
        option.control,
        direction,
      );
      await refreshEverydayTarget(nextSettings, currentMs, { keepPracticeOptionsOpen: true });
    };
    const showRunning = async (currentMs: number, shouldResume: boolean): Promise<void> => {
      if (shouldResume) {
        resume(currentMs);
        resumeOnNextInput = false;
      } else {
        resumeOnNextInput = true;
      }
      exitConfirmation = false;
      codeSettingsConfirmation = false;
      practiceOptionsOpen = false;
      pendingCodeConfig = undefined;
      await transitionRenderer(
        runningStateForLesson(
          currentContext,
          selection.lesson,
          liveStateFromSession(session, activeElapsedMs(currentMs), pausedAtMs !== undefined),
          todayElapsedBeforeLesson,
        ),
      );
    };
    const settle = (record: SessionRecord | null, keepRenderer = false): void => {
      settled = true;
      clearTimer();
      renderer.keyInput?.off("keypress", handleKeypress);
      if (keepRenderer) {
        resolve({ record, renderer });
        return;
      }
      renderer.destroy?.();
      resolve({ record });
    };
    const handleKeypress = (event: OpenTuiKeyEvent): void => {
      void handleKeypressEvent(event);
    };
    const handleKeypressEvent = async (event: OpenTuiKeyEvent): Promise<void> => {
      if (settled) {
        return;
      }
      const currentMs = nowMs(options);

      if (isCtrlCEvent(event)) {
        settle(null);
        return;
      }

      if (practiceOptionsOpen) {
        if (isEnterEvent(event)) {
          await showRunning(currentMs, true);
          return;
        }
        if (isEscapeEvent(event) || isSpaceEvent(event) || isPracticeOptionsEvent(event)) {
          await showRunning(currentMs, false);
          return;
        }
        if (isArrowUpEvent(event) || isArrowDownEvent(event)) {
          practiceOptionsSelectedIndex = nextPracticeOptionsIndex(
            currentContext,
            practiceOptionsSelectedIndex,
            isArrowUpEvent(event) ? -1 : 1,
          );
          await renderPracticeOptions(currentMs);
          return;
        }
        if (isArrowLeftEvent(event) || isArrowRightEvent(event)) {
          await applyPracticeOptionChange(isArrowLeftEvent(event) ? -1 : 1, currentMs);
          return;
        }
        return;
      }

      if (exitConfirmation) {
        if (isEnterEvent(event) || isQuitEvent(event)) {
          settle(null, currentContext.returnState !== undefined);
          return;
        }
        if (isEscapeEvent(event) || isSpaceEvent(event) || isPauseToggleEvent(event)) {
          await showRunning(currentMs, false);
          return;
        }
        return;
      }

      if (codeSettingsConfirmation) {
        if (isEnterEvent(event)) {
          const nextConfig = pendingCodeConfig;
          pendingCodeConfig = undefined;
          codeSettingsConfirmation = false;
          if (nextConfig !== undefined) {
            await refreshCodeTarget(nextConfig, currentMs);
          }
          return;
        }
        if (isEscapeEvent(event) || isSpaceEvent(event) || isPauseToggleEvent(event)) {
          await showRunning(currentMs, false);
          return;
        }
        return;
      }

      if (isRestartGroupEvent(event)) {
        await restartCurrentGroup(currentMs);
        return;
      }

      const refreshControl = codeControlFromEvent(event);
      if (
        refreshControl === "refresh" &&
        isStandaloneTargetRefreshEnabled(currentContext)
      ) {
        if (codeControlInFlight) {
          return;
        }
        codeControlInFlight = true;
        try {
          await refreshStandaloneTarget(currentMs);
        } finally {
          codeControlInFlight = false;
        }
        return;
      }

      if (isPracticeOptionsEvent(event) && isLivePracticeOptionsEnabled(currentContext)) {
        await showPracticeOptions(currentMs);
        return;
      }

      if (isPauseToggleEvent(event)) {
        resumeOnNextInput = false;
        togglePause(currentMs);
        await renderCurrentRunning(currentMs);
        return;
      }
      if (pausedAtMs !== undefined) {
        if (isEscapeEvent(event) || isQuitEvent(event)) {
          await showExitConfirmation(currentMs);
          return;
        }
        const pausedKey = liveKeyFromOpenTuiEvent(event);
        if (resumeOnNextInput && pausedKey !== undefined) {
          resumeOnNextInput = false;
          resume(currentMs);
          await applyLiveKeyAndRender(pausedKey, currentMs);
        }
        return;
      }
      if (isEscapeEvent(event)) {
        await showExitConfirmation(currentMs);
        return;
      }
      const codeControl = refreshControl ?? codeControlFromEvent(event);
      if (codeControl !== undefined && isLiveCodeSettingsEnabled(currentContext)) {
        if (codeControlInFlight) {
          return;
        }
        codeControlInFlight = true;
        const nextConfig = nextCodeConfigForControl(currentContext.codeConfig, codeControl);
        try {
          if (codeControl === "refresh") {
            await refreshCodeTarget(nextConfig, currentMs);
          }
        } finally {
          codeControlInFlight = false;
        }
        return;
      }

      const key = liveKeyFromOpenTuiEvent(event);
      if (key === undefined) {
        return;
      }

      await applyLiveKeyAndRender(key, currentMs);
    };

    const applyLiveKeyAndRender = async (
      key: LiveKey,
      currentMs: number,
    ): Promise<void> => {
      if (startedAtMs === undefined && liveKeyCanMutateSession(session, key)) {
        startLessonClock(currentMs);
      }
      lastInputAtMs = currentMs;
      const elapsedMs = activeElapsedMs(currentMs);
      applyLiveKey(session, key, elapsedMs);

      if (!isSessionComplete(session.input, selection.lesson.target.text)) {
        await renderRunning(elapsedMs);
        return;
      }

      await settleRecord(
        sessionRecordFromLiveSession(session, {
          ...recordOptions(currentContext, selection, "completed"),
          started_at: new Date(startedAtMs ?? currentMs).toISOString(),
          duration_ms: elapsedMs,
          manual_pause_ms: pausedTotalMs,
        }),
      );
    };

    renderer.keyInput?.on("keypress", handleKeypress);
    if (openPracticeOptionsInitially) {
      void showPracticeOptions(nowMs(options));
    }
  });
}

function liveStateFromSession(
  session: LiveSessionState,
  elapsedMs: number,
  paused = false,
): OpenTuiRunningLiveState {
  return {
    input: session.input,
    elapsed_ms: elapsedMs,
    paused,
    key_events: [...session.events],
    metrics: liveMetrics(
      session.target.text,
      session.input,
      session.events,
      elapsedMs,
    ),
  };
}

async function showCompletionPage(
  context: StartRunnerContext,
  record: SessionRecord,
  nextLesson: PracticeLesson | undefined,
  completedLesson: PracticeLesson,
  reusableRenderer: OpenTuiRenderer | undefined,
  options: OpenTuiStartRunnerOptions,
  todayElapsedBeforeLesson: number,
): Promise<PostCompletionResult> {
  const sourceItem = context.sourceItem ?? "comprehensive";
  const completionOptions =
    nextLesson === undefined
      ? {
          sourceItem,
          lesson: completedLesson,
          target: completedLesson.target,
          live: completionLiveStateFromRecord(record),
          speedUnit: context.speedUnit ?? "wpm",
          todayElapsedMs: todayElapsedBeforeLesson,
        }
      : {
          nextLesson,
          sourceItem,
          lesson: completedLesson,
          target: completedLesson.target,
          live: completionLiveStateFromRecord(record),
          speedUnit: context.speedUnit ?? "wpm",
          todayElapsedMs: todayElapsedBeforeLesson,
        };
  const state = createOpenTuiCompletionState(
    context.language,
    record,
    completionOptions,
  );
  const renderer = await rendererForState(
    state,
    options,
    reusableRenderer,
  );
  const action = await waitForPostCompletionAction(renderer, state, {
    codeControlsEnabled: isLiveCodeSettingsEnabled(context),
    destroyOnSettle: false,
  });
  return { action, renderer };
}

function completionLiveStateFromRecord(record: SessionRecord): OpenTuiRunningLiveState {
  return {
    input: record.user_input,
    elapsed_ms: record.duration_ms,
    key_events: record.key_events,
    metrics: {
      wpm: record.wpm,
      raw_wpm: record.raw_wpm,
      accuracy: record.accuracy,
      errors: record.error_count,
      backspaces: record.backspace_count,
    },
  };
}

async function showSummaryPage(
  context: StartRunnerContext,
  completedRecords: SessionRecord[],
  options: OpenTuiStartRunnerOptions,
  reusableRenderer: OpenTuiRenderer | undefined,
): Promise<void> {
  const renderer = await rendererForState(
    createOpenTuiSummaryState(context.language, completedRecords, {
      dailyRunId: context.dailyPlan.run_id,
      speedUnit: context.speedUnit ?? "wpm",
    }),
    options,
    reusableRenderer,
  );
  await waitForSummaryDismiss(renderer);
}

function waitForPostCompletionAction(
  renderer: OpenTuiRenderer,
  initialState: OpenTuiAppState,
  options: { codeControlsEnabled?: boolean; destroyOnSettle?: boolean } = {},
): Promise<PostCompletionAction> {
  if (renderer.keyInput === undefined) {
    if (options.destroyOnSettle !== false) {
      renderer.destroy?.();
    }
    return Promise.resolve("stop");
  }
  const keyInput = renderer.keyInput;

  return new Promise<PostCompletionAction>((resolve) => {
    let settled = false;
    let state = initialState;
    const settle = (action: PostCompletionAction): void => {
      settled = true;
      keyInput.off("keypress", handleKeypress);
      if (options.destroyOnSettle !== false) {
        renderer.destroy?.();
      }
      resolve(action);
    };
    const handleKeypress = (event: OpenTuiKeyEvent): void => {
      void handleKeypressEvent(event);
    };
    const dismissResult = async (): Promise<void> => {
      if (state.route.screen !== "complete" || !state.route.result_visible) {
        return;
      }
      state = {
        ...state,
        route: {
          ...state.route,
          result_visible: false,
        },
      };
      await renderer.renderState?.(state);
    };
    const handleKeypressEvent = async (event: OpenTuiKeyEvent): Promise<void> => {
      if (settled) {
        return;
      }
      if (isEnterEvent(event)) {
        if (state.route.screen === "complete" && state.route.result_visible) {
          await dismissResult();
          return;
        }
        settle("continue");
        return;
      }
      if (isRestartGroupEvent(event)) {
        settle("repeat");
        return;
      }
      if (isPracticeOptionsEvent(event) && options.codeControlsEnabled === true) {
        settle("code_options");
        return;
      }
      const codeControl = codeControlFromEvent(event);
      if (codeControl !== undefined && options.codeControlsEnabled === true) {
        settle(postCompletionActionForCodeControl(codeControl));
        return;
      }
      if (isRepeatEvent(event)) {
        settle("repeat");
        return;
      }
      if (isEscapeEvent(event)) {
        if (state.route.screen === "complete" && state.route.result_visible) {
          await dismissResult();
          return;
        }
        settle("return");
        return;
      }
      if (isQuitEvent(event)) {
        settle("stop");
      }
    };

    keyInput.on("keypress", handleKeypress);
  });
}

function postCompletionActionForCodeControl(control: LiveCodeControl): PostCompletionAction {
  switch (control) {
    case "difficulty":
      return "code_difficulty";
    case "length":
      return "code_length";
    case "refresh":
      return "code_refresh";
  }
}

function codeControlFromPostCompletionAction(
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

function waitForSummaryDismiss(renderer: OpenTuiRenderer): Promise<void> {
  if (renderer.keyInput === undefined) {
    renderer.destroy?.();
    return Promise.resolve();
  }
  const keyInput = renderer.keyInput;

  return new Promise<void>((resolve) => {
    let settled = false;
    const settle = (): void => {
      settled = true;
      keyInput.off("keypress", handleKeypress);
      renderer.destroy?.();
      resolve();
    };
    const handleKeypress = (event: OpenTuiKeyEvent): void => {
      if (settled) {
        return;
      }
      if (isEnterEvent(event) || isEscapeEvent(event) || isQuitEvent(event)) {
        settle();
      }
    };

    keyInput.on("keypress", handleKeypress);
  });
}

function recordOptions(
  context: StartRunnerContext,
  selection: LessonSelection,
  completionState: CompletionState,
) {
  if (context.dailyPlan.run_id.length === 0) {
    return {
      daily_run_id: "",
      lesson_id: "",
      lesson_index: null,
      module: selection.lesson.module,
      category: selection.lesson.category,
      completion_state: completionState,
    };
  }

  return {
    daily_run_id: context.dailyPlan.run_id,
    lesson_id: selection.lesson.id,
    lesson_index: selection.index,
    module: selection.lesson.module,
    category: selection.lesson.category,
    completion_state: completionState,
  };
}

function isEscapeEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return name === "escape" || name === "esc" || event.sequence === "\x1b";
}

function isEnterEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return (
    name === "enter" ||
    name === "return" ||
    event.sequence === "\r" ||
    event.sequence === "\n"
  );
}

function isSpaceEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return name === "space" || event.sequence === " ";
}

function isQuitEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return !event.ctrl && !event.meta && (event.sequence === "q" || name === "q");
}

function isCtrlCEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return (
    !event.meta &&
    (event.sequence === "\x03" ||
      (event.ctrl && (event.sequence.toLowerCase() === "c" || name === "c")))
  );
}

function isPauseToggleEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return (
    !event.meta &&
    (event.sequence === "\x10" ||
      (event.ctrl && (event.sequence.toLowerCase() === "p" || name === "p")))
  );
}

function isPracticeOptionsEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return (
    !event.meta &&
    (event.sequence === "\x0f" ||
      (event.ctrl && (event.sequence.toLowerCase() === "o" || name === "o")))
  );
}

function isRepeatEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return !event.ctrl && !event.meta && (event.sequence.toLowerCase() === "r" || name === "r");
}

function isRestartGroupEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return (
    !event.meta &&
    (event.sequence === "\x0e" ||
      (event.ctrl && (event.sequence.toLowerCase() === "n" || name === "n")))
  );
}

function codeControlFromEvent(event: OpenTuiKeyEvent): LiveCodeControl | undefined {
  if (event.meta) {
    return undefined;
  }
  const controlSequence = codeControlFromSequence(event.sequence);
  if (controlSequence !== undefined) {
    return controlSequence;
  }
  if (!event.ctrl) {
    return undefined;
  }
  const values = [event.sequence, event.name].map(normalizedControlValue);
  if (values.includes("r")) {
    return "refresh";
  }
  return undefined;
}

function normalizedControlValue(value: string): string {
  const normalized = value.toLowerCase();
  const kittyControl = /^\x1b\[(\d+);5u$/u.exec(normalized);
  if (kittyControl !== null) {
    const codePoint = Number(kittyControl[1]);
    if (Number.isInteger(codePoint)) {
      return String.fromCodePoint(codePoint).toLowerCase();
    }
  }
  for (const prefix of ["ctrl+", "ctrl-", "c-", "^"]) {
    if (normalized.startsWith(prefix)) {
      return normalized.slice(prefix.length);
    }
  }
  return normalized;
}

function codeControlFromSequence(sequence: string): LiveCodeControl | undefined {
  switch (sequence) {
    case "\x12":
      return "refresh";
    default:
      return undefined;
  }
}

function isArrowUpEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return name === "up" || name === "arrowup" || event.sequence === "\x1b[A";
}

function isArrowDownEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return name === "down" || name === "arrowdown" || event.sequence === "\x1b[B";
}

function isArrowRightEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return name === "right" || name === "arrowright" || event.sequence === "\x1b[C";
}

function isArrowLeftEvent(event: OpenTuiKeyEvent): boolean {
  const name = event.name.toLowerCase();
  return name === "left" || name === "arrowleft" || event.sequence === "\x1b[D";
}

function isLiveCodeSettingsEnabled(context: StartRunnerContext): boolean {
  return (
    context.dailyPlan.run_id.length === 0 &&
    context.sourceItem !== undefined &&
    submenuForStandaloneItem(context.sourceItem) === "code" &&
    context.targetContext !== undefined
  );
}

function isLiveEverydayOptionsEnabled(context: StartRunnerContext): boolean {
  return (
    context.dailyPlan.run_id.length === 0 &&
    context.targetContext !== undefined &&
    (context.sourceItem === "everyday_words" ||
      context.sourceItem === "everyday_sentences" ||
      context.sourceItem === "everyday_articles" ||
      context.sourceItem === "everyday_word_decomposition")
  );
}

function isLivePracticeOptionsEnabled(context: StartRunnerContext): boolean {
  return isLiveCodeSettingsEnabled(context) || isLiveEverydayOptionsEnabled(context);
}

function isStandaloneTargetRefreshEnabled(context: StartRunnerContext): boolean {
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

function nextCodeConfigForControl(
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

function practiceOptionsStateForContext(
  context: StartRunnerContext,
  selectedIndex: number,
  language: StartRunnerContext["language"],
): OpenTuiPracticeOptionsState {
  const items =
    isLiveCodeSettingsEnabled(context)
      ? codePracticeOptionItems(context.codeConfig, language)
      : everydayPracticeOptionItems(
          context.sourceItem,
          everydaySettingsForContext(context),
          language,
        );
  return {
    selected_index: Math.min(Math.max(selectedIndex, 0), items.length - 1),
    items,
  };
}

function codePracticeOptionItems(
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

function everydayPracticeOptionItems(
  sourceItem: OpenTuiMenuItemId | undefined,
  settings: EverydayEnglishSettings,
  language: StartRunnerContext["language"],
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

function nextPracticeOptionsIndex(
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

function practiceOptionControlForIndex(
  context: StartRunnerContext,
  index: number,
): PracticeOptionControl | undefined {
  if (isLiveCodeSettingsEnabled(context)) {
    return { domain: "code", control: index <= 0 ? "difficulty" : "length" };
  }
  const sourceItem = context.sourceItem;
  if (!isLiveEverydayOptionsEnabled(context)) {
    return undefined;
  }
  switch (sourceItem) {
    case "everyday_words":
      return {
        domain: "everyday",
        control: index <= 0 ? "word_range" : "word_count",
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

function everydaySettingsForContext(context: StartRunnerContext): EverydayEnglishSettings {
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
    ...context.targetContext?.everydaySettings,
  };
}

function nextEverydaySettingsForControl(
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

function cycleCodeOption<const T extends readonly string[]>(
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

function cycleStringOption<const T extends readonly string[]>(
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

function cycleNumberOption<const T extends readonly number[]>(
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

function liveKeyFromOpenTuiEvent(event: OpenTuiKeyEvent): LiveKey | undefined {
  const name = event.name.toLowerCase();
  if (name === "backspace" || event.sequence === "\b" || event.sequence === "\x7f") {
    return { kind: "backspace" };
  }
  if (
    name === "enter" ||
    name === "return" ||
    event.sequence === "\r" ||
    event.sequence === "\n"
  ) {
    return { kind: "enter" };
  }
  if (name === "tab" || event.sequence === "\t") {
    return { kind: "tab" };
  }

  const value = singlePrintableCharacter(event.sequence) ?? singlePrintableCharacter(event.name);
  if (value === undefined) {
    return undefined;
  }
  return {
    kind: "char",
    value,
    ctrl: event.ctrl,
    alt: event.meta,
  };
}

function liveKeyCanMutateSession(session: LiveSessionState, key: LiveKey): boolean {
  const inputLength = Array.from(session.input).length;
  if (inputLength >= session.target_chars.length && key.kind !== "backspace") {
    return false;
  }
  switch (key.kind) {
    case "backspace":
      return inputLength > 0;
    case "char":
      return key.ctrl !== true && key.alt !== true && isAsciiLiveCharacter(key.value);
    case "enter":
    case "tab":
      return true;
  }
}

function singlePrintableCharacter(value: string): string | undefined {
  const chars = Array.from(value);
  const char = chars[0];
  if (chars.length !== 1 || char === undefined) {
    return undefined;
  }
  const codePoint = char.codePointAt(0);
  if (codePoint === undefined || codePoint < 0x20 || codePoint === 0x7f) {
    return undefined;
  }
  return char;
}

function isAsciiLiveCharacter(value: string): boolean {
  const char = Array.from(value)[0];
  const codePoint = char?.codePointAt(0);
  return codePoint !== undefined && codePoint <= 0x7f;
}

function isSessionComplete(input: string, target: string): boolean {
  return Array.from(input).length >= Array.from(target).length;
}

function nowMs(options: OpenTuiStartRunnerOptions): number {
  return options.nowMs?.() ?? Date.now();
}
