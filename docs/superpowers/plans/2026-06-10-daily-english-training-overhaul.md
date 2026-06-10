# Daily English Training Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild KeyLoop daily practice into an English-learning oriented training area with word, sentence, article, word decomposition, and daily mix modules, all with runtime options and translation support.

**Architecture:** Keep the existing OpenTUI app shell and target-generation pipeline. Add focused everyday content models and target metadata instead of folding translations into the typed text. Reuse the existing practice options popup interaction from code practice, but generalize it for everyday modules.

**Tech Stack:** TypeScript, Bun, OpenTUI renderer adapter, JSON content files under `ts/content`, existing `buildEverydayPracticeTarget` training pipeline, ECDICT-style Chinese definitions, MonkeyType/keybr-style word frequency sources, public-domain or attribution-friendly reading sources.

---

## Product Decisions

### Daily Menu

Replace the current everyday submenu:

- `常见 500 词`
- `常见 1000 词`
- `常见 5000 词`
- `日常短语`
- `日常句子`
- `长词拆解`
- `日常综合`

With:

- `单词`
- `句子`
- `文章`
- `单词拆分`
- `日常综合`

`日常短语` is not a top-level menu item. Short phrases can later be included as a sentence-length option if they prove useful.

### Vocabulary Levels

Use level labels that match Chinese English-learning expectations. The exact word counts are implementation buckets, not claims that the source word list exactly equals an exam syllabus.

| Level ID | Label | Approx Size | Purpose |
| --- | --- | ---: | --- |
| `high_school` | 高中 | 3500 | common school vocabulary |
| `cet4` | 四级 | 4500 | college basic vocabulary |
| `cet6` | 六级 | 6000 | college advanced vocabulary |
| `postgraduate` | 考研 | 7000 | graduate entrance level |
| `toefl_ielts` | 托福雅思 | 10000 | broad academic/general English |

For normal word typing, keep MonkeyType-style frequency ranges available internally: `200`, `1000`, `5000`, `10000`. In the UI, expose them as:

- `基础 200`
- `常用 1000`
- `进阶 5000`
- `扩展 10000`

For sentence and article training, expose exam-style levels listed above.

### Translation Display

Translations are shown below the corresponding typed item. Translations are never part of `PracticeTarget.text`.

- Word practice: show each word's Chinese meaning below or near the current word group.
- Sentence practice: show sentence-level Chinese translation below each sentence.
- Article practice: show paragraph-level Chinese translation below each paragraph.
- Word decomposition: show the full word and Chinese meaning near the decomposition line.

### Word Decomposition Interaction

For one source word, keep all decomposition practice on one logical typed line:

```text
in in in for for for ma ma ma tion tion tion information information information
```

Visual wrapping is automatic. Wrapping must not split a token. The user types spaces between parts and full-word repetitions. The user presses Enter only to move from one source word to the next source word.

Example target for two source words:

```text
in in in for for for ma ma ma tion tion tion information information information
de de de vel vel vel op op op ment ment ment development development development
```

### Content Source Rules

- Words: use MonkeyType English word lists first. Optionally add keybr-style cleaned frequency corpus later.
- Word translations: use an open English-Chinese dictionary source such as ECDICT.
- Sentences: use public-domain or attribution-friendly sources. Prefer VOA Learning English for graded educational text, Project Gutenberg for public-domain literature, and Simple English Wikipedia only with attribution metadata.
- Articles: same as sentences, but stored as grouped paragraphs with per-paragraph translations.
- Word decomposition: do not algorithmically generate splits. Import explicit human-authored splits from vocabulary-learning sources or user-provided local data, then validate and store them. The importer may normalize, deduplicate, and verify `parts.join("") === word`, but it must not invent missing splits.

---

## Files And Responsibilities

### Content

- Create `ts/content/everyday_words.json`
  - Stores source metadata and frequency word entries.
  - Word entries include `word`, `rank`, `range`, `level`, `translation_zh`, `source_id`.

- Create `ts/content/everyday_sentences.json`
  - Stores source metadata and sentence entries.
  - Entries include `text`, `translation_zh`, `level`, `length`, `source_id`, `source_title`.

- Create `ts/content/everyday_articles.json`
  - Stores source metadata and article entries.
  - Article entries include `title`, `level`, `length`, `source_id`, `paragraphs`.
  - Each paragraph includes `text` and `translation_zh`.

- Create `ts/content/everyday_word_decomposition.json`
  - Stores word decomposition practice entries.
  - Entries include `word`, `parts`, `translation_zh`, `level`, `source_id`.

