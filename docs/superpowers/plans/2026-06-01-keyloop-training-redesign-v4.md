# KeyLoop Training Redesign V4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add clean everyday English and workplace English corpora with source metadata, then integrate them into standalone and comprehensive everyday practice.

**Architecture:** Keep existing `common_words.json` and `word_chunks.json` usable for compatibility, but add a new structured corpus file `content/everyday_english.json` for V4 material. Load the structured corpus through `src/content/library.rs`, make `everyday_english_mix` prefer that corpus for words, phrases, and sentences, and extend the existing `keyloop sources` report so non-code corpora are visible alongside code sources.

**Tech Stack:** Rust 2024, serde/serde_json, existing `content/*.json`, clap CLI, ratatui TUI.

---

## File Structure

- Create `content/everyday_english.json`: structured KeyLoop-authored clean corpus with source metadata and entries.
- Modify `src/content/library.rs`: add `EverydayCorpusSource`, `EverydayCorpusEntry`, and load/validate the new corpus.
- Modify `src/content/mod.rs`: make everyday English generation use tiered words, phrases, and short/medium/long sentences from the new corpus.
- Modify `src/report.rs`: make source reports say "corpus sources" and render non-code corpus metadata.
- Modify `tests/cli_commands.rs`: assert `keyloop sources` includes the everyday corpus provenance.
- Modify `docs/content/CATALOG.md`, `README.md`, `README.en.md`, and roadmaps only for concise user-facing documentation.

## Task 1: Structured Everyday Corpus Loader

**Files:**
- Create: `content/everyday_english.json`
- Modify: `src/content/library.rs`
- Modify: `src/content/mod.rs`

- [ ] **Step 1: Write failing loader tests**

Add tests in `src/content/mod.rs`:

```rust
#[test]
fn everyday_corpus_entries_have_source_metadata() {
    let library = library::load().expect("content json should load");

    assert!(library.everyday_english.entries.len() >= 80);
    for entry in &library.everyday_english.entries {
        assert!(!entry.text.trim().is_empty());
        assert!(library
            .everyday_english
            .sources
            .iter()
            .any(|source| source.source_id == entry.source_id));
    }
    for source in &library.everyday_english.sources {
        assert!(!source.source_name.trim().is_empty());
        assert!(!source.source_url.trim().is_empty());
        assert!(!source.license.trim().is_empty());
        assert!(!source.generation_script.trim().is_empty());
        assert!(!source.included_fields.is_empty());
    }
}
```

- [ ] **Step 2: Run red test**

Run:

```bash
cargo test --locked content::tests::everyday_corpus_entries_have_source_metadata
```

Expected: FAIL because `everyday_english` does not exist on `ContentLibrary`.

- [ ] **Step 3: Add corpus structs and loader**

In `src/content/library.rs`, add:

```rust
#[derive(Debug, Clone, serde::Deserialize)]
pub struct EverydayEnglishCorpus {
    pub sources: Vec<EverydayCorpusSource>,
    pub entries: Vec<EverydayCorpusEntry>,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct EverydayCorpusSource {
    pub source_id: String,
    pub source_name: String,
    pub source_url: String,
    pub license: String,
    pub retrieved_at: String,
    pub generation_script: String,
    pub included_fields: Vec<String>,
    pub notes: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct EverydayCorpusEntry {
    pub text: String,
    pub kind: EverydayEntryKind,
    pub tier: Option<u8>,
    pub length: Option<EverydaySentenceLength>,
    pub domain: EverydayEntryDomain,
    pub source_id: String,
}
```

Add enums `EverydayEntryKind` and `EverydayEntryDomain` with `#[serde(rename_all = "snake_case")]`.

Add `everyday_english: EverydayEnglishCorpus` to `ContentLibrary` and load it with:

```rust
everyday_english: load_json_records_or_struct(
    "everyday_english",
    include_str!("../../content/everyday_english.json"),
)?,
```

Use the existing generic JSON loader pattern.

- [ ] **Step 4: Add clean corpus JSON**

Create `content/everyday_english.json`:

```json
{
  "sources": [
    {
      "source_id": "keyloop:everyday-english:hand-authored",
      "source_name": "KeyLoop hand-authored everyday English corpus",
      "source_url": "keyloop://content/everyday_english.json",
      "license": "MIT",
      "retrieved_at": "2026-06-01",
      "generation_script": "manual-curation",
      "included_fields": ["text", "kind", "tier", "length", "domain", "source_id"],
      "notes": "Project-authored practice material; no Monkeytype/keybr/book corpus text copied."
    }
  ],
  "entries": [
    {"text": "about", "kind": "word", "tier": 1, "length": null, "domain": "everyday", "source_id": "keyloop:everyday-english:hand-authored"}
  ]
}
```

The actual file should contain at least 80 entries across words, phrases, short sentences, medium sentences, long sentences, and workplace sentences.

- [ ] **Step 5: Run loader tests**

Run:

```bash
cargo test --locked content::tests::everyday_corpus_entries_have_source_metadata
```

Expected: PASS.

## Task 2: Everyday English Generator Uses Corpus

