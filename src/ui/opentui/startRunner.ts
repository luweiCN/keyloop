import { join } from "node:path";

import type {
  CodePracticeConfig,
  CompletionState,
  EverydayEnglishSettings,
  PracticeTargetAnnotation,
  PracticeLesson,
  SessionRecord,
  UserPreferences,
} from "../../domain/model";
import {
  playWordAudio,
  resolveWordAudio,
  type WordAudioSourceItem,
} from "../../audio/wordAudio";
import {
  createMacOsYoudaoCredentialStore,
  resolveYoudaoTtsCredentials,
} from "../../audio/youdaoCredentials";
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
  submenuForStandaloneItem,
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

import {
  codeControlFromEvent,
  codeControlFromSequence,
  isArrowDownEvent,
  isArrowLeftEvent,
  isArrowRightEvent,
  isArrowUpEvent,
  isCtrlCEvent,
  isEnterEvent,
  isEscapeEvent,
  isPauseToggleEvent,
  isPracticeOptionsEvent,
  isQuitEvent,
  isRepeatEvent,
  isRestartGroupEvent,
  isSpaceEvent,
  liveKeyFromOpenTuiEvent,
  isAsciiLiveCharacter,
} from "./runnerEvents";
import {
  codeControlFromPostCompletionAction,
  everydayPracticeOptionItems,
  everydaySettingsForContext,
  nextCodeConfigForControl,
  nextCustomLibrarySettingsForControl,
  nextEverydaySettingsForControl,
  nextProgrammingTermsSettingsForControl,
  nextWordAudioSettingsForControl,
  nextWordBreakdownSettingsForControl,
  nextPracticeOptionsIndex,
  postCompletionActionForCodeControl,
  practiceOptionControlForIndex,
  practiceOptionsStateForContext,
  programmingTermsSettingsForContext,
  customLibrarySettingsForContext,
  wordAudioSettingsForContext,
  wordBreakdownSettingsForContext,
  type LiveCodeControl,
  type LiveEverydayControl,
  type PostCompletionAction,
  type PracticeOptionControl,
} from "./practiceOptions";
import {
  cloneCodeConfig,
  completedLessonsForRun,
  firstUnfinishedLesson,
  refreshSelectionForCurrentRecords,
  refreshTargetContext,
  refreshedStandaloneSelection,
  refreshedTargetContext,
  isStandaloneRun,
  isStandaloneTargetRefreshEnabled,
  isLiveCodeSettingsEnabled,
  isLiveEverydayOptionsEnabled,
  isLivePracticeOptionsEnabled,
  saveCheckpointForSelection,
  saveRecordIfAvailable,
  startRunnerContextWithCodeConfig,
  startRunnerContextWithEverydaySettings,
  startRunnerContextWithProgrammingTermsSettings,
  startRunnerContextWithRuntimeSettings,
  startRunnerContextWithWordBreakdownSettings,
  todayElapsedMsForRun,
  type LessonSelection,
} from "./runnerSelection";

export const IDLE_AUTO_PAUSE_MS = 10_000;

export interface OpenTuiStartRunnerOptions {
  kit?: OpenTuiRendererKit;
  nowMs?: () => number;
  timerIntervalMs?: number;
  wordAudio?: WordAudioPlayback;
}

export interface WordAudioPlaybackRequest {
  text: string;
  sourceItem: WordAudioSourceItem;
  dataDir: string;
  volumePercent: number;
}

export interface WordAudioPlayback {
  play: (request: WordAudioPlaybackRequest) => Promise<void> | void;
  prefetch?: (requests: WordAudioPlaybackRequest[]) => Promise<void> | void;
}

const defaultWordAudioPlayback: WordAudioPlayback = {
  play: async (request) => {
    const credentials = await resolveDefaultYoudaoCredentials();
    const path = await resolveWordAudio({
      text: request.text,
      sourceItem: request.sourceItem,
      cacheDir: join(request.dataDir, "audio-cache"),
      credentials,
    });
    if (path !== null) {
      await playWordAudio(path, undefined, audioVolumeFromPercent(request.volumePercent));
    }
  },
  prefetch: async (requests) => {
    const credentials = await resolveDefaultYoudaoCredentials();
    for (const request of requests) {
      await resolveWordAudio({
        text: request.text,
        sourceItem: request.sourceItem,
        cacheDir: join(request.dataDir, "audio-cache"),
        credentials,
      }).catch(() => null);
    }
  },
};

