import type { SkillProfile } from "./diagnosis";

const MIN_DAILY_MINUTES = 10;
const MAX_DAILY_MINUTES = 45;
const BASE_MINUTES = 15;
const MAINTENANCE_BASE_MINUTES = 10;
const MINUTES_PER_WEAK_DIMENSION = 5;
/** 判定"全面稳定"所需的最少已评估维度数 */
const MIN_RATED_FOR_MAINTENANCE = 3;

export function recommendedDailyMinutes(profile: SkillProfile): number {
  const rated = profile.dimensions.filter((item) => item.status !== "unrated");
  const weakCount = rated.filter((item) => item.status === "weak").length;
  const allStable =
    rated.length >= MIN_RATED_FOR_MAINTENANCE &&
    rated.every((item) => item.status === "stable");
  const base = allStable ? MAINTENANCE_BASE_MINUTES : BASE_MINUTES;
  let minutes = base + weakCount * MINUTES_PER_WEAK_DIMENSION;
  if (profile.daily_active_minutes_7d > 0) {
    minutes = Math.min(
      minutes,
      Math.max(BASE_MINUTES, Math.round(profile.daily_active_minutes_7d * 1.5)),
    );
  }
  return clamp(Math.round(minutes), MIN_DAILY_MINUTES, MAX_DAILY_MINUTES);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
