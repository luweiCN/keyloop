import type { OpenTuiAppState } from "../appModel";
import type { OpenTuiRendererKit } from "../kit";
import { TEXT_BOLD, theme, type OpenTuiColorInput } from "../theme";

function helpBar(content: string, kit: OpenTuiRendererKit, id: string): unknown {
  return kit.Text({
    id,
    content,
    fg: theme.muted,
    height: 1,
    wrapMode: "none",
  });
}

export function renderLibraryCreateScreen(
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): unknown {
  if (state.route.screen !== "library_create") {
    return kit.Box({ id: "keyloop-library-create-empty" });
  }
  const zh = state.language === "zh";
  const name = state.route.name;
  return kit.Box(
    {
      id: "keyloop-library-create",
      flexDirection: "column",
      gap: 1,
      flexGrow: 1,
      width: "100%",
    },
    kit.Box(
      {
        id: "keyloop-library-create-input-panel",
        border: true,
        borderStyle: "rounded",
        borderColor: theme.info,
        paddingX: 1,
        height: 3,
        width: "100%",
        flexShrink: 0,
        title: zh ? " 新建语料库 " : " New library ",
        overflow: "hidden",
      },
      kit.Text({
        id: "keyloop-library-create-name",
        content: name === "" ? (zh ? "输入语料库名称…" : "type a library name…") : `${name}▏`,
        fg: name === "" ? theme.muted : theme.foreground,
        attributes: name === "" ? undefined : TEXT_BOLD,
        height: 1,
        wrapMode: "none",
      }),
    ),
    helpBar(
      zh ? "Enter 创建 · Esc 取消" : "Enter to create · Esc to cancel",
      kit,
      "keyloop-library-create-help",
    ),
  );
}

export function libraryInputPaneWidth(): number {
  const terminalColumns = process.stdout.columns;
  const frameColumns =
    terminalColumns === undefined || terminalColumns <= 0
      ? APP_FRAME_WIDTH
      : Math.min(terminalColumns, APP_FRAME_WIDTH);
  return Math.max(20, frameColumns - 4); // 扣除边框
}

function libraryInputPaneHeight(): number {
  const terminalRows = process.stdout.rows ?? 32;
  return Math.max(8, terminalRows - 10); // 扣除标题、边框、帮助栏等
}

export function renderLibraryInputScreen(
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): unknown {
  if (state.route.screen !== "library_input") {
    return kit.Box({ id: "keyloop-library-input-empty" });
  }
  const zh = state.language === "zh";
  const route = state.route;
  const libraryName =
    (state.customLibraries ?? []).find((entry) => entry.slug === route.slug)?.name ?? route.slug;
  const titles = {
    words: zh ? "添加单词 / 词组" : "Add words / phrases",
    sentences: zh ? "添加句子" : "Add sentences",
    article: zh ? "添加文章" : "Add article",
  } as const;
  const helps = {
    words: zh
      ? "每行一条：word 或 word: 释义 · Ctrl+D 提交 · Esc 取消"
      : "one per line: word or word: meaning · Ctrl+D submit · Esc cancel",
    sentences: zh
      ? "每块：第 1 行英文，第 2 行中文（可省），空行分隔 · Ctrl+D 提交 · Esc 取消"
      : "per block: English line, then translation (optional), blank line between · Ctrl+D submit",
    article: zh
      ? "整篇英文（每段一行）+ 空行 + 整篇中文 · Ctrl+D 提交 · Esc 取消"
      : "English paragraphs (one per line), blank line, then translations · Ctrl+D submit",
  } as const;

  const paneWidth = libraryInputPaneWidth();
  const paneHeight = libraryInputPaneHeight();
  const cursor = Math.min(route.cursor ?? route.text.length, route.text.length);
  const body =
    route.text === ""
      ? kit.Text({
          id: "keyloop-library-input-placeholder",
          content: zh ? "▏在此粘贴或输入内容…" : "▏paste or type content here…",
          fg: theme.muted,
          height: 1,
          wrapMode: "none",
        })
      : renderTextPane(
          {
            id: "keyloop-library-input-pane",
            width: paneWidth,
            height: paneHeight,
            mode: { kind: "edit", text: route.text, cursor },
            markNewlines: true,
          },
          kit,
        );
  return kit.Box(
    {
      id: "keyloop-library-input",
      flexDirection: "column",
      gap: 1,
      flexGrow: 1,
      width: "100%",
    },
    kit.Box(
      {
        id: "keyloop-library-input-body-panel",
        border: true,
        borderStyle: "rounded",
        borderColor: theme.info,
        flexGrow: 1,
        width: "100%",
        title: ` ${titles[route.kind]} — ${libraryName} `,
        bottomTitle: zh
          ? ` ${route.text.split("\n").length} 行 · ${Array.from(route.text).length} 字 `
          : ` ${route.text.split("\n").length} lines · ${Array.from(route.text).length} chars `,
        bottomTitleAlignment: "right",
        overflow: "hidden",
        flexDirection: "column",
      },
      body,
    ),
    helpBar(helps[route.kind], kit, "keyloop-library-input-help"),
  );
}

