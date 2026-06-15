import { describe, expect, test } from "bun:test";
import { parseUserPreferences, defaultUserPreferences } from "../src/domain/model";

describe("goal prompt preferences", () => {
  test("defaults opted_out to false and last_shown undefined", () => {
    const prefs = defaultUserPreferences();
    expect(prefs.goal_prompt_opted_out).toBe(false);
    expect(prefs.goal_prompt_last_shown).toBeUndefined();
  });

  test("parse fills missing goal-prompt fields from old file", () => {
    const parsed = parseUserPreferences({ interface_language: "zh" });
    expect(parsed.goal_prompt_opted_out).toBe(false);
    expect(parsed.goal_prompt_last_shown).toBeUndefined();
  });

  test("parse preserves stored goal-prompt fields", () => {
    const parsed = parseUserPreferences({
      goal_prompt_opted_out: true,
      goal_prompt_last_shown: "2026-06-10",
    });
    expect(parsed.goal_prompt_opted_out).toBe(true);
    expect(parsed.goal_prompt_last_shown).toBe("2026-06-10");
  });
});
