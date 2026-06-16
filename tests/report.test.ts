import { describe, expect, test } from "bun:test";

import {
  defaultSessionRecord,
  importPreview,
  planReport,
  sessionSummary,
  sourceCatalogReport,
  todayReport,
  type CodeSnippet,
  type SourceCatalogEntry,
} from "../src/index";

const NOW = new Date("2026-06-05T04:00:00.000Z");

function recordToday(overrides = {}) {
  return defaultSessionRecord({
    started_at: "2026-06-05T03:00:00.000Z",
    duration_ms: 60_000,
    active_ms: 30_000,
    idle_ms: 30_000,
    manual_pause_ms: 5_000,
    target_len: 3,
    typed_len: 4,
    correct_chars: 3,
    wpm: 36,
    raw_wpm: 48,
    accuracy: 75,
    ...overrides,
  });
}

function emptyPlan() {
  return {
    focus_words: [],
    focus_symbols: [],
    focus_code: [],
    focus_keys: [],
    advice: [],
    recommended_mode: "mixed" as const,
    has_recent_history: false,
  };
}

describe("CLI report parity", () => {
  test("today report without sessions recommends keyloop start", () => {
    const report = todayReport([], emptyPlan(), "zh", { now: NOW });

    expect(report).toContain("今天还没有 KeyLoop 练习记录");
    expect(report).toContain("推荐练习：混合");
    expect(report).toContain("运行：keyloop start");
    expect(report).not.toContain("keyloop start mixed");
  });

  test("today report uses active time and saved weighted accuracy", () => {
    const legacy = recordToday({
      typed_len: 0,
      correct_chars: 3,
      user_input: "abc",
      accuracy: 50,
    });
    const modern = recordToday({
      typed_len: 1,
      correct_chars: 1,
      accuracy: 100,
      active_ms: 30_000,
    });

    const report = todayReport([legacy, modern], emptyPlan(), "zh", { now: NOW });

    expect(report).toContain("WPM: 0.8");
    expect(report).toContain("原始 WPM: 0.8");
    expect(report).toContain("正确率: 62.5%");
    expect(report).toContain("计时: active 1 分钟 0 秒 | idle 1 分钟 0 秒 | pause 10 秒");
  });

  test("today report uses the configured speed unit", () => {
    const report = todayReport(
      [
        recordToday({
          active_ms: 30_000,
          typed_len: 150,
          correct_chars: 150,
          accuracy: 100,
        }),
      ],
      emptyPlan(),
      "en",
      { now: NOW, speedUnit: "cpm" },
    );

    expect(report).toContain("CPM: 300.0");
    expect(report).toContain("Raw CPM: 300.0");
    expect(report).not.toContain("WPM:");
  });

  test("today report separates comprehensive and standalone records", () => {
    const comprehensive = recordToday({
      daily_run_id: "20260605-1",
      active_ms: 30_000,
    });
    const standalone = recordToday({
      daily_run_id: "",
      active_ms: 60_000,
    });

    const report = todayReport([comprehensive, standalone], emptyPlan(), "zh", {
      now: NOW,
    });

    expect(report).toContain("综合练习: 1 次 / active 30 秒");
    expect(report).toContain("专项练习: 1 次 / active 1 分钟 0 秒");
  });

  test("today report uses legacy error tokens and filters generated identifiers", () => {
    const report = todayReport(
      [
        recordToday({
          token_stats: [],
          error_tokens: {
            function: 2,
            "=>": 1,
            transaction5Open: 9,
          },
        }),
      ],
      emptyPlan(),
      "zh",
      { now: NOW },
    );

    expect(report).toContain("function");
    expect(report).toContain("=>");
    expect(report).not.toContain("transaction5Open");
  });

  test("plan report includes the v3 module path and advice", () => {
    const report = planReport(
      {
        ...emptyPlan(),
        focus_keys: ["j"],
        focus_words: ["selected"],
        focus_symbols: ["=>"],
        focus_code: ["useState"],
        advice: ["慢一点，把 selected 打准。"],
      },
      "zh",
    );

    expect(report).toContain("下一轮 KeyLoop 计划");
    expect(report).toContain("训练路径: 按技能诊断组合阶段");
    expect(report).toContain("键位热区:\n  j");
    expect(report).toContain("  1. 慢一点，把 selected 打准。");
  });

  test("session summary lists mode metrics and slow focus", () => {
    const report = sessionSummary(
      recordToday({
        mode: "code",
        slow_tokens: [
          {
            token: "selectedReceiptId",
            kind: "word",
            start_delay_ms: 100,
            duration_ms: 900,
            errors: 1,
          },
        ],
      }),
      "/tmp/keyloop/sessions.jsonl",
      "en",
    );

    expect(report).toContain("Saved session to /tmp/keyloop/sessions.jsonl");
    expect(report).toContain("Mode: code");
    expect(report).toContain("WPM: 36.0 | Raw WPM: 48.0 | Accuracy: 75.0%");
    expect(report).toContain("Slow focus: selectedReceiptId");
  });

  test("session summary uses the configured speed unit", () => {
    const report = sessionSummary(recordToday({ mode: "code" }), "/tmp/keyloop/sessions.jsonl", "en", {
      speedUnit: "cpm",
    });

    expect(report).toContain("CPM: 180.0 | Raw CPM: 240.0 | Accuracy: 75.0%");
    expect(report).not.toContain("WPM:");
  });

  test("source catalog report preserves provenance fields", () => {
    const source: SourceCatalogEntry = {
      source_id: "react-docs",
      source_name: "React docs",
      source_url: "https://react.dev",
      repo: "reactjs/react.dev",
      repo_url: "https://github.com/reactjs/react.dev",
      license_spdx: "MIT",
      retrieved_at: "2026-06-05",
      corpus: "code",
      generation_script: "direct",
      languages: ["typescript"],
      frameworks: ["react"],
      included_fields: ["text"],
      notes: "docs examples",
    };

    const report = sourceCatalogReport([source], "en");

    expect(report).toContain("Recommended corpus sources");
    expect(report).toContain("- React docs [MIT] https://react.dev | react-docs");
    expect(report).toContain("typescript | react | text | docs examples");
  });

  test("import preview lists candidate snippets and overflow count", () => {
    const snippets: CodeSnippet[] = Array.from({ length: 13 }, (_, index) => ({
      text: `const value${index} = ${index};\nreturn value${index};`,
      source: `src/demo${index}.ts:1`,
      difficulty: index === 0 ? "easy" : "medium",
      score: 20,
      language: "typescript",
      framework: "react",
      project: "demo",
      level: "block",
    }));

    const report = importPreview("/tmp/repo", snippets, "zh");

    expect(report).toContain("在 /tmp/repo 中找到 13 个候选片段");
    expect(report).toContain("1. [简单 block / typescript / react / demo]");
    expect(report).toContain("const value0 = 0; / return value0;");
    expect(report).toContain("... 还有 1 个");
  });
});
