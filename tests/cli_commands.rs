use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::time::{SystemTime, UNIX_EPOCH};

struct TempHome {
    path: PathBuf,
}

impl TempHome {
    fn new(name: &str) -> Self {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after unix epoch")
            .as_nanos();
        let path =
            std::env::temp_dir().join(format!("keyloop-{name}-{}-{nonce}", std::process::id()));
        fs::create_dir_all(&path).expect("temp home should be created");
        Self { path }
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TempHome {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

fn keyloop(home: &TempHome, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_keyloop"))
        .args(args)
        .env("KEYLOOP_HOME", home.path())
        .output()
        .expect("keyloop command should run")
}

fn assert_success(output: Output) -> String {
    assert!(
        output.status.success(),
        "command failed\nstatus: {}\nstdout:\n{}\nstderr:\n{}",
        output.status,
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8(output.stdout).expect("stdout should be valid utf-8")
}

#[test]
fn help_command_runs_without_data_dir() {
    let home = TempHome::new("help");
    let stdout = assert_success(keyloop(&home, &["--help"]));

    assert!(stdout.contains("KeyLoop"));
    assert!(!home.path().join("sessions.jsonl").exists());
}

#[test]
fn plan_command_is_localized_and_uses_isolated_home() {
    let zh_home = TempHome::new("plan-zh");
    let zh_stdout = assert_success(keyloop(&zh_home, &["plan"]));

    assert!(zh_stdout.contains("下一轮 KeyLoop 计划"));
    assert!(zh_stdout.contains("每日目标: 20 分钟"));
    assert!(!zh_home.path().join("sessions.jsonl").exists());

    let en_home = TempHome::new("plan-en");
    let en_stdout = assert_success(keyloop(&en_home, &["--language", "en", "plan"]));

    assert!(en_stdout.contains("Next KeyLoop plan"));
    assert!(en_stdout.contains("Daily target: 20 minutes"));
    assert!(!en_home.path().join("sessions.jsonl").exists());
}

#[test]
fn report_today_reads_jsonl_from_keyloop_home() {
    let home = TempHome::new("report");
    let session = format!(
        r#"{{"started_at":"{}","mode":"words","source":"test:integration","duration_ms":60000,"target_text":"return response","user_input":"return response","target_len":15,"typed_len":15,"correct_chars":15,"wpm":30.0,"raw_wpm":30.0,"accuracy":100.0,"error_count":0,"backspace_count":0}}"#,
        chrono::Utc::now().to_rfc3339()
    );
    fs::write(home.path().join("sessions.jsonl"), format!("{session}\n"))
        .expect("session fixture should be written");

    let stdout = assert_success(keyloop(&home, &["report"]));

    assert!(stdout.contains("今日练习: 1 分 0 秒"));
    assert!(stdout.contains("正确率: 100.0%"));
    assert!(stdout.contains("运行: keyloop start"));
}

#[test]
fn import_command_extracts_code_snippets_from_repo_path() {
    let home = TempHome::new("import-home");
    let repo = TempHome::new("import-repo");
    let src = repo.path().join("src");
    fs::create_dir_all(&src).expect("source directory should be created");
    fs::write(
        src.join("app.ts"),
        "export function hello(name: string) {\n  return `hello ${name}`;\n}\n",
    )
    .expect("source fixture should be written");

    let repo_arg = repo
        .path()
        .to_str()
        .expect("temp path should be valid utf-8");
    let stdout = assert_success(keyloop(&home, &["import", repo_arg]));

    assert!(stdout.contains("候选片段"));
    assert!(stdout.contains("typescript"));
    assert!(stdout.contains("export function hello"));
}

#[test]
fn sources_command_lists_corpus_provenance() {
    let home = TempHome::new("sources");
    let stdout = assert_success(keyloop(&home, &["sources"]));

    assert!(stdout.contains("代码语料来源"));
    assert!(stdout.contains("github:"));
    assert!(stdout.contains("keyloop:everyday-english:hand-authored"));
    assert!(stdout.contains("manual-curation"));
    assert!(!stdout.to_ascii_lowercase().contains("monkeytype"));
    assert!(!stdout.to_ascii_lowercase().contains("keybr"));
}
