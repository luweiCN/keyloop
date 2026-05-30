#!/usr/bin/env python3
"""Build deterministic KeyLoop-owned code practice snippets.

The generated corpus is intentionally original KeyLoop material. External
source snippets stay in content/code/*.json with explicit source_catalog
metadata; this script fills the volume gap without copying large bodies of
third-party code.
"""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "content" / "code" / "generated"
GENERATED_SNIPPETS_PER_LANGUAGE = 120


NOUNS = [
    "profile",
    "session",
    "invoice",
    "wallet",
    "message",
    "project",
    "comment",
    "notification",
    "preference",
    "workspace",
    "deployment",
    "subscription",
    "payment",
    "account",
    "draft",
    "activity",
    "report",
    "pipeline",
    "token",
    "permission",
    "contact",
    "order",
    "ticket",
    "release",
    "bundle",
    "audit",
    "bookmark",
    "campaign",
    "channel",
    "checkout",
    "collection",
    "credential",
    "dashboard",
    "dataset",
    "device",
    "document",
    "endpoint",
    "experiment",
    "feature",
    "feed",
    "gateway",
    "group",
    "identity",
    "integration",
    "invite",
    "issue",
    "job",
    "layout",
    "ledger",
    "member",
    "metric",
    "module",
    "notice",
    "operator",
    "organization",
    "package",
    "policy",
    "preset",
    "preview",
    "product",
    "queue",
    "quota",
    "receipt",
    "registry",
    "request",
    "resource",
    "review",
    "role",
    "rule",
    "schedule",
    "schema",
    "section",
    "segment",
    "setting",
    "snapshot",
    "space",
    "stream",
    "task",
    "template",
    "thread",
    "transaction",
    "trigger",
    "upload",
    "user",
    "variant",
    "vault",
    "version",
    "view",
    "webhook",
    "workflow",
    "zone",
    "anchor",
    "batch",
    "cache",
    "cell",
    "delta",
    "entry",
    "field",
    "filter",
    "handle",
    "index",
    "journey",
    "kernel",
    "layer",
    "matrix",
    "node",
]

ADJECTIVES = [
    "active",
    "pending",
    "visible",
    "selected",
    "archived",
    "verified",
    "primary",
    "remote",
    "local",
    "shared",
]


def pascal(value: str) -> str:
    return "".join(part.capitalize() for part in value.replace("-", "_").split("_"))


def camel(*parts: str) -> str:
    head, *tail = parts
    return head + "".join(pascal(part) for part in tail)


def entry(language: str, framework: str, index: int, text: str, level: str = "block") -> dict:
    return {
        "language": language,
        "framework": framework,
        "project": "keyloop-generated",
        "level": level,
        "source": f"keyloop:generated:{language}:{index:03}",
        "text": text,
    }