const PREVIEW_VISIBLE_ROWS = 12;

export function renderLibraryPreviewScreen(
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): unknown {
  if (state.route.screen !== "library_preview") {
    return kit.Box({ id: "keyloop-library-preview-empty" });
  }
  const zh = state.language === "zh";
  const payload = state.route.payload;
  const children: unknown[] = [];
  let rowIndex = 0;
  const pushRow = (content: string, fg: OpenTuiColorInput, bold = false): void => {
    children.push(
      kit.Text({
        id: `keyloop-library-preview-row-${rowIndex}`,
        content,
        fg,
        ...(bold ? { attributes: TEXT_BOLD } : {}),
        height: 1,
        wrapMode: "none",
      }),
    );
    rowIndex += 1;
  };

  let summary = "";
  if (payload.kind === "words") {
    summary = zh
      ? `共 ${payload.entries.length} 条`
      : `${payload.entries.length} entries`;
    for (const line of payload.error_lines.slice(0, 3)) {
      pushRow(zh ? `✗ 已忽略 ${line}` : `✗ skipped ${line}`, theme.danger);
    }
    const missing = payload.entries.filter((entry) => entry.meaning_zh === undefined).length;
    if (missing > 0) {
      pushRow(
        zh
          ? `⚠ ${missing} 条未找到释义，可保存后在管理中编辑补充`
          : `⚠ ${missing} entries missing meanings; edit later from manage`,
        theme.warning,
      );
    }
    for (const entry of payload.entries.slice(0, PREVIEW_VISIBLE_ROWS)) {
      const meaning = entry.meaning_zh ?? (zh ? "（无释义）" : "(no meaning)");
      const sourceTag =
        entry.source === "manual" ? (zh ? "[手动]" : "[manual]") : (zh ? "[词典]" : "[dict]");
      pushRow(
        `${entry.word_kind === "phrase" ? "◇" : "·"} ${entry.text} — ${meaning} ${sourceTag}`,
        entry.meaning_zh === undefined ? theme.warning : theme.foreground,
      );
    }
    if (payload.entries.length > PREVIEW_VISIBLE_ROWS) {
      pushRow(
        zh
          ? `… 其余 ${payload.entries.length - PREVIEW_VISIBLE_ROWS} 条省略`
          : `… ${payload.entries.length - PREVIEW_VISIBLE_ROWS} more`,
        theme.muted,
      );
    }
  } else if (payload.kind === "sentences") {
    summary = zh ? `共 ${payload.entries.length} 句` : `${payload.entries.length} sentences`;
    for (const entry of payload.entries.slice(0, Math.floor(PREVIEW_VISIBLE_ROWS / 2))) {
      pushRow(`· ${entry.text}`, theme.foreground);
      pushRow(
        `  ${entry.translation_zh ?? (zh ? "（无翻译）" : "(no translation)")}`,
        entry.translation_zh === undefined ? theme.warning : theme.muted,
      );
    }
  } else {
    summary = zh
      ? `${payload.paragraphs.length} 段`
      : `${payload.paragraphs.length} paragraphs`;
    for (const warning of payload.warnings) {
      pushRow(`⚠ ${warning}`, theme.warning);
    }
    // 与录入格式一致：整篇英文在上，空行后整篇翻译在下
    const columns = textPaneContentWidth(libraryInputPaneWidth());
    const blockBudget = Math.floor((PREVIEW_VISIBLE_ROWS - payload.warnings.length) / 2);
    const english = payload.paragraphs.map((paragraph) => paragraph.text);
    const chinese = payload.paragraphs
      .map((paragraph) => paragraph.translation_zh)
      .filter((line): line is string => line !== undefined);
    for (const line of english.slice(0, blockBudget)) {
      pushRow(truncateToDisplayWidth(line, columns), theme.foreground);
    }
    if (english.length > blockBudget) {
      pushRow(zh ? `… 其余 ${english.length - blockBudget} 段省略` : `… ${english.length - blockBudget} more`, theme.muted);
    }
    if (chinese.length > 0) {
      pushRow("", theme.muted);
      for (const line of chinese.slice(0, blockBudget)) {
        pushRow(truncateToDisplayWidth(line, columns), theme.muted);
      }
      if (chinese.length > blockBudget) {
        pushRow(zh ? `… 其余 ${chinese.length - blockBudget} 行省略` : `… ${chinese.length - blockBudget} more`, theme.muted);
      }
    } else {
      pushRow(zh ? "（无翻译）" : "(no translation)", theme.warning);
    }
  }

  return kit.Box(
    {
      id: "keyloop-library-preview",
      flexDirection: "column",
      gap: 1,
      flexGrow: 1,
      width: "100%",
    },
    kit.Box(
      {
        id: "keyloop-library-preview-panel",
        border: true,
        borderStyle: "rounded",
        borderColor: theme.info,
        paddingX: 1,
        flexGrow: 1,
        width: "100%",
        title: zh ? ` 预览确认 — ${summary} ` : ` Preview — ${summary} `,
        overflow: "hidden",
        flexDirection: "column",
      },
      ...children,
    ),
    helpBar(
      zh ? "Enter 保存 · 退格/Esc 返回修改" : "Enter to save · Backspace/Esc to edit",
      kit,
      "keyloop-library-preview-help",
    ),
  );
}

