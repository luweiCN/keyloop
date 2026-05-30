# KeyLoop Roadmap

[中文](ROADMAP.md)

KeyLoop is not a general typing game. In this phase it is tailored for one programmer: a native Chinese speaker whose regular English typing is around 50 WPM, while code typing drops much lower. The product goal is to open the app and immediately see what should be practiced today, without manually choosing difficulty, length, or whether to practice code.

## Product Principles

1. The software plans; the user practices.
2. Chinese is the default, with English available as a real interface option.
3. Difficulty is driven by history and future code changes, not manual user toggles.
4. Practice must progress gradually; real code should not be the first step.
5. Code practice should use complete blocks and later evolve toward functions, components, and file snippets.
6. TUI rendering must stay stable across resize, focus changes, and exits.

## Current Flow

Starting `keyloop` opens a practice menu:

```text
Practice menu

1. Comprehensive practice
2. Warmup: base keys
3. Chunks: English spelling chunks
4. Common words: real English common words
5. Words: frontend vocabulary
6. Focus: numbers and symbols
7. Naming: casing and frontend APIs
8. Code: short complete code blocks
9. Stats
```

The user can run the full plan or choose one focused lesson. The only important runtime setting is language.

## Practice Pages

### Menu

- Comprehensive practice: run all seven lessons in sequence.
- Focused lesson: practice only one step.
- Stats: review total time, best WPM, weighted accuracy, key heatmap, problem words, and daily details.

### Plan

The daily plan is generated from local history. With no history, KeyLoop starts from a beginner-friendly plan.

It shows the target time, lesson purposes, and expected sequence. It does not expose complex configuration.

### Typing

The typing page focuses on one task: complete the current target text.

- The text panel is centered.
- Ghost text is readable.
- Correct input turns green.
- Wrong input turns red and underlined.
- Non-ASCII IME commits are ignored while typing.
- Newline and tab markers wrap before overflow.
- Completing a lesson stops on a result page.

### Result

After each lesson, KeyLoop shows WPM, raw WPM, accuracy, errors, backspaces, slow tokens, and next-step controls.

## Content System

The main future work is richer content rather than more settings:

- base keys and letter transitions
- English spelling chunks such as `the`, `tion`, `ing`, `ment`, `pre`, `con`, `str`
- real English high-frequency words
- programmer and frontend vocabulary
- numbers, brackets, quotes, arrows, comparison operators
- camelCase, PascalCase, DOM/React/API naming
- TS / JS / Solidity / HTML / CSS / Less / Sass code blocks

Code blocks should favor complete if blocks, callbacks, functions, hooks, components, and eventually file snippets.

## Current Status

The P0-P2 shape is mostly in place:

1. Startup opens a menu for comprehensive practice, focused lessons, and stats.
2. Invalid settings were removed.
3. Multi-lesson flow is implemented.
4. Key events, error characters, error tokens, token start delay, and typing duration are recorded.
5. Stats include overview, daily details, problem words, key errors, and a key heatmap.

## Next Steps

1. Expand built-in content: chunks, common English words, frontend words, and complete code blocks.
2. Add `keyloop report week` for weekly review.
3. Improve code block extraction toward functions, components, and file snippets.
4. Consider tree-sitter for better code boundary detection.
