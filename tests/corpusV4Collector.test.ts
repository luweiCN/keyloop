import { describe, expect, test } from "bun:test";

import { collectTypeScriptCorpusV4FromSource } from "../src/content/corpusV4Collector";

const baseOptions = {
  repo: "owner/repo",
  repoUrl: "https://github.com/owner/repo",
  commitSha: "0123456789abcdef0123456789abcdef01234567",
  relativePath: "src/example.ts",
  technologyDomain: "typescript",
  language: "TypeScript",
  framework: "typescript",
  licenseSpdx: "MIT",
};

describe("corpus v4 TypeScript collector", () => {
  test("extracts one callable unit for function records", async () => {
    const source = [
      "export function buildUserSummary(user: User, fallbackName: string): string {",
      "  const displayName = user.profile?.displayName ?? fallbackName;",
      "  const emailAddress = user.email.trim().toLowerCase();",
      "  const statusLabel = user.enabled ? 'enabled' : 'disabled';",
      "  const joinedAt = formatDate(user.createdAt);",
      "  return `${displayName} <${emailAddress}> ${statusLabel} ${joinedAt}`;",
      "}",
      "",
      "function normalizeUserName(value: string): string {",
      "  return value.trim().replace(/\\s+/g, ' ');",
      "}",
    ].join("\n");

    const records = await collectTypeScriptCorpusV4FromSource(source, baseOptions);
    const functions = records.filter((record) => record.level === "function");

    expect(functions).toHaveLength(1);
    expect(functions[0]?.text).toContain("buildUserSummary");
    expect(functions[0]?.text).not.toContain("normalizeUserName");
    expect(functions[0]?.commit).toBe(baseOptions.commitSha);
  });

  test("keeps callable records that contain nested callbacks", async () => {
    const source = [
      "export function collectActiveUserIds(users: User[]): string[] {",
      "  const activeUsers = users.filter((user) => user.enabled);",
      "  const visibleUsers = activeUsers.filter((user) => !user.archived);",
      "  const userIds = visibleUsers.map((user) => user.id);",
      "  return userIds.slice(0, 25);",
      "}",
    ].join("\n");

    const records = await collectTypeScriptCorpusV4FromSource(source, baseOptions);
    const functions = records.filter((record) => record.level === "function");

    expect(functions).toHaveLength(1);
    expect(functions[0]?.text).toContain("collectActiveUserIds");
  });

  test("extracts complete control-flow blocks", async () => {
    const source = [
      "export function syncVisibleUsers(users: User[]): number {",
      "  const selectedUsers = users.filter((user) => user.enabled && !user.archived);",
      "  if (selectedUsers.length > 0) {",
      "    logVisibleUsers(selectedUsers.map((user) => user.id));",
      "    refreshVisibleUserPanel(selectedUsers, { source: 'manual-refresh' });",
      "  }",
      "  return selectedUsers.length;",
      "}",
    ].join("\n");

    const records = await collectTypeScriptCorpusV4FromSource(source, baseOptions);
    const blocks = records.filter((record) => record.level === "block");

    expect(blocks.some((record) => record.text.includes("if (selectedUsers.length > 0)"))).toBe(true);
    expect(blocks.every((record) => !record.text.includes("function syncVisibleUsers"))).toBe(true);
    expect(blocks.every((record) => record.line_count === record.end_line - record.start_line + 1)).toBe(true);
  });

  test("does not classify complete functions or declarations as block records", async () => {
    const source = [
      "export function buildUserSummary(user: User, fallbackName: string): string {",
      "  const displayName = user.profile?.displayName ?? fallbackName;",
      "  const emailAddress = user.email.trim().toLowerCase();",
      "  const statusLabel = user.enabled ? 'enabled' : 'disabled';",
      "  const joinedAt = formatDate(user.createdAt);",
      "  return `${displayName} <${emailAddress}> ${statusLabel} ${joinedAt}`;",
      "}",
      "",
      "const visibleColumns = {",
      "  name: true,",
      "  email: true,",
      "  status: true,",
      "  createdAt: false,",
      "  updatedAt: false,",
      "  archivedAt: false,",
      "};",
      "",
      "export interface VisibleColumnState {",
      "  name: boolean;",
      "  email: boolean;",
      "  status: boolean;",
      "}",
    ].join("\n");

    const records = await collectTypeScriptCorpusV4FromSource(source, baseOptions);
    const blocks = records.filter((record) => record.level === "block");

    expect(blocks.some((record) => record.text.includes("function buildUserSummary"))).toBe(false);
    expect(blocks.some((record) => record.text.includes("visibleColumns"))).toBe(false);
    expect(blocks.some((record) => record.text.includes("VisibleColumnState"))).toBe(false);
  });

  test("rejects comment-heavy candidates", async () => {
    const source = [
      "export function explainBuildPipeline() {",
      "  // Read project settings from config files.",
      "  // Resolve dependencies before plugin execution.",
      "  // Keep the resulting pipeline stable across runs.",
      "  // Reuse cached transforms when inputs are unchanged.",
      "  const pipeline = createPipeline();",
      "  return pipeline;",
      "}",
    ].join("\n");

    const records = await collectTypeScriptCorpusV4FromSource(source, baseOptions);

    expect(records.some((record) => record.text.includes("explainBuildPipeline"))).toBe(false);
  });

  test("rejects candidates with lines that remain too long after normalization", async () => {
    const source = [
      "export function createLaunchWarning(): string {",
      "  const owner = 'current user';",
      "  const environment = 'GitHub Actions workflow file';",
      "  const warning = `Firefox is unable to launch if the $HOME folder is not owned by the ${owner}. Workaround: set HOME=/root inside your ${environment} before running this browser task.`;",
      "  return warning;",
      "}",
    ].join("\n");

    const records = await collectTypeScriptCorpusV4FromSource(source, baseOptions);

    expect(records.some((record) => record.text.includes("createLaunchWarning"))).toBe(false);
  });

  test("emits file records only for complete source files", async () => {
    const source = [
      "import { join } from 'node:path';",
      "import { readFile } from 'node:fs/promises';",
      "",
      "export interface ProjectManifest {",
      "  root: string;",
      "  configPath: string;",
      "  packagePath: string;",
      "  workspaceName: string;",
      "  environmentName: string;",
      "  packageManager: string;",
      "}",
      "",
      "export async function loadProjectManifest(root: string): Promise<ProjectManifest> {",
      "  const packagePath = join(root, 'package.json');",
      "  const configPath = join(root, 'tsconfig.json');",
      "  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));",
      "  const workspaceName = typeof packageJson.name === 'string'",
      "    ? packageJson.name",
      "    : 'anonymous-workspace';",
      "  const environmentName = typeof packageJson.environment === 'string'",
      "    ? packageJson.environment",
      "    : 'local-development';",
      "  const packageManager = typeof packageJson.packageManager === 'string'",
      "    ? packageJson.packageManager",
      "    : 'npm';",
      "  return {",
      "    root,",
      "    configPath,",
      "    packagePath,",
      "    workspaceName,",
      "    environmentName,",
      "    packageManager,",
      "  };",
      "}",
    ].join("\n");

    const records = await collectTypeScriptCorpusV4FromSource(source, baseOptions);
    const files = records.filter((record) => record.level === "file");

    expect(files).toHaveLength(1);
    expect(files[0]?.start_line).toBe(1);
    expect(files[0]?.end_line).toBe(source.split("\n").length);
    expect(files[0]?.text).toContain("loadProjectManifest");
    expect(files[0]?.text).toContain("packageManager");
    expect(files[0]?.line_count).toBe(files[0]?.text.split("\n").length);
    expect(files[0]?.line_count).toBe((files[0]?.end_line ?? 0) - (files[0]?.start_line ?? 0) + 1);
  });
});
