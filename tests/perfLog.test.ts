import { describe, expect, test } from "bun:test";

import { formatPerfLine } from "../src/ui/opentui/perfLog";

describe("formatPerfLine", () => {
  test("renders numeric fields fixed to 1 decimal and strings verbatim", () => {
    const line = formatPerfLine("2026-06-22T10:00:00.000Z", "lesson_settle", {
      category: "everyday_sentences",
      lesson: "L1",
      record_build: 12.345,
      record_save: 4.2,
      total: 16.545,
    });
    expect(line).toBe(
      "2026-06-22T10:00:00.000Z lesson_settle category=everyday_sentences lesson=L1 record_build=12.3 record_save=4.2 total=16.5\n",
    );
  });
});