- Keep `ts/content/everyday_english.json` during migration for compatibility.
  - Existing tests should continue passing until new content files replace the old target builder paths.
  - Remove or reduce old hand-authored entries only after new modules are fully wired.

### Types And Loading

- Modify `ts/src/content/library.ts`
  - Add new content interfaces.
  - Load the four new content files.
  - Keep user everyday corpus merge behavior for old content until replacement is complete.

- Modify `ts/src/domain/model.ts`
  - Add everyday option types.
  - Add target annotation metadata for translations.
  - Add preferences for everyday word/sentence/article/decomposition options.

Proposed target metadata:

```ts
export interface PracticeTargetAnnotation {
  start: number;
  end: number;
  translation_zh: string;
  source_title?: string;
}

export interface PracticeTarget {
  mode: Mode;
  text: string;
  source: string;
  code_blocks?: PracticeTargetCodeBlock[];
  annotations?: PracticeTargetAnnotation[];
}
```

### Target Generation

- Modify `ts/src/training/targets.ts`
  - Replace current `common_500/common_1000/common_5000` branches with `words`.
  - Add `sentences`, `articles`, and `word_decomposition` branches.
  - Use the new option settings from context.
  - Generate `PracticeTarget.annotations` for translations.

### OpenTUI App Model

- Modify `ts/src/ui/opentui/appModel.ts`
  - Change everyday submenu items.
  - Route `Ctrl+O` from running everyday modules to practice options.
  - Store current everyday option state in `OpenTuiAppState`.

- Modify `ts/src/ui/opentui/startRunner.ts`
  - Keep `Ctrl+O` active for standalone everyday modules.
  - Restart or refresh current target when everyday options change.

- Modify `ts/src/ui/opentui/renderer.ts`
  - Render translation annotations below the typed text.
  - Render everyday practice option popup rows.
  - Ensure word decomposition wraps by token, not by character.

### Tests

- Modify `ts/tests/content.test.ts`
  - Verify new content files load.
  - Verify word list sizes and translation coverage.
  - Verify no blank translation in shipped starter content.

- Modify `ts/tests/targets.test.ts`
  - Verify word target respects range and group count.
  - Verify sentence target respects level and length.
  - Verify article target respects level and length.
  - Verify word decomposition repeats parts and whole words correctly.
  - Verify annotations map to typed text spans.

- Modify `ts/tests/opentuiApp.test.ts`
  - Verify everyday submenu now exposes five entries.
  - Verify old common word entries are gone.

- Modify `ts/tests/opentuiRenderer.test.ts`
  - Verify translations render below target text.
  - Verify everyday options popup renders.
  - Verify word decomposition line wrap does not split tokens.

- Modify `ts/tests/opentuiStartRunner.test.ts`
  - Verify `Ctrl+O` opens everyday options.
  - Verify changing options refreshes target before typing.
  - Verify changing options after typing prompts or restarts consistently with code practice behavior.

---

## Task 1: Add New Everyday Content Schemas And Loaders

**Files:**
- Create: `ts/content/everyday_words.json`
- Create: `ts/content/everyday_sentences.json`
- Create: `ts/content/everyday_articles.json`
- Create: `ts/content/everyday_word_decomposition.json`
- Modify: `ts/src/content/library.ts`
- Modify: `ts/tests/content.test.ts`

- [ ] Add minimal starter JSON files with source metadata and 10 entries per module.
- [ ] Add TypeScript interfaces in `library.ts`.
- [ ] Add `ContentLibrary` fields:
  - `everyday_words`
  - `everyday_sentences`
  - `everyday_articles`
  - `everyday_word_decomposition`
- [ ] Add a content test that loads all four files.
- [ ] Run `bun test ts/tests/content.test.ts`.

Starter word entry shape:

```json
{
  "word": "information",
  "rank": 500,
  "range": "1000",
  "level": "cet4",
  "translation_zh": "信息；资料",
  "source_id": "monkeytype:english_1k"
}
```

Starter sentence entry shape:

```json
{
  "text": "The meeting starts at nine.",
  "translation_zh": "会议九点开始。",
  "level": "high_school",
  "length": "short",
  "source_id": "keyloop:starter-sentences",
  "source_title": "Starter everyday sentences"
}
```

Starter article entry shape:

```json
{
  "title": "A Quiet Morning",
  "level": "high_school",
  "length": "short",
  "source_id": "keyloop:starter-articles",
  "paragraphs": [
    {
      "text": "The morning was quiet, and the street was almost empty.",
      "translation_zh": "清晨很安静，街上几乎没有人。"
    }
  ]
}
```

Starter decomposition entry shape:

