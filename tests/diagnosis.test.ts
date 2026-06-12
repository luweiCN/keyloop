import { describe, expect, test } from "bun:test";

import {
  charSkillDimensions,
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
