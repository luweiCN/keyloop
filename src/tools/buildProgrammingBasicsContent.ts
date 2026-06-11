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

interface Seed {
  language: string;
  source_id: string;
  identifier_sets: IdentifierSet[];
  symbols_numbers_templates: CardTemplate[];
  symbols_numbers_static: StaticCard[];
  builtin_api_cards: StaticCard[];
}

interface OutputCard {
  text: string;
  topic: string;
  focus?: string[];
  api?: string;
  note_zh: string;
  source_id: string;
}

const MIN_CARDS_PER_KIND = 80;
const MIN_APIS = 40;
const MIN_CARDS_PER_TOPIC = 8;

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

function validateCardText(text: string, seedPath: string): void {
  if (text.length === 0 || text.length > 90) {
    throw new Error(`card text length out of range in ${seedPath}: ${text}`);
  }
  if (text.includes("\n") || !/^[\x20-\x7e]+$/.test(text)) {
    throw new Error(`card text must be single-line ascii in ${seedPath}: ${text}`);
  }
}

export function buildLanguageCorpus(
  seed: Seed,
  seedPath: string,
): { symbolsNumbers: OutputCard[]; builtinApi: OutputCard[] } {
  const symbolsNumbers: OutputCard[] = [];
  const seenSymbols = new Set<string>();
  for (const template of seed.symbols_numbers_templates) {
    for (const ids of seed.identifier_sets) {
      const text = expandTemplate(template.template, ids);
      if (seenSymbols.has(text)) continue;
      validateCardText(text, seedPath);
      seenSymbols.add(text);
      symbolsNumbers.push({
        text,
        topic: template.topic,
        focus: template.focus,
        note_zh: template.note_zh,
        source_id: seed.source_id,
      });
    }
  }
  for (const card of seed.symbols_numbers_static) {
    if (seenSymbols.has(card.text)) continue;
    validateCardText(card.text, seedPath);
    seenSymbols.add(card.text);
    symbolsNumbers.push({
      text: card.text,
      topic: card.topic,
      focus: card.focus,
      note_zh: card.note_zh,
      source_id: seed.source_id,
    });
  }

  const builtinApi: OutputCard[] = [];
  const seenApi = new Set<string>();
  for (const card of seed.builtin_api_cards) {
    if (seenApi.has(card.text)) continue;
    validateCardText(card.text, seedPath);
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
  kind: string,
  cards: OutputCard[],
): void {
  if (cards.length < MIN_CARDS_PER_KIND) {
    throw new Error(`${language}/${kind}: only ${cards.length} cards, need >= ${MIN_CARDS_PER_KIND}`);
  }
  const topicCounts = new Map<string, number>();
  for (const card of cards) {
    topicCounts.set(card.topic, (topicCounts.get(card.topic) ?? 0) + 1);
  }
  for (const [topic, count] of topicCounts) {
    if (count < MIN_CARDS_PER_TOPIC) {
      throw new Error(`${language}/${kind}/${topic}: only ${count} cards, need >= ${MIN_CARDS_PER_TOPIC}`);
    }
  }
  if (kind === "builtin_api") {
    const apis = new Set(cards.map((card) => card.api));
    if (apis.size < MIN_APIS) {
      throw new Error(`${language}/${kind}: only ${apis.size} distinct apis, need >= ${MIN_APIS}`);
    }
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
    assertCorpusQuality(seed.language, "symbols_numbers", symbolsNumbers);
    assertCorpusQuality(seed.language, "builtin_api", builtinApi);
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
      { schema: "keyloop.programming_basics", schema_version: 1, languages },
      null,
      2,
    ) + "\n",
  );
  console.log(`index: ${languages.length} languages`);
}

if (import.meta.main) {
  main();
}
