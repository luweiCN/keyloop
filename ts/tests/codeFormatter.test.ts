import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  defaultCodeStyleSettings,
  formatCodeSnippetForPractice,
  type CodeSnippet,
} from "../src/index";

describe("code practice formatter", () => {
  test("formats JavaScript snippets with configured semicolons quotes and indent", () => {
    const snippet = codeSnippet("if (val === true) {\n    return function(){ return \"ok\" };\n  }");

    const formatted = formatCodeSnippetForPractice(
      snippet,
      defaultCodeStyleSettings({
        indent_width: 4,
        semicolons: "never",
        quotes: "single",
        trailing_commas: "none",
      }),
    );

    expect(formatted.text).toBe(
      "if (val === true) {\n    return function () {\n        return 'ok'\n    }\n}",
    );
    expect(formatted.language).toBe("javascript");
    expect(formatted.source).toBe(snippet.source);
  });

  test("formats corpus snippets with syntax language separate from picker domain", () => {
    const snippet = {
      ...codeSnippet("if (val === true) {\n    return function(){ return \"ok\" };\n  }", "react"),
      syntax_language: "javascript",
      framework: "react",
    };

    const formatted = formatCodeSnippetForPractice(
      snippet,
      defaultCodeStyleSettings({
        indent_width: 2,
        semicolons: "never",
        quotes: "single",
        trailing_commas: "none",
      }),
    );

    expect(formatted.language).toBe("react");
    expect(formatted.syntax_language).toBe("javascript");
    expect(formatted.text).toBe(
      "if (val === true) {\n  return function () {\n    return 'ok'\n  }\n}",
    );
  });

  test("formatter off keeps basic snippet normalization without prettier style changes", () => {
    const snippet = codeSnippet("if (val === true) {\n    return function(){ return \"ok\" };\n  }");

    const formatted = formatCodeSnippetForPractice(
      snippet,
      defaultCodeStyleSettings({ formatter: "off", semicolons: "never", quotes: "single" }),
    );

    expect(formatted.text).toBe('if (val === true) {\n  return function(){ return "ok" };\n}');
  });

  test("prettier mode does not fall back to native formatters", () => {
    const snippet = codeSnippet('fn main(){println!("ok");}', "rust");

    const formatted = formatCodeSnippetForPractice(
      snippet,
      defaultCodeStyleSettings({ formatter: "prettier" }),
    );

    expect(formatted.text).toBe('fn main(){println!("ok");}');
  });

  test("formats standalone Solidity functions with the current plugin parser", () => {
    const snippet = codeSnippet(
      [
        "function readAddressOr(string memory toml, string memory key, address defaultValue)",
        "        internal",
        "        view",
        "        returns (address)",
        "    {",
        "        return keyExists(toml, key) ? readAddress(toml, key) : defaultValue;",
        "    }",
      ].join("\n"),
      "solidity",
    );

    const formatted = formatCodeSnippetForPractice(snippet, defaultCodeStyleSettings());

    expect(formatted.text).toBe(
      [
        "function readAddressOr(",
        "  string memory toml,",
        "  string memory key,",
        "  address defaultValue",
        ") internal view returns (address) {",
        "  return keyExists(toml, key) ? readAddress(toml, key) : defaultValue;",
        "}",
      ].join("\n"),
    );
  });

  test("plugin formatters resolve project prettier when cwd is elsewhere", () => {
    const originalCwd = process.cwd();
    const dir = mkdtempSync(join(tmpdir(), "keyloop-formatter-"));
    try {
      process.chdir(dir);
      const formatted = formatCodeSnippetForPractice(
        codeSnippet(
          "function readAddressOr(string memory toml, string memory key, address defaultValue) internal view returns (address) { return defaultValue; }",
          "solidity",
        ),
        defaultCodeStyleSettings(),
      );

      expect(formatted.text).toBe(
        [
          "function readAddressOr(",
          "  string memory toml,",
          "  string memory key,",
          "  address defaultValue",
          ") internal view returns (address) {",
          "  return defaultValue;",
          "}",
        ].join("\n"),
      );
    } finally {
      process.chdir(originalCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function codeSnippet(text: string, language = "javascript"): CodeSnippet {
  return {
    text,
    source: "keyloop:test",
    difficulty: "easy",
    score: 1,
    language,
    framework: "none",
    project: "test",
    level: "block",
  };
}
