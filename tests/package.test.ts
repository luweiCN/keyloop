import { describe, expect, test } from "bun:test";

interface PackageJson {
  bin?: Record<string, string>;
  scripts?: Record<string, string>;
}

describe("package verification scripts", () => {
  test("package exposes migration verification gates", async () => {
    const packageJson = (await Bun.file(
      new URL("../package.json", import.meta.url),
    ).json()) as PackageJson;

    expect(packageJson.scripts?.test).toBe("bun test tests");
    expect(packageJson.scripts?.typecheck).toBe("tsc --noEmit");
    expect(packageJson.scripts?.lint).toBe("tsc --noEmit");
    expect(packageJson.scripts?.build).toBe(
      "bun build src/main.ts --target bun --packages external --outfile dist/keyloop.js",
    );
    expect(packageJson.scripts?.["build:binary"]).toBe(
      "bun build src/main.ts --compile --outfile dist/keyloop",
    );
    expect(packageJson.scripts?.["smoke:plan"]).toContain(
      "bun src/main.ts plan",
    );
    expect(packageJson.scripts?.["smoke:report"]).toContain(
      "bun src/main.ts report today",
    );
    expect(packageJson.scripts?.["smoke:sources"]).toContain(
      "bun src/main.ts sources",
    );
    expect(packageJson.scripts?.["smoke:binary:sources"]).toContain(
      "dist/keyloop\" sources",
    );
    expect(packageJson.scripts?.smoke).toBe(
      "bun run smoke:plan && bun run smoke:report && bun run smoke:sources && bun run smoke:binary:sources",
    );
    expect(packageJson.scripts?.["verify:migration"]).toBe(
      "bun run typecheck && bun test tests && bun run build && bun run build:binary && bun run smoke",
    );
    expect(packageJson.scripts?.["smoke:rust-plan"]).toBeUndefined();
    expect(packageJson.scripts?.["verify:rust"]).toBeUndefined();
    expect(packageJson.scripts?.["verify:all"]).toBe("bun run verify:migration");
    expect(packageJson.bin?.keyloop).toBe("./src/main.ts");
  });
});
