# KeyLoop TS/OpenTUI Migration Specification

Last updated: 2026-06-05

This document is the behavioral migration contract for rewriting KeyLoop from
Rust/Ratatui to TypeScript/OpenTUI. The goal is not to preserve the current UI
implementation. The goal is to translate the non-UI product logic faithfully:
content loading, practice target generation, adaptive planning, metrics,
session storage, reports, and training semantics.

## 1. Migration Goal

KeyLoop is currently a local terminal typing trainer for programmers. It trains
real development input: foundation keys, everyday English, programming
vocabulary, symbols, naming, and full code blocks.

The TS/OpenTUI rewrite should keep these product guarantees:

- Existing user data under `~/.keyloop` remains readable.
- Existing content JSON files remain the initial source of truth.
- Existing metrics semantics remain compatible, especially WPM, raw WPM,
  accuracy, errors, backspaces, token timings, and daily run progress.
- Existing adaptive planning remains behaviorally equivalent before adding new
  features.
- UI can be rebuilt in OpenTUI using TS-friendly state and component patterns.
- New word-form features are added as training logic, not as UI-only features.

Non-goals:

- Do not copy the Ratatui rendering layout line-for-line.
- Do not change the meaning of historical records to make the rewrite easier.
- Do not replace the local JSON/JSONL storage with a database in the first TS
  version.
- Do not import external typing-site corpora into the repository.

## 2. Current Product Surface

Current CLI commands:

```text
keyloop
keyloop start
keyloop start --repo /path/to/project
keyloop start --code-language typescript
keyloop start --code-framework react
keyloop start --code-project nextjs
keyloop report today
keyloop plan
keyloop import /path/to/project
keyloop sources
keyloop --language en
```

Current main menu:

1. Comprehensive practice
2. Foundation practice
3. Everyday practice
4. Programming basics
5. Code practice
6. Settings
7. Stats

Current comprehensive practice path:

```text
Foundation input -> Everyday English -> Programming basics -> Code practice
```

The path is adaptive. With recent history, stable modules can be reduced, weak
modules stay present, and group feedback from completed lessons can influence
later generated targets.

## 3. Rust-to-TS Module Mapping

Recommended TS module boundaries:

| Rust source | TS target | Responsibility |
| --- | --- | --- |
| `src/model.rs` | `src/domain/model.ts` | Enums, serializable record types, preferences, plans |
| `src/storage.rs` | `src/storage/keyloopStore.ts` | JSON/JSONL file paths, loading, saving, daily run reuse |
| `src/metrics.rs` | `src/training/metrics.ts` | Session metrics, WPM, tokenization, token timings |
| `src/plan.rs` | `src/training/plan.ts` | Recent-history adaptive plan and advice |
| `src/content/library.rs` | `src/content/library.ts` | Load built-in and user content |
| `src/content/mod.rs` | `src/training/targets.ts` | Build practice targets and daily plans |
| `src/content/snippets.rs` | `src/content/snippets.ts` | Extract, normalize, score, and pick code snippets |
| `src/feedback.rs` | `src/training/feedback.ts` | Group feedback and generated identifier filtering |
| `src/report.rs` | `src/report/report.ts` | CLI report text and source/import preview |
| `src/trainer/stats.rs` | `src/report/stats.ts` | Aggregations for stats screens |
| `src/trainer/mod.rs` | `src/ui/opentui/*` | TUI state machine, rendering, key handling |
| `src/trainer/copy.rs` | `src/ui/copy.ts` | Localized UI strings |
| `src/cli.rs`, `src/main.rs` | `src/cli.ts`, `src/main.ts` | CLI parsing and command dispatch |

The TS rewrite should keep non-UI modules testable without OpenTUI. OpenTUI
should depend on the training core, not the other way around.

## 4. Domain Model Compatibility

Use string enums matching Rust serde values.

```ts
type Language = "zh" | "en";

type Mode =
  | "chars"
  | "numbers"
  | "case"
  | "words"
  | "symbols"
  | "code"
  | "mixed";

type LessonKind =
  | "foundation"
  | "warmup"
  | "chunks"
  | "common_words"
  | "words"
  | "symbols"
  | "naming"
  | "code_block";

type TrainingModule =
  | "unknown"
  | "comprehensive"
  | "foundation_input"
  | "everyday_english"
  | "programming_basics"
  | "code_practice";

type TrainingCategory =
  | "unknown"
  | "foundation_mix"
  | "home_row"
  | "top_row"
  | "bottom_row"
  | "finger_transitions"
  | "punctuation_edges"
  | "letter_combinations"
  | "basic_words"
  | "everyday_words"
  | "everyday_phrases"
  | "everyday_sentences"
  | "everyday_mix"
  | "numbers_symbols"
  | "operators_brackets_quotes"
  | "programming_terms"
  | "naming_styles"
  | "programming_basics_mix"
  | "code_snippet"
  | "code_function"
  | "code_file_fragment"
  | "code_mix"
  | "review"
  | "word_breakdown"
  | "personal_vocabulary";

type MixProfile = "standalone" | "comprehensive" | "review";
type CompletionState = "completed" | "partial";
type TokenKind = "word" | "symbol" | "code";
type KeyAction = "insert" | "auto_indent" | "backspace";
type CodePracticeLevel = "block" | "function" | "file";
type CodePracticeFacet = "language" | "framework" | "project";
type EverydaySentenceLength = "short" | "medium" | "long" | "mixed";
```

