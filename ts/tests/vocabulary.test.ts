import { describe, expect, test } from "bun:test";

import {
  archivePersonalVocabularyEntry,
  buildLongWordBreakdownTarget,
  createPersonalVocabularyEntry,
  defaultSessionRecord,
  importPersonalVocabularyEntries,
  rankPersonalVocabulary,
  upsertPersonalVocabularyEntry,
  type LongWordEntry,
  type PersonalVocabularyEntry,
} from "../src/index";

const entry = (
  id: string,
  text: string,
  priority: 1 | 2 | 3,
  archived = false,
): PersonalVocabularyEntry => ({
  id,
  text,
  kind: "word",
  tags: ["programming"],
  priority,
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
  archived,
});

describe("personal vocabulary and long-word breakdown", () => {
  test("archived personal vocabulary entries are excluded", () => {
    const ranked = rankPersonalVocabulary([
      entry("active", "internationalization", 2),
      entry("archived", "deprecatedTerm", 3, true),
    ]);

    expect(ranked.map((item) => item.entry.text)).toEqual(["internationalization"]);
  });

  test("blank personal vocabulary entries are excluded", () => {
    const ranked = rankPersonalVocabulary([
      entry("blank", "   ", 3),
      entry("active", "internationalization", 1),
    ]);

    expect(ranked.map((item) => item.entry.text)).toEqual(["internationalization"]);
  });

  test("recent errors and priority determine review order", () => {
    const records = [
      defaultSessionRecord({
        started_at: new Date().toISOString(),
        target_text: "selected performance",
        error_tokens: {
          internationalization: 2,
        },
        token_stats: [
          {
            token: "internationalization",
            kind: "word",
            start_delay_ms: 400,
            duration_ms: 200,
            errors: 1,
          },
        ],
      }),
    ];

    const ranked = rankPersonalVocabulary(
      [
        entry("stable", "selected", 1),
        entry("error", "internationalization", 1),
        entry("priority", "performance", 3),
      ],
      records,
    );

    expect(ranked.map((item) => item.entry.text)).toEqual([
      "internationalization",
      "performance",
      "selected",
    ]);
    expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score ?? 0);
  });

  test("never practiced bonus uses all historical target text", () => {
    const ranked = rankPersonalVocabulary(
      [entry("old", "internationalization", 1)],
      [
        defaultSessionRecord({
          started_at: "2026-01-01T00:00:00.000Z",
          target_text: "internationalization",
        }),
      ],
      { now: new Date("2026-06-05T00:00:00.000Z") },
    );

    expect(ranked[0]?.practiced).toBe(true);
    expect(ranked[0]?.score).toBe(500);
  });

  test("legacy error tokens count when token stats omit the vocabulary entry", () => {
    const records = [
      defaultSessionRecord({
        started_at: new Date().toISOString(),
        target_text: "selected performance",
        error_tokens: {
          internationalization: 2,
        },
        token_stats: [
          {
            token: "selected",
            kind: "word",
            start_delay_ms: 100,
            duration_ms: 100,
            errors: 0,
          },
        ],
      }),
    ];

    const ranked = rankPersonalVocabulary(
      [entry("legacy-error", "internationalization", 1)],
      records,
    );

    expect(ranked[0]?.recent_error_count).toBe(2);
  });

  test("breakdown target uses line-oriented parts word and alias pattern", () => {
    const word: LongWordEntry = {
      word: "internationalization",
      parts: ["international", "ization"],
      aliases: ["i18n"],
      domain: "programming",
      tier: 3,
      source_id: "keyloop:test",
      note_zh: "internationalization",
    };

    const target = buildLongWordBreakdownTarget(word);

    expect(target.mode).toBe("words");
    expect(target.text).toBe(
      [
        "international ization",
        "internationalization internationalization",
        "i18n internationalization",
      ].join("\n"),
    );
    expect(target.text).toContain("i18n internationalization");
    expect(target.source).toBe(
      "keyloop:module:word-breakdown:internationalization",
    );
  });

  test("creates normalized personal vocabulary entries", () => {
    const created = createPersonalVocabularyEntry(
      {
        text: " internationalization ",
        kind: "code_term",
        parts: [" international ", "", "ization"],
        aliases: [" i18n "],
        tags: [" programming ", ""],
        priority: 3,
        meaning_zh: " 国际化 ",
      },
      {
        now: "2026-06-05T04:00:00.000Z",
        idFactory: () => "vocab-1",
      },
    );

    expect(created).toEqual({
      id: "vocab-1",
      text: "internationalization",
      kind: "code_term",
      parts: ["international", "ization"],
      aliases: ["i18n"],
      meaning_zh: "国际化",
      tags: ["programming"],
      priority: 3,
      created_at: "2026-06-05T04:00:00.000Z",
      updated_at: "2026-06-05T04:00:00.000Z",
      archived: false,
    });
  });

  test("upserting archives active duplicate text case-insensitively", () => {
    const store = {
      version: 1 as const,
      entries: [
        entry("old", "Internationalization", 1),
        entry("other", "selected", 2),
      ],
    };

    const updated = upsertPersonalVocabularyEntry(
      store,
      createPersonalVocabularyEntry(
        { text: "internationalization", priority: 3 },
        {
          now: "2026-06-05T04:00:00.000Z",
          idFactory: () => "new",
        },
      ),
      "2026-06-05T04:00:00.000Z",
    );

    expect(
      updated.entries.filter(
        (item) => !item.archived && item.text.toLowerCase() === "internationalization",
      ),
    ).toHaveLength(1);
    expect(updated.entries.find((item) => item.id === "old")).toMatchObject({
      archived: true,
      updated_at: "2026-06-05T04:00:00.000Z",
    });
    expect(updated.entries.find((item) => item.id === "new")).toMatchObject({
      archived: false,
      priority: 3,
    });
  });

  test("archiving an entry keeps it in the store and updates timestamp", () => {
    const updated = archivePersonalVocabularyEntry(
      {
        version: 1,
        entries: [entry("target", "performance", 2)],
      },
      "target",
      "2026-06-05T04:00:00.000Z",
    );

    expect(updated.entries[0]).toMatchObject({
      id: "target",
      archived: true,
      updated_at: "2026-06-05T04:00:00.000Z",
    });
  });

  test("imports strings and partial objects as normalized entries", () => {
    let id = 0;
    const imported = importPersonalVocabularyEntries(
      [
        "performance",
        {
          text: " selectedReceipt ",
          kind: "identifier",
          parts: ["selected", "Receipt"],
          tags: ["code"],
          priority: 1,
        },
      ],
      {
        now: "2026-06-05T04:00:00.000Z",
        idFactory: () => `vocab-${(id += 1)}`,
      },
    );

    expect(imported).toEqual([
      {
        id: "vocab-1",
        text: "performance",
        kind: "word",
        parts: [],
        aliases: [],
        tags: [],
        priority: 2,
        created_at: "2026-06-05T04:00:00.000Z",
        updated_at: "2026-06-05T04:00:00.000Z",
        archived: false,
      },
      {
        id: "vocab-2",
        text: "selectedReceipt",
        kind: "identifier",
        parts: ["selected", "Receipt"],
        aliases: [],
        tags: ["code"],
        priority: 1,
        created_at: "2026-06-05T04:00:00.000Z",
        updated_at: "2026-06-05T04:00:00.000Z",
        archived: false,
      },
    ]);
  });
});
