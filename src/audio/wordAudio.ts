import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";

export type WordAudioProvider = "dictionaryapi" | "youdao_dictvoice" | "youdao_tts";

export type WordAudioSourceItem =
  | "everyday_words"
  | "programming_terms"
  | "technical_long_words"
  | "library_words";

export type WordAudioFetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type AudioPlayer = (path: string) => Promise<void> | void;

export interface ResolveWordAudioOptions {
  text: string;
  sourceItem: WordAudioSourceItem;
  cacheDir: string;
  fetcher?: WordAudioFetcher;
  env?: Record<string, string | undefined>;
  voiceName?: string;
  salt?: () => string;
  curtime?: () => number;
}

const dictionaryApiBaseUrl = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const youdaoDictvoiceBaseUrl = "https://dict.youdao.com/dictvoice";
const youdaoTtsUrl = "https://openapi.youdao.com/ttsapi";
const defaultYoudaoVoiceName = "youmeimei";
const maxYoudaoTextBytes = 2048;

export function wordAudioProviderChain(sourceItem: WordAudioSourceItem): WordAudioProvider[] {
  switch (sourceItem) {
    case "everyday_words":
    case "library_words":
      return ["dictionaryapi", "youdao_dictvoice", "youdao_tts"];
    case "programming_terms":
    case "technical_long_words":
      return ["youdao_dictvoice", "youdao_tts"];
  }
}

export function audioCachePath(
  cacheDir: string,
  provider: WordAudioProvider,
  text: string,
  voice: string,
): string {
  const digest = createHash("sha256")
    .update(`${provider}\0${voice}\0${normalizeAudioText(text)}`)
    .digest("hex")
    .slice(0, 32);
  return join(cacheDir, `${provider}-${digest}.mp3`);
}

export async function resolveWordAudio(
  options: ResolveWordAudioOptions,
): Promise<string | null> {
  const text = normalizeAudioText(options.text);
  if (text.length === 0) {
    return null;
  }
  const fetcher = options.fetcher ?? fetch;
  for (const provider of wordAudioProviderChain(options.sourceItem)) {
    const voice = cacheVoiceForProvider(provider, options.voiceName);
    const path = audioCachePath(options.cacheDir, provider, text, voice);
    if (existsSync(path)) {
      return path;
    }
    const audio = await fetchProviderAudio(provider, text, fetcher, options);
    if (audio === null) {
      continue;
    }
    await mkdir(dirname(path), { recursive: true });
    await Bun.write(path, audio);
    return path;
  }
  return null;
}

export async function playWordAudio(
  path: string,
  player: AudioPlayer = defaultAudioPlayer,
): Promise<void> {
  await player(path);
}

async function fetchProviderAudio(
  provider: WordAudioProvider,
  text: string,
  fetcher: WordAudioFetcher,
  options: ResolveWordAudioOptions,
): Promise<Uint8Array | null> {
  switch (provider) {
    case "dictionaryapi":
      return fetchDictionaryApiAudio(text, fetcher);
    case "youdao_dictvoice":
      return fetchAudioResponse(youdaoDictvoiceUrl(text), fetcher);
    case "youdao_tts":
      return fetchYoudaoTtsAudio(text, fetcher, options);
  }
}

async function fetchDictionaryApiAudio(
  text: string,
  fetcher: WordAudioFetcher,
): Promise<Uint8Array | null> {
  const response = await fetcher(`${dictionaryApiBaseUrl}${encodeURIComponent(text)}`);
  if (!response.ok) {
    return null;
  }
  const entries = await response.json().catch(() => null);
  const audioUrl = firstDictionaryAudioUrl(entries);
  if (audioUrl === null) {
    return null;
  }
  return fetchAudioResponse(audioUrl, fetcher);
}

async function fetchYoudaoTtsAudio(
  text: string,
  fetcher: WordAudioFetcher,
  options: ResolveWordAudioOptions,
): Promise<Uint8Array | null> {
  const env = options.env ?? process.env;
  const appKey = env.YOUDAO_APP_KEY?.trim();
  const appSecret = env.YOUDAO_APP_SECRET?.trim();
  if (appKey === undefined || appKey === "" || appSecret === undefined || appSecret === "") {
    return null;
  }
  if (new TextEncoder().encode(text).length > maxYoudaoTextBytes) {
    return null;
  }
  const salt = options.salt?.() ?? randomUUID();
  const curtime = String(options.curtime?.() ?? Math.floor(Date.now() / 1000));
  const sign = sha256(`${appKey}${youdaoSignInput(text)}${salt}${curtime}${appSecret}`);
  const body = new URLSearchParams({
    q: text,
    appKey,
    salt,
    sign,
    signType: "v3",
    curtime,
    voiceName: options.voiceName ?? defaultYoudaoVoiceName,
  });
  return fetchAudioResponse(youdaoTtsUrl, fetcher, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
}

async function fetchAudioResponse(
  url: string,
  fetcher: WordAudioFetcher,
  init?: RequestInit,
): Promise<Uint8Array | null> {
  const response = await fetcher(url, init).catch(() => null);
  if (response === null || !isAudioResponse(response)) {
    return null;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  return bytes.length === 0 ? null : bytes;
}

function firstDictionaryAudioUrl(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null;
  }
  for (const entry of value) {
    if (!isObject(entry) || !Array.isArray(entry.phonetics)) {
      continue;
    }
    for (const phonetic of entry.phonetics) {
      if (!isObject(phonetic) || typeof phonetic.audio !== "string") {
        continue;
      }
      const audio = phonetic.audio.trim();
      if (audio.startsWith("//")) {
        return `https:${audio}`;
      }
      if (audio.startsWith("http://") || audio.startsWith("https://")) {
        return audio;
      }
    }
  }
  return null;
}

function isAudioResponse(response: Response): boolean {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  return response.status === 200 && contentType.startsWith("audio/");
}

function youdaoDictvoiceUrl(text: string): string {
  return `${youdaoDictvoiceBaseUrl}?audio=${encodeURIComponent(text)}&type=2`;
}

function cacheVoiceForProvider(
  provider: WordAudioProvider,
  voiceName: string | undefined,
): string {
  return provider === "youdao_tts" ? (voiceName ?? defaultYoudaoVoiceName) : "default";
}

function youdaoSignInput(text: string): string {
  return text.length <= 20 ? text : `${text.slice(0, 10)}${text.length}${text.slice(-10)}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeAudioText(text: string): string {
  return text.trim();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function defaultAudioPlayer(path: string): Promise<void> {
  if (process.platform !== "darwin") {
    return;
  }
  const proc = Bun.spawn(["afplay", path], {
    stdout: "ignore",
    stderr: "ignore",
  });
  await proc.exited;
}