TS must preserve missing-field defaults when reading old records:

- `SessionRecord.id`: `"legacy"` if absent.
- `SessionRecord.started_at`: Unix epoch if absent.
- Missing `module`: `"unknown"` for session records.
- Missing lesson `module`: `"programming_basics"`.
- Missing lesson `category`: `"programming_terms"`.
- Missing `mix_profile`: `"standalone"`.
- Missing arrays/maps: empty.
- Missing numeric fields: `0`.

Serializable shape:

```ts
interface PracticeTarget {
  mode: Mode;
  text: string;
  source: string;
}

interface PracticeLesson {
  id: string;
  kind: LessonKind;
  module: TrainingModule;
  category: TrainingCategory;
  mix_profile: MixProfile;
  estimated_minutes: number;
  target: PracticeTarget;
  reason_zh: string;
  reason_en: string;
}

interface DailyPracticePlan {
  run_id: string;
  run_number: number;
  target_minutes: number;
  completed_ms: number;
  lessons: PracticeLesson[];
}

interface KeyEventRecord {
  at_ms: number;
  action: KeyAction;
  position: number;
  expected: string | null;
  input: string | null;
  correct: boolean;
}

interface TokenStat {
  token: string;
  kind: TokenKind;
  start_delay_ms: number;
  duration_ms: number;
  errors: number;
}

interface SessionRecord {
  id: string;
  started_at: string;
  mode: Mode;
  source: string;
  daily_run_id: string;
  lesson_id: string;
  lesson_index: number | null;
  completion_state: CompletionState;
  module: TrainingModule;
  category: TrainingCategory;
  duration_ms: number;
  active_ms: number;
  idle_ms: number;
  manual_pause_ms: number;
  idle_pause_count: number;
  start_to_first_key_ms: number;
  last_key_to_end_ms: number;
  char_stats: {
    correct: number;
    incorrect: number;
    extra: number;
    missed: number;
  };
  target_text: string;
  user_input: string;
  target_len: number;
  typed_len: number;
  correct_chars: number;
  wpm: number;
  raw_wpm: number;
  accuracy: number;
  error_count: number;
  backspace_count: number;
  error_chars: Record<string, number>;
  error_tokens: Record<string, number>;
  slow_tokens: TokenStat[];
  token_stats: TokenStat[];
  key_events: KeyEventRecord[];
}
```

## 5. Storage Contract

Data directory:

```text
KEYLOOP_HOME if set, otherwise ~/.keyloop
```

Files:

```text
~/.keyloop/sessions.jsonl
~/.keyloop/preferences.json
~/.keyloop/daily_runs.json
~/.keyloop/key_stats.json
~/.keyloop/current_session.json
~/.keyloop/vocabulary.json       # new
```

Storage rules:

- `sessions.jsonl` is append-only JSONL.
- Invalid non-empty JSONL rows are skipped with a diagnostic, not fatal.
- `preferences.json`, `daily_runs.json`, `key_stats.json`,
  `current_session.json`, and `vocabulary.json` are pretty JSON files.
- Parent directories are created before writes.
- Session records are appended immediately on complete or partial save.
- Daily plans can exist before a session is saved.
- A session checkpoint is saved at lesson start and cleared after successful
  session save.

Daily run behavior:

1. Load `daily_runs.json`.
2. Compute today's completed milliseconds from all session records whose
   `started_at` local date is today.
3. If today's latest stored run is not complete, reuse it and update
   `completed_ms`.
4. Otherwise create a new run:
   - `run_number = max(today.run_number) + 1`
   - `run_id = YYYYMMDD-runNumber-uuidSimple`
   - lesson IDs become `run_id-XX-kind_slug`
5. A daily run is complete only if every lesson ID in the stored plan has a
   completed session record with the same `daily_run_id`.
6. Partial records do not complete a daily run.

## 6. Preferences Contract

Existing preferences:

```ts
interface UserPreferences {
  interface_language: Language;
  pinned_code_filters: CodeFilterPreference[];
  global_code_filters: CodeFilterPreference[];
  everyday_english: EverydayEnglishSettings;
}

interface EverydayEnglishSettings {
  word_count: number; // default 50
  sentence_length: EverydaySentenceLength; // default "mixed"
  include_phrases: boolean; // default true
}
```

Code filters:

- Pinned filters are sorted before unpinned filters.
- Pinning moves a filter to the front and truncates pinned filters to 24.
- Global selected filters are used by comprehensive code practice when CLI
  filters are not provided.
- `match_any = true` for global multi-select filters.

New preference fields:

```ts
interface UserPreferences {
  word_breakdown?: {
    enabled_in_comprehensive: boolean; // default true
    max_items_per_group: number;       // default 6
  };
  personal_vocabulary?: {
    enabled_in_comprehensive: boolean; // default true
    daily_review_limit: number;        // default 8
  };
}
```

Missing new fields must default as above.

## 7. Content Library Contract

Current content files and counts:

