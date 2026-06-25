import { describe, expect, test } from "bun:test";

interface PackageJson {
  version?: string;
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
    expect(packageJson.scripts?.["smoke:release:archive"]).toBe(
      "bun scripts/smokeReleaseArchive.ts",
    );
    expect(packageJson.scripts?.smoke).toBe(
      "bun run smoke:plan && bun run smoke:report && bun run smoke:sources && bun run smoke:binary:sources && bun run smoke:release:archive",
    );
    expect(packageJson.scripts?.["verify:migration"]).toBe(
      "bun run typecheck && bun test tests && bun run build && bun run build:binary && bun run smoke",
    );
    expect(packageJson.scripts?.["smoke:rust-plan"]).toBeUndefined();
    expect(packageJson.scripts?.["verify:rust"]).toBeUndefined();
    expect(packageJson.scripts?.["verify:all"]).toBe("bun run verify:migration");
    expect(packageJson.bin?.keyloop).toBe("./src/main.ts");
  });

  test("package version is bumped for the next release", async () => {
    const packageJson = (await Bun.file(
      new URL("../package.json", import.meta.url),
    ).json()) as PackageJson;

    expect(packageJson.version).toBe("0.7.0");
  });

  test("release workflow packages runtime content and Homebrew installs it", async () => {
    const releaseWorkflow = await Bun.file(
      new URL("../.github/workflows/release.yml", import.meta.url),
    ).text();

    expect(releaseWorkflow).toContain("archive_target: x86_64-unknown-linux-gnu");
    expect(releaseWorkflow).toContain("os: macos-26-intel");
    expect(releaseWorkflow).toContain("archive_target: x86_64-apple-darwin");
    expect(releaseWorkflow).toContain("os: macos-26");
    expect(releaseWorkflow).toContain("archive_target: aarch64-apple-darwin");
    expect(releaseWorkflow).toContain(
      "bun build src/main.ts --target bun --packages external --outfile dist/keyloop.js",
    );
    expect(releaseWorkflow).toContain("TARGET: ${{ matrix.archive_target }}");
    expect(releaseWorkflow).toContain("Smoke release app");
    expect(releaseWorkflow).toContain('"$tmp/keyloop/bin/keyloop" --help >/dev/null');
    expect(releaseWorkflow).toContain('"$tmp/keyloop/bin/keyloop" sources >/dev/null');
    expect(releaseWorkflow).toContain('depends_on "bun"');
    expect(releaseWorkflow).toContain("preserve_rpath");
    expect(releaseWorkflow).toContain('libexec.install "libexec/keyloop.js"');
    expect(releaseWorkflow).toContain('libexec.install "libexec/node_modules"');
    expect(releaseWorkflow).toContain('Formula["bun"].opt_bin');
    expect(releaseWorkflow).toContain('cp -R contents "dist/keyloop-${VERSION}-${TARGET}/"');
    expect(releaseWorkflow).toContain(
      'cp -R node_modules "dist/keyloop-${VERSION}-${TARGET}/libexec/node_modules"',
    );
    expect(releaseWorkflow).toContain('prefix.install "contents"');
  });

  test("release docs and PR template use TypeScript verification commands", async () => {
    const files = await Promise.all([
      Bun.file(new URL("../README.md", import.meta.url)).text(),
      Bun.file(new URL("../README.en.md", import.meta.url)).text(),
      Bun.file(new URL("../docs/QUALITY.md", import.meta.url)).text(),
      Bun.file(new URL("../docs/QUALITY.zh.md", import.meta.url)).text(),
      Bun.file(new URL("../.github/pull_request_template.md", import.meta.url)).text(),
    ]);
    const combined = files.join("\n");

    expect(combined).not.toContain("dist/keyloop-ts");
    expect(combined).not.toContain("cargo fmt");
    expect(combined).not.toContain("cargo test");
    expect(combined).not.toContain("cargo clippy");
    expect(combined).toContain("bun run typecheck");
    expect(combined).toContain("bun test tests");
    expect(combined).toContain("bun run smoke");
  });
});
