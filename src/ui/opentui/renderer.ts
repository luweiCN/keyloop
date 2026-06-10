import type { OpenTuiAppState } from "./appModel";
import { openTuiRouteLines, openTuiRouteTitle } from "./appModel";
import { type OpenTuiRenderer, type OpenTuiRendererKit, loadOpenTuiKit } from "./kit";
import { OPEN_TUI_ROOT_ID, renderAppFrame } from "./screens/appFrame";
import { renderPanel } from "./screens/shared";
import {
  renderLibraryActionsScreen,
  renderLibraryBrowseScreen,
  renderLibraryCreateScreen,
  renderLibraryDeleteConfirmScreen,
  renderLibraryInputScreen,
  renderLibraryManageScreen,
  renderLibraryPreviewScreen,
} from "./screens/library";
import { renderMenuScreen } from "./screens/menu";
import { renderSettingsMenuScreen } from "./screens/settings";
import { renderCodeFilterPickerScreen } from "./screens/codeFilterPicker";
import { renderStatsScreen } from "./screens/stats";
import { renderAnsiPaletteScreen } from "./screens/ansiPalette";
import { renderRunningScreen } from "./screens/running";
import {
  renderCodeSettingsConfirmationScreen,
  renderCompleteScreen,
  renderExitConfirmationScreen,
  renderPracticeOptionsScreen,
} from "./screens/modals";

export {
  loadOpenTuiKit,
  type OpenTuiKeyEvent,
  type OpenTuiKeyInput,
  type OpenTuiRenderer,
  type OpenTuiRendererKit,
} from "./kit";

export async function renderOpenTuiAppOnce(
  state: OpenTuiAppState,
  kit?: OpenTuiRendererKit,
): Promise<OpenTuiRenderer> {
  const resolvedKit = kit ?? (await loadOpenTuiKit());
  const renderer = await resolvedKit.createCliRenderer({ exitOnCtrlC: true });
  renderer.root.add(await renderRoute(state, resolvedKit));
  let destroyed = false;
  const originalDestroy = renderer.destroy;
  renderer.destroy = (): void => {
    destroyed = true;
    originalDestroy?.call(renderer);
  };
  let renderQueue: Promise<void> = Promise.resolve();
  renderer.renderState = async (nextState: OpenTuiAppState): Promise<void> => {
    renderQueue = renderQueue.then(async () => {
      if (destroyed) {
        return;
      }
      const nextRoute = await renderRoute(nextState, resolvedKit);
      if (destroyed) {
        return;
      }
      renderer.root.remove?.(OPEN_TUI_ROOT_ID);
      renderer.root.add(nextRoute);
      await renderer.idle?.();
      renderer.requestRender?.();
    });
    await renderQueue;
  };
  await renderer.idle?.();
  return renderer;
}

async function renderRoute(state: OpenTuiAppState, kit: OpenTuiRendererKit): Promise<unknown> {
  switch (state.route.screen) {
    case "main_menu":
    case "submenu":
    case "library_menu":
      return renderAppFrame(state, renderMenuScreen(state, kit), kit);
    case "library_create":
      return renderAppFrame(state, renderLibraryCreateScreen(state, kit), kit);
    case "library_input":
      return renderAppFrame(state, renderLibraryInputScreen(state, kit), kit);
    case "library_preview":
      return renderAppFrame(state, renderLibraryPreviewScreen(state, kit), kit);
    case "library_manage":
      return renderAppFrame(state, renderLibraryManageScreen(state, kit), kit);
    case "library_actions":
      return renderAppFrame(state, renderLibraryActionsScreen(state, kit), kit);
    case "library_browse":
      return renderAppFrame(state, renderLibraryBrowseScreen(state, kit), kit);
    case "library_delete_confirm":
      return renderAppFrame(state, renderLibraryDeleteConfirmScreen(state, kit), kit);
    case "running":
      return renderAppFrame(state, await renderRunningScreen(state, kit), kit);
    case "exit_confirmation":
      return renderAppFrame(state, await renderExitConfirmationScreen(state, kit), kit);
    case "code_settings_confirmation":
      return renderAppFrame(state, await renderCodeSettingsConfirmationScreen(state, kit), kit);
    case "practice_options":
      return renderAppFrame(state, await renderPracticeOptionsScreen(state, kit), kit);
    case "complete":
      return renderAppFrame(state, await renderCompleteScreen(state, kit), kit);
    case "ansi_palette":
      return renderAppFrame(state, renderAnsiPaletteScreen(state, kit), kit);
    case "settings":
      return renderAppFrame(
        state,
        state.route.view === "menu"
          ? renderSettingsMenuScreen(state, kit)
          : state.route.view === "code_filters"
            ? renderCodeFilterPickerScreen(state, kit)
          : renderPanel("keyloop-route-panel", openTuiRouteTitle(state), openTuiRouteLines(state), kit),
        kit,
      );
    case "stats":
      return renderAppFrame(state, renderStatsScreen(state, kit), kit);
    case "summary":
      return renderAppFrame(
        state,
        renderPanel("keyloop-route-panel", openTuiRouteTitle(state), openTuiRouteLines(state), kit),
        kit,
      );
  }
}
