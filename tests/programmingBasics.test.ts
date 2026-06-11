import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  listProgrammingBasicsLanguages,
  loadProgrammingBasicsCards,
  type ProgrammingBasicsOptions,
} from "../src/content/programmingBasics";

function fixtureOptions(root: string): ProgrammingBasicsOptions {
  return { env: { KEYLOOP_TS_CONTENT_ROOT: root }, exists: () => true };
}

function makeFixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "keyloop-basics-"));
  const base = join(root, "programming_basics");
  mkdirSync(join(base, "symbols_numbers"), { recursive: true });
  mkdirSync(join(base, "builtin_api"), { recursive: true });
  writeFileSync(
    join(base, "index.json"),
    JSON.stringify({
      schema: "keyloop.programming_basics",
      schema_version: 1,
      languages: ["typescript"],
    }),
  );
  writeFileSync(
    join(base, "symbols_numbers", "typescript.jsonl"),
    [
      JSON.stringify({
        text: "const items = [];",
        topic: "declaration",
        focus: ["=", "[]", ";"],
        note_zh: "声明空数组",
        source_id: "keyloop:programming-basics:seeds",
      }),
    ].join("\n") + "\n",
  );
  writeFileSync(
    join(base, "builtin_api", "typescript.jsonl"),
    [
      JSON.stringify({
        text: "const ids = items.map((item) => item.id);",
        topic: "array",
        api: "Array.map",
        note_zh: "数组映射",
        source_id: "keyloop:programming-basics:seeds",
      }),
    ].join("\n") + "\n",
  );
  return root;
}

describe("programming basics content loader", () => {
  test("lists languages from index.json", () => {
    const root = makeFixtureRoot();
    expect(listProgrammingBasicsLanguages(fixtureOptions(root))).toEqual(["typescript"]);
  });

  test("loads symbols_numbers cards with fields", () => {
    const root = makeFixtureRoot();
    const cards = loadProgrammingBasicsCards(
      "symbols_numbers",
      "typescript",
      fixtureOptions(root),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]?.text).toBe("const items = [];");
    expect(cards[0]?.topic).toBe("declaration");
    expect(cards[0]?.focus).toEqual(["=", "[]", ";"]);
  });

  test("loads builtin_api cards with api field", () => {
    const root = makeFixtureRoot();
    const cards = loadProgrammingBasicsCards("builtin_api", "typescript", fixtureOptions(root));
    expect(cards[0]?.api).toBe("Array.map");
  });

  test("throws on missing language file", () => {
    const root = makeFixtureRoot();
    expect(() =>
      loadProgrammingBasicsCards("symbols_numbers", "python", fixtureOptions(root)),
    ).toThrow();
  });
});