| File | Count | Purpose |
| --- | ---: | --- |
| `content/foundation_drills.json` | 14 drills | Foundation key drills |
| `content/warmup.json` | 240 lines | Warmup lines |
| `content/word_chunks.json` | 420 lines | Prefix/suffix/chunk drills |
| `content/common_words.json` | 460 words | Common English words |
| `content/everyday_english.json` | 80 entries | Everyday/workplace words, phrases, sentences |
| `content/programming_words.json` | 900 entries | Programmer terms and generated names |
| `content/symbols.json` | 245 lines | Code symbols |
| `content/language_symbols.json` | 10 sets | Language/framework-specific symbols |
| `content/number_drills.json` | 115 lines | Number-row and code number patterns |
| `content/naming.json` | 360 lines | Naming-style drills |
| `content/code/*.json` | 65 snippets | Hand-authored code snippets |
| `content/code/generated/*.json` | 5400 snippets | KeyLoop-generated code snippets |
| `content/source_catalog.json` | 322-line catalog | Source/license metadata |

`content/everyday_english.json` schema:

```ts
interface EverydayEnglishCorpus {
  sources: EverydayCorpusSource[];
  entries: EverydayCorpusEntry[];
}

interface EverydayCorpusEntry {
  text: string;
  kind: "word" | "phrase" | "sentence";
  tier: number | null;
  length: "short" | "medium" | "long" | null;
  domain: "everyday" | "workplace";
  source_id: string;
}
```

User everyday corpus:

- Env var: `KEYLOOP_EVERYDAY_CORPUS=/path/to/everyday.json`.
- Schema is the same as `content/everyday_english.json`.
- Merge source metadata by unique `source_id`.
- Merge entries by unique `(source_id, kind, text)`.
- User local corpus is not written back into the repo.

New built-in long-word file:

```text
content/long_words.json
```

Recommended schema:

```ts
interface LongWordEntry {
  word: string;
  parts: string[];
  aliases?: string[];       // e.g. ["i18n"]
  domain: "everyday" | "workplace" | "programming" | "web3";
  tier: number;             // 1 easy, 2 normal, 3 hard
  source_id: string;
  note_zh?: string;
}
```

Initial examples:

```json
[
  {
    "word": "internationalization",
    "parts": ["international", "ization"],
    "aliases": ["i18n"],
    "domain": "programming",
    "tier": 3,
    "source_id": "keyloop:long-words:manual",
    "note_zh": "国际化"
  },
  {
    "word": "accessibility",
    "parts": ["access", "ibility"],
    "aliases": ["a11y"],
    "domain": "programming",
    "tier": 3,
    "source_id": "keyloop:long-words:manual",
    "note_zh": "可访问性"
  }
]
```

## 8. Personal Vocabulary Contract

New local file:

```text
~/.keyloop/vocabulary.json
```

Purpose:

- Store words, phrases, technical terms, project terms, and user-defined
  decompositions.
- Feed standalone "My vocabulary" practice.
- Feed comprehensive practice opportunistically without adding a mandatory
  extra step.

Schema:

```ts
interface PersonalVocabularyStore {
  version: 1;
  entries: PersonalVocabularyEntry[];
}

interface PersonalVocabularyEntry {
  id: string;
  text: string;
  kind: "word" | "phrase" | "identifier" | "code_term";
  parts?: string[];
  aliases?: string[];
  meaning_zh?: string;
  tags: string[];
  priority: 1 | 2 | 3;
  created_at: string;
  updated_at: string;
  archived: boolean;
}
```

Minimum operations:

```text
keyloop vocab add internationalization --parts international,ization --alias i18n --tag programming
keyloop vocab list
keyloop vocab remove <id>
keyloop vocab import /path/to/words.json
```

TUI should also expose a "My vocabulary" practice entry. Editing can start in
CLI first; full TUI editing is optional for the first TS version.

Personal vocabulary selection score:

```text
score =
  priority * 500
  + never_practiced_bonus
  + recent_error_count * 1000
  + avg_start_delay_ms
  + avg_duration_ms / 2
```

Where:

- `never_practiced_bonus = 800` if the entry text has never appeared in
  `target_text`.
- `recent_error_count` is derived from `error_tokens` and `token_stats` over the
  last 21 days.
- Archived entries are excluded.
- Comprehensive practice should draw at most `daily_review_limit` entries per
  full run.

## 9. Metrics Contract

The saved metrics algorithm must match Rust.

Constants:

```text
IDLE_THRESHOLD_MS = 10_000
WPM word basis = 5 characters
```

Input counts:

- `insert_count`: count key events where `action == "insert"`.
- `correct_insert_count`: insert events where `correct == true`.
- `backspace_count`: count key events where `action == "backspace"`.
- `has_auto_indent`: any event where `action == "auto_indent"`.

Correct character count:

```text
final_correct_chars =
  count zip(target_chars, input_chars) where expected == actual

correct_chars =
  if has_auto_indent then correct_insert_count else final_correct_chars
```

Timing breakdown:

```text
first = first key event
last = last key event
start_to_first_key_ms = min(first.at_ms, duration_ms)
last_key_to_end_ms = duration_ms - min(last.at_ms, duration_ms)

idle_ms = sum over adjacent key events:
  if gap > 10_000 then gap - 10_000 else 0

idle_pause_count = number of gaps above 10_000

active_ms =
  duration_ms
  - start_to_first_key_ms
  - last_key_to_end_ms
  - idle_ms
```

WPM:

```text
minutes = max(active_ms, 1) / 60_000
raw_wpm = insert_count / 5 / minutes
wpm = correct_chars / 5 / minutes
```

Accuracy:

```text
accuracy =
  if insert_count == 0 then 0
  else correct_insert_count / insert_count * 100
```

