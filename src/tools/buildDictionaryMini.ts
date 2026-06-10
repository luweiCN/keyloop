import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ECDICT_CSV_URL =
  "https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv";

const COMMON_RANK_LIMIT = 30000;

export interface MiniDictionaryEntry {
  p?: string;
  t: string;
}

export function miniEntriesFromCsv(
  csv: string,
  options: { commonOnly?: boolean } = {},
): Record<string, MiniDictionaryEntry> {
  const entries: Record<string, MiniDictionaryEntry> = {};
  const rows = parseCsvRows(csv);
  const header = rows[0] ?? [];
  const wordIndex = header.indexOf("word");
  const phoneticIndex = header.indexOf("phonetic");
  const translationIndex = header.indexOf("translation");
  const collinsIndex = header.indexOf("collins");
  const oxfordIndex = header.indexOf("oxford");
  const tagIndex = header.indexOf("tag");
  const bncIndex = header.indexOf("bnc");
  const frqIndex = header.indexOf("frq");
  for (const row of rows.slice(1)) {
    const word = (row[wordIndex] ?? "").trim();
    if (options.commonOnly === true && !isCommonRow(row, { collinsIndex, oxfordIndex, tagIndex, bncIndex, frqIndex })) {
      continue;
    }
    const translation = (row[translationIndex] ?? "")
      .split(/\\n|\n/u)
      .map((part) => part.trim())
      .filter((part) => part !== "")
      .join("; ");
    if (word === "" || translation === "") {
      continue;
    }
    const phonetic = (row[phoneticIndex] ?? "").trim();
    entries[word.toLowerCase()] = {
      ...(phonetic === "" ? {} : { p: phonetic }),
      t: translation,
    };
  }
  return entries;
}

function isCommonRow(
  row: string[],
  columns: {
    collinsIndex: number;
    oxfordIndex: number;
    tagIndex: number;
    bncIndex: number;
    frqIndex: number;
  },
): boolean {
  const numberAt = (index: number): number => {
    const value = Number.parseInt((row[index] ?? "").trim(), 10);
    return Number.isNaN(value) ? 0 : value;
  };
  if (numberAt(columns.collinsIndex) >= 1) return true;
  if (numberAt(columns.oxfordIndex) >= 1) return true;
  if ((row[columns.tagIndex] ?? "").trim() !== "") return true;
  const bnc = numberAt(columns.bncIndex);
  if (bnc >= 1 && bnc <= COMMON_RANK_LIMIT) return true;
  const frq = numberAt(columns.frqIndex);
  if (frq >= 1 && frq <= COMMON_RANK_LIMIT) return true;
  return false;
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index]!;
    if (inQuotes) {
      if (char === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/u, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function main(): Promise<void> {
  const response = await fetch(ECDICT_CSV_URL);
  if (!response.ok) {
    throw new Error(`fetch failed ${response.status}: ${ECDICT_CSV_URL}`);
  }
  const words = miniEntriesFromCsv(await response.text(), { commonOnly: true });
  const outPath = resolve(import.meta.dir, "../../contents/dictionary_mini.json");
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(
    outPath,
    `${JSON.stringify(
      {
        version: 1,
        source_url: ECDICT_CSV_URL,
        retrieved_at: new Date().toISOString().slice(0, 10),
        notes: "Common subset of ECDICT: collins/oxford starred, exam-tagged, or BNC/COCA rank <= 30000",
        words,
      },
      null,
      0,
    )}\n`,
  );
  console.log(`dictionary_mini.json written: ${Object.keys(words).length} words`);
}

if (import.meta.main) {
  await main();
}
