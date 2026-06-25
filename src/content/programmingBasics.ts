import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveCodeContentRoot,
  type ResolveCodeContentRootOptions,
} from "./codeCorpus";

export type ProgrammingBasicsKind = "symbols_numbers" | "builtin_api";

export type ProgrammingBasicsCardForm = "value" | "statement" | "block";

export interface ProgrammingBasicsCard {
  text: string;
  topic: string;
  form?: ProgrammingBasicsCardForm;
  format?: string;
  focus?: string[];
  api?: string;
  note_zh?: string;
  source_id: string;
}

export interface ProgrammingBasicsIndex {
  schema: string;
  schema_version: number;
  languages: string[];
}

export type ProgrammingBasicsOptions = ResolveCodeContentRootOptions;

function basicsRoot(options: ProgrammingBasicsOptions = {}): string {
  return join(resolveCodeContentRoot(options), "programming_basics");
}

export function loadProgrammingBasicsIndex(
  options: ProgrammingBasicsOptions = {},
): ProgrammingBasicsIndex {
  const raw = readFileSync(join(basicsRoot(options), "index.json"), "utf8");
  return JSON.parse(raw) as ProgrammingBasicsIndex;
}

export function listProgrammingBasicsLanguages(
  options: ProgrammingBasicsOptions = {},
): string[] {
  return loadProgrammingBasicsIndex(options).languages;
}

export function loadProgrammingBasicsCards(
  kind: ProgrammingBasicsKind,
  language: string,
  options: ProgrammingBasicsOptions = {},
): ProgrammingBasicsCard[] {
  const path = join(basicsRoot(options), kind, `${language}.jsonl`);
  const raw = readFileSync(path, "utf8");
  const cards: ProgrammingBasicsCard[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const card = JSON.parse(trimmed) as ProgrammingBasicsCard;
    if (typeof card.text !== "string" || card.text.length === 0) {
      throw new Error(`invalid programming basics card in ${path}`);
    }
    cards.push(card);
  }
  return cards;
}
