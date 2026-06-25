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

/** 样本数低于此值的键不评估 confidence（数据不足）。可调。 */
export const MIN_KEY_SAMPLES = 5;
/** 目标键速取「你自己各键有效耗时」的分位（0.5=中位数）。相对基线，避免绝对阈值。可调。 */
export const TARGET_PERCENTILE = 0.5;

export interface KeySignal {
  key: string;
  samples: number;
  errorRate: number;
  avgIntervalMs: number | null;
  /** 有效耗时；样本不足或无速度样本时为 null */
  effectiveTimeMs: number | null;
  /** 目标键速/有效耗时，≥1 达标，越低越弱；无法评估时为 null */
  confidence: number | null;
}

export interface KeySignalOptions {
  penalty?: number;
  minSamples?: number;
  targetPercentile?: number;
}

function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[index]!;
}

/**
 * per-key 弱点账本：每个键的有效耗时 + confidence（相对你自己键速中位数）。
 * confidence ≥1 表示该键达到/超过你的中位水平；<1 表示落后。
 */
export function keySignals(
  records: readonly SessionRecord[],
  options: KeySignalOptions = {},
): KeySignal[] {
  const penalty = options.penalty ?? KEY_PENALTY;
  const minSamples = options.minSamples ?? MIN_KEY_SAMPLES;
  const targetPercentile = options.targetPercentile ?? TARGET_PERCENTILE;

  const raw = perKeyStats(records);
  const effByKey = new Map<string, number | null>();
  const ratedEff: number[] = [];
  for (const [key, stat] of raw) {
    const eff =
      stat.avgIntervalMs === null || stat.samples < minSamples
        ? null
        : effectiveTimeMs(stat.avgIntervalMs, stat.errorRate, penalty);
    effByKey.set(key, eff);
    if (eff !== null) {
      ratedEff.push(eff);
    }
  }
  const target = percentile(ratedEff, targetPercentile);

  const signals: KeySignal[] = [];
  for (const [key, stat] of raw) {
    const eff = effByKey.get(key) ?? null;
    signals.push({
      key,
      samples: stat.samples,
      errorRate: stat.errorRate,
      avgIntervalMs: stat.avgIntervalMs,
      effectiveTimeMs: eff,
      confidence: eff === null || target === null ? null : target / eff,
    });
  }
  return signals;
}