```json
{
  "word": "information",
  "parts": ["in", "for", "ma", "tion"],
  "translation_zh": "信息；资料",
  "level": "cet4",
  "source_id": "keyloop:starter-word-decomposition"
}
```

---

## Task 2: Add Everyday Options And Target Annotations

**Files:**
- Modify: `ts/src/domain/model.ts`
- Modify: `ts/tests/model.test.ts`
- Modify: `ts/tests/storage.test.ts`

- [ ] Add shared unions:

```ts
export type EverydayWordRange = "200" | "1000" | "5000" | "10000";
export type EverydayLevel = "high_school" | "cet4" | "cet6" | "postgraduate" | "toefl_ielts";
export type EverydayPracticeLength = "short" | "medium" | "long" | "mixed";
export type EverydayGroupWordCount = 10 | 20 | 30 | 50;
export type EverydaySentenceCount = 3 | 5 | 8 | 10;
export type EverydayRepeatCount = 1 | 3 | 5;
```

- [ ] Add preferences:

```ts
export interface EverydayEnglishSettings {
  word_range: EverydayWordRange;
  word_count: EverydayGroupWordCount;
  sentence_level: EverydayLevel;
  sentence_length: EverydayPracticeLength;
  sentence_count: EverydaySentenceCount;
  article_level: EverydayLevel;
  article_length: EverydayPracticeLength;
  decomposition_level: EverydayLevel;
  decomposition_word_count: EverydayGroupWordCount;
  decomposition_part_repeats: EverydayRepeatCount;
  decomposition_word_repeats: EverydayRepeatCount;
}
```

- [ ] Add `PracticeTargetAnnotation` and optional `annotations` to `PracticeTarget`.
- [ ] Update parsers and defaults:
  - `word_range: "1000"`
  - `word_count: 20`
  - `sentence_level: "cet4"`
  - `sentence_length: "mixed"`
  - `sentence_count: 5`
  - `article_level: "cet4"`
  - `article_length: "short"`
  - `decomposition_level: "cet4"`
  - `decomposition_word_count: 10`
  - `decomposition_part_repeats: 3`
  - `decomposition_word_repeats: 3`
- [ ] Preserve backward compatibility for old stored preferences:
  - If old `sentence_length` exists, map it to new `sentence_length`.
  - If old `word_count` is an unsupported number, clamp to nearest one of `10/20/30/50`.
- [ ] Run:

```bash
bun test ts/tests/model.test.ts ts/tests/storage.test.ts
```

---

## Task 3: Replace Everyday Menu Entries

**Files:**
- Modify: `ts/src/ui/opentui/appModel.ts`
- Modify: `ts/src/ui/opentui/renderer.ts`
- Modify: `ts/src/ui/opentui/startRunner.ts`
- Modify: `ts/src/cli.ts`
- Modify: `ts/tests/opentuiApp.test.ts`

- [ ] Replace everyday submenu with:
  - `everyday_words`
  - `everyday_sentences`
  - `everyday_articles`
  - `everyday_word_decomposition`
  - `everyday_mix`
- [ ] Remove top-level menu IDs:
  - `everyday_common_500`
  - `everyday_common_1000`
  - `everyday_common_5000`
  - `everyday_phrases`
  - `long_word_breakdown` from everyday submenu
- [ ] Keep existing programming/foundation long-word features unchanged.
- [ ] Update CLI lesson metadata mapping.
- [ ] Run:

```bash
bun test ts/tests/opentuiApp.test.ts ts/tests/opentuiRenderer.test.ts
```

---

## Task 4: Build Everyday Word Target

**Files:**
- Modify: `ts/src/training/targets.ts`
- Modify: `ts/tests/targets.test.ts`

- [ ] Add `buildEverydayWordsTarget(context)` using:
  - `context.everydaySettings.word_range`
  - `context.everydaySettings.word_count`
  - `context.library.everyday_words.entries`
- [ ] Filter words by range:
  - `200`: ranks `<= 200`
  - `1000`: ranks `<= 1000`
  - `5000`: ranks `<= 5000`
  - `10000`: ranks `<= 10000`
- [ ] Shuffle with injected random.
- [ ] Exclude recently practiced exact words when enough candidates remain.
- [ ] Join words with spaces.
- [ ] Create one annotation per word with Chinese meaning.
- [ ] Test:
  - range filtering
  - group count
  - translation annotation spans
  - recent-word exclusion

---

## Task 5: Build Sentence And Article Targets

**Files:**
- Modify: `ts/src/training/targets.ts`
- Modify: `ts/tests/targets.test.ts`

