import { describe, expect, test } from "bun:test";

import {
  createOpenTuiCompletionState,
  createOpenTuiInitialState,
  createOpenTuiStartRunner,
  waitForPostCompletionAction,
  defaultCodePracticeConfig,
  defaultSessionRecord,
  renderOpenTuiAppOnce,
  runOpenTuiAppSession,
  type BuildTargetContext,
  type ContentLibrary,
  type CustomLibrary,
  type DailyPracticePlan,
  type OpenTuiAppState,
  type OpenTuiRendererKit,
  type PracticeLesson,
  type PracticePlan,
  type SessionRecord,
  type StartRunnerContext,
} from "../src/index";
import { injectUiEvent, WHEEL_UP_EVENT } from "../src/ui/opentui/uiEventBus";
import { refreshSelectionForCurrentRecords } from "../src/ui/opentui/runnerSelection";

interface FakeNode {
  type: "Box" | "Text";
  props: Record<string, unknown>;
  children: FakeNode[];
}

describe("OpenTUI start runner", () => {
  test("renders the first daily lesson when nothing is completed", async () => {
    const kit = fakeKit();
    const runner = createOpenTuiStartRunner({ kit });

    const result = await runner(contextWithPlan(testDailyPlan()));

    expect(result.completedRecords).toEqual([]);
    const content = flattenContent(kit.addedNodes);
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-cursor-0-0")?.props.content).toBe("f");
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-pending-0-1")?.props.content).toBe(
      "oundation text",
    );
    expect(content).toContain("foundation_input");
    expect(content).toContain("WPM");
    expect(content).toContain("0.0");
    expect(content).toContain("Raw");
    expect(content).toContain("Accuracy");
    expect(content).toContain("100.0%");
    expect(content).toContain("Errors");
    expect(content).toContain("0%");
  });

  test("reuses an initial app renderer for the first running lesson", async () => {
    const kit = fakeKit({ keyInput: true });
    const initialRenderer = await renderOpenTuiAppOnce(createOpenTuiInitialState("en"), kit);
    const runner = createOpenTuiStartRunner({ kit });

    const runPromise = runner({
      ...contextWithPlan(testSingleLessonPlan("ab")),
      initialRenderer,
    });

    await kit.waitForKeyListener(1);
    expect(kit.createdOptions).toHaveLength(1);
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-cursor-0-0")?.props.content).toBe("a");
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-pending-0-1")?.props.content).toBe("b");

    kit.emitKey({ name: "c", sequence: "c", ctrl: true });
    const result = await runPromise;

    expect(result.completedRecords).toEqual([]);
    expect(kit.createdOptions).toHaveLength(1);
    expect(kit.destroyed).toBe(1);
  });

  test("skips completed lessons for the current daily run", async () => {
    const kit = fakeKit();
    const runner = createOpenTuiStartRunner({ kit });
    const plan = testDailyPlan();
    const completed = defaultSessionRecord({
      daily_run_id: plan.run_id,
      lesson_id: "lesson-foundation",
      completion_state: "completed",
    });

    await runner(contextWithPlan(plan, [completed]));

    const content = flattenContent(kit.addedNodes);
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-cursor-0-0")?.props.content).toBe("e");
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-pending-0-1")?.props.content).toBe(
      "veryday text",
    );
    expect(content).toContain("everyday_english");
    expect(content).not.toContain("oundation text");
  });

  test("does not render when every lesson is complete", async () => {
    const kit = fakeKit();
    const runner = createOpenTuiStartRunner({ kit });
    const plan = testDailyPlan();
    const records = plan.lessons.map((lesson) =>
      defaultSessionRecord({
        daily_run_id: plan.run_id,
        lesson_id: lesson.id,
        completion_state: "completed",
      }),
    );

    const result = await runner(contextWithPlan(plan, records));

    expect(result.completedRecords).toEqual([]);
    expect(kit.addedNodes).toEqual([]);
    expect(kit.createdOptions).toEqual([]);
  });

  test("materializes a pending lazy stage lesson on open so it can be typed", async () => {
    const kit = fakeKit({ keyInput: true });
    const runner = createOpenTuiStartRunner({ kit });

    const runPromise = runner(contextWithStageLibrary(pendingComprehensivePlan()));

    await kit.waitForKeyListener(1);
    // 惰性课开练时必须组卷成可打 target：首帧渲染真实单词而非空 pending 文本
    const ghost = findNodeById(kit.addedNodes, "keyloop-ghost-pending-0-0");
    expect((ghost?.props.content as string)?.length ?? 0).toBeGreaterThan(0);
    expect(flattenContent(kit.addedNodes)).toMatch(/today|practice|information/);

    kit.emitKey({ name: "c", sequence: "c", ctrl: true });
    await runPromise;
  });

  test("refreshing a comprehensive lesson clears pending once corpus is built", () => {
    // 已落盘开练（run_id 非空）的 pending 课经 refresh 即组卷成可打 target，
    // pending 标记应一并清除，避免 startRunner 再 materialize 时重复组卷
    const plan: DailyPracticePlan = {
      ...pendingComprehensivePlan(),
      run_id: "20260615-1-run",
    };
    const context = contextWithStageLibrary(plan);

    const result = refreshSelectionForCurrentRecords(
      context,
      { lesson: plan.lessons[0]!, index: 0 },
      [],
    );

    expect(result.lesson.target.text.length).toBeGreaterThan(0);
    expect(result.lesson.pending).toBeUndefined();
  });

  test("typing the displayed lesson returns a completed session record", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 1_000;
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });
    const plan = testSingleLessonPlan("ab");

    const runPromise = runner(contextWithPlan(plan));
    const listenerReady = await Promise.race([
      kit.waitForKeyListener().then(() => true),
      runPromise.then(() => false),
      delay(50).then(() => false),
    ]);

    expect(listenerReady).toBe(true);

    nowMs = 1_100;
    kit.emitKey({ name: "a", sequence: "a" });
    nowMs = 1_300;
    kit.emitKey({ name: "b", sequence: "b" });

    const completeReady = await Promise.race([
      kit.waitForKeyListener(2).then(() => true),
      runPromise.then(() => false),
      delay(50).then(() => false),
    ]);

    expect(completeReady).toBe(true);
    expect(flattenContent(kit.addedNodes)).toContain("Lesson complete");

    await dismissCompletionResult(kit);
    kit.emitKey({ name: "enter", sequence: "\r" });

    const summaryReady = await Promise.race([
      kit.waitForKeyListener(3).then(() => true),
      runPromise.then(() => false),
      delay(50).then(() => false),
    ]);

    expect(summaryReady).toBe(true);
    expect(flattenContent(kit.addedNodes)).toContain("Daily summary");

    kit.emitKey({ name: "enter", sequence: "\r" });

    const result = await runPromise;
    const record = result.completedRecords[0];

    expect(result.completedRecords).toHaveLength(1);
    expect(record?.target_text).toBe("ab");
    expect(record?.user_input).toBe("ab");
    expect(record?.daily_run_id).toBe(plan.run_id);
    expect(record?.lesson_id).toBe("lesson-foundation");
    expect(record?.lesson_index).toBe(0);
    expect(record?.module).toBe("foundation_input");
    expect(record?.category).toBe("foundation_mix");
    expect(record?.duration_ms).toBe(200);
    expect(record?.key_events.map((event) => event.at_ms)).toEqual([0, 200]);
    expect(kit.destroyed).toBe(1);
  });

  test("auto-pauses after 10s idle and excludes idle time from the record", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 1_000;
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
      timerIntervalMs: 5,
    });
    const plan = testSingleLessonPlan("abc");

    const runPromise = runner(contextWithPlan(plan));
    await kit.waitForKeyListener(1);

    nowMs = 1_100;
    kit.emitKey({ name: "a", sequence: "a" });
    await kit.waitForRenderRequest(1);

    // Walk away for 11 seconds; the timer tick should auto-pause the lesson.
    nowMs = 1_100 + 11_000;
    const deadline = Date.now() + 1_000;
    while (Date.now() < deadline && !flattenContent(kit.addedNodes).includes("Paused")) {
      await delay(10);
    }
    expect(flattenContent(kit.addedNodes)).toContain("Paused");

    // The next input key resumes the session and counts as a keystroke.
    nowMs = 1_100 + 36_000;
    kit.emitKey({ name: "b", sequence: "b" });
    nowMs = 1_100 + 36_100;
    kit.emitKey({ name: "c", sequence: "c" });

    await kit.waitForKeyListener(2);
    await dismissCompletionResult(kit);
    kit.emitKey({ name: "enter", sequence: "\r" });
    await kit.waitForKeyListener(3);
    kit.emitKey({ name: "enter", sequence: "\r" });

    const result = await runPromise;
    const record = result.completedRecords[0];

    expect(result.completedRecords).toHaveLength(1);
    expect(record?.user_input).toBe("abc");
    // All idle time from the last keystroke onward is excluded: only the
    // 100ms between "b" and "c" counts.
    expect(record?.duration_ms).toBe(100);
  });

  test("ctrl-n restarts the current group without changing the target", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 1_000;
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });
    const plan = testSingleLessonPlan("ab");

    const runPromise = runner(contextWithPlan(plan));
    await kit.waitForKeyListener(1);

    nowMs = 1_100;
    kit.emitKey({ name: "a", sequence: "a" });
    await kit.waitForRenderRequest(1);
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-typed-0-0")?.props.content).toBe("a");

    nowMs = 1_300;
    kit.emitKey({ name: "n", sequence: "\x0e", ctrl: true });
    await kit.waitForRenderRequest(2);
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-cursor-0-0")?.props.content).toBe("a");
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-pending-0-1")?.props.content).toBe("b");
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-typed-0-0")).toBeUndefined();

    kit.emitKey({ name: "c", sequence: "c", ctrl: true });

    const result = await runPromise;

    expect(result.completedRecords).toEqual([]);
  });

  test("standalone foundation ctrl-r starts a fresh group target", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 1_000;
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });
    const library = refreshLibrary();
    library.foundation_drills = [
      {
        id: "home-row",
        title_zh: "",
        title_en: "",
        hint_zh: "",
        hint_en: "",
        items: ["beta"],
      },
    ];
    const plan: DailyPracticePlan = {
      run_id: "",
      run_number: 0,
      target_minutes: 4,
      completed_ms: 0,
      lessons: [
        {
          ...lesson("standalone-foundation", "foundation_input", "alpha"),
          mix_profile: "standalone",
        },
      ],
    };

    const runPromise = runner({
      ...contextWithPlan(plan),
      sourceItem: "foundation_home_row",
      targetContext: {
        records: [],
        plan: refreshPlan(),
        library,
      },
    });
    await kit.waitForKeyListener(1);

    nowMs = 1_100;
    kit.emitKey({ name: "a", sequence: "a" });
    await kit.waitForRenderRequest(1);
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-typed-0-0")?.props.content).toBe("a");

    nowMs = 1_300;
    kit.emitKey({ name: "r", sequence: "\x12", ctrl: true });
    await kit.waitForRenderRequest(2);
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-cursor-0-0")?.props.content).toBe("b");
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-pending-0-1")?.props.content).toBe("eta");
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-typed-0-0")).toBeUndefined();

    kit.emitKey({ name: "c", sequence: "c", ctrl: true });

    const result = await runPromise;

    expect(result.completedRecords).toEqual([]);
  });

  test("completion popup and final summary reuse the running renderer", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 1_000;
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });

    const runPromise = runner(contextWithPlan(testSingleLessonPlan("a")));
    await kit.waitForKeyListener(1);

    nowMs = 1_100;
    kit.emitKey({ name: "a", sequence: "a" });

    const completeReady = await Promise.race([
      kit.waitForKeyListener(2).then(() => true),
      runPromise.then(() => false),
      delay(50).then(() => false),
    ]);

    expect(completeReady).toBe(true);
    expect(flattenContent(kit.addedNodes)).toContain("Lesson complete");
    expect(kit.createdOptions).toHaveLength(1);
    expect(kit.destroyed).toBe(0);

    await dismissCompletionResult(kit);
    kit.emitKey({ name: "enter", sequence: "\r" });
    await kit.waitForKeyListener(3);

    expect(flattenContent(kit.addedNodes)).toContain("Daily summary");
    expect(kit.createdOptions).toHaveLength(1);
    expect(kit.destroyed).toBe(0);

    kit.emitKey({ name: "enter", sequence: "\r" });
    await runPromise;

    expect(kit.destroyed).toBe(1);
  });


  test("typing updates the running screen with live metrics", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 1_000;
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });

    const runPromise = runner(contextWithPlan(testSingleLessonPlan("ab")));
    await kit.waitForKeyListener(1);

    nowMs = 1_100;
    kit.emitKey({ name: "a", sequence: "a" });
    await kit.waitForRenderRequest(1);
    const contentAfterFirstKey = flattenContent(kit.addedNodes);
    const wpmAfterFirstKey = findNodeById(
      kit.addedNodes,
      "keyloop-live-metric-wpm-value",
    )?.props.content;
    const rawAfterFirstKey = findNodeById(
      kit.addedNodes,
      "keyloop-live-metric-raw-value",
    )?.props.content;
    const progressAfterFirstKey = findNodeById(
      kit.addedNodes,
      "keyloop-practice-data",
    )?.props.bottomTitle;

    nowMs = 1_200;
    kit.emitKey({ name: "b", sequence: "b" });
    await kit.waitForKeyListener(2);
    await dismissCompletionResult(kit);
    kit.emitKey({ name: "enter", sequence: "\r" });
    await kit.waitForKeyListener(3);
    kit.emitKey({ name: "enter", sequence: "\r" });
    await runPromise;

    expect(contentAfterFirstKey).toContain("50%");
    expect(contentAfterFirstKey).toContain("WPM");
    expect(wpmAfterFirstKey).toBe("0.0");
    expect(rawAfterFirstKey).toBe("0.0");
    expect(contentAfterFirstKey).toContain("Raw");
    expect(contentAfterFirstKey).toContain("Accuracy");
    expect(contentAfterFirstKey).toContain("100.0%");
    expect(contentAfterFirstKey).toContain("Errors");
    expect(progressAfterFirstKey).toContain("correct 1/2");
  });

  test("ctrl-c exits running lesson without saving", async () => {
    const kit = fakeKit({ keyInput: true });
    const runner = createOpenTuiStartRunner({ kit });
    const savedTargets: string[] = [];
    const context = {
      ...contextWithPlan(testSingleLessonPlan("ab")),
      saveRecord: async (record: { target_text: string }) => {
        savedTargets.push(record.target_text);
      },
    };

    const runPromise = runner(context);
    await kit.waitForKeyListener(1);
    kit.emitKey({ name: "c", sequence: "c", ctrl: true });

    const result = await Promise.race([
      runPromise,
      delay(50).then(() => null),
    ]);

    expect(result).not.toBeNull();
    if (result === null) {
      throw new Error("runner did not exit after ctrl-c");
    }
    expect(result.completedRecords).toEqual([]);
    expect(savedTargets).toEqual([]);
    expect(kit.destroyed).toBe(1);
  });

  test("saves completed lesson record before completion page is dismissed", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 30_000;
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });
    const savedRecords: PracticeLesson["target"][] = [];
    const context = {
      ...contextWithPlan(testSingleLessonPlan("a")),
      saveRecord: async (record: { target_text: string }) => {
        savedRecords.push({
          mode: "words",
          text: record.target_text,
          source: "test:saved-record",
        });
      },
    };

    const runPromise = runner(context);
    await kit.waitForKeyListener(1);

    nowMs = 30_100;
    kit.emitKey({ name: "a", sequence: "a" });

    const completeReady = await Promise.race([
      kit.waitForKeyListener(2).then(() => true),
      runPromise.then(() => false),
      delay(50).then(() => false),
    ]);

    expect(completeReady).toBe(true);
    expect(savedRecords.map((target) => target.text)).toEqual(["a"]);

    await dismissCompletionResult(kit);
    kit.emitKey({ name: "enter", sequence: "\r" });
    await kit.waitForKeyListener(3);
    kit.emitKey({ name: "enter", sequence: "\r" });

    const result = await runPromise;
    expect(result.completedRecords).toHaveLength(1);
  });

  test("ctrl-p pauses and resumes without counting paused time", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 10_000;
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });

    const runPromise = runner(contextWithPlan(testSingleLessonPlan("ab")));
    await kit.waitForKeyListener(1);

    nowMs = 10_100;
    kit.emitKey({ name: "a", sequence: "a" });
    nowMs = 10_200;
    kit.emitKey({ name: "p", sequence: "\x10", ctrl: true });
    nowMs = 10_400;
    kit.emitKey({ name: "b", sequence: "b" });

    const completedWhilePaused = await Promise.race([
      kit.waitForKeyListener(2).then(() => true),
      delay(20).then(() => false),
    ]);
    if (completedWhilePaused) {
      await dismissCompletionResult(kit);
      kit.emitKey({ name: "enter", sequence: "\r" });
      await kit.waitForKeyListener(3);
      kit.emitKey({ name: "enter", sequence: "\r" });
      await runPromise;
      throw new Error("lesson completed while paused");
    }

    nowMs = 10_700;
    kit.emitKey({ name: "p", sequence: "\x10", ctrl: true });
    nowMs = 10_800;
    kit.emitKey({ name: "b", sequence: "b" });

    await kit.waitForKeyListener(2);
    await dismissCompletionResult(kit);
    kit.emitKey({ name: "enter", sequence: "\r" });
    await kit.waitForKeyListener(3);
    kit.emitKey({ name: "enter", sequence: "\r" });

    const result = await runPromise;
    const record = result.completedRecords[0];

    expect(completedWhilePaused).toBe(false);
    expect(record?.user_input).toBe("ab");
    expect(record?.duration_ms).toBe(200);
    expect(record?.manual_pause_ms).toBe(500);
    expect(record?.key_events.map((event) => event.at_ms)).toEqual([0, 200]);
  });

  test("ctrl-p renders a visible paused state", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 11_000;
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });

    const runPromise = runner(contextWithPlan(testSingleLessonPlan("ab")));
    await kit.waitForKeyListener(1);

    nowMs = 11_100;
    kit.emitKey({ name: "a", sequence: "a" });
    await kit.waitForRenderRequest(1);
    nowMs = 11_200;
    kit.emitKey({ name: "p", sequence: "\x10", ctrl: true });
    await kit.waitForRenderRequest(2);

    expect(findNodeById(kit.addedNodes, "keyloop-lesson-pause-state")?.props.content).toBe(
      "⏸ Paused",
    );
    expect(flattenContent(kit.addedNodes)).toContain("resume");

    kit.emitKey({ name: "c", sequence: "c", ctrl: true });
    const result = await runPromise;
    expect(result.completedRecords).toEqual([]);
  });

  test("escape opens exit confirmation and escape returns to paused practice", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 20_000;
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });

    const runPromise = runner(contextWithPlan(testSingleLessonPlan("ab")));
    await kit.waitForKeyListener(1);

    nowMs = 20_100;
    kit.emitKey({ name: "a", sequence: "a" });
    await kit.waitForRenderRequest(1);
    nowMs = 20_200;
    kit.emitKey({ name: "escape", sequence: "\x1b" });

    const confirmationReady = await Promise.race([
      kit.waitForRenderRequest(2).then(() => true),
      runPromise.then(() => false),
      delay(50).then(() => false),
    ]);
    expect(confirmationReady).toBe(true);
    expect(flattenContent(kit.addedNodes)).toContain("Exit confirmation");
    expect(flattenContent(kit.addedNodes)).toContain("Unfinished progress will not be saved.");
    expect(kit.createdOptions).toHaveLength(1);
    expect(kit.destroyed).toBe(0);

    nowMs = 20_300;
    kit.emitKey({ name: "b", sequence: "b" });
    nowMs = 20_500;
    kit.emitKey({ name: "escape", sequence: "\x1b" });

    const runningReady = await Promise.race([
      kit.waitForRenderRequest(3).then(() => true),
      runPromise.then(() => false),
      delay(50).then(() => false),
    ]);
    expect(runningReady).toBe(true);

    nowMs = 20_600;
    kit.emitKey({ name: "b", sequence: "b" });
    await kit.waitForKeyListener(2);
    await dismissCompletionResult(kit);
    kit.emitKey({ name: "enter", sequence: "\r" });
    await kit.waitForKeyListener(3);
    kit.emitKey({ name: "enter", sequence: "\r" });

    const result = await runPromise;
    const record = result.completedRecords[0];

    expect(record?.completion_state).toBe("completed");
    expect(record?.user_input).toBe("ab");
    expect(record?.duration_ms).toBe(100);
    expect(record?.manual_pause_ms).toBe(400);
    expect(record?.key_events.map((event) => event.at_ms)).toEqual([0, 100]);
  });

  test("exit confirmation from app returns to menu without destroying renderer", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 30_000;
    const initialState = {
      language: "en" as const,
      route: { screen: "submenu" as const, menu: "foundation" as const, selected_index: 0 },
    };
    const initialRenderer = await renderOpenTuiAppOnce(initialState, kit);
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });

    const runPromise = runner({
      ...contextWithPlan(testSingleLessonPlan("abc")),
      initialRenderer,
      returnState: initialState,
    });
    await kit.waitForKeyListener(1);

    nowMs = 30_100;
    kit.emitKey({ name: "a", sequence: "a" });
    await kit.waitForRenderRequest(2);
    nowMs = 30_200;
    kit.emitKey({ name: "escape", sequence: "\x1b" });
    await kit.waitForRenderRequest(3);
    kit.emitKey({ name: "enter", sequence: "\r" });

    const result = await runPromise;

    expect(result.completedRecords).toEqual([]);
    expect(result.renderer).toBeDefined();
    expect(result.state?.route.screen).toBe("submenu");
    expect(flattenContent(kit.addedNodes)).toContain("Foundation practice");
    expect(findNodeById(kit.addedNodes, "keyloop-exit-confirmation-popup")).toBeUndefined();
    expect(kit.createdOptions).toHaveLength(1);
    expect(kit.destroyed).toBe(0);

    if (result.renderer === undefined || result.state === undefined) {
      throw new Error("expected reusable app renderer");
    }
    const appPromise = runOpenTuiAppSession(appSessionContext(), {
      initialRenderer: result.renderer,
      initialState: result.state,
      kit,
    });
    await kit.waitForKeyListener(2);
    kit.emitKey({ name: "q", sequence: "q" });
    const appResult = await appPromise;
    expect(appResult.action).toBe("quit");
    expect(appResult.state.route.screen).toBe("submenu");
  });

  test("completed final lesson waits on complete page before summary return", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 4_000;
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });
    const plan = testSingleLessonPlan("a");

    const runPromise = runner(contextWithPlan(plan));
    const runningReady = await Promise.race([
      kit.waitForKeyListener().then(() => true),
      runPromise.then(() => false),
      delay(50).then(() => false),
    ]);

    expect(runningReady).toBe(true);

    nowMs = 4_100;
    kit.emitKey({ name: "a", sequence: "a" });

    const completeReady = await Promise.race([
      kit.waitForKeyListener(2).then(() => true),
      runPromise.then(() => false),
      delay(50).then(() => false),
    ]);

    expect(completeReady).toBe(true);
    expect(flattenContent(kit.addedNodes)).toContain("Lesson complete");

    const beforeEnter = await Promise.race([
      runPromise.then(() => "resolved" as const),
      delay(20).then(() => "waiting" as const),
    ]);
    expect(beforeEnter).toBe("waiting");

    await dismissCompletionResult(kit);
    kit.emitKey({ name: "enter", sequence: "\r" });

    const summaryReady = await Promise.race([
      kit.waitForKeyListener(3).then(() => true),
      runPromise.then(() => false),
      delay(50).then(() => false),
    ]);

    expect(summaryReady).toBe(true);
    expect(flattenContent(kit.addedNodes)).toContain("Daily summary");

    kit.emitKey({ name: "enter", sequence: "\r" });

    const result = await runPromise;
    expect(result.completedRecords).toHaveLength(1);
    expect(result.completedRecords[0]?.lesson_id).toBe("lesson-foundation");
  });

  test("daily summary returns to the menu when launched with a returnState", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 4_000;
    const initialState = {
      language: "en" as const,
      route: { screen: "submenu" as const, menu: "foundation" as const, selected_index: 0 },
    };
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });
    const plan = testSingleLessonPlan("a");

    const runPromise = runner({
      ...contextWithPlan(plan),
      returnState: initialState,
    });
    const runningReady = await Promise.race([
      kit.waitForKeyListener().then(() => true),
      runPromise.then(() => false),
      delay(50).then(() => false),
    ]);
    expect(runningReady).toBe(true);

    nowMs = 4_100;
    kit.emitKey({ name: "a", sequence: "a" });

    const completeReady = await Promise.race([
      kit.waitForKeyListener(2).then(() => true),
      runPromise.then(() => false),
      delay(50).then(() => false),
    ]);
    expect(completeReady).toBe(true);
    expect(flattenContent(kit.addedNodes)).toContain("Lesson complete");

    await dismissCompletionResult(kit);
    kit.emitKey({ name: "enter", sequence: "\r" });

    const summaryReady = await Promise.race([
      kit.waitForKeyListener(3).then(() => true),
      runPromise.then(() => false),
      delay(50).then(() => false),
    ]);
    expect(summaryReady).toBe(true);
    expect(flattenContent(kit.addedNodes)).toContain("Daily summary");

    kit.emitKey({ name: "enter", sequence: "\r" });
    const result = await runPromise;

    expect(result.completedRecords).toHaveLength(1);
    expect(result.renderer).toBeDefined();
    expect(result.state?.route.screen).toBe("submenu");
  });

  test("completion popup can be dismissed before enter continues", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 4_000;
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });
    const plan = testSingleLessonPlan("ab");

    const runPromise = runner(contextWithPlan(plan));
    const runningReady = await Promise.race([
      kit.waitForKeyListener().then(() => true),
      runPromise.then(() => false),
      delay(50).then(() => false),
    ]);

    expect(runningReady).toBe(true);

    nowMs = 4_100;
    kit.emitKey({ name: "a", sequence: "a" });
    nowMs = 4_200;
    kit.emitKey({ name: "b", sequence: "b" });

    const completeReady = await Promise.race([
      kit.waitForKeyListener(2).then(() => true),
      runPromise.then(() => false),
      delay(50).then(() => false),
    ]);

    expect(completeReady).toBe(true);
    expect(flattenContent(kit.addedNodes)).toContain("Lesson complete");
    expect(flattenContent(kit.addedNodes)).toContain("ab");

    await dismissCompletionResult(kit, { name: "escape", sequence: "\u001b" });

    const dismissedContent = flattenContent(kit.addedNodes);
    expect(findNodeById(kit.addedNodes, "keyloop-complete-popup")).toBeUndefined();
    expect(dismissedContent).toContain("a");
    expect(dismissedContent).toContain("b");

    const beforeEnter = await Promise.race([
      runPromise.then(() => "resolved" as const),
      delay(20).then(() => "waiting" as const),
    ]);
    expect(beforeEnter).toBe("waiting");

    kit.emitKey({ name: "enter", sequence: "\r" });

    const summaryReady = await Promise.race([
      kit.waitForKeyListener(3).then(() => true),
      runPromise.then(() => false),
      delay(50).then(() => false),
    ]);

    expect(summaryReady).toBe(true);
    kit.emitKey({ name: "enter", sequence: "\r" });

    const result = await runPromise;
    expect(result.completedRecords).toHaveLength(1);
  });

  test("completion popup enter closes the result before the next enter continues", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 4_500;
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });
    const plan = testSingleLessonPlan("ab");

    const runPromise = runner(contextWithPlan(plan));
    await kit.waitForKeyListener(1);

    nowMs = 4_600;
    kit.emitKey({ name: "a", sequence: "a" });
    nowMs = 4_700;
    kit.emitKey({ name: "b", sequence: "b" });
    await kit.waitForKeyListener(2);

    await dismissCompletionResult(kit);
    expect(findNodeById(kit.addedNodes, "keyloop-complete-popup")).toBeUndefined();

    const beforeSecondEnter = await Promise.race([
      runPromise.then(() => "resolved" as const),
      delay(20).then(() => "waiting" as const),
    ]);
    expect(beforeSecondEnter).toBe("waiting");

    kit.emitKey({ name: "enter", sequence: "\r" });
    await kit.waitForKeyListener(3);
    expect(flattenContent(kit.addedNodes)).toContain("Daily summary");

    kit.emitKey({ name: "enter", sequence: "\r" });
    const result = await runPromise;
    expect(result.completedRecords).toHaveLength(1);
  });

  test("completion page escape after closing the popup returns to the previous app page", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 4_800;
    const initialState = {
      language: "en" as const,
      route: { screen: "submenu" as const, menu: "foundation" as const, selected_index: 0 },
    };
    const initialRenderer = await renderOpenTuiAppOnce(initialState, kit);
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });
    const plan = testSingleLessonPlan("ab");

    const runPromise = runner({
      ...contextWithPlan(plan),
      initialRenderer,
      returnState: initialState,
    });
    await kit.waitForKeyListener(1);

    nowMs = 4_900;
    kit.emitKey({ name: "a", sequence: "a" });
    nowMs = 5_000;
    kit.emitKey({ name: "b", sequence: "b" });
    await kit.waitForKeyListener(2);

    await dismissCompletionResult(kit, { name: "escape", sequence: "\x1b" });
    kit.emitKey({ name: "escape", sequence: "\x1b" });

    const result = await runPromise;
    expect(result.completedRecords).toHaveLength(1);
    expect(result.renderer).toBeDefined();
    expect(result.state?.route.screen).toBe("submenu");
    expect(flattenContent(kit.addedNodes)).toContain("Foundation practice");
    expect(findNodeById(kit.addedNodes, "keyloop-complete-popup")).toBeUndefined();
    expect(kit.destroyed).toBe(0);
  });

  test("completion page r repeats the current lesson before summary", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 5_000;
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });
    const plan = testSingleLessonPlan("a");

    const runPromise = runner(contextWithPlan(plan));
    await kit.waitForKeyListener(1);

    nowMs = 5_100;
    kit.emitKey({ name: "a", sequence: "a" });
    await kit.waitForKeyListener(2);

    kit.emitKey({ name: "r", sequence: "r" });

    const repeatedLessonReady = await Promise.race([
      kit.waitForKeyListener(3).then(() => true),
      runPromise.then(() => false),
      delay(50).then(() => false),
    ]);

    expect(repeatedLessonReady).toBe(true);

    nowMs = 5_300;
    kit.emitKey({ name: "a", sequence: "a" });
    await kit.waitForKeyListener(4);

    await dismissCompletionResult(kit);
    kit.emitKey({ name: "enter", sequence: "\r" });
    await kit.waitForKeyListener(5);
    expect(flattenContent(kit.addedNodes)).toContain("Daily summary");

    kit.emitKey({ name: "enter", sequence: "\r" });

    const result = await runPromise;
    expect(result.completedRecords).toHaveLength(2);
    expect(result.completedRecords.map((record) => record.lesson_id)).toEqual([
      "lesson-foundation",
      "lesson-foundation",
    ]);
    expect(result.completedRecords.map((record) => record.user_input)).toEqual([
      "a",
      "a",
    ]);
    expect(kit.destroyed).toBe(1);
  });

  test("completed lessons continue into the next unfinished daily lesson", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 3_000;
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });
    const plan = testDailyPlan("a", "b");

    const runPromise = runner(contextWithPlan(plan));
    const firstListenerReady = await Promise.race([
      kit.waitForKeyListener().then(() => true),
      runPromise.then(() => false),
      delay(50).then(() => false),
    ]);

    expect(firstListenerReady).toBe(true);

    nowMs = 3_100;
    kit.emitKey({ name: "a", sequence: "a" });

    const firstCompleteReady = await Promise.race([
      kit.waitForKeyListener(2).then(() => true),
      runPromise.then(() => false),
      delay(50).then(() => false),
    ]);

    expect(firstCompleteReady).toBe(true);
    expect(flattenContent(kit.addedNodes)).toContain("Lesson complete");

    await dismissCompletionResult(kit);
    kit.emitKey({ name: "enter", sequence: "\r" });

    const secondListenerReady = await Promise.race([
      kit.waitForKeyListener(3).then(() => true),
      runPromise.then(() => false),
      delay(50).then(() => false),
    ]);

    expect(secondListenerReady).toBe(true);

    nowMs = 3_300;
    kit.emitKey({ name: "b", sequence: "b" });

    const finalCompleteReady = await Promise.race([
      kit.waitForKeyListener(4).then(() => true),
      runPromise.then(() => false),
      delay(50).then(() => false),
    ]);

    expect(finalCompleteReady).toBe(true);

    await dismissCompletionResult(kit);
    kit.emitKey({ name: "enter", sequence: "\r" });

    const summaryReady = await Promise.race([
      kit.waitForKeyListener(5).then(() => true),
      runPromise.then(() => false),
      delay(50).then(() => false),
    ]);

    expect(summaryReady).toBe(true);
    expect(flattenContent(kit.addedNodes)).toContain("Daily summary");

    kit.emitKey({ name: "enter", sequence: "\r" });

    const result = await runPromise;

    expect(result.completedRecords).toHaveLength(2);
    expect(result.completedRecords.map((record) => record.lesson_id)).toEqual([
      "lesson-foundation",
      "lesson-everyday",
    ]);
    expect(result.completedRecords.map((record) => record.completion_state)).toEqual([
      "completed",
      "completed",
    ]);
    expect(kit.destroyed).toBe(1);
  });

  test("standalone code mix enter starts a fresh target after completion", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 8_000;
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });
    const firstText = "const alpha = 1;";
    const plan: DailyPracticePlan = {
      run_id: "",
      run_number: 0,
      target_minutes: 4,
      completed_ms: 0,
      lessons: [
        {
          id: "standalone:code_mix",
          kind: "code_block",
          module: "code_practice",
          category: "code_mix",
          mix_profile: "standalone",
          estimated_minutes: 4,
          target: { mode: "code", text: firstText, source: "test:first" },
          reason_zh: "",
          reason_en: "",
        },
      ],
    };
    const context: StartRunnerContext = {
      ...contextWithPlan(plan),
      sourceItem: "code_mix",
      targetContext: {
        records: [],
        plan: refreshPlan(),
        library: codeMixLibrary(firstText),
      },
    };

    const runPromise = runner(context);
    await kit.waitForKeyListener(1);

    for (const char of firstText) {
      nowMs += 100;
      kit.emitKey({
        name: char === " " ? "space" : char,
        sequence: char,
      });
    }
    await kit.waitForKeyListener(2);

    await dismissCompletionResult(kit);
    kit.emitKey({ name: "enter", sequence: "\r" });

    const nextReady = await Promise.race([
      kit.waitForKeyListener(3).then(() => true),
      runPromise.then(() => false),
      delay(50).then(() => false),
    ]);
    expect(nextReady).toBe(true);

    const nextContent = flattenContent(kit.addedNodes);
    const nextSnippetNames = ["beta", "gamma", "delta", "epsilon"].filter((name) =>
      nextContent.includes(name),
    );
    expect(nextSnippetNames).toHaveLength(1);
    expect(nextContent).not.toContain(firstText);
    expect(nextContent).not.toContain("alpha");

    kit.emitKey({ name: "c", sequence: "c", ctrl: true });
    const result = await runPromise;

    expect(result.completedRecords).toHaveLength(1);
    expect(result.completedRecords[0]?.target_text).toBe(firstText);
  });

  test("standalone code options popup changes code length with arrow keys", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 9_000;
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });
    const firstText = longCodeSnippet("alpha");
    const shortText = "const beta = 2;";
    const plan: DailyPracticePlan = {
      run_id: "",
      run_number: 0,
      target_minutes: 4,
      completed_ms: 0,
      lessons: [
        {
          id: "standalone:code_mix",
          kind: "code_block",
          module: "code_practice",
          category: "code_mix",
          mix_profile: "standalone",
          estimated_minutes: 4,
          target: { mode: "code", text: firstText, source: "test:first" },
          reason_zh: "",
          reason_en: "",
        },
      ],
    };
    const context: StartRunnerContext = {
      ...contextWithPlan(plan),
      sourceItem: "code_mix",
      targetContext: {
        records: [],
        plan: refreshPlan(),
        library: codeMixLibraryWithSnippets([
          codeSnippet("long", firstText),
          codeSnippet("short", shortText),
        ]),
      },
    };

    const runPromise = runner(context);
    await kit.waitForKeyListener(1);

    kit.emitKey({ name: "o", sequence: "\x0f", ctrl: true });
    await kit.waitForRenderRequest(1);
    expect(findNodeById(kit.addedNodes, "keyloop-practice-options-popup")).toBeDefined();

    kit.emitKey({ name: "down", sequence: "\x1b[B" });
    await kit.waitForRenderRequest(2);
    kit.emitKey({ name: "right", sequence: "\x1b[C" });
    await kit.waitForRenderRequest(3);

    const content = flattenContent(kit.addedNodes);
    expect(content).toContain("beta");
    expect(content).not.toContain("alphaValue01");
    expect(content).toContain("Length\nShort");
    expect(findNodeById(kit.addedNodes, "keyloop-practice-options-popup")).toBeDefined();

    kit.emitKey({ name: "c", sequence: "c", ctrl: true });
    const result = await runPromise;

    expect(result.completedRecords).toEqual([]);
  });

  test("standalone everyday word options popup changes word range with arrow keys", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 10_000;
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });
    const plan: DailyPracticePlan = {
      run_id: "",
      run_number: 0,
      target_minutes: 4,
      completed_ms: 0,
      lessons: [
        {
          id: "standalone:everyday_words",
          kind: "words",
          module: "everyday_english",
          category: "everyday_words",
          mix_profile: "standalone",
          estimated_minutes: 4,
          target: { mode: "words", text: "today", source: "test:first" },
          reason_zh: "",
          reason_en: "",
        },
      ],
    };
    const context: StartRunnerContext = {
      ...contextWithPlan(plan),
      sourceItem: "everyday_words",
      targetContext: {
        records: [],
        plan: refreshPlan(),
        library: everydayWordLibrary(),
        everydaySettings: {
          word_range: "200",
          word_count: 3,
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
        },
      },
    };

    const runPromise = runner(context);
    await kit.waitForKeyListener(1);

    kit.emitKey({ name: "o", sequence: "\x0f", ctrl: true });
    await kit.waitForRenderRequest(1);
    expect(findNodeById(kit.addedNodes, "keyloop-practice-options-popup")).toBeDefined();
    expect(flattenContent(kit.addedNodes)).toContain("Word range");
    expect(flattenContent(kit.addedNodes)).toContain("Basic 200");

    kit.emitKey({ name: "right", sequence: "\x1b[C" });
    await kit.waitForRenderRequest(2);

    const content = flattenContent(kit.addedNodes);
    expect(content).toContain("Common 1000");
    // The first word may be split into cursor + remainder segments, so join
    // the flattened segments before matching.
    expect(content.replace(/\n/gu, "")).toContain("information");
    expect(findNodeById(kit.addedNodes, "keyloop-practice-options-popup")).toBeDefined();

    kit.emitKey({ name: "c", sequence: "c", ctrl: true });
    const result = await runPromise;

    expect(result.completedRecords).toEqual([]);
  });

  test("standalone everyday word options popup changes repeat count", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 10_000;
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });
    const plan: DailyPracticePlan = {
      run_id: "",
      run_number: 0,
      target_minutes: 4,
      completed_ms: 0,
      lessons: [
        {
          id: "standalone:everyday_words",
          kind: "words",
          module: "everyday_english",
          category: "everyday_words",
          mix_profile: "standalone",
          estimated_minutes: 4,
          target: { mode: "words", text: "today", source: "test:first" },
          reason_zh: "",
          reason_en: "",
        },
      ],
    };
    const context: StartRunnerContext = {
      ...contextWithPlan(plan),
      sourceItem: "everyday_words",
      targetContext: {
        records: [],
        plan: refreshPlan(),
        library: everydayWordLibrary(),
        everydaySettings: {
          word_range: "200",
          word_count: 3,
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
        },
      },
    };

    const runPromise = runner(context);
    await kit.waitForKeyListener(1);

    kit.emitKey({ name: "o", sequence: "\x0f", ctrl: true });
    await kit.waitForRenderRequest(1);
    kit.emitKey({ name: "down", sequence: "\x1b[B" });
    await kit.waitForRenderRequest(2);
    kit.emitKey({ name: "down", sequence: "\x1b[B" });
    await kit.waitForRenderRequest(3);
    kit.emitKey({ name: "right", sequence: "\x1b[C" });
    await kit.waitForRenderRequest(4);

    const content = flattenContent(kit.addedNodes).replace(/\n/gu, "");
    expect(content).toContain("Word repeats");
    expect(content).toContain("‹ 2 ›");
    expect(content).toContain("today today");
    expect(findNodeById(kit.addedNodes, "keyloop-practice-options-popup")).toBeDefined();

    kit.emitKey({ name: "c", sequence: "c", ctrl: true });
    const result = await runPromise;

    expect(result.completedRecords).toEqual([]);
  });

  const everydayOptionScenarios: Array<{
    sourceItem: NonNullable<StartRunnerContext["sourceItem"]>;
    category: PracticeLesson["category"];
    targetText: string;
    label: string;
    initialValue: string;
    nextValue: string;
  }> = [
    {
      sourceItem: "everyday_sentences",
      category: "everyday_sentences",
      targetText: "Practice builds skill.",
      label: "Vocabulary",
      initialValue: "CET-4 (~4500 words)",
      nextValue: "CET-6 (~6000 words)",
    },
    {
      sourceItem: "everyday_articles",
      category: "everyday_articles",
      targetText: "Short article text.",
      label: "Vocabulary",
      initialValue: "CET-4 (~4500 words)",
      nextValue: "CET-6 (~6000 words)",
    },
    {
      sourceItem: "everyday_word_decomposition",
      category: "everyday_word_decomposition",
      targetText: "in in in for for for ma ma ma tion tion tion information information information",
      label: "Vocabulary",
      initialValue: "CET-4 (~4500 words)",
      nextValue: "CET-6 (~6000 words)",
    },
  ];

  for (const scenario of everydayOptionScenarios) {
    test(`standalone ${scenario.sourceItem} options popup changes settings with arrow keys`, async () => {
      const kit = fakeKit({ keyInput: true });
      let nowMs = 10_000;
      const runner = createOpenTuiStartRunner({
        kit,
        nowMs: () => nowMs,
      });
      const plan: DailyPracticePlan = {
        run_id: "",
        run_number: 0,
        target_minutes: 4,
        completed_ms: 0,
        lessons: [
          {
            id: `standalone:${scenario.sourceItem}`,
            kind: "words",
            module: "everyday_english",
            category: scenario.category,
            mix_profile: "standalone",
            estimated_minutes: 4,
            target: { mode: "words", text: scenario.targetText, source: "test:first" },
            reason_zh: "",
            reason_en: "",
          },
        ],
      };
      const context: StartRunnerContext = {
        ...contextWithPlan(plan),
        sourceItem: scenario.sourceItem,
        targetContext: {
          records: [],
          plan: refreshPlan(),
          library: everydayOptionsLibrary(),
        },
      };

      const runPromise = runner(context);
      await kit.waitForKeyListener(1);

      kit.emitKey({ name: "o", sequence: "\x0f", ctrl: true });
      await kit.waitForRenderRequest(1);
      let content = flattenContent(kit.addedNodes);
      expect(findNodeById(kit.addedNodes, "keyloop-practice-options-popup")).toBeDefined();
      expect(content).toContain(scenario.label);
      expect(content).toContain(scenario.initialValue);

      kit.emitKey({ name: "right", sequence: "\x1b[C" });
      await kit.waitForRenderRequest(2);

      content = flattenContent(kit.addedNodes);
      expect(content).toContain(scenario.nextValue);
      expect(findNodeById(kit.addedNodes, "keyloop-practice-options-popup")).toBeDefined();

      kit.emitKey({ name: "c", sequence: "c", ctrl: true });
      const result = await runPromise;

      expect(result.completedRecords).toEqual([]);
    });
  }

  test("standalone technical long-word options popup changes repeat count", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 10_000;
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });
    const plan: DailyPracticePlan = {
      run_id: "",
      run_number: 0,
      target_minutes: 4,
      completed_ms: 0,
      lessons: [
        {
          id: "standalone:technical_long_words",
          kind: "words",
          module: "programming_basics",
          category: "word_breakdown",
          mix_profile: "standalone",
          estimated_minutes: 4,
          target: {
            mode: "words",
            text: "deallocation deallocation",
            source: "test:first",
          },
          reason_zh: "",
          reason_en: "",
        },
      ],
    };
    const library = refreshLibrary();
    library.long_words = [
      {
        word: "deallocation",
        parts: ["de", "allocation"],
        domain: "programming",
        tier: 3,
        source_id: "test",
        note_zh: "释放",
      },
    ];
    const context: StartRunnerContext = {
      ...contextWithPlan(plan),
      sourceItem: "technical_long_words",
      targetContext: {
        records: [],
        plan: refreshPlan(),
        library,
        wordBreakdownSettings: {
          enabled_in_comprehensive: true,
          max_items_per_group: 6,
          word_repeats: 2,
        },
      },
    };

    const runPromise = runner(context);
    await kit.waitForKeyListener(1);

    kit.emitKey({ name: "o", sequence: "\x0f", ctrl: true });
    await kit.waitForRenderRequest(1);
    let content = flattenContent(kit.addedNodes);
    expect(findNodeById(kit.addedNodes, "keyloop-practice-options-popup")).toBeDefined();
    expect(content).toContain("Whole repeats");
    expect(content).toContain("2");

    kit.emitKey({ name: "right", sequence: "\x1b[C" });
    await kit.waitForRenderRequest(2);

    content = flattenContent(kit.addedNodes).replace(/\n/gu, "");
    expect(content).toContain("Whole repeats");
    expect(content).toContain("‹ 3 ›");
    expect(content).toContain("deallocation deallocation deallocation");
    expect(findNodeById(kit.addedNodes, "keyloop-practice-options-popup")).toBeDefined();

    kit.emitKey({ name: "c", sequence: "c", ctrl: true });
    const result = await runPromise;

    expect(result.completedRecords).toEqual([]);
  });

  test("standalone programming term options popup changes repeat count", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 10_000;
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });
    const plan: DailyPracticePlan = {
      run_id: "",
      run_number: 0,
      target_minutes: 4,
      completed_ms: 0,
      lessons: [
        {
          id: "standalone:programming_terms",
          kind: "common_words",
          module: "programming_basics",
          category: "programming_terms",
          mix_profile: "standalone",
          estimated_minutes: 4,
          target: { mode: "words", text: "request", source: "test:first" },
          reason_zh: "",
          reason_en: "",
        },
      ],
    };
    const library = refreshLibrary();
    library.programming_words = [
      { word: "request", note_zh: "请求（HTTP/接口入参）" },
      { word: "state", note_zh: "状态（组件/应用状态）" },
    ];
    const context: StartRunnerContext = {
      ...contextWithPlan(plan),
      sourceItem: "programming_terms",
      targetContext: {
        records: [],
        plan: refreshPlan(),
        library,
        random: () => 0,
        programmingTermsSettings: {
          word_repeats: 1,
        },
      },
    };

    const runPromise = runner(context);
    await kit.waitForKeyListener(1);

    kit.emitKey({ name: "o", sequence: "\x0f", ctrl: true });
    await kit.waitForRenderRequest(1);
    let content = flattenContent(kit.addedNodes);
    expect(findNodeById(kit.addedNodes, "keyloop-practice-options-popup")).toBeDefined();
    expect(content).toContain("Word repeats");
    expect(content).toContain("1");

    kit.emitKey({ name: "right", sequence: "\x1b[C" });
    await kit.waitForRenderRequest(2);

    content = flattenContent(kit.addedNodes).replace(/\n/gu, "");
    expect(content).toContain("Word repeats");
    expect(content).toContain("‹ 2 ›");
    expect(content).toContain("state state");
    expect(content).toContain("request request");
    expect(findNodeById(kit.addedNodes, "keyloop-practice-options-popup")).toBeDefined();

    kit.emitKey({ name: "c", sequence: "c", ctrl: true });
    const result = await runPromise;

    expect(result.completedRecords).toEqual([]);
  });

  test("standalone custom library word options popup changes repeat count", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 10_000;
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });
    const plan: DailyPracticePlan = {
      run_id: "",
      run_number: 0,
      target_minutes: 4,
      completed_ms: 0,
      lessons: [
        {
          id: "standalone:library_kind_kaoyan:words",
          kind: "words",
          module: "custom_corpus",
          category: "custom_library",
          mix_profile: "standalone",
          estimated_minutes: 4,
          target: { mode: "words", text: "abandon", source: "test:first" },
          reason_zh: "",
          reason_en: "",
        },
      ],
    };
    const library: CustomLibrary = {
      version: 1,
      slug: "kaoyan",
      name: "考研英语",
      created_at: "2026-06-12T00:00:00.000Z",
      words: [
        { id: "w1", text: "abandon", kind: "word", meaning_zh: "v. 放弃", source: "dict" },
      ],
      sentences: [],
      articles: [],
    };
    const context: StartRunnerContext = {
      ...contextWithPlan(plan),
      sourceItem: "library_kind_kaoyan:words",
      targetContext: {
        records: [],
        plan: refreshPlan(),
        library: refreshLibrary(),
      },
      customLibraries: [library],
      customLibrarySettings: {
        word_repeats: 1,
      },
    };

    const runPromise = runner(context);
    await kit.waitForKeyListener(1);

    kit.emitKey({ name: "o", sequence: "\x0f", ctrl: true });
    await kit.waitForRenderRequest(1);
    let content = flattenContent(kit.addedNodes);
    expect(findNodeById(kit.addedNodes, "keyloop-practice-options-popup")).toBeDefined();
    expect(content).toContain("Word repeats");
    expect(content).toContain("1");
    expect(content).toContain("Pronunciation");

    kit.emitKey({ name: "right", sequence: "\x1b[C" });
    await kit.waitForRenderRequest(2);

    content = flattenContent(kit.addedNodes).replace(/\n/gu, "");
    expect(content).toContain("Word repeats");
    expect(content).toContain("‹ 2 ›");
    expect(content).toContain("abandon abandon");
    expect(findNodeById(kit.addedNodes, "keyloop-practice-options-popup")).toBeDefined();

    kit.emitKey({ name: "c", sequence: "c", ctrl: true });
    const result = await runPromise;

    expect(result.completedRecords).toEqual([]);
  });

  test("word pronunciation plays each active word annotation once while typing", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 10_000;
    const played: Array<{ text: string; volumePercent: number }> = [];
    const prefetched: string[][] = [];
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
      wordAudio: {
        prefetch: async (requests) => {
          prefetched.push(requests.map((request) => `${request.text}:${request.volumePercent}`));
        },
        play: async (request) => {
          played.push({
            text: request.text,
            volumePercent: request.volumePercent,
          });
        },
      },
    });
    const plan: DailyPracticePlan = {
      run_id: "",
      run_number: 0,
      target_minutes: 4,
      completed_ms: 0,
      lessons: [
        {
          id: "standalone:everyday_words",
          kind: "words",
          module: "everyday_english",
          category: "everyday_words",
          mix_profile: "standalone",
          estimated_minutes: 4,
          target: {
            mode: "words",
            text: "hello hello world",
            source: "test:audio",
            annotations: [
              {
                start: 0,
                end: "hello hello".length,
                translation_zh: "你好",
                display: "word_loose",
                audio_text: "hello",
              },
              {
                start: "hello hello ".length,
                end: "hello hello world".length,
                translation_zh: "世界",
                display: "word",
                audio_text: "world",
              },
            ],
          },
          reason_zh: "",
          reason_en: "",
        },
      ],
    };
    const context: StartRunnerContext = {
      ...contextWithPlan(plan),
      sourceItem: "everyday_words",
      wordAudioSettings: {
        enabled: true,
        volume_percent: 70,
      },
    };

    const runPromise = runner(context);
    await kit.waitForKeyListener(1);
    await waitFor(() => prefetched.length === 1);

    expect(prefetched).toEqual([["hello:70", "world:70"]]);

    kit.emitKey({ name: "h", sequence: "h" });
    await kit.waitForRenderRequest(1);
    expect(played).toEqual([{ text: "hello", volumePercent: 70 }]);

    let renderCount = 1;
    for (const char of "ello hello ") {
      renderCount += 1;
      kit.emitKey({ name: char, sequence: char });
      await kit.waitForRenderRequest(renderCount);
    }
    expect(played).toEqual([
      { text: "hello", volumePercent: 70 },
      { text: "world", volumePercent: 70 },
    ]);

    kit.emitKey({ name: "c", sequence: "c", ctrl: true });
    const result = await runPromise;

    expect(result.completedRecords).toEqual([]);
  });

  test("word pronunciation stays silent when disabled", async () => {
    const kit = fakeKit({ keyInput: true });
    const played: string[] = [];
    const prefetched: string[] = [];
    const runner = createOpenTuiStartRunner({
      kit,
      wordAudio: {
        prefetch: async (requests) => {
          prefetched.push(...requests.map((request) => request.text));
        },
        play: async (request) => {
          played.push(request.text);
        },
      },
    });
    const plan = testSingleLessonPlan("hello");
    plan.lessons[0] = {
      ...plan.lessons[0]!,
      target: {
        mode: "words",
        text: "hello",
        source: "test:audio-disabled",
        annotations: [
          {
            start: 0,
            end: "hello".length,
            translation_zh: "你好",
            display: "word",
            audio_text: "hello",
          },
        ],
      },
    };
    const context: StartRunnerContext = {
      ...contextWithPlan(plan),
      sourceItem: "everyday_words",
      wordAudioSettings: {
        enabled: false,
        volume_percent: 100,
      },
    };

    const runPromise = runner(context);
    await kit.waitForKeyListener(1);

    kit.emitKey({ name: "h", sequence: "h" });
    await kit.waitForRenderRequest(1);
    kit.emitKey({ name: "c", sequence: "c", ctrl: true });
    const result = await runPromise;

    expect(played).toEqual([]);
    expect(prefetched).toEqual([]);
    expect(result.completedRecords).toEqual([]);
  });

  test("standalone code options popup can open from completion after the result popup is dismissed", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 9_300;
    const runner = createOpenTuiStartRunner({ kit, nowMs: () => nowMs });
    const firstText = "const alpha = 1;";
    const shortText = "const beta = 2;";
    const plan: DailyPracticePlan = {
      run_id: "",
      run_number: 0,
      target_minutes: 4,
      completed_ms: 0,
      lessons: [
        {
          id: "standalone:code_blocks",
          kind: "code_block",
          module: "code_practice",
          category: "code_snippet",
          mix_profile: "standalone",
          estimated_minutes: 4,
          target: { mode: "code", text: firstText, source: "test:first" },
          reason_zh: "",
          reason_en: "",
        },
      ],
    };
    const context: StartRunnerContext = {
      ...contextWithPlan(plan),
      sourceItem: "code_blocks",
      targetContext: {
        records: [],
        plan: refreshPlan(),
        library: codeMixLibraryWithSnippets([
          codeSnippet("long", longCodeSnippet("alpha")),
          codeSnippet("short", shortText),
        ]),
      },
    };

    const runPromise = runner(context);
    await kit.waitForKeyListener(1);

    for (const char of firstText) {
      nowMs += 100;
      kit.emitKey({
        name: char === " " ? "space" : char,
        sequence: char,
      });
    }
    await kit.waitForKeyListener(2);
    await dismissCompletionResult(kit);

    const renderRequestsBeforeOptions = kit.renderRequests;
    kit.emitKey({ name: "o", sequence: "\x0f", ctrl: true });
    await kit.waitForKeyListener(3);
    await waitForNodeById(kit, "keyloop-practice-options-popup", renderRequestsBeforeOptions);
    expect(findNodeById(kit.addedNodes, "keyloop-practice-options-popup")).toBeDefined();

    const renderRequestsBeforeDown = kit.renderRequests;
    kit.emitKey({ name: "down", sequence: "\x1b[B" });
    await kit.waitForRenderRequest(renderRequestsBeforeDown + 1);
    const renderRequestsBeforeRight = kit.renderRequests;
    kit.emitKey({ name: "right", sequence: "\x1b[C" });
    await kit.waitForRenderRequest(renderRequestsBeforeRight + 1);

    const content = flattenContent(kit.addedNodes);
    expect(content).toContain("beta");
    expect(content).not.toContain("alpha = 1");
    expect(content).toContain("Length\nShort");

    kit.emitKey({ name: "c", sequence: "c", ctrl: true });
    const result = await runPromise;

    expect(result.completedRecords).toHaveLength(1);
    expect(result.completedRecords[0]?.target_text).toBe(firstText);
  });

  test("standalone code completion keeps ctrl-n active after the result popup is dismissed", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 9_400;
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });
    const firstText = "const alpha = 1;";
    const plan: DailyPracticePlan = {
      run_id: "",
      run_number: 0,
      target_minutes: 4,
      completed_ms: 0,
      lessons: [
        {
          id: "standalone:code_blocks",
          kind: "code_block",
          module: "code_practice",
          category: "code_snippet",
          mix_profile: "standalone",
          estimated_minutes: 4,
          target: { mode: "code", text: firstText, source: "test:first" },
          reason_zh: "",
          reason_en: "",
        },
      ],
    };
    const context: StartRunnerContext = {
      ...contextWithPlan(plan),
      sourceItem: "code_blocks",
      targetContext: {
        records: [],
        plan: refreshPlan(),
        library: codeMixLibraryWithSnippets([
          codeSnippet("long", longCodeSnippet("alpha")),
          codeSnippet("short", "const beta = 2;"),
        ]),
      },
    };

    const runPromise = runner(context);
    await kit.waitForKeyListener(1);

    for (const char of firstText) {
      nowMs += 100;
      kit.emitKey({
        name: char === " " ? "space" : char,
        sequence: char,
      });
    }
    await kit.waitForKeyListener(2);
    await dismissCompletionResult(kit);

    kit.emitKey({ name: "n", sequence: "\x0e", ctrl: true });

    const repeatReady = await Promise.race([
      kit.waitForKeyListener(3).then(() => true),
      runPromise.then(() => false),
      delay(50).then(() => false),
    ]);
    expect(repeatReady).toBe(true);

    const content = flattenContent(kit.addedNodes);
    expect(content).toContain("alpha");
    expect(content).not.toContain("Lesson complete");
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-typed-0-0")).toBeUndefined();

    kit.emitKey({ name: "c", sequence: "c", ctrl: true });
    const result = await runPromise;

    expect(result.completedRecords).toHaveLength(1);
    expect(result.completedRecords[0]?.target_text).toBe(firstText);
  });

  test("standalone code completion keeps ctrl-r active after the result popup is dismissed", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 9_500;
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });
    const firstText = "const alpha = 1;";
    const plan: DailyPracticePlan = {
      run_id: "",
      run_number: 0,
      target_minutes: 4,
      completed_ms: 0,
      lessons: [
        {
          id: "standalone:code_mix",
          kind: "code_block",
          module: "code_practice",
          category: "code_mix",
          mix_profile: "standalone",
          estimated_minutes: 4,
          target: { mode: "code", text: firstText, source: "test:first" },
          reason_zh: "",
          reason_en: "",
        },
      ],
    };
    const context: StartRunnerContext = {
      ...contextWithPlan(plan),
      sourceItem: "code_mix",
      targetContext: {
        records: [],
        plan: refreshPlan(),
        library: codeMixLibrary(firstText),
      },
    };

    const runPromise = runner(context);
    await kit.waitForKeyListener(1);

    for (const char of firstText) {
      nowMs += 100;
      kit.emitKey({
        name: char === " " ? "space" : char,
        sequence: char,
      });
    }
    await kit.waitForKeyListener(2);
    await dismissCompletionResult(kit);

    kit.emitKey({ name: "r", sequence: "\x12", ctrl: true });

    const nextReady = await Promise.race([
      kit.waitForKeyListener(3).then(() => true),
      runPromise.then(() => false),
      delay(50).then(() => false),
    ]);
    expect(nextReady).toBe(true);

    const content = flattenContent(kit.addedNodes);
    const nextSnippetNames = ["beta", "gamma", "delta", "epsilon"].filter((name) =>
      content.includes(name),
    );
    expect(nextSnippetNames).toHaveLength(1);
    expect(content).not.toContain("alpha = 1");

    kit.emitKey({ name: "c", sequence: "c", ctrl: true });
    const result = await runPromise;

    expect(result.completedRecords).toHaveLength(1);
    expect(result.completedRecords[0]?.target_text).toBe(firstText);
  });

  test("running timer starts after the first typed key", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 12_000;
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
      timerIntervalMs: 1,
    });

    const runPromise = runner(contextWithPlan(testSingleLessonPlan("ab")));
    await kit.waitForKeyListener(1);

    const beforeTick = kit.renderRequests;
    nowMs = 13_000;
    await delay(20);

    expect(findNodeById(kit.addedNodes, "keyloop-lesson-duration-value")?.props.content).toBe(
      "0:00",
    );
    expect(
      findNodeById(kit.addedNodes, "keyloop-topbar-today-duration-value")?.props.content,
    ).toBe("0:00");
    expect(kit.renderRequests).toBe(beforeTick);

    kit.emitKey({ name: "a", sequence: "a" });
    await kit.waitForRenderRequest(beforeTick + 1);

    expect(findNodeById(kit.addedNodes, "keyloop-lesson-duration-value")?.props.content).toBe(
      "0:00",
    );
    expect(
      findNodeById(kit.addedNodes, "keyloop-topbar-today-duration-value")?.props.content,
    ).toBe("0:00");

    nowMs = 14_000;
    await kit.waitForRenderRequest(beforeTick + 2);

    expect(findNodeById(kit.addedNodes, "keyloop-lesson-duration-value")?.props.content).toBe(
      "0:01",
    );
    expect(
      findNodeById(kit.addedNodes, "keyloop-topbar-today-duration-value")?.props.content,
    ).toBe("0:01");

    kit.emitKey({ name: "c", sequence: "c", ctrl: true });
    const result = await runPromise;
    expect(result.completedRecords).toEqual([]);
  });

  test("standalone code mix ctrl-r refreshes immediately after typing starts", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 9_750;
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });
    const firstText = longCodeSnippet("alpha");
    const plan: DailyPracticePlan = {
      run_id: "",
      run_number: 0,
      target_minutes: 4,
      completed_ms: 0,
      lessons: [
        {
          id: "standalone:code_mix",
          kind: "code_block",
          module: "code_practice",
          category: "code_mix",
          mix_profile: "standalone",
          estimated_minutes: 4,
          target: { mode: "code", text: firstText, source: "test:first" },
          reason_zh: "",
          reason_en: "",
        },
      ],
    };
    const context: StartRunnerContext = {
      ...contextWithPlan(plan),
      sourceItem: "code_mix",
      targetContext: {
        records: [],
        plan: refreshPlan(),
        library: codeMixLibraryWithSnippets([
          codeSnippet("long", firstText),
          codeSnippet("second", "const beta = 2;"),
        ]),
      },
    };

    const runPromise = runner(context);
    await kit.waitForKeyListener(1);

    kit.emitKey({ name: "c", sequence: "c" });
    await kit.waitForRenderRequest(1);
    kit.emitKey({ name: "r", sequence: "\x12", ctrl: true });
    await kit.waitForRenderRequest(2);

    const content = flattenContent(kit.addedNodes);
    expect(findNodeById(kit.addedNodes, "keyloop-code-settings-confirmation-popup")).toBeUndefined();
    expect(content).not.toContain("Refresh code settings");
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-cursor-0-0")).toBeDefined();
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-typed-0-0")).toBeUndefined();

    kit.emitKey({ name: "c", sequence: "c", ctrl: true });
    const result = await runPromise;

    expect(result.completedRecords).toEqual([]);
  });

  test("standalone code controls ignore repeated refresh while a refresh render is still pending", async () => {
    const kit = fakeKit({ idleDelayMs: 20, keyInput: true });
    let nowMs = 9_800;
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });
    const firstText = longCodeSnippet("alpha");
    const checkpointCalls: string[] = [];
    const plan: DailyPracticePlan = {
      run_id: "",
      run_number: 0,
      target_minutes: 4,
      completed_ms: 0,
      lessons: [
        {
          id: "standalone:code_mix",
          kind: "code_block",
          module: "code_practice",
          category: "code_mix",
          mix_profile: "standalone",
          estimated_minutes: 4,
          target: { mode: "code", text: firstText, source: "test:first" },
          reason_zh: "",
          reason_en: "",
        },
      ],
    };
    const context: StartRunnerContext = {
      ...contextWithPlan(plan),
      sourceItem: "code_mix",
      targetContext: {
        records: [],
        plan: refreshPlan(),
        library: codeMixLibraryWithSnippets([
          codeSnippet("long", firstText),
          codeSnippet("second", "const beta = 2;"),
        ]),
      },
      saveCheckpoint: async (_lesson, target) => {
        checkpointCalls.push(target.text);
      },
    };

    const runPromise = runner(context);
    await kit.waitForKeyListener(1);
    const initialCheckpointCount = checkpointCalls.length;

    kit.emitKey({ name: "r", sequence: "\x12", ctrl: true });
    kit.emitKey({ name: "r", sequence: "\x12", ctrl: true });
    await kit.waitForRenderRequest(1);

    expect(checkpointCalls).toHaveLength(initialCheckpointCount + 1);

    kit.emitKey({ name: "c", sequence: "c", ctrl: true });
    const result = await runPromise;

    expect(result.completedRecords).toEqual([]);
  });

  test("saves checkpoint callback for each started lesson", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 7_000;
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });
    const checkpointCalls: Array<{ lessonId: string; targetText: string }> = [];
    const context = {
      ...contextWithPlan(testDailyPlan("a", "b")),
      saveCheckpoint: async (lesson: PracticeLesson, target: PracticeLesson["target"]) => {
        checkpointCalls.push({ lessonId: lesson.id, targetText: target.text });
      },
    };

    const runPromise = runner(context);
    await kit.waitForKeyListener(1);

    nowMs = 7_100;
    kit.emitKey({ name: "a", sequence: "a" });
    await kit.waitForKeyListener(2);
    await dismissCompletionResult(kit);
    kit.emitKey({ name: "enter", sequence: "\r" });
    await kit.waitForKeyListener(3);

    nowMs = 7_200;
    kit.emitKey({ name: "b", sequence: "b" });
    await kit.waitForKeyListener(4);
    kit.emitKey({ name: "q", sequence: "q" });

    const result = await runPromise;

    expect(result.completedRecords).toHaveLength(2);
    expect(checkpointCalls).toEqual([
      { lessonId: "lesson-foundation", targetText: "a" },
      { lessonId: "lesson-everyday", targetText: "b" },
    ]);
  });

  test("refreshes later comprehensive lesson target from records completed in the same run", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 6_000;
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });
    const plan: DailyPracticePlan = {
      run_id: "20260605-1-refresh",
      run_number: 1,
      target_minutes: 20,
      completed_ms: 0,
      lessons: [
        lesson("lesson-foundation", "foundation_input", "=>"),
        {
          ...lesson("lesson-programming", "programming_basics", "programming fallback"),
          kind: "symbols",
          category: "programming_basics_mix",
        },
      ],
    };

    const runPromise = runner(contextWithRefreshPlan(plan));
    await kit.waitForKeyListener(1);

    nowMs = 6_100;
    kit.emitKey({ name: "x", sequence: "x" });
    nowMs = 6_120;
    kit.emitKey({ name: "backspace", sequence: "\x7f" });
    nowMs = 6_150;
    kit.emitKey({ name: "=", sequence: "=" });
    nowMs = 6_200;
    kit.emitKey({ name: ">", sequence: ">" });
    await kit.waitForKeyListener(2);

    await dismissCompletionResult(kit);
    kit.emitKey({ name: "enter", sequence: "\r" });
    await kit.waitForKeyListener(3);

    const secondLessonContent = flattenContent(kit.addedNodes);
    // category 驱动的形态刷新：programming mix 课程刷新为符号形态内容，
    // 原始占位文本被替换（同 run 已完成记录参与了重新生成）
    expect(secondLessonContent).not.toContain("programming fallback");

    const renderRequestsBeforeExit = kit.renderRequests;
    kit.emitKey({ name: "escape", sequence: "\x1b" });
    await kit.waitForRenderRequest(renderRequestsBeforeExit + 1);
    kit.emitKey({ name: "q", sequence: "q" });
    const result = await runPromise;
    const firstRecord = result.completedRecords[0];

    expect(result.completedRecords).toHaveLength(1);
    expect(firstRecord?.token_stats).toContainEqual(
      expect.objectContaining({ token: "=>", errors: 1 }),
    );
  });

  test("exit confirmation enter exits without saving unfinished progress", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 2_000;
    const savedRecords: SessionRecord[] = [];
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });
    const plan = testDailyPlan("abc");

    const runPromise = runner({
      ...contextWithPlan(plan),
      saveRecord: async (record) => {
        savedRecords.push(record);
      },
    });
    const listenerReady = await Promise.race([
      kit.waitForKeyListener().then(() => true),
      runPromise.then(() => false),
      delay(50).then(() => false),
    ]);

    expect(listenerReady).toBe(true);

    nowMs = 2_120;
    kit.emitKey({ name: "a", sequence: "a" });
    await kit.waitForRenderRequest(1);
    nowMs = 2_400;
    kit.emitKey({ name: "escape", sequence: "\x1b" });

    const confirmationReady = await Promise.race([
      kit.waitForRenderRequest(2).then(() => true),
      runPromise.then(() => false),
      delay(50).then(() => false),
    ]);
    expect(confirmationReady).toBe(true);
    expect(flattenContent(kit.addedNodes)).toContain("Exit confirmation");

    nowMs = 2_600;
    kit.emitKey({ name: "enter", sequence: "\r" });

    const result = await runPromise;

    expect(result.completedRecords).toEqual([]);
    expect(savedRecords).toEqual([]);
  });

  test("empty daily run id records standalone lesson metadata", async () => {
    const kit = fakeKit({ keyInput: true });
    let nowMs = 10_000;
    const runner = createOpenTuiStartRunner({
      kit,
      nowMs: () => nowMs,
    });
    const plan: DailyPracticePlan = {
      run_id: "",
      run_number: 0,
      target_minutes: 4,
      completed_ms: 0,
      lessons: [
        {
          id: "",
          kind: "words",
          module: "programming_basics",
          category: "personal_vocabulary",
          mix_profile: "standalone",
          estimated_minutes: 4,
          target: { mode: "words", text: "i18n", source: "test:standalone" },
          reason_zh: "",
          reason_en: "",
        },
      ],
    };

    const runPromise = runner(contextWithPlan(plan));
    await kit.waitForKeyListener(1);

    nowMs = 10_100;
    kit.emitKey({ name: "i", sequence: "i" });
    nowMs = 10_200;
    kit.emitKey({ name: "1", sequence: "1" });
    nowMs = 10_300;
    kit.emitKey({ name: "8", sequence: "8" });
    nowMs = 10_400;
    kit.emitKey({ name: "n", sequence: "n" });
    await kit.waitForKeyListener(2);

    await dismissCompletionResult(kit);
    kit.emitKey({ name: "enter", sequence: "\r" });
    await kit.waitForKeyListener(3);
    kit.emitKey({ name: "enter", sequence: "\r" });

    const result = await runPromise;
    const record = result.completedRecords[0];

    expect(record?.daily_run_id).toBe("");
    expect(record?.lesson_id).toBe("");
    expect(record?.lesson_index).toBeNull();
    expect(record?.module).toBe("programming_basics");
    expect(record?.category).toBe("personal_vocabulary");
  });
});