const defaultYoudaoCredentialStore = createMacOsYoudaoCredentialStore();

async function resolveDefaultYoudaoCredentials() {
  const credentials = await resolveYoudaoTtsCredentials({
    ...(defaultYoudaoCredentialStore === null ? {} : { store: defaultYoudaoCredentialStore }),
  });
  return credentials === null
    ? null
    : { appKey: credentials.appKey, appSecret: credentials.appSecret };
}

export interface LessonRunResult {
  record: SessionRecord | null;
  renderer?: OpenTuiRenderer;
}

export interface PostCompletionResult {
  action: PostCompletionAction;
  renderer: OpenTuiRenderer;
}

export function createOpenTuiStartRunner(
  options: OpenTuiStartRunnerOptions = {},
): StartRunner {
  return async (context) => openTuiStartRunner(context, options);
}

export async function openTuiStartRunner(
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
  let runtimeWordBreakdownSettings =
    context.targetContext?.wordBreakdownSettings === undefined
      ? undefined
      : wordBreakdownSettingsForContext(context);
  let runtimeProgrammingTermsSettings =
    context.targetContext?.programmingTermsSettings === undefined
      ? undefined
      : programmingTermsSettingsForContext(context);
  let runtimeWordAudioSettings =
    context.wordAudioSettings === undefined ? undefined : wordAudioSettingsForContext(context);
  let runtimeCustomLibrarySettings =
    context.customLibrarySettings === undefined
      ? undefined
      : customLibrarySettingsForContext(context);
  let openPracticeOptionsOnNextRun = false;
  const withRuntimeSettings = (result: StartRunnerResult): StartRunnerResult => ({
    ...result,
    ...(runtimeWordAudioSettings === undefined
      ? {}
      : { wordAudioSettings: runtimeWordAudioSettings }),
  });

  for (;;) {
    const runtimeContext = startRunnerContextWithRuntimeSettings(
      context,
      runtimeCodeConfig,
      runtimeEverydaySettings,
      runtimeWordBreakdownSettings,
      runtimeProgrammingTermsSettings,
      runtimeWordAudioSettings,
      runtimeCustomLibrarySettings,
    );
    const shouldOpenPracticeOptions = openPracticeOptionsOnNextRun;
    const forced = forcedSelection;
    const storedSelection = forced ?? firstUnfinishedLesson(runtimeContext, completedRecords);
    forcedSelection = undefined;
    openPracticeOptionsOnNextRun = false;
    if (storedSelection === undefined) {
      reusableRenderer?.destroy?.();
      return withRuntimeSettings({ completedRecords });
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
      return withRuntimeSettings({ completedRecords });
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
      (nextSettings) => {
        runtimeWordBreakdownSettings = { ...nextSettings };
      },
      (nextSettings) => {
        runtimeProgrammingTermsSettings = { ...nextSettings };
      },
      (nextSettings) => {
        runtimeWordAudioSettings = { ...nextSettings };
      },
      (nextSettings) => {
        runtimeCustomLibrarySettings = { ...nextSettings };
      },
      shouldOpenPracticeOptions,
    );
    const record = runResult.record;
    if (record === null) {
      if (runResult.renderer !== undefined && context.returnState !== undefined) {
        await runResult.renderer.renderState?.(context.returnState);
        return withRuntimeSettings({
          completedRecords,
          renderer: runResult.renderer,
          state: context.returnState,
        });
      }
      return withRuntimeSettings({ completedRecords });
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
        return withRuntimeSettings({
          completedRecords,
          renderer: completionResult.renderer,
          state: context.returnState,
        });
      }
      completionResult.renderer.destroy?.();
      return withRuntimeSettings({ completedRecords });
    }

    if (completionResult.action === "stop") {
      completionResult.renderer.destroy?.();
      return withRuntimeSettings({ completedRecords });
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
      return withRuntimeSettings({ completedRecords });
    }
  }
}