import { listRow } from "../components";
import { APP_FRAME_WIDTH } from "./appFrame";
import { renderTextPane, textPaneContentWidth, type TextPaneBlock } from "./textPane";
import { truncateToDisplayWidth, wrapWordsToDisplayWidth } from "./shared";
import {
  libraryActionItems,
  libraryBrowseMatches,
  libraryEntryById,
  type LibraryBrowseEntry,
} from "../libraryReducers";

function libraryListRow(
  id: string,
  label: string,
  hint: string,
  selected: boolean,
  kit: OpenTuiRendererKit,
): unknown {
  return listRow(
    id,
    selected,
    { height: 1, gap: 1 },
    kit,
    kit.Text({
      id: `${id}-label`,
      content: label,
      fg: selected ? theme.accent : theme.foreground,
      attributes: TEXT_BOLD,
      height: 1,
      wrapMode: "none",
      truncate: true,
      flexShrink: 0,
    }),
    kit.Text({
      id: `${id}-hint`,
      content: hint,
      fg: theme.muted,
      height: 1,
      wrapMode: "none",
      truncate: true,
    }),
  );
}

export function renderLibraryManageScreen(
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): unknown {
  if (state.route.screen !== "library_manage") {
    return kit.Box({ id: "keyloop-library-manage-empty" });
  }
  const zh = state.language === "zh";
  const libraries = state.customLibraries ?? [];
  const selected = Math.min(
    Math.max(state.route.selected_index ?? 0, 0),
    Math.max(libraries.length - 1, 0),
  );
  const children: unknown[] = [];
  if (libraries.length === 0) {
    children.push(
      kit.Text({
        id: "keyloop-library-manage-empty-hint",
        content: zh ? "还没有语料库，先从「新建语料库」开始" : "No libraries yet — create one first",
        fg: theme.muted,
        height: 1,
        wrapMode: "none",
      }),
    );
  }
  for (let index = 0; index < libraries.length; index += 1) {
    const library = libraries[index]!;
    const wordCount = library.words.filter((word) => word.kind === "word").length;
    const phraseCount = library.words.length - wordCount;
    children.push(
      libraryListRow(
        `keyloop-library-manage-row-${index}`,
        library.name,
        zh
          ? `${wordCount} 词 · ${phraseCount} 组 · ${library.sentences.length} 句 · ${library.articles.length} 篇`
          : `${wordCount}w · ${phraseCount}p · ${library.sentences.length}s · ${library.articles.length}a`,
        index === selected,
        kit,
      ),
    );
  }
  return kit.Box(
    {
      id: "keyloop-library-manage",
      flexDirection: "column",
      gap: 1,
      flexGrow: 1,
      width: "100%",
    },
    kit.Box(
      {
        id: "keyloop-library-manage-panel",
        border: true,
        borderStyle: "rounded",
        borderColor: theme.info,
        paddingX: 1,
        flexGrow: 1,
        width: "100%",
        title: zh ? " 管理语料库 " : " Manage libraries ",
        overflow: "hidden",
        flexDirection: "column",
      },
      ...children,
    ),
    helpBar(zh ? "↑↓ 选择 · Enter 进入 · Esc 返回" : "↑↓ select · Enter open · Esc back", kit, "keyloop-library-manage-help"),
  );
}