Live metrics differ in one edge case: while running, if `insert_count == 0`,
live accuracy displays `100.0`; saved record accuracy uses `0.0`.

Character stats:

```text
char_stats.correct = correct_chars
char_stats.incorrect = error_count
char_stats.extra = max(input_chars.length - target_chars.length, 0)
char_stats.missed = max(target_chars.length - input_chars.length, 0)
```

Error characters:

- Count incorrect insert events.
- Bucket by `event.expected ?? event.input ?? "<extra>"`.
- Printable labels:
  - newline: `"\\n"`
  - tab: `"\\t"`
  - space: `"<space>"`
  - otherwise the character itself

## 10. Tokenization and Token Timing

Token spans are computed from target text, skipping whitespace.

Word token:

- Starts with ASCII alphabetic or `_`.
- Continues with ASCII alphanumeric or `_`.
- The token `_` alone is classified as symbol, otherwise word.

Symbol token:

Match the first pattern at the current index from this ordered list:

```text
!== === => && || >= <= ?. ?? ${} () [] {} <> '' "" `` :: -> += -= *= /= _ - = + * / \ ? ! : ; , . ( ) [ ] { } < > ' " `
```

Fallback token:

- A single character classified as `code`.

Token statistics:

1. Build insert-only event list.
2. Maintain `visible_at_ms`, initially `0`.
3. For each token span, select insert events where:
   - `event.at_ms >= visible_at_ms`
   - `span.start <= event.position < span.end`
4. If the token has at least one event:
   - `start_delay_ms = first.at_ms - visible_at_ms`
   - `duration_ms = last.at_ms - first.at_ms`
   - `errors = incorrect insert count inside token`
   - set `visible_at_ms = last.at_ms`

Before token stats, key event timestamps are adjusted by removing
`start_to_first_key_ms` and idle excess. This makes token delays reflect active
typing time, not pre-start thinking or long pauses.

Slow tokens in a saved record:

```text
sort descending by:
  start_delay_ms + duration_ms / 2 + errors * 250

keep top 12
```

Group feedback slow-token threshold:

```text
start_delay_ms + duration_ms >= 1200
```

## 11. Key Aggregate Contract

`key_stats.json` stores per-key timing and error aggregates.

On every non-auto-indent key event:

```text
interval_ms = event.at_ms - previous_key_event_at_ms, or 0 for first
filtered_interval = min(interval_ms, 10_000)
sample_count += 1
hit_count += 1 if event is correct insert
otherwise miss_count += 1
avg_ms = rolling average of filtered_interval
filtered_avg_ms = rolling average of filtered_interval
fastest_ms = min nonzero filtered_interval
slowest_ms = max filtered_interval
error_rate = miss_count / sample_count * 100
confidence = filtered_avg_ms > 0 ? 220 / filtered_avg_ms : 0
last_seen_at = now
```

Key label:

- Insert: `expected ?? input ?? "extra"`, with newline/tab/space mapped to
  `enter`, `tab`, `space`.
- Backspace: `backspace`.
- Auto indent: ignored for aggregate updates.

Flush key stats at most once per second unless forced.

## 12. Adaptive Plan Contract

History window:

```text
PLAN_HISTORY_DAYS = 21
```

No recent history default:

```text
focus_words = ["return", "function", "current", "response", "useEffect"]
focus_symbols = ["=>", "!==", "&&", "_", "{}"]
focus_code = ["useState", "items.map", "!== null"]
focus_keys = []
recommended_mode = "chars"
has_recent_history = false
```

Aggregate score:

```text
occurrences += 1
errors += stat.errors
delay_sum += stat.start_delay_ms
duration_sum += stat.duration_ms

score =
  avg_delay
  + avg_duration * 0.25
  + errors * 300
```

Recent records feed four aggregates:

- `words`
- `symbols`
- `code_terms`
- `keys`

If `record.token_stats` is empty, use legacy `record.error_tokens`.

Generated identifier filter:

- Skip numbered template identifiers such as `transaction5Open`,
  `transaction10Open`, `Module6Config`, `module3-list`.
- Do not skip common names such as `uint256`, `ERC20`, `H2Title`, `r2d2`,
  `s3Bucket`, `sha256Sum`.
- Current detector requires a digit sequence after an alphabetic stem of length
  at least 5, followed by alphabetic, `_`, or `-`.

Focus selection:

```text
focus_words =
  top 16 word scores
  -> keep words where len >= 3 and (has uppercase or len >= 5)
  -> take 6

focus_symbols = top 6 symbol scores

focus_code =
  top 8 code-term scores
  -> keep terms len >= 2
  -> take 4
  -> append first 3 focus_words if not already present

focus_keys = top 8 key scores
```

Advice:

- If weighted recent accuracy `< 95`, advise slowing down for accuracy.
- If total backspaces `> recent_record_count * 12`, advise avoiding correction
  loops.
- If focus words exist, advise reviewing those words/identifiers.
- If focus symbols exist, advise reviewing those symbols.
- If focus keys exist, advise key hot spots.
- If none of the above, advise stable mixed/code practice.

Recommended mode:

```text
symbol_pressure = sum(symbol scores)
word_pressure = sum(word scores)

