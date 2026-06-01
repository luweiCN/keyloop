use super::snippets::BuiltinCodeSnippet;
use crate::model::EverydaySentenceLength;
use anyhow::{Context, Result};
use std::collections::HashSet;

const USER_EVERYDAY_CORPUS_ENV: &str = "KEYLOOP_EVERYDAY_CORPUS";

#[derive(Debug, Clone)]
pub struct ContentLibrary {
    pub warmup: Vec<String>,
    pub foundation_drills: Vec<FoundationDrill>,
    pub word_chunks: Vec<String>,
    pub common_words: Vec<String>,
    pub everyday_english: EverydayEnglishCorpus,
    pub programming_words: Vec<String>,
    pub symbols: Vec<String>,
    pub language_symbols: Vec<LanguageSymbolSet>,
    pub number_drills: Vec<String>,
    pub naming: Vec<String>,
    pub code_snippets: Vec<BuiltinCodeSnippet>,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct FoundationDrill {
    pub id: String,
    pub title_zh: String,
    pub title_en: String,
    pub hint_zh: String,
    pub hint_en: String,
    pub items: Vec<String>,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct LanguageSymbolSet {
    pub language: Option<String>,
    pub framework: Option<String>,
    pub items: Vec<String>,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct SourceCatalogEntry {
    pub source_id: String,
    pub repo: String,
    pub repo_url: String,
    pub license_spdx: String,
    pub retrieved_at: String,
    pub languages: Vec<String>,
    pub frameworks: Vec<String>,
    pub notes: String,
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
}

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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EverydayEntryKind {
    Word,
    Phrase,
    Sentence,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EverydayEntryDomain {
    Everyday,
    Workplace,
}

pub fn load() -> Result<ContentLibrary> {
    let everyday_english = load_everyday_english_corpus()?;

    Ok(ContentLibrary {
        warmup: load_json_list("warmup", include_str!("../../content/warmup.json"))?,
        foundation_drills: load_json_records(
            "foundation_drills",
            include_str!("../../content/foundation_drills.json"),
        )?,
        word_chunks: load_json_list(
            "word_chunks",
            include_str!("../../content/word_chunks.json"),
        )?,
        common_words: load_json_list(
            "common_words",
            include_str!("../../content/common_words.json"),
        )?,
        everyday_english,
        programming_words: load_json_list(
            "programming_words",
            include_str!("../../content/programming_words.json"),
        )?,
        symbols: load_json_list("symbols", include_str!("../../content/symbols.json"))?,
        language_symbols: load_json_records(
            "language_symbols",
            include_str!("../../content/language_symbols.json"),
        )?,
        number_drills: load_json_list(
            "number_drills",
            include_str!("../../content/number_drills.json"),
        )?,
        naming: load_json_list("naming", include_str!("../../content/naming.json"))?,
        code_snippets: load_code_snippets()?,
    })
}

pub fn source_catalog() -> Result<Vec<SourceCatalogEntry>> {
    let mut sources = load_json_records::<SourceCatalogEntry>(
        "source_catalog",
        include_str!("../../content/source_catalog.json"),
    )?;
    let everyday = load_everyday_english_corpus()?;
    sources.extend(everyday.sources.into_iter().map(SourceCatalogEntry::from));
    Ok(sources)
}

impl From<EverydayCorpusSource> for SourceCatalogEntry {
    fn from(source: EverydayCorpusSource) -> Self {
        Self {
            source_id: source.source_id,
            repo: source.source_name.clone(),
            repo_url: source.source_url.clone(),
            license_spdx: source.license,
            retrieved_at: source.retrieved_at,
            languages: vec!["english".to_string()],
            frameworks: vec!["everyday".to_string(), "workplace".to_string()],
            notes: source.notes,
            source_name: source.source_name,
            source_url: source.source_url,
            corpus: "everyday_english".to_string(),
            generation_script: source.generation_script,
            included_fields: source.included_fields,
        }
    }
}

fn load_json_list(name: &str, data: &str) -> Result<Vec<String>> {
    serde_json::from_str(data).with_context(|| format!("Could not load content/{name}.json"))
}

fn load_code_snippets() -> Result<Vec<BuiltinCodeSnippet>> {
    let mut snippets = Vec::new();
    for (name, data) in [
        ("code/react", include_str!("../../content/code/react.json")),
        ("code/vue", include_str!("../../content/code/vue.json")),
        (
            "code/nestjs",
            include_str!("../../content/code/nestjs.json"),
        ),
        (
            "code/solidity",
            include_str!("../../content/code/solidity.json"),
        ),
        ("code/rust", include_str!("../../content/code/rust.json")),
        ("code/web", include_str!("../../content/code/web.json")),
        ("code/css", include_str!("../../content/code/css.json")),
        (
            "code/generated/typescript",
            include_str!("../../content/code/generated/typescript.json"),
        ),
        (
            "code/generated/javascript",
            include_str!("../../content/code/generated/javascript.json"),
        ),
        (
            "code/generated/vue",
            include_str!("../../content/code/generated/vue.json"),
        ),
        (
            "code/generated/solidity",
            include_str!("../../content/code/generated/solidity.json"),
        ),
        (
            "code/generated/rust",
            include_str!("../../content/code/generated/rust.json"),
        ),
        (
            "code/generated/html",
            include_str!("../../content/code/generated/html.json"),
        ),
        (
            "code/generated/css",
            include_str!("../../content/code/generated/css.json"),
        ),
        (
            "code/generated/scss",
            include_str!("../../content/code/generated/scss.json"),
        ),
        (
            "code/generated/less",
            include_str!("../../content/code/generated/less.json"),
        ),
    ] {
        snippets.extend(load_json_records::<BuiltinCodeSnippet>(name, data)?);
    }
    Ok(snippets)
}

fn load_everyday_english_corpus() -> Result<EverydayEnglishCorpus> {
    let mut corpus = load_json_value::<EverydayEnglishCorpus>(
        "everyday_english",
        include_str!("../../content/everyday_english.json"),
    )?;
    if let Some(user_corpus) = load_user_everyday_english_corpus()? {
        merge_everyday_corpus(&mut corpus, user_corpus);
    }
    Ok(corpus)
}

fn load_user_everyday_english_corpus() -> Result<Option<EverydayEnglishCorpus>> {
    let Ok(path) = std::env::var(USER_EVERYDAY_CORPUS_ENV) else {
        return Ok(None);
    };
    let path = path.trim();
    if path.is_empty() {
        return Ok(None);
    }

    let data = std::fs::read_to_string(path)
        .with_context(|| format!("Could not read {USER_EVERYDAY_CORPUS_ENV}={path}"))?;
    let corpus = serde_json::from_str(&data)
        .with_context(|| format!("Could not load {USER_EVERYDAY_CORPUS_ENV}={path}"))?;
    Ok(Some(corpus))
}

pub(crate) fn merge_everyday_corpus(
    base: &mut EverydayEnglishCorpus,
    extra: EverydayEnglishCorpus,
) {
    let mut source_ids = base
        .sources
        .iter()
        .map(|source| source.source_id.clone())
        .collect::<HashSet<_>>();
    for source in extra.sources {
        if source_ids.insert(source.source_id.clone()) {
            base.sources.push(source);
        }
    }

    let mut entry_keys = base
        .entries
        .iter()
        .map(|entry| (entry.source_id.clone(), entry.kind, entry.text.clone()))
        .collect::<HashSet<_>>();
    for entry in extra.entries {
        let key = (entry.source_id.clone(), entry.kind, entry.text.clone());
        if entry_keys.insert(key) {
            base.entries.push(entry);
        }
    }
}

fn load_json_records<T>(name: &str, data: &str) -> Result<Vec<T>>
where
    T: serde::de::DeserializeOwned,
{
    serde_json::from_str(data).with_context(|| format!("Could not load content/{name}.json"))
}

fn load_json_value<T>(name: &str, data: &str) -> Result<T>
where
    T: serde::de::DeserializeOwned,
{
    serde_json::from_str(data).with_context(|| format!("Could not load content/{name}.json"))
}
