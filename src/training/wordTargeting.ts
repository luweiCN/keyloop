import type { SessionRecord } from "../domain/model";
import { keySignals, weakestKeys } from "./keySignal";

/** 默认取最弱的前 N 个键参与靶向。可调。 */
export const WEAK_KEY_COUNT = 8;

export interface WeakKeyOptions {
  count?: number;
}

/**
 * 把记录算成「弱键 → 权重」：只取 confidence<1（真正落后）的键、最多前 count 个，
 * 权重 = 1 - confidence（越弱权重越高）。供单词加权选材用。
 */
export function weakKeyWeights(
  records: readonly SessionRecord[],
  options: WeakKeyOptions = {},
): Map<string, number> {
  const count = options.count ?? WEAK_KEY_COUNT;
  const weak = weakestKeys(keySignals(records), count).filter(
    (signal) => signal.confidence !== null && signal.confidence < 1,
  );
  const weights = new Map<string, number>();
  for (const signal of weak) {
    weights.set(signal.key, 1 - (signal.confidence as number));
  }
  return weights;
}

/** 词的弱键覆盖分：词里出现的弱键的权重之和（同一字符只算一次）。 */
export function wordKeyWeight(text: string, weights: ReadonlyMap<string, number>): number {
  let sum = 0;
  for (const char of new Set(text)) {
    sum += weights.get(char) ?? 0;
  }
  return sum;
}

/**
 * 加权无放回抽样：按 weightOf 抽 count 个不重复项（权重高更可能被抽中）。
 * 剩余全为 0 权重时退化为均匀随机。负权重按 0 处理。
 */
export function weightedSampleWithoutReplacement<T>(
  items: readonly T[],
  weightOf: (item: T) => number,
  count: number,
  random: () => number,
): T[] {
  const pool = items.map((item) => ({ item, weight: Math.max(0, weightOf(item)) }));
  const result: T[] = [];
  const target = Math.min(count, pool.length);
  for (let picked = 0; picked < target; picked += 1) {
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    let index: number;
    if (total <= 0) {
      index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
    } else {
      let r = random() * total;
      index = pool.length - 1;
      for (let i = 0; i < pool.length; i += 1) {
        r -= pool[i]!.weight;
        if (r <= 0) {
          index = i;
          break;
        }
      }
    }
    result.push(pool[index]!.item);
    pool.splice(index, 1);
  }
  return result;
}