export function renderLibraryActionsScreen(
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): unknown {
  if (state.route.screen !== "library_actions") {
    return kit.Box({ id: "keyloop-library-actions-empty" });
  }
  const zh = state.language === "zh";
  const route = state.route;
  const libraryName =
    (state.customLibraries ?? []).find((entry) => entry.slug === route.slug)?.name ?? route.slug;
  const items = libraryActionItems(state, route.slug);
  const selected = Math.min(Math.max(route.selected_index ?? 0, 0), items.length - 1);
  return kit.Box(
    {
      id: "keyloop-library-actions",
      flexDirection: "column",
      gap: 1,
      flexGrow: 1,
      width: "100%",
    },
    kit.Box(
      {
        id: "keyloop-library-actions-panel",
        border: true,
        borderStyle: "rounded",
        borderColor: theme.info,
        paddingX: 1,
        flexGrow: 1,
        width: "100%",
        title: ` ${libraryName} `,
        overflow: "hidden",
        flexDirection: "column",
      },
      ...items.map((item, index) =>
        libraryListRow(
          `keyloop-library-actions-row-${index}`,
          item.label,
          item.hint,
          index === selected,
          kit,
        ),
      ),
    ),
    helpBar(zh ? "↑↓ 选择 · Enter 确认 · Esc 返回" : "↑↓ select · Enter confirm · Esc back", kit, "keyloop-library-actions-help"),
  );
}

const BROWSE_VISIBLE_ENTRIES = 6;

