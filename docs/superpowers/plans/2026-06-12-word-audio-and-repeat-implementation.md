# Word Audio And Repeat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repeat-count support to custom-library word practice and add opt-in word pronunciation across everyday words, programming terms, technical long words, and custom-library words.

**Architecture:** Keep target generation responsible for word text, repeat layout, translation annotations, and `audio_text`. Add a focused audio service with provider routing, local cache, and async playback; OpenTUI owns user preferences, `Ctrl+O` live toggles, and input-driven trigger timing. Existing word input semantics stay unchanged: Space advances between words, Enter remains a typed newline/error where the target expects a space.

**Tech Stack:** Bun, TypeScript, OpenTUI, local JSON preferences, `fetch`, `Bun.write`, `Bun.spawn`/`afplay`, `bun:test`.

---

### Task 1: Persist Word Audio And Custom Library Repeat Preferences

**Files:**
- Modify: `src/domain/model.ts`
- Modify: `tests/storage.test.ts`

- [ ] **Step 1: Write RED preference tests**

Add assertions in `tests/storage.test.ts`:

```ts
expect(preferences.word_audio.enabled).toBe(false);
expect(preferences.custom_library.word_repeats).toBe(1);
```

Add parsing tests:

```ts
const preferences = parseUserPreferences({
  word_audio: { enabled: true },
  custom_library: { word_repeats: 10 },
});
expect(preferences.word_audio.enabled).toBe(true);
expect(preferences.custom_library.word_repeats).toBe(10);
```

Run: `bun test tests/storage.test.ts`
Expected: FAIL because `word_audio` and `custom_library` do not exist.

- [ ] **Step 2: Implement preferences**

In `src/domain/model.ts`, extend `UserPreferences`:

```ts
word_audio: {
  enabled: boolean;
};
custom_library: {
  word_repeats: EverydayRepeatCount;
};
```

Parse with:

```ts
const wordAudio = asObject(object.word_audio);
const customLibrary = asObject(object.custom_library);
```

and defaults:

```ts
word_audio: { enabled: false },
custom_library: { word_repeats: 1 },
```

Use `nearestNumberOption(customLibrary.word_repeats, wordBreakdownRepeatCounts, 1)`.

- [ ] **Step 3: Verify and commit**

Run:

```bash
bun test tests/storage.test.ts
bun run typecheck
git add src/domain/model.ts tests/storage.test.ts
git commit -m "feat: persist word audio preferences"
```

Expected: tests and typecheck pass.

### Task 2: Add `audio_text` And Custom Library Word Repeats

**Files:**
- Modify: `src/domain/model.ts`
- Modify: `src/training/targets.ts`
- Modify: `src/training/customLibraryTargets.ts`
- Modify: `tests/targets.test.ts`
- Modify: `tests/customLibraryTargets.test.ts`

- [ ] **Step 1: Write RED target tests**

In `tests/customLibraryTargets.test.ts`, add:

```ts
const target = buildLibraryWordsTarget(library, { random: fixedRandom, wordRepeats: 3 });
expect(target.text).toContain("abandon abandon abandon");
expect(target.annotations).toContainEqual({
  start: target.text.indexOf("abandon abandon abandon"),
  end: target.text.indexOf("abandon abandon abandon") + "abandon abandon abandon".length,
  translation_zh: "放弃",
  display: "word_loose",
  audio_text: "abandon",
});
```

Add an existing single-repeat assertion to expect `audio_text: "abandon"`.

In `tests/targets.test.ts`, extend everyday/programming/technical word annotation expectations to include `audio_text` equal to the original word.

Run:

```bash
bun test tests/customLibraryTargets.test.ts tests/targets.test.ts
```

Expected: FAIL because `audio_text` and custom `wordRepeats` are not implemented.

- [ ] **Step 2: Implement annotation field and target wiring**

In `src/domain/model.ts`, extend and parse:

```ts
audio_text?: string;
```

In `src/training/targets.ts`, add `audio_text?: string` to annotation text items and copy it in `annotationForItem`.

For word targets, pass original words:

```ts
{
  text: repeatedWordText(entry.word, wordRepeats),
  translation_zh: conciseChineseMeaning(entry.translation_zh),
  display: wordAnnotationDisplay(wordRepeats),
  audio_text: entry.word,
}
```

In `src/training/customLibraryTargets.ts`, add `wordRepeats?: number` to `BuildOptions`, repeat each word with the same `1-10` normalization, set `display` to `"word_loose"` when repeats are greater than 1, and set `audio_text` to the original `word.text`.

