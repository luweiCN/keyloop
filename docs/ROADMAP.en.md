# KeyLoop Roadmap

[中文](ROADMAP.md)

KeyLoop is a terminal typing trainer for programmers. It started from a personal training need and has grown into a general local tool: users can open it and practice immediately, or focus on foundation keys, chunks, symbols, naming, or code.

The product goal is to let the software organize the practice path while the user focuses on typing. Plans become personal from local history, and practice data stays on the user's machine by default.

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
2. Foundation practice
3. Everyday practice
4. Programming basics
5. Code practice
6. Stats
```

The user can run the adaptive full plan or open a second-level menu for one of the four primary categories. Language, framework, and project filters are saved as a global code scope and reused by code practice and full practice.

## Practice Pages

### Menu

- Comprehensive practice: run foundation input, everyday English, programming basics, and code practice as module groups. Errors and slow items from each group can influence later module content.
- Foundation practice: open row, horizontal, vertical, diagonal, punctuation-edge, finger movement, and mixed foundation drills.
- Everyday practice: open common 100 words, common 500 words, common 1000 words, everyday sentences, and everyday mix. Word entries can switch 10 / 20 / 50 / 100 words per group; the sentence entry switches short / medium / long / mixed inside the same entry.
- Programming basics: open code input basics (values, single-line statements, and small code blocks), programming terms, naming styles, technical long words, built-in APIs (high-frequency APIs per language ecosystem), and programming basics mix.
- Code practice: open code blocks, functions, file fragments, or random mix while keeping language/framework/project filters.
- Stats: review total time, best WPM, weighted accuracy, key heatmap, problem words, daily details, and what the next full practice will prioritize.

### Plan

The daily plan is generated from local history. With no history, KeyLoop starts from a beginner-friendly plan.

It shows the target time, the module sequence, and a separate training-rationale panel so personal analysis does not clutter the menu.

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

After each lesson, KeyLoop shows WPM, raw WPM, accuracy, errors, backspaces, slow tokens, next-step controls, and why the next group is scheduled.

## Content System

The main future work is richer content rather than more settings:

- base keys and letter transitions
- English spelling chunks such as `the`, `tion`, `ing`, `ment`, `pre`, `con`, `str`
- real English high-frequency words, everyday phrases, and workplace sentences from clean KeyLoop-authored or user-local corpora
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
