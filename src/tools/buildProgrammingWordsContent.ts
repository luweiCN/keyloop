import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const STOP_WORDS = new Set([
  // 普通英语虚词
  "the", "and", "for", "with", "from", "this", "that", "have", "not", "are",
  "was", "you", "all", "can", "will", "one", "two", "use", "its", "but",
  "when", "where", "what", "how", "why", "then", "than", "some", "other", "each",
  "also", "only", "into", "out", "off", "our", "your", "his", "her", "they",
  // 语言关键字与保留字
  "let", "var", "const", "func", "fn", "def", "end", "nil", "null", "true",
  "false", "void", "int", "str", "obj", "return", "class", "import", "export",
  "else", "elif", "case", "switch", "break", "continue", "while", "try",
  "catch", "finally", "throw", "throws", "async", "await", "yield", "static",
  "public", "private", "protected", "internal", "extends", "implements",
  "interface", "enum", "struct", "impl", "trait", "typeof", "instanceof",
  "new", "delete", "super", "self", "typedef", "sizeof", "namespace",
  "using", "package", "module", "require", "function", "lambda", "defer",
  "val", "var", "mut", "pub", "use", "where", "match", "loop", "until",
  "begin", "rescue", "raise", "unless", "elsif", "then", "done", "fi", "esac",
  "boolean", "string", "number", "float", "double", "long", "short", "char",
  "byte", "uint", "usize", "isize", "undefined", "none", "some",
  // CSS/HTML 样式噪音
  "div", "span", "px", "rem", "em", "vh", "vw", "css", "html", "dom",
  "color", "background", "border", "margin", "padding", "font", "flex",
  "grid", "align", "justify", "hover",
  "absolute", "relative", "sticky", "inline", "none",
  "gap", "radius",
  "shadow", "opacity", "cursor",
  "nowrap", "bold", "italic", "underline", "uppercase",
  "lowercase", "center", "middle", "baseline", "solid", "dashed", "dotted",
  "white", "black", "gray", "grey", "red", "blue", "green", "yellow",
  "rounded", "primary", "secondary", "accent", "muted", "dark", "light",
  // 碎片与占位
  "tmp", "foo", "bar", "baz", "qux", "asdf", "xyz", "abc", "lorem", "ipsum",
  "com", "org", "net", "www", "http", "https", "img", "src", "href",
  "btn", "nav", "ul", "li", "td", "tr", "th", "tbody", "thead",
]);

function* walkJsonl(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walkJsonl(full);
    } else if (entry.endsWith(".jsonl")) {
      yield full;
    }
  }
}

export function countIdentifierWords(snippetsRoot: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const file of walkJsonl(snippetsRoot)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (line.trim().length === 0) continue;
      let text = "";
      try {
        text = String((JSON.parse(line) as { text?: unknown }).text ?? "");
      } catch {
        continue;
      }
      for (const identifier of text.match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) ?? []) {
        const parts = identifier
          .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
          .split(/[_\s]+/);
        for (const part of parts) {
          const word = part.toLowerCase();
          if (word.length < 3 || word.length > 14) continue;
          if (!/^[a-z]+$/.test(word)) continue;
          if (STOP_WORDS.has(word)) continue;
          counts.set(word, (counts.get(word) ?? 0) + 1);
        }
      }
    }
  }
  return counts;
}

// contents/programming_words.json 是人工维护的词库（含中文行业释义），
// 本脚本只做候选发现：统计语料高频词，报告词库尚未收录的候选，供人工筛选补充。
function main(): void {
  const args = process.argv.slice(2);
  let limit = 800;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit") limit = Number(args[++i]);
  }

  const snippetsRoot = join(process.cwd(), "contents", "code", "snippets");
  const wordsPath = join(process.cwd(), "contents", "programming_words.json");
  const existing = new Set(
    (JSON.parse(readFileSync(wordsPath, "utf8")) as { word: string }[]).map((entry) =>
      entry.word.toLowerCase(),
    ),
  );
  const counts = countIdentifierWords(snippetsRoot);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const missing = ranked.slice(0, limit).filter(([word]) => !existing.has(word));
  for (const [word, count] of missing) {
    console.log(`${count}\t${word}`);
  }
  console.log(
    `library: ${existing.size} words; top ${limit} corpus candidates not in library: ${missing.length}`,
  );
}

if (import.meta.main) {
  main();
}
