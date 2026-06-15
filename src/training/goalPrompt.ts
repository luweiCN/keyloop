import type { MainGoal, UserPreferences } from "../domain/model";
import type { FormSpeed, TrainingForm } from "./diagnosis";

/** 新手弹窗的 3 个用途大方向 → 代表 form（处方据此加权侧重，其余 form 仍正常练） */
export const GOAL_DIRECTIONS = [
  { key: "everyday", form: "articles" as TrainingForm, zh: "普通打字", en: "Everyday typing" },
  { key: "code", form: "code" as TrainingForm, zh: "打代码", en: "Coding" },
  { key: "foundation", form: "keys" as TrainingForm, zh: "键位基础", en: "Key basics" },
] as const;

const REPROMPT_DAYS = 7;
const DAY_MS = 86_400_000;

export type GoalPromptDecision =
  | { show: false }
  | { show: true; scenario: "welcome" | "achieved" };

export function shouldShowGoalPrompt(
  preferences: UserPreferences,
  formSpeeds: FormSpeed[],
  now: Date,
): GoalPromptDecision {
  if (preferences.goal_prompt_opted_out) {
    return { show: false };
  }
  const goal = preferences.main_goal;
  if (goal === undefined) {
    return { show: true, scenario: "welcome" };
  }
  if (!goalAchievedOrExpired(goal, formSpeeds, now)) {
    return { show: false };
  }
  if (daysSince(preferences.goal_prompt_last_shown, now) < REPROMPT_DAYS) {
    return { show: false };
  }
  return { show: true, scenario: "achieved" };
}

function goalAchievedOrExpired(goal: MainGoal, formSpeeds: FormSpeed[], now: Date): boolean {
  const speed = formSpeeds.find((item) => item.form === goal.form)?.ewma_wpm ?? 0;
  return speed >= goal.target_wpm || now.getTime() > Date.parse(goal.deadline);
}

function daysSince(date: string | undefined, now: Date): number {
  if (date === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  return (now.getTime() - Date.parse(date)) / DAY_MS;
}
