# KeyLoop

[中文](README.md)

KeyLoop is a terminal typing trainer for programmers. It focuses on real development input: English chunks, programmer vocabulary, code symbols, naming patterns, and complete code blocks.

You can start full practice immediately, choose a foundation drill, focus on code, or review statistics. KeyLoop keeps practice data locally and uses recent errors, slow tokens, and key hot spots to adjust future lessons.

The default interface language is Chinese. English is available with `--language en` or the language shortcut inside the TUI.

## Loop

```text
practice menu -> daily plan / focused lesson -> typing -> records -> report -> content adjustment
```

Practice records are saved to:

```text
~/.keyloop/sessions.jsonl
~/.keyloop/preferences.json
~/.keyloop/daily_runs.json
```

Set `KEYLOOP_HOME` to use a different data directory.

## Usage

```bash
keyloop
keyloop start
keyloop start --repo /path/to/project
keyloop report today
keyloop plan
keyloop import /path/to/project
keyloop sources
```

Switch to English:

```bash
keyloop --language en
keyloop plan --language en
```

Inside the TUI, press `L` on menu/plan/result pages. While typing, press `Ctrl+L` so the normal `l` key remains available for practice input.

While typing, press `Ctrl+P` to pause/resume. `Esc` pauses and opens the explicit exit choices. Paused time is excluded from timers, WPM, and key event timestamps.

Code block lessons can be filtered by language, framework, or project:

```bash
keyloop start --code-language typescript
keyloop start --code-framework react
keyloop start --repo /path/to/project --code-language rust
```

Plain `keyloop` and `keyloop start` use the built-in code corpus immediately.
KeyLoop scans a local repository only when `--repo /path/to/project` is provided.

## Install

Use Homebrew:

```bash
brew tap luweiCN/keyloop
brew install keyloop
```

Or install in one command:

```bash
brew install luweiCN/keyloop/keyloop
```

You can also install from source:

```bash
cargo install --path .
```

Development runs:

```bash
cargo run -- start
cargo run -- report today
cargo run -- plan
```

## Daily Practice

The default daily target is 20 minutes. You can finish it in one session or in several short sessions. Each completed lesson adds to today's progress.

Built-in content lives in the root `content/` directory. See [docs/content/CATALOG.md](docs/content/CATALOG.md). Code indentation is normalized before practice by removing the shared outer indentation while preserving relative indentation inside functions, HTML/Vue trees, and CSS nesting. In code mode, pressing Enter automatically inserts the expected leading indentation for the next line.

Without enough history, full practice starts from this default path:

1. Warmup: base keys
2. Chunks: English spelling chunks such as `the`, `tion`, `ing`, `ment`, `pre`, `con`, `str`
3. Common words: real high-frequency English words without mixed casing
4. Words: frontend and programmer vocabulary
5. Focus: numbers and symbols
6. Naming: casing and frontend APIs
7. Code blocks: complete snippets with at least 120 built-in entries per language for TypeScript, JavaScript, Vue, Solidity, Rust, HTML, CSS, Less, and Sass

After there is recent history, full practice becomes adaptive: key hot spots add foundation drills, symbol errors add symbol groups, high-error words and identifiers feed chunk/word groups, and slow terms are pushed back into complete code blocks. The plan page keeps the training rationale in one place while the menu stays stable.

The menu also includes Foundation practice and Code focus mode. Foundation practice has row, horizontal, vertical, and finger-movement drills that continue into another group after each completion. Code focus lets you multi-select languages, frameworks, and projects, keeps used or pinned filters near the top, then continues into another generated code group.

## Metrics

Each completed lesson records:

- duration
- WPM and raw WPM
- accuracy
- errors
- backspaces
- target text and final input
- key events
- error characters
- error tokens
- token start delay and typing duration

Use `keyloop report today` for the daily report and `keyloop plan` for the current recommendation.

## Data And Privacy

KeyLoop does not upload practice data. By default it only writes local data to:

```text
~/.keyloop/sessions.jsonl
~/.keyloop/preferences.json
~/.keyloop/daily_runs.json
```

Session records include target text, final input, key events, error characters, token statistics, daily run IDs, and lesson IDs. Preferences store pinned language, framework, and project filters for code focus mode. `daily_runs.json` stores generated full-practice plans so an unfinished run resumes next time, while a completed run allows the next launch to generate another full-practice run for the same day.

## Development / Quality

```bash
cargo fmt --check
cargo test
cargo clippy -- -D warnings
cargo run -- plan
```

See [docs/QUALITY.md](docs/QUALITY.md) for review focus.

## Release / Homebrew

This repository uses a PR-based GitHub workflow:

1. Open a PR from a feature branch.
2. Merge after CI passes.
3. The release workflow reads the version from `Cargo.toml` on `main`.
4. If the matching `vX.Y.Z` release does not exist, it builds macOS/Linux packages, creates a GitHub Release, and updates the Homebrew tap.

See [docs/RELEASE.md](docs/RELEASE.md) for release and Homebrew setup.