type FakeKit = OpenTuiRendererKit & {
  addedNodes: FakeNode[];
  createdOptions: Array<{ exitOnCtrlC: boolean }>;
  destroyed: number;
  renderRequests: number;
  emitKey(event: Partial<FakeKeyEvent>): void;
  waitForKeyListener(count?: number): Promise<void>;
  waitForRenderRequest(count?: number): Promise<void>;
};

function fakeKit(options: { idleDelayMs?: number; keyInput?: boolean } = {}): FakeKit {
  const addedNodes: FakeNode[] = [];
  const createdOptions: Array<{ exitOnCtrlC: boolean }> = [];
  let destroyed = 0;
  let keyHandler: ((event: FakeKeyEvent) => void) | undefined;
  let keyListenerCount = 0;
  let renderRequestCount = 0;
  const keyListenerWaiters: Array<{
    count: number;
    resolve: () => void;
  }> = [];
  const renderRequestWaiters: Array<{
    count: number;
    resolve: () => void;
  }> = [];
  const resolveKeyListenerWaiters = (): void => {
    for (let index = keyListenerWaiters.length - 1; index >= 0; index -= 1) {
      const waiter = keyListenerWaiters[index];
      if (waiter !== undefined && keyListenerCount >= waiter.count) {
        waiter.resolve();
        keyListenerWaiters.splice(index, 1);
      }
    }
  };
  const resolveRenderRequestWaiters = (): void => {
    for (let index = renderRequestWaiters.length - 1; index >= 0; index -= 1) {
      const waiter = renderRequestWaiters[index];
      if (waiter !== undefined && renderRequestCount >= waiter.count) {
        waiter.resolve();
        renderRequestWaiters.splice(index, 1);
      }
    }
  };
  return {
    addedNodes,
    createdOptions,
    get destroyed() {
      return destroyed;
    },
    get renderRequests() {
      return renderRequestCount;
    },
    emitKey: (event) => {
      if (keyHandler === undefined) {
        throw new Error("keypress handler was not registered");
      }
      keyHandler({
        name: event.name ?? "",
        sequence: event.sequence ?? "",
        ctrl: event.ctrl ?? false,
        meta: event.meta ?? false,
      });
    },
    waitForKeyListener: (count = 1) => {
      if (keyListenerCount >= count) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        keyListenerWaiters.push({ count, resolve });
      });
    },
    waitForRenderRequest: (count = 1) => {
      if (renderRequestCount >= count) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        renderRequestWaiters.push({ count, resolve });
      });
    },
    Box: (props, ...children) => ({ type: "Box", props, children }),
    Text: (props) => ({ type: "Text", props, children: [] }),
    createCliRenderer: async (rendererOptions) => {
      createdOptions.push(rendererOptions);
      const renderer = {
        root: {
          add: (...nodes: unknown[]) => {
            addedNodes.push(...(nodes as FakeNode[]));
          },
          remove: (id: string) => {
            for (let index = addedNodes.length - 1; index >= 0; index -= 1) {
              if (addedNodes[index]?.props.id === id) {
                addedNodes.splice(index, 1);
              }
            }
          },
        },
        idle: async () => {
          if ((options.idleDelayMs ?? 0) > 0) {
            await delay(options.idleDelayMs ?? 0);
          }
        },
        requestRender: () => {
          renderRequestCount += 1;
          resolveRenderRequestWaiters();
        },
        destroy: () => {
          destroyed += 1;
        },
      };
      if (options.keyInput === true) {
        return {
          ...renderer,
          keyInput: {
            on: (event: string, handler: (event: FakeKeyEvent) => void) => {
              if (event === "keypress") {
                keyHandler = handler;
                keyListenerCount += 1;
                resolveKeyListenerWaiters();
              }
            },
            off: (event: string, handler: (event: FakeKeyEvent) => void) => {
              if (event === "keypress" && keyHandler === handler) {
                keyHandler = undefined;
              }
            },
          },
        };
      }
      return renderer;
    },
  };
}

