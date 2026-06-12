import { describe, expect, test } from "bun:test";

import {
  charSkillDimensions,
  ewmaAverage,
  seriesTrend,
  type SkillDimensionId,
} from "../src/training/diagnosis";

describe("charSkillDimensions", () => {
  test("home row letter maps to row and hand", () => {
    expect(charSkillDimensions("a")).toEqual(["home_row", "left_hand"]);
    expect(charSkillDimensions("j")).toEqual(["home_row", "right_hand"]);
  });

  test("uppercase letter adds capitalization", () => {
    expect(charSkillDimensions("A")).toEqual([
      "home_row",
      "left_hand",
      "capitalization",
    ]);
  });

  test("digit maps to digits only", () => {
    expect(charSkillDimensions("7")).toEqual(["digits"]);
  });

  test("symbol maps to symbols only", () => {
    expect(charSkillDimensions(";")).toEqual(["symbols"]);
    expect(charSkillDimensions("{")).toEqual(["symbols"]);
  });

  test("space and newline map to nothing", () => {
    expect(charSkillDimensions(" ")).toEqual([]);
    expect(charSkillDimensions("\n")).toEqual([]);
  });
});

describe("ewmaAverage", () => {
  test("empty series returns null", () => {
    expect(ewmaAverage([])).toBeNull();
  });

  test("single value returns itself", () => {
    expect(ewmaAverage([42])).toBe(42);
  });

  test("recent values weigh more (half-life 4)", () => {
    // values 按时间正序：旧 → 新。全 10 加一个最新 20，EWMA 必须明显偏向 20
    const result = ewmaAverage([10, 10, 10, 10, 20]);
    expect(result).toBeGreaterThan(12);
    expect(result).toBeLessThan(20);
  });
});

describe("seriesTrend", () => {
  test("fewer than 4 samples is insufficient", () => {
    expect(seriesTrend([10, 12, 11], "higher_is_better")).toBe("insufficient");
  });

  test("rising wpm is improving", () => {
    expect(seriesTrend([20, 20, 30, 30], "higher_is_better")).toBe("improving");
  });

  test("rising key delay is declining", () => {
    expect(seriesTrend([200, 200, 300, 300], "lower_is_better")).toBe("declining");
  });

  test("change within 8% is stable", () => {
    expect(seriesTrend([100, 100, 104, 104], "higher_is_better")).toBe("stable");
  });
});
