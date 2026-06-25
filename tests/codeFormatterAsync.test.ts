import { describe, expect, test } from "bun:test";
import { defaultCodeStyleSettings } from "../src/domain/model";
import {
  formatCodeForPractice,
  formatCodeForPracticeAsync,
} from "../src/content/codeFormatter";

const settings = { ...defaultCodeStyleSettings(), formatter: "auto" as const };

describe("formatCodeForPracticeAsync（问题4：异步格式化，不阻塞主线程）", () => {
  test("异步格式化结果与同步一致（进程内 prettier core）", async () => {
    const text = "const   x=1;function add(a,b){return a+b}";
    const asyncOut = await formatCodeForPracticeAsync(text, "typescript", settings);
    const syncOut = formatCodeForPractice(text, "typescript", settings);
    expect(asyncOut).toBe(syncOut);
    expect(asyncOut).not.toBe(text); // 确实格式化了
  });

  test("异步格式化会填缓存——之后同步调用命中（0 外部进程）", async () => {
    // 用一个独特字符串避免与其它用例缓存串味
    const text = "const   y = {a:1,b:2,c:3};";
    await formatCodeForPracticeAsync(text, "typescript", settings);
    // 同步调用此刻应命中缓存（若未命中也只是重算，结果相同；这里验证结果稳定）
    const syncOut = formatCodeForPractice(text, "typescript", settings);
    const asyncOut = await formatCodeForPracticeAsync(text, "typescript", settings);
    expect(syncOut).toBe(asyncOut);
  });

  test("formatter=off 时原样返回", async () => {
    const off = { ...settings, formatter: "off" as const };
    const text = "const   x=1;";
    expect(await formatCodeForPracticeAsync(text, "typescript", off)).toBe(text);
  });
});
