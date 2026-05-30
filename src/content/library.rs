use super::snippets::BuiltinCodeSnippet;
use anyhow::{Context, Result};

#[derive(Debug, Clone)]
pub struct ContentLibrary {
    pub warmup: Vec<String>,
    pub word_chunks: Vec<String>,
    pub common_words: Vec<String>,
    pub programming_words: Vec<String>,
    pub symbols: Vec<String>,
    pub number_drills: Vec<String>,
    pub naming: Vec<String>,
    pub code_snippets: Vec<BuiltinCodeSnippet>,
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
}

pub fn load() -> Result<ContentLibrary> {
    Ok(ContentLibrary {
        warmup: load_json_list("warmup", include_str!("../../content/warmup.json"))?,
        word_chunks: load_json_list(
            "word_chunks",
            include_str!("../../content/word_chunks.json"),
        )?,
        common_words: load_json_list(
            "common_words",
            include_str!("../../content/common_words.json"),
        )?,
        programming_words: load_json_list(
            "programming_words",
            include_str!("../../content/programming_words.json"),
        )?,
        symbols: load_json_list("symbols", include_str!("../../content/symbols.json"))?,
        number_drills: load_json_list(
            "number_drills",
            include_str!("../../content/number_drills.json"),
        )?,
        naming: load_json_list("naming", include_str!("../../content/naming.json"))?,
        code_snippets: load_code_snippets()?,
    })
}

pub fn source_catalog() -> Result<Vec<SourceCatalogEntry>> {
    load_json_records(
        "source_catalog",
        include_str!("../../content/source_catalog.json"),
    )
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
    ] {
        snippets.extend(load_json_records::<BuiltinCodeSnippet>(name, data)?);
    }
    Ok(snippets)
}

fn load_json_records<T>(name: &str, data: &str) -> Result<Vec<T>>
where
    T: serde::de::DeserializeOwned,
{
    serde_json::from_str(data).with_context(|| format!("Could not load content/{name}.json"))
}
