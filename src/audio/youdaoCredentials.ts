import type { YoudaoTtsCredentials } from "./wordAudio";

export type { YoudaoTtsCredentials } from "./wordAudio";

export type YoudaoCredentialSource = "keychain" | "env";

export interface ResolvedYoudaoTtsCredentials extends YoudaoTtsCredentials {
  source: YoudaoCredentialSource;
}

export interface YoudaoCredentialStore {
  load: () => Promise<YoudaoTtsCredentials | null>;
  save: (credentials: YoudaoTtsCredentials) => Promise<void>;
  clear: () => Promise<void>;
}

export interface ResolveYoudaoTtsCredentialsOptions {
  store?: YoudaoCredentialStore | undefined;
  env?: Record<string, string | undefined> | undefined;
}

const keychainService = "keyloop.youdao-tts";
const appKeyAccount = "app-key";
const appSecretAccount = "app-secret";

export async function resolveYoudaoTtsCredentials(
  options: ResolveYoudaoTtsCredentialsOptions = {},
): Promise<ResolvedYoudaoTtsCredentials | null> {
  const keychainCredentials = normalizeCredentials(await options.store?.load());
  if (keychainCredentials !== null) {
    return { ...keychainCredentials, source: "keychain" };
  }
  const env = options.env ?? process.env;
  const envCredentials = normalizeCredentials({
    appKey: env.YOUDAO_APP_KEY,
    appSecret: env.YOUDAO_APP_SECRET,
  });
  return envCredentials === null ? null : { ...envCredentials, source: "env" };
}

export function createMacOsYoudaoCredentialStore(
  platform = process.platform,
): YoudaoCredentialStore | null {
  if (platform !== "darwin") {
    return null;
  }
  return {
    load: async () => {
      const appKey = await readKeychainPassword(appKeyAccount);
      const appSecret = await readKeychainPassword(appSecretAccount);
      return normalizeCredentials({ appKey, appSecret });
    },
    save: async (credentials) => {
      const normalized = normalizeCredentials(credentials);
      if (normalized === null) {
        throw new Error("Youdao credentials require both app key and app secret");
      }
      await writeKeychainPassword(appKeyAccount, normalized.appKey);
      await writeKeychainPassword(appSecretAccount, normalized.appSecret);
    },
    clear: async () => {
      await deleteKeychainPassword(appKeyAccount);
      await deleteKeychainPassword(appSecretAccount);
    },
  };
}

function normalizeCredentials(
  credentials: { appKey?: string | undefined | null; appSecret?: string | undefined | null } | null | undefined,
): YoudaoTtsCredentials | null {
  const appKey = credentials?.appKey?.trim();
  const appSecret = credentials?.appSecret?.trim();
  if (appKey === undefined || appKey === "" || appSecret === undefined || appSecret === "") {
    return null;
  }
  return { appKey, appSecret };
}

async function readKeychainPassword(account: string): Promise<string | null> {
  const result = await runSecurity([
    "find-generic-password",
    "-s",
    keychainService,
    "-a",
    account,
    "-w",
  ]);
  return result.exitCode === 0 ? result.stdout.trim() : null;
}

async function writeKeychainPassword(account: string, password: string): Promise<void> {
  const result = await runSecurity([
    "add-generic-password",
    "-U",
    "-s",
    keychainService,
    "-a",
    account,
    "-w",
    password,
  ]);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || `security add-generic-password failed: ${result.exitCode}`);
  }
}

async function deleteKeychainPassword(account: string): Promise<void> {
  const result = await runSecurity([
    "delete-generic-password",
    "-s",
    keychainService,
    "-a",
    account,
  ]);
  if (result.exitCode !== 0 && !result.stderr.includes("could not be found")) {
    throw new Error(result.stderr.trim() || `security delete-generic-password failed: ${result.exitCode}`);
  }
}

async function runSecurity(args: string[]): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  const proc = Bun.spawn(["security", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}
