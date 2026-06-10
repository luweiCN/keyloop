import { createHighlighter, type BundledLanguage, type Highlighter } from "shiki";
import type { ThemeRegistrationRaw } from "@shikijs/core";

export interface SyntaxToken {
  text: string;
  fg: string;
}

export interface HighlightCodeSyntaxOptions {
  language?: string | undefined;
  source?: string | undefined;
  blocks?: readonly SyntaxHighlightBlock[] | undefined;
}

export interface InferCodeHighlightLanguageOptions {
  language?: string | undefined;
  source?: string | undefined;
  text?: string | undefined;
}

export interface SyntaxHighlightBlock {
  start_line: number;
  line_count: number;
  language?: string | undefined;
  source?: string | undefined;
}

const themeName = "keyloop-ansi";
const plainColor = "#D4D4D4";
const operatorColor = "#00D7FF";
const keywordColor = "#AA00AA";
const typeColor = "#00FFFF";
const functionColor = "#0000FF";
const stringColor = "#FFFF00";
const commentColor = "#00AA00";
const parameterColor = "#0088FF";
const variableColor = "#FFFFFF";
const foregroundToken = "foreground";

type KeyloopThemeRegistration = Omit<ThemeRegistrationRaw, "settings"> &
  Partial<Pick<ThemeRegistrationRaw, "settings">>;

const keyloopShikiTheme: KeyloopThemeRegistration = {
  name: themeName,
  type: "dark",
  colors: {
    "editor.foreground": plainColor,
    "editor.background": "#000000",
  },
  tokenColors: [
    {
      scope: ["comment", "punctuation.definition.comment"],
      settings: { foreground: commentColor },
    },
    {
      scope: ["string", "constant.other.symbol"],
      settings: { foreground: stringColor },
    },
    {
      scope: ["punctuation", "keyword.operator"],
      settings: { foreground: operatorColor },
    },
    {
      scope: [
        "entity.name.function",
        "support.function",
        "meta.function-call entity.name.function",
      ],
      settings: { foreground: functionColor },
    },
    {
      scope: [
        "entity.name.type",
        "entity.name.class",
        "entity.name.tag",
        "support.type",
        "support.class",
      ],
      settings: { foreground: typeColor },
    },
    {
      scope: ["entity.other.attribute-name"],
      settings: { foreground: functionColor },
    },
    {
      scope: [
        "variable.other.constant",
        "variable.other.enummember",
        "variable.other.readwrite",
        "support.variable",
        "entity.name.variable",
        "meta.definition.variable.name",
      ],
      settings: { foreground: variableColor },
    },
    {
      scope: ["variable.parameter"],
      settings: { foreground: parameterColor },
    },
    {
      scope: [
        "keyword.control",
        "keyword.other",
        "storage.type",
        "storage.modifier",
        "storage.type.function",
      ],
      settings: { foreground: keywordColor },
    },
  ],
};

const colorToTerminal: Readonly<Record<string, string | undefined>> = {
  [plainColor]: foregroundToken,
  [operatorColor]: "cyan",
  [keywordColor]: "magenta",
  [typeColor]: "cyan",
  [functionColor]: "blue",
  [stringColor]: "yellow",
  [commentColor]: "green",
  [parameterColor]: "blue",
  [variableColor]: foregroundToken,
};

const supportedLanguages = [
  "typescript",
  "javascript",
  "tsx",
  "jsx",
  "vue",
  "rust",
  "solidity",
  "css",
  "scss",
  "less",
  "html",
  "json",
] as const satisfies readonly BundledLanguage[];

type SupportedLanguage = (typeof supportedLanguages)[number];

const languageByExtension: Readonly<Record<string, SupportedLanguage>> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  vue: "vue",
  rs: "rust",
  sol: "solidity",
  css: "css",
  scss: "scss",
  less: "less",
  html: "html",
  json: "json",
};

const supportedLanguageSet = new Set<string>(supportedLanguages);
const tokenCache = new Map<string, SyntaxToken[][]>();

let highlighterPromise: Promise<Highlighter> | undefined;

export async function highlightCodeSyntax(
  text: string,
  options: HighlightCodeSyntaxOptions = {},
): Promise<SyntaxToken[][]> {
  const language = explicitHighlightLanguage(options);
  const cacheKey = `${language}\0${JSON.stringify(options.blocks ?? [])}\0${text}`;
  const cached = tokenCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const rows =
    options.blocks !== undefined && options.blocks.length > 0
      ? await highlightDeclaredBlocks(text, options.blocks)
      : language === undefined
      ? await highlightInferredBlocks(text)
      : await highlightWholeText(text, language);

  tokenCache.set(cacheKey, rows);
  return rows;
}