function flattenContent(nodes: FakeNode[]): string {
  const values: string[] = [];
  const visit = (node: FakeNode): void => {
    const content = node.props.content;
    if (typeof content === "string") {
      values.push(content);
    }
    for (const child of node.children) {
      visit(child);
    }
  };
  for (const node of nodes) {
    visit(node);
  }
  return values.join("\n");
}

function findNodeById(nodes: FakeNode[], id: string): FakeNode | undefined {
  for (const node of nodes) {
    if (node.props.id === id) {
      return node;
    }
    const child = findNodeById(node.children, id);
    if (child !== undefined) {
      return child;
    }
  }
  return undefined;
}

async function dismissCompletionResult(
  kit: FakeKit,
  event: Partial<FakeKeyEvent> = { name: "enter", sequence: "\r" },
): Promise<void> {
  kit.emitKey(event);
  let observedRenderRequests = kit.renderRequests;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await kit.waitForRenderRequest(observedRenderRequests + 1);
    observedRenderRequests = kit.renderRequests;
    await delay(0);
    if (findNodeById(kit.addedNodes, "keyloop-complete-popup") === undefined) {
      return;
    }
  }
  throw new Error("completion popup was not dismissed");
}

async function waitForNodeById(
  kit: FakeKit,
  id: string,
  observedRenderRequests = kit.renderRequests,
): Promise<FakeNode> {
  const existing = findNodeById(kit.addedNodes, id);
  if (existing !== undefined) {
    return existing;
  }

  let observed = observedRenderRequests;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await kit.waitForRenderRequest(observed + 1);
    observed = kit.renderRequests;
    await delay(0);
    const node = findNodeById(kit.addedNodes, id);
    if (node !== undefined) {
      return node;
    }
  }
  throw new Error(`node was not rendered: ${id}`);
}

