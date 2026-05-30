use crate::model::{Language, Mode};
use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Debug, Parser)]
#[command(name = "keyloop")]
#[command(about = "KeyLoop：程序员终端打字训练 / terminal typing practice for programmers")]
pub struct Cli {
    /// 界面语言 / interface language.
    #[arg(long, global = true, value_enum, default_value_t = Language::Zh)]
    pub language: Language,

    #[command(subcommand)]
    pub command: Option<Command>,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// 开始实时打字练习 / start a realtime typing session.
    Start {
        /// 兼容旧命令；当前由今日计划自动决定练习内容。
        #[arg(value_enum, default_value_t = Mode::Chars, hide = true)]
        mode: Mode,

        /// 扫描代码片段的仓库或目录 / repository or source directory to scan.
        #[arg(short, long)]
        repo: Option<PathBuf>,

        /// 代码练习语言过滤，例如 typescript、javascript、solidity、rust。
        #[arg(long)]
        code_language: Option<String>,

        /// 代码练习框架过滤，例如 react、vue、nestjs、evm、web。
        #[arg(long)]
        code_framework: Option<String>,

        /// 代码练习项目过滤，例如本地仓库名或内置 keyloop-builtin。
        #[arg(long)]
        code_project: Option<String>,
    },

    /// 查看练习报告 / show practice reports.
    Report {
        #[command(subcommand)]
        scope: Option<ReportScope>,
    },

    /// 根据本地历史生成下一轮计划 / generate the next plan.
    Plan,

    /// 预览从仓库提取的代码片段 / preview extracted snippets.
    Import {
        /// 要扫描的仓库或目录 / repository or source directory to scan.
        path: PathBuf,
    },

    /// 查看推荐代码语料来源 / list recommended code corpus sources.
    Sources,
}

#[derive(Debug, Subcommand)]
pub enum ReportScope {
    Today,
}