- [ ] **Step 3: Verify and commit**

Run:

```bash
bun test tests/customLibraryTargets.test.ts tests/targets.test.ts
bun run typecheck
git add src/domain/model.ts src/training/targets.ts src/training/customLibraryTargets.ts tests/targets.test.ts tests/customLibraryTargets.test.ts
git commit -m "feat: annotate word audio text"
```

Expected: tests and typecheck pass.

### Task 3: Add Audio Provider Chain And Cache

**Files:**
- Create: `src/audio/wordAudio.ts`
- Create: `tests/wordAudio.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write RED provider tests**

Create `tests/wordAudio.test.ts` with fake `fetch`, fake file IO, and fake player assertions:

```ts
expect(wordAudioProviderChain("everyday_words")).toEqual([
  "dictionaryapi",
  "youdao_dictvoice",
  "youdao_tts",
]);
expect(wordAudioProviderChain("programming_terms")).toEqual([
  "youdao_dictvoice",
  "youdao_tts",
]);
```

Add tests that:

```ts
await resolveWordAudio({ text: "hello", sourceItem: "everyday_words", cacheDir, fetcher });
```

uses the first dictionary phonetic audio URL when available, rejects non-`audio/` responses, falls through from `dictvoice` 500 JSON to TTS, and does not call network when the cache file already exists.

Run: `bun test tests/wordAudio.test.ts`
Expected: FAIL because module does not exist.

- [ ] **Step 2: Implement module**

Expose:

```ts
export type WordAudioProvider = "dictionaryapi" | "youdao_dictvoice" | "youdao_tts";
export type WordAudioSourceItem = "everyday_words" | "programming_terms" | "technical_long_words" | "library_words";

export function wordAudioProviderChain(sourceItem: WordAudioSourceItem): WordAudioProvider[];
export function audioCachePath(cacheDir: string, provider: WordAudioProvider, text: string, voice: string): string;
export async function resolveWordAudio(options: ResolveWordAudioOptions): Promise<string | null>;
export async function playWordAudio(path: string, player?: AudioPlayer): Promise<void>;
```

Provider behavior:

- `dictionaryapi`: `https://api.dictionaryapi.dev/api/v2/entries/en/<word>`, first `phonetics[].audio`.
- `youdao_dictvoice`: `https://dict.youdao.com/dictvoice?audio=<word>&type=2`.
- `youdao_tts`: `https://openapi.youdao.com/ttsapi`, v3 SHA-256 signing with `YOUDAO_APP_KEY` and `YOUDAO_APP_SECRET`.

Valid audio requires status `200`, `Content-Type` starting with `audio/`, and non-empty body.

- [ ] **Step 3: Verify and commit**

Run:

```bash
bun test tests/wordAudio.test.ts
bun run typecheck
git add src/audio/wordAudio.ts src/index.ts tests/wordAudio.test.ts
git commit -m "feat: add word audio provider chain"
```

Expected: tests and typecheck pass.

