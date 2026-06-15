import type { MainGoal } from "../../domain/model";
import { GOAL_WPM_BASELINE } from "../../training/goalPlan";
import { GOAL_DIRECTIONS } from "../../training/goalPrompt";
import type { OpenTuiAppState } from "./appModel";
import type { OpenTuiKeyEvent } from "./kit";

const GOAL_DAY_MS = 86_400_000;

export interface GoalOnboardingResult {
  state: OpenTuiAppState;
}

/** 新手目标弹窗按键：←/→ 切方向、Enter 设目标、S 跳过、N 不再提醒，之后回主菜单 */
export function reduceGoalOnboardingKey(
  state: OpenTuiAppState,
  event: OpenTuiKeyEvent,
  now: Date,
): GoalOnboardingResult {
  if (state.route.screen !== "goal_onboarding") {
    return { state };
  }
  const route = state.route;
  const name = event.name.toLowerCase();

  if (name === "left" || name === "right") {
    const delta = name === "left" ? -1 : 1;
    const next =
      (route.selected_direction_index + delta + GOAL_DIRECTIONS.length) % GOAL_DIRECTIONS.length;
    return { state: { ...state, route: { ...route, selected_direction_index: next } } };
  }
  if (name === "return" || name === "enter" || event.sequence === "\r") {
    const dir = GOAL_DIRECTIONS[route.selected_direction_index] ?? GOAL_DIRECTIONS[0];
    const goal: MainGoal = {
      form: dir.form,
      target_wpm: GOAL_WPM_BASELINE[dir.form],
      deadline: new Date(now.getTime() + 90 * GOAL_DAY_MS).toISOString().slice(0, 10),
      created_at: now.toISOString(),
    };
    return { state: toMenu({ ...state, mainGoal: goal, goalPromptLastShown: today(now) }) };
  }
  if (name === "n") {
    return { state: toMenu({ ...state, goalPromptOptedOut: true }) };
  }
  if (name === "s") {
    // 达成场景跳过写 last_shown(7天静默)；welcome 场景不写(下次启动仍温和提醒)
    const patch = route.scenario === "achieved" ? { goalPromptLastShown: today(now) } : {};
    return { state: toMenu({ ...state, ...patch }) };
  }
  return { state };
}

function today(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function toMenu(state: OpenTuiAppState): OpenTuiAppState {
  return { ...state, route: { screen: "main_menu", selected_index: 0 } };
}
