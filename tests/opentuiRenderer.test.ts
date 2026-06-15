import { describe, expect, test } from "bun:test";

import {
  ghostViewportSlice,
  ghostVisualRowCount,
  renderGhostText,
  ghostRows,
  wrapGhostWordBlockLoose,
} from "../src/ui/opentui/screens/ghostText";
import {
  startStagePlanFirstLesson,
  activateOpenTuiMenuItem,
  createOpenTuiCompletionState,
  createOpenTuiExitConfirmationState,
  createOpenTuiCodeFilterState,
  createOpenTuiInitialState,
  createOpenTuiPracticeOptionsState,
  createOpenTuiSettingsState,
  createOpenTuiStatsState,
  createOpenTuiGoalOnboardingState,
  createOpenTuiSummaryState,
  defaultKeyAggregate,
  defaultSessionRecord,
  heatScaleColor,
  renderOpenTuiAppOnce,
  type ContentLibrary,
  type OpenTuiAppState,
  type OpenTuiRendererKit,
  type PracticeLesson,
  type PracticePlan,
} from "../src/index";

interface FakeNode {
  type: "Box" | "Text" | "ScrollBox";
  props: Record<string, unknown>;
  children: FakeNode[];
}

describe("OpenTUI renderer adapter", () => {
  test("creates a CLI renderer with ctrl-c exit enabled", async () => {
    const kit = fakeKit();

    await renderOpenTuiAppOnce(createOpenTuiInitialState("en"), kit);

    expect(kit.createdOptions).toEqual([{ exitOnCtrlC: true }]);
  });

  test("renders main menu labels through OpenTUI constructs", async () => {
    const kit = fakeKit();

    await renderOpenTuiAppOnce(createOpenTuiInitialState("en"), kit);

    const root = findNodeById(kit.addedNodes, "keyloop-open-tui-root");
    expect(root?.props.width).toBe(96);
    expect(root?.props.marginLeft).toBe("auto");
    expect(root?.props.marginRight).toBe("auto");
    const content = flattenContent(kit.addedNodes);
    expect(content).toContain("KeyLoop");
    expect(content).toContain("Full practice");
    expect(content).toContain("Programming basics");
    expect(content).toContain("Stats");

    const comprehensive = findNodeById(kit.addedNodes, "keyloop-menu-item-comprehensive");
    expect(comprehensive?.type).toBe("Box");
    expect(comprehensive?.props.height).toBe(2);
    expect(comprehensive?.props.flexShrink).toBe(0);
    expect(findNodeById(kit.addedNodes, "keyloop-menu-item-comprehensive-rail")?.type).toBe("Box");
    expect(
      findNodeById(kit.addedNodes, "keyloop-menu-item-comprehensive-rail-0")?.props.content,
    ).toBe("▌");
    expect(findNodeById(kit.addedNodes, "keyloop-menu-item-comprehensive-number")?.props.content).toBe(" 1 ");
    expectAnsiSlot(
      findNodeById(kit.addedNodes, "keyloop-menu-item-comprehensive-number")?.props.fg,
      0,
      "black",
    );
    expect(findNodeById(kit.addedNodes, "keyloop-menu-item-comprehensive-number")?.props.attributes).toBe(1);
    expect(findNodeById(kit.addedNodes, "keyloop-menu-item-comprehensive-tag")?.props.content).toBe(" adaptive ");
  });

  test("keeps long second-level menus scrolled around the selected item", async () => {
    const kit = fakeKit();
    const foundationState = activateOpenTuiMenuItem(
      createOpenTuiInitialState("zh"),
      "foundation",
      appContext(),
    );
    if (foundationState.route.screen !== "submenu") {
      throw new Error("expected foundation submenu route");
    }
    const state = {
      ...foundationState,
      route: { ...foundationState.route, selected_index: 16 },
    };

    await withStdoutRows(44, async () => {
      await renderOpenTuiAppOnce(state, kit);
    });

    expect(findNodeById(kit.addedNodes, "keyloop-menu-screen")?.props.flexGrow).toBe(1);
    expect(findNodeById(kit.addedNodes, "keyloop-menu-screen")?.props.height).toBe("100%");
    expect(findNodeById(kit.addedNodes, "keyloop-menu-panel")?.props.height).toBe("100%");
    expect(findNodeById(kit.addedNodes, "keyloop-menu-card-list")?.props.height).toBe("100%");
    expect(findNodeById(kit.addedNodes, "keyloop-menu-item-foundation_home_row")).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-menu-item-foundation_capitalization")?.type).toBe(
      "Box",
    );
    expect(findNodeById(kit.addedNodes, "keyloop-menu-item-foundation_capitalization")?.props.height).toBe(2);
    expect(findNodeById(kit.addedNodes, "keyloop-menu-item-foundation_capitalization")?.props.flexShrink).toBe(0);
    expect(findNodeById(kit.addedNodes, "keyloop-menu-item-foundation_mix")?.type).toBe("Box");
    expect(findNodeById(kit.addedNodes, "keyloop-menu-scrollbar")?.type).toBe("Box");
    expect(findNodeById(kit.addedNodes, "keyloop-menu-scrollbar")?.props.height).toBe("100%");
    expect(findNodeById(kit.addedNodes, "keyloop-menu-scrollbar-thumb")?.type).toBe("Box");
    expect(findNodeById(kit.addedNodes, "keyloop-menu-scrollbar-thumb")?.props.flexGrow).toBeGreaterThan(
      1,
    );
  });

  test("renders temporary ANSI palette with color swatches and semantic mappings", async () => {
    const kit = fakeKit();
    const state = activateOpenTuiMenuItem(
      createOpenTuiInitialState("en"),
      "ansi_palette",
      appContext(),
    );

    await renderOpenTuiAppOnce(state, kit);

    const content = flattenContent(kit.addedNodes);
    expect(content).toContain("ANSI palette");
    expect(content).toContain("Terminal ANSI slots");
    expect(content).toContain("Scroll to inspect every ANSI slot");
    expect(content).toContain("KeyLoop semantics");
    expect(content).toContain("brightBlack");
    expect(content).toContain("brightBlue");
    expect(content).toContain("wrong.bg -> red");
    expect(findNodeById(kit.addedNodes, "keyloop-palette-scrollbox")?.type).toBe("ScrollBox");
    expect(findNodeById(kit.addedNodes, "keyloop-palette-scrollbox")?.props.scrollY).toBe(true);
    expect(findNodeById(kit.addedNodes, "keyloop-palette-scrollbox")?.props.flexGrow).toBe(1);
    expectAnsiSlot(findNodeById(kit.addedNodes, "keyloop-palette-swatch-red")?.props.bg, 1, "red");
    expectAnsiSlot(
      findNodeById(kit.addedNodes, "keyloop-palette-swatch-brightBlack")?.props.bg,
      8,
      "brightBlack",
    );
    expectAnsiSlot(
      findNodeById(kit.addedNodes, "keyloop-palette-swatch-brightBlue")?.props.bg,
      12,
      "brightBlue",
    );
    expectDefaultForeground(
      findNodeById(kit.addedNodes, "keyloop-palette-semantic-foreground")?.props.fg,
    );
    expectDefaultForeground(
      findNodeById(kit.addedNodes, "keyloop-palette-semantic-white")?.props.fg,
    );
    expectAnsiSlot(
      findNodeById(kit.addedNodes, "keyloop-palette-semantic-keyword")?.props.fg,
      5,
      "magenta",
    );
    expectAnsiSlot(
      findNodeById(kit.addedNodes, "keyloop-palette-semantic-function")?.props.fg,
      4,
      "blue",
    );
    expectAnsiSlot(
      findNodeById(kit.addedNodes, "keyloop-palette-semantic-string")?.props.fg,
      3,
      "yellow",
    );
  });

  test("renders settings as a flat editable list instead of menu cards", async () => {
    const kit = fakeKit();
    const state = activateOpenTuiMenuItem(
      createOpenTuiInitialState("en"),
      "settings",
      appContext(),
    );

    await renderOpenTuiAppOnce(state, kit);

    const content = flattenContent(kit.addedNodes);
    expect(findNodeById(kit.addedNodes, "keyloop-settings-list")?.type).toBe("Box");
    expect(findNodeById(kit.addedNodes, "keyloop-settings-list")?.props.border).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-settings-section-code-rule")?.type).toBe("Text");
    expect(findNodeById(kit.addedNodes, "keyloop-settings-row-0")?.props.backgroundColor).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-settings-row-0-rail")?.type).toBe("Box");
    expect(findNodeById(kit.addedNodes, "keyloop-settings-row-0-rail-0")?.props.content).toBe("▌");
    expect(findNodeById(kit.addedNodes, "keyloop-menu-item-settings-language")).toBeUndefined();
    expect(content).toContain("Interface language");
    expect(content).toContain("Code settings");
    expect(content).toContain("Code language/framework");
    expect(content).toContain("Code difficulty");
    expect(content).toContain("Code length");
    expect(content).not.toContain("Code formatter");
    expect(content).not.toContain("Code trailing commas");
    expect(content).not.toContain("Everyday word count");
    expect(content).not.toContain("Word breakdown in full practice");
    expect(findNodeById(kit.addedNodes, "keyloop-route-panel")).toBeUndefined();
    expect(content).not.toContain("Scope framework: react");
  });

  test("renders code scope as an independent picker panel", async () => {
    const kit = fakeKit();
    const state = createOpenTuiSettingsState("en", "code_filters", {
      codeFilters: createOpenTuiCodeFilterState({
        options: [
          { facet: "language", value: "typescript", count: 120 },
          { facet: "framework", value: "react", count: 30 },
          { facet: "project", value: "zig-demo", count: 2 },
        ],
        query: "rea",
      }),
    });

    await renderOpenTuiAppOnce(state, kit);

    const content = flattenContent(kit.addedNodes);
    expect(findNodeById(kit.addedNodes, "keyloop-code-filter-picker")?.type).toBe("Box");
    expect(findNodeById(kit.addedNodes, "keyloop-code-filter-picker")?.props.height).toBe("100%");
    expect(findNodeById(kit.addedNodes, "keyloop-code-filter-picker")?.props.border).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-code-filter-picker-header")).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-code-filter-picker-label")).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-code-filter-picker-search-panel")?.props.border).toBe(true);
    expect(findNodeById(kit.addedNodes, "keyloop-code-filter-picker-body")?.type).toBe("Box");
    expect(findNodeById(kit.addedNodes, "keyloop-code-filter-picker-body")?.props.flexGrow).toBe(1);
    expect(findNodeById(kit.addedNodes, "keyloop-code-filter-picker-body")?.props.height).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-code-filter-picker-results")?.props.height).toBe("100%");
    expect(findNodeById(kit.addedNodes, "keyloop-code-filter-picker-list")?.props.height).toBe("100%");
    expect(findNodeById(kit.addedNodes, "keyloop-code-filter-picker-preview")).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-code-filter-picker-accent")).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-code-filter-picker-input")?.type).toBe("Box");
    expect(findNodeById(kit.addedNodes, "keyloop-code-filter-picker-input")?.props.backgroundColor).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-code-filter-picker-query-label")?.props.content).toBe("⌕");
    expect(
      findNodeById(kit.addedNodes, "keyloop-code-filter-picker-search-panel")?.props.bottomTitle,
    ).toBe(" 0 selected ");
    expect(findNodeById(kit.addedNodes, "keyloop-code-filter-picker-row-1")?.props.height).toBe(2);
    expect(findNodeById(kit.addedNodes, "keyloop-code-filter-picker-row-1-rail")?.type).toBe("Box");
    expect(findNodeById(kit.addedNodes, "keyloop-code-filter-picker-row-1-check")?.props.content).toBe("○");
    expectDefaultForeground(findNodeById(kit.addedNodes, "keyloop-code-filter-picker-row-1-check")?.props.fg);
    expect(content).toContain("Code language/framework");
    expect(content).toContain("rea");
    expect(content).toContain("framework: react");
    expect(content).not.toContain("language: typescript");
  });

  test("localizes the code picker copy in Chinese", async () => {
    const kit = fakeKit();
    const state = createOpenTuiSettingsState("zh", "code_filters", {
      codeFilters: createOpenTuiCodeFilterState({
        options: [
          { facet: "language", value: "typescript", count: 120 },
          { facet: "framework", value: "react", count: 30 },
        ],
        selected: [{ facet: "language", value: "typescript" }],
        pinned: [{ facet: "framework", value: "react" }],
      }),
    });

    await renderOpenTuiAppOnce(state, kit);

    const content = flattenContent(kit.addedNodes);
    expect(findNodeById(kit.addedNodes, "keyloop-code-filter-picker-query-label")?.props.content).toBe("⌕");
    expect(
      findNodeById(kit.addedNodes, "keyloop-code-filter-picker-search-panel")?.props.bottomTitle,
    ).toBe(" 已选 1 ");
    expect(content).toContain("框架: react");
    expect(content).toContain("框架 · 30 个片段 · 已固定");
    expect(content).not.toContain("Search");
    expect(content).not.toContain("matches");
    expect(content).not.toContain("pinned");
  });

  test("renders code picker list into the remaining picker height with a scrollbar", async () => {
    const kit = fakeKit();
    const state = createOpenTuiSettingsState("en", "code_filters", {
      codeFilters: createOpenTuiCodeFilterState({
        options: Array.from({ length: 18 }, (_, index) => ({
          facet: "language",
          value: `language-${index + 1}`,
          count: index + 1,
        })),
        index: 10,
      }),
    });

    await withStdoutRows(40, async () => {
      await renderOpenTuiAppOnce(state, kit);
    });

    expect(findNodeById(kit.addedNodes, "keyloop-code-filter-picker-body")?.props.flexGrow).toBe(1);
    expect(findNodeById(kit.addedNodes, "keyloop-code-filter-picker-list")?.props.height).toBe("100%");
    expect(findNodeById(kit.addedNodes, "keyloop-code-filter-picker-row-13")?.type).toBe("Box");
    expect(findNodeById(kit.addedNodes, "keyloop-code-filter-picker-scrollbar")?.type).toBe("Box");
    expect(findNodeById(kit.addedNodes, "keyloop-code-filter-picker-scrollbar")?.props.height).toBe("100%");
    expect(findNodeById(kit.addedNodes, "keyloop-code-filter-picker-scrollbar-thumb")?.type).toBe("Box");
  });

  test("serializes concurrent state renders without duplicating the root", async () => {
    const kit = fakeKit();
    const renderer = await renderOpenTuiAppOnce(createOpenTuiInitialState("en"), kit);

    await Promise.all([
      renderer.renderState?.(createOpenTuiInitialState("zh")),
      renderer.renderState?.(createOpenTuiStatsState("en", [])),
    ]);

    expect(kit.addedNodes.filter((node) => node.props.id === "keyloop-open-tui-root")).toHaveLength(
      1,
    );
    const content = flattenContent(kit.addedNodes);
    expect(content).toContain("Stats");
    expect(content).not.toContain("练习菜单");
  });

  test("preserves the renderer destroy receiver while guarding pending renders", async () => {
    const addedNodes: FakeNode[] = [];
    let destroyed = false;
    let receivedRendererThis = false;
    const kit: OpenTuiRendererKit = {
      Box: (props, ...children) => ({ type: "Box", props, children }),
      Text: (props) => ({ type: "Text", props, children: [] }),
      createCliRenderer: async () => {
        const renderer = {
          root: {
            add: (...nodes: unknown[]) => {
              addedNodes.push(...(nodes as FakeNode[]));
            },
            remove: (id: string) => {
              for (let index = addedNodes.length - 1; index >= 0; index -= 1) {
                if (addedNodes[index]?.props.id === id) {
                  addedNodes.splice(index, 1);
                }
              }
            },
          },
          idle: async () => {},
          destroy() {
            receivedRendererThis = this === renderer;
            destroyed = true;
          },
        };
        return renderer;
      },
    };
    const renderer = await renderOpenTuiAppOnce(createOpenTuiInitialState("en"), kit);

    renderer.destroy?.();

    expect(destroyed).toBe(true);
    expect(receivedRendererThis).toBe(true);
  });

  test("renders running route target text", async () => {
    const context = appContext();
    const state = startStagePlanFirstLesson(
      activateOpenTuiMenuItem(createOpenTuiInitialState("en"), "comprehensive", context),
    );
    if (state.route.screen !== "running") {
      throw new Error("expected running state");
    }
    state.route.target = {
      mode: "words",
      text: "asdf jkl;",
      source: "test:renderer",
    };
    const kit = fakeKit();

    await renderOpenTuiAppOnce(state, kit);

    const content = flattenContent(kit.addedNodes);
    expect(content).toContain("Running");
    expect(content).toContain("foundation_input");
    expect(content).toContain("sdf jkl");
  });

  test("aligns word translations in columns under their words", async () => {
    const running: OpenTuiAppState = {
      language: "zh",
      route: {
        screen: "running",
        source_item: "everyday_words",
        target: {
          mode: "words",
          text: "info practice",
          source: "keyloop:module:everyday-english:words-1000",
          annotations: [
            {
              start: 0,
              end: 4,
              translation_zh: "信息；资料",
              display: "word",
            },
            {
              start: 5,
              end: 13,
              translation_zh: "练习",
              display: "word",
            },
          ],
        },
      },
    };
    const kit = fakeKit();

    await renderOpenTuiAppOnce(running, kit);

    // "信息；资料" is 10 columns wide, wider than "info" + space, so the word
    // row stretches: info starts at column 0, practice at column 11.
    expect(flattenContent([
      findNodeById(kit.addedNodes, "keyloop-ghost-line-0") as FakeNode,
    ]).replace(/\n/gu, "")).toBe("info       practice");
    const meaningLine = findNodeById(kit.addedNodes, "keyloop-ghost-meaning-line-0");
    expect(meaningLine).toBeDefined();
    expect(flattenContent([meaningLine as FakeNode]).replace(/\n/gu, "")).toBe(
      "信息；资料 练习",
    );
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-content")?.children.map(
      (child) => child.props.id,
    )).toEqual(["keyloop-ghost-line-0", "keyloop-ghost-meaning-line-0"]);
  });

  test("wraps the word stream into a uniform grid with aligned translations on every row", async () => {
    const running: OpenTuiAppState = {
      language: "zh",
      route: {
        screen: "running",
        source_item: "everyday_words",
        target: {
          mode: "words",
          text: "cat dog fox",
          source: "keyloop:module:everyday-english:words-1000",
          annotations: [
            { start: 0, end: 3, translation_zh: "猫科动物宠物", display: "word" },
            { start: 4, end: 7, translation_zh: "犬类动物伙伴", display: "word" },
            { start: 8, end: 11, translation_zh: "狡猾的狐狸先生", display: "word" },
          ],
        },
      },
    };
    const kit = fakeKit();

    // wrap width becomes 32 columns; the widest cell ("狡猾的狐狸先生" = 14)
    // makes each grid column 15 wide, so only two words fit per row.
    await withStdoutColumns(40, async () => {
      await renderOpenTuiAppOnce(running, kit);
    });

    expect(findNodeById(kit.addedNodes, "keyloop-ghost-content")?.children.map(
      (child) => child.props.id,
    )).toEqual([
      "keyloop-ghost-line-0",
      "keyloop-ghost-meaning-line-0",
      "keyloop-ghost-line-1",
      "keyloop-ghost-meaning-line-1",
    ]);
    expect(flattenContent([
      findNodeById(kit.addedNodes, "keyloop-ghost-line-0") as FakeNode,
    ]).replace(/\n/gu, "")).toBe("cat            dog ");
    expect(flattenContent([
      findNodeById(kit.addedNodes, "keyloop-ghost-meaning-line-0") as FakeNode,
    ]).replace(/\n/gu, "")).toBe("猫科动物宠物   犬类动物伙伴");
    expect(flattenContent([
      findNodeById(kit.addedNodes, "keyloop-ghost-line-1") as FakeNode,
    ]).replace(/\n/gu, "")).toBe("fox");
    expect(flattenContent([
      findNodeById(kit.addedNodes, "keyloop-ghost-meaning-line-1") as FakeNode,
    ]).replace(/\n/gu, "")).toBe("狡猾的狐狸先生");
  });

  test("packs repeated long-word items without a uniform grid", async () => {
    const running: OpenTuiAppState = {
      language: "zh",
      route: {
        screen: "running",
        source_item: "technical_long_words",
        target: {
          mode: "words",
          text:
            "alpha alpha beta beta gamma gamma delta delta",
          source: "keyloop:module:word-breakdown:alpha",
          annotations: [
            { start: 0, end: 11, translation_zh: "甲", display: "word_loose" },
            { start: 12, end: 21, translation_zh: "乙", display: "word_loose" },
            { start: 22, end: 33, translation_zh: "很长的伽马释义", display: "word_loose" },
            { start: 34, end: 45, translation_zh: "丁", display: "word_loose" },
          ],
        },
      },
    };
    const kit = fakeKit();

    await withStdoutColumns(40, async () => {
      await renderOpenTuiAppOnce(running, kit);
    });

    expect(findNodeById(kit.addedNodes, "keyloop-ghost-content")?.children.map(
      (child) => child.props.id,
    )).toEqual([
      "keyloop-ghost-line-0",
      "keyloop-ghost-meaning-line-0",
      "keyloop-ghost-line-1",
      "keyloop-ghost-meaning-line-1",
    ]);
    expect(flattenContent([
      findNodeById(kit.addedNodes, "keyloop-ghost-line-0") as FakeNode,
    ]).replace(/\n/gu, "")).toBe("alpha alpha beta beta");
    expect(flattenContent([
      findNodeById(kit.addedNodes, "keyloop-ghost-meaning-line-0") as FakeNode,
    ]).replace(/\n/gu, "")).toBe("甲          乙");
    expect(flattenContent([
      findNodeById(kit.addedNodes, "keyloop-ghost-line-1") as FakeNode,
    ]).replace(/\n/gu, "")).toBe("gamma gamma    delta delta");
    expect(flattenContent([
      findNodeById(kit.addedNodes, "keyloop-ghost-meaning-line-1") as FakeNode,
    ]).replace(/\n/gu, "")).toBe("很长的伽马释义 丁");
  });

  test("keeps the cursor visible on the separator after a repeated long-word item", async () => {
    const running: OpenTuiAppState = {
      language: "zh",
      route: {
        screen: "running",
        source_item: "technical_long_words",
        target: {
          mode: "words",
          text: "alpha alpha beta beta",
          source: "keyloop:module:word-breakdown:alpha",
          annotations: [
            { start: 0, end: 11, translation_zh: "甲", display: "word_loose" },
            { start: 12, end: 21, translation_zh: "乙", display: "word_loose" },
          ],
        },
        live: {
          input: "alpha alpha",
          elapsed_ms: 1000,
          key_events: [],
          metrics: { wpm: 0, raw_wpm: 0, accuracy: 100, errors: 0, backspaces: 0 },
        },
      },
    };
    const kit = fakeKit();

    await renderOpenTuiAppOnce(running, kit);

    const cursorNodes = findNodesByIdPrefix(kit.addedNodes, "keyloop-ghost-cursor-");
    expect(cursorNodes.map((node) => node.props.content)).toEqual([" "]);
  });

  test("wraps repeated long-word items at word boundaries", () => {
    const text = [
      "infrastructure",
      "infrastructure",
      "infrastructure",
      "infrastructure",
    ].join(" ");
    const [row] = ghostRows(text, "", undefined, false);

    const blockRows = wrapGhostWordBlockLoose(
      row ?? [],
      [{ srcStartCol: 0, srcEndCol: text.length, translation: "基础设施", loose: true }],
      32,
    );

    expect(blockRows.map((blockRow) => flattenGhostSegments(blockRow.segments))).toEqual([
      "infrastructure infrastructure",
      "infrastructure infrastructure",
    ]);
    expect(blockRows.map((blockRow) => blockRow.meaning)).toEqual(["", "基础设施"]);
  });

  test("renders wrapped repeated word translations below all English rows", async () => {
    const text = [
      "availability",
      "availability",
      "availability",
      "availability",
      "availability",
    ].join(" ");
    const running: OpenTuiAppState = {
      language: "zh",
      route: {
        screen: "running",
        source_item: "technical_long_words",
        target: {
          mode: "words",
          text,
          source: "keyloop:module:word-breakdown:availability",
          annotations: [
            {
              start: 0,
              end: text.length,
              translation_zh: "有效性",
              display: "word_loose",
            },
          ],
        },
      },
    };
    const kit = fakeKit();

    await withStdoutColumns(64, async () => {
      await renderOpenTuiAppOnce(running, kit);
    });

    expect(findNodeById(kit.addedNodes, "keyloop-ghost-content")?.children.map(
      (child) => child.props.id,
    )).toEqual([
      "keyloop-ghost-line-0",
      "keyloop-ghost-line-1",
      "keyloop-ghost-meaning-line-1",
    ]);
    expect(flattenContent([
      findNodeById(kit.addedNodes, "keyloop-ghost-line-0") as FakeNode,
    ]).replace(/\n/gu, "")).toBe(
      "availability availability availability availability",
    );
    expect(flattenContent([
      findNodeById(kit.addedNodes, "keyloop-ghost-line-1") as FakeNode,
    ]).replace(/\n/gu, "")).toBe("availability");
    expect(flattenContent([
      findNodeById(kit.addedNodes, "keyloop-ghost-meaning-line-1") as FakeNode,
    ]).replace(/\n/gu, "")).toBe("有效性");
  });

  test("keeps the cursor visible on a wrapped repeated long-word separator", () => {
    const text = [
      "infrastructure",
      "infrastructure",
      "infrastructure",
      "infrastructure",
    ].join(" ");
    const [row] = ghostRows(text, "infrastructure infrastructure", undefined, false);

    const blockRows = wrapGhostWordBlockLoose(
      row ?? [],
      [{ srcStartCol: 0, srcEndCol: text.length, translation: "基础设施", loose: true }],
      32,
    );

    expect(flattenGhostSegments(blockRows[0]?.segments ?? [])).toBe(
      "infrastructure infrastructure ",
    );
  });

  test("wraps long decomposition rows and shows the full translation below", async () => {
    const text =
      "information in in for for ma ma tion tion information information information";
    const translation = "n. 信息；资料；情报；通知；消息；数据";
    const running: OpenTuiAppState = {
      language: "zh",
      route: {
        screen: "running",
        source_item: "everyday_word_decomposition",
        target: {
          mode: "words",
          text,
          source: "keyloop:module:everyday-english:word-decomposition-cet4",
          annotations: [
            { start: 0, end: 11, translation_zh: translation, display: "line" },
          ],
        },
      },
    };
    const kit = fakeKit();

    await withStdoutColumns(40, async () => {
      await renderOpenTuiAppOnce(running, kit);
    });

    // The 78-column row must wrap instead of being cut off at 32 columns.
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-line-1")).toBeDefined();
    const ghost = findNodeById(kit.addedNodes, "keyloop-ghost-content") as FakeNode;
    const ids = ghost.children.map((child) => String(child.props.id));
    expect(ids.at(-1)).toMatch(/^keyloop-ghost-line-translation-/u);
    const translationNode = ghost.children.at(-1) as FakeNode;
    // The 36-column translation wraps onto two lines instead of truncating.
    expect(translationNode.children.length).toBeGreaterThan(1);
    expect(flattenContent([translationNode]).replace(/\n/gu, "")).toBe(translation);
  });

  test("renders sentence translations directly below each sentence inside the typing panel", async () => {
    const sentenceState: OpenTuiAppState = {
      language: "zh",
      route: {
        screen: "running",
        source_item: "everyday_sentences",
        target: {
          mode: "words",
          text: "Practice builds skill.\nFeedback guides progress.",
          source: "keyloop:module:everyday-english:sentences-cet4:short",
          annotations: [
            {
              start: 0,
              end: "Practice builds skill.".length,
              translation_zh: "练习培养技能。",
              display: "line",
            },
            {
              start: "Practice builds skill.\n".length,
              end: "Practice builds skill.\nFeedback guides progress.".length,
              translation_zh: "反馈指引进步。",
              display: "line",
            },
          ],
        },
      },
    };
    const kit = fakeKit();

    await renderOpenTuiAppOnce(sentenceState, kit);

    expect(findNodeById(kit.addedNodes, "keyloop-target-line-translations")).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-content")?.children.map(
      (child) => child.props.id,
    )).toEqual([
      "keyloop-ghost-line-0",
      "keyloop-ghost-line-translation-0",
      "keyloop-ghost-line-1",
      "keyloop-ghost-line-translation-1",
    ]);
    expect(flattenContent([
      findNodeById(kit.addedNodes, "keyloop-ghost-line-translation-0") as FakeNode,
    ])).toContain("练习培养技能。");
    expect(flattenContent([
      findNodeById(kit.addedNodes, "keyloop-ghost-line-translation-1") as FakeNode,
    ])).toContain("反馈指引进步。");
  });

  test("renders the article translation as plain muted lines below the typed text", async () => {
    const articleState: OpenTuiAppState = {
      language: "zh",
      route: {
        screen: "running",
        source_item: "everyday_articles",
        target: {
          mode: "words",
          text: "First paragraph.\nSecond paragraph.",
          source: "keyloop:module:everyday-english:articles-cet4:short:test",
          annotations: [
            {
              start: 0,
              end: "First paragraph.\nSecond paragraph.".length,
              translation_zh: "第一段。\n第二段。",
              source_title: "Test article",
              display: "article",
            },
          ],
        },
      },
    };
    const kit = fakeKit();

    await renderOpenTuiAppOnce(articleState, kit);

    expect(findNodeById(kit.addedNodes, "keyloop-target-article-translation")).toBeUndefined();
    // 文章翻译扁平化为内容列内的行（参与窗口滚动），不再是游离 Box
    const content = findNodeById(kit.addedNodes, "keyloop-ghost-content") as FakeNode;
    expect(flattenContent([content]).replace(/\n/gu, "")).toContain("第一段。 第二段。");
    const ghostChildIds = content.children.map((child) => child.props.id);
    expect(ghostChildIds.at(-1)).toMatch(/^keyloop-ghost-article-translation-/u);
  });

  test("keeps the article translation fully visible by wrapping long text", async () => {
    const translation =
      "这是一段非常长的文章翻译，用来验证整段翻译不会被截断成一行，而是按照可用宽度自动换行完整显示出来，确保练习者能够读到全部内容。"
        .repeat(2);
    const articleState: OpenTuiAppState = {
      language: "zh",
      route: {
        screen: "running",
        source_item: "everyday_articles",
        target: {
          mode: "words",
          text: "First paragraph.",
          source: "keyloop:module:everyday-english:articles-cet4:short:test",
          annotations: [
            {
              start: 0,
              end: "First paragraph.".length,
              translation_zh: translation,
              display: "article",
            },
          ],
        },
      },
    };
    const kit = fakeKit();

    await renderOpenTuiAppOnce(articleState, kit);

    // 长翻译换行成多行 article_line，全部完整可见（非 TTY 测试不裁剪窗口）
    const content = findNodeById(kit.addedNodes, "keyloop-ghost-content") as FakeNode;
    const articleLines = content.children.filter((child) =>
      String(child.props.id).startsWith("keyloop-ghost-article-translation-"),
    );
    expect(articleLines.length).toBeGreaterThan(1);
    expect(articleLines.map((node) => String(node.props.content)).join("")).toBe(translation);
  });

  test("renders per-article headers and translations for concatenated articles", async () => {
    const text = "First A.\nSecond A.\nFirst B.\nSecond B.";
    const firstEnd = "First A.\nSecond A.".length;
    const secondStart = firstEnd + 1;
    const articleState: OpenTuiAppState = {
      language: "zh",
      route: {
        screen: "running",
        source_item: "everyday_articles",
        target: {
          mode: "words",
          text,
          source: "keyloop:stage:articles:cet4:short:count-2",
          annotations: [
            {
              start: 0,
              end: firstEnd,
              translation_zh: "甲一。\n甲二。",
              source_title: "Article A",
              display: "article",
            },
            {
              start: secondStart,
              end: text.length,
              translation_zh: "乙一。\n乙二。",
              source_title: "Article B",
              display: "article",
            },
          ],
        },
      },
    };
    const kit = fakeKit();

    await renderOpenTuiAppOnce(articleState, kit);

    const content = findNodeById(kit.addedNodes, "keyloop-ghost-content") as FakeNode;
    const ids = content.children.map((child) => String(child.props.id));
    expect(ids.some((id) => id.startsWith("keyloop-ghost-article-header-"))).toBe(true);
    const all = flattenContent([content]).replace(/\n/gu, "");
    expect(all).toContain("Article B");
    expect(all).toContain("甲一。");
    expect(all).toContain("乙一。");
  });

  test("wraps everyday sentences to the fixed app width in wide terminals", async () => {
    const running: OpenTuiAppState = {
      language: "en",
      route: {
        screen: "running",
        source_item: "everyday_sentences",
        target: {
          mode: "words",
          text: "A deliberate practice routine turns small daily efforts into measurable progress when the learner can read feedback and adjust immediately.",
          source: "keyloop:module:everyday-english:sentences-cet4:long",
        },
      },
    };
    const kit = fakeKit();

    await withStdoutColumns(180, async () => {
      await renderOpenTuiAppOnce(running, kit);
    });

    expect(findNodeById(kit.addedNodes, "keyloop-ghost-line-1")?.type).toBe("Box");
  });

  test("wraps word decomposition rows without splitting tokens inside the fixed app width", async () => {
    const running: OpenTuiAppState = {
      language: "en",
      route: {
        screen: "running",
        source_item: "everyday_word_decomposition",
        target: {
          mode: "words",
          text: "information in in for for ma ma tion tion information information information communication com com mu mu ni ni ca ca tion tion communication communication",
          source: "keyloop:module:everyday-english:word-decomposition-cet4",
        },
      },
    };
    const kit = fakeKit();

    await withStdoutColumns(180, async () => {
      await renderOpenTuiAppOnce(running, kit);
    });

    const wrappedLine = findNodeById(kit.addedNodes, "keyloop-ghost-line-1");
    expect(wrappedLine?.type).toBe("Box");
    expect(flattenContent([
      findNodeById(kit.addedNodes, "keyloop-ghost-line-0") as FakeNode,
    ])).toContain("information");
    expect(flattenContent([wrappedLine as FakeNode])).toContain("communication");
  });

  test("renders running route with live metric strip above ghost text", async () => {
    const context = appContext();
    const state = startStagePlanFirstLesson(
      activateOpenTuiMenuItem(createOpenTuiInitialState("en"), "comprehensive", context),
    );
    if (state.route.screen !== "running") {
      throw new Error("expected running state");
    }
    state.route.target = {
      mode: "words",
      text: "asdf jkl;",
      source: "test:renderer",
    };
    state.route.live = {
      input: "asX",
      elapsed_ms: 65_000,
      metrics: {
        wpm: 43.8,
        raw_wpm: 51.2,
        accuracy: 94.7,
        errors: 1,
        backspaces: 0,
      },
      key_events: [
        {
          at_ms: 300,
          action: "insert",
          position: 0,
          expected: "a",
          input: "a",
          correct: true,
        },
        {
          at_ms: 520,
          action: "insert",
          position: 1,
          expected: "s",
          input: "s",
          correct: true,
        },
        {
          at_ms: 780,
          action: "insert",
          position: 2,
          expected: "d",
          input: "X",
          correct: false,
        },
      ],
    };
    state.today_elapsed_ms = 120_000;
    if (state.route.lesson !== undefined) {
      state.route.lesson = {
        ...state.route.lesson,
        id: "20260605-1-d08cf9-01-foundation",
      };
    }
    const kit = fakeKit();

    await renderOpenTuiAppOnce(state, kit);

    const runningScreen = findNodeById(kit.addedNodes, "keyloop-running-screen");
    expect(runningScreen?.children.map((child) => child.props.id)).toEqual([
      "keyloop-practice-overview",
      "keyloop-practice-data",
      "keyloop-ghost-text",
      "keyloop-diagnostics",
    ]);
    expect(findNodeById(kit.addedNodes, "keyloop-lesson-banner")).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-group-progress")?.props.border).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-topbar-today-duration")).toBeDefined();
    expect(
      findNodeById(kit.addedNodes, "keyloop-topbar-today-duration-value")?.props.content,
    ).toBe("3:05");
    const liveMetrics = findNodeById(kit.addedNodes, "keyloop-live-metrics");
    expect(liveMetrics?.props.flexDirection).toBe("row");
    expect(liveMetrics?.props.border).toBeUndefined();
    expect(liveMetrics?.props.width).toBe("100%");
    expect(liveMetrics?.props.height).toBe(1);
    expect(liveMetrics?.children.map((child) => child.props.id)).toEqual([
      "keyloop-live-metric-wpm",
      "keyloop-live-metric-raw",
      "keyloop-live-metric-accuracy",
      "keyloop-live-metric-errors",
    ]);
    expect(findNodeById(kit.addedNodes, "keyloop-live-metric-wpm")?.props.border).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-live-metric-raw")?.props.border).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-live-metric-accuracy")?.props.border).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-live-metric-errors")?.props.border).toBeUndefined();

    const ghostText = findNodeById(kit.addedNodes, "keyloop-ghost-text");
    expect(ghostText?.props.title).toBe(" 跟打文本 ");
    expect(ghostText?.props.height).toBeUndefined();
    expect(ghostText?.props.flexGrow).toBe(1);
    expect(ghostText?.props.bottomTitle).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-typed-0-0")?.props.content).toBe("as");
    expectAnsiSlot(findNodeById(kit.addedNodes, "keyloop-ghost-typed-0-0")?.props.fg, 2, "green");
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-wrong-0-1")?.props.content).toBe("d");
    expectDefaultForeground(findNodeById(kit.addedNodes, "keyloop-ghost-wrong-0-1")?.props.fg);
    expectAnsiSlot(findNodeById(kit.addedNodes, "keyloop-ghost-wrong-0-1")?.props.bg, 1, "red");
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-wrong-0-1")?.props.attributes).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-cursor-0-2")?.props.content).toBe("f");
    expectAnsiSlot(
      findNodeById(kit.addedNodes, "keyloop-ghost-cursor-0-2")?.props.bg,
      3,
      "yellow",
    );
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-pending-0-3")?.props.content).toBe(" jkl;");
    expectAnsiSlot(
      findNodeById(kit.addedNodes, "keyloop-ghost-pending-0-3")?.props.fg,
      8,
      "brightBlack",
    );
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-pending-0-4")).toBeUndefined();

    const content = flattenContent(kit.addedNodes);
    expect(content).not.toContain("ghost code");
    expect(content).not.toContain("no input box");
    expect(content).not.toContain("expected");
    expect(findNodeById(kit.addedNodes, "keyloop-error-ruler")).toBeUndefined();
    expect(content).toContain("WPM");
    expect(content).toContain("43.8");
    expect(content).toContain("Raw");
    expect(content).toContain("51.2");
    expect(content).toContain("Accuracy");
    expect(content).toContain("94.7%");
    expect(content).toContain("Errors");
    expect(content).toContain("1");
    expect(content).toContain("Today");
    expect(content).toContain("3:05");
    expect(content).toContain("Group");
    expect(content).toContain("1:05");
    expect(findNodeById(kit.addedNodes, "keyloop-practice-overview")?.props.title).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-practice-data")?.props.bottomTitle).toBe(
      " correct 2/9 · backspace 0 ",
    );
    expect(findNodeById(kit.addedNodes, "keyloop-today-duration")).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-practice-data")?.children.map((child) => child.props.id)).toEqual([
      "keyloop-live-metrics",
      "keyloop-group-progress-bar",
    ]);
    const duration = findNodeById(kit.addedNodes, "keyloop-lesson-duration");
    expect(duration?.type).toBe("Box");
    expect(findNodeById(kit.addedNodes, "keyloop-lesson-duration-label")?.props.content).toBe(
      "Group",
    );
    expect(findNodeById(kit.addedNodes, "keyloop-lesson-duration-value")?.props.content).toBe(
      "1:05",
    );
    expectAnsiSlot(
      findNodeById(kit.addedNodes, "keyloop-lesson-duration-value")?.props.fg,
      2,
      "green",
    );
    expect(
      findNodeById(kit.addedNodes, "keyloop-practice-overview")?.props.bottomTitle,
    ).toBeUndefined();
    expect(content).not.toContain("lesson 1");
    expect(content).not.toContain("20260605-1-d08cf9-01-foundation");
    expect(content).not.toContain("ANSI theme aware");
    expect(content).not.toContain("UTF-8 grid");
    expect(content).not.toContain("Ctrl+P pause");
    expect(findNodeById(kit.addedNodes, "keyloop-terminal-state")).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-helpbar")).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-lesson-chip")).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-line-number-0")).toBeUndefined();

    const diagnostics = findNodeById(kit.addedNodes, "keyloop-training-diagnostics");
    expect(findNodeById(kit.addedNodes, "keyloop-diagnostics")?.props.flexDirection).toBe(
      "column",
    );
    expect(diagnostics?.props.height).toBe(4);
    expect(diagnostics?.props.overflow).toBeUndefined();
    expect(diagnostics?.props.bottomTitle).toBeUndefined();
    expect(content).not.toContain("All keys:");
    expect(content).toContain("Speed:");
    expect(content).toContain("Errors:");
    // 零档（无数据/低速）不再上背景色
    expect(findNodeById(kit.addedNodes, "keyloop-diagnostic-speed-key-D")?.props.bg).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-diagnostic-speed-row-0")?.props.flexWrap).toBe(
      "nowrap",
    );
    expect(findNodeById(kit.addedNodes, "keyloop-diagnostic-speed-row-0")?.props.overflow).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-diagnostic-error-key-D")?.props.bg).toBe(
      heatScaleColor("danger", 4),
    );
    expect(findNodeById(kit.addedNodes, "keyloop-diagnostic-speed-key-S")?.props.bg).toBe(
      heatScaleColor("success", 2),
    );
    expect(findNodeById(kit.addedNodes, "keyloop-diagnostic-error-key-S")?.props.bg).toBeUndefined();
    expectDefaultForeground(
      findNodeById(kit.addedNodes, "keyloop-diagnostic-error-key-D")?.props.fg,
    );
    expect(content).not.toContain("Focus symbols:");
    expect(content).not.toContain("Hot:");
    expect(content).not.toContain("reset hands");
    const progressBar = findNodeById(kit.addedNodes, "keyloop-group-progress-bar");
    expect(progressBar?.props.flexDirection).toBe("row");
    expect(progressBar?.props.overflow).toBe("hidden");
    const progressFill = findNodeById(kit.addedNodes, "keyloop-group-progress-bar-fill");
    expect(progressFill?.type).toBe("Text");
    expect(progressFill?.props.content).toBe("█".repeat(16));
    expectAnsiSlot(progressFill?.props.fg, 2, "green");
    const progressTrack = findNodeById(kit.addedNodes, "keyloop-group-progress-bar-track");
    expect(progressTrack?.props.content).toBe("░".repeat(56));
    expect(
      findNodeById(kit.addedNodes, "keyloop-group-progress-bar-percent")?.props.content,
    ).toBe(" 22%");
  });

  test("renders current target keys in the diagnostics panel before typing starts", async () => {
    const context = appContext();
    const state = startStagePlanFirstLesson(
      activateOpenTuiMenuItem(createOpenTuiInitialState("zh"), "comprehensive", context),
    );
    if (state.route.screen !== "running") {
      throw new Error("expected running state");
    }
    state.route.target = {
      mode: "code",
      text: "a1+z",
      source: "test:diagnostics-initial",
    };
    state.route.live = {
      input: "",
      elapsed_ms: 0,
      metrics: {
        wpm: 0,
        raw_wpm: 0,
        accuracy: 100,
        errors: 0,
        backspaces: 0,
      },
      key_events: [],
    };
    const kit = fakeKit();

    await renderOpenTuiAppOnce(state, kit);

    const content = flattenContent(kit.addedNodes);
    expect(content).not.toContain("开始输入后显示本组诊断");
    expect(content).not.toContain("本组字符:");
    expect(content).toContain("速度:");
    expect(content).toContain("错误:");
    expect(findNodeById(kit.addedNodes, "keyloop-diagnostic-speed-key-A")).toBeDefined();
    expect(findNodeById(kit.addedNodes, "keyloop-diagnostic-speed-key-Z")).toBeDefined();
    expect(findNodeById(kit.addedNodes, "keyloop-diagnostic-speed-key-1")).toBeDefined();
    expect(findNodeById(kit.addedNodes, "keyloop-diagnostic-speed-key-u2b")).toBeDefined();
    expect(findNodeById(kit.addedNodes, "keyloop-diagnostic-error-key-A")).toBeDefined();
    // 开打前所有键零档：无背景色，一眼区分"练过的"和"没碰过的"
    expect(findNodeById(kit.addedNodes, "keyloop-diagnostic-speed-key-A")?.props.bg).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-diagnostic-error-key-u2b")?.props.bg).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-diagnostic-speed-key-u2b")?.props.bg).toBeUndefined();
    expect(content).not.toContain("重点符号:");
  });

  test("renders live diagnostics for only the keys present in the current target", async () => {
    const context = appContext();
    const state = startStagePlanFirstLesson(
      activateOpenTuiMenuItem(createOpenTuiInitialState("en"), "comprehensive", context),
    );
    if (state.route.screen !== "running") {
      throw new Error("expected running state");
    }
    state.route.target = {
      mode: "code",
      text: "a1+z",
      source: "test:diagnostics-keys",
    };
    state.route.live = {
      input: "a1+z",
      elapsed_ms: 800,
      metrics: { wpm: 20, raw_wpm: 20, accuracy: 100, errors: 0, backspaces: 0 },
      key_events: [
        {
          at_ms: 100,
          action: "insert",
          position: 0,
          expected: "a",
          input: "a",
          correct: true,
        },
        {
          at_ms: 200,
          action: "insert",
          position: 1,
          expected: "1",
          input: "1",
          correct: true,
        },
        {
          at_ms: 700,
          action: "insert",
          position: 2,
          expected: "+",
          input: "+",
          correct: true,
        },
        {
          at_ms: 800,
          action: "insert",
          position: 3,
          expected: "z",
          input: "z",
          correct: true,
        },
      ],
    };
    const kit = fakeKit();

    await renderOpenTuiAppOnce(state, kit);

    expect(findNodeById(kit.addedNodes, "keyloop-diagnostic-speed-key-A")).toBeDefined();
    expect(findNodeById(kit.addedNodes, "keyloop-diagnostic-speed-key-Z")).toBeDefined();
    expect(findNodeById(kit.addedNodes, "keyloop-diagnostic-speed-key-1")).toBeDefined();
    expect(findNodeById(kit.addedNodes, "keyloop-diagnostic-speed-key-u2b")).toBeDefined();
    expect(findNodeById(kit.addedNodes, "keyloop-diagnostic-speed-key-u3b")).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-diagnostic-error-key-u3b")).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-diagnostic-speed-key-Z")?.props.bg).toBe(
      heatScaleColor("success", 4),
    );
    expect(findNodeById(kit.addedNodes, "keyloop-diagnostic-speed-key-u2b")?.props.bg).toBe(
      heatScaleColor("success", 1),
    );
    expect(findNodeById(kit.addedNodes, "keyloop-diagnostic-error-key-u2b")?.props.bg).toBeUndefined();
    expectDefaultForeground(
      findNodeById(kit.addedNodes, "keyloop-diagnostic-speed-key-Z")?.props.fg,
    );
  });

  test("keeps long diagnostic key rows aligned without clipping", async () => {
    const context = appContext();
    const state = startStagePlanFirstLesson(
      activateOpenTuiMenuItem(createOpenTuiInitialState("en"), "comprehensive", context),
    );
    if (state.route.screen !== "running") {
      throw new Error("expected running state");
    }
    state.route.target = {
      mode: "code",
      text: "abcdefghijklmnopqrstuvwxyz0123456789{}[]()<>+-*/%=;:,.?!",
      source: "test:diagnostics-long",
    };
    state.route.live = {
      input: "",
      elapsed_ms: 0,
      metrics: { wpm: 0, raw_wpm: 0, accuracy: 100, errors: 0, backspaces: 0 },
      key_events: [],
    };
    const kit = fakeKit();

    await renderOpenTuiAppOnce(state, kit);

    expect(findNodeById(kit.addedNodes, "keyloop-training-diagnostics")?.props.height).toBe(8);
    expect(findNodeById(kit.addedNodes, "keyloop-training-diagnostics")?.props.overflow).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-diagnostic-speed-row-1")).toBeDefined();
    expect(findNodeById(kit.addedNodes, "keyloop-diagnostic-error-row-1")).toBeDefined();
    expect(
      findNodeById(kit.addedNodes, "keyloop-diagnostic-speed-row-1-label")?.props.width,
    ).toBe(8);
    expect(
      findNodeById(kit.addedNodes, "keyloop-diagnostic-error-row-1-label")?.props.width,
    ).toBe(8);
    expect(findNodeById(kit.addedNodes, "keyloop-diagnostic-speed-row-1")?.props.flexWrap).toBe("nowrap");
    expect(findNodeById(kit.addedNodes, "keyloop-diagnostic-error-row-1")?.props.overflow).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-diagnostic-speed-key-A")?.props.width).toBe(3);
  });

  test("renders line numbers only for code targets", async () => {
    const context = appContext();
    const state = startStagePlanFirstLesson(
      activateOpenTuiMenuItem(createOpenTuiInitialState("en"), "comprehensive", context),
    );
    if (state.route.screen !== "running") {
      throw new Error("expected running state");
    }
    state.route.target = {
      mode: "code",
      text: "const enabled = true;",
      source: "typescript",
    };
    const kit = fakeKit();

    await renderOpenTuiAppOnce(state, kit);

    expect(findNodeById(kit.addedNodes, "keyloop-ghost-line-number-0")?.props.content).toBe("01");
  });

  test("soft wraps long code rows instead of clipping hidden target text", async () => {
    const context = appContext();
    const state = startStagePlanFirstLesson(
      activateOpenTuiMenuItem(createOpenTuiInitialState("en"), "comprehensive", context),
    );
    if (state.route.screen !== "running") {
      throw new Error("expected running state");
    }
    state.route.target = {
      mode: "code",
      text: `// ${"x".repeat(130)} ran-after-wrap`,
      source: "javascript",
    };
    const kit = fakeKit();

    await renderOpenTuiAppOnce(state, kit);

    const firstLine = findNodeById(kit.addedNodes, "keyloop-ghost-line-0");
    const wrappedLine = findNodeById(kit.addedNodes, "keyloop-ghost-line-1");
    expect(firstLine?.type).toBe("Box");
    expect(wrappedLine?.type).toBe("Box");
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-line-number-0")?.props.content).toBe("01");
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-line-number-1")?.props.content).toBe("  ");
    expect(flattenContent([wrappedLine as FakeNode])).toContain("ran-after-wrap");
  });

  test("soft wraps long code rows at word boundaries when possible", async () => {
    const context = appContext();
    const state = startStagePlanFirstLesson(
      activateOpenTuiMenuItem(createOpenTuiInitialState("en"), "comprehensive", context),
    );
    if (state.route.screen !== "running") {
      throw new Error("expected running state");
    }
    state.route.target = {
      mode: "code",
      text: `// ${"x".repeat(90)} runner stays whole`,
      source: "javascript",
    };
    const kit = fakeKit();

    await withStdoutColumns(108, async () => {
      await renderOpenTuiAppOnce(state, kit);
    });

    const wrappedLine = findNodeById(kit.addedNodes, "keyloop-ghost-line-1");
    expect(wrappedLine?.type).toBe("Box");
    expect(flattenContent([wrappedLine as FakeNode])).toContain("runner stays whole");
  });

  test("does not apply syntax fallback colors to non-code targets", async () => {
    const context = appContext();
    const state = startStagePlanFirstLesson(
      activateOpenTuiMenuItem(createOpenTuiInitialState("en"), "comprehensive", context),
    );
    if (state.route.screen !== "running") {
      throw new Error("expected running state");
    }
    state.route.target = {
      mode: "words",
      text: "const value => string",
      source: "test:non-code-syntax",
    };
    state.route.live = {
      input: "const value =>",
      metrics: {
        wpm: 30,
        raw_wpm: 35,
        accuracy: 100,
        errors: 0,
        backspaces: 0,
      },
    };
    const kit = fakeKit();

    await renderOpenTuiAppOnce(state, kit);

    const firstTyped = findNodeById(kit.addedNodes, "keyloop-ghost-typed-0-0");
    expect(firstTyped?.props.content).toBe("const value =>");
    expectAnsiSlot(firstTyped?.props.fg, 2, "green");
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-typed-0-1")).toBeUndefined();
  });

  test("renders explicit default foreground for plain code instead of ANSI white", async () => {
    const context = appContext();
    const state = startStagePlanFirstLesson(
      activateOpenTuiMenuItem(createOpenTuiInitialState("en"), "comprehensive", context),
    );
    if (state.route.screen !== "running") {
      throw new Error("expected running state");
    }
    state.route.target = {
      mode: "code",
      text: "raw = value;",
      source: "test:plain-code",
    };
    state.route.live = {
      input: "r",
      metrics: {
        wpm: 0,
        raw_wpm: 0,
        accuracy: 100,
        errors: 0,
        backspaces: 0,
      },
    };
    const kit = fakeKit();

    await renderOpenTuiAppOnce(state, kit);

    expectDefaultForeground(findNodeById(kit.addedNodes, "keyloop-ghost-typed-0-0")?.props.fg);
  });

  test("renders cursor position and newline markers without an error hint row", async () => {
    const context = appContext();
    const state = startStagePlanFirstLesson(
      activateOpenTuiMenuItem(createOpenTuiInitialState("en"), "comprehensive", context),
    );
    if (state.route.screen !== "running") {
      throw new Error("expected running state");
    }
    state.route.target = {
      mode: "code",
      text: "a\nb",
      source: "test:cursor-newline",
    };
    state.route.live = {
      input: "a",
      metrics: {
        wpm: 10,
        raw_wpm: 10,
        accuracy: 100,
        errors: 0,
        backspaces: 0,
      },
    };
    const kit = fakeKit();

    await renderOpenTuiAppOnce(state, kit);

    const cursor = findNodeById(kit.addedNodes, "keyloop-ghost-cursor-0-1");
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-typed-0-0")?.props.content).toBe("a");
    expect(cursor?.props.content).toBe("⏎");
    expectAnsiSlot(cursor?.props.fg, 0, "black");
    expectAnsiSlot(cursor?.props.bg, 3, "yellow");
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-pending-1-0")?.props.content).toBe("b");

    const content = flattenContent(kit.addedNodes);
    expect(content).toContain("⏎");
    expect(content).not.toContain("expected");
    expect(findNodeById(kit.addedNodes, "keyloop-error-ruler")).toBeUndefined();
  });

  test("renders code practice with Shiki-backed syntax colors", async () => {
    const context = appContext();
    const state = startStagePlanFirstLesson(
      activateOpenTuiMenuItem(createOpenTuiInitialState("en"), "comprehensive", context),
    );
    if (state.route.screen !== "running") {
      throw new Error("expected running state");
    }
    state.route.target = {
      mode: "code",
      text: "const value = 1; // comment",
      source: "src/example.ts:1",
    };
    state.route.live = {
      input: "const value = 1; // comment",
      metrics: {
        wpm: 20,
        raw_wpm: 20,
        accuracy: 100,
        errors: 0,
        backspaces: 0,
      },
    };
    const kit = fakeKit();

    await renderOpenTuiAppOnce(state, kit);

    const line = findNodeById(kit.addedNodes, "keyloop-ghost-line-0");
    const comment = line?.children.find((child) => child.props.content === "// comment");
    expectAnsiSlot(comment?.props.fg, 2, "green");
  });

  test("renders code running status controls and compact localized metrics", async () => {
    const state = {
      language: "zh" as const,
      route: {
        screen: "running" as const,
        source_item: "code_mix" as const,
        target: {
          mode: "code" as const,
          text: "const value = 1;\n\nfunction renderView() {\n  return value;\n}",
          source: "test:code-status",
          code_blocks: [
            {
              start_line: 0,
              line_count: 1,
              language: "typescript",
              framework: "react",
              project: "test",
              source: "src/example.ts:1",
              difficulty: "medium" as const,
              size: "short" as const,
            },
            {
              start_line: 2,
              line_count: 3,
              language: "typescript",
              framework: "react",
              project: "test",
              source: "src/example.ts:3",
              difficulty: "hard" as const,
              size: "medium" as const,
            },
          ],
        },
        live: {
          input: "const value = 1;\n\n",
          metrics: {
            wpm: 10,
            raw_wpm: 12,
            accuracy: 100,
            errors: 0,
            backspaces: 0,
          },
        },
      },
    };
    const kit = fakeKit();

    await renderOpenTuiAppOnce(state, kit);

    const content = flattenContent(kit.addedNodes);
    const runningScreen = findNodeById(kit.addedNodes, "keyloop-running-screen");
    expect(runningScreen?.children.map((child) => child.props.id)).toEqual([
      "keyloop-practice-overview",
      "keyloop-practice-data",
      "keyloop-ghost-text",
      "keyloop-diagnostics",
    ]);
    expect(findNodeById(kit.addedNodes, "keyloop-code-status-bar")).toBeUndefined();
    const overview = findNodeById(kit.addedNodes, "keyloop-practice-overview");
    expect(overview?.type).toBe("Box");
    expect(overview?.props.border).toBeUndefined();
    const dataPanel = findNodeById(kit.addedNodes, "keyloop-practice-data");
    expect(dataPanel?.children.map((child) => child.props.id)).toEqual([
      "keyloop-live-metrics",
      "keyloop-group-progress-bar",
    ]);
    expect(content).toContain("代码块");
    expect(content).toContain("2/2");
    expect(content).toContain("TypeScript / React");
    expect(content).toContain("难度");
    expect(content).toContain("困难");
    expect(content).toContain("长度");
    expect(content).toContain("中等");
    expect(
      findNodeById(kit.addedNodes, "keyloop-practice-status-label-2")?.props.content,
    ).toBe("难度");
    expectAnsiSlot(
      findNodeById(kit.addedNodes, "keyloop-practice-status-label-2")?.props.fg,
      8,
      "brightBlack",
    );
    expectAnsiSlot(
      findNodeById(kit.addedNodes, "keyloop-practice-status-value-2")?.props.fg,
      6,
      "cyan",
    );
    expect(
      findNodeById(kit.addedNodes, "keyloop-practice-options-hint-key")?.props.content,
    ).toBe("Ctrl+O");
    expectAnsiSlot(
      findNodeById(kit.addedNodes, "keyloop-practice-options-hint-key")?.props.fg,
      2,
      "green",
    );
    expect(content).not.toContain("专项练习，直接输入开始");
    expect(content).not.toContain("重点符号:");
    expect(content).not.toContain("热键:");
    expect(content).not.toContain("手位回稳");
    expect(content).not.toContain("中等长度");
    expect(findNodeById(kit.addedNodes, "keyloop-code-status-shortcuts")).toBeUndefined();
    const ghostText = findNodeById(kit.addedNodes, "keyloop-ghost-text");
    expect(ghostText?.props.bottomTitle).toBeUndefined();
    expect(ghostText?.props.title).toBe(" 代码 ");
    const metrics = findNodeById(kit.addedNodes, "keyloop-live-metrics");
    expect(metrics?.children.map((child) => child.props.id)).toEqual([
      "keyloop-live-metric-wpm",
      "keyloop-live-metric-raw",
      "keyloop-live-metric-accuracy",
      "keyloop-live-metric-errors",
    ]);
    expect(metrics?.props.border).toBeUndefined();
    expect(metrics?.props.height).toBe(1);
    expect(metrics?.props.width).toBe("100%");
    expect(findNodeById(kit.addedNodes, "keyloop-live-metric-wpm-label")?.props.content).toBe(
      "WPM",
    );
    expect(findNodeById(kit.addedNodes, "keyloop-live-metric-raw-label")?.props.content).toBe(
      "原始 WPM",
    );
    expect(findNodeById(kit.addedNodes, "keyloop-live-metric-accuracy-label")?.props.content).toBe(
      "准确",
    );
    expect(findNodeById(kit.addedNodes, "keyloop-live-metric-errors-label")?.props.content).toBe(
      "错误",
    );
  });

  test("renders Ctrl+O options hint on everyday practice overview panels", async () => {
    const scenarios = [
      "everyday_sentences",
      "everyday_articles",
      "everyday_word_decomposition",
    ] as const;

    for (const sourceItem of scenarios) {
      const kit = fakeKit();
      const state: OpenTuiAppState = {
        language: "zh",
        route: {
          screen: "running",
          source_item: sourceItem,
          target: {
            mode: "words",
            text: "practice text",
            source: `keyloop:module:everyday-english:${sourceItem}`,
          },
        },
      };

      await renderOpenTuiAppOnce(state, kit);

      const hintTexts = collectHintTexts(kit.addedNodes);
      expect(hintTexts).toContain("Ctrl+O");
      expect(hintTexts).toContain("Ctrl+R");
    }
  });

  test("renders practice options as a reusable popup over the running screen", async () => {
    const kit = fakeKit();
    const state = createOpenTuiPracticeOptionsState(
      "zh",
      {
        mode: "code",
        text: "const value = 1;",
        source: "test:practice-options",
      },
      {
        sourceItem: "code_mix",
        live: {
          input: "",
          elapsed_ms: 3_000,
          paused: true,
          metrics: { wpm: 0, raw_wpm: 0, accuracy: 100, errors: 0, backspaces: 0 },
        },
        practiceOptions: {
          selected_index: 1,
          items: [
            { id: "code_difficulty", label: "难度", value: "简单" },
            { id: "code_length", label: "长度", value: "中等" },
          ],
        },
      },
    );

    await renderOpenTuiAppOnce(state, kit);

    const popup = findNodeById(kit.addedNodes, "keyloop-practice-options-popup");
    expect(popup?.type).toBe("Box");
    expect(popup?.props.title).toBe(" 练习选项 ");
    expect(popup?.props.borderStyle).toBe("double");
    expect(popup?.props.bottomTitle).toBe(" ↑↓ 选择 · ←→ 调整 · Enter 继续 · Esc 关闭 ");
    expect(
      findNodeById(kit.addedNodes, "keyloop-practice-option-row-1-rail-0")?.props.content,
    ).toBe("▌");
    const content = flattenContent(kit.addedNodes);
    expect(content).toContain("难度");
    expect(content).toContain("简单");
    expect(content).toContain("长度");
    expect(content).toContain("中等");
    expect(content).not.toContain("↑↓ 选择  ←→ 调整");
    expectCenteredModalOverlay(kit.addedNodes, "keyloop-practice-options-overlay", "56%", "58%");
  });

  test("standalone running banner omits repeat-after-enter copy", async () => {
    const state = {
      language: "zh" as const,
      route: {
        screen: "running" as const,
        source_item: "code_mix" as const,
        target: {
          mode: "code" as const,
          text: "const value = 1;",
          source: "test:standalone-code",
        },
      },
    };
    const kit = fakeKit();

    await renderOpenTuiAppOnce(state, kit);

    const content = flattenContent(kit.addedNodes);
    expect(content).not.toContain("本组结束后按 Enter 再来一组");
  });

  test("keeps ghost text stable when repeated wrong enters are typed", async () => {
    const context = appContext();
    const state = startStagePlanFirstLesson(
      activateOpenTuiMenuItem(createOpenTuiInitialState("en"), "comprehensive", context),
    );
    if (state.route.screen !== "running") {
      throw new Error("expected running state");
    }
    state.route.target = {
      mode: "words",
      text: "abcde",
      source: "test:wrong-enters",
    };
    state.route.live = {
      input: "\n\n\n",
      metrics: {
        wpm: 0,
        raw_wpm: 0,
        accuracy: 0,
        errors: 3,
        backspaces: 0,
      },
    };
    const kit = fakeKit();

    await renderOpenTuiAppOnce(state, kit);

    const wrong = findNodeById(kit.addedNodes, "keyloop-ghost-wrong-0-0");
    const line = findNodeById(kit.addedNodes, "keyloop-ghost-line-0");
    expect(line?.props.height).toBe(1);
    expect(line?.props.flexWrap).toBe("no-wrap");
    expect(line?.props.overflow).toBe("hidden");
    expect(wrong?.props.content).toBe("abc");
    expect(wrong?.props.height).toBe(1);
    expect(wrong?.props.wrapMode).toBe("none");
    expectDefaultForeground(wrong?.props.fg);
    expectAnsiSlot(wrong?.props.bg, 1, "red");
    expect(wrong?.props.attributes).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-cursor-0-1")?.props.content).toBe("d");
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-pending-0-2")?.props.content).toBe("e");
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-line-1")).toBeUndefined();
  });

  test("keeps word and sentence translations visible on the completion screen", async () => {
    const kit = fakeKit();
    const text = "info practice\nPractice builds skill.";
    const state = createOpenTuiCompletionState(
      "zh",
      defaultSessionRecord({
        mode: "words",
        target_text: text,
        source: "keyloop:module:everyday-english:mix",
      }),
      {
        sourceItem: "everyday_words",
        target: {
          mode: "words",
          text,
          source: "keyloop:module:everyday-english:mix",
          annotations: [
            { start: 0, end: 4, translation_zh: "信息；资料", display: "word" },
            { start: 5, end: 13, translation_zh: "练习", display: "word" },
            {
              start: 14,
              end: text.length,
              translation_zh: "练习培养技能。",
              display: "line",
            },
          ],
        },
      },
    );

    await renderOpenTuiAppOnce(state, kit);

    expect(findNodeById(kit.addedNodes, "keyloop-ghost-meaning-line-0")).toBeDefined();
    const content = flattenContent(kit.addedNodes);
    expect(content).toContain("信息；资料");
    expect(content).toContain("练习培养技能。");
  });

  test("renders completion route metrics", async () => {
    const kit = fakeKit();
    const state = createOpenTuiCompletionState(
      "en",
      defaultSessionRecord({
        mode: "words",
        module: "programming_basics",
        duration_ms: 60_000,
        correct_chars: 150,
        wpm: 30,
        raw_wpm: 32,
        accuracy: 93.75,
        error_count: 4,
        backspace_count: 2,
      }),
    );

    await renderOpenTuiAppOnce(state, kit);

    const content = flattenContent(kit.addedNodes);
    expect(content).toContain("Lesson complete");
    expect(content).not.toContain("WPM 30.0 | Raw WPM 32.0 | Accuracy 93.8%");
    expect(content).not.toContain("Errors 4 | Backspace 2");
    expect(findNodeById(kit.addedNodes, "keyloop-complete-stat-row")?.props.border).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-complete-stat-wpm-label")?.props.content).toBe(
      "WPM",
    );
    expect(findNodeById(kit.addedNodes, "keyloop-complete-stat-wpm-value")?.props.content).toBe(
      "30.0",
    );
    expect(findNodeById(kit.addedNodes, "keyloop-complete-cpm")).toBeUndefined();
  });

  test("renders completion key diagnostics from per-key timing and errors", async () => {
    const kit = fakeKit();
    const state = createOpenTuiCompletionState(
      "zh",
      defaultSessionRecord({
        mode: "code",
        module: "code_practice",
        target_text: "abcde{=;",
        user_input: "abcde{=;",
        duration_ms: 2_500,
        correct_chars: 8,
        target_len: 8,
        wpm: 38,
        raw_wpm: 42,
        accuracy: 88.9,
        error_count: 1,
        backspace_count: 1,
        error_chars: { ";": 1 },
        key_events: [
          { at_ms: 0, action: "insert", position: 0, expected: "a", input: "a", correct: true },
          { at_ms: 100, action: "insert", position: 1, expected: "b", input: "b", correct: true },
          { at_ms: 220, action: "insert", position: 2, expected: "c", input: "c", correct: true },
          { at_ms: 350, action: "insert", position: 3, expected: "d", input: "d", correct: true },
          { at_ms: 490, action: "insert", position: 4, expected: "e", input: "e", correct: true },
          { at_ms: 1_090, action: "insert", position: 5, expected: "{", input: "{", correct: true },
          { at_ms: 1_690, action: "insert", position: 6, expected: "=", input: "=", correct: true },
          { at_ms: 1_800, action: "insert", position: 7, expected: ";", input: ":", correct: false },
          { at_ms: 1_900, action: "backspace", position: 7, expected: ";", input: null, correct: false },
          { at_ms: 2_500, action: "insert", position: 7, expected: ";", input: ";", correct: true },
        ],
      }),
    );

    await renderOpenTuiAppOnce(state, kit);

    const content = flattenContent(kit.addedNodes);
    expect(content).not.toContain("中位击键");
    expect(content).not.toContain("ms");
    expect(content).not.toContain("较慢字符");
    expect(content).not.toContain("较快字符");
    expect(content).not.toContain("易错字符");
    expect(content).toContain("慢");
    expect(content).toContain("快");
    expect(content).toContain("错");
    expect(findNodeById(kit.addedNodes, "keyloop-complete-key-diagnostics")).toBeDefined();
    expect(findNodeById(kit.addedNodes, "keyloop-complete-key-slow-label")?.props.content).toBe(
      "慢 ",
    );
    expect(findNodeById(kit.addedNodes, "keyloop-complete-key-fast-label")?.props.content).toBe(
      "快 ",
    );
    expect(findNodeById(kit.addedNodes, "keyloop-complete-key-error-label")?.props.content).toBe(
      "错 ",
    );
    expect(findNodeById(kit.addedNodes, "keyloop-complete-key-slow-grid")?.props.flexDirection)
      .toBe("row");
    expect(findNodeById(kit.addedNodes, "keyloop-complete-key-slow-cell-u3b")?.props.width)
      .toBe(16);
    expect(findNodeById(kit.addedNodes, "keyloop-complete-key-fast-cell-B")?.props.width)
      .toBe(16);
    expect(findNodeById(kit.addedNodes, "keyloop-complete-key-error-cell-u3b")?.props.width)
      .toBe(16);
    expect(findNodeById(kit.addedNodes, "keyloop-complete-key-slow-u3b")?.props.content).toBe(
      " ; ",
    );
    expect(findNodeById(kit.addedNodes, "keyloop-complete-key-slow-u3b")?.props.bg).toBe(
      heatScaleColor("success", 1),
    );
    expectDefaultForeground(
      findNodeById(kit.addedNodes, "keyloop-complete-key-slow-u3b")?.props.fg,
    );
    expect(findNodeById(kit.addedNodes, "keyloop-complete-key-slow-u3b-speed")?.props.content).toBe(
      " 20.0 WPM  ",
    );
    expect(findNodeById(kit.addedNodes, "keyloop-complete-key-fast-B")?.props.content).toBe(
      " B ",
    );
    expect(findNodeById(kit.addedNodes, "keyloop-complete-key-error-u3b")?.props.bg).toBe(
      heatScaleColor("danger", 4),
    );
    expectDefaultForeground(
      findNodeById(kit.addedNodes, "keyloop-complete-key-error-u3b")?.props.fg,
    );
    expect(findNodeById(kit.addedNodes, "keyloop-complete-key-error-u3b-count")?.props.content).toBe(
      " ×1  ",
    );
  });

  test("renders completion as result popup over the finished practice", async () => {
    const kit = fakeKit();
    const state = createOpenTuiCompletionState(
      "en",
      defaultSessionRecord({
        mode: "words",
        module: "programming_basics",
        target_text: "return value",
        user_input: "return value",
        duration_ms: 60_000,
        correct_chars: 150,
        wpm: 30,
        raw_wpm: 32,
        accuracy: 100,
        error_count: 0,
        backspace_count: 1,
      }),
      {
        target: { mode: "words", text: "return value", source: "test:complete-popup" },
        live: {
          input: "return value",
          metrics: { wpm: 30, raw_wpm: 32, accuracy: 100, errors: 0, backspaces: 1 },
        },
      },
    );

    await renderOpenTuiAppOnce(state, kit);

    const content = flattenContent(kit.addedNodes);
    expect(content).toContain("ret");
    expect(content).toContain("rn value");
    expect(content).toContain("value");
    expect(content).toContain("Lesson complete");
    expect(content).not.toContain("Enter / Esc close result");
    expect(content).not.toContain("Enter again continue");
    expect(findNodeById(kit.addedNodes, "keyloop-complete-popup")).toBeDefined();
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-text")).toBeDefined();

    const overlay = findNodeById(kit.addedNodes, "keyloop-complete-overlay");
    expect(overlay?.props.position).toBe("absolute");
    expectCenteredModalOverlay(kit.addedNodes, "keyloop-complete-overlay", "94%", "80%");
    expectDefaultBackground(
      findNodeById(kit.addedNodes, "keyloop-complete-card")?.props.backgroundColor,
    );
    expect(findNodeById(kit.addedNodes, "keyloop-complete-card")?.props.bottomTitle).toBe(
      " Enter close · R repeat · Q quit ",
    );
    expect(content).not.toContain("WPM 30.0 | Raw WPM 32.0 | Accuracy 100.0%");
    expect(content).not.toContain("Errors 0 | Backspace 1");
    expect(findNodeById(kit.addedNodes, "keyloop-complete-stat-row")?.props.border).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-complete-stat-wpm-label")?.props.content).toBe(
      "WPM",
    );
    expect(findNodeById(kit.addedNodes, "keyloop-complete-cpm")).toBeUndefined();
  });

  test("renders speed metrics as cpm when the global speed unit is cpm", async () => {
    const kit = fakeKit();
    const state = createOpenTuiCompletionState(
      "en",
      defaultSessionRecord({
        mode: "words",
        module: "programming_basics",
        duration_ms: 60_000,
        correct_chars: 150,
        wpm: 30,
        raw_wpm: 32,
        accuracy: 100,
      }),
      {
        speedUnit: "cpm",
      },
    );

    await renderOpenTuiAppOnce(state, kit);

    const content = flattenContent(kit.addedNodes);
    expect(content).not.toContain("WPM");
    expect(findNodeById(kit.addedNodes, "keyloop-complete-stat-wpm-label")?.props.content).toBe(
      "CPM",
    );
    expect(findNodeById(kit.addedNodes, "keyloop-complete-stat-wpm-value")?.props.content).toBe(
      "150.0",
    );
    expect(findNodeById(kit.addedNodes, "keyloop-complete-stat-raw-label")?.props.content).toBe(
      "Raw CPM",
    );
    expect(findNodeById(kit.addedNodes, "keyloop-complete-stat-raw-value")?.props.content).toBe(
      "160.0",
    );
  });

  test("renders paused state prominently in the running banner", async () => {
    const state = {
      language: "zh" as const,
      route: {
        screen: "running" as const,
        source_item: "foundation_mix" as const,
        target: {
          mode: "words" as const,
          text: "asdf",
          source: "test:paused",
        },
        live: {
          input: "as",
          elapsed_ms: 3_000,
          paused: true,
          metrics: { wpm: 8, raw_wpm: 8, accuracy: 100, errors: 0, backspaces: 0 },
        },
      },
    };
    const kit = fakeKit();

    await renderOpenTuiAppOnce(state, kit);

    expect(findNodeById(kit.addedNodes, "keyloop-lesson-pause-state")?.props.content).toBe(
      "⏸ 已暂停",
    );
    expect(findNodeById(kit.addedNodes, "keyloop-lesson-duration")?.children.map(
      (child) => child.props.id,
    )).toEqual([
      "keyloop-lesson-duration-label",
      "keyloop-lesson-duration-value",
      "keyloop-lesson-pause-state",
    ]);
    expect(findNodeById(kit.addedNodes, "keyloop-practice-time-stack")?.props.alignItems).toBe(
      "flex-end",
    );
    expect(findNodeById(kit.addedNodes, "keyloop-practice-time-stack")?.props.flexShrink).toBe(0);
    const pausedHints = collectHintTexts(kit.addedNodes);
    expect(pausedHints).toContain("继续");
  });

  test("hides next lesson copy for standalone completion popups", async () => {
    const kit = fakeKit();
    const state = createOpenTuiCompletionState(
      "en",
      defaultSessionRecord({
        daily_run_id: "",
        mode: "words",
        module: "programming_basics",
        target_text: "i18n",
        user_input: "i18n",
        wpm: 30,
        raw_wpm: 32,
        accuracy: 100,
      }),
      {
        target: { mode: "words", text: "i18n", source: "test:standalone-complete" },
        nextLesson: {
          id: "next",
          kind: "words",
          module: "unknown",
          category: "review",
          mix_profile: "standalone",
          estimated_minutes: 4,
          target: { mode: "words", text: "again", source: "test:standalone-next" },
          reason_zh: "",
          reason_en: "",
        },
      },
    );

    await renderOpenTuiAppOnce(state, kit);

    const content = flattenContent(kit.addedNodes);
    expect(content).not.toContain("Next: unknown");
    expect(findNodeById(kit.addedNodes, "keyloop-complete-next")).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-complete-actions")).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-complete-card")?.props.bottomTitle).toBe(
      " Enter close · R repeat · Q quit ",
    );
  });

  test("renders exit confirmation as a popup over the paused practice", async () => {
    const kit = fakeKit();
    const state = createOpenTuiExitConfirmationState(
      "en",
      { mode: "words", text: "return value", source: "test:exit-popup" },
      {
        live: {
          input: "ret",
          elapsed_ms: 12_000,
          metrics: { wpm: 15, raw_wpm: 18, accuracy: 100, errors: 0, backspaces: 0 },
        },
      },
    );

    await renderOpenTuiAppOnce(state, kit);

    const content = flattenContent(kit.addedNodes);
    expect(content).toContain("ret");
    expect(content).toContain("rn value");
    expect(content).toContain("Exit confirmation");
    expect(content).toContain("Exit the current practice?");
    expect(content).toContain("Unfinished progress will not be saved.");
    expect(content).not.toContain("Enter confirm exit | Esc return to practice");
    expect(content).toContain("0:12");
    expect(findNodeById(kit.addedNodes, "keyloop-exit-confirmation-popup")).toBeDefined();
    expect(
      findNodeById(kit.addedNodes, "keyloop-exit-confirmation-popup")?.props.bottomTitle,
    ).toBe(" Enter confirm exit · Esc keep typing ");

    expect(findNodeById(kit.addedNodes, "keyloop-route-panel")).toBeUndefined();
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-text")).toBeDefined();

    const overlay = findNodeById(kit.addedNodes, "keyloop-exit-confirmation-overlay");
    expect(overlay?.props.position).toBe("absolute");
    expectCenteredModalOverlay(
      kit.addedNodes,
      "keyloop-exit-confirmation-overlay",
      "64%",
      "45%",
    );
  });

  test("renders completed practice text as a clean target snapshot behind the result popup", async () => {
    const kit = fakeKit();
    const state = createOpenTuiCompletionState(
      "en",
      defaultSessionRecord({
        mode: "words",
        module: "programming_basics",
        target_text: "return value",
        user_input: "retXrn value",
        wpm: 30,
        raw_wpm: 32,
        accuracy: 90,
        error_count: 1,
        backspace_count: 1,
      }),
      {
        target: { mode: "words", text: "return value", source: "test:complete-popup" },
        live: {
          input: "retXrn value",
          metrics: { wpm: 30, raw_wpm: 32, accuracy: 90, errors: 1, backspaces: 1 },
        },
      },
    );

    await renderOpenTuiAppOnce(state, kit);

    expect(findNodesByIdPrefix(kit.addedNodes, "keyloop-ghost-wrong-")).toHaveLength(0);
    expect(findNodesByIdPrefix(kit.addedNodes, "keyloop-ghost-cursor-")).toHaveLength(0);
    expect(findNodeById(kit.addedNodes, "keyloop-ghost-typed-0-0")?.props.content).toContain(
      "return",
    );
  });

  test("keeps dismissed completion snapshot anchored to the completed record", async () => {
    const kit = fakeKit();
    const state = createOpenTuiCompletionState(
      "en",
      defaultSessionRecord({
        mode: "code",
        module: "code_practice",
        category: "code_snippet",
        source: "test:previous",
        target_text: "const previous = 1;",
        user_input: "const previous = 1;",
        wpm: 30,
        raw_wpm: 32,
        accuracy: 100,
        error_count: 0,
        backspace_count: 0,
      }),
      {
        resultVisible: false,
        target: { mode: "code", text: "const next = 2;", source: "test:next" },
      },
    );

    await renderOpenTuiAppOnce(state, kit);

    const content = flattenContent(kit.addedNodes);
    expect(content).toContain("previous");
    expect(content).not.toContain("next");
    expect(findNodeById(kit.addedNodes, "keyloop-complete-popup")).toBeUndefined();
  });

  test("renders summary route aggregates", async () => {
    const kit = fakeKit();
    const state = createOpenTuiSummaryState("en", [
      defaultSessionRecord({
        active_ms: 60_000,
        duration_ms: 60_000,
        correct_chars: 150,
        typed_len: 160,
        accuracy: 93.75,
        error_count: 4,
        backspace_count: 2,
      }),
      defaultSessionRecord({
        active_ms: 60_000,
        duration_ms: 60_000,
        correct_chars: 100,
        typed_len: 100,
        accuracy: 100,
        backspace_count: 1,
      }),
    ]);

    await renderOpenTuiAppOnce(state, kit);

    const content = flattenContent(kit.addedNodes);
    expect(content).toContain("Daily summary");
    expect(content).toContain("2 sessions | active 2m | WPM 25.0 | accuracy 96.2%");
    expect(content).toContain("Errors 4 | Backspace 3");
  });

  test("goal onboarding welcome renders directions and actions", async () => {
    const kit = fakeKit();
    const state = createOpenTuiGoalOnboardingState("zh", { scenario: "welcome" });
    await renderOpenTuiAppOnce(state, kit);
    const content = flattenContent(kit.addedNodes);
    expect(content).toContain("普通打字");
    expect(content).toContain("打代码");
    expect(content).toContain("键位基础");
    expect(content).toContain("不再提醒");
  });

  test("goal onboarding achieved renders old goal form", async () => {
    const kit = fakeKit();
    const state = createOpenTuiGoalOnboardingState("zh", {
      scenario: "achieved",
      achievedGoal: { form: "code", target_wpm: 60, deadline: "2026-06-01", created_at: "2026-03-01" },
    });
    await renderOpenTuiAppOnce(state, kit);
    expect(flattenContent(kit.addedNodes)).toContain("代码");
  });

  test("comprehensive summary renders planned vs actual per lesson", async () => {
    const kit = fakeKit();
    const lesson: PracticeLesson = {
      id: "stage:keys:1",
      kind: "common_words",
      module: "foundation_input",
      category: "foundation_mix",
      mix_profile: "comprehensive",
      estimated_minutes: 4,
      target: { mode: "words", text: "x", source: "t" },
      reason_zh: "",
      reason_en: "",
    };
    const state = createOpenTuiSummaryState(
      "en",
      [defaultSessionRecord({ lesson_index: 0, active_ms: 180_000, duration_ms: 180_000 })],
      { lessons: [lesson] },
    );

    await renderOpenTuiAppOnce(state, kit);

    const content = flattenContent(kit.addedNodes);
    expect(content).toContain("Keys planned 4m · actual 3.0m");
    expect(content).toContain("planned 4m · actual 3.0m");
  });

  test("renders stats route overview metrics", async () => {
    const kit = fakeKit();
    const records = [
      defaultSessionRecord({
        started_at: "2026-06-05T03:00:00.000Z",
        duration_ms: 60_000,
        active_ms: 60_000,
        target_len: 160,
        correct_chars: 150,
        typed_len: 160,
        accuracy: 93.75,
        wpm: 40,
        error_count: 4,
        backspace_count: 2,
      }),
      defaultSessionRecord({
        started_at: "2026-06-05T04:00:00.000Z",
        duration_ms: 60_000,
        active_ms: 60_000,
        target_len: 100,
        correct_chars: 100,
        typed_len: 100,
        accuracy: 100,
        wpm: 20,
        backspace_count: 1,
      }),
    ];
    const state = createOpenTuiStatsState("en", records, { speedUnit: "cpm" });

    await renderOpenTuiAppOnce(state, kit);

    const content = flattenContent(kit.addedNodes);
    expect(content).toContain("Stats");
    expect(content).toContain("Overview  2 sessions");
    expect(content).toContain("Speed  best CPM 200.0 | average CPM 125.0");
  });

  test("renders stats route modules view", async () => {
    const kit = fakeKit();
    const state = createOpenTuiStatsState(
      "en",
      [
        defaultSessionRecord({
          started_at: "2026-06-05T03:00:00.000Z",
          mode: "words",
          module: "programming_basics",
          duration_ms: 60_000,
          active_ms: 60_000,
          target_len: 160,
          correct_chars: 150,
          typed_len: 160,
          accuracy: 93.75,
          error_count: 4,
        }),
        defaultSessionRecord({
          started_at: "2026-06-05T04:00:00.000Z",
          mode: "code",
          module: "code_practice",
          duration_ms: 60_000,
          active_ms: 60_000,
          target_len: 100,
          correct_chars: 100,
          typed_len: 100,
          accuracy: 100,
          error_count: 1,
        }),
      ],
      { view: "modules" },
    );

    await renderOpenTuiAppOnce(state, kit);

    const content = flattenContent(kit.addedNodes);
    expect(content).toContain(
      "Next driver  Programming basics | error 2.5% | accuracy 93.8%",
    );
    expect(content).toContain(
      "Programming basics  1 sessions | active 1m | WPM 30.0 | error 2.5%",
    );
  });

  test("renders stats route keys view", async () => {
    const kit = fakeKit();
    const state = createOpenTuiStatsState("en", [], {
      view: "keys",
      keyAggregates: [
        defaultKeyAggregate({
          key: "[",
          sample_count: 5,
          avg_ms: 400,
          fastest_ms: 80,
          slowest_ms: 900,
          error_rate: 20,
          confidence: 0.4,
        }),
      ],
    });

    await renderOpenTuiAppOnce(state, kit);

    const content = flattenContent(kit.addedNodes);
    expect(content).toContain("Stats");
    expect(content).toContain("Key stats  sort: slowest avg");
    expect(content).toContain("[");
  });

  test("renders stats route daily view", async () => {
    const kit = fakeKit();
    const state = createOpenTuiStatsState(
      "en",
      [
        defaultSessionRecord({
          started_at: "2026-06-05T03:00:00.000Z",
          duration_ms: 60_000,
          active_ms: 60_000,
          target_len: 160,
          correct_chars: 150,
          typed_len: 160,
          accuracy: 93.75,
          wpm: 40,
          error_count: 4,
        }),
      ],
      { view: "daily", dailyIndex: 0 },
    );

    await renderOpenTuiAppOnce(state, kit);

    const content = flattenContent(kit.addedNodes);
    expect(content).toContain("Stats");
    expect(content).toContain("Date 2026-06-05  (1/1)  Left/Right switches date");
    expect(content).toContain("Day 1 sessions");
  });
});