export function renderLibraryBrowseScreen(
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): unknown {
  if (state.route.screen !== "library_browse") {
    return kit.Box({ id: "keyloop-library-browse-empty" });
  }
  const zh = state.language === "zh";
  const route = state.route;
  const matches = libraryBrowseMatches(state);
  const selected = Math.min(Math.max(route.index, 0), Math.max(matches.length - 1, 0));
  const columns = textPaneContentWidth(libraryInputPaneWidth());
  const rows: unknown[] = [];
  const windowStart = Math.max(
    0,
    Math.min(
      selected - Math.floor(BROWSE_VISIBLE_ENTRIES / 2),
      matches.length - BROWSE_VISIBLE_ENTRIES,
    ),
  );
  for (
    let index = windowStart;
    index < Math.min(matches.length, windowStart + BROWSE_VISIBLE_ENTRIES);
    index += 1
  ) {
    const match = matches[index]!;
    const isSelected = index === selected;
    rows.push(renderBrowseEntryRows(match, index, isSelected, columns, zh, kit));
  }
  if (matches.length === 0) {
    rows.push(
      kit.Text({
        id: "keyloop-library-browse-no-match",
        content: zh ? "没有匹配的条目" : "no matching entries",
        fg: theme.muted,
        height: 1,
        wrapMode: "none",
      }),
    );
  }
  return kit.Box(
    {
      id: "keyloop-library-browse",
      flexDirection: "column",
      gap: 1,
      flexGrow: 1,
      width: "100%",
    },
    kit.Box(
      {
        id: "keyloop-library-browse-search-panel",
        border: true,
        borderStyle: "rounded",
        borderColor: theme.info,
        paddingX: 1,
        height: 3,
        width: "100%",
        flexShrink: 0,
        title: zh ? " 浏览内容 " : " Browse entries ",
        bottomTitle: ` ${matches.length} `,
        bottomTitleAlignment: "right",
        overflow: "hidden",
      },
      kit.Text({
        id: "keyloop-library-browse-query",
        content:
          route.query === ""
            ? zh
              ? "⌕ 输入关键词模糊搜索（词 · 句 · 文）"
              : "⌕ type to fuzzy search all entries"
            : `⌕ ${route.query}▏`,
        fg: route.query === "" ? theme.muted : theme.foreground,
        height: 1,
        wrapMode: "none",
      }),
    ),
    kit.Box(
      {
        id: "keyloop-library-browse-list",
        border: true,
        borderStyle: "rounded",
        borderColor: theme.muted,
        paddingX: 1,
        flexGrow: 1,
        width: "100%",
        overflow: "hidden",
        flexDirection: "column",
        gap: 1,
      },
      ...rows,
    ),
    helpBar(
      zh
        ? "输入搜索 · ↑↓ 选择 · Enter 查看详情 · Ctrl+X 快捷删除 · Esc 返回"
        : "type to search · ↑↓ select · Enter detail · Ctrl+X delete · Esc back",
      kit,
      "keyloop-library-browse-help",
    ),
  );
}

/** 条目两行：第一行原文（含类型标记），第二行翻译，占满宽度后截断 */
function renderBrowseEntryRows(
  match: LibraryBrowseEntry,
  index: number,
  selected: boolean,
  columns: number,
  zh: boolean,
  kit: OpenTuiRendererKit,
): unknown {
  const marker = selected ? "▌ " : "  ";
  const tag =
    match.entry_type === "words"
      ? match.entry.kind === "phrase"
        ? zh
          ? "[组]"
          : "[P]"
        : zh
          ? "[词]"
          : "[W]"
      : match.entry_type === "sentences"
        ? zh
          ? "[句]"
          : "[S]"
        : zh
          ? "[文]"
          : "[A]";
  const original =
    match.entry_type === "articles" ? (match.entry.paragraphs[0]?.text ?? "") : match.entry.text;
  const translation =
    match.entry_type === "words"
      ? (match.entry.meaning_zh ?? (zh ? "（无释义）" : "(no meaning)"))
      : match.entry_type === "sentences"
        ? (match.entry.translation_zh ?? (zh ? "（无翻译）" : "(no translation)"))
        : (match.entry.paragraphs[0]?.translation_zh ?? (zh ? "（无翻译）" : "(no translation)"));
  const bodyWidth = Math.max(10, columns - 6);
  return kit.Box(
    {
      id: `keyloop-library-browse-entry-${index}`,
      flexDirection: "column",
      width: "100%",
      flexShrink: 0,
    },
    kit.Text({
      id: `keyloop-library-browse-entry-${index}-text`,
      content: `${marker}${tag} ${ellipsize(original, bodyWidth)}`,
      fg: selected ? theme.accent : theme.foreground,
      ...(selected ? { attributes: TEXT_BOLD } : {}),
      height: 1,
      wrapMode: "none",
    }),
    kit.Text({
      id: `keyloop-library-browse-entry-${index}-translation`,
      content: `${selected ? "▌ " : "  "}     ${ellipsize(translation, bodyWidth)}`,
      fg: theme.muted,
      height: 1,
      wrapMode: "none",
    }),
  );
}

