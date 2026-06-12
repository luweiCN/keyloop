import { describe, expect, test } from "bun:test";

import {
  resolveYoudaoTtsCredentials,
  type YoudaoCredentialStore,
} from "../src/audio/youdaoCredentials";

describe("youdao tts credentials", () => {
  test("uses keychain credentials before environment variables", async () => {
    const store: YoudaoCredentialStore = {
      load: async () => ({
        appKey: "keychain-key",
        appSecret: "keychain-secret",
      }),
      save: async () => undefined,
      clear: async () => undefined,
    };

    const credentials = await resolveYoudaoTtsCredentials({
      store,
      env: {
        YOUDAO_APP_KEY: "env-key",
        YOUDAO_APP_SECRET: "env-secret",
      },
    });

    expect(credentials).toEqual({
      appKey: "keychain-key",
      appSecret: "keychain-secret",
      source: "keychain",
    });
  });

  test("falls back to environment variables when keychain is empty", async () => {
    const store: YoudaoCredentialStore = {
      load: async () => null,
      save: async () => undefined,
      clear: async () => undefined,
    };

    const credentials = await resolveYoudaoTtsCredentials({
      store,
      env: {
        YOUDAO_APP_KEY: "env-key",
        YOUDAO_APP_SECRET: "env-secret",
      },
    });

    expect(credentials).toEqual({
      appKey: "env-key",
      appSecret: "env-secret",
      source: "env",
    });
  });

  test("returns null when neither keychain nor environment is configured", async () => {
    const store: YoudaoCredentialStore = {
      load: async () => null,
      save: async () => undefined,
      clear: async () => undefined,
    };

    await expect(resolveYoudaoTtsCredentials({ store, env: {} })).resolves.toBeNull();
  });
});
