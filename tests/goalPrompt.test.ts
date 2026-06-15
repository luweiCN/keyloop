import { describe, expect, test } from "bun:test";
import { shouldShowGoalPrompt, GOAL_DIRECTIONS } from "../src/training/goalPrompt";
import type { UserPreferences, MainGoal } from "../src/domain/model";
import type { FormSpeed } from "../src/training/diagnosis";

const NOW = new Date("2026-06-15T00:00:00Z");

function prefs(overrides: Partial<UserPreferences> = {}): UserPreferences {
  return { goal_prompt_opted_out: false, ...overrides } as UserPreferences;
}
function goal(overrides: Partial<MainGoal> = {}): MainGoal {
  return {
    form: "code",
    target_wpm: 60,
    deadline: "2026-09-13",
    created_at: "2026-06-15",
    ...overrides,
  };
}
function speed(form: MainGoal["form"], wpm: number | null): FormSpeed {
  return { form, samples: 5, ewma_wpm: wpm };
}

describe("shouldShowGoalPrompt", () => {
  test("no goal -> welcome", () => {
    expect(shouldShowGoalPrompt(prefs(), [], NOW)).toEqual({ show: true, scenario: "welcome" });
  });
  test("opted out -> not shown", () => {
    expect(shouldShowGoalPrompt(prefs({ goal_prompt_opted_out: true }), [], NOW).show).toBe(false);
  });
  test("goal in progress (not reached, not expired) -> not shown", () => {
    const p = prefs({ main_goal: goal({ target_wpm: 60, deadline: "2026-09-13" }) });
    expect(shouldShowGoalPrompt(p, [speed("code", 40)], NOW).show).toBe(false);
  });
  test("goal reached by speed -> achieved", () => {
    const p = prefs({ main_goal: goal({ target_wpm: 60 }) });
    expect(shouldShowGoalPrompt(p, [speed("code", 65)], NOW)).toEqual({
      show: true,
      scenario: "achieved",
    });
  });
  test("goal expired -> achieved", () => {
    const p = prefs({ main_goal: goal({ deadline: "2026-06-01" }) });
    expect(shouldShowGoalPrompt(p, [speed("code", 10)], NOW)).toEqual({
      show: true,
      scenario: "achieved",
    });
  });
  test("achieved but last_shown within 7 days -> not shown", () => {
    const p = prefs({
      main_goal: goal({ deadline: "2026-06-01" }),
      goal_prompt_last_shown: "2026-06-10",
    });
    expect(shouldShowGoalPrompt(p, [], NOW).show).toBe(false);
  });
  test("achieved and last_shown >=7 days ago -> achieved", () => {
    const p = prefs({
      main_goal: goal({ deadline: "2026-06-01" }),
      goal_prompt_last_shown: "2026-06-01",
    });
    expect(shouldShowGoalPrompt(p, [], NOW)).toEqual({ show: true, scenario: "achieved" });
  });
  test("GOAL_DIRECTIONS maps usage to forms", () => {
    expect(GOAL_DIRECTIONS.map((d) => d.form)).toEqual(["articles", "code", "keys"]);
  });
});
