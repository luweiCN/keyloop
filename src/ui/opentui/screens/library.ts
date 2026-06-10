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

const INPUT_VISIBLE_LINES = 14;

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

  if (route.kind === "article" && route.phase === "title") {
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
          id: "keyloop-library-input-title-panel",
          border: true,
          borderStyle: "rounded",
          borderColor: theme.info,
          paddingX: 1,
          height: 3,
          width: "100%",
          flexShrink: 0,
          title: zh ? ` 文章标题 — ${libraryName} ` : ` Article title — ${libraryName} `,
          overflow: "hidden",
        },
        kit.Text({
          id: "keyloop-library-input-title-value",
          content:
            route.article_title === ""
              ? zh
                ? "输入文章标题…"
                : "type the article title…"
              : `${route.article_title}▏`,
          fg: route.article_title === "" ? theme.muted : theme.foreground,
          attributes: route.article_title === "" ? undefined : TEXT_BOLD,
          height: 1,
          wrapMode: "none",
        }),
      ),
      helpBar(
        zh ? "Enter 继续粘贴正文 · Esc 取消" : "Enter to paste body · Esc to cancel",
        kit,
        "keyloop-library-input-title-help",
      ),
    );
  }

  const lines = route.text.split("\n");
  const visible = lines.slice(-INPUT_VISIBLE_LINES);
  const hiddenCount = lines.length - visible.length;
  const children: unknown[] = [];
  if (hiddenCount > 0) {
    children.push(
      kit.Text({
        id: "keyloop-library-input-overflow",
        content: zh ? `… 上方还有 ${hiddenCount} 行` : `… ${hiddenCount} more lines above`,
        fg: theme.muted,
        height: 1,
        wrapMode: "none",
      }),
    );
  }
  for (let index = 0; index < visible.length; index += 1) {
    const isLast = index === visible.length - 1;
    children.push(
      kit.Text({
        id: `keyloop-library-input-line-${index}`,
        content: `${visible[index] ?? ""}${isLast ? "▏" : ""}`,
        fg: theme.foreground,
        height: 1,
        wrapMode: "none",
      }),
    );
  }
  if (route.text === "") {
    children.push(
      kit.Text({
        id: "keyloop-library-input-placeholder",
        content: zh ? "在此粘贴或输入内容…" : "paste or type content here…",
        fg: theme.muted,
        height: 1,
        wrapMode: "none",
      }),
    );
  }
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
        paddingX: 1,
        flexGrow: 1,
        width: "100%",
        title: ` ${titles[route.kind]} — ${libraryName} `,
        overflow: "hidden",
        flexDirection: "column",
      },
      ...children,
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
      ? `《${payload.title || "未命名文章"}》 · ${payload.paragraphs.length} 段`
      : `"${payload.title || "Untitled"}" · ${payload.paragraphs.length} paragraphs`;
    for (const warning of payload.warnings) {
      pushRow(`⚠ ${warning}`, theme.warning);
    }
    for (const paragraph of payload.paragraphs.slice(0, 3)) {
      pushRow(`· ${paragraph.text.slice(0, 60)}`, theme.foreground);
      if (paragraph.translation_zh !== undefined) {
        pushRow(`  ${paragraph.translation_zh.slice(0, 60)}`, theme.muted);
      }
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
