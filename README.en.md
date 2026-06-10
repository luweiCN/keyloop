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
bun install
bun run build:binary   # produces the dist/keyloop-ts single-file binary
```

Development runs:

```bash
bun run keyloop start
bun run keyloop report today
bun run keyloop plan
```

## Daily Practice

The default daily target is 20 minutes. You can finish it in one session or in several short sessions. Each completed lesson adds to today's progress.

Built-in content lives in the root `content/` directory. See [docs/content/CATALOG.md](docs/content/CATALOG.md). Everyday English uses `content/everyday_english.json`, a KeyLoop hand-authored clean corpus for everyday/workplace words, phrases, and short/medium/long sentences. It does not copy external typing-site word lists. Set `KEYLOOP_EVERYDAY_CORPUS=/path/to/everyday.json` to merge a local private corpus with the same schema.

Code indentation is normalized before practice by removing the shared outer indentation while preserving relative indentation inside functions, HTML/Vue trees, and CSS nesting. In code mode, pressing Enter automatically inserts the expected leading indentation for the next line.

Without enough history, full practice starts from this default path:

1. Foundation input: Home/Top/Bottom row, transitions, and recent weak keys
2. Everyday English: common words, chunks, and natural English input
3. Programming basics: numbers, symbols, naming, and technical terms
4. Code practice: complete code blocks and multi-line structure

After there is recent history, full practice becomes adaptive inside each module: key hot spots increase matching foundation material, symbol errors feed programming basics, high-error words and identifiers feed everyday English or programming basics, and slow terms are pushed back into complete code blocks. Errors and slow items from a completed group can influence later groups in the same run without adding a second full symbol or Top row drill.

Code difficulty is selected from recent code-practice accuracy, WPM, and error rate, then mapped to easy, medium, or hard snippets.

Symbol practice has a generic layer plus language/framework-specific sets, for example TS/JS `=>`, `?.`, `??`, Rust `::`, `->`, `'a`, CSS/Sass `@media`, `&`, `:root`, and Solidity `indexed`, `payable`, `mapping`.

The menu has 6 fixed entries:

- Full practice: run the adaptive sequence across foundation practice, everyday practice, programming basics, and code practice.
- Foundation practice: open a second-level menu for Home row, Top row, Bottom row, horizontal, vertical, finger movement, and a bottom mixed foundation entry.
- Everyday practice: open common 100 words, common 500 words, common 1000 words, everyday sentences, or everyday mix. Word entries can switch each group between 10 / 20 / 50 / 100 words. The sentence entry switches short / medium / long / mixed inside the same entry.
- Programming basics: open numbers and symbols, operators/brackets/quotes, naming and camel case, technical terms, or programming basics mix.
- Code practice: open code blocks, functions, file fragments, or random mix while keeping language/framework/project multi-select filters. Used or pinned filters stay near the top and are saved as the global code scope.
- Stats: review total time, best WPM, weighted accuracy, key heatmap, problem words, daily details, and what the next full practice will prioritize.

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
bun run typecheck
bun test tests
bun run smoke
```

See [docs/QUALITY.md](docs/QUALITY.md) for review focus.

## Release / Homebrew

This repository uses a PR-based GitHub workflow:

1. Open a PR from a feature branch.
2. Merge after CI passes.
3. The release workflow reads the version from `package.json` on `main`.
4. If the matching `vX.Y.Z` release does not exist, it builds macOS/Linux packages, creates a GitHub Release, and updates the Homebrew tap.

See [docs/RELEASE.md](docs/RELEASE.md) for release and Homebrew setup.
