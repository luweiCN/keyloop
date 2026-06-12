import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  audioCachePath,
  resolveWordAudio,
  wordAudioProviderChain,
  type WordAudioFetcher,
} from "../src/audio/wordAudio";

describe("word audio providers", () => {
  test("routes everyday and custom words through free providers before paid tts", () => {
    expect(wordAudioProviderChain("everyday_words")).toEqual([
      "dictionaryapi",
      "youdao_dictvoice",
      "youdao_tts",
    ]);
    expect(wordAudioProviderChain("library_words")).toEqual([
      "dictionaryapi",
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

  test("downloads dictionaryapi phonetic audio and reuses cache", async () => {
    const dir = await tempDir();
    const calls: string[] = [];
    const fetcher: WordAudioFetcher = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith("https://api.dictionaryapi.dev/")) {
        return jsonResponse([
          {
            phonetics: [
              { text: "/həˈləʊ/" },
              { audio: "https://audio.example/hello.mp3" },
            ],
          },
        ]);
      }
      if (url === "https://audio.example/hello.mp3") {
        return audioResponse("hello-audio");
      }
      return jsonResponse({ error: "unexpected" }, 404);
    };

    try {
      const first = await resolveWordAudio({
        text: "hello",
        sourceItem: "everyday_words",
        cacheDir: dir,
        fetcher,
      });
      const second = await resolveWordAudio({
        text: "hello",
        sourceItem: "everyday_words",
        cacheDir: dir,
        fetcher,
      });

      expect(first).toBe(audioCachePath(dir, "dictionaryapi", "hello", "default"));
      expect(second).toBe(first);
      expect(existsSync(first ?? "")).toBe(true);
      expect(calls).toEqual([
        "https://api.dictionaryapi.dev/api/v2/entries/en/hello",
        "https://audio.example/hello.mp3",
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