if symbol_pressure > word_pressure * 1.15 -> "symbols"
else if word_pressure > symbol_pressure * 1.15 -> "words"
else -> "mixed"
```

Key buckets:

```text
! or 1 -> 1
@ or 2 -> 2
# or 3 -> 3
$ or 4 -> 4
% or 5 -> 5
^ or 6 -> 6
& or 7 -> 7
* or 8 -> 8
( or 9 -> 9
) or 0 -> 0
_ or - -> -
+ or = -> =
~ or ` -> `
{ or [ -> [
} or ] -> ]
| or \ -> \
: or ; -> ;
" or ' -> '
< or , -> ,
> or . -> .
? or / -> /
space -> space
newline -> enter
tab -> tab
ASCII letters -> lowercase letter
otherwise -> character itself
```

## 13. Daily Practice Target Generation

Default daily target:

```text
target_minutes = 20
```

Comprehensive module base sequence:

```text
[
  foundation/foundation_input/foundation_mix,
  common_words/everyday_english/everyday_mix,
  symbols/programming_basics/programming_basics_mix,
  code_block/code_practice/code_mix
]
```

Module readiness uses recent 21-day adaptive-module records only.

Stable module:

```text
completed_samples >= 3
typed_len >= 180
accuracy >= 97
error_rate <= 2.5
backspaces <= samples * 4
```

Weak module:

```text
samples >= 1
typed_len >= 20
and (
  accuracy < 92
  or error_rate >= 8
  or backspaces >= samples * 12
)
```

Skip module rule:

- Never skip `code_practice`.
- Skip a non-code module only if:
  - stable,
  - not weak,
  - and the current plan has no focus for that module.
- If filtering leaves fewer than 3 modules, use the full base sequence.

Estimated minutes:

- Code practice stable: `3`.
- Otherwise: `4`.

When starting a comprehensive lesson, refresh its target from all records
including lessons completed earlier in the same run. If refresh fails, use the
stored target.

## 14. Foundation Target Generation

Foundation drill selection for weak keys:

```text
if focus key includes ; ' / , . ` - = -> punctuation-edges
else if top-row key -> top-row
else if bottom-row key -> bottom-row
else if index-finger key -> index-fingers
else if pinky key -> pinky-fingers
else -> home-row
```

Standalone foundation drill:

- Pick selected `foundation_drills[id]`.
- Avoid lines recently used with source `keyloop:foundation:<id>`.
- If remaining pool has fewer lines than requested, reuse full drill pool.
- Shuffle and truncate.
- Standalone line count: `12`.

Foundation mix:

- Pick drill from focus keys.
- Line count:
  - recent history: `8`
  - no history: `6`
- Prepend `4` warmup lines.
- Source: `keyloop:module:foundation-mix:<drill_id>`.

## 15. Everyday English Target Generation

Everyday scopes:

```text
Common500 -> source slug common-500, tier <= 2
Common1000 -> source slug common-1000, tier <= 3
Common5000 -> source slug common-5000, tier <= 5
Sentences -> sentences
Mix -> mix
```

Word target:

- Pool = everyday words with `tier <= scope.tier_limit`.
- Fill from `common_words` until `word_count` if needed.
- Shuffle.
- Truncate to `word_count`.
- Text is one space-separated line.
- Source:
  `keyloop:module:everyday-english:<scope>:words-<word_count>`.

Sentence target:

- Pool = everyday sentences matching selected sentence length, or all if
  length is `"mixed"`.
- Shuffle.
- Truncate to `6`.
- Text is newline-separated.

Everyday mix:

- Start from `plan.focus_words` that appear in everyday/common corpus.
- Fill from everyday corpus words, or `common_words` fallback.
- Per-line word count:
  - comprehensive: `8`
  - standalone: `10`
  - review: `6`
- If `include_phrases`, add up to 2 phrase lines, 3 phrases per line.
- Add sentence count:
  - comprehensive: `3`
  - standalone: `5`
  - review: `2`
- Source:
  `keyloop:module:everyday-english:words-<word_count>:sentences-<length>`.

Word meanings:

- Only shown for standalone everyday word scopes.
- Current built-in map covers selected common words.
- TS migration may keep this small hardcoded map first.

## 16. Programming Basics Target Generation

Programming basics standalone entries:

1. Number symbols
2. Operators/brackets/quotes
3. Naming and case
4. Technical terms
5. Programming basics mix

Number symbols:

- Add 4 number drill items.
- Add 12 generic symbol items.
- Chunk 6 items per line.
- Mode: `symbols`.

Operators/brackets/quotes:

- Add 8 language/framework-specific symbol items.
- Fill from generic symbols to 18.
- Chunk 6 items per line.
- Mode: `symbols`.

Naming:

- Use `build_lesson_naming`.
- Mode: `case`.

Technical terms:

- Use `build_lesson_words`.
- Mode: `words`.

Programming basics mix:

- Include recent feedback terms from last 4 records:
  - error tokens
  - slow tokens
  - error keys
- Unique and truncate to 12.
- Then append symbols, naming, and words targets.
- Mode: `symbols`.
- Source: `keyloop:module:programming-basics-mix`.

Technical word lesson:

- Start with unique `plan.focus_words`.
- Fill from `programming_words` to 16.
- Truncate to 16.
- Chunk 4 per line.

Symbol lesson:

- Start with unique `plan.focus_symbols`.
- Add up to 6 matching language/framework symbol lines.
- Fill from generic `symbols` to 18.
- Add 2 number drills.
- Truncate to 26.
- Chunk 5 per line.

Naming lesson:

- Start with `focus_naming_lines(plan.focus_words)`.
- Fill from `naming` to 5 lines.
- Truncate to 5.

Identifier splitting:

- Split on non-ASCII-alphanumeric.
- Split lower-to-upper camel boundary.
- Split digit/letter boundary.
- Split acronym boundary where uppercase followed by uppercase then lowercase.
- Lowercase parts.

Naming variants:

```text
original
camelCase(parts)
PascalCase(parts)
get + PascalCase(parts)
CONSTANT_CASE(parts)
```

## 17. Long Word Breakdown Feature

This is a new training feature for the user's current problem: long technical
words are slow because the word form is not yet automatic.

Placement:

- Add standalone entry under Everyday practice: "Long word breakdown".
- Add standalone entry under Programming basics: "Technical long words".
- In comprehensive practice, do not add a fixed extra stage. Instead, inject
  long-word breakdown lines into Everyday English or Programming Basics when
  due items exist.

Target generator:

```ts
interface LongWordBreakdownOptions {
  profile: MixProfile;
  domain?: "everyday" | "workplace" | "programming" | "web3";
  maxItems: number;
}
```

Selection order:

1. Personal vocabulary entries with `parts`.
2. Current `plan.focus_words` that can be split into parts.
3. Built-in `content/long_words.json`.
4. Hardcoded fallback: `internationalization`, `accessibility`,
   `authentication`, `authorization`, `configuration`, `initialization`,
   `serialization`, `synchronization`, `compatibility`, `performance`.

One entry expands to this pattern:

```text
<part1> <part2> [part3]
<part1><part2>[part3] <part1><part2>[part3]
<alias> <word>        # only if alias exists, e.g. i18n internationalization
```

Examples:

```text
international ization
internationalization internationalization
i18n internationalization