**Files:**
- Modify: `src/content/mod.rs`

- [ ] **Step 1: Write failing generator tests**

Add:

```rust
#[test]
fn everyday_mix_uses_sentence_length_setting_from_clean_corpus() {
    let library = library::load().expect("library loads");
    let target = everyday_english_mix(
        &PracticePlan::default_for_test(),
        &library,
        EverydayEnglishSettings {
            word_count: 25,
            sentence_length: EverydaySentenceLength::Short,
            include_phrases: true,
        },
        MixProfile::Standalone,
    );

    assert!(target.source.contains("sentences-short"));
    assert!(target.text.lines().any(|line| line.contains(".")));
}
```

If `PracticePlan::default_for_test()` does not exist, inline the existing fixture style from `everyday_mix_honors_word_count_setting`.

- [ ] **Step 2: Run red test**

Run:

```bash
cargo test --locked content::tests::everyday_mix_uses_sentence_length_setting_from_clean_corpus
```

Expected: FAIL because V1 mix does not read sentence corpus.

- [ ] **Step 3: Implement corpus selection helpers**

Add helpers in `src/content/mod.rs`:

```rust
fn everyday_words(library: &ContentLibrary, tier_limit: u8) -> Vec<String>
fn everyday_phrases(library: &ContentLibrary) -> Vec<String>
fn everyday_sentences(library: &ContentLibrary, length: EverydaySentenceLength) -> Vec<String>
```

`Mixed` should combine all sentence lengths. Preserve fallback to `common_words` and `word_chunks` if the structured corpus is empty.

- [ ] **Step 4: Update `everyday_english_mix`**

Use corpus words first, then focus words that exist in either corpus words or old common words. Include phrases only when enabled. Include sentence lines according to `settings.sentence_length`.

Set the source string to include word count and sentence length:

```rust
keyloop:module:everyday-english:words-25:sentences-short
```

- [ ] **Step 5: Run generator tests**

Run:

```bash
cargo test --locked content::tests::everyday_mix_honors_word_count_setting content::tests::everyday_mix_uses_sentence_length_setting_from_clean_corpus
```

Expected: PASS.

## Task 3: Source Provenance Report

**Files:**
- Modify: `src/content/library.rs`
- Modify: `src/report.rs`
- Modify: `tests/cli_commands.rs`

- [ ] **Step 1: Write failing source report tests**

Add in `tests/cli_commands.rs`:

```rust
assert!(stdout.contains("keyloop:everyday-english:hand-authored"));
assert!(stdout.contains("manual-curation"));
assert!(!stdout.to_ascii_lowercase().contains("monkeytype"));
assert!(!stdout.to_ascii_lowercase().contains("keybr"));
```

- [ ] **Step 2: Run red CLI test**

Run:

```bash
cargo test --locked --test cli_commands sources_command_lists_corpus_provenance
```

Expected: FAIL until `source_catalog()` includes everyday corpus sources.

- [ ] **Step 3: Extend source catalog entries**

Extend `SourceCatalogEntry` with serde-default fields:

```rust
#[serde(default)]
pub source_name: String,
#[serde(default)]
pub source_url: String,
#[serde(default)]
pub corpus: String,
#[serde(default)]
pub generation_script: String,
#[serde(default)]
pub included_fields: Vec<String>,
```

Make `source_catalog()` load code sources and append everyday corpus sources converted into `SourceCatalogEntry`.

- [ ] **Step 4: Update source report wording**

Change `source_catalog_report` title from "code corpus sources" to "corpus sources" while preserving code entries.

- [ ] **Step 5: Run source tests**

Run:

```bash
cargo test --locked --test cli_commands sources_command_lists_corpus_provenance
```

Expected: PASS.

## Task 4: Documentation

**Files:**
- Modify: `docs/content/CATALOG.md`
- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/ROADMAP.en.md`

- [ ] **Step 1: Update catalog**

Document `content/everyday_english.json` and its metadata fields.

- [ ] **Step 2: Update README storage/content notes**

Mention everyday English corpus and source policy without adding long legal text.

- [ ] **Step 3: Run docs grep**

Run:

```bash
rg -n "everyday_english|Monkeytype|keybr|source metadata" README.md README.en.md docs/content/CATALOG.md docs/ROADMAP.md docs/ROADMAP.en.md
```

Expected: docs mention the new corpus and license boundary.

## Task 5: Final Verification

Run:

```bash
cargo fmt --check
cargo test --locked --all-targets
cargo clippy --locked -- -D warnings
cargo run --locked -- sources
cargo run --locked -- plan
cargo install --path . --locked --debug --force
/Users/luwei/.cargo/bin/keyloop sources | sed -n '1,24p'
```

Expected: all checks pass, `sources` lists the everyday English corpus provenance, and local binary is replaced.

## Self-Review Notes

- Do not copy Monkeytype/keybr corpora, generated models, or book text.
- The first corpus can be KeyLoop-authored and modest; V5 can improve adaptivity, and future V4 increments can add permissively licensed external sources.
- Keep existing `common_words.json` as fallback so old tests and generation behavior remain stable.
