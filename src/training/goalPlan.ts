import type { MainGoal, SessionRecord } from "../domain/model";
import type { SkillProfile, TrainingForm } from "./diagnosis";
import { goalProgress } from "./goalProgress";

const COLD_START_DAYS = 7;
const CONSERVATIVE_FACTOR = 1.2;
const DAILY_MIN = 10;
const DAILY_MAX = 60;
const DAY_MS = 86_400_000;

/** 各形态"中位数偏上"推荐目标 WPM（公开打字统计估算，B-2 设目标向导用） */
export const GOAL_WPM_BASELINE: Record<TrainingForm, number> = {
  keys: 45,
  words: 45,
  symbols: 30,
  sentences: 50,
  articles: 50,
  code: 35,
};

export interface GoalRecommendation {
  phase: "cold_start" | "on_track" | "unreachable" | "achieved";
  daily_minutes: number;
  current_wpm: number;
  projected_date?: string;
  projected_wpm_at_deadline?: number;
  alternatives?: {
    extend_deadline_days?: number;
    daily_minutes_to_hit?: number;
    lower_target_wpm?: number;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function recommendGoalPlan(
  goal: MainGoal,
  records: SessionRecord[],
  profile: SkillProfile,
  now: Date,
  fallbackMinutes: number,
): GoalRecommendation {
  const progress = goalProgress(records, goal.form, goal.created_at);
  const measured = profile.form_speeds.find((item) => item.form === goal.form)?.ewma_wpm ?? null;
  const current_wpm = measured ?? progress.current_wpm;

  if (progress.active_days < COLD_START_DAYS) {
    return { phase: "cold_start", daily_minutes: fallbackMinutes, current_wpm };
  }

  const gap = goal.target_wpm - current_wpm;
  if (gap <= 0) {
    return { phase: "achieved", daily_minutes: DAILY_MIN, current_wpm };
  }

  const wpmPerHour =
    progress.cum_hours > 0 ? (current_wpm - progress.start_wpm) / progress.cum_hours : 0;
  const daysLeft = Math.max(1, Math.ceil((Date.parse(goal.deadline) - now.getTime()) / DAY_MS));

  // 没进步 / 倒退 → 不可达
  if (wpmPerHour <= 0) {
    return {
      phase: "unreachable",
      daily_minutes: DAILY_MAX,
      current_wpm,
      projected_wpm_at_deadline: Math.round(current_wpm),
      alternatives: { lower_target_wpm: Math.round(current_wpm), extend_deadline_days: 30 },
    };
  }

  const hoursNeeded = (gap / wpmPerHour) * CONSERVATIVE_FACTOR;
  const maxReachableHours = (daysLeft * DAILY_MAX) / 60;

  // 练满每日上限也追不上 → 诚实不可达
  if (maxReachableHours * wpmPerHour < gap) {
    const projected = current_wpm + maxReachableHours * wpmPerHour;
    return {
      phase: "unreachable",
      daily_minutes: DAILY_MAX,
      current_wpm,
      projected_wpm_at_deadline: Math.round(projected),
      alternatives: {
        extend_deadline_days: Math.max(0, Math.ceil(hoursNeeded / (DAILY_MAX / 60)) - daysLeft),
        daily_minutes_to_hit: Math.ceil((hoursNeeded / daysLeft) * 60),
        lower_target_wpm: Math.round(projected),
      },
    };
  }

  const daily = clamp(Math.round((hoursNeeded / daysLeft) * 60), DAILY_MIN, DAILY_MAX);
  const daysToFinish = Math.ceil(hoursNeeded / (daily / 60));
  const projected_date = new Date(now.getTime() + daysToFinish * DAY_MS)
    .toISOString()
    .slice(0, 10);
  return { phase: "on_track", daily_minutes: daily, current_wpm, projected_date };
}
