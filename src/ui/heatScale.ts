export type HeatScaleKind = "success" | "danger";

export const heatScaleSteps = 5;

const heatScales = {
  success: [
    "#244c3f",
    "#1a4235",
    "#10382b",
    "#082f23",
    "#00241b",
  ],
  danger: [
    "#612d34",
    "#54242c",
    "#471b24",
    "#39131d",
    "#260914",
  ],
} as const satisfies Record<HeatScaleKind, readonly string[]>;

export function heatLevelFromRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) {
    return 0;
  }
  return clampHeatLevel(Math.round(Math.max(0, Math.min(1, ratio)) * (heatScaleSteps - 1)));
}

export function heatScaleColor(kind: HeatScaleKind, level: number): string {
  return heatScales[kind][clampHeatLevel(level)] ?? heatScales[kind][0];
}

function clampHeatLevel(level: number): number {
  return Math.max(0, Math.min(heatScaleSteps - 1, Math.trunc(level)));
}
