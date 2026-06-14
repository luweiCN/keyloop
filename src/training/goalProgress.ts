import type { SessionRecord } from "../domain/model";
import { formForCategory, type TrainingForm } from "./diagnosis";

export interface GoalProgress {
  /** 目标创建后该形态最早一次的 WPM（学习曲线起点） */
  start_wpm: number;
  /** 最近一次的 WPM（form_speeds 无样本时的兜底） */
  current_wpm: number;
  /** 该形态累积练习小时 */
  cum_hours: number;
  /** 该形态有练习的不同自然日数 */
  active_days: number;
}

function sessionWpm(record: SessionRecord): number {
  const minutes = record.active_ms / 60_000;
  return minutes > 0 ? record.char_stats.correct / 5 / minutes : 0;
}

export function goalProgress(
  records: SessionRecord[],
  form: TrainingForm,
  since: string,
): GoalProgress {
  const relevant = records
    .filter(
      (record) =>
        formForCategory(record.category) === form &&
        record.started_at >= since &&
        record.active_ms > 0,
    )
    .sort((left, right) => left.started_at.localeCompare(right.started_at));
  if (relevant.length === 0) {
    return { start_wpm: 0, current_wpm: 0, cum_hours: 0, active_days: 0 };
  }
  const cumHours = relevant.reduce((sum, record) => sum + record.active_ms, 0) / 3_600_000;
  const activeDays = new Set(relevant.map((record) => record.started_at.slice(0, 10))).size;
  return {
    start_wpm: sessionWpm(relevant[0]!),
    current_wpm: sessionWpm(relevant[relevant.length - 1]!),
    cum_hours: cumHours,
    active_days: activeDays,
  };
}
