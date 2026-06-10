import { describe, expect, test } from "bun:test";

interface PackageJson {
  bin?: Record<string, string>;
  scripts?: Record<string, string>;
}

describe("package verification scripts", () => {
  test("package exposes migration verification gates", async () => {
    const packageJson = (await Bun.file(
      new URL("../../package.json", import.meta.url),
    ).json()) as PackageJson;

    expect(packageJson.scripts?.test).toBe("bun test ts/tests");
    expect(packageJson.scripts?.typecheck).toBe("tsc --noEmit");
    expect(packageJson.scripts?.lint).toBe("tsc --noEmit");
    expect(packageJson.scripts?.build).toBe(
      "bun build ts/src/main.ts --target bun --packages external --outfile dist/keyloop.js",
    );
    expect(packageJson.scripts?.["build:binary"]).toBe(
      "bun build ts/src/main.ts --compile --outfile dist/keyloop-ts",
    );
    expect(packageJson.scripts?.["smoke:plan"]).toContain(
      "bun ts/src/main.ts plan",
    );
    expect(packageJson.scripts?.["smoke:report"]).toContain(
      "bun ts/src/main.ts report today",
    );
    expect(packageJson.scripts?.["smoke:sources"]).toContain(
      "bun ts/src/main.ts sources",
    );
    expect(packageJson.scripts?.["smoke:binary:sources"]).toContain(
      "dist/keyloop-ts\" sources",
    );
    expect(packageJson.scripts?.smoke).toBe(
      "bun run smoke:plan && bun run smoke:report && bun run smoke:sources && bun run smoke:binary:sources",
    );
    expect(packageJson.scripts?.["verify:migration"]).toBe(
      "bun run typecheck && bun test ts/tests && bun run build && bun run build:binary && bun run smoke",
    );
    expect(packageJson.scripts?.["smoke:rust-plan"]).toContain(
      "cargo run --locked -- plan",
    );
    expect(packageJson.scripts?.["verify:rust"]).toBe(
      "cargo fmt --check && cargo test --locked --all-targets && cargo clippy --locked -- -D warnings && bun run smoke:rust-plan && git diff --check",
    );
    expect(packageJson.scripts?.["verify:all"]).toBe(
      "bun run verify:migration && bun run verify:rust",
    );
    expect(packageJson.bin?.["keyloop-ts"]).toBe("./ts/src/main.ts");
  });
});
