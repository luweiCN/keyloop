# 2026-06-12 word loose translation wrap

## Symptom

Repeated `word_loose` items that wrap inside one annotated word group rendered the Chinese translation after the first English visual row, then rendered the remaining English row below it.

## Root Cause

`splitLooseWordItem` assigned the annotation translation to the first split chunk and cleared it for later chunks. `renderGhostText` also rendered empty meaning rows for loose word chunks, creating an extra blank/translation row between English rows.

## Fix

Attach the translation only to the final split chunk, and skip empty meaning rows for loose word blocks.

## Verification

- Added renderer regression coverage for wrapped repeated words.
- `bun test tests/opentuiRenderer.test.ts`
- `bun test tests`
- `bun run build`
- `bun run build:binary`