### Task 4: Wire Global Settings And `Ctrl+O` Audio Toggles

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/ui/opentui/appModel.ts`
- Modify: `src/ui/opentui/settingsItems.ts`
- Modify: `src/ui/opentui/settingsReducers.ts`
- Modify: `src/ui/opentui/practiceOptions.ts`
- Modify: `src/ui/opentui/runnerSelection.ts`
- Modify: `src/ui/opentui/menuItems.ts`
- Modify: `tests/opentuiApp.test.ts`
- Modify: `tests/opentuiRenderer.test.ts`
- Modify: `tests/opentuiStartRunner.test.ts`

- [ ] **Step 1: Write RED UI tests**

Add tests that:

```ts
expect(openTuiFlatSettingsItems(state).some((item) => item.kind === "word_audio")).toBe(true);
```

and that cycling the flat settings row toggles `wordAudio.enabled`.

Add `Ctrl+O` tests for:

- `everyday_words` shows `Pronunciation` / `发音`;
- `programming_terms` shows it;
- `technical_long_words` shows it;
- `library_kind_<slug>:words` shows both `Word repeats` and `Pronunciation`.

Run:

```bash
bun test tests/opentuiApp.test.ts tests/opentuiRenderer.test.ts tests/opentuiStartRunner.test.ts
```

Expected: FAIL because the state and option item do not exist.

- [ ] **Step 2: Implement state and reducers**

Add `wordAudioSettings` and `customLibrarySettings` to app/session state, state options, clone helpers, CLI preference save, and `StartRunnerContext`.

Add flat setting kind:

```ts
| "word_audio"
```

with label `单词发音` / `Word pronunciation`, value `开/关` plus Youdao status when credentials are absent.

Extend practice option control union with:

```ts
| { domain: "word_audio"; control: "enabled" }
| { domain: "custom_library"; control: "word_repeats" | "word_audio" }
```

For `library_kind_<slug>:words`, enable live options and rebuild via `buildLibraryWordsTarget(library, { wordRepeats })`.

- [ ] **Step 3: Verify and commit**

Run:

```bash
bun test tests/opentuiApp.test.ts tests/opentuiRenderer.test.ts tests/opentuiStartRunner.test.ts
bun run typecheck
git add src/cli.ts src/ui/opentui/appModel.ts src/ui/opentui/settingsItems.ts src/ui/opentui/settingsReducers.ts src/ui/opentui/practiceOptions.ts src/ui/opentui/runnerSelection.ts src/ui/opentui/menuItems.ts tests/opentuiApp.test.ts tests/opentuiRenderer.test.ts tests/opentuiStartRunner.test.ts
git commit -m "feat: add word audio controls"
```

Expected: tests and typecheck pass.

### Task 5: Trigger Pronunciation During Typing

**Files:**
- Modify: `src/ui/opentui/startRunner.ts`
- Modify: `tests/opentuiStartRunner.test.ts`

- [ ] **Step 1: Write RED playback tests**

Add fake audio service injection to `createOpenTuiStartRunner` options and test:

```ts
const played: string[] = [];
const runner = createOpenTuiStartRunner({
  kit,
  nowMs: () => nowMs,
  wordAudio: {
    play: async (request) => played.push(request.text),
  },
});
```

For target text `hello hello world` with annotations:

```ts
[
  { start: 0, end: 11, translation_zh: "你好", display: "word_loose", audio_text: "hello" },
  { start: 12, end: 17, translation_zh: "世界", display: "word", audio_text: "world" },
]
```

Type `h`, then type through the first group and the separating space. Expect `played` to equal `["hello", "world"]`.

Add a disabled-setting test expecting no calls.

Run: `bun test tests/opentuiStartRunner.test.ts`
Expected: FAIL because runner has no audio injection or trigger.

- [ ] **Step 2: Implement trigger**

In `startRunner.ts`, keep a `Set<string>` of spoken annotation keys per refreshed session. Before `applyLiveKey`, record `beforePosition = session.input.length`; after applying, compare active audio annotations at `beforePosition` and `session.input.length`.

Call audio only when:

- current run audio setting is enabled;
- annotation has `audio_text`;
- annotation display is `"word"` or `"word_loose"`;
- this annotation key has not already played in this session.

Do not await playback in the input path; use `void wordAudio.play(request).catch(() => undefined)`.

- [ ] **Step 3: Verify and commit**

Run:

```bash
bun test tests/opentuiStartRunner.test.ts
bun run typecheck
git add src/ui/opentui/startRunner.ts tests/opentuiStartRunner.test.ts
git commit -m "feat: play words during practice"
```

Expected: tests and typecheck pass.

### Task 6: Final Regression, Build, And Package

**Files:**
- Modify only if verification reveals a regression directly caused by this work.

- [ ] **Step 1: Run full verification**

Run:

```bash
bun test tests
bun run typecheck
bun run build
bun run build:binary
bun run smoke:binary:sources
git status --short
```

Expected: all pass; binary exists at `dist/keyloop`.

- [ ] **Step 2: Commit any verification fixes**

If fixes were needed:

```bash
git add <changed files>
git commit -m "fix: complete word audio integration"
```

If no fixes were needed, do not create an empty commit.

- [ ] **Step 3: Report package path**

Report:

```text
/Users/luwei/code/ai/keyloop/dist/keyloop
```

as the test binary.

## Self-Review

- Spec coverage: repeat count for custom-library words is Task 2 and Task 4; audio provider chain is Task 3; global and live settings are Task 4; typing trigger is Task 5; final package is Task 6.
- Placeholder scan: no unresolved placeholder markers, no unspecified test requests, and each task includes exact commands.
- Type consistency: preference names are `word_audio` and `custom_library`; annotation field is `audio_text`; source item abstraction for custom library words is `library_words`.
