import type { OpenTuiAppState } from "../appModel";
import type { OpenTuiRendererKit } from "../kit";
import { TEXT_BOLD, theme } from "../theme";

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