function contextWithPlan(
  dailyPlan: DailyPracticePlan,
  records: StartRunnerContext["records"] = [],
): StartRunnerContext {
  return {
    dailyPlan,
    records,
    language: "en",
    dataDir: "/tmp/keyloop",
    codeConfig: defaultCodePracticeConfig(),
  };
}

function appSessionContext() {
  return {
    language: "en" as const,
    records: [],
    plan: refreshPlan(),
    library: refreshLibrary(),
    todayElapsedMs: 0,
  };
}

function contextWithRefreshPlan(
  dailyPlan: DailyPracticePlan,
  records: StartRunnerContext["records"] = [],
): StartRunnerContext & { targetContext: BuildTargetContext } {
  return {
    ...contextWithPlan(dailyPlan, records),
    targetContext: {
      records,
      plan: refreshPlan(),
      library: refreshLibrary(),
    },
  };
}

function testDailyPlan(
  firstText = "foundation text",
  secondText = "everyday text",
): DailyPracticePlan {
  return {
    run_id: "20260605-1-test",
    run_number: 1,
    target_minutes: 20,
    completed_ms: 0,
    lessons: [
      lesson("lesson-foundation", "foundation_input", firstText),
      lesson("lesson-everyday", "everyday_english", secondText),
    ],
  };
}