function fakeKit(): OpenTuiRendererKit & {
  addedNodes: FakeNode[];
  createdOptions: Array<{ exitOnCtrlC: boolean }>;
} {
  const addedNodes: FakeNode[] = [];
  const createdOptions: Array<{ exitOnCtrlC: boolean }> = [];
  return {
    addedNodes,
    createdOptions,
    Box: (props, ...children) => ({ type: "Box", props, children }),
    ScrollBox: (props, ...children) => ({ type: "ScrollBox", props, children }),
    Text: (props) => ({ type: "Text", props, children: [] }),
    createCliRenderer: async (options) => {
      createdOptions.push(options);
      return {
        root: {
          add: (...nodes: unknown[]) => {
            addedNodes.push(...(nodes as FakeNode[]));
          },
          remove: (id: string) => {
            for (let index = addedNodes.length - 1; index >= 0; index -= 1) {
              if (addedNodes[index]?.props.id === id) {
                addedNodes.splice(index, 1);
              }
            }
          },
        },
        idle: async () => {},
      };
    },
  };
}

function flattenContent(nodes: FakeNode[]): string {
  const values: string[] = [];
  const visit = (node: FakeNode): void => {
    const content = node.props.content;
    if (typeof content === "string") {
      values.push(content);
    }
    for (const child of node.children) {
      visit(child);
    }
  };
  for (const node of nodes) {
    visit(node);
  }
  return values.join("\n");
}

