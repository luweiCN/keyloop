import { describe, expect, test } from "bun:test";

import { scoreTypingDifficulty } from "../src/index";

describe("typing difficulty scoring", () => {
  test("classifies simple low-symbol code as easy", () => {
    const result = scoreTypingDifficulty("const count = items.length;\nreturn count;");

    expect(result.difficulty).toBe("easy");
    expect(result.score).toBeLessThanOrEqual(5);
    expect(result.features.symbolDensity).toBeLessThan(0.22);
  });

  test("classifies common framework code with mixed input patterns as medium", () => {
    const result = scoreTypingDifficulty(
      [
        "const [isLoading, setIsLoading] = useState(false);",
        "try {",
        "  const response = await fetch(`/api/users/${userId}`);",
        "  setUser(await response.json());",
        "} finally {",
        "  setIsLoading(false);",
        "}",
      ].join("\n"),
    );

    expect(result.difficulty).toBe("medium");
    expect(result.score).toBeGreaterThanOrEqual(6);
    expect(result.score).toBeLessThanOrEqual(10);
    expect(result.reasons).toContain("mixed identifier casing");
  });

  test("classifies symbol-dense generic code as medium", () => {
    const result = scoreTypingDifficulty(
      [
        "type UserMap<T extends Record<string, unknown>> = {",
        "  [K in keyof T]?: `${K & string}:${T[K]}`;",
        "};",
      ].join("\n"),
    );

    expect(result.difficulty).toBe("medium");
    expect(result.score).toBeGreaterThanOrEqual(6);
    expect(result.score).toBeLessThanOrEqual(10);
    expect(result.reasons).toContain("high symbol density");
    expect(result.reasons).toContain("tricky operator sequences");
  });
});