- [ ] Add `buildEverydaySentencesTarget(context)`:
  - Filter by `sentence_level`.
  - Filter by `sentence_length`, unless `mixed`.
  - Pick `sentence_count`.
  - Join sentences with `\n`.
  - Add sentence annotations.
- [ ] Add `buildEverydayArticlesTarget(context)`:
  - Filter by `article_level`.
  - Filter by `article_length`, unless `mixed`.
  - Pick one article.
  - Join article paragraphs with `\n`.
  - Add paragraph annotations.
- [ ] Test:
  - sentence level/length selection
  - article level/length selection
  - annotations per sentence/paragraph
  - no blank translations in selected starter entries

---

## Task 6: Build Word Decomposition Target

**Files:**
- Modify: `ts/src/training/targets.ts`
- Modify: `ts/tests/targets.test.ts`

- [ ] Add `buildEverydayWordDecompositionTarget(context)`:
  - Filter entries by `decomposition_level`.
  - Pick `decomposition_word_count`.
  - For each entry, generate one logical line.
  - Repeat each part by `decomposition_part_repeats`.
  - Repeat the whole word by `decomposition_word_repeats`.
  - Join source words with `\n`, so Enter moves to the next source word.
- [ ] Example for `part_repeats=3`, `word_repeats=2`:

```text
in in in for for for ma ma ma tion tion tion information information
```

- [ ] Add annotations for full source word and translation.
- [ ] Test:
  - repeats are correct
  - line break only between source words
  - no manual break inside one source word
  - annotations map to each logical line

---

## Task 7: Render Translations And Token-Safe Wrapping

**Files:**
- Modify: `ts/src/ui/opentui/renderer.ts`
- Modify: `ts/tests/opentuiRenderer.test.ts`

- [ ] Render `PracticeTarget.annotations` below the typing area.
- [ ] For words, show compact rows:

```text
the  这个；那
information  信息；资料
```

- [ ] For sentences/articles, show paragraph-like translation rows below the corresponding English row.
- [ ] Keep translations visually muted and non-typed.
- [ ] Add token-safe wrapping for decomposition rows:
  - wrap between tokens
  - never split `information` into `informa` + `tion`
  - never split a part token
- [ ] Test renderer output for:
  - word translation rows
  - sentence translation rows
  - article paragraph translation rows
  - decomposition token wrapping

---

## Task 8: Add Everyday Ctrl+O Practice Options

**Files:**
- Modify: `ts/src/ui/opentui/appModel.ts`
- Modify: `ts/src/ui/opentui/startRunner.ts`
- Modify: `ts/src/ui/opentui/renderer.ts`
- Modify: `ts/tests/opentuiAppSession.test.ts`
- Modify: `ts/tests/opentuiStartRunner.test.ts`
- Modify: `ts/tests/opentuiRenderer.test.ts`

- [ ] Generalize practice options popup to support `code` and `everyday`.
- [ ] Word options:
  - `词库范围`: `基础 200 / 常用 1000 / 进阶 5000 / 扩展 10000`
  - `每组单词`: `10 / 20 / 30 / 50`
- [ ] Sentence options:
  - `词汇量`: `高中 / 四级 / 六级 / 考研 / 托福雅思`
  - `长度`: `短 / 中 / 长 / 混合`
  - `每组句子`: `3 / 5 / 8 / 10`
- [ ] Article options:
  - `词汇量`: `高中 / 四级 / 六级 / 考研 / 托福雅思`
  - `长度`: `短文 / 中篇 / 长文 / 混合`
- [ ] Decomposition options:
  - `词汇量`: `高中 / 四级 / 六级 / 考研 / 托福雅思`
  - `每组单词`: `10 / 20 / 30 / 50`
  - `拆分重复`: `1 / 3 / 5`
  - `完整词重复`: `1 / 3 / 5`
- [ ] Behavior:
  - `Ctrl+O` opens popup while running everyday practice.
  - Up/down navigates options.
  - Left/right changes value.
  - Enter applies.
  - Esc closes without applying.
  - If target has not started, applying refreshes immediately.
  - If typing already started, follow the existing code practice confirmation behavior.
- [ ] Run:

```bash
bun test ts/tests/opentuiAppSession.test.ts ts/tests/opentuiStartRunner.test.ts ts/tests/opentuiRenderer.test.ts
```

---

## Task 9: Import Real Word Lists And Translations

**Files:**
- Modify: `ts/content/everyday_words.json`
- Create: `scripts/build-everyday-word-content.ts`
- Modify: `ts/tests/content.test.ts`

- [ ] Fetch or vendor MonkeyType English lists:
  - `english`
  - `english_1k`
  - `english_5k`
  - `english_10k`