function flattenGhostSegments(segments: Array<{ text: string }>): string {
  return segments.map((segment) => segment.text).join("");
}

function collectHintTexts(nodes: FakeNode[]): string[] {
  const hintBar = findNodeById(nodes, "keyloop-hintbar");
  if (hintBar === undefined) {
    return [];
  }
  return flattenContent([hintBar]).split("\n");
}

function findNodeById(nodes: FakeNode[], id: string): FakeNode | undefined {
  for (const node of nodes) {
    if (node.props.id === id) {
      return node;
    }
    const child = findNodeById(node.children, id);
    if (child !== undefined) {
      return child;
    }
  }
  return undefined;
}

function findNodesByIdPrefix(nodes: FakeNode[], prefix: string): FakeNode[] {
  const matches: FakeNode[] = [];
  const visit = (node: FakeNode): void => {
    if (typeof node.props.id === "string" && node.props.id.startsWith(prefix)) {
      matches.push(node);
    }
    for (const child of node.children) {
      visit(child);
    }
  };
  for (const node of nodes) {
    visit(node);
  }
  return matches;
}

function expectCenteredModalOverlay(
  nodes: FakeNode[],
  id: string,
  width: string,
  maxHeight: string,
): void {
  const overlay = findNodeById(nodes, id);
  expect(overlay?.props.position).toBe("absolute");
  expect(overlay?.props.left).toBe(0);
  expect(overlay?.props.right).toBe(0);
  expect(overlay?.props.top).toBe(0);
  expect(overlay?.props.bottom).toBe(0);
  expect(overlay?.props.width).toBe("100%");
  expect(overlay?.props.height).toBe("100%");
  expect(overlay?.props.zIndex).toBe(10);
  expect(overlay?.props.alignItems).toBe("center");
  expect(overlay?.props.justifyContent).toBe("center");

  const viewport = findNodeById(nodes, `${id}-viewport`);
  expect(viewport?.props.width).toBe(width);
  expect(viewport?.props.maxHeight).toBe(maxHeight);
}

