import type { SessionRecord } from "../domain/model";

/** 击键间隔超过该值视为停顿，不计入速度（与 diagnosis.ts 一致）。 */
const MAX_INTERVAL_MS = 2000;

export interface KeyRawStat {
  /** 该键的击键次数 */
  samples: number;
  /** 错误率 0–1 */
  errorRate: number;
  /** 平均击键间隔 ms（速度代理，越小越快）；无有效间隔样本时为 null */
  avgIntervalMs: number | null;
}

/** 空白键不作为练习目标键统计。 */
function isTrackedKey(char: string): boolean {
  return char.length > 0 && char !== " " && char !== "\n" && char !== "\t";
}

/**
 * 按「单个键」聚合所有记录的击键事件：samples、错误率、平均击键间隔。
 * 击键间隔取相邻 insert 事件的 at_ms 差，过滤 >MAX_INTERVAL_MS 的停顿。
 */
export function perKeyStats(records: readonly SessionRecord[]): Map<string, KeyRawStat> {
  const acc = new Map<
    string,
    { events: number; errors: number; intervalSum: number; intervalCount: number }
  >();
  for (const record of records) {
    let previousAtMs: number | null = null;
    for (const event of record.key_events) {
      if (event.action !== "insert") {
        previousAtMs = null;
        continue;
      }
      const char = event.expected ?? event.input;
      const interval = previousAtMs === null ? null : event.at_ms - previousAtMs;
      previousAtMs = event.at_ms;
      if (char === null || !isTrackedKey(char)) {
        continue;
      }
      const entry = acc.get(char) ?? { events: 0, errors: 0, intervalSum: 0, intervalCount: 0 };
      entry.events += 1;
      if (!event.correct) {
        entry.errors += 1;
      }
      if (interval !== null && interval > 0 && interval <= MAX_INTERVAL_MS) {
        entry.intervalSum += interval;
        entry.intervalCount += 1;
      }
      acc.set(char, entry);
    }
  }
  const result = new Map<string, KeyRawStat>();
  for (const [key, entry] of acc) {
    result.set(key, {
      samples: entry.events,
      errorRate: entry.events === 0 ? 0 : entry.errors / entry.events,
      avgIntervalMs: entry.intervalCount === 0 ? null : entry.intervalSum / entry.intervalCount,
    });
  }
  return result;
}

/** 错误惩罚系数默认值：errorRate=1（全错）时有效耗时翻倍。可调（实测再定）。 */
export const KEY_PENALTY = 1.0;

/**
 * 有效耗时 = 平均击键间隔 × (1 + penalty × 错误率)。
 * 把「打错」折算成「变慢」，让"又慢"和"又错"都表现为有效速度低。
 */
export function effectiveTimeMs(
  avgIntervalMs: number,
  errorRate: number,
  penalty: number = KEY_PENALTY,
): number {
  return avgIntervalMs * (1 + penalty * errorRate);
}
