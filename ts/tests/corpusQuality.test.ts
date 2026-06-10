import { describe, expect, test } from "bun:test";

import { assessCorpusTextQuality } from "../src/index";

describe("corpus text quality assessment", () => {
  test("rejects license-only comment snippets", () => {
    const result = assessCorpusTextQuality({
      text: "/**\n * @license\n * Copyright Example Authors\n */",
      level: "block",
      size: "short",
      line_count: 4,
      char_count: 44,
    });

    expect(result.status).toBe("reject");
    expect(result.flags).toContain("comment_only");
    expect(result.flags).toContain("license_only");
  });

  test("rejects license headers even when followed by code", () => {
    const text = [
      "/**",
      " * @license",
      " * Copyright Example Authors",
      " */",
      "export function loadConfig() {",
      "  return true;",
      "}",
    ].join("\n");
    const result = assessCorpusTextQuality({
      text,
      level: "function",
      size: "short",
      line_count: 7,
      char_count: text.length,
    });

    expect(result.status).toBe("reject");
    expect(result.flags).toContain("license_header");
  });

  test("accepts Solidity file headers with SPDX and pragma", () => {
    const text = [
      "// SPDX-License-Identifier: MIT",
      "pragma solidity ^0.8.20;",
      "",
      "contract Counter {",
      "  uint256 public value;",
      "}",
    ].join("\n");
    const result = assessCorpusTextQuality({
      text,
      level: "block",
      size: "short",
      line_count: 6,
      char_count: text.length,
    });

    expect(result.status).toBe("accept");
    expect(result.flags).not.toContain("comment_only");
    expect(result.flags).not.toContain("license_header");
  });

  test("accepts real compiler and build directive comments", () => {
    const text = [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "",
      "//go:build linux && amd64",
      "package main",
      "",
      "/// <reference types=\"vite/client\" />",
      "const ready = true;",
    ].join("\n");
    const result = assessCorpusTextQuality({
      text,
      level: "block",
      size: "short",
      line_count: 8,
      char_count: text.length,
    });

    expect(result.status).toBe("accept");
    expect(result.flags).not.toContain("comment_only");
    expect(result.flags).not.toContain("prose_only");
  });

  test("rejects documentation comments even when code follows", () => {
    const text = [
      "/**",
      " * Formats a user name for display.",
      " * This prose belongs to docs, not code typing practice.",
      " */",
      "function formatName(user: User) {",
      "  return user.name;",
      "}",
    ].join("\n");
    const result = assessCorpusTextQuality({
      text,
      level: "function",
      size: "short",
      line_count: 7,
      char_count: text.length,
    });

    expect(result.status).toBe("reject");
    expect(result.flags).toContain("doc_comment");
  });

  test("rejects Python docstrings even when code follows", () => {
    const text = [
      "def normalize_name(value: str) -> str:",
      "    \"\"\"Normalize user-facing display names.",
      "    This text is documentation rather than code input.",
      "    \"\"\"",
      "    return value.strip().title()",
    ].join("\n");
    const result = assessCorpusTextQuality({
      text,
      level: "function",
      size: "short",
      line_count: 5,
      char_count: text.length,
    });

    expect(result.status).toBe("reject");
    expect(result.flags).toContain("doc_comment");
  });

  test("rejects Go doc comments attached to declarations", () => {
    const text = [
      "// Counter stores a monotonically increasing value.",
      "type Counter struct {",
      "  value int",
      "}",
    ].join("\n");
    const result = assessCorpusTextQuality({
      text,
      level: "block",
      size: "short",
      line_count: 4,
      char_count: text.length,
    });

    expect(result.status).toBe("reject");
    expect(result.flags).toContain("doc_comment");
  });

  test("rejects block comments whose middle lines do not start with comment markers", () => {
    const text = [
      "/* The custom algorithm is necessary since inputs are represented",
      "as complex objects or arrays that need careful dirty checking.",
      "The algorithm avoids unnecessary allocations.",
      "*/",
    ].join("\n");
    const result = assessCorpusTextQuality({
      text,
      level: "block",
      size: "short",
      line_count: 4,
      char_count: text.length,
    });

    expect(result.status).toBe("reject");
    expect(result.flags).toContain("comment_only");
    expect(result.flags).toContain("no_code_signal");
  });

  test("rejects prose-only documentation fragments with bracket references", () => {
    const text = [
      "during the change detection cycle can result in GC pauses.",
      "The algorithm works by iterating over the set of bound classes,",
      "then going over [ngClass] binding and [class] binding.",
    ].join("\n");
    const result = assessCorpusTextQuality({
      text,
      level: "block",
      size: "short",
      line_count: 3,
      char_count: text.length,
    });

    expect(result.status).toBe("reject");
    expect(result.flags).toContain("no_code_signal");
  });

  test("does not treat prose control-flow words as code", () => {
    const text = [
      "For each CSS class name:",
      "- check if it was seen before and if its value changed;",
      "- mark it as touched so stale classes can be removed.",
    ].join("\n");
    const result = assessCorpusTextQuality({
      text,
      level: "block",
      size: "short",
      line_count: 3,
      char_count: text.length,
    });

    expect(result.status).toBe("reject");
    expect(result.flags).toContain("no_code_signal");
  });

  test("rejects prose-only documentation fragments without comment delimiters", () => {
    const text = [
      "during the change detection cycle can result in GC pauses for some of the cycles).",
      "The algorithm works by iterating over the set of bound classes, starting with [class] binding",
      "and then going over [ngClass] binding. For each CSS class name:",
      "- check if it was seen before and if its value changed;",
      "- mark it as touched so stale classes can be removed.",
      "After iteration, the state map is ready for the next change detection cycle.",
    ].join("\n");
    const result = assessCorpusTextQuality({
      text,
      level: "function",
      size: "short",
      line_count: 6,
      char_count: text.length,
    });

    expect(result.status).toBe("reject");
    expect(result.flags).toContain("prose_only");
  });

  test("rejects long prose fragments with only weak code references", () => {
    const text = [
      "This algorithm is perf-sensitive since NgClass is used very frequently and its poor performance",
      "might negatively impact runtime performance of the entire change detection cycle.",
      "The design of this algorithm is making sure that:",
      "- there is no unnecessary DOM manipulation when CSS classes are added or removed;",
      "- there is no memory allocation if nothing changes;",
      "- object references can change without forcing a full rebuild;",
      "during the change detection cycle, stale classes are removed from the internal structures.",
    ].join("\n");
    const result = assessCorpusTextQuality({
      text,
      level: "function",
      size: "short",
      line_count: 7,
      char_count: text.length,
    });

    expect(result.status).toBe("reject");
    expect(result.flags).toContain("prose_only");
  });

  test("rejects prose fragments split out of a block comment body", () => {
    const text = [
      "This algorithm is perf-sensitive since NgClass is used very frequently and its poor performance",
      "might negatively impact runtime performance of the entire change detection cycle. The design of",
      "this algorithm is making sure that:",
      "- there is no unnecessary DOM manipulation (CSS classes are added / removed from the DOM only when",
      "needed), even if references to bound objects change;",
      "- there is no memory allocation if nothing changes (even relatively modest memory allocation",
      "during the change detection cycle can result in GC pauses for some of the CD cycles).",
      "The algorithm works by iterating over the set of bound classes, starting with [class] binding",
      "and then going over [ngClass] binding. For each CSS class name:",
      "- check if it was seen before (this information is tracked in the state map) and if its value changed;",
      "- mark it as touched so stale classes can be removed.",
      "After iteration, the DOM can be synchronized from the state map.",
    ].join("\n");
    const result = assessCorpusTextQuality({
      text,
      level: "function",
      size: "medium",
      line_count: 12,
      char_count: text.length,
    });

    expect(result.status).toBe("reject");
    expect(result.flags).toContain("prose_only");
  });

  test("rejects code with dominant comments", () => {
    const text = [
      "/*",
      " * Explains why this state exists.",
      " * The prose is useful context but should not dominate typing practice.",
      " */",
      "interface CssClassState {",
      "  enabled: boolean;",
      "  changed: boolean;",
      "}",
    ].join("\n");
    const result = assessCorpusTextQuality({
      text,
      level: "block",
      size: "medium",
      line_count: 8,
      char_count: text.length,
    });

    expect(result.status).toBe("reject");
    expect(result.flags).toContain("high_comment_ratio");
  });

  test("rejects pure import and re-export snippets", () => {
    const result = assessCorpusTextQuality({
      text: [
        "import { readFile } from \"node:fs/promises\";",
        "export { loadConfig } from \"./config\";",
      ].join("\n"),
      level: "block",
      size: "short",
      line_count: 2,
      char_count: 82,
    });

    expect(result.status).toBe("reject");
    expect(result.flags).toContain("import_only");
  });

  test("rejects re-export-only files even when a leading comment is present", () => {
    const text = [
      "// Re-export browser-independent module runner APIs.",
      "export { ModuleRunner } from './runner';",
      "export { createDefaultImportMeta } from './createImportMeta';",
      "export type {",
      "  ModuleRunnerOptions,",
      "  type ModuleRunnerContext,",
      "} from './types';",
    ].join("\n");
    const result = assessCorpusTextQuality({
      text,
      level: "file",
      size: "short",
      line_count: 4,
      char_count: text.length,
    });

    expect(result.status).toBe("reject");
    expect(result.flags).toContain("import_only");
  });

  test("rejects import and export list fragments", () => {
    const result = assessCorpusTextQuality({
      text: [
        "export {",
        "  NgClass,",
        "  NgComponentOutlet,",
      ].join("\n"),
      level: "block",
      size: "short",
      line_count: 3,
      char_count: 37,
    });

    expect(result.status).toBe("reject");
    expect(result.flags).toContain("import_only");
  });

  test("rejects orphan comment fragments before code", () => {
    const result = assessCorpusTextQuality({
      text: [
        "*/",
        "",
        "import { Provider } from '@angular/core';",
      ].join("\n"),
      level: "block",
      size: "short",
      line_count: 3,
      char_count: 44,
    });

    expect(result.status).toBe("reject");
    expect(result.flags).toContain("comment_fragment");
  });

  test("rejects trailing block comment fragments after code", () => {
    const result = assessCorpusTextQuality({
      text: [
        "set klass(value: string) {",
        "  this.initialClasses = value.trim().split(WS_REGEXP);",
        "}",
        "",
        "/*",
      ].join("\n"),
      level: "block",
      size: "short",
      line_count: 5,
      char_count: 86,
    });

    expect(result.status).toBe("reject");
    expect(result.flags).toContain("comment_fragment");
  });

  test("rejects snippets with unbalanced delimiters", () => {
    const result = assessCorpusTextQuality({
      text: [
        "export const COMMON_DIRECTIVES: Provider[] = [",
        "  NgClass,",
        "  NgComponentOutlet,",
      ].join("\n"),
      level: "block",
      size: "short",
      line_count: 3,
      char_count: 75,
    });

    expect(result.status).toBe("reject");
    expect(result.flags).toContain("unbalanced_delimiters");
  });

  test("rejects snippets cut at syntax boundaries", () => {
    const result = assessCorpusTextQuality({
      text: [
        "case 'string':",
        "  return value;",
        "}",
        "",
        "visitSafeKeyedRead(ast: expr.SafeKeyedRead): string {",
      ].join("\n"),
      level: "function",
      size: "short",
      line_count: 5,
      char_count: 82,
    });

    expect(result.status).toBe("reject");
    expect(result.flags).toContain("syntax_fragment");
  });

  test("rejects placeholder-only snippets", () => {
    const result = assessCorpusTextQuality({
      text: "<!-- ... -->\n// TODO: implement this\n...",
      level: "block",
      size: "short",
      line_count: 3,
      char_count: 36,
    });

    expect(result.status).toBe("reject");
    expect(result.flags).toContain("placeholder_only");
  });

  test("accepts real symbol-heavy template code", () => {
    const text = [
      "<button",
      "  class=\"inline-flex items-center gap-2\"",
      "  [disabled]=\"isSaving()\"",
      "  (click)=\"saveUser(user.id)\"",
      ">",
      "  Save",
      "</button>",
    ].join("\n");
    const result = assessCorpusTextQuality({
      text,
      level: "block",
      size: "short",
      line_count: 7,
      char_count: text.length,
    });

    expect(result.status).toBe("accept");
    expect(result.flags).not.toContain("comment_only");
    expect(result.flags).not.toContain("import_only");
    expect(result.metrics.codeLineCount).toBeGreaterThan(0);
  });

  test("marks metadata mismatches for review without rejecting code", () => {
    const text = [
      "function formatName(user: User) {",
      "  return `${user.firstName} ${user.lastName}`;",
      "}",
    ].join("\n");
    const result = assessCorpusTextQuality({
      text,
      level: "function",
      size: "long",
      line_count: 99,
      char_count: text.length + 10,
    });

    expect(result.status).toBe("review");
    expect(result.flags).toContain("line_count_mismatch");
    expect(result.flags).toContain("char_count_mismatch");
    expect(result.flags).toContain("size_mismatch");
  });

  test("marks size mismatch when character count is outside the declared size", () => {
    const text = [
      "const selectedVisiblePreference = resolveSelectedVisiblePreference(input);",
      "const archivedPreferenceStatus = normalizeArchivedPreferenceStatus(selectedVisiblePreference);",
      "const pendingPreferenceResult = serializePendingPreferenceResult(archivedPreferenceStatus);",
      "return pendingPreferenceResult;",
    ].join("\n");
    const result = assessCorpusTextQuality({
      text,
      level: "block",
      size: "long",
      line_count: 4,
      char_count: text.length,
    });

    expect(result.status).toBe("review");
    expect(result.flags).toContain("size_mismatch");
  });

  test("accepts v3 block short upper line and character limits", () => {
    const text = [
      "const dashboardActions = {",
      "  openSearch: () => setSearchOpen(true),",
      "  closeSearch: () => setSearchOpen(false),",
      "  toggleFilters: () => setFiltersOpen((open) => !open),",
      "  resetFilters: () => clearSelectedFilters(),",
      "  saveView: () => persistCurrentView(),",
      "  refresh: () => reloadVisibleRows(),",
      "};",
    ].join("\n");
    const result = assessCorpusTextQuality({
      text,
      level: "block",
      size: "short",
      line_count: 8,
      char_count: text.length,
    });

    expect(result.status).toBe("accept");
    expect(result.flags).not.toContain("size_mismatch");
  });
});