async function withStdoutColumns<T>(columns: number, run: () => Promise<T>): Promise<T> {
  const descriptor = Object.getOwnPropertyDescriptor(process.stdout, "columns");
  Object.defineProperty(process.stdout, "columns", { configurable: true, value: columns });
  try {
    return await run();
  } finally {
    if (descriptor === undefined) {
      delete (process.stdout as { columns?: number }).columns;
    } else {
      Object.defineProperty(process.stdout, "columns", descriptor);
    }
  }
}

async function withStdoutRows<T>(rows: number, run: () => Promise<T>): Promise<T> {
  const descriptor = Object.getOwnPropertyDescriptor(process.stdout, "rows");
  Object.defineProperty(process.stdout, "rows", { configurable: true, value: rows });
  try {
    return await run();
  } finally {
    if (descriptor === undefined) {
      delete (process.stdout as { rows?: number }).rows;
    } else {
      Object.defineProperty(process.stdout, "rows", descriptor);
    }
  }
}

function expectAnsiSlot(value: unknown, slot: number, name: string): void {
  expect(value).toEqual(expect.objectContaining({ kind: "ansi", name, slot }));
}

function expectDefaultBackground(value: unknown): void {
  expect(value).toEqual(expect.objectContaining({ kind: "defaultBackground" }));
}

