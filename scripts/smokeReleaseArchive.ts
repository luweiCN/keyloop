import { chmod, cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface PackageJson {
  version: string;
}

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJson = (await Bun.file(join(rootDir, "package.json")).json()) as PackageJson;
const target = "local";
const packageName = `keyloop-${packageJson.version}-${target}`;
const tempDir = await mkdtemp(join(tmpdir(), "keyloop-release-smoke-"));

try {
  const packageRoot = join(tempDir, "package");
  const packageDir = join(packageRoot, packageName);
  const extractDir = join(tempDir, "extract");
  const archivePath = join(tempDir, `${packageName}.tar.gz`);

  await mkdir(packageDir, { recursive: true });
  await mkdir(extractDir, { recursive: true });
  await mkdir(join(packageDir, "libexec"), { recursive: true });
  await cp(join(rootDir, "dist", "keyloop.js"), join(packageDir, "libexec", "keyloop.js"));
  await cp(join(rootDir, "node_modules"), join(packageDir, "libexec", "node_modules"), {
    recursive: true,
  });
  await cp(join(rootDir, "README.md"), join(packageDir, "README.md"));
  await cp(join(rootDir, "LICENSE"), join(packageDir, "LICENSE"));
  await cp(join(rootDir, "contents"), join(packageDir, "contents"), { recursive: true });

  await run(["tar", "-C", packageRoot, "-czf", archivePath, packageName]);
  await run(["tar", "-C", extractDir, "-xzf", archivePath]);
  const extractedPackageDir = join(extractDir, packageName);
  const wrapperPath = join(extractedPackageDir, "bin", "keyloop");
  await mkdir(dirname(wrapperPath), { recursive: true });
  await writeFile(
    wrapperPath,
    `#!/bin/sh\nexec bun "${join(extractedPackageDir, "libexec", "keyloop.js")}" "$@"\n`,
  );
  await chmod(wrapperPath, 0o755);
  await run([wrapperPath, "--help"], extractedPackageDir, {
    KEYLOOP_HOME: join(tempDir, "home"),
  });
  await run([wrapperPath, "sources"], extractedPackageDir, {
    KEYLOOP_HOME: join(tempDir, "home"),
  });
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

async function run(
  command: string[],
  cwd = rootDir,
  env: Record<string, string> = {},
): Promise<void> {
  const proc = Bun.spawn(command, {
    cwd,
    env: { ...process.env, ...env },
    stdout: "ignore",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} exited with ${exitCode}`);
  }
}