export function inferCodeHighlightLanguage(
  options: InferCodeHighlightLanguageOptions,
): SupportedLanguage {
  const explicit = normalizeLanguage(options.language);
  if (explicit !== undefined) {
    return explicit;
  }

  const sourceLanguage = languageFromSource(options.source);
  if (sourceLanguage !== undefined) {
    return sourceLanguage;
  }

  const text = options.text ?? "";
  if (/\bpragma\s+solidity\b/u.test(text) || /\bcontract\s+\w+/u.test(text)) {
    return "solidity";
  }
  if (/\bpub\s+fn\b/u.test(text) || /\blet\s+mut\b/u.test(text)) {
    return "rust";
  }
  if (/<template[\s>]/u.test(text) || /<script\s+setup/u.test(text)) {
    return "vue";
  }
  if (/^\s*</u.test(text)) {
    return "html";
  }
  if (looksLikeCss(text)) {
    return "css";
  }
  if (/\binterface\s+\w+/u.test(text) || /\bexport\s+(?:async\s+)?function\b/u.test(text)) {
    return "typescript";
  }
  return "typescript";
}

async function highlightInferredBlocks(text: string): Promise<SyntaxToken[][]> {
  const lines = text.split("\n");
  const rows: SyntaxToken[][] = Array.from({ length: lines.length }, () => []);
  let blockStart: number | undefined;

  for (let index = 0; index <= lines.length; index += 1) {
    const line = lines[index];
    if (line !== undefined && line.trim().length > 0) {
      blockStart ??= index;
      continue;
    }
    if (blockStart !== undefined) {
      const start = blockStart;
      const blockLines = lines.slice(blockStart, index);
      const blockText = blockLines.join("\n");
      const language = inferCodeHighlightLanguage({ text: blockText });
      const highlighted = await highlightWholeText(blockText, language);
      highlighted.forEach((row, offset) => {
        rows[start + offset] = row;
      });
      blockStart = undefined;
    }
  }

  return rows;
}

async function highlightDeclaredBlocks(
  text: string,
  blocks: readonly SyntaxHighlightBlock[],
): Promise<SyntaxToken[][]> {
  const lines = text.split("\n");
  const rows: SyntaxToken[][] = lines.map((line) =>
    line.length === 0 ? [] : [{ text: line, fg: foregroundToken }],
  );

  for (const block of blocks) {
    const start = Math.max(0, Math.trunc(block.start_line));
    const lineCount = Math.max(0, Math.trunc(block.line_count));
    const end = Math.min(lines.length, start + lineCount);
    if (end <= start) {
      continue;
    }

    const blockText = lines.slice(start, end).join("\n");
    const language =
      normalizeLanguage(block.language) ??
      languageFromSource(block.source) ??
      inferCodeHighlightLanguage({ text: blockText });
    const highlighted = await highlightWholeText(blockText, language);
    highlighted.forEach((row, offset) => {
      rows[start + offset] = row;
    });
  }

  return rows;
}

async function highlightWholeText(
  text: string,
  language: SupportedLanguage,
): Promise<SyntaxToken[][]> {
  const highlighter = await getHighlighter();
  const result = highlighter.codeToTokens(text, {
    lang: language,
    theme: themeName,
  });
  const sourceLines = text.split("\n");
  return sourceLines.map((line, index) => {
    const tokens = result.tokens[index] ?? [];
    if (tokens.length === 0) {
      return line.length === 0 ? [] : [{ text: line, fg: foregroundToken }];
    }
    return tokens.map((token) => ({
      text: token.content,
      fg: terminalColorFromShiki(token.color),
    }));
  });
}

function explicitHighlightLanguage(
  options: HighlightCodeSyntaxOptions,
): SupportedLanguage | undefined {
  return normalizeLanguage(options.language) ?? languageFromSource(options.source);
}

function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighter({
    themes: [keyloopShikiTheme as ThemeRegistrationRaw],
    langs: [...supportedLanguages],
  });
  return highlighterPromise;
}

function terminalColorFromShiki(color: string | undefined): string {
  if (color === undefined) {
    return foregroundToken;
  }
  return colorToTerminal[color.toUpperCase()] ?? foregroundToken;
}

function looksLikeCss(text: string): boolean {
  const trimmed = text.trimStart();
  if (/^(?:[.#][\w-]|:[\w-]+|@(?:media|supports|keyframes|include|mixin)\b|@[\w-]+\s*:)/u.test(trimmed)) {
    return true;
  }
  return (
    /[{};]/u.test(text) &&
    /^\s{0,4}[\w-]+\s*:\s*[^;\n]+;?\s*$/mu.test(text) &&
    !/\b(?:const|let|var|function|return|export|import|type|interface)\b/u.test(text)
  );
}

function languageFromSource(source: string | undefined): SupportedLanguage | undefined {
  if (source === undefined) {
    return undefined;
  }
  const langMatch = /(?:^|[+:])lang=([a-z0-9_-]+)/iu.exec(source);
  const sourceLanguage = normalizeLanguage(langMatch?.[1]);
  if (sourceLanguage !== undefined) {
    return sourceLanguage;
  }
  const extensionMatch = /\.([a-z0-9]+)(?::\d+)?(?:$|[?#) ])/iu.exec(source);
  return normalizeLanguage(extensionMatch?.[1]);
}

function normalizeLanguage(language: string | undefined): SupportedLanguage | undefined {
  if (language === undefined) {
    return undefined;
  }
  const normalized = language.toLowerCase();
  const aliased = normalized === "sol" ? "solidity" : normalized;
  return supportedLanguageSet.has(aliased) ? (aliased as SupportedLanguage) : undefined;
}