function expectDefaultForeground(value: unknown): void {
  expect(value).toEqual(expect.objectContaining({ kind: "defaultForeground" }));
}

function appContext() {
  return {
    records: [],
    plan: testPlan(),
    library: testLibrary(),
  };
}

function testPlan(): PracticePlan {
  return {
    focus_words: ["selected", "pending"],
    focus_symbols: ["=>", "!=="],
    focus_code: ["selected"],
    focus_keys: [";"],
    advice: [],
    recommended_mode: "mixed",
    has_recent_history: true,
  };
}

function testLibrary(): ContentLibrary {
  return {
    warmup: ["asdf jkl;", "fdsa ;lkj", "a;sldkfj", "jkl; asdf"],
    foundation_drills: [
      {
        id: "punctuation-edges",
        title_zh: "标点边界",
        title_en: "Punctuation edges",
        hint_zh: "",
        hint_en: "",
        items: ["; ; ;", "[ ] { }", "- = _ +", "/ ? . ,", "' \" `"],
      },
    ],
    word_chunks: ["per form ance", "select ed pending"],
    common_words: ["today", "review", "support", "practice"],
    everyday_english: {
      sources: [],
      entries: [
        {
          text: "today",
          kind: "word",
          tier: 1,
          length: null,
          domain: "everyday",
          source_id: "test",
        },
      ],
    },
    everyday_words: { sources: [], entries: [] },
    everyday_sentences: { sources: [], entries: [] },
    everyday_articles: { sources: [], entries: [] },
    everyday_word_decomposition: { sources: [], entries: [] },
    programming_words: ["enabled", "visible", "archived", "configuration"].map((word) => ({
      word,
      note_zh: "",
    })),
    code_snippets: [
      {
        language: "typescript",
        framework: "react",
        project: "test",
        level: "function",
        source: "test",
        text: "function selectedValue() {\n  return selected;\n}",
      },
    ],
    long_words: [],
  };
}

