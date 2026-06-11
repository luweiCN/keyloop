import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "have", "not", "are",
  "was", "you", "all", "can", "will", "one", "two", "new", "use", "its",
  "but", "let", "var", "const", "func", "def", "end", "nil", "null", "true",
  "false", "void", "int", "str", "obj", "tmp", "foo", "bar", "baz", "qux",
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

function main(): void {
  const args = process.argv.slice(2);
  let output: string | undefined;
  let limit = 400;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--output") output = args[++i];
    if (args[i] === "--limit") limit = Number(args[++i]);
  }

  const snippetsRoot = join(process.cwd(), "contents", "code", "snippets");
  const counts = countIdentifierWords(snippetsRoot);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, limit).map(([word]) => word);
  top.sort();

  if (output !== undefined) {
    writeFileSync(output, JSON.stringify(top, null, 2) + "\n");
    console.log(`wrote ${top.length} words to ${output}`);
  } else {
    for (const [word, count] of ranked.slice(0, 60)) {
      console.log(`${count}\t${word}`);
    }
    console.log(`total distinct words: ${counts.size}`);
  }
}

if (import.meta.main) {
  main();
}
