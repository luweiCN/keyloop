import { appendFile } from "node:fs/promises";
import { join } from "node:path";

/** 拼一行性能日志：数值字段保留 1 位小数，字符串原样，行尾换行。 */
export function formatPerfLine(
  timestamp: string,
  event: string,
  fields: Record<string, string | number>,
): string {
  const parts = Object.entries(fields).map(([key, value]) =>
    typeof value === "number" ? `${key}=${value.toFixed(1)}` : `${key}=${value}`,
  );
  return `${timestamp} ${event} ${parts.join(" ")}\n`;
}

/**
 * 轻量性能埋点：默认开启（设 KEYLOOP_PERF_LOG=0 可关闭），异步 fire-and-forget 追加到
 * <dataDir>/perf.log，不阻塞练习主流程、写失败静默忽略。
 * 用于线上被动定位结算 / 段落切换卡顿——记录各阶段真实耗时，事后比对哪一段慢。
 */
export function logPerfEvent(
  dataDir: string | undefined,
  event: string,
  fields: Record<string, string | number>,
): void {
  if (dataDir === undefined || process.env.KEYLOOP_PERF_LOG === "0") {
    return;
  }
  const line = formatPerfLine(new Date().toISOString(), event, fields);
  void appendFile(join(dataDir, "perf.log"), line).catch(() => undefined);
}