- [ ] Normalize to lowercase where the source word is a normal word.
- [ ] Remove entries with spaces, punctuation, or unusual casing for first pass.
- [ ] Add rank by source order.
- [ ] Add Chinese translations from ECDICT.
- [ ] If a word has no Chinese translation, keep it out of shipped content until translation exists.
- [ ] Content test requirements:
  - at least 200 entries for range `200`
  - at least 1000 entries for range `1000`
  - at least 4500 entries for range `5000`
  - at least 9000 entries for range `10000`
  - at least 95 percent of shipped word entries have non-empty `translation_zh`

---

## Task 10: Import Starter Sentence And Article Corpus

**Files:**
- Modify: `ts/content/everyday_sentences.json`
- Modify: `ts/content/everyday_articles.json`
- Create: `scripts/build-everyday-reading-content.ts`
- Modify: `ts/tests/content.test.ts`

- [ ] Start with a small curated set, then expand:
  - VOA Learning English style articles if source terms are acceptable.
  - Project Gutenberg public-domain paragraphs.
  - Simple English Wikipedia only if attribution fields are kept.
- [ ] Store source title and URL in source metadata.
- [ ] Classify levels by vocabulary coverage:
  - Count words outside each level's allowed word set.
  - Assign the lowest level where coverage is acceptable.
- [ ] Classify length:
  - Sentence short: <= 8 words
  - Sentence medium: 9 to 18 words
  - Sentence long: > 18 words
  - Article short: 1 to 2 paragraphs
  - Article medium: 3 to 5 paragraphs
  - Article long: 6 to 10 paragraphs
- [ ] Add Chinese translation fields.
- [ ] First pass can use manual translations for a small shipped corpus.
- [ ] Content test:
  - every sentence has source metadata and translation
  - every article paragraph has translation
  - each configured level has at least one sentence and one article

---

## Task 11: Import Human-Authored Word Decomposition Corpus

**Files:**
- Modify: `ts/content/everyday_word_decomposition.json`
- Create: `scripts/build-word-decomposition-content.ts`
- Modify: `ts/tests/content.test.ts`

- [ ] Build the corpus from explicit split records only. Accepted input formats:
  - `word<TAB>part part part<TAB>translation`
  - `word,parts,translation` where `parts` uses `/`, `-`, or spaces
  - JSON records with `word`, `parts`, and `translation_zh`
- [ ] Support importing local source files supplied by the user, so vocabulary-book split data can be kept outside the repository until it is intentionally merged.
- [ ] The script may normalize punctuation, lowercase words, trim spaces, and dedupe records.
- [ ] The script must reject entries where a split is missing. It must not infer or generate parts.
- [ ] Seed the first checked-in corpus with manually verified examples:
  - `information`: `in / for / ma / tion`
  - `development`: `de / vel / op / ment`
  - `important`: `im / por / tant`
  - `education`: `ed / u / ca / tion`
  - `communication`: `com / mu / ni / ca / tion`
- [ ] Keep only entries where:
  - `parts.join("") === word`
  - every part length is between 1 and 6
  - translation exists
- [ ] Keep source metadata per imported batch:
  - `source_id`
  - `source_title`
  - `source_note`
  - `imported_at`
- [ ] Target first useful corpus size:
  - 300 entries for first implementation
  - 1000 entries as follow-up
- [ ] Content test:
  - at least 300 entries
  - all parts join to word
  - all translations exist
  - no entry has `source_id` equal to `algorithmic`

---

## Task 12: Verification And Packaging

**Files:**
- No source files beyond previous tasks.

- [ ] Run targeted tests after each task.
- [ ] Run full verification:

```bash
bun run typecheck
bun test ts/tests
bun run build
bun run build:binary
bun run smoke
git diff --check
```

- [ ] Expected final verification:
  - all tests pass
  - `dist/keyloop.js` rebuilt
  - `dist/keyloop-ts` rebuilt
  - no whitespace errors

---

## Open Implementation Notes

- Do not add a landing page or explanatory UI text. These modules are TUI training screens.
- Do not put everyday single-practice options back into global settings. They belong in `Ctrl+O` on the practice screen.
- Do not type Chinese translations as part of the exercise target.
- Do not split decomposition tokens during visual wrapping.
- Do not remove existing code practice option behavior while generalizing the popup.
- Keep the first shipped corpus modest but high-quality. It is better to ship 300 human-verified decomposition words than 3000 noisy or algorithmically guessed entries.
- Word decomposition scripts must never generate splits. They only import, normalize, dedupe, validate, and report rejected records.
