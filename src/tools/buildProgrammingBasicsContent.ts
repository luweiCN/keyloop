import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

interface IdentifierSet {
  collection: string;
  element: string;
  field: string;
  value: string;
}

interface CardTemplate {
  topic: string;
  template: string;
  focus: string[];
  note_zh: string;
}

interface StaticCard {
  topic: string;
  text: string;
  focus?: string[];
  api?: string;
  note_zh: string;
}

interface BlockCard {
  topic: string;
  lines: string[];
  focus?: string[];
  note_zh: string;
}

interface Seed {
  language: string;
  source_id: string;
  identifier_sets: IdentifierSet[];
  symbols_numbers_values: StaticCard[];
  symbols_numbers_templates: CardTemplate[];
  symbols_numbers_static: StaticCard[];
  symbols_numbers_blocks: BlockCard[];
  builtin_api_cards: StaticCard[];
}

interface OutputCard {
  text: string;
  topic: string;
  form?: "value" | "statement" | "block";
  focus?: string[];
  api?: string;
  note_zh: string;
  source_id: string;
}

const MIN_SYMBOL_CARDS = 75;
const MIN_VALUES = 15;
const MIN_STATEMENTS = 40;
const MIN_BLOCKS = 10;
const MIN_API_CARDS = 70;
const MIN_APIS = 40;
const MIN_CARDS_PER_API_TOPIC = 6;
const API_FORBIDDEN_PREFIX =
  /^(if|for|while|return|switch|guard|var|let|const|val|def|fn|func|public|private|static|try|do)\b/;

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function expandTemplate(template: string, ids: IdentifierSet): string {
  return template
    .replaceAll("{collection}", ids.collection)
    .replaceAll("{element}", ids.element)
    .replaceAll("{Element}", capitalize(ids.element))
    .replaceAll("{field}", ids.field)
    .replaceAll("{value}", ids.value);
}

/**
 * 问题2：符号专项「裸值」去掉外层引号——只对 string 类的完整引号字面量
 * （双引号 / 单引号 / raw 前缀 r"..."）剥掉外层引号；裸正则、literal（数字、
 * 字符字面量 'A'）一律不动。内容里含同种引号的表达式不匹配，避免误伤。
 */
