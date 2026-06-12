# Quality Checks

[中文](QUALITY.zh.md)

KeyLoop is a terminal typing trainer built with TypeScript, Bun, and OpenTUI, so code changes should be checked for type safety, storage compatibility, release packaging, and TUI behavior.

## Required Checks

Run these before committing:

```bash
bun install --frozen-lockfile
bun run typecheck
bun test tests
bun run build
bun run build:binary
bun run smoke
```

`bun test tests` includes CLI integration checks, OpenTUI render tests, storage compatibility tests, and content quality checks. `bun run smoke` also verifies the built binary and a release-style archive containing runtime `contents/`.

Useful smoke checks:

```bash
bun src/main.ts --help
bun src/main.ts plan
bun src/main.ts plan --language en
bun src/main.ts report today
bun src/main.ts sources
./dist/keyloop sources
```

## TUI Review Focus

- Do not clear the terminal on every frame; let OpenTUI handle normal redraws.
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
