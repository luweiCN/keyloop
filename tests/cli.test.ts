import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  appendSessionToPath,
  buildDailyPracticePlan,
  codeConfigFromPreferences,
  createOpenTuiCodeFilterState,
  createOpenTuiInitialState,
  currentSessionPath,
  defaultCodeStyleSettings,
  dailyRunsPath,
  defaultSessionRecord,
  keyStatsPath,
  loadKeyAggregatesFromPath,
  loadPreferencesFromPath,
  loadSessionCheckpointFromPath,
  loadSessionsFromPath,
  parseCliArgs,
  preferencesPath,
  reduceOpenTuiAppKey,
  runCli,
  saveKeyAggregatesToPath,
  savePreferencesToPath,
  sessionLogPath,
  type CodeFilterPreference,
  type CodePracticeConfig,
  type DailyPracticePlan,
  type Language,
  type OpenTuiAppState,
  type OpenTuiKeyEvent,
  type SessionRecord,
  type StartRunnerContext,
} from "../src/index";

const START_CLI_TEST_TIMEOUT_MS = 20_000;

describe("TS CLI parser parity", () => {
  test("bare keyloop has no command and defaults to zh", () => {
    expect(parseCliArgs([])).toEqual({
      language: "zh",
      command: null,
    });
  });

  test("global language can appear before command", () => {
    expect(parseCliArgs(["--language", "en", "plan"])).toEqual({
      language: "en",
      command: { kind: "plan" },
    });
  });

  test("global and start options accept equals values", () => {
    expect(
      parseCliArgs([
        "--language=en",
        "start",
        "--repo=/tmp/app",
        "--code-language=typescript",
        "--code-framework=react",
        "--code-project=nextjs",
      ]),
    ).toEqual({
      language: "en",
      command: {
        kind: "start",
        mode: "chars",
        repo: "/tmp/app",
        code_language: "typescript",
        code_framework: "react",
        code_project: "nextjs",
      },
    });
  });

  test("help command parses without opening the app", () => {
    expect(parseCliArgs(["--help"])).toEqual({
      language: "zh",
      command: { kind: "help" },
    });
    expect(parseCliArgs(["help"])).toEqual({
      language: "zh",
      command: { kind: "help" },
    });
    expect(parseCliArgs(["--language", "en", "-h"])).toEqual({
      language: "en",
      command: { kind: "help" },
    });
  });

  test("start parses repo and code filters", () => {
    expect(
      parseCliArgs([
        "start",
        "--repo",
        "/tmp/app",
        "--code-language",
        "typescript",
        "--code-framework",
        "react",
        "--code-project",
        "nextjs",
      ]),
    ).toEqual({
      language: "zh",
      command: {
        kind: "start",
        mode: "chars",
        repo: "/tmp/app",
        code_language: "typescript",
        code_framework: "react",
        code_project: "nextjs",
      },
    });
  });

  test("report plan import and sources commands parse", () => {
    expect(parseCliArgs(["report", "today"]).command).toEqual({
      kind: "report",
      scope: "today",
    });
    expect(parseCliArgs(["plan"]).command).toEqual({ kind: "plan" });
    expect(parseCliArgs(["import", "/tmp/app"]).command).toEqual({
      kind: "import",
      path: "/tmp/app",
    });
    expect(parseCliArgs(["sources"]).command).toEqual({ kind: "sources" });
  });



});