function ellipsize(text: string, maxWidth: number): string {
  const truncated = truncateToDisplayWidth(text, maxWidth);
  return truncated.length < text.length ? `${truncated}…` : truncated;
}


export function renderLibraryDeleteConfirmScreen(
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): unknown {
  if (state.route.screen !== "library_delete_confirm") {
    return kit.Box({ id: "keyloop-library-delete-empty" });
  }
  const zh = state.language === "zh";
  const route = state.route;
  const library = (state.customLibraries ?? []).find((entry) => entry.slug === route.slug);
  const name = library?.name ?? route.slug;
  return kit.Box(
    {
      id: "keyloop-library-delete",
      flexDirection: "column",
      gap: 1,
      flexGrow: 1,
      width: "100%",
    },
    kit.Box(
      {
        id: "keyloop-library-delete-panel",
        border: true,
        borderStyle: "rounded",
        borderColor: theme.danger,
        paddingX: 1,
        height: 4,
        width: "100%",
        flexShrink: 0,
        title: zh ? " 删除确认 " : " Delete confirmation ",
        overflow: "hidden",
        flexDirection: "column",
      },
      kit.Text({
        id: "keyloop-library-delete-question",
        content: zh
          ? `删除语料库「${name}」？该操作不可恢复。`
          : `Delete library "${name}"? This cannot be undone.`,
        fg: theme.foreground,
        attributes: TEXT_BOLD,
        height: 1,
        wrapMode: "none",
      }),
      kit.Text({
        id: "keyloop-library-delete-detail",
        content: zh
          ? `${library?.words.length ?? 0} 条单词/词组 · ${library?.sentences.length ?? 0} 句 · ${library?.articles.length ?? 0} 篇将被删除`
          : `${library?.words.length ?? 0} words · ${library?.sentences.length ?? 0} sentences · ${library?.articles.length ?? 0} articles will be removed`,
        fg: theme.muted,
        height: 1,
        wrapMode: "none",
      }),
    ),
    helpBar(zh ? "Enter 确认删除 · 退格/Esc 取消" : "Enter to delete · Backspace/Esc to cancel", kit, "keyloop-library-delete-help"),
  );
}

export interface DetailPopupSize {
  width: number;
  height: number;
  bodyHeight: number;
  paneWidth: number;
}

export function detailPopupSize(): DetailPopupSize {
  const terminalColumns = process.stdout.columns ?? APP_FRAME_WIDTH;
  const terminalRows = process.stdout.rows ?? 32;
  const width = Math.max(44, Math.min(Math.floor(terminalColumns * 0.7), APP_FRAME_WIDTH - 4));
  const height = Math.max(14, Math.floor(terminalRows * 0.8));
  return { width, height, bodyHeight: Math.max(6, height - 2), paneWidth: width - 2 };
}

