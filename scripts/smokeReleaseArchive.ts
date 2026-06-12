import { chmod, cp, mkdir, mkdtemp, rm } from "node:fs/promises";
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
  await cp(join(rootDir, "dist", "keyloop"), join(packageDir, "keyloop"));
  await chmod(join(packageDir, "keyloop"), 0o755);
  await cp(join(rootDir, "README.md"), join(packageDir, "README.md"));
  await cp(join(rootDir, "LICENSE"), join(packageDir, "LICENSE"));
  await cp(join(rootDir, "contents"), join(packageDir, "contents"), { recursive: true });

  await run(["tar", "-C", packageRoot, "-czf", archivePath, packageName]);
  await run(["tar", "-C", extractDir, "-xzf", archivePath]);
  await run(["./keyloop", "sources"], join(extractDir, packageName), {
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
