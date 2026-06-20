import { describe, expect, test } from "bun:test";

import { defaultSessionRecord } from "../src/index";
import { todayRunCompletedRecords } from "../src/ui/opentui/runnerSelection";

describe("todayRunCompletedRecords", () => {
  test("跨退出重进：合并历史与本段，前段已完成的模块不丢失", () => {
    const runId = "run-1";
    // 历史记录（持久化，含本次退出前完成的前两个模块）+ 干扰项
    const history = [
      defaultSessionRecord({
        id: "r0",
        daily_run_id: runId,
        completion_state: "completed",
        lesson_id: "L0",
        lesson_index: 0,
      }),
      defaultSessionRecord({
        id: "r1",
        daily_run_id: runId,
        completion_state: "completed",
        lesson_id: "L1",
        lesson_index: 1,
      }),
      // 干扰：别的 run
      defaultSessionRecord({
        id: "x",
        daily_run_id: "other-run",
        completion_state: "completed",
        lesson_id: "LX",
        lesson_index: 0,
      }),
      // 干扰：未完成
      defaultSessionRecord({
        id: "p",
        daily_run_id: runId,
        completion_state: "partial",
        lesson_id: "L9",
        lesson_index: 9,
      }),
    ];
    // 本段（重进后内存里新完成的后三个模块，只给一个代表）
    const thisRun = [
      defaultSessionRecord({
        id: "r2",
        daily_run_id: runId,
        completion_state: "completed",
        lesson_id: "L2",
        lesson_index: 2,
      }),
    ];

    const result = todayRunCompletedRecords(history, runId, thisRun);

    expect(result.map((r) => r.lesson_id)).toEqual(["L0", "L1", "L2"]);
  });

  test("同一 lesson 重复完成时去重，保留本段最新一次", () => {
    const runId = "run-1";
    const history = [
      defaultSessionRecord({
        id: "old",
        daily_run_id: runId,
        completion_state: "completed",
        lesson_id: "L0",
        lesson_index: 0,
        wpm: 30,
      }),
    ];
    const thisRun = [
      defaultSessionRecord({
        id: "new",
        daily_run_id: runId,
        completion_state: "completed",
        lesson_id: "L0",
        lesson_index: 0,
        wpm: 50,
      }),
    ];

    const result = todayRunCompletedRecords(history, runId, thisRun);

    expect(result).toHaveLength(1);
    expect(result[0]?.wpm).toBe(50);
  });
});
