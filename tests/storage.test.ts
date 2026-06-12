import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";

import {
  appendSessionToPath,
  clearSessionCheckpointAtPath,
  customLibrariesDirPath,
  defaultSessionRecord,
  deleteCustomLibraryAtDir,
  keyloopDataDir,
  loadCustomLibrariesFromDir,
  saveCustomLibraryToDir,
  type CustomLibrary,
  loadOrCreateDailyPracticePlanFromPath,
  loadKeyAggregatesFromPath,
  loadPreferencesFromPath,
  loadSessionCheckpointFromPath,
  loadSessionsFromPath,
  observeKeyEvent,
  parseUserPreferences,
  savePreferencesToPath,
  saveSessionCheckpointToPath,
  type DailyPracticePlan,
  type KeyAggregate,
  type KeyEventRecord,
  type PracticeLesson,
  type PracticeTarget,
  type UserPreferences,
} from "../src/index";

describe("storage model defaults", () => {
  test("preferences default new word feature fields", () => {
    const preferences = parseUserPreferences({
      interface_language: "en",
      everyday_english: {
        word_count: 25,
        sentence_length: "short",
        include_phrases: false,
      },
    });

    expect(preferences.interface_language).toBe("en");
    expect(preferences.speed_unit).toBe("wpm");
    expect(preferences.code_practice.length).toBe("adaptive");
    expect(preferences.everyday_english.word_count).toBe(20);
    expect(preferences.everyday_english.word_range).toBe("1000");
    expect(preferences.everyday_english.word_repeats).toBe(1);
    expect(preferences.everyday_english.decomposition_word_repeats).toBe(3);
    expect(preferences.word_breakdown.enabled_in_comprehensive).toBe(true);
    expect(preferences.word_breakdown.max_items_per_group).toBe(6);
    expect(preferences.word_breakdown.word_repeats).toBe(2);
    expect(preferences.programming_terms.word_repeats).toBe(1);
    expect(preferences.word_audio.enabled).toBe(false);
    expect(preferences.custom_library.word_repeats).toBe(1);
    expect(preferences.personal_vocabulary.enabled_in_comprehensive).toBe(true);
    expect(preferences.personal_vocabulary.daily_review_limit).toBe(8);
  });

  test("preferences allow ten everyday word repeats", () => {
    const preferences = parseUserPreferences({
      everyday_english: {
        word_repeats: 10,
      },
    });

    expect(preferences.everyday_english.word_repeats).toBe(10);
  });

  test("preferences allow ten long-word repeats", () => {
    const preferences = parseUserPreferences({
      word_breakdown: {
        word_repeats: 10,
      },
    });

    expect(preferences.word_breakdown.word_repeats).toBe(10);
  });

  test("preferences allow ten programming term repeats", () => {
    const preferences = parseUserPreferences({
      programming_terms: {
        word_repeats: 10,
      },
    });

    expect(preferences.programming_terms.word_repeats).toBe(10);
  });

  test("preferences allow word audio and custom library word repeats", () => {
    const preferences = parseUserPreferences({
      word_audio: {
        enabled: true,
      },
      custom_library: {
        word_repeats: 10,
      },
    });

    expect(preferences.word_audio.enabled).toBe(true);
    expect(preferences.custom_library.word_repeats).toBe(10);
  });

  test("preferences preserve intermediate long-word repeat counts", () => {
    const preferences = parseUserPreferences({
      word_breakdown: {
        word_repeats: 6,
      },
    });

    expect(preferences.word_breakdown.word_repeats).toBe(6);
  });
});

