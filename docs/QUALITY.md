# Quality Checks

[中文](QUALITY.zh.md)

KeyLoop is a terminal typing trainer, so code changes should be checked for both Rust correctness and TUI behavior.

## Required Checks

Run these before committing:

```bash
cargo fmt --check
cargo test
cargo clippy -- -D warnings
```

`cargo test` includes CLI integration checks and ratatui `TestBackend` TUI render smoke tests for the primary screens.

Useful smoke checks:

```bash
cargo run -- --help
cargo run -- plan
cargo run -- plan --language en
cargo run -- report today
cargo run -- import .
```

## TUI Review Focus

- Do not clear the terminal on every frame; let ratatui diff rendering handle normal redraws.
- Keep the typing panel centered and readable.
- Non-ASCII IME commits should be ignored during typing and must not advance the lesson.
- Newline and tab markers must wrap before they overflow the visible text width.
- Completed lessons should stop on a result page instead of exiting immediately.
- Small terminals should show a clear fallback message instead of compressed broken panels.

## Metrics Review Focus

- Accuracy is based on insert events, so corrected mistakes still count.
- Raw WPM is based on all insert events, including characters later removed by backspace.
- Aggregates should handle mixed modern and legacy records.
- Token timing should ignore obsolete events after cross-token backspace and retype.
- Reports, stats, and plans should use consistent effective typed-length fallbacks for legacy records.