describe("ghostRows space glyph", () => {
  test("renders interior spaces as middle dot when spaceDot enabled", () => {
    const rows = ghostRows("give up", "give", undefined, false, { spaceDot: true });
    const texts = (rows[0] ?? []).map((segment) => segment.text).join("");
    expect(texts).toBe("give·up");
  });

  test("default keeps plain spaces", () => {
    const rows = ghostRows("give up", "", undefined, false);
    const texts = (rows[0] ?? []).map((segment) => segment.text).join("");
    expect(texts).toBe("give up");
  });
});

describe("ghost viewport slice", () => {
  test("short content renders fully", () => {
    expect(ghostViewportSlice(10, 3, 20)).toEqual({ start: 0, end: 10 });
    expect(ghostViewportSlice(10, 3, Number.POSITIVE_INFINITY)).toEqual({ start: 0, end: 10 });
  });

  test("cursor near top keeps window at start", () => {
    expect(ghostViewportSlice(100, 2, 20)).toEqual({ start: 0, end: 20 });
  });

  test("cursor mid-content keeps cursor around 40% of viewport", () => {
    const slice = ghostViewportSlice(100, 50, 20);
    expect(slice.start).toBe(42);
    expect(slice.end).toBe(62);
  });

  test("cursor near bottom keeps cursor near window top so last rows always scroll in", () => {
    // 不贴底截停：光标行保持在窗口顶部偏移处，即使窗口尾部不足 viewport 行
    expect(ghostViewportSlice(100, 99, 20)).toEqual({ start: 91, end: 100 });
    expect(ghostViewportSlice(62, 61, 20)).toEqual({ start: 53, end: 62 });
  });

  test("missing cursor anchors at top", () => {
    expect(ghostViewportSlice(100, -1, 20)).toEqual({ start: 0, end: 20 });
  });
});

