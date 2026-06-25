import { describe, expect, test } from "bun:test";
import {
  listProgrammingBasicsLanguages,
  loadProgrammingBasicsCards,
} from "../src/content/programmingBasics";
import { inferValueFormat } from "../src/tools/buildProgrammingBasicsContent";

const SYMBOL_TOPICS = new Set(["declaration", "call", "control", "index", "literal", "string"]);
const FORMS = new Set(["value", "statement", "block"]);
const API_FORBIDDEN_PREFIX =
  /^(if|for|while|return|switch|guard|var|let|const|val|def|fn|func|public|private|static|try|do)\b/;

describe("programming basics corpus", () => {
  const languages = listProgrammingBasicsLanguages();

  test("index lists at least one language", () => {
    expect(languages.length).toBeGreaterThanOrEqual(1);
  });

  for (const language of languages) {
    test(`${language}/symbols_numbers cards are valid`, () => {
      const cards = loadProgrammingBasicsCards("symbols_numbers", language);
      expect(cards.length).toBeGreaterThanOrEqual(75);
      const seen = new Set<string>();
      const formCounts = new Map<string, number>();
      for (const card of cards) {
        expect(card.text.length).toBeGreaterThan(0);
        expect(card.source_id.length).toBeGreaterThan(0);
        expect(seen.has(card.text)).toBe(false);
        seen.add(card.text);
        expect(SYMBOL_TOPICS.has(card.topic)).toBe(true);
        expect(FORMS.has(card.form ?? "")).toBe(true);
        formCounts.set(card.form ?? "", (formCounts.get(card.form ?? "") ?? 0) + 1);
        const lines = card.text.split("\n");
        for (const line of lines) {
          expect(line.length).toBeLessThanOrEqual(90);
          expect(line).toMatch(/^[\x20-\x7e]*$/);
        }
        if (card.form === "value") {
          expect(lines).toHaveLength(1);
          expect(card.text).not.toInclude(" ");
          expect(card.text.length).toBeLessThanOrEqual(40);
          // 问题2：string 类裸值不再被外层引号包裹（literal 的字符字面量 'A' 不受此约束）
          if (card.topic === "string") {
            expect(
              card.text,
              `${language} value should be unquoted: ${card.text}`,
            ).not.toMatch(/^[rR]?(['"]).*\1$/u);
          }
        }
        if (card.form === "statement") {
          expect(lines).toHaveLength(1);
          expect(card.text.endsWith("{")).toBe(false);
          expect(card.text.endsWith(",")).toBe(false);
        }
        if (card.form === "block") {
          expect(lines.length).toBeGreaterThanOrEqual(2);
          expect(lines.length).toBeLessThanOrEqual(5);
          const opens = (card.text.match(/\{/g) ?? []).length;
          const closes = (card.text.match(/\}/g) ?? []).length;
          expect(opens).toBe(closes);
        }
      }
      expect(formCounts.get("value") ?? 0).toBeGreaterThanOrEqual(15);
      expect(formCounts.get("statement") ?? 0).toBeGreaterThanOrEqual(40);
      expect(formCounts.get("block") ?? 0).toBeGreaterThanOrEqual(10);
    });

    test(`${language}/builtin_api cards are pure call expressions`, () => {
      const cards = loadProgrammingBasicsCards("builtin_api", language);
      expect(cards.length).toBeGreaterThanOrEqual(70);
      const seen = new Set<string>();
      const topicCounts = new Map<string, number>();
      for (const card of cards) {
        expect(card.text.length).toBeGreaterThan(0);
        expect(card.text.length).toBeLessThanOrEqual(90);
        expect(card.text).not.toInclude("\n");
        expect(card.text).toMatch(/^[\x20-\x7e]+$/);
        expect(card.topic).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(card.api ?? "").not.toBe("");
        expect(seen.has(card.text)).toBe(false);
        seen.add(card.text);
        expect(card.text).not.toInclude(" = ");
        expect(card.text).not.toInclude(":=");
        expect(card.text).not.toMatch(API_FORBIDDEN_PREFIX);
        expect(card.text.endsWith("{")).toBe(false);
        topicCounts.set(card.topic, (topicCounts.get(card.topic) ?? 0) + 1);
      }
      for (const [topic, count] of topicCounts) {
        expect(count, `${language}/builtin_api/${topic}`).toBeGreaterThanOrEqual(6);
      }
      const apis = new Set(cards.map((card) => card.api));
      expect(apis.size).toBeGreaterThanOrEqual(40);
    });
  }
});

describe("inferValueFormat", () => {
  test("text 强模式优先识别", () => {
    expect(inferValueFormat("10.0.0.1", "IP 地址")).toBe("ip");
    expect(inferValueFormat("2026-12-31", "日期串")).toBe("date");
    expect(inferValueFormat("2026-06-22T23:59:59Z", "ISO 时间戳")).toBe("datetime");
    expect(inferValueFormat("08:30:00", "时间串")).toBe("time");
    expect(inferValueFormat("3.2.1", "语义化版本")).toBe("version");
    expect(inferValueFormat("dev@example.org", "邮箱")).toBe("email");
    expect(inferValueFormat("https://api.example.com/v2", "接口地址")).toBe("url");
    expect(inferValueFormat("#0ea5e9", "十六进制颜色")).toBe("color");
    expect(inferValueFormat("/^[a-z]+$/", "正则字面量")).toBe("regex");
    expect(inferValueFormat("99.9%", "百分比")).toBe("percent");
    expect(inferValueFormat("$1,299.00", "金额")).toBe("money");
  });

  test("纯数字/歧义靠 note_zh 关键词兜底", () => {
    expect(inferValueFormat("3000", "端口号")).toBe("port");
    expect(inferValueFormat("404", "HTTP 状态")).toBe("http_status");
    expect(inferValueFormat("GET", "HTTP 方法字面量")).toBe("http_method");
    expect(inferValueFormat("application/xml", "MIME 类型")).toBe("mime");
    expect(inferValueFormat("60_000", "毫秒超时")).toBe("number");
  });

  test("都不中归 other", () => {
    expect(inferValueFormat("pending", "状态字面量")).toBe("other");
    expect(inferValueFormat("text-sm", "CSS 类名")).toBe("other");
  });
});
