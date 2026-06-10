import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import prettier from "@prettier/sync";

import type { CodeStyleSettings } from "../domain/model";
import { defaultCodeStyleSettings } from "../domain/model";
import { normalizeSnippetText, type CodeSnippet } from "./snippets";

type PrettierCoreParser =
  | "babel"
  | "typescript"
  | "html"
  | "css"
  | "scss"
  | "less"
  | "json"
  | "jsonc"
  | "graphql"
  | "markdown"
  | "yaml"
  | "vue";

interface PrettierPluginConfig {
  parser: string;
  plugin: string;
  filePath: string;
}

const formatterTimeoutMs = 1_200;
const maxFormatCacheEntries = 512;
const formatCodePracticeCache = new Map<string, string>();

const prettierCoreParsers = new Map<string, PrettierCoreParser>([
  ["javascript", "babel"],
  ["js", "babel"],
  ["jsx", "babel"],
  ["typescript", "typescript"],
  ["ts", "typescript"],
  ["tsx", "typescript"],
  ["html", "html"],
  ["css", "css"],
  ["scss", "scss"],
  ["sass", "scss"],
  ["less", "less"],
  ["json", "json"],
  ["jsonc", "jsonc"],
  ["graphql", "graphql"],
  ["markdown", "markdown"],
  ["md", "markdown"],
  ["yaml", "yaml"],
  ["yml", "yaml"],
  ["vue", "vue"],
]);

const prettierPluginConfigs = new Map<string, PrettierPluginConfig>([
  ["solidity", { parser: "slang", plugin: "prettier-plugin-solidity", filePath: "snippet.sol" }],
  ["sol", { parser: "slang", plugin: "prettier-plugin-solidity", filePath: "snippet.sol" }],
  ["svelte", { parser: "svelte", plugin: "prettier-plugin-svelte", filePath: "snippet.svelte" }],
  ["java", { parser: "java", plugin: "prettier-plugin-java", filePath: "Snippet.java" }],
  ["php", { parser: "php", plugin: "@prettier/plugin-php", filePath: "snippet.php" }],
  ["ruby", { parser: "ruby", plugin: "@prettier/plugin-ruby", filePath: "snippet.rb" }],
  ["rb", { parser: "ruby", plugin: "@prettier/plugin-ruby", filePath: "snippet.rb" }],
  ["xml", { parser: "xml", plugin: "@prettier/plugin-xml", filePath: "snippet.xml" }],
]);

export function formatCodeSnippetForPractice(
  snippet: CodeSnippet,
  settings: CodeStyleSettings = defaultCodeStyleSettings(),
): CodeSnippet {
  return {
    ...snippet,
    text: formatCodeForPractice(
      snippet.text,
      snippet.syntax_language ?? snippet.language,
      settings,
    ),
  };
}

export function formatCodeSnippetsForPractice(
  snippets: CodeSnippet[],
  settings: CodeStyleSettings = defaultCodeStyleSettings(),
): CodeSnippet[] {
  return snippets.map((snippet) => formatCodeSnippetForPractice(snippet, settings));
}

export function formatCodeForPractice(
  text: string,
  language: string,
  settings: CodeStyleSettings = defaultCodeStyleSettings(),
): string {
  const normalized = normalizeSnippetText(text);
  const languageKey = language.toLowerCase();
  const cacheKey = formatCodePracticeCacheKey(normalized, languageKey, settings);
  const cached = formatCodePracticeCache.get(cacheKey);
  if (cached !== undefined) {
    formatCodePracticeCache.delete(cacheKey);
    formatCodePracticeCache.set(cacheKey, cached);
    return cached;
  }

  let result: string;
  if (settings.formatter === "off") {
    result = normalized;
  } else {
    const formatted = formatWithSelectedFormatter(normalized, languageKey, settings);
    result = formatted ?? normalized;
  }

  rememberFormatCodePracticeCache(cacheKey, result);
  return result;
}

function formatCodePracticeCacheKey(
  text: string,
  language: string,
  settings: CodeStyleSettings,
): string {
  return [
    "v1",
    language,
    settings.formatter,
    settings.indent_style,
    String(settings.indent_width),
    settings.semicolons,
    settings.quotes,
    settings.trailing_commas,
    text,
  ].join("\0");
}

function rememberFormatCodePracticeCache(key: string, value: string): void {
  formatCodePracticeCache.set(key, value);
  if (formatCodePracticeCache.size <= maxFormatCacheEntries) {
    return;
  }
  const oldestKey = formatCodePracticeCache.keys().next().value;
  if (oldestKey !== undefined) {
    formatCodePracticeCache.delete(oldestKey);
  }
}

function formatWithSelectedFormatter(
  text: string,
  language: string,
  settings: CodeStyleSettings,
): string | null {
  switch (settings.formatter) {
    case "auto":
      return (
        formatWithPrettierCore(text, language, settings) ??
        formatWithPrettierPluginCli(text, language, settings) ??
        formatWithNativeTool(text, language)
      );
    case "prettier":
      return (
        formatWithPrettierCore(text, language, settings) ??
        formatWithPrettierPluginCli(text, language, settings)
      );
    case "native":
      return formatWithNativeTool(text, language);
    case "off":
      return text;
    default: {
      const exhaustive: never = settings.formatter;
      return exhaustive;
    }
  }
}