authentic ation
authentication authentication

access ibility
accessibility accessibility
a11y accessibility
```

For identifiers, also include naming forms:

```text
internationalization
Internationalization
loadInternationalization
internationalizationConfig
```

Scoring and feedback:

- The full word remains a word token.
- Parts also appear as word tokens, so token stats can reveal whether the user
  is slow on the parts or only on the final combined word.
- Source should include the word:
  `keyloop:module:word-breakdown:<word>`.

Comprehensive injection:

- If due personal vocabulary or long-word entries exist, inject 2-6 breakdown
  entries into:
  - Everyday mix for everyday/workplace domains.
  - Programming basics mix for programming/web3 domains.
- Keep the module group count unchanged.
- Do not exceed existing group length by more than roughly 30 percent.

## 18. Programmer Common Non-Keyword Feature

This is not a new module. It is a content and selection improvement to
Programming Basics technical terms.

Examples:

```text
active
archived
available
compatible
configuration
enabled
initialization
pending
performance
preference
selected
serialized
subscription
synchronization
visible
```

Rules:

- Store in `content/programming_words.json` or a new curated
  `content/programming_terms.json` that is merged into `programming_words`.
- Keep terms original and project-authored.
- Use the existing `build_lesson_words` path first.
- In comprehensive, these terms appear through `focus_words`,
  `programming_basics_mix`, and the long-word breakdown injector.

Recommended extension:

```ts
interface ProgrammingTermEntry {
  text: string;
  category:
    | "state"
    | "data"
    | "async"
    | "ui"
    | "security"
    | "web3"
    | "tooling";
  parts?: string[];
  aliases?: string[];
  source_id: string;
}
```

The first TS migration can keep the current flat JSON and add structured terms
later.

## 19. Code Practice Contract

Code snippet extraction:

- Walk explicit repo only.
- Respect `.gitignore`, `.git/info/exclude`, and ignore files.
- Include hidden files.
- Skip unsupported extensions.
- Skip files larger than `200_000` bytes.
- Skip unreadable/non-UTF-8 files.
- Supported extensions:
  `rs`, `ts`, `tsx`, `js`, `jsx`, `mjs`, `cjs`, `py`, `go`, `java`, `rb`,
  `php`, `swift`, `kt`, `css`, `scss`, `sass`, `less`, `html`, `vue`, `svelte`,
  `sol`.
- Skip `.min.js`, lockfiles, and common package lock files.

Candidate line:

- Trimmed length between 12 and 140.
- Not starting with `//`, `/*`, `*`, or `#`.
- Has a code signal:
  `const`, `let`, `var`, `function`, `return`, `import`, `export`, `if`, `for`,
  `while`, `=>`, `useState`, `useEffect`, `className`, `async`, `await`.
- Or contains at least 4 of `(){}[]<>=!&|_.`.

Block capture:

- If a candidate opens a block/callback:
  - line ends with `{`, or contains `=>`, or contains `function`
  - capture at most 14 lines
  - track brace and paren balance
  - stop after balance <= 0 and trimmed line ends with `}`, `};`, or `);`
  - stop at blank line after capture has started
  - only keep captured block if character length <= 240 and ASCII
- Otherwise keep the single ASCII candidate line.

Indent normalization:

- Trim trailing whitespace from each line.
- Compute minimum leading whitespace among non-empty lines.
- Strip that many leading characters from each line.
- Preserve relative indentation.

Snippet scoring:

```text
len = character count
symbol_count = non-alphanumeric, non-whitespace characters
lines = line count
score = len / 8 + symbol_count * 2 + lines * 4

score <= 16 -> easy
score <= 34 -> medium
otherwise -> hard
```