export function detailViewBlocks(match: LibraryBrowseEntry, zh: boolean): TextPaneBlock[] {
  if (match.entry_type === "words") {
    const blocks: TextPaneBlock[] = [{ text: match.entry.text, fg: theme.foreground }];
    if (match.entry.phonetic !== undefined) {
      blocks.push({ text: `/${match.entry.phonetic}/`, fg: theme.info });
    }
    blocks.push({ text: "", fg: theme.muted });
    blocks.push({
      text: match.entry.meaning_zh ?? (zh ? "（无释义）" : "(no meaning)"),
      fg: theme.muted,
    });
    return blocks;
  }
  if (match.entry_type === "sentences") {
    return [
      { text: match.entry.text, fg: theme.foreground },
      { text: "", fg: theme.muted },
      {
        text: match.entry.translation_zh ?? (zh ? "（无翻译）" : "(no translation)"),
        fg: theme.muted,
      },
    ];
  }
  const english = match.entry.paragraphs.map((paragraph) => paragraph.text).join("\n");
  const chinese = match.entry.paragraphs
    .map((paragraph) => paragraph.translation_zh ?? "")
    .filter((line) => line !== "")
    .join("\n");
  return [
    { text: english, fg: theme.foreground },
    { text: "", fg: theme.muted },
    { text: chinese === "" ? (zh ? "（无翻译）" : "(no translation)") : chinese, fg: theme.muted },
  ];
}

export function renderLibraryDetailScreen(
  state: OpenTuiAppState,
  kit: OpenTuiRendererKit,
): unknown {
  if (state.route.screen !== "library_detail") {
    return kit.Box({ id: "keyloop-library-detail-empty" });
  }
  const zh = state.language === "zh";
  const route = state.route;
  const match = libraryEntryById(state, route.slug, route.entry_id);
  const size = detailPopupSize();
  const editing = route.editing;
  const typeLabel =
    match === undefined
      ? ""
      : match.entry_type === "words"
        ? match.entry.kind === "phrase"
          ? zh
            ? "词组"
            : "Phrase"
          : zh
            ? "单词"
            : "Word"
        : match.entry_type === "sentences"
          ? zh
            ? "句子"
            : "Sentence"
          : zh
            ? "文章"
            : "Article";

  let body: unknown;
  if (match === undefined) {
    body = kit.Text({
      id: "keyloop-library-detail-missing",
      content: zh ? "条目不存在" : "entry not found",
      fg: theme.muted,
      height: 1,
      wrapMode: "none",
    });
  } else if (editing === undefined) {
    body = renderTextPane(
      {
        id: "keyloop-library-detail-pane",
        width: size.paneWidth,
        height: size.bodyHeight,
        mode: { kind: "view", blocks: detailViewBlocks(match, zh), scroll: route.scroll },
      },
      kit,
    );
  } else {
    body = renderTextPane(
      {
        id: "keyloop-library-detail-pane",
        width: size.paneWidth,
        height: size.bodyHeight,
        mode: { kind: "edit", text: editing.text, cursor: editing.cursor },
        markNewlines: true,
      },
      kit,
    );
  }

  return kit.Box(
    {
      id: "keyloop-library-detail-backdrop",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      flexGrow: 1,
      width: "100%",
      height: "100%",
    },
    kit.Box(
      {
        id: "keyloop-library-detail-popup",
        border: true,
        borderStyle: "rounded",
        borderColor: editing === undefined ? theme.info : theme.accent,
        width: size.width,
        height: size.height,
        flexShrink: 0,
        title: editing === undefined ? ` ${typeLabel} ` : zh ? ` 编辑${typeLabel} ` : ` Edit ${typeLabel} `,
        bottomTitle:
          editing === undefined
            ? zh
              ? " ↑↓ 滚动 · E 编辑 · D 删除 · Esc 关闭 "
              : " arrows scroll · E edit · D delete · Esc close "
            : zh
              ? " Ctrl+D 保存 · ←→↑↓ 移动光标 · Esc 取消 "
              : " Ctrl+D save · arrows move cursor · Esc cancel ",
        bottomTitleAlignment: "right",
        overflow: "hidden",
        flexDirection: "column",
      },
      body,
    ),
  );
}