describe("storage file io", () => {
  test("data dir prefers KEYLOOP_HOME over home dir", () => {
    expect(
      keyloopDataDir({
        env: { KEYLOOP_HOME: "/tmp/keyloop-custom" },
        homeDir: "/home/test",
      }),
    ).toBe("/tmp/keyloop-custom");
    expect(keyloopDataDir({ env: {}, homeDir: "/home/test" })).toBe(
      "/home/test/.keyloop",
    );
  });

  test("sessions append as jsonl and invalid rows are skipped", async () => {
    const dir = await tempDir();
    try {
      const path = join(dir, "nested", "sessions.jsonl");
      await appendSessionToPath(defaultSessionRecord({ id: "one" }), path);
      await writeFile(path, "not json\n", { flag: "a" });
      await appendSessionToPath(defaultSessionRecord({ id: "two" }), path);

      const records = await loadSessionsFromPath(path);

      expect(records.map((record) => record.id)).toEqual(["one", "two"]);
      expect((await readFile(path, "utf8")).trim().split("\n")).toHaveLength(3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("sessions skip rows with invalid present enum values", async () => {
    const dir = await tempDir();
    try {
      const path = join(dir, "sessions.jsonl");
      const valid = defaultSessionRecord({ id: "valid", mode: "words" });
      const invalidMode = { ...defaultSessionRecord({ id: "bad-mode" }), mode: "typing" };
      const invalidCompletion = {
        ...defaultSessionRecord({ id: "bad-completion" }),
        completion_state: "done",
      };
      const invalidTokenKind = {
        ...defaultSessionRecord({ id: "bad-token-kind" }),
        token_stats: [
          {
            token: "Selected",
            kind: "identifier",
            start_delay_ms: 10,
            duration_ms: 20,
            errors: 1,
          },
        ],
      };
      const legacyMissingEnums = { id: "legacy-missing" };
      await writeFile(
        path,
        [
          valid,
          invalidMode,
          invalidCompletion,
          invalidTokenKind,
          legacyMissingEnums,
        ]
          .map((record) => JSON.stringify(record))
          .join("\n"),
      );

      const records = await loadSessionsFromPath(path);

      expect(records.map((record) => record.id)).toEqual(["valid", "legacy-missing"]);
      expect(records[1]?.mode).toBe("mixed");
      expect(records[1]?.completion_state).toBe("completed");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });


  test("rejects malformed structured json stores", async () => {
    const dir = await tempDir();
    try {
      const keyStatsPath = join(dir, "key_stats.json");
      const dailyRunsPath = join(dir, "daily_runs.json");
      await writeFile(keyStatsPath, "{}\n");
      await writeFile(dailyRunsPath, "[]\n");

      await expectRejectsWith(
        loadKeyAggregatesFromPath(keyStatsPath),
        "key_stats.json must contain a JSON array",
      );
      await expectRejectsWith(
        loadOrCreateDailyPracticePlanFromPath({
          path: dailyRunsPath,
          today: "2026-05-31",
          freshPlan: testPlan("malformed"),
          records: [],
          now: "2026-05-31T10:00:00Z",
          idFactory: () => "ignored",
        }),
        "daily_runs.json must contain a JSON object",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });


  test("rejects invalid preferences enum values", async () => {
    const dir = await tempDir();
    try {
      const path = join(dir, "preferences.json");
      await writeFile(path, JSON.stringify({ interface_language: "fr" }));

      await expectRejectsWith(
        loadPreferencesFromPath(path),
        "interface_language must be one of: zh, en",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("rejects invalid speed unit preference", async () => {
    const dir = await tempDir();
    try {
      const path = join(dir, "preferences.json");
      await writeFile(path, JSON.stringify({ speed_unit: "wps" }));

      await expectRejectsWith(
        loadPreferencesFromPath(path),
        "speed_unit must be one of: wpm, cpm",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("rejects invalid code filter facets", async () => {
    const dir = await tempDir();
    try {
      const path = join(dir, "preferences.json");
      await writeFile(
        path,
        JSON.stringify({
          pinned_code_filters: [{ facet: "library", value: "react" }],
        }),
      );

      await expectRejectsWith(
        loadPreferencesFromPath(path),
        "pinned_code_filters.facet must be one of: language, framework, project",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("rejects stored daily runs with invalid lesson kind", async () => {
    const dir = await tempDir();
    try {
      const path = join(dir, "daily_runs.json");
      const today = "2026-05-31";
      const storedPlan = testPlan("stored");
      storedPlan.run_id = "20260531-1-stored";
      storedPlan.run_number = 1;
      storedPlan.lessons[0] = {
        ...storedPlan.lessons[0]!,
        kind: "mystery" as PracticeLesson["kind"],
      };
      await writeFile(
        path,
        JSON.stringify({
          runs: [
            {
              date: today,
              created_at: "2026-05-31T10:00:00Z",
              plan: storedPlan,
            },
          ],
        }),
      );

      await expectRejectsWith(
        loadOrCreateDailyPracticePlanFromPath({
          path,
          today,
          freshPlan: testPlan("fresh"),
          records: [],
          now: "2026-05-31T11:00:00Z",
          idFactory: () => "fresh",
        }),
        "lesson.kind must be one of: foundation, warmup, chunks, common_words, words, symbols, naming, code_block",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("rejects stored daily runs with invalid defaulted lesson enums", async () => {
    const cases: Array<{
      field: "module" | "category" | "mix_profile";
      value: string;
      message: string;
    }> = [
      {
        field: "module",
        value: "typing_core",
        message:
          "lesson.module must be one of: unknown, comprehensive, foundation_input, everyday_english, programming_basics, code_practice",
      },
      {
        field: "category",
        value: "syntax_mix",
        message:
          "lesson.category must be one of: unknown, foundation_mix, home_row, top_row, bottom_row, finger_transitions, punctuation_edges, letter_combinations, basic_words, everyday_words, everyday_phrases, everyday_sentences, everyday_articles, everyday_word_decomposition, everyday_mix, numbers_symbols, symbols_numbers, programming_terms, naming_styles, builtin_api, programming_basics_mix, code_snippet, code_function, code_file_fragment, code_mix, review, word_breakdown, personal_vocabulary",
      },
      {
        field: "mix_profile",
        value: "daily",
        message: "lesson.mix_profile must be one of: standalone, comprehensive, review",
      },
    ];

    for (const item of cases) {
      const dir = await tempDir();
      try {
        const path = join(dir, "daily_runs.json");
        const today = "2026-05-31";
        const storedPlan = testPlan(item.field);
        storedPlan.run_id = `20260531-1-${item.field}`;
        storedPlan.run_number = 1;
        storedPlan.lessons[0] = {
          ...storedPlan.lessons[0]!,
          [item.field]: item.value,
        };
        await writeFile(
          path,
          JSON.stringify({
            runs: [
              {
                date: today,
                created_at: "2026-05-31T10:00:00Z",
                plan: storedPlan,
              },
            ],
          }),
        );

        await expectRejectsWith(
          loadOrCreateDailyPracticePlanFromPath({
            path,
            today,
            freshPlan: testPlan("fresh"),
            records: [],
            now: "2026-05-31T11:00:00Z",
            idFactory: () => "fresh",
          }),
          item.message,
        );
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }
  });

  test("rejects stored daily runs with invalid target mode", async () => {
    const dir = await tempDir();
    try {
      const path = join(dir, "daily_runs.json");
      const today = "2026-05-31";
      const storedPlan = testPlan("invalid-target-mode");
      storedPlan.run_id = "20260531-1-invalid-target-mode";
      storedPlan.run_number = 1;
      storedPlan.lessons[0] = {
        ...storedPlan.lessons[0]!,
        target: {
          ...storedPlan.lessons[0]!.target,
          mode: "paragraph" as PracticeTarget["mode"],
        },
      };
      await writeFile(
        path,
        JSON.stringify({
          runs: [
            {
              date: today,
              created_at: "2026-05-31T10:00:00Z",
              plan: storedPlan,
            },
          ],
        }),
      );

      await expectRejectsWith(
        loadOrCreateDailyPracticePlanFromPath({
          path,
          today,
          freshPlan: testPlan("fresh"),
          records: [],
          now: "2026-05-31T11:00:00Z",
          idFactory: () => "fresh",
        }),
        "target.mode must be one of: chars, numbers, case, words, symbols, code, mixed",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("daily runs and key aggregates", () => {
  test("unfinished daily run is reused and completed run creates next run", async () => {
    const dir = await tempDir();
    try {
      const path = join(dir, "daily_runs.json");
      const today = "2026-05-31";
      const first = await loadOrCreateDailyPracticePlanFromPath({
        path,
        today,
        freshPlan: testPlan("first"),
        records: [],
        now: "2026-05-31T10:00:00Z",
        idFactory: () => "aaa",
      });
      const reused = await loadOrCreateDailyPracticePlanFromPath({
        path,
        today,
        freshPlan: testPlan("ignored"),
        records: [],
        now: "2026-05-31T11:00:00Z",
        idFactory: () => "bbb",
      });

      expect(reused.run_id).toBe(first.run_id);
      expect(reused.run_number).toBe(1);

      const records = first.lessons.map((lesson, index) =>
        defaultSessionRecord({
          started_at: "2026-05-31T12:00:00Z",
          daily_run_id: first.run_id,
          lesson_id: lesson.id,
          lesson_index: index,
          completion_state: "completed",
          duration_ms: 500,
        }),
      );
      const second = await loadOrCreateDailyPracticePlanFromPath({
        path,
        today,
        freshPlan: testPlan("second"),
        records,
        now: "2026-05-31T13:00:00Z",
        idFactory: () => "ccc",
      });

      expect(second.run_id).toBe("20260531-2-ccc");
      expect(second.run_number).toBe(2);
      expect(second.completed_ms).toBe(1000);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("partial records do not complete daily run", async () => {
    const dir = await tempDir();
    try {
      const path = join(dir, "daily_runs.json");
      const first = await loadOrCreateDailyPracticePlanFromPath({
        path,
        today: "2026-05-31",
        freshPlan: testPlan("partial"),
        records: [],
        now: "2026-05-31T10:00:00Z",
        idFactory: () => "partial",
      });
      const partialRecord = defaultSessionRecord({
        daily_run_id: first.run_id,
        lesson_id: first.lessons[0]?.id ?? "",
        completion_state: "partial",
      });
      const reused = await loadOrCreateDailyPracticePlanFromPath({
        path,
        today: "2026-05-31",
        freshPlan: testPlan("ignored"),
        records: [partialRecord],
        now: "2026-05-31T11:00:00Z",
        idFactory: () => "ignored",
      });

      expect(reused.run_id).toBe(first.run_id);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("key aggregates observe hits misses intervals and ignore auto indent", () => {
    const aggregates: KeyAggregate[] = [];

    observeKeyEvent(aggregates, insertEvent("a", true), 120, "2026-06-01T00:00:00Z");
    observeKeyEvent(aggregates, insertEvent("a", false, "x"), 500, "2026-06-01T00:00:01Z");
    observeKeyEvent(
      aggregates,
      {
        at_ms: 600,
        action: "auto_indent",
        position: 2,
        expected: "\n",
        input: "\n",
        correct: true,
      },
      100,
      "2026-06-01T00:00:02Z",
    );

    expect(aggregates).toHaveLength(1);
    expect(aggregates[0]).toMatchObject({
      key: "a",
      sample_count: 2,
      hit_count: 1,
      miss_count: 1,
      fastest_ms: 120,
      slowest_ms: 500,
      avg_ms: 310,
      filtered_avg_ms: 310,
      error_rate: 50,
    });
    expect(aggregates[0]?.confidence).toBeCloseTo(220 / 310);
    expect(aggregates[0]?.last_seen_at).toBe("2026-06-01T00:00:01Z");
  });

  test("session checkpoint saves and clears", async () => {
    const dir = await tempDir();
    try {
      const path = join(dir, "current_session.json");
      await saveSessionCheckpointToPath(
        {
          target_id: "daily:foundation:1",
          target_hash: "abc123",
          input_len: 12,
          active_ms: 1500,
          idle_ms: 10000,
          key_sample_count: 5,
          key_aggregates: [],
        },
        path,
      );

      expect(await readFile(path, "utf8")).toContain("daily:foundation:1");
      await clearSessionCheckpointAtPath(path);
      expect(await Bun.file(path).exists()).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "keyloop-ts-storage-"));
}

function testPlan(label: string): DailyPracticePlan {
  return {
    run_id: "",
    run_number: 0,
    target_minutes: 20,
    completed_ms: 0,
    lessons: [
      testLesson("warmup", `${label}:warmup`),
      testLesson("symbols", `${label}:symbols`),
    ],
  };
}

function testLesson(kind: PracticeLesson["kind"], source: string): PracticeLesson {
  return {
    id: "",
    kind,
    module: "unknown",
    category: "unknown",
    mix_profile: "standalone",
    estimated_minutes: 3,
    target: {
      mode: "words",
      text: "abc",
      source,
    },
    reason_zh: "测试",
    reason_en: "test",
  };
}

function insertEvent(
  expected: string,
  correct: boolean,
  input = expected,
): KeyEventRecord {
  return {
    at_ms: 100,
    action: "insert",
    position: 0,
    expected,
    input,
    correct,
  };
}

describe("custom library store", () => {
  const sample: CustomLibrary = {
    version: 1,
    slug: "kaoyan",
    name: "考研英语",
    created_at: "2026-06-11T00:00:00.000Z",
    words: [{ id: "w1", text: "abandon", kind: "word", meaning_zh: "放弃", source: "dict" }],
    sentences: [],
    articles: [],
  };

  test("save, load, delete round-trip", async () => {
    const dir = await mkdtemp(join(tmpdir(), "keyloop-lib-"));
    const librariesDir = customLibrariesDirPath(dir);
    expect(await loadCustomLibrariesFromDir(librariesDir)).toEqual([]);
    await saveCustomLibraryToDir(sample, librariesDir);
    expect(await loadCustomLibrariesFromDir(librariesDir)).toEqual([sample]);
    await deleteCustomLibraryAtDir("kaoyan", librariesDir);
    expect(await loadCustomLibrariesFromDir(librariesDir)).toEqual([]);
    await rm(dir, { recursive: true, force: true });
  });

  test("corrupt json file is skipped", async () => {
    const dir = await mkdtemp(join(tmpdir(), "keyloop-lib-"));
    const librariesDir = customLibrariesDirPath(dir);
    await saveCustomLibraryToDir(sample, librariesDir);
    await writeFile(join(librariesDir, "broken.json"), "{not json");
    expect(await loadCustomLibrariesFromDir(librariesDir)).toEqual([sample]);
    await rm(dir, { recursive: true, force: true });
  });
});

async function expectRejectsWith(promise: Promise<unknown>, message: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(String(error)).toContain(message);
    return;
  }
  throw new Error(`Expected promise to reject with ${message}`);
}
