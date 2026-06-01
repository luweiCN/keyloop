mod cli;
mod content;
mod feedback;
mod metrics;
mod model;
mod plan;
mod report;
mod storage;
mod trainer;

use anyhow::Result;
use clap::Parser;
use cli::{Cli, Command, ReportScope};
use model::{CodePracticeConfig, CodePracticeFacet, Language, Mode, UserPreferences};
use std::path::PathBuf;

fn main() -> Result<()> {
    let cli = Cli::parse();
    let language = cli.language;

    match cli.command {
        Some(Command::Start {
            mode,
            repo,
            code_language,
            code_framework,
            code_project,
        }) => start(
            mode,
            language,
            repo,
            CodePracticeConfig {
                language: code_language,
                framework: code_framework,
                project: code_project,
                ..CodePracticeConfig::default()
            },
        )?,
        Some(Command::Report { scope }) => match scope.unwrap_or(ReportScope::Today) {
            ReportScope::Today => {
                let records = storage::load_sessions()?;
                let plan = plan::build_plan(&records, language);
                println!("{}", report::today_report(&records, &plan, language));
            }
        },
        Some(Command::Plan) => {
            let records = storage::load_sessions()?;
            let plan = plan::build_plan(&records, language);
            println!("{}", report::plan_report(&plan, language));
        }
        Some(Command::Import { path }) => {
            let snippets = content::extract_snippets(&path)?;
            println!("{}", report::import_preview(&path, &snippets, language));
        }
        Some(Command::Sources) => {
            let sources = content::source_catalog()?;
            println!("{}", report::source_catalog_report(&sources, language));
        }
        None => start(Mode::Chars, language, None, CodePracticeConfig::default())?,
    }

    Ok(())
}

fn start(
    _mode: Mode,
    _language: Language,
    repo: Option<PathBuf>,
    code_config: CodePracticeConfig,
) -> Result<()> {
    let records = storage::load_sessions()?;
    let preferences = storage::load_preferences()?;
    let language = preferences.interface_language;
    let effective_code_config = if code_config.is_empty() {
        code_config_from_preferences(&preferences)
    } else {
        code_config
    };
    let plan = plan::build_plan(&records, language);
    let fresh_daily_plan = content::build_daily_practice_plan(
        &records,
        repo.as_deref(),
        &plan,
        &effective_code_config,
    )?;
    let daily_plan = storage::load_or_create_daily_practice_plan(fresh_daily_plan, &records)?;
    let run_result = trainer::run(daily_plan, records, language)?;

    if run_result.completed_records.is_empty() {
        match language {
            Language::Zh => println!("没有完成的练习记录，未保存。"),
            Language::En => println!("No completed sessions were saved."),
        }
    } else if let (Some(record), Some(saved_to)) = (
        run_result.completed_records.last(),
        run_result.last_saved_to.as_ref(),
    ) {
        println!("{}", report::session_summary(record, saved_to, language));
        if run_result.completed_records.len() > 1 {
            match language {
                Language::Zh => {
                    println!("\n已保存 {} 次练习。", run_result.completed_records.len())
                }
                Language::En => {
                    println!("\nSaved {} sessions.", run_result.completed_records.len())
                }
            }
        }
    }

    Ok(())
}

fn code_config_from_preferences(preferences: &UserPreferences) -> CodePracticeConfig {
    let mut config = CodePracticeConfig {
        match_any: true,
        ..CodePracticeConfig::default()
    };
    for filter in &preferences.global_code_filters {
        match filter.facet {
            CodePracticeFacet::Language => config.languages.push(filter.value.clone()),
            CodePracticeFacet::Framework => config.frameworks.push(filter.value.clone()),
            CodePracticeFacet::Project => config.projects.push(filter.value.clone()),
        }
    }
    config
}