function testSingleLessonPlan(text: string): DailyPracticePlan {
  return {
    ...testDailyPlan(text),
    lessons: [lesson("lesson-foundation", "foundation_input", text)],
  };
}

function lesson(
  id: string,
  module: PracticeLesson["module"],
  text: string,
): PracticeLesson {
  return {
    id,
    kind: module === "foundation_input" ? "foundation" : "common_words",
    module,
    category: module === "foundation_input" ? "foundation_mix" : "everyday_mix",
    mix_profile: "comprehensive",
    estimated_minutes: 4,
    target: {
      mode: "words",
      text,
      source: `test:${id}`,
    },
    reason_zh: "",
    reason_en: "",
  };
}

function refreshPlan(): PracticePlan {
  return {
    focus_words: [],
    focus_symbols: [],
    focus_code: [],
    focus_keys: [],
    advice: [],
    recommended_mode: "mixed",
    has_recent_history: true,
  };
}

function refreshLibrary(): ContentLibrary {
  return {
    warmup: [],
    foundation_drills: [
      {
        id: "punctuation-edges",
        title_zh: "",
        title_en: "",
        hint_zh: "",
        hint_en: "",
        items: ["=>"],
      },
    ],
    word_chunks: [],
    common_words: [],
    everyday_english: {
      sources: [],
      entries: [],
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
    programming_words: ["selected", "pending", "performance", "response"].map((word) => ({
      word,
      note_zh: "",
    })),
    code_snippets: [],
    long_words: [],
  };
}

function everydayWordLibrary(): ContentLibrary {
  const library = refreshLibrary();
  library.everyday_words.entries = [
    {
      word: "today",
      rank: 100,
      range: "200",
      level: "high_school",
      translation_zh: "今天",
      source_id: "test",
    },
    {
      word: "practice",
      rank: 300,
      range: "1000",
      level: "cet4",
      translation_zh: "练习",
      source_id: "test",
    },
    {
      word: "information",
      rank: 500,
      range: "1000",
      level: "cet4",
      translation_zh: "信息；资料",
      source_id: "test",
    },
  ];
  return library;
}

function pendingComprehensivePlan(): DailyPracticePlan {
  // 模拟惰性组卷：诊断屏只产时长，target 留空待开练 materialize（run_id 仍为空）
  return {
    run_id: "",
    run_number: 0,
    target_minutes: 15,
    completed_ms: 0,
    lessons: [
      {
        id: "stage:words:1",
        kind: "common_words",
        module: "everyday_english",
        category: "everyday_words",
        mix_profile: "comprehensive",
        estimated_minutes: 4,
        target: { mode: "words", text: "", source: "keyloop:stage:pending:words" },
        pending: { char_budget: 120 },
        reason_zh: "",
        reason_en: "",
      },
    ],
  };
}

function contextWithStageLibrary(plan: DailyPracticePlan): StartRunnerContext {
  return {
    ...contextWithPlan(plan),
    targetContext: {
      records: [],
      plan: refreshPlan(),
      library: everydayWordLibrary(),
      random: () => 0.42,
    },
  };
}

function everydayOptionsLibrary(): ContentLibrary {
  const library = everydayWordLibrary();
  library.everyday_sentences.entries = [
    {
      text: "Practice builds skill.",
      translation_zh: "练习培养技能。",
      level: "cet4",
      length: "short",
      source_id: "test",
      source_title: "Test sentences",
    },
    {
      text: "Advanced reading improves precision.",
      translation_zh: "进阶阅读提升准确性。",
      level: "cet6",
      length: "short",
      source_id: "test",
      source_title: "Test sentences",
    },
  ];
  library.everyday_articles.entries = [
    {
      title: "Short CET-4 Article",
      level: "cet4",
      length: "short",
      source_id: "test",
      paragraphs: [
        {
          text: "Short article text.",
          translation_zh: "短文章文本。",
        },
      ],
    },
    {
      title: "Short CET-6 Article",
      level: "cet6",
      length: "short",
      source_id: "test",
      paragraphs: [
        {
          text: "Advanced article text.",
          translation_zh: "进阶文章文本。",
        },
      ],
    },
  ];
  library.everyday_word_decomposition.entries = [
    {
      word: "information",
      parts: ["in", "for", "ma", "tion"],
      translation_zh: "信息；资料",
      level: "cet4",
      source_id: "test",
    },
    {
      word: "collaboration",
      parts: ["collab", "ora", "tion"],
      translation_zh: "协作",
      level: "cet6",
      source_id: "test",
    },
  ];
  return library;
}

function codeMixLibrary(usedText: string): ContentLibrary {
  const library = refreshLibrary();
  library.code_snippets = [
    codeSnippet("first", usedText),
    codeSnippet("second", "const beta = 2;"),
    codeSnippet("third", "const gamma = 3;"),
    codeSnippet("fourth", "const delta = 4;"),
    codeSnippet("fifth", "const epsilon = 5;"),
  ];
  return library;
}

function codeMixLibraryWithSnippets(
  snippets: ContentLibrary["code_snippets"],
): ContentLibrary {
  const library = refreshLibrary();
  library.code_snippets = snippets;
  return library;
}

function codeSnippet(source: string, text: string): ContentLibrary["code_snippets"][number] {
  return {
    text,
    source,
    language: "typescript",
    framework: "none",
    project: "test",
    level: "block",
  };
}

function longCodeSnippet(name: string): string {
  return Array.from({ length: 16 }, (_, index) => {
    const padded = String(index + 1).padStart(2, "0");
    return `const ${name}Value${padded} = selectedValues.get("${name}-${padded}") ?? ${index};`;
  }).join("\n");
}

interface FakeKeyEvent {
  name: string;
  sequence: string;
  ctrl: boolean;
  meta: boolean;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 500,
): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("timed out waiting for condition");
    }
    await delay(5);
  }
}

