import { describe, expect, test } from "bun:test";

import { wordBreakdownRepeatControls } from "../src/ui/opentui/practiceOptions";

describe("practice option controls", () => {
  test("long-word repeat controls cover one through ten", () => {
    expect([...wordBreakdownRepeatControls]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