def write(name: str, snippets: list[dict]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{name}.json"
    path.write_text(json.dumps(snippets, indent=2, ensure_ascii=True) + "\n")


def build_typescript() -> list[dict]:
    snippets: list[dict] = []
    frameworks = ["react", "vue", "nestjs", "vite", "node"]
    for index in range(GENERATED_SNIPPETS_PER_LANGUAGE):
        noun = NOUNS[index % len(NOUNS)]
        typ = pascal(noun)
        collection = f"{noun}s"
        framework = frameworks[index % len(frameworks)]
        variant = index % 5
        if variant == 0:
            text = (
                f"export async function load{typ}(id: string): Promise<{typ}> {{\n"
                f"  const response = await api.get<{typ}>(`/{collection}/${{id}}`);\n"
                "  return response.data;\n"
                "}"
            )
            level = "function"
        elif variant == 1:
            text = (
                f"const visible{pascal(collection)} = {collection}.filter(({noun}) => {{\n"
                f"  return {noun}.enabled && {noun}.status !== \"archived\";\n"
                "});"
            )
            level = "block"
        elif variant == 2:
            text = (
                f"type {typ}State = {{\n"
                f"  selected{typ}Id: string | null;\n"
                "  isLoading: boolean;\n"
                "  error?: string;\n"
                "};"
            )
            level = "block"
        elif variant == 3:
            text = (
                f"function group{pascal(collection)}ByOwner(items: {typ}[]) {{\n"
                "  return items.reduce<Record<string, "
                f"{typ}[]>>((groups, item) => {{\n"
                "    (groups[item.ownerId] ??= []).push(item);\n"
                "    return groups;\n"
                "  }, {});\n"
                "}"
            )
            level = "function"
        else:
            text = (
                f"export const {camel('create', noun, 'schema')} = z.object({{\n"
                "  name: z.string().min(1),\n"
                "  enabled: z.boolean().default(true),\n"
                "  ownerId: z.string().uuid(),\n"
                "});"
            )
            level = "block"
        snippets.append(entry("typescript", framework, index + 1, text, level))
    return snippets


def build_javascript() -> list[dict]:
    snippets: list[dict] = []
    frameworks = ["node", "web", "vite", "express", "astro"]
    for index in range(GENERATED_SNIPPETS_PER_LANGUAGE):
        noun = NOUNS[index % len(NOUNS)]
        collection = f"{noun}s"
        framework = frameworks[index % len(frameworks)]
        variant = index % 5
        if variant == 0:
            text = (
                f"async function fetch{pascal(noun)}(id) {{\n"
                f"  const response = await fetch(`/api/{collection}/${{id}}`);\n"
                "  if (!response.ok) throw new Error(\"request failed\");\n"
                "  return response.json();\n"
                "}"
            )
            level = "function"
        elif variant == 1:
            text = (
                f"const {camel('by', noun, 'id')} = new Map();\n"
                f"for (const item of {collection}) {{\n"
                "  if (item.enabled) byId.set(item.id, item);\n"
                "}"
            )
            level = "block"
        elif variant == 2:
            text = (
                f"export function create{pascal(noun)}Store(initialItems = []) {{\n"
                "  const listeners = new Set();\n"
                "  let items = [...initialItems];\n"
                "  return { getSnapshot: () => items, subscribe: (fn) => listeners.add(fn) };\n"
                "}"
            )
            level = "function"
        elif variant == 3:
            text = (
                f"document.querySelectorAll(\"[data-{noun}]\").forEach((node) => {{\n"
                "  node.addEventListener(\"click\", () => {\n"
                "    node.toggleAttribute(\"data-selected\");\n"
                "  });\n"
                "});"
            )
            level = "block"
        else:
            text = (
                f"const sorted{pascal(collection)} = [...{collection}].sort((left, right) => {{\n"
                "  return left.createdAt.localeCompare(right.createdAt);\n"
                "});"
            )
            level = "block"
        snippets.append(entry("javascript", framework, index + 1, text, level))
    return snippets


def build_vue() -> list[dict]:
    snippets: list[dict] = []
    for index in range(GENERATED_SNIPPETS_PER_LANGUAGE):
        noun = NOUNS[index % len(NOUNS)]
        label = pascal(noun)
        state = camel(noun, "open")
        variant = index % 5
        if variant == 0:
            text = (
                "<script setup lang=\"ts\">\n"
                f"const {state} = ref(false);\n"
                f"function toggle{label}() {{\n"
                f"  {state}.value = !{state}.value;\n"
                "}\n"
                "</script>"
            )
        elif variant == 1:
            text = (
                "<template>\n"
                f"  <section class=\"{noun}-panel\">\n"
                f"    <h2>{{{{ {noun}.title }}}}</h2>\n"
                f"    <button @click=\"select{label}({noun}.id)\">Select</button>\n"
                "  </section>\n"
                "</template>"
            )
        elif variant == 2:
            text = (
                "<script setup lang=\"ts\">\n"
                f"const visible{pascal(noun)}Items = computed(() => {{\n"
                f"  return {noun}Items.value.filter((item) => item.visible);\n"
                "});\n"
                "</script>"
            )
        elif variant == 3:
            text = (
                "<script setup lang=\"ts\">\n"
                f"watch(() => route.params.{noun}Id, async (id) => {{\n"
                "  if (!id) return;\n"
                f"  current{label}.value = await load{label}(String(id));\n"
                "});\n"
                "</script>"
            )
        else:
            text = (
                "<template>\n"
                f"  <Transition name=\"{noun}-fade\">\n"
                f"    <aside v-if=\"{state}\" class=\"drawer\">{{{{ {noun}.summary }}}}</aside>\n"
                "  </Transition>\n"
                "</template>"
            )
        snippets.append(entry("vue", "vue", index + 1, text, "block"))
    return snippets


def build_solidity() -> list[dict]:
    snippets: list[dict] = []
    for index in range(GENERATED_SNIPPETS_PER_LANGUAGE):
        noun = NOUNS[index % len(NOUNS)]
        label = pascal(noun)
        variant = index % 5
        if variant == 0:
            text = (
                f"function set{label}(uint256 value) external onlyOwner {{\n"
                f"  {noun}Value = value;\n"
                f"  emit {label}Updated(value);\n"
                "}"
            )
            level = "function"
        elif variant == 1:
            text = (
                f"modifier only{label}Owner(uint256 id) {{\n"
                f"  require({noun}Owner[id] == msg.sender, \"not owner\");\n"
                "  _;\n"
                "}"
            )
            level = "function"
        elif variant == 2:
            text = (
                f"function claim{label}(uint256 id) external {{\n"
                f"  require(!{noun}Claimed[id], \"already claimed\");\n"
                f"  {noun}Claimed[id] = true;\n"
                "  _mint(msg.sender, id);\n"
                "}"
            )
            level = "function"
        elif variant == 3:
            text = (
                f"function _authorize{label}(address account) internal view {{\n"
                f"  if (!hasRole({label.upper()}_ROLE, account)) {{\n"
                "    revert Unauthorized(account);\n"
                "  }\n"
                "}"
            )
            level = "function"
        else:
            text = (
                f"event {label}Configured(address indexed account, uint256 value);\n"
                f"mapping(address => uint256) private {noun}Balance;\n"
                f"mapping(uint256 => bool) private {noun}Claimed;"
            )
            level = "block"
        snippets.append(entry("solidity", "evm", index + 1, text, level))
    return snippets


def build_rust() -> list[dict]:
    snippets: list[dict] = []
    frameworks = ["cli", "server", "terminal", "tauri", "web"]
    for index in range(GENERATED_SNIPPETS_PER_LANGUAGE):
        noun = NOUNS[index % len(NOUNS)]
        typ = pascal(noun)
        framework = frameworks[index % len(frameworks)]
        variant = index % 5
        if variant == 0:
            text = (
                f"fn parse_{noun}_id(value: &str) -> Result<{typ}Id> {{\n"
                "  let id = value.parse()?;\n"
                "  Ok(id)\n"
                "}"
            )
            level = "function"
        elif variant == 1:
            text = (
                f"match {noun}.status {{\n"
                "  Status::Active => render_active(row),\n"
                "  Status::Pending => render_pending(row),\n"
                "  Status::Archived => return None,\n"
                "}"
            )
            level = "block"
        elif variant == 2:
            text = (
                f"impl {typ}Store {{\n"
                f"  pub fn get(&self, id: {typ}Id) -> Option<&{typ}> {{\n"
                "    self.items.get(&id)\n"
                "  }\n"
                "}"
            )
            level = "block"
        elif variant == 3:
            text = (
                f"async fn load_{noun}(State(state): State<AppState>) -> Json<Vec<{typ}>> {{\n"
                f"  let items = state.{noun}s.read().await.clone();\n"
                "  Json(items)\n"
                "}"
            )
            level = "function"
        else:
            text = (
                f"let visible_{noun}s = {noun}s\n"
                "  .iter()\n"
                "  .filter(|item| item.enabled)\n"
                "  .collect::<Vec<_>>();"
            )
            level = "block"
        snippets.append(entry("rust", framework, index + 1, text, level))
    return snippets


def build_html() -> list[dict]:
    snippets: list[dict] = []
    for index in range(GENERATED_SNIPPETS_PER_LANGUAGE):
        noun = NOUNS[index % len(NOUNS)]
        title = pascal(noun)
        variant = index % 5
        if variant == 0:
            text = (
                f"<form class=\"{noun}-form\" method=\"post\">\n"
                f"  <label for=\"{noun}-name\">{title} name</label>\n"
                f"  <input id=\"{noun}-name\" name=\"name\" autocomplete=\"off\" />\n"
                "  <button type=\"submit\">Save</button>\n"
                "</form>"
            )
        elif variant == 1:
            text = (
                f"<section class=\"{noun}-summary\" aria-labelledby=\"{noun}-title\">\n"
                f"  <h2 id=\"{noun}-title\">{title}</h2>\n"
                "  <p data-state=\"empty\">No items yet.</p>\n"
                "</section>"
            )
        elif variant == 2:
            text = (
                f"<table class=\"{noun}-table\">\n"
                "  <thead><tr><th>Name</th><th>Status</th></tr></thead>\n"
                f"  <tbody id=\"{noun}-rows\"></tbody>\n"
                "</table>"
            )
        elif variant == 3:
            text = (
                f"<dialog id=\"{noun}-dialog\">\n"
                "  <form method=\"dialog\">\n"
                "    <button value=\"cancel\">Cancel</button>\n"
                "    <button value=\"confirm\">Confirm</button>\n"
                "  </form>\n"
                "</dialog>"
            )
        else:
            text = (
                f"<nav class=\"{noun}-tabs\" aria-label=\"{title} views\">\n"
                "  <a href=\"#overview\" aria-current=\"page\">Overview</a>\n"
                "  <a href=\"#activity\">Activity</a>\n"
                "</nav>"
            )
        snippets.append(entry("html", "web", index + 1, text, "block"))
    return snippets


def build_css() -> list[dict]:
    snippets: list[dict] = []
    for index in range(GENERATED_SNIPPETS_PER_LANGUAGE):
        noun = NOUNS[index % len(NOUNS)]
        adjective = ADJECTIVES[index % len(ADJECTIVES)]
        variant = index % 5
        if variant == 0:
            text = (
                f".{noun}-grid {{\n"
                "  display: grid;\n"
                "  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));\n"
                "  gap: 1rem;\n"
                "}"
            )
        elif variant == 1:
            text = (
                f".{noun}-button[data-state=\"{adjective}\"] {{\n"
                "  border-color: var(--accent);\n"
                "  background: color-mix(in srgb, var(--accent) 12%, transparent);\n"
                "}"
            )
        elif variant == 2:
            text = (
                f"@media (min-width: 48rem) {{\n"
                f"  .{noun}-layout {{\n"
                "    grid-template-columns: 18rem minmax(0, 1fr);\n"
                "  }\n"
                "}"
            )
        elif variant == 3:
            text = (
                f".{noun}-panel:focus-within {{\n"
                "  outline: 2px solid var(--focus-ring);\n"
                "  outline-offset: 2px;\n"
                "}"
            )
        else:
            text = (
                f".{noun}-list > li + li {{\n"
                "  border-top: 1px solid var(--border-subtle);\n"
                "  padding-block-start: 0.75rem;\n"
                "}"
            )
        snippets.append(entry("css", "web", index + 1, text, "block"))
    return snippets


def build_scss() -> list[dict]:
    snippets: list[dict] = []
    for index in range(GENERATED_SNIPPETS_PER_LANGUAGE):
        noun = NOUNS[index % len(NOUNS)]
        variant = index % 5
        if variant == 0:
            text = (
                f".{noun}-card {{\n"
                "  padding: $space-4;\n"
                "  border: 1px solid $border-subtle;\n"
                "  &__title {\n"
                "    font-weight: 600;\n"
                "  }\n"
                "}"
            )
        elif variant == 1:
            text = (
                f"@mixin {noun}-focus-ring($color) {{\n"
                "  outline: 2px solid $color;\n"
                "  outline-offset: 2px;\n"
                "}"
            )
        elif variant == 2:
            text = (
                f"@each $tone, $value in ${noun}-tones {{\n"
                f"  .{noun}-badge--#{{$tone}} {{\n"
                "    background-color: $value;\n"
                "  }\n"
                "}"
            )
        elif variant == 3:
            text = (
                f".{noun}-stack {{\n"
                "  display: flex;\n"
                "  flex-direction: column;\n"
                "  gap: $space-3;\n"
                "}"
            )
        else:
            text = (
                f"@include media-breakpoint-up(md) {{\n"
                f"  .{noun}-shell {{\n"
                "    grid-template-columns: 16rem 1fr;\n"
                "  }\n"
                "}"
            )
        snippets.append(entry("scss", "web", index + 1, text, "block"))
    return snippets


def build_less() -> list[dict]:
    snippets: list[dict] = []
    for index in range(GENERATED_SNIPPETS_PER_LANGUAGE):
        noun = NOUNS[index % len(NOUNS)]
        variant = index % 5
        if variant == 0:
            text = (
                f"@{noun}-accent: #2563eb;\n"
                f".{noun}-button {{\n"
                "  color: #fff;\n"
                f"  background: @{noun}-accent;\n"
                "}"
            )
        elif variant == 1:
            text = (
                f".{noun}-focus-ring(@color) {{\n"
                "  outline: 2px solid @color;\n"
                "  outline-offset: 2px;\n"
                "}"
            )
        elif variant == 2:
            text = (
                f".{noun}-card {{\n"
                "  padding: @space-md;\n"
                "  &__title {\n"
                "    font-weight: 600;\n"
                "  }\n"
                "}"
            )
        elif variant == 3:
            text = (
                f"@media (min-width: @screen-md) {{\n"
                f"  .{noun}-layout {{\n"
                "    grid-template-columns: 240px 1fr;\n"
                "  }\n"
                "}"
            )
        else:
            text = (
                f".{noun}-status(@state, @color) {{\n"
                f"  .{noun}-badge[data-state=\"@{{state}}\"] {{\n"
                "    border-color: @color;\n"
                "  }\n"
                "}"
            )
        snippets.append(entry("less", "web", index + 1, text, "block"))
    return snippets


def main() -> None:
    builders = {
        "typescript": build_typescript,
        "javascript": build_javascript,
        "vue": build_vue,
        "solidity": build_solidity,
        "rust": build_rust,
        "html": build_html,
        "css": build_css,
        "scss": build_scss,
        "less": build_less,
    }
    for name, builder in builders.items():
        write(name, builder())


if __name__ == "__main__":
    main()
