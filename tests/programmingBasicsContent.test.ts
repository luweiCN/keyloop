import { describe, expect, test } from "bun:test";
import {
  listProgrammingBasicsLanguages,
  loadProgrammingBasicsCards,
} from "../src/content/programmingBasics";

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