describe("TS CLI command dispatch", () => {
  test("help runs without creating data files", async () => {
    const dir = await tempDir();
    try {
      const result = await runCli(["--language", "en", "--help"], {
        env: { KEYLOOP_HOME: dir },
      });

      expect(result.stdout).toContain("KeyLoop");
      expect(result.stdout).toContain("keyloop start");
      expect(await Bun.file(sessionLogPath(dir)).exists()).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("plan loads sessions and prints localized plan report", async () => {
    const dir = await tempDir();
    try {
      const result = await runCli(["--language", "en", "plan"], {
        env: { KEYLOOP_HOME: dir },
        now: new Date("2026-06-05T04:00:00Z"),
      });

      expect(result.stdout).toContain("Next KeyLoop plan");
      expect(result.stdout).toContain("Daily target: adaptive");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("plan command uses injected now for recent history cutoff", async () => {
    const dir = await tempDir();
    try {
      await appendSessionToPath(
        defaultSessionRecord({
          started_at: "2020-01-02T03:00:00.000Z",
          typed_len: 20,
          accuracy: 80,
          token_stats: [
            {
              token: "performance",
              kind: "word",
              start_delay_ms: 500,
              duration_ms: 500,
              errors: 2,
            },
          ],
        }),
        sessionLogPath(dir),
      );

      const result = await runCli(["--language", "en", "plan"], {
        env: { KEYLOOP_HOME: dir },
        now: new Date("2020-01-02T04:00:00.000Z"),
      });

      expect(result.stdout).toContain("performance");
      expect(result.stdout).toContain("Accuracy is below 95%");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("report today loads sessions and uses today report", async () => {
    const dir = await tempDir();
    try {
      await appendSessionToPath(
        defaultSessionRecord({
          started_at: "2026-06-05T03:00:00.000Z",
          duration_ms: 60_000,
          active_ms: 30_000,
          typed_len: 150,
          correct_chars: 150,
          accuracy: 100,
        }),
        sessionLogPath(dir),
      );

      const result = await runCli(["report", "today"], {
        env: { KEYLOOP_HOME: dir },
        now: new Date("2026-06-05T04:00:00Z"),
      });

      expect(result.stdout).toContain("今日练习");
      expect(result.stdout).toContain("WPM: 60.0");
      expect(result.stdout).toContain("运行: keyloop start");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("report today uses the saved speed unit preference", async () => {
    const dir = await tempDir();
    try {
      await appendSessionToPath(
        defaultSessionRecord({
          started_at: "2026-06-05T03:00:00.000Z",
          duration_ms: 60_000,
          active_ms: 30_000,
          typed_len: 150,
          correct_chars: 150,
          accuracy: 100,
        }),
        sessionLogPath(dir),
      );
      await savePreferencesToPath(
        {
          ...defaultPreferences("en"),
          speed_unit: "cpm",
        },
        preferencesPath(dir),
      );

      const result = await runCli(["report", "today"], {
        env: { KEYLOOP_HOME: dir },
        now: new Date("2026-06-05T04:00:00Z"),
      });

      expect(result.stdout).toContain("今日练习");
      expect(result.stdout).toContain("CPM: 300.0");
      expect(result.stdout).not.toContain("WPM:");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("sources prints source catalog provenance", async () => {
    const dir = await tempDir();
    try {
      const result = await runCli(["--language", "en", "sources"], {
        env: { KEYLOOP_HOME: dir },
      });

      expect(result.stdout).toContain("Recommended corpus sources");
      expect(result.stdout).toContain("license");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("content corpus env reaches sources app and start contexts", async () => {
    const dir = await tempDir();
    try {
      const corpusPath = join(dir, "everyday-user.json");
      await writeUserEverydayCorpus(corpusPath);

      const sourcesResult = await runCli(["--language", "en", "sources"], {
        env: {
          KEYLOOP_HOME: dir,
          KEYLOOP_EVERYDAY_CORPUS: corpusPath,
        },
      });
      let appSawEntry = false;
      await runCli(["--language", "en"], {
        env: {
          KEYLOOP_HOME: dir,
          KEYLOOP_EVERYDAY_CORPUS: corpusPath,
        },
        appRunner: async (context) => {
          appSawEntry = context.library.everyday_english.entries.some(
            (entry) => entry.text === "deployment checklist",
          );
          return {
            state: createOpenTuiInitialState(context.language),
            action: "quit",
          };
        },
      });
      let startSawEntry = false;
      await runCli(["--language", "en", "start"], {
        env: {
          KEYLOOP_HOME: dir,
          KEYLOOP_EVERYDAY_CORPUS: corpusPath,
        },
        runner: async (context) => {
          startSawEntry =
            context.targetContext?.library.everyday_english.entries.some(
              (entry) => entry.text === "deployment checklist",
            ) ?? false;
          return { completedRecords: [] };
        },
      });

      expect(sourcesResult.stdout).toContain("user:everyday");
      expect(sourcesResult.stdout).toContain("User everyday corpus");
      expect(appSawEntry).toBe(true);
      expect(startSawEntry).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, START_CLI_TEST_TIMEOUT_MS);

  test("import extracts snippets and renders preview", async () => {
    const dir = await tempDir();
    try {
      const repo = join(dir, "repo");
      await mkdir(repo, { recursive: true });
      await writeFile(
        join(repo, "demo.ts"),
        "export function demo(value: string) {\n  return value.trim();\n}\n",
      );

      const result = await runCli(["import", repo], {
        env: { KEYLOOP_HOME: dir },
      });

      expect(result.stdout).toContain(`在 ${repo} 中找到`);
      expect(result.stdout).toContain("demo.ts");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });


  test("bare keyloop uses saved interface language", async () => {
    const dir = await tempDir();
    let contextLanguage: Language | undefined;
    try {
      await savePreferencesToPath(defaultPreferences("en"), preferencesPath(dir));

      await runCli([], {
        env: { KEYLOOP_HOME: dir },
        appRunner: async (context) => {
          contextLanguage = context.language;
          return {
            state: createOpenTuiInitialState(context.language),
            action: "quit",
          };
        },
      });

      expect(contextLanguage).toBe("en");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("bare keyloop persists interface language changed in app settings", async () => {
    const dir = await tempDir();
    try {
      await savePreferencesToPath(defaultPreferences("zh"), preferencesPath(dir));

      await runCli([], {
        env: { KEYLOOP_HOME: dir },
        appRunner: async (context) => {
          const settings = reduceOpenTuiAppKey(
            createOpenTuiInitialState(context.language),
            key("7", "7"),
            context,
          );
          const english = reduceOpenTuiAppKey(settings.state, key("right", ""), context);
          return { state: english.state, action: "quit" };
        },
      });

      const preferences = await loadPreferencesFromPath(preferencesPath(dir));
      expect(preferences.interface_language).toBe("en");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("bare keyloop persists word pronunciation setting changed in app settings", async () => {
    const dir = await tempDir();
    try {
      await savePreferencesToPath(defaultPreferences("en"), preferencesPath(dir));

      await runCli([], {
        env: { KEYLOOP_HOME: dir },
        appRunner: async (context) => {
          const settings = reduceOpenTuiAppKey(
            createOpenTuiInitialState(context.language),
            key("7", "7"),
            context,
          );
          const wordAudioRow = pressSettingsDown(settings.state, context, 8);
          const enabled = reduceOpenTuiAppKey(wordAudioRow, key("right", ""), context);
          return { state: enabled.state, action: "quit" };
        },
      });

      const preferences = await loadPreferencesFromPath(preferencesPath(dir));
      expect(preferences.word_audio.enabled).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("start persists word pronunciation settings returned by runner", async () => {
    const dir = await tempDir();
    try {
      await savePreferencesToPath(defaultPreferences("en"), preferencesPath(dir));

      await runCli(["start"], {
        env: { KEYLOOP_HOME: dir },
        now: new Date("2026-06-05T04:00:00Z"),
        runner: async () => ({
          completedRecords: [],
          wordAudioSettings: {
            enabled: true,
            volume_percent: 60,
          },
        }),
      });

      const preferences = await loadPreferencesFromPath(preferencesPath(dir));
      expect(preferences.word_audio).toEqual({
        enabled: true,
        volume_percent: 60,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, START_CLI_TEST_TIMEOUT_MS);

  test("bare keyloop persists code filter settings and starts with returned state config", async () => {
    const dir = await tempDir();
    let selectedPreference: CodeFilterPreference | undefined;
    let runnerConfig: CodePracticeConfig | undefined;
    try {
      await savePreferencesToPath(defaultPreferences("en"), preferencesPath(dir));

      await runCli(["--language", "en"], {
        env: { KEYLOOP_HOME: dir },
        now: new Date("2026-06-05T04:00:00.000Z"),
        idFactory: () => "settings",
        appRunner: async (context) => {
          const option = context.codeFilterOptions?.find(
            (candidate) =>
              candidate.facet === "language" && candidate.value === "typescript",
          );
          if (option === undefined) {
            throw new Error("expected typescript code filter option");
          }
          selectedPreference = { facet: option.facet, value: option.value };
          const codeFilters = createOpenTuiCodeFilterState({
            options: context.codeFilterOptions ?? [],
            selected: [selectedPreference],
            pinned: [selectedPreference],
          });
          const codeMenu = reduceOpenTuiAppKey(
            createOpenTuiInitialState(context.language, { codeFilters }),
            key("5", "5"),
            context,
          );
          const running = reduceOpenTuiAppKey(codeMenu.state, key("1", "1"), context);
          if (running.action !== "start") {
            throw new Error("expected start action");
          }
          return { state: running.state, action: "start" };
        },
        runner: async (context) => {
          runnerConfig = context.codeConfig;
          return { completedRecords: [] };
        },
      });

      const preferences = await loadPreferencesFromPath(preferencesPath(dir));
      if (selectedPreference === undefined) {
        throw new Error("expected selected preference");
      }
      expect(preferences.global_code_filters).toEqual([selectedPreference]);
      expect(preferences.pinned_code_filters).toEqual([selectedPreference]);
      expect(runnerConfig).toMatchObject({
        languages: ["typescript"],
        frameworks: [],
        projects: [],
        match_any: true,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("bare keyloop persists code difficulty and length settings and passes them to runner config", async () => {
    const dir = await tempDir();
    let runnerConfig: CodePracticeConfig | undefined;
    try {
      await savePreferencesToPath(defaultPreferences("en"), preferencesPath(dir));

      await runCli(["--language", "en"], {
        env: { KEYLOOP_HOME: dir },
        now: new Date("2026-06-05T04:00:00.000Z"),
        idFactory: () => "difficulty-settings",
        appRunner: async (context) => {
          const settings = reduceOpenTuiAppKey(
            createOpenTuiInitialState(context.language),
            key("7", "7"),
            context,
          );
          let hardState = pressSettingsDown(settings.state, context, 3);
          hardState = reduceOpenTuiAppKey(hardState, key("right", ""), context).state;
          hardState = reduceOpenTuiAppKey(hardState, key("right", ""), context).state;
          hardState = reduceOpenTuiAppKey(hardState, key("right", ""), context).state;
          hardState = reduceOpenTuiAppKey(hardState, key("right", ""), context).state;
          const lengthState = reduceOpenTuiAppKey(hardState, key("down", ""), context).state;
          const shortLengthState = reduceOpenTuiAppKey(lengthState, key("right", ""), context).state;
          const mainMenu = reduceOpenTuiAppKey(shortLengthState, key("escape", "\x1b"), context);
          const codeMenu = reduceOpenTuiAppKey(mainMenu.state, key("5", "5"), context);
          const running = reduceOpenTuiAppKey(codeMenu.state, key("1", "1"), context);
          if (running.action !== "start") {
            throw new Error("expected start action");
          }
          return { state: running.state, action: "start" };
        },
        runner: async (context) => {
          runnerConfig = context.codeConfig;
          return { completedRecords: [] };
        },
      });

      const preferences = await loadPreferencesFromPath(preferencesPath(dir));
      expect(preferences.code_practice.difficulty).toBe("hard");
      expect(preferences.code_practice.length).toBe("short");
      expect(runnerConfig?.difficulty).toBe("hard");
      expect(runnerConfig?.size).toBe("short");
      expect(codeConfigFromPreferences(preferences).difficulty).toBe("hard");
      expect(codeConfigFromPreferences(preferences).size).toBe("short");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });


  test("bare keyloop start action runs selected app lesson and persists records", async () => {
    const dir = await tempDir();
    const dailyRunIds: string[] = [];
    const appRenderer = { root: { add: () => {} } };
    let runnerInitialRenderer: unknown;
    try {
      await savePreferencesToPath(defaultPreferences("en"), preferencesPath(dir));

      const result = await runCli(["--language", "en"], {
        env: { KEYLOOP_HOME: dir },
        now: new Date("2026-06-05T04:00:00.000Z"),
        idFactory: () => "appstart",
        appRunner: async (context) => {
          const lesson = buildDailyPracticePlan(context).lessons[0];
          if (lesson === undefined) {
            throw new Error("expected app lesson");
          }
          return {
            state: {
              language: context.language,
              route: {
                screen: "running",
                source_item: "comprehensive",
                target: lesson.target,
                lesson,
              },
            },
            action: "start",
            renderer: appRenderer,
          };
        },
        runner: async (context) => {
          dailyRunIds.push(context.dailyPlan.run_id);
          runnerInitialRenderer = context.initialRenderer;
          const lesson = context.dailyPlan.lessons[0];
          if (lesson === undefined) {
            throw new Error("expected persisted daily lesson");
          }
          return {
            completedRecords: [
              defaultSessionRecord({
                id: "app-start-record",
                daily_run_id: context.dailyPlan.run_id,
                lesson_id: lesson.id,
                lesson_index: 0,
                module: lesson.module,
                category: lesson.category,
                completion_state: "completed",
                key_events: [
                  {
                    at_ms: 100,
                    action: "insert",
                    position: 0,
                    expected: "a",
                    input: "a",
                    correct: true,
                  },
                ],
              }),
            ],
          };
        },
      });

      const records = await loadSessionsFromPath(sessionLogPath(dir));
      const keyAggregates = await loadKeyAggregatesFromPath(keyStatsPath(dir));

      expect(result.stdout).toContain("Saved session to");
      expect(result.stdout).toContain(sessionLogPath(dir));
      expect(result.stdout).toContain("Mode:");
      expect(result.stdout).toContain("WPM:");
      expect(dailyRunIds).toEqual(["20260605-1-appstart"]);
      expect(runnerInitialRenderer).toBe(appRenderer);
      expect(records.map((record) => record.id)).toEqual(["app-start-record"]);
      expect(records[0]?.daily_run_id).toBe("20260605-1-appstart");
      expect(keyAggregates[0]).toMatchObject({
        key: "a",
        sample_count: 1,
        hit_count: 1,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, START_CLI_TEST_TIMEOUT_MS);

  test("bare keyloop start passes return state and today elapsed time to runner", async () => {
    const dir = await tempDir();
    let runnerReturnState: StartRunnerContext["returnState"];
    let runnerTodayElapsedMs: number | undefined;
    try {
      await appendSessionToPath(
        defaultSessionRecord({
          id: "prior-today",
          started_at: "2026-06-05T03:00:00.000Z",
          duration_ms: 28 * 60_000 + 24_000,
        }),
        sessionLogPath(dir),
      );

      await runCli(["--language", "en"], {
        env: { KEYLOOP_HOME: dir },
        now: new Date("2026-06-05T04:00:00.000Z"),
        appRunner: async (context) => {
          const lesson = buildDailyPracticePlan(context).lessons[0];
          if (lesson === undefined) {
            throw new Error("expected app lesson");
          }
          return {
            state: {
              language: context.language,
              route: {
                screen: "running",
                source_item: "comprehensive",
                target: lesson.target,
                lesson,
                return_route: {
                  screen: "submenu",
                  menu: "foundation",
                  selected_index: 0,
                },
              },
              today_elapsed_ms: context.todayElapsedMs,
            },
            action: "start",
          };
        },
        runner: async (context) => {
          runnerReturnState = context.returnState;
          runnerTodayElapsedMs = context.todayElapsedMs;
          return { completedRecords: [] };
        },
      });

      expect(runnerTodayElapsedMs).toBe(28 * 60_000 + 24_000);
      expect(runnerReturnState?.route).toEqual({
        screen: "submenu",
        menu: "foundation",
        selected_index: 0,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("bare keyloop code specialist start keeps standalone lesson metadata", async () => {
    const dir = await tempDir();
    let runnerDailyRunId: string | undefined;
    let runnerLesson: DailyPracticePlan["lessons"][number] | undefined;
    try {
      await runCli(["--language", "en"], {
        env: { KEYLOOP_HOME: dir },
        now: new Date("2026-06-05T04:00:00.000Z"),
        appRunner: async (context) => {
          const codeMenu = reduceOpenTuiAppKey(
            createOpenTuiInitialState(context.language),
            key("5", "5"),
            context,
          );
          const running = reduceOpenTuiAppKey(codeMenu.state, key("2", "2"), context);
          if (running.action !== "start") {
            throw new Error("expected code function start action");
          }
          return { state: running.state, action: "start" };
        },
        runner: async (context) => {
          runnerDailyRunId = context.dailyPlan.run_id;
          runnerLesson = context.dailyPlan.lessons[0];
          return { completedRecords: [] };
        },
      });

      expect(runnerDailyRunId).toBe("");
      expect(runnerLesson?.module).toBe("code_practice");
      expect(runnerLesson?.category).toBe("code_function");
      expect(runnerLesson?.mix_profile).toBe("standalone");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });



  test("start appends completed records returned by runner", async () => {
    const dir = await tempDir();
    try {
      const result = await runCli(["start"], {
        env: { KEYLOOP_HOME: dir },
        now: new Date("2026-06-05T04:00:00Z"),
        idFactory: () => "persist",
        runner: async (context) => {
          const lesson = context.dailyPlan.lessons[0];
          if (lesson === undefined) {
            throw new Error("expected generated daily lesson");
          }
          return {
            completedRecords: [
              defaultSessionRecord({
                id: "saved-one",
                daily_run_id: context.dailyPlan.run_id,
                lesson_id: lesson.id,
                lesson_index: 0,
                module: lesson.module,
                category: lesson.category,
                completion_state: "completed",
              }),
            ],
          };
        },
      });

      const records = await loadSessionsFromPath(sessionLogPath(dir));

      expect(result.stdout).toContain("已保存练习记录到");
      expect(result.stdout).toContain(sessionLogPath(dir));
      expect(result.stdout).toContain("模式:");
      expect(result.stdout).toContain("WPM:");
      expect(result.stdout).not.toContain("已完成 1 次练习");
      expect(records.map((record) => record.id)).toEqual(["saved-one"]);
      expect(records[0]?.daily_run_id).toBe("20260605-1-persist");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, START_CLI_TEST_TIMEOUT_MS);

  test("start updates key stats from completed record key events", async () => {
    const dir = await tempDir();
    try {
      await runCli(["start"], {
        env: { KEYLOOP_HOME: dir },
        now: new Date("2026-06-05T04:00:00Z"),
        runner: async () => ({
          completedRecords: [
            defaultSessionRecord({
              id: "with-key-events",
              key_events: [
                {
                  at_ms: 100,
                  action: "insert",
                  position: 0,
                  expected: "a",
                  input: "a",
                  correct: true,
                },
                {
                  at_ms: 160,
                  action: "auto_indent",
                  position: 1,
                  expected: " ",
                  input: " ",
                  correct: true,
                },
                {
                  at_ms: 350,
                  action: "insert",
                  position: 2,
                  expected: "b",
                  input: "x",
                  correct: false,
                },
              ],
            }),
          ],
        }),
      });

      const aggregates = await loadKeyAggregatesFromPath(keyStatsPath(dir));
      const byKey = new Map(aggregates.map((aggregate) => [aggregate.key, aggregate]));

      expect(byKey.has("auto_indent")).toBe(false);
      expect(byKey.get("a")).toMatchObject({
        sample_count: 1,
        hit_count: 1,
        miss_count: 0,
        avg_ms: 0,
        fastest_ms: 0,
      });
      expect(byKey.get("b")).toMatchObject({
        sample_count: 1,
        hit_count: 0,
        miss_count: 1,
        avg_ms: 190,
        fastest_ms: 190,
        slowest_ms: 190,
        error_rate: 100,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, START_CLI_TEST_TIMEOUT_MS);

  test("start runner context saveRecord persists immediately and avoids duplicate append", async () => {
    const dir = await tempDir();
    try {
      let immediateRecordCount = 0;
      let checkpointExistsAfterSave = true;
      let immediateHitCount = 0;

      await runCli(["start"], {
        env: { KEYLOOP_HOME: dir },
        now: new Date("2026-06-05T04:00:00Z"),
        idFactory: () => "immediate",
        runner: async (context) => {
          const lesson = context.dailyPlan.lessons[0];
          if (lesson === undefined || context.saveRecord === undefined) {
            throw new Error("expected lesson and record saver");
          }
          const record = defaultSessionRecord({
            id: "immediate-record",
            daily_run_id: context.dailyPlan.run_id,
            lesson_id: lesson.id,
            lesson_index: 0,
            module: lesson.module,
            category: lesson.category,
            completion_state: "completed",
            key_events: [
              {
                at_ms: 100,
                action: "insert",
                position: 0,
                expected: "a",
                input: "a",
                correct: true,
              },
            ],
          });

          await context.saveRecord(record);

          immediateRecordCount = (await loadSessionsFromPath(sessionLogPath(dir))).filter(
            (savedRecord) => savedRecord.id === "immediate-record",
          ).length;
          checkpointExistsAfterSave = await Bun.file(currentSessionPath(dir)).exists();
          const aggregates = await loadKeyAggregatesFromPath(keyStatsPath(dir));
          immediateHitCount =
            aggregates.find((aggregate) => aggregate.key === "a")?.hit_count ?? 0;

          return { completedRecords: [record] };
        },
      });

      const records = await loadSessionsFromPath(sessionLogPath(dir));
      const finalAggregates = await loadKeyAggregatesFromPath(keyStatsPath(dir));
      const aggregate = finalAggregates.find((item) => item.key === "a");

      expect(immediateRecordCount).toBe(1);
      expect(checkpointExistsAfterSave).toBe(false);
      expect(immediateHitCount).toBe(1);
      expect(records.filter((record) => record.id === "immediate-record")).toHaveLength(1);
      expect(aggregate?.sample_count).toBe(1);
      expect(aggregate?.hit_count).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, START_CLI_TEST_TIMEOUT_MS);

  test("start saves checkpoint before runner and clears it after completed save", async () => {
    const dir = await tempDir();
    try {
      await saveKeyAggregatesToPath(
        [
          {
            key: "j",
            sample_count: 3,
            hit_count: 2,
            miss_count: 1,
            avg_ms: 120,
            fastest_ms: 80,
            slowest_ms: 220,
            filtered_avg_ms: 120,
            error_rate: 33.3333333333,
            confidence: 220 / 120,
            last_seen_at: "2026-06-05T03:00:00.000Z",
          },
        ],
        keyStatsPath(dir),
      );

      let checkpointTargetId = "";
      let checkpointHash = "";
      let checkpointSampleCount = 0;
      let checkpointKey = "";

      await runCli(["start"], {
        env: { KEYLOOP_HOME: dir },
        now: new Date("2026-06-05T04:00:00Z"),
        idFactory: () => "checkpoint",
        runner: async (context) => {
          const checkpoint = await loadSessionCheckpointFromPath(
            currentSessionPath(dir),
          );
          if (checkpoint === null) {
            throw new Error("expected checkpoint before runner");
          }
          const lesson = context.dailyPlan.lessons[0];
          if (lesson === undefined) {
            throw new Error("expected generated daily lesson");
          }
          checkpointTargetId = checkpoint.target_id;
          checkpointHash = checkpoint.target_hash;
          checkpointSampleCount = checkpoint.key_sample_count;
          checkpointKey = checkpoint.key_aggregates[0]?.key ?? "";

          return {
            completedRecords: [
              defaultSessionRecord({
                id: "checkpoint-complete",
                daily_run_id: context.dailyPlan.run_id,
                lesson_id: lesson.id,
                lesson_index: 0,
                module: lesson.module,
                category: lesson.category,
                completion_state: "completed",
              }),
            ],
          };
        },
      });

      expect(checkpointTargetId).toBe("20260605-1-checkpoint-01-foundation");
      expect(checkpointHash).toMatch(/^[0-9a-f]{16}$/);
      expect(checkpointSampleCount).toBe(3);
      expect(checkpointKey).toBe("j");
      expect(await Bun.file(currentSessionPath(dir)).exists()).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, START_CLI_TEST_TIMEOUT_MS);

  test("start checkpoint hashes refreshed target from reused daily plan", async () => {
    const dir = await tempDir();
    try {
      const stalePlan: DailyPracticePlan = {
        run_id: "20260605-1-stale",
        run_number: 1,
        target_minutes: 20,
        completed_ms: 0,
        lessons: [
          {
            id: "daily:symbols:1",
            kind: "symbols",
            module: "programming_basics",
            category: "programming_basics_mix",
            mix_profile: "comprehensive",
            estimated_minutes: 4,
            target: {
              mode: "symbols",
              text: "fallback",
              source: "test:fallback",
            },
            reason_zh: "stale",
            reason_en: "stale",
          },
        ],
      };
      await mkdir(dir, { recursive: true });
      await writeFile(
        dailyRunsPath(dir),
        JSON.stringify(
          {
            runs: [
              {
                date: "2026-06-05",
                created_at: "2026-06-05T03:00:00.000Z",
                plan: stalePlan,
              },
            ],
          },
          null,
          2,
        ),
      );
      let checkpointHash = "";

      await runCli(["start"], {
        env: { KEYLOOP_HOME: dir },
        now: new Date("2026-06-05T04:00:00.000Z"),
        runner: async (context) => {
          const checkpoint = await loadSessionCheckpointFromPath(
            currentSessionPath(dir),
          );
          if (checkpoint === null) {
            throw new Error("expected checkpoint before runner");
          }
          const lesson = context.dailyPlan.lessons[0];
          if (lesson === undefined || context.targetContext === undefined) {
            throw new Error("expected lesson and target context");
          }
          checkpointHash = checkpoint.target_hash;
          return { completedRecords: [] };
        },
      });

      expect(checkpointHash.length).toBeGreaterThan(0);
      expect(checkpointHash).not.toBe(hashTargetText("fallback"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, START_CLI_TEST_TIMEOUT_MS);

  test("start runner context exposes checkpoint saver", async () => {
    const dir = await tempDir();
    try {
      let checkpointHash = "";

      await runCli(["start"], {
        env: { KEYLOOP_HOME: dir },
        now: new Date("2026-06-05T04:00:00Z"),
        idFactory: () => "saver",
        runner: async (context) => {
          const lesson = context.dailyPlan.lessons[0];
          if (lesson === undefined || context.saveCheckpoint === undefined) {
            throw new Error("expected lesson and checkpoint saver");
          }
          await context.saveCheckpoint(lesson, {
            mode: "words",
            text: "manual checkpoint target",
            source: "test:manual",
          });
          const checkpoint = await loadSessionCheckpointFromPath(
            currentSessionPath(dir),
          );
          if (checkpoint === null) {
            throw new Error("expected saved checkpoint");
          }
          checkpointHash = checkpoint.target_hash;
          return { completedRecords: [] };
        },
      });

      expect(checkpointHash).toBe(hashTargetText("manual checkpoint target"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, START_CLI_TEST_TIMEOUT_MS);


  test("start repo snippets enter the generated code lesson", async () => {
    const dir = await tempDir();
    try {
      const repo = join(dir, "repo");
      await mkdir(repo, { recursive: true });
      await writeFile(
        join(repo, "local.ts"),
        "export function localSelectedValue() {\n  return selected;\n}\n",
      );

      let codeLessonText = "";
      await runCli(["start", "--repo", repo], {
        env: { KEYLOOP_HOME: dir },
        now: new Date("2026-06-05T04:00:00Z"),
        runner: async (context) => {
          codeLessonText =
            context.dailyPlan.lessons.find((lesson) => lesson.module === "code_practice")
              ?.target.text ?? "";
          return { completedRecords: [] };
        },
      });

      expect(codeLessonText).toContain("localSelectedValue");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, START_CLI_TEST_TIMEOUT_MS);

  test("start repo scan failure falls back to built-in code source", async () => {
    const dir = await tempDir();
    try {
      const missingRepo = join(dir, "missing-repo");
      let codeSource = "";

      await runCli(["start", "--repo", missingRepo], {
        env: { KEYLOOP_HOME: dir },
        now: new Date("2026-06-05T04:00:00Z"),
        runner: async (context) => {
          codeSource =
            context.dailyPlan.lessons.find((lesson) => lesson.module === "code_practice")
              ?.target.source ?? "";
          return { completedRecords: [] };
        },
      });

      expect(codeSource).toStartWith("keyloop:code-corpus (repo scan failed:");
      expect(codeSource).toContain("missing-repo");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, START_CLI_TEST_TIMEOUT_MS);






});

function defaultPreferences(language: Language) {
  return {
    interface_language: language,
    speed_unit: "wpm" as const,
    pinned_code_filters: [],
    global_code_filters: [],
    code_practice: {
      difficulty: "adaptive" as const,
      length: "adaptive" as const,
    },
    code_style: defaultCodeStyleSettings(),
    everyday_english: defaultEverydayEnglishSettings(),
    word_breakdown: {
      enabled_in_comprehensive: true,
      max_items_per_group: 6,
      word_repeats: 2,
    },
    programming_terms: {
      word_repeats: 1,
    },
    word_audio: {
      enabled: false,
      volume_percent: 100,
    },
    custom_library: {
      word_repeats: 1,
    },
    personal_vocabulary: {
      enabled_in_comprehensive: true,
      daily_review_limit: 8,
    },
    enabled_modules: [
      "foundation_input" as const,
      "everyday_english" as const,
      "programming_basics" as const,
      "code_practice" as const,
    ],
  };
}

function defaultEverydayEnglishSettings() {
  return {
    word_range: "1000" as const,
    word_count: 20,
    word_repeats: 1,
    sentence_level: "cet4" as const,
    sentence_length: "mixed" as const,
    sentence_count: 5,
    article_level: "cet4" as const,
    article_length: "short" as const,
    decomposition_level: "cet4" as const,
    decomposition_word_count: 10,
    decomposition_part_repeats: 3,
    decomposition_word_repeats: 3,
    include_phrases: true,
  };
}

function key(name: string, sequence: string): OpenTuiKeyEvent {
  return { name, sequence, ctrl: false, meta: false };
}

function pressSettingsDown(
  state: OpenTuiAppState,
  context: Parameters<typeof reduceOpenTuiAppKey>[2],
  count: number,
): OpenTuiAppState {
  let current = state;
  for (let index = 0; index < count; index += 1) {
    current = reduceOpenTuiAppKey(current, key("down", ""), context).state;
  }
  return current;
}

function hashTargetText(text: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

async function writeUserEverydayCorpus(path: string): Promise<void> {
  await writeFile(
    path,
    JSON.stringify({
      sources: [
        {
          source_id: "user:everyday",
          source_name: "User everyday corpus",
          source_url: "file://everyday-user.json",
          license: "user-provided",
          retrieved_at: "2026-06-05",
          generation_script: "manual",
          included_fields: ["text", "kind"],
          notes: "Temporary user corpus.",
        },
      ],
      entries: [
        {
          text: "deployment checklist",
          kind: "phrase",
          tier: 2,
          length: null,
          domain: "workplace",
          source_id: "user:everyday",
        },
      ],
    }),
  );
}

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "keyloop-cli-"));
}
