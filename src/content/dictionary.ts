import { Database } from "bun:sqlite";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface DictionaryEntry {
  phonetic?: string;
  translation_zh?: string;
}

export type DictionaryTier = "full" | "mini" | "none";

interface MiniDictionaryFile {
  version: number;
  words: Record<string, { p?: string; t: string }>;
}

interface StardictRow {
  phonetic: string | null;
  translation: string | null;
}

export class Dictionary {
  private constructor(
    private readonly mini: Map<string, { p?: string; t: string }>,
    private readonly db: Database | null,
  ) {}

  static async open(options: {
    miniPath?: string;
    fullDbPath?: string;
  }): Promise<Dictionary> {
    let mini = new Map<string, { p?: string; t: string }>();
    if (options.miniPath !== undefined && (await Bun.file(options.miniPath).exists())) {
      try {
        const parsed = (await Bun.file(options.miniPath).json()) as MiniDictionaryFile;
        mini = new Map(Object.entries(parsed.words ?? {}));
      } catch {
        // 损坏的 mini 文件视为不存在
      }
    }
    let db: Database | null = null;
    if (options.fullDbPath !== undefined && (await Bun.file(options.fullDbPath).exists())) {
      try {
        db = new Database(options.fullDbPath, { readonly: true });
        db.query("SELECT 1 FROM stardict LIMIT 1").get();
      } catch {
        db = null; // 半截/损坏 db 退回 mini
      }
    }
    return new Dictionary(mini, db);
  }

  get tier(): DictionaryTier {
    if (this.db !== null) return "full";
    if (this.mini.size > 0) return "mini";
    return "none";
  }

  lookup(text: string): DictionaryEntry | null {
    const trimmed = text.trim();
    if (trimmed === "") return null;
    const candidates = trimmed === trimmed.toLowerCase() ? [trimmed] : [trimmed, trimmed.toLowerCase()];
    for (const candidate of candidates) {
      const fromDb = this.lookupDb(candidate);
      if (fromDb !== null) return fromDb;
    }
    for (const candidate of candidates) {
      const entry = this.mini.get(candidate) ?? this.mini.get(candidate.toLowerCase());
      if (entry !== undefined) {
        return {
          ...(entry.p === undefined ? {} : { phonetic: entry.p }),
          translation_zh: entry.t,
        };
      }
    }
    return null;
  }

  private lookupDb(word: string): DictionaryEntry | null {
    if (this.db === null) return null;
    const row = this.db
      .query<StardictRow, [string]>(
        "SELECT phonetic, translation FROM stardict WHERE word = ?1 LIMIT 1",
      )
      .get(word);
    if (row === null || row.translation === null || row.translation === "") {
      return null;
    }
    const translation = row.translation
      .split(/\\n|\n/u)
      .map((part) => part.trim())
      .filter((part) => part !== "")
      .join("; ");
    return {
      ...(row.phonetic === null || row.phonetic === "" ? {} : { phonetic: row.phonetic }),
      translation_zh: translation,
    };
  }
}

export const ECDICT_SQLITE_URL =
  "https://github.com/skywind3000/ECDICT/releases/download/1.0.28/ecdict-sqlite-28.zip";

export async function ensureFullDictionary(options: {
  dbPath: string;
  url?: string;
  fetchImpl?: (url: string) => Promise<Response> | Response;
  unzipImpl?: (zipPath: string, destDir: string) => Promise<void>;
}): Promise<"exists" | "downloaded" | "failed"> {
  const { dbPath } = options;
  if (await Bun.file(dbPath).exists()) {
    return "exists";
  }
  const url = options.url ?? ECDICT_SQLITE_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const unzipImpl = options.unzipImpl ?? systemUnzip;
  const zipPath = `${dbPath}.download.zip`;
  const extractDir = `${dbPath}.extract`;
  try {
    const response = await fetchImpl(url);
    if (!response.ok) {
      return "failed";
    }
    await mkdir(dirname(dbPath), { recursive: true });
    await Bun.write(zipPath, response);
    await unzipImpl(zipPath, extractDir);
    const dbFile = (await readdir(extractDir)).find((name) => name.endsWith(".db"));
    if (dbFile === undefined) {
      return "failed";
    }
    await rename(join(extractDir, dbFile), dbPath); // 原子就位：存在即完整
    return "downloaded";
  } catch {
    return "failed";
  } finally {
    await rm(zipPath, { force: true });
    await rm(extractDir, { recursive: true, force: true });
  }
}

async function systemUnzip(zipPath: string, destDir: string): Promise<void> {
  await mkdir(destDir, { recursive: true });
  const proc = Bun.spawn(["unzip", "-o", zipPath, "-d", destDir], {
    stdout: "ignore",
    stderr: "ignore",
  });
  if ((await proc.exited) !== 0) {
    throw new Error("unzip failed");
  }
}