describe("ghost visual row count", () => {
  test("counts one visual row per short code line", () => {
    const text = Array.from({ length: 12 }, (_, i) => `const v${i} = ${i};`).join("\n");
    expect(ghostVisualRowCount(text, text, "code", undefined, undefined)).toBe(12);
  });

  test("counts sentence translation lines", () => {
    const text = "The weather is nice.\nShe left early.";
    const annotations = [
      { start: 0, end: 20, translation_zh: "天气不错。", display: "line" as const },
      { start: 21, end: 36, translation_zh: "她早走了。", display: "line" as const },
    ];
    // 2 句 + 2 行翻译 = 4 可视行
    expect(ghostVisualRowCount(text, text, "words", annotations, undefined)).toBe(4);
  });

  test("counts the article translation rows (spacer + wrapped lines)", () => {
    const text = "First para.\nSecond para.";
    const withoutArticle = ghostVisualRowCount(text, text, "words", undefined, undefined);
    const annotations = [
      {
        start: 0,
        end: text.length,
        translation_zh: "第一段。第二段。",
        display: "article" as const,
      },
    ];
    const withArticle = ghostVisualRowCount(text, text, "words", annotations, undefined);
    // 文章翻译现在计入行数（1 行间隔 + 至少 1 行翻译），否则复盘滚不到底
    expect(withArticle).toBeGreaterThanOrEqual(withoutArticle + 2);
  });
});