export async function rendererForRunningState(
  state: OpenTuiAppState,
  options: OpenTuiStartRunnerOptions,
  reusableRenderer: OpenTuiRenderer | undefined,
): Promise<OpenTuiRenderer> {
  return rendererForState(state, options, reusableRenderer);
}

export async function rendererForState(
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

export function runningStateForLesson(
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

export function liveStateFromTarget(target: PracticeLesson["target"]): OpenTuiRunningLiveState {
  return {
    input: "",
    elapsed_ms: 0,
    key_events: [],
    metrics: liveMetrics(target.text, "", [], 0),
  };
}

export async function runLessonUntilComplete(
  context: StartRunnerContext,
  initialSelection: LessonSelection,
  initialRenderer: OpenTuiRenderer,
  options: OpenTuiStartRunnerOptions,
  todayElapsedBeforeLesson: number,
  onCodeConfigChange: (config: CodePracticeConfig) => void,
  onEverydaySettingsChange: (settings: EverydayEnglishSettings) => void,
  onWordBreakdownSettingsChange: (
    settings: UserPreferences["word_breakdown"],
  ) => void,
  onProgrammingTermsSettingsChange: (
    settings: UserPreferences["programming_terms"],
  ) => void,
  onWordAudioSettingsChange: (settings: UserPreferences["word_audio"]) => void,
  onCustomLibrarySettingsChange: (
    settings: UserPreferences["custom_library"],
  ) => void,
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
    let spokenAudioAnnotations = new Set<string>();
    const prefetchedAudioTargets = new Set<string>();
    const wordAudioPlayback = options.wordAudio ?? defaultWordAudioPlayback;
    const resetSpokenAudioAnnotations = (): void => {
      spokenAudioAnnotations = new Set();
    };
    const scheduleWordAudioPrefetch = (): void => {
      const requests = wordAudioRequestsForTarget(
        currentContext,
        selection.lesson.target.annotations,
      );
      if (requests.length === 0) {
        return;
      }
      const settings = wordAudioSettingsForContext(currentContext);
      const key = `${currentContext.sourceItem ?? ""}:${settings.volume_percent}:${selection.lesson.target.source}:${selection.lesson.target.text}`;
      if (prefetchedAudioTargets.has(key)) {
        return;
      }
      prefetchedAudioTargets.add(key);
      void Promise.resolve(wordAudioPlayback.prefetch?.(requests)).catch(() => undefined);
    };
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
      resetSpokenAudioAnnotations();
      startedAtMs = undefined;
      pausedTotalMs = 0;
      pausedAtMs = undefined;
      resumeOnNextInput = false;
      clearTimer();
      scheduleWordAudioPrefetch();
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
      resetSpokenAudioAnnotations();
      startedAtMs = undefined;
      pausedTotalMs = 0;
      pausedAtMs = undefined;
      resumeOnNextInput = false;
      clearTimer();
      scheduleWordAudioPrefetch();
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
    const refreshWordBreakdownTarget = async (
      nextSettings: UserPreferences["word_breakdown"],
      currentMs: number,
      refreshOptions: { keepPracticeOptionsOpen?: boolean } = {},
    ): Promise<void> => {
      currentContext = startRunnerContextWithWordBreakdownSettings(
        currentContext,
        nextSettings,
      );
      onWordBreakdownSettingsChange(nextSettings);
      selection = refreshedStandaloneSelection(currentContext, selection, []);
      session = createLiveSession(selection.lesson.target);
      resetSpokenAudioAnnotations();
      startedAtMs = undefined;
      pausedTotalMs = 0;
      pausedAtMs = undefined;
      resumeOnNextInput = false;
      clearTimer();
      scheduleWordAudioPrefetch();
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
    const refreshProgrammingTermsTarget = async (
      nextSettings: UserPreferences["programming_terms"],
      currentMs: number,
      refreshOptions: { keepPracticeOptionsOpen?: boolean } = {},
    ): Promise<void> => {
      currentContext = startRunnerContextWithProgrammingTermsSettings(
        currentContext,
        nextSettings,
      );
      onProgrammingTermsSettingsChange(nextSettings);
      selection = refreshedStandaloneSelection(currentContext, selection, []);
      session = createLiveSession(selection.lesson.target);
      resetSpokenAudioAnnotations();
      startedAtMs = undefined;
      pausedTotalMs = 0;
      pausedAtMs = undefined;
      resumeOnNextInput = false;
      clearTimer();
      scheduleWordAudioPrefetch();
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
    const refreshCustomLibraryTarget = async (
      nextSettings: UserPreferences["custom_library"],
      currentMs: number,
      refreshOptions: { keepPracticeOptionsOpen?: boolean } = {},
    ): Promise<void> => {
      currentContext = {
        ...currentContext,
        customLibrarySettings: nextSettings,
      };
      onCustomLibrarySettingsChange(nextSettings);
      selection = refreshedStandaloneSelection(currentContext, selection, []);
      session = createLiveSession(selection.lesson.target);
      resetSpokenAudioAnnotations();
      startedAtMs = undefined;
      pausedTotalMs = 0;
      pausedAtMs = undefined;
      resumeOnNextInput = false;
      clearTimer();
      scheduleWordAudioPrefetch();
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
    const updateWordAudioSettings = async (
      nextSettings: UserPreferences["word_audio"],
      currentMs: number,
    ): Promise<void> => {
      currentContext = {
        ...currentContext,
        wordAudioSettings: nextSettings,
      };
      onWordAudioSettingsChange(nextSettings);
      scheduleWordAudioPrefetch();
      if (practiceOptionsOpen) {
        await renderPracticeOptions(currentMs);
      }
    };
    const refreshStandaloneTarget = async (currentMs: number): Promise<void> => {
      selection = refreshedStandaloneSelection(currentContext, selection, []);
      session = createLiveSession(selection.lesson.target);
      resetSpokenAudioAnnotations();
      startedAtMs = undefined;
      pausedTotalMs = 0;
      pausedAtMs = undefined;
      resumeOnNextInput = false;
      clearTimer();
      scheduleWordAudioPrefetch();
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
      resetSpokenAudioAnnotations();
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
            wordFormSettings: {
              word_breakdown: wordBreakdownSettingsForContext(currentContext),
              programming_terms: programmingTermsSettingsForContext(currentContext),
            },
            wordAudioSettings: wordAudioSettingsForContext(currentContext),
            customLibrarySettings: customLibrarySettingsForContext(currentContext),
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
      if (option.domain === "word_breakdown") {
        const nextSettings = nextWordBreakdownSettingsForControl(
          wordBreakdownSettingsForContext(currentContext),
          option.control,
          direction,
        );
        await refreshWordBreakdownTarget(nextSettings, currentMs, {
          keepPracticeOptionsOpen: true,
        });
        return;
      }
      if (option.domain === "programming_terms") {
        const nextSettings = nextProgrammingTermsSettingsForControl(
          programmingTermsSettingsForContext(currentContext),
          option.control,
          direction,
        );
        await refreshProgrammingTermsTarget(nextSettings, currentMs, {
          keepPracticeOptionsOpen: true,
        });
        return;
      }
      if (option.domain === "custom_library") {
        const nextSettings = nextCustomLibrarySettingsForControl(
          customLibrarySettingsForContext(currentContext),
          option.control,
          direction,
        );
        await refreshCustomLibraryTarget(nextSettings, currentMs, {
          keepPracticeOptionsOpen: true,
        });
        return;
      }
      if (option.domain === "word_audio") {
        const nextSettings = nextWordAudioSettingsForControl(
          wordAudioSettingsForContext(currentContext),
          option.control,
          direction,
        );
        await updateWordAudioSettings(nextSettings, currentMs);
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
      const beforeInputLength = session.input.length;
      applyLiveKey(session, key, elapsedMs);
      triggerWordAudioForInput(key, beforeInputLength);

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

    const triggerWordAudioForInput = (key: LiveKey, beforeInputLength: number): void => {
      if (key.kind === "backspace" || session.input.length === beforeInputLength) {
        return;
      }
      if (!wordAudioSettingsForContext(currentContext).enabled) {
        return;
      }
      const sourceItem = wordAudioSourceItemForContext(currentContext);
      if (sourceItem === undefined) {
        return;
      }
      const annotation = activeWordAudioAnnotation(
        selection.lesson.target.annotations,
        session.input.length,
      );
      if (annotation?.audio_text === undefined) {
        return;
      }
      const keyForAnnotation = `${annotation.start}:${annotation.end}:${annotation.audio_text}`;
      if (spokenAudioAnnotations.has(keyForAnnotation)) {
        return;
      }
      spokenAudioAnnotations.add(keyForAnnotation);
      void Promise.resolve(
        wordAudioPlayback.play({
          text: annotation.audio_text,
          sourceItem,
          dataDir: currentContext.dataDir,
          volumePercent: wordAudioSettingsForContext(currentContext).volume_percent,
        }),
      ).catch(() => undefined);
    };

    renderer.keyInput?.on("keypress", handleKeypress);
    scheduleWordAudioPrefetch();
    if (openPracticeOptionsInitially) {
      void showPracticeOptions(nowMs(options));
    }
  });
}

export function liveStateFromSession(
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

export async function showCompletionPage(
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

export function completionLiveStateFromRecord(record: SessionRecord): OpenTuiRunningLiveState {
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

export async function showSummaryPage(
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

export function waitForPostCompletionAction(
  renderer: OpenTuiRenderer,
  initialState: OpenTuiAppState,
  options: {
    codeControlsEnabled?: boolean;
    destroyOnSettle?: boolean;
  } = {},
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

export function waitForSummaryDismiss(renderer: OpenTuiRenderer): Promise<void> {
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

export function recordOptions(
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

export function liveKeyCanMutateSession(session: LiveSessionState, key: LiveKey): boolean {
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

function wordAudioSourceItemForContext(
  context: StartRunnerContext,
): WordAudioSourceItem | undefined {
  const sourceItem = context.sourceItem;
  if (sourceItem === "everyday_words") {
    return "everyday_words";
  }
  if (sourceItem === "programming_terms") {
    return "programming_terms";
  }
  if (sourceItem === "technical_long_words" || sourceItem === "long_word_breakdown") {
    return "technical_long_words";
  }
  if (sourceItem?.startsWith("library_kind_") === true && sourceItem.endsWith(":words")) {
    return "library_words";
  }
  return undefined;
}

function activeWordAudioAnnotation(
  annotations: PracticeTargetAnnotation[] | undefined,
  position: number,
): PracticeTargetAnnotation | undefined {
  return annotations?.find((annotation) => {
    if (annotation.audio_text === undefined) {
      return false;
    }
    if (annotation.display !== "word" && annotation.display !== "word_loose") {
      return false;
    }
    return position >= annotation.start && position <= annotation.end;
  });
}

function wordAudioRequestsForTarget(
  context: StartRunnerContext,
  annotations: PracticeTargetAnnotation[] | undefined,
): WordAudioPlaybackRequest[] {
  if (!wordAudioSettingsForContext(context).enabled) {
    return [];
  }
  const sourceItem = wordAudioSourceItemForContext(context);
  if (sourceItem === undefined) {
    return [];
  }
  const settings = wordAudioSettingsForContext(context);
  const seen = new Set<string>();
  const requests: WordAudioPlaybackRequest[] = [];
  for (const annotation of annotations ?? []) {
    if (annotation.audio_text === undefined) {
      continue;
    }
    if (annotation.display !== "word" && annotation.display !== "word_loose") {
      continue;
    }
    const text = annotation.audio_text.trim();
    if (text.length === 0 || seen.has(text)) {
      continue;
    }
    seen.add(text);
    requests.push({
      text,
      sourceItem,
      dataDir: context.dataDir,
      volumePercent: settings.volume_percent,
    });
  }
  return requests;
}

function audioVolumeFromPercent(volumePercent: number): number {
  return Math.min(Math.max(volumePercent, 0), 100) / 100;
}



export function isSessionComplete(input: string, target: string): boolean {
  return Array.from(input).length >= Array.from(target).length;
}

export function nowMs(options: OpenTuiStartRunnerOptions): number {
  return options.nowMs?.() ?? Date.now();
}