Candidate filtering:

- Practice code block must be ASCII and have at least 2 non-empty lines.
- Filter by selected level if present.
- If no tag filters, match all.
- If `match_any`, match any selected language/framework/project.
- Otherwise all provided single/multi filters must match.

Picking:

1. Build candidates matching config, excluded texts, and optional difficulty.
2. If too few and difficulty was requested, retry without difficulty.
3. Shuffle candidates.
4. Sort by count of focus terms contained in snippet text, descending.
5. If focus exists, first pick snippets containing focus terms.
6. Fill remaining slots from candidates without duplicates.

Code difficulty from recent code records:

```text
weighted_accuracy =
  sum(record.accuracy * max(record.typed_len, 1))
  / sum(max(record.typed_len, 1))

weighted_wpm =
  sum(record.wpm * max(record.duration_ms, 1))
  / sum(max(record.duration_ms, 1))

error_rate =
  total_errors / total_typed * 100

if accuracy >= 97 and wpm >= 24 and error_rate <= 3 -> hard
else if accuracy >= 94 and wpm >= 16 and error_rate <= 6 -> medium
else -> easy
```

Comprehensive code practice:

- If repo snippets exist, pick 3 from repo first.
- Fill from built-in corpus to 3 if needed.
- If no repo snippets, pick 4 built-in snippets.
- Exclude previously used code texts from current records and earlier generated
  lessons in the same plan build.
- Source:
  - repo only: repo path
  - repo plus fallback: `<repo> + keyloop:fallback-code`
  - built-in: `keyloop:code-corpus`
  - scan failure: `keyloop:code-corpus (repo scan failed: <error>)`

Standalone code practice:

- Pick 4 snippets.
- Level options:
  - block
  - function
  - file
  - random mixed
- Random mixed chooses one of block/function/file and optionally one selected
  code preference.

## 20. Input and Running-Session Behavior

The TS/OpenTUI UI can be redesigned, but these input semantics must stay.

Running input:

- Ignore non-key-press events.
- `Ctrl+C`: quit the TUI loop.
- `Ctrl+P`: pause/resume.
- `Esc` while running: pause and open exit confirmation.
- `Enter`: insert newline.
- `Tab`: insert tab.
- `Backspace`: remove one character if input is not empty and record a
  backspace event.
- ASCII `Char(ch)`: insert character unless Ctrl or Alt is held.
- Non-ASCII chars are ignored and counted in UI state only.
- If input length reaches target length, complete the lesson.

Key event on insert:

```text
position = current input length before insert
expected = target_chars[position]
input = inserted char
correct = expected == input
at_ms = active elapsed milliseconds
```

Backspace event:

```text
position = input length after pop
expected = target_chars[position]
input = null
correct = false
```

Code auto-indent:

- Only in `mode == "code"`.
- After a correct newline insert, automatically insert target spaces while:
  - input length < target length
  - next target char is a space
- Auto-inserted spaces are recorded as:
  - action: `auto_indent`
  - expected: space
  - input: space
  - correct: true
- Auto-indent events affect saved `correct_chars` behavior but are ignored in
  key aggregates.

Pause behavior:

- `started` is wall-clock start.
- `paused_total` accumulates completed pauses.
- `paused_at` tracks current pause.
- `active_elapsed = now - started - paused_total - current_pause`.
- Saved `duration_ms` is active elapsed.
- Saved `manual_pause_ms` is accumulated completed pause time.

Completion behavior:

- On full completion:
  - build a completed `SessionRecord`
  - append to `sessions.jsonl`
  - clear checkpoint
  - force flush key stats
  - push into in-memory completed records
  - mark comprehensive lesson index complete
  - show complete page
- On partial save:
  - save only if input is non-empty
  - completion state is `partial`
  - append to `sessions.jsonl`
  - clear checkpoint
  - quit

## 21. Report and Stats Contract

CLI today report:

- Uses local date.
- If no records today, show recommendation and `keyloop start`.
- Totals:
  - `duration_ms`: sum `record.duration_ms`
  - `active_ms`: sum `record.active_ms || record.duration_ms`
  - `idle_ms`: sum `record.idle_ms`
  - `manual_pause_ms`: sum `record.manual_pause_ms`
  - `typed_len`: sum `record.typed_len || max(user_input.length, correct_chars)`
  - `correct_chars`: sum `record.correct_chars`
  - errors/backspaces: sums
- WPM:
  `correct_chars / 5 / (active_ms / 60000)`
- Raw WPM:
  `typed_len / 5 / (active_ms / 60000)`
- Accuracy:
  - if typed_len > 0, weighted by typed length from per-record accuracy.
  - else if target_len == 0, `0`.
  - else `correct_chars / target_len * 100`.
- Split comprehensive vs standalone by whether `daily_run_id` is non-empty.

Problem token report score:

```text
top_problem_tokens:
  score += errors * 1000 + start_delay_ms + duration_ms / 2

top_slow_tokens:
  score += start_delay_ms + duration_ms / 2 + errors * 750
```

Report token aggregate score:

```text
avg_delay + avg_duration / 2 + errors * 250
```

TUI stats pages:

1. Overview
2. Today
3. Comprehensive runs
4. Modules
5. Keys
6. Tokens
7. Code
8. Daily details

Aggregate WPM:

