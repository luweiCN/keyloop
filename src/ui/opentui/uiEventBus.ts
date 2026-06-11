import type { OpenTuiKeyEvent } from "./kit";

/**
 * UI 内部事件注入：让渲染层挂载的鼠标回调（如滚轮）把事件送回
 * 应用键事件循环，与键盘事件走同一条 reducer 路径。
 */
let sink: ((event: OpenTuiKeyEvent) => void) | null = null;

export function setUiEventSink(handler: ((event: OpenTuiKeyEvent) => void) | null): void {
  sink = handler;
}

export function injectUiEvent(event: OpenTuiKeyEvent): void {
  sink?.(event);
}

export const WHEEL_UP_EVENT: OpenTuiKeyEvent = {
  name: "wheel_up",
  sequence: "",
  ctrl: false,
  meta: false,
};

export const WHEEL_DOWN_EVENT: OpenTuiKeyEvent = {
  name: "wheel_down",
  sequence: "",
  ctrl: false,
  meta: false,
};
