mod cli;
mod content;
mod metrics;
mod model;
mod plan;
mod report;
mod storage;
mod trainer;

use anyhow::Result;
use clap::Parser;
use cli::{Cli, Command, ReportScope};
use model::{Language, Mode};
use std::env;
use std::path::PathBuf;

fn main() -> Result<()> {
    let cli = Cli::parse();
    let language = cli.language;

    match cli.command {
        Some(Command::Start { mode, repo }) => start(mode, language, repo)?,
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
        None => start(Mode::Chars, language, None)?,
    }

    Ok(())
}

fn start(_mode: Mode, language: Language, repo: Option<PathBuf>) -> Result<()> {
    let repo = repo.unwrap_or(env::current_dir()?);
    let records = storage::load_sessions()?;
    let plan = plan::build_plan(&records, language);
    let daily_plan = content::build_daily_practice_plan(&records, &repo, &plan)?;
    let completed = trainer::run(daily_plan, records, language)?;

    if completed.is_empty() {
        match language {
            Language::Zh => println!("没有完成的练习记录，未保存。"),
            Language::En => println!("No completed sessions were saved."),
        }
    } else {
        let mut last_saved = None;
        for record in &completed {
            let saved_to = storage::append_session(record)?;
            last_saved = Some((record, saved_to));
        }
        if let Some((record, saved_to)) = last_saved {
            println!("{}", report::session_summary(record, &saved_to, language));
            if completed.len() > 1 {
                match language {
                    Language::Zh => println!("\n已保存 {} 次练习。", completed.len()),
                    Language::En => println!("\nSaved {} sessions.", completed.len()),
                }
            }
        }
    }

    Ok(())
}