function formatWithPrettierCore(
  text: string,
  language: string,
  settings: CodeStyleSettings,
): string | null {
  const parser = prettierCoreParsers.get(language);
  if (parser === undefined) {
    return null;
  }

  try {
    return stripFinalNewline(
      prettier.format(text, {
        parser,
        semi: settings.semicolons === "always",
        singleQuote: settings.quotes === "single",
        tabWidth: settings.indent_width,
        useTabs: settings.indent_style === "tab",
        trailingComma: settings.trailing_commas,
      }),
    );
  } catch {
    return null;
  }
}

function formatWithPrettierPluginCli(
  text: string,
  language: string,
  settings: CodeStyleSettings,
): string | null {
  const config = prettierPluginConfigs.get(language);
  const command = prettierCommand();
  if (config === undefined || command === null) {
    return null;
  }

  const result = spawnSync(
    command,
    [
      "--parser",
      config.parser,
      "--plugin",
      resolvePrettierPlugin(config.plugin),
      "--stdin-filepath",
      config.filePath,
      "--tab-width",
      String(settings.indent_width),
      settings.indent_style === "tab" ? "--use-tabs" : "--no-use-tabs",
      settings.semicolons === "always" ? "--semi" : "--no-semi",
      settings.quotes === "single" ? "--single-quote" : "--no-single-quote",
      "--trailing-comma",
      settings.trailing_commas,
    ],
    {
      input: text,
      encoding: "utf8",
      timeout: formatterTimeoutMs,
    },
  );
  if (result.status !== 0 || result.error !== undefined || result.stdout.length === 0) {
    return null;
  }
  return stripFinalNewline(result.stdout);
}

function formatWithNativeTool(text: string, language: string): string | null {
  switch (language) {
    case "rust":
    case "rs":
      return runFormatterCommand("rustfmt", ["--emit", "stdout", "--edition", "2021"], text);
    case "go":
      return runFormatterCommand("gofmt", [], text);
    case "python":
    case "py":
      return (
        runFormatterCommand("ruff", ["format", "--stdin-filename", "snippet.py", "-"], text) ??
        runFormatterCommand("black", ["--quiet", "-"], text)
      );
    default:
      return null;
  }
}

function runFormatterCommand(command: string, args: string[], text: string): string | null {
  const result = spawnSync(command, args, {
    input: text,
    encoding: "utf8",
    timeout: formatterTimeoutMs,
  });
  if (result.status !== 0 || result.error !== undefined || result.stdout.length === 0) {
    return null;
  }
  return stripFinalNewline(result.stdout);
}

function prettierCommand(): string | null {
  for (const root of prettierSearchRoots()) {
    const local = join(root, "node_modules", ".bin", "prettier");
    if (existsSync(local)) {
      return local;
    }
  }
  return "prettier";
}

function resolvePrettierPlugin(plugin: string): string {
  for (const root of prettierSearchRoots()) {
    const packageDir = join(root, "node_modules", plugin);
    const entry = prettierPluginEntryPath(packageDir);
    if (entry !== null) {
      return entry;
    }
  }
  return plugin;
}

function prettierPluginEntryPath(packageDir: string): string | null {
  const packageJsonPath = join(packageDir, "package.json");
  if (!existsSync(packageJsonPath)) {
    return null;
  }
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      exports?: unknown;
      main?: unknown;
    };
    const exportedEntry = exportedPackageEntry(packageJson.exports);
    const entries = [
      exportedEntry,
      typeof packageJson.main === "string" ? packageJson.main : undefined,
      "index.js",
    ];
    for (const entry of entries) {
      if (entry === undefined) {
        continue;
      }
      const path = join(packageDir, entry.replace(/^\.\//u, ""));
      if (existsSync(path)) {
        return path;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function exportedPackageEntry(exportsValue: unknown): string | undefined {
  if (typeof exportsValue === "string") {
    return exportsValue;
  }
  if (!isRecord(exportsValue)) {
    return undefined;
  }
  const rootExport = exportsValue["."];
  if (typeof rootExport === "string") {
    return rootExport;
  }
  if (isRecord(rootExport)) {
    for (const key of ["import", "default", "module", "require"]) {
      const value = rootExport[key];
      if (typeof value === "string") {
        return value;
      }
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function prettierSearchRoots(): string[] {
  const roots = [process.cwd()];
  try {
    addAncestorRoots(roots, fileURLToPath(import.meta.url));
  } catch {
    // Bundled runtimes may not expose a file-backed module URL.
  }
  addAncestorRoots(roots, process.argv[1]);
  addAncestorRoots(roots, process.execPath);
  return [...new Set(roots)];
}

function addAncestorRoots(roots: string[], path: string | undefined): void {
  if (path === undefined || path.length === 0) {
    return;
  }
  let current = dirname(resolve(path));
  for (let depth = 0; depth < 5; depth += 1) {
    roots.push(current);
    const parent = dirname(current);
    if (parent === current) {
      return;
    }
    current = parent;
  }
}

function stripFinalNewline(text: string): string {
  return text.replace(/\n+$/u, "");
}