describe("completion review scroll (global sink)", () => {
  test("wheel events adjust review_scroll, clamp to 0, and the sink is cleared on settle", async () => {
    const originalRows = Object.getOwnPropertyDescriptor(process.stdout, "rows");
    Object.defineProperty(process.stdout, "rows", { value: 14, configurable: true });
    try {
      const text = Array.from({ length: 60 }, (_, i) => `const v${i} = ${i};`).join("\n");
      const record = defaultSessionRecord({
        mode: "code",
        source: "local:x.ts",
        target_text: text,
        user_input: text,
        typed_len: text.length,
        correct_chars: text.length,
        accuracy: 100,
      });
      const target = {
        mode: "code" as const,
        text,
        source: "local:x.ts",
        code_blocks: [
          { start_line: 0, line_count: 60, language: "typescript", framework: "l", project: "p", source: "x.ts:1" },
        ],
      };
      const state = createOpenTuiCompletionState("zh", record, {
        sourceItem: "code_mix",
        target,
        resultVisible: false,
      });

      const rendered: OpenTuiAppState[] = [];
      let keypress: ((event: { name: string; sequence: string; ctrl: boolean; meta: boolean }) => void) | undefined;
      const renderer = {
        keyInput: {
          on: (_event: string, handler: typeof keypress) => {
            keypress = handler;
          },
          off: () => {},
        },
        renderState: async (next: OpenTuiAppState) => {
          rendered.push(next);
        },
        destroy: () => {},
      } as unknown as Parameters<typeof waitForPostCompletionAction>[0];

      const promise = waitForPostCompletionAction(renderer, state, {});

      // 一次滚轮上滚：从底部（默认 maxStart）减小 review_scroll
      injectUiEvent(WHEEL_UP_EVENT);
      await delay(5);
      const first = rendered.at(-1);
      expect(first?.route.screen).toBe("complete");
      if (first?.route.screen !== "complete") throw new Error("expected complete route");
      const firstScroll = first.route.review_scroll;
      expect(typeof firstScroll).toBe("number");
      expect(firstScroll!).toBeGreaterThanOrEqual(0);

      // 持续上滚：clamp 到 0，不会变负
      for (let i = 0; i < 40; i += 1) {
        injectUiEvent(WHEEL_UP_EVENT);
        await delay(1);
      }
      const top = rendered.at(-1);
      if (top?.route.screen !== "complete") throw new Error("expected complete route");
      expect(top.route.review_scroll).toBe(0);

      // 回车结算 → sink 应被清理
      keypress?.({ name: "enter", sequence: "\r", ctrl: false, meta: false });
      const action = await promise;
      expect(action).toBe("continue");

      const renderCountAfterSettle = rendered.length;
      injectUiEvent(WHEEL_UP_EVENT);
      await delay(5);
      // sink 已清空：注入不再触发渲染
      expect(rendered.length).toBe(renderCountAfterSettle);
    } finally {
      if (originalRows) {
        Object.defineProperty(process.stdout, "rows", originalRows);
      }
    }
  });
});
