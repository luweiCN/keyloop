import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  audioCachePath,
  createInterruptingAudioPlayer,
  playWordAudio,
  resolveWordAudio,
  wordAudioProviderChain,
  type WordAudioFetcher,
} from "../src/audio/wordAudio";

describe("word audio providers", () => {
  test("routes word sources through a stable youdao-first provider chain", () => {
    expect(wordAudioProviderChain("everyday_words")).toEqual([
      "youdao_dictvoice",
      "youdao_tts",
    ]);
    expect(wordAudioProviderChain("library_words")).toEqual([
      "youdao_dictvoice",
      "youdao_tts",
    ]);
    expect(wordAudioProviderChain("programming_terms")).toEqual([
      "youdao_dictvoice",
      "youdao_tts",
    ]);
    expect(wordAudioProviderChain("technical_long_words")).toEqual([
      "youdao_dictvoice",
      "youdao_tts",
    ]);
  });

  test("does not use dictionaryapi when dictvoice has no audio", async () => {
    const dir = await tempDir();
    const calls: string[] = [];
    const fetcher: WordAudioFetcher = async (input) => {
      const url = String(input);
      calls.push(url);
      return jsonResponse({ error: "unexpected" }, 404);
    };

    try {
      const path = await resolveWordAudio({
        text: "hello",
        sourceItem: "everyday_words",
        cacheDir: dir,
        fetcher,
        env: {},
      });

      expect(path).toBeNull();
      expect(calls).toEqual([
        "https://dict.youdao.com/dictvoice?audio=hello&type=2",
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("falls through from dictvoice json failure to signed youdao tts", async () => {
    const dir = await tempDir();
    const calls: Array<{ url: string; body?: string }> = [];
    const fetcher: WordAudioFetcher = async (input, init) => {
      const url = String(input);
      const body = init?.body?.toString();
      calls.push(body === undefined ? { url } : { url, body });
      if (url.startsWith("https://dict.youdao.com/dictvoice")) {
        return jsonResponse({ errorCode: 500 }, 500);
      }
      if (url === "https://openapi.youdao.com/ttsapi") {
        return audioResponse("tts-audio");
      }
      return jsonResponse({ error: "unexpected" }, 404);
    };

    try {
      const path = await resolveWordAudio({
        text: "vectorization",
        sourceItem: "technical_long_words",
        cacheDir: dir,
        fetcher,
        env: {
          YOUDAO_APP_KEY: "app-key",
          YOUDAO_APP_SECRET: "app-secret",
        },
        salt: () => "salt-1",
        curtime: () => 1_234,
      });

      expect(path).toBe(audioCachePath(dir, "youdao_tts", "vectorization", "youmeimei"));
      expect(existsSync(path ?? "")).toBe(true);
      expect(calls.map((call) => call.url)).toEqual([
        "https://dict.youdao.com/dictvoice?audio=vectorization&type=2",
        "https://openapi.youdao.com/ttsapi",
      ]);
      expect(calls[1]?.body).toContain("appKey=app-key");
      expect(calls[1]?.body).toContain("q=vectorization");
      expect(calls[1]?.body).toContain("signType=v3");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("skips paid tts when credentials are missing", async () => {
    const dir = await tempDir();
    const calls: string[] = [];
    const fetcher: WordAudioFetcher = async (input) => {
      const url = String(input);
      calls.push(url);
      return jsonResponse({ errorCode: 500 }, 500);
    };

    try {
      const path = await resolveWordAudio({
        text: "authentication",
        sourceItem: "programming_terms",
        cacheDir: dir,
        fetcher,
        env: {},
      });

      expect(path).toBeNull();
      expect(calls).toEqual([
        "https://dict.youdao.com/dictvoice?audio=authentication&type=2",
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("passes normalized volume to the audio player", async () => {
    const played: Array<{ path: string; volume: number }> = [];

    await playWordAudio("cached.mp3", (path, volume) => {
      played.push({ path, volume });
    }, 0.42);

    expect(played).toEqual([{ path: "cached.mp3", volume: 0.42 }]);
  });

  test("interrupting audio player stops the previous process before playing the next word", async () => {
    const killed: string[] = [];
    const started: string[] = [];
    const pending: Array<() => void> = [];
    const player = createInterruptingAudioPlayer((path) => {
      started.push(path);
      return {
        kill: () => killed.push(path),
        exited: new Promise<void>((resolve) => {
          pending.push(resolve);
        }),
      };
    });

    const first = player("first.mp3", 1);
    const second = player("second.mp3", 1);

    expect(started).toEqual(["first.mp3", "second.mp3"]);
    expect(killed).toEqual(["first.mp3"]);

    pending.splice(0).forEach((resolve) => resolve());
    await Promise.all([first, second]);
  });
});

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "keyloop-word-audio-"));
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function audioResponse(value: string): Response {
  return new Response(new TextEncoder().encode(value), {
    status: 200,
    headers: { "content-type": "audio/mpeg" },
  });
}
