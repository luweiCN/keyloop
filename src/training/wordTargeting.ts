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
