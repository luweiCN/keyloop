import { describe, expect, test } from "bun:test";

import { parseUserPreferences } from "../src/domain/model";

describe("parseMainGoal (via parseUserPreferences)", () => {
  test("parses a valid main_goal", () => {
    const prefs = parseUserPreferences({
      main_goal: {
        form: "code",
        target_wpm: 50,
        deadline: "2026-09-14",
        created_at: "2026-06-14T00:00:00Z",
      },
    });
    expect(prefs.main_goal).toEqual({
      form: "code",
      target_wpm: 50,
      deadline: "2026-09-14",
      created_at: "2026-06-14T00:00:00Z",
    });
  });

  test("returns undefined for missing or invalid goal", () => {
    expect(parseUserPreferences({}).main_goal).toBeUndefined();
    expect(
      parseUserPreferences({ main_goal: { form: "nope", target_wpm: 50 } }).main_goal,
    ).toBeUndefined();
    expect(
      parseUserPreferences({
        main_goal: { form: "code", target_wpm: 0, deadline: "x", created_at: "y" },
      }).main_goal,
    ).toBeUndefined();
  });
});
