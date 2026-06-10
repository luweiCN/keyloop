import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import { Dictionary, ensureFullDictionary } from "../src/content/dictionary";

async function writeMini(dir: string): Promise<string> {
  const path = join(dir, "mini.json");
  await writeFile(
    path,
    JSON.stringify({
      version: 1,
      words: { abandon: { p: "ə'bændən", t: "v. 放弃" }, "give up": { t: "放弃" } },
    }),
  );
  return path;
}

function writeFullDb(dir: string): string {
  const path = join(dir, "ecdict.db");
  const db = new Database(path);
  db.run("CREATE TABLE stardict (word TEXT PRIMARY KEY, phonetic TEXT, translation TEXT)");
  db.run(
    "INSERT INTO stardict VALUES ('serendipity', ',serən''dipəti', 'n. 意外发现珍奇事物的本领')",
  );
  db.close();
  return path;
}

describe("Dictionary", () => {
  test("mini lookup with case normalization, tier=mini", async () => {
    const dir = await mkdtemp(join(tmpdir(), "keyloop-dict-"));
    const dictionary = await Dictionary.open({ miniPath: await writeMini(dir) });
    expect(dictionary.tier).toBe("mini");
    expect(dictionary.lookup("Abandon")).toEqual({
      phonetic: "ə'bændən",
      translation_zh: "v. 放弃",
    });
    expect(dictionary.lookup("give up")).toEqual({ translation_zh: "放弃" });
    expect(dictionary.lookup("nonexistent")).toBeNull();
    await rm(dir, { recursive: true, force: true });
  });

  test("full db preferred when present, tier=full, falls back to mini", async () => {
    const dir = await mkdtemp(join(tmpdir(), "keyloop-dict-"));
    const dictionary = await Dictionary.open({
      miniPath: await writeMini(dir),
      fullDbPath: writeFullDb(dir),
    });
    expect(dictionary.tier).toBe("full");
    expect(dictionary.lookup("serendipity")?.translation_zh).toContain("珍奇");
    expect(dictionary.lookup("abandon")?.translation_zh).toBe("v. 放弃");
    await rm(dir, { recursive: true, force: true });
  });

  test("corrupt full db falls back to mini tier", async () => {
    const dir = await mkdtemp(join(tmpdir(), "keyloop-dict-"));
    const badDb = join(dir, "ecdict.db");
    await writeFile(badDb, "this is not sqlite");
    const dictionary = await Dictionary.open({
      miniPath: await writeMini(dir),
      fullDbPath: badDb,
    });
    expect(dictionary.tier).toBe("mini");
    expect(dictionary.lookup("abandon")?.translation_zh).toBe("v. 放弃");
    await rm(dir, { recursive: true, force: true });
  });

  test("missing everything yields tier=none and null lookups", async () => {
    const dictionary = await Dictionary.open({});
    expect(dictionary.tier).toBe("none");
    expect(dictionary.lookup("abandon")).toBeNull();
  });
});

describe("ensureFullDictionary", () => {
  test("returns exists without fetching when db present", async () => {
    const dir = await mkdtemp(join(tmpdir(), "keyloop-dl-"));
    const dbPath = join(dir, "ecdict.db");
    await writeFile(dbPath, "stub");
    const result = await ensureFullDictionary({
      dbPath,
      fetchImpl: () => {
        throw new Error("should not fetch");
      },
    });
    expect(result).toBe("exists");
    await rm(dir, { recursive: true, force: true });
  });

  test("downloads, extracts, and renames atomically", async () => {
    const dir = await mkdtemp(join(tmpdir(), "keyloop-dl-"));
    const dbPath = join(dir, "dict", "ecdict.db");
    const result = await ensureFullDictionary({
      dbPath,
      fetchImpl: async () => new Response("zipbytes"),
      unzipImpl: async (_zipPath, destDir) => {
        await mkdir(destDir, { recursive: true });
        await writeFile(join(destDir, "stardict.db"), "dbcontent");
      },
    });
    expect(result).toBe("downloaded");
    expect(await Bun.file(dbPath).text()).toBe("dbcontent");
    expect(await Bun.file(`${dbPath}.download.zip`).exists()).toBe(false);
    await rm(dir, { recursive: true, force: true });
  });

  test("fetch failure returns failed and leaves no db", async () => {
    const dir = await mkdtemp(join(tmpdir(), "keyloop-dl-"));
    const dbPath = join(dir, "ecdict.db");
    const result = await ensureFullDictionary({
      dbPath,
      fetchImpl: async () => new Response("nope", { status: 500 }),
    });
    expect(result).toBe("failed");
    expect(await Bun.file(dbPath).exists()).toBe(false);
    await rm(dir, { recursive: true, force: true });
  });

  test("unzip failure returns failed and cleans up", async () => {
    const dir = await mkdtemp(join(tmpdir(), "keyloop-dl-"));
    const dbPath = join(dir, "ecdict.db");
    const result = await ensureFullDictionary({
      dbPath,
      fetchImpl: async () => new Response("zipbytes"),
      unzipImpl: async () => {
        throw new Error("bad zip");
      },
    });
    expect(result).toBe("failed");
    expect(await Bun.file(dbPath).exists()).toBe(false);
    expect(await Bun.file(`${dbPath}.download.zip`).exists()).toBe(false);
    await rm(dir, { recursive: true, force: true });
  });
});