export function bareValueText(text: string, topic: string): string {
  if (topic !== "string") {
    return text;
  }
  const match = /^[rR]?(["'])((?:(?!\1).)*)\1$/su.exec(text);
  return match === null ? text : match[2]!;
}

function validateLine(line: string, seedPath: string, label: string): void {
  if (line.length > 90 || !/^[\x20-\x7e]*$/.test(line)) {
    throw new Error(`${label} line invalid in ${seedPath}: ${line}`);
  }
}

function validateValue(text: string, seedPath: string): void {
  validateLine(text, seedPath, "value");
  if (text.length === 0 || text.length > 40 || text.includes(" ") || text.includes("\n")) {
    throw new Error(`value card must be a single token in ${seedPath}: ${text}`);
  }
}

function validateStatement(text: string, seedPath: string): void {
  validateLine(text, seedPath, "statement");
  if (text.length === 0 || text.includes("\n")) {
    throw new Error(`statement must be single-line in ${seedPath}: ${text}`);
  }
  if (text.endsWith("{") || text.endsWith(",")) {
    throw new Error(`statement looks truncated in ${seedPath}: ${text}`);
  }
}

function validateBlock(lines: string[], seedPath: string): void {
  if (lines.length < 2 || lines.length > 5) {
    throw new Error(`block must have 2-5 lines in ${seedPath}: ${lines.join(" | ")}`);
  }
  for (const line of lines) {
    validateLine(line, seedPath, "block");
  }
  const text = lines.join("\n");
  const opens = (text.match(/\{/g) ?? []).length;
  const closes = (text.match(/\}/g) ?? []).length;
  if (opens !== closes) {
    throw new Error(`block braces unbalanced in ${seedPath}: ${lines.join(" | ")}`);
  }
}

function validateApiCall(text: string, seedPath: string): void {
  validateLine(text, seedPath, "api");
  if (text.length === 0 || text.includes("\n")) {
    throw new Error(`api card must be single-line in ${seedPath}: ${text}`);
  }
  if (text.includes(" = ") || text.includes(":=") || API_FORBIDDEN_PREFIX.test(text)) {
    throw new Error(`api card must be a pure call expression in ${seedPath}: ${text}`);
  }
  if (text.endsWith("{")) {
    throw new Error(`api card looks truncated in ${seedPath}: ${text}`);
  }
}

export function buildLanguageCorpus(
  seed: Seed,
  seedPath: string,
): { symbolsNumbers: OutputCard[]; builtinApi: OutputCard[] } {
  const symbolsNumbers: OutputCard[] = [];
  const seenSymbols = new Set<string>();
  const push = (card: OutputCard): void => {
    if (seenSymbols.has(card.text)) return;
    seenSymbols.add(card.text);
    symbolsNumbers.push(card);
  };

  for (const card of seed.symbols_numbers_values) {
    const valueText = bareValueText(card.text, card.topic);
    validateValue(valueText, seedPath);
    push({
      text: valueText,
      topic: card.topic,
      form: "value",
      ...(card.focus !== undefined ? { focus: card.focus } : {}),
      note_zh: card.note_zh,
      source_id: seed.source_id,
    });
  }

  for (const template of seed.symbols_numbers_templates) {
    for (const ids of seed.identifier_sets) {
      const text = expandTemplate(template.template, ids);
      if (seenSymbols.has(text)) continue;
      validateStatement(text, seedPath);
      push({
        text,
        topic: template.topic,
        form: "statement",
        focus: template.focus,
        note_zh: template.note_zh,
        source_id: seed.source_id,
      });
    }
  }
  for (const card of seed.symbols_numbers_static) {
    validateStatement(card.text, seedPath);
    push({
      text: card.text,
      topic: card.topic,
      form: "statement",
      ...(card.focus !== undefined ? { focus: card.focus } : {}),
      note_zh: card.note_zh,
      source_id: seed.source_id,
    });
  }

  for (const block of seed.symbols_numbers_blocks) {
    validateBlock(block.lines, seedPath);
    push({
      text: block.lines.join("\n"),
      topic: block.topic,
      form: "block",
      ...(block.focus !== undefined ? { focus: block.focus } : {}),
      note_zh: block.note_zh,
      source_id: seed.source_id,
    });
  }

  const builtinApi: OutputCard[] = [];
  const seenApi = new Set<string>();
  for (const card of seed.builtin_api_cards) {
    if (seenApi.has(card.text)) continue;
    validateApiCall(card.text, seedPath);
    if (card.api === undefined || card.api.length === 0) {
      throw new Error(`builtin_api card missing api in ${seedPath}: ${card.text}`);
    }
    seenApi.add(card.text);
    builtinApi.push({
      text: card.text,
      topic: card.topic,
      api: card.api,
      note_zh: card.note_zh,
      source_id: seed.source_id,
    });
  }
  return { symbolsNumbers, builtinApi };
}

function assertCorpusQuality(
  language: string,
  symbolsNumbers: OutputCard[],
  builtinApi: OutputCard[],
): void {
  if (symbolsNumbers.length < MIN_SYMBOL_CARDS) {
    throw new Error(
      `${language}/symbols_numbers: only ${symbolsNumbers.length} cards, need >= ${MIN_SYMBOL_CARDS}`,
    );
  }
  const formCounts = new Map<string, number>();
  for (const card of symbolsNumbers) {
    formCounts.set(card.form ?? "", (formCounts.get(card.form ?? "") ?? 0) + 1);
  }
  const requirements: Array<[string, number]> = [
    ["value", MIN_VALUES],
    ["statement", MIN_STATEMENTS],
    ["block", MIN_BLOCKS],
  ];
  for (const [form, min] of requirements) {
    const count = formCounts.get(form) ?? 0;
    if (count < min) {
      throw new Error(`${language}/symbols_numbers/${form}: only ${count} cards, need >= ${min}`);
    }
  }

  if (builtinApi.length < MIN_API_CARDS) {
    throw new Error(
      `${language}/builtin_api: only ${builtinApi.length} cards, need >= ${MIN_API_CARDS}`,
    );
  }
  const topicCounts = new Map<string, number>();
  for (const card of builtinApi) {
    topicCounts.set(card.topic, (topicCounts.get(card.topic) ?? 0) + 1);
  }
  for (const [topic, count] of topicCounts) {
    if (count < MIN_CARDS_PER_API_TOPIC) {
      throw new Error(
        `${language}/builtin_api/${topic}: only ${count} cards, need >= ${MIN_CARDS_PER_API_TOPIC}`,
      );
    }
  }
  const apis = new Set(builtinApi.map((card) => card.api));
  if (apis.size < MIN_APIS) {
    throw new Error(`${language}/builtin_api: only ${apis.size} distinct apis, need >= ${MIN_APIS}`);
  }
}

function writeJsonl(path: string, cards: OutputCard[]): void {
  writeFileSync(path, cards.map((card) => JSON.stringify(card)).join("\n") + "\n");
}

function main(): void {
  const root = join(process.cwd(), "contents", "programming_basics");
  const seedsDir = join(root, "seeds");
  const seedFiles = readdirSync(seedsDir)
    .filter((entry) => entry.endsWith(".json"))
    .sort();
  if (seedFiles.length === 0) {
    throw new Error(`no seed files found in ${seedsDir}`);
  }

  mkdirSync(join(root, "symbols_numbers"), { recursive: true });
  mkdirSync(join(root, "builtin_api"), { recursive: true });

  const languages: string[] = [];
  for (const file of seedFiles) {
    const seedPath = join(seedsDir, file);
    const seed = JSON.parse(readFileSync(seedPath, "utf8")) as Seed;
    const expected = basename(file, ".json");
    if (seed.language !== expected) {
      throw new Error(`seed language ${seed.language} does not match file name ${file}`);
    }
    const { symbolsNumbers, builtinApi } = buildLanguageCorpus(seed, seedPath);
    assertCorpusQuality(seed.language, symbolsNumbers, builtinApi);
    writeJsonl(join(root, "symbols_numbers", `${seed.language}.jsonl`), symbolsNumbers);
    writeJsonl(join(root, "builtin_api", `${seed.language}.jsonl`), builtinApi);
    languages.push(seed.language);
    console.log(
      `${seed.language}: symbols_numbers=${symbolsNumbers.length} builtin_api=${builtinApi.length}`,
    );
  }

  languages.sort();
  writeFileSync(
    join(root, "index.json"),
    JSON.stringify(
      { schema: "keyloop.programming_basics", schema_version: 2, languages },
      null,
      2,
    ) + "\n",
  );
  console.log(`index: ${languages.length} languages`);
}

if (import.meta.main) {
  main();
}
