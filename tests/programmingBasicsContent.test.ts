import { describe, expect, test } from "bun:test";
import {
  listProgrammingBasicsLanguages,
  loadProgrammingBasicsCards,
  type ProgrammingBasicsKind,
} from "../src/content/programmingBasics";

const SYMBOL_TOPICS = new Set(["declaration", "call", "control", "index", "literal", "string"]);
const KINDS: ProgrammingBasicsKind[] = ["symbols_numbers", "builtin_api"];

describe("programming basics corpus", () => {
  const languages = listProgrammingBasicsLanguages();

  test("index lists at least one language", () => {
    expect(languages.length).toBeGreaterThanOrEqual(1);
  });

  for (const language of languages) {
    for (const kind of KINDS) {
      test(`${language}/${kind} cards are valid`, () => {
        const cards = loadProgrammingBasicsCards(kind, language);
        expect(cards.length).toBeGreaterThanOrEqual(80);
        const seen = new Set<string>();
        const topicCounts = new Map<string, number>();
        for (const card of cards) {
          expect(card.text.length).toBeGreaterThan(0);
          expect(card.text.length).toBeLessThanOrEqual(90);
          expect(card.text).not.toInclude("\n");
          expect(card.text).toMatch(/^[\x20-\x7e]+$/);
          expect(card.source_id.length).toBeGreaterThan(0);
          expect(seen.has(card.text)).toBe(false);
          seen.add(card.text);
          if (kind === "symbols_numbers") {
            expect(SYMBOL_TOPICS.has(card.topic)).toBe(true);
          } else {
            expect(card.topic).toMatch(/^[a-z][a-z0-9_]*$/);
            expect(card.api ?? "").not.toBe("");
          }
          topicCounts.set(card.topic, (topicCounts.get(card.topic) ?? 0) + 1);
        }
        for (const [topic, count] of topicCounts) {
          expect(count, `${language}/${kind}/${topic}`).toBeGreaterThanOrEqual(8);
        }
        if (kind === "builtin_api") {
          const apis = new Set(cards.map((card) => card.api));
          expect(apis.size).toBeGreaterThanOrEqual(40);
        }
      });
    }
  }
});
