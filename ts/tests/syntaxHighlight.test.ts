import { describe, expect, test } from "bun:test";

import {
  highlightCodeSyntax,
  inferCodeHighlightLanguage,
} from "../src/ui/opentui/syntaxHighlight";

describe("OpenTUI syntax highlighting", () => {
  test("tokenizes TypeScript with Shiki colors mapped to terminal palette", async () => {
    const rows = await highlightCodeSyntax(
      "const message = `hi ${name}`; // greeting",
      { language: "typescript" },
    );
    const tokens = rows.flat();

    expect(tokens.find((token) => token.text === "const")?.fg).toBe("magenta");
    expect(tokens.find((token) => token.text.includes("="))?.fg).toBe("cyan");
    expect(tokens.some((token) => token.text.includes("hi ") && token.fg === "yellow")).toBe(true);
    expect(tokens.find((token) => token.text === "// greeting")?.fg).toBe("green");
  });

  test("uses ANSI semantic slots for TypeScript identifiers without syntax red", async () => {
    const rows = await highlightCodeSyntax(
      [
        'import { readFile } from "node:fs/promises";',
        "",
        "export async function loadResourceConfig(path: string) {",
        '  const raw = await readFile(path, "utf8");',
        "  const config = JSON.parse(raw);",
        "  return { ...config, loaded: true };",
        "}",
      ].join("\n"),
      { language: "typescript" },
    );
    const tokens = rows.flat();

    expect(tokens.map((token) => token.fg)).not.toContain("red");
    expect(tokens.map((token) => token.fg)).not.toContain("brightRed");
    expect(tokens.map((token) => token.fg)).not.toContain("gray");
    expect(tokens.find((token) => token.text === "loadResourceConfig")?.fg).toBe("blue");
    expect(tokens.find((token) => token.text === "string")?.fg).toBe("cyan");
    expect(tokens.find((token) => token.text === "path")?.fg).toBe("blue");
    expect(tokens.find((token) => token.text === "raw")?.fg).toBe("foreground");
    expect(tokens.find((token) => token.text === "parse")?.fg).toBe("blue");
  });

  test("preserves blank lines while tokenizing code", async () => {
    const rows = await highlightCodeSyntax("const a = 1;\n\nreturn a;", {
      language: "typescript",
    });

    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual([]);
    expect(rows[2]?.map((token) => token.text).join("")).toBe("return a;");
  });

  test("infers syntax per blank-line-separated code block when source has no language", async () => {
    const rows = await highlightCodeSyntax(
      ".profile-grid {\n  display: grid;\n}\n\nexport const value = 1;",
      { source: "keyloop:code-corpus" },
    );

    expect(rows[1]?.find((token) => token.text === "display")?.fg).toBe("cyan");
    expect(rows[4]?.find((token) => token.text === "export")?.fg).toBe("magenta");
  });

  test("colors HTML tags and attributes consistently", async () => {
    const rows = await highlightCodeSyntax(
      '<table class="selected_stream-table">\n  <thead><tr><th>Name</th><th>Status</th></tr></thead>\n  <tbody id="selected_stream-rows"></tbody>\n</table>',
      { source: "keyloop:code-corpus" },
    );

    expect(rows[0]?.find((token) => token.text === "table")?.fg).toBe("cyan");
    expect(rows[0]?.find((token) => token.text === "class")?.fg).toBe("blue");
    expect(rows[2]?.find((token) => token.text === "id")?.fg).toBe("blue");
    expect(rows[3]?.find((token) => token.text === "table")?.fg).toBe("cyan");

    const nestedTagColors = rows[1]
      ?.filter((token) => ["thead", "tr", "th"].includes(token.text))
      .map((token) => token.fg);
    expect(nestedTagColors).toEqual([
      "cyan",
      "cyan",
      "cyan",
      "cyan",
      "cyan",
      "cyan",
      "cyan",
      "cyan",
    ]);
  });

  test("uses explicit source language for the whole target", async () => {
    const rows = await highlightCodeSyntax(
      ".profile-grid {\n  display: grid;\n}\n\nexport const value = 1;",
      { source: "keyloop:code-specialist:lang=typescript:2" },
    );

    expect(rows[1]?.find((token) => token.text.includes("display"))?.fg).toBe("foreground");
    expect(rows[4]?.find((token) => token.text === "export")?.fg).toBe("magenta");
  });

  test("uses declared block languages before target-level source language", async () => {
    const rows = await highlightCodeSyntax(
      ".profile-grid {\n  display: grid;\n}\n\nexport const value = 1;",
      {
        source: "keyloop:code-specialist:lang=typescript:2",
        blocks: [
          {
            start_line: 0,
            line_count: 3,
            language: "css",
            source: "style.css:1",
          },
          {
            start_line: 4,
            line_count: 1,
            language: "typescript",
            source: "src/example.ts:1",
          },
        ],
      },
    );

    expect(rows[1]?.find((token) => token.text === "display")?.fg).toBe("cyan");
    expect(rows[4]?.find((token) => token.text === "export")?.fg).toBe("magenta");
  });

  test("infers language from code source and text", () => {
    expect(inferCodeHighlightLanguage({ source: "keyloop:code-specialist:lang=solidity:4" })).toBe(
      "solidity",
    );
    expect(inferCodeHighlightLanguage({ source: "contracts/Counter.sol:12" })).toBe("solidity");
    expect(inferCodeHighlightLanguage({ text: "pub fn main() {\n}" })).toBe("rust");
    expect(inferCodeHighlightLanguage({ text: "export async function load() {}" })).toBe(
      "typescript",
    );
    expect(inferCodeHighlightLanguage({ text: ".card {\n  display: grid;\n}" })).toBe("css");
  });
});