describe("ghost text review scroll windowing", () => {
  const ghostKit = (): OpenTuiRendererKit & { addedNodes: never } =>
    ({
      Box: (props: unknown, ...children: unknown[]) => ({ type: "Box", props, children }),
      ScrollBox: (props: unknown, ...children: unknown[]) => ({ type: "ScrollBox", props, children }),
      Text: (props: unknown) => ({ type: "Text", props, children: [] }),
    }) as never;

  function flattenText(node: unknown, out: string[] = []): string[] {
    const value = node as { props?: { content?: unknown }; children?: unknown[] };
    if (typeof value.props?.content === "string") {
      out.push(value.props.content);
    }
    for (const child of value.children ?? []) {
      flattenText(child, out);
    }
    return out;
  }

  const longCode = Array.from({ length: 60 }, (_, i) =>
    i === 0 ? "const FIRST = 1;" : i === 59 ? "const LAST = 60;" : `const v${i} = ${i};`,
  ).join("\n");
  const blocks = [
    { start_line: 0, line_count: 60, language: "typescript", framework: "l", project: "p", source: "s" },
  ];

  async function withRows<T>(rows: number, run: () => Promise<T>): Promise<T> {
    const original = Object.getOwnPropertyDescriptor(process.stdout, "rows");
    Object.defineProperty(process.stdout, "rows", { value: rows, configurable: true });
    try {
      return await run();
    } finally {
      if (original) {
        Object.defineProperty(process.stdout, "rows", original);
      }
    }
  }

  test("reviewScroll undefined on completed snapshot shows the bottom", async () => {
    await withRows(30, async () => {
      const tree = await renderGhostText(
        longCode, longCode, "code", "s", blocks, undefined, ghostKit(),
        "✓ done", undefined, undefined,
      );
      const content = flattenText(tree).join("\n");
      // 完成态默认停底部：末行可见、首行不可见
      expect(content).toContain("LAST");
      expect(content).not.toContain("FIRST");
    });
  });

  test("reviewScroll 0 scrolls to the top", async () => {
    await withRows(30, async () => {
      const tree = await renderGhostText(
        longCode, longCode, "code", "s", blocks, undefined, ghostKit(),
        "✓ done", undefined, 0,
      );
      const content = flattenText(tree).join("\n");
      expect(content).toContain("FIRST");
      expect(content).not.toContain("LAST");
    });
  });

  test("oversized reviewScroll clamps to the bottom", async () => {
    await withRows(30, async () => {
      const tree = await renderGhostText(
        longCode, longCode, "code", "s", blocks, undefined, ghostKit(),
        "✓ done", undefined, 9999,
      );
      const content = flattenText(tree).join("\n");
      expect(content).toContain("LAST");
    });
  });
});

describe("render tree disposal (memory-leak guard)", () => {
  test("replacing the route destroys the previous tree via destroyRecursively", async () => {
    let destroyCalls = 0;
    const kit = {
      Box: (props: unknown, ...children: unknown[]) => ({ type: "Box", props, children }),
      ScrollBox: (props: unknown, ...children: unknown[]) => ({ type: "ScrollBox", props, children }),
      Text: (props: unknown) => ({ type: "Text", props, children: [] }),
      createCliRenderer: async () => {
        const store = new Map<string, { destroyRecursively: () => void }>();
        return {
          root: {
            add: (...nodes: unknown[]) => {
              for (const node of nodes) {
                const id = (node as { props?: { id?: string } }).props?.id;
                if (id !== undefined) {
                  store.set(id, {
                    destroyRecursively: () => {
                      destroyCalls += 1;
                    },
                  });
                }
              }
            },
            remove: (id: string) => {
              store.delete(id);
            },
            getRenderable: (id: string) => store.get(id),
          },
          idle: async () => {},
          requestRender: () => {},
        };
      },
    } as unknown as OpenTuiRendererKit;

    const renderer = await renderOpenTuiAppOnce(createOpenTuiInitialState("en"), kit);
    expect(destroyCalls).toBe(0); // 首帧无旧树可销毁
    await renderer.renderState?.(createOpenTuiInitialState("zh"));
    // 替换路由树时旧树被 destroyRecursively（释放 yoga native 节点，修复泄漏）
    expect(destroyCalls).toBe(1);
    await renderer.renderState?.(createOpenTuiInitialState("en"));
    expect(destroyCalls).toBe(2);
  });
});