```text
sum(correct_chars) / 5 / (sum(effective_active_ms) / 60000)
```

Weighted accuracy:

```text
sum(record.accuracy * effective_typed_len(record))
/ sum(effective_typed_len(record))
```

Module error rate:

```text
sum(error_count) / sum(target_len) * 100
```

Keyboard heatmap uses the same key bucket mapping as the planner.

## 22. OpenTUI Architecture

OpenTUI-specific code should only own:

- renderer setup and teardown
- screen/layout components
- keyboard event mapping
- focus/menu state
- visual styling
- route/page rendering

Training core should own:

- targets
- plans
- metrics
- records
- preferences
- reports
- content loading

Recommended runtime:

- Bun for development and package scripts.
- TypeScript strict mode.
- Zod or equivalent runtime schema validation for JSON storage and content.
- Vitest or Bun test for headless logic.

Recommended package layout:

```text
src/
  cli.ts
  main.ts
  domain/
    model.ts
    defaults.ts
  storage/
    keyloopStore.ts
    json.ts
  content/
    library.ts
    snippets.ts
    generated.ts
  training/
    metrics.ts
    tokenization.ts
    plan.ts
    targets.ts
    feedback.ts
    wordBreakdown.ts
    personalVocabulary.ts
  report/
    report.ts
    stats.ts
  ui/
    opentui/
      app.ts
      screens/
      components/
      keymap.ts
      copy.ts
```

## 23. Migration Phases

Phase 0: Spike

- Build a minimal OpenTUI typing screen.
- Load one hardcoded `PracticeTarget`.
- Capture input events.
- Show live WPM, raw WPM, accuracy, errors, backspaces.
- Save a compatible `SessionRecord` to a temp `KEYLOOP_HOME`.

Pass criteria:

- Saved record matches Rust semantics for the same key event fixture.
- Pause and auto-indent behavior are understood.
- OpenTUI input events are precise enough for per-key stats.

Phase 1: Headless TS core

- Port domain models, storage, metrics, tokenization, feedback, plan, content
  loading, target generation, snippet extraction, and report functions.
- Keep UI minimal.

Pass criteria:

- Golden fixtures from Rust pass in TS.
- Existing `~/.keyloop` records can be loaded.
- Built-in content counts match current repo counts.

Phase 2: OpenTUI app shell

- Implement menu, setup screens, running screen, complete page, summary page,
  settings, and stats pages.
- Keep state machine behavior compatible.

Pass criteria:

- Manual flow can complete comprehensive practice.
- `daily_runs.json` reuse works.
- `key_stats.json` updates during practice.

Phase 3: Feature parity

- Implement all current CLI commands.
- Implement code filters, pinned filters, global filters.
- Implement import preview and source catalog report.
- Implement everyday word-count and sentence-length switching.

Phase 4: New word-form features

- Add `content/long_words.json`.
- Add `~/.keyloop/vocabulary.json`.
- Add CLI vocabulary operations.
- Add standalone long-word and personal-vocabulary practice.
- Inject due items into comprehensive practice.

Phase 5: Release decision

- Keep Rust binary as stable fallback until TS version passes parity tests.
- Switch Homebrew/release packaging only after TS install and smoke tests are
  stable on macOS/Linux.

## 24. Verification Plan

Golden tests to create before full migration:

1. `metrics.buildSessionRecord` fixture:
   - corrected mistake
   - start delay excluded
   - idle excess excluded
   - auto-indent correct count
2. `tokenization.tokenSpans` fixture:
   - words
   - `=>`
   - `!==`
   - template strings
   - brackets
3. `plan.buildPlan` fixture:
   - no history defaults
   - focus words
   - focus symbols
   - key hot spots
   - numbered template filtering
4. `targets.buildDailyPracticePlan` fixture:
   - base four modules
   - stable module reduction
   - weak module retention
   - minimum three modules fallback
5. `snippets` fixture:
   - extraction skips single-line code lessons
   - indentation normalization
   - difficulty classification
   - config filtering
6. `storage` fixture:
   - legacy session defaults
   - preferences round trip
   - daily run reuse and new run after completion
   - partial records do not complete run
7. New features:
   - personal vocabulary JSON round trip
   - long-word decomposition target generation
   - comprehensive injection limit

Recommended commands after TS implementation exists:

```bash
bun run typecheck
bun test
bun run lint
bun run build
KEYLOOP_HOME="$(mktemp -d)" bun run keyloop -- plan
KEYLOOP_HOME="$(mktemp -d)" bun run keyloop -- report today
```

Package shortcuts:

```bash
bun run verify:migration
bun run verify:all
```

Keep Rust validation during parity work:

```bash
cargo fmt --check
cargo test --locked --all-targets
cargo clippy --locked -- -D warnings
cargo run --locked -- plan
```

## 25. Source References

The migration contract above was derived from:

- `README.md`
- `docs/content/CATALOG.md`
- `src/model.rs`
- `src/storage.rs`
- `src/metrics.rs`
- `src/plan.rs`
- `src/content/library.rs`
- `src/content/mod.rs`
- `src/content/snippets.rs`
- `src/feedback.rs`
- `src/report.rs`
- `src/trainer/mod.rs`
- `src/trainer/stats.rs`
- `src/cli.rs`
- `src/main.rs`
- `tools/build_foundation_content.py`
- `tools/build_generated_code_corpus.py`
