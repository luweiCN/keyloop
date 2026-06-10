import { describe, expect, test } from "bun:test";

import { heatLevelFromRatio, heatScaleColor, heatScaleSteps } from "../src/index";

describe("heat scale colors", () => {
  test("uses GitHub-style five contribution levels", () => {
    expect(heatScaleSteps).toBe(5);
    expect([0, 0.25, 0.5, 0.75, 1].map(heatLevelFromRatio)).toEqual([0, 1, 2, 3, 4]);
  });

  test("higher heat levels use deeper muted colors instead of brighter highlights", () => {
    for (const kind of ["success", "danger"] as const) {
      const low = relativeLuminance(heatScaleColor(kind, 0));
      const high = relativeLuminance(heatScaleColor(kind, heatScaleSteps - 1));
      const brightest = Math.max(
        ...Array.from({ length: heatScaleSteps }, (_, level) =>
          relativeLuminance(heatScaleColor(kind, level)),
        ),
      );

      expect(high).toBeLessThan(low);
      expect(brightest).toBeLessThan(0.18);
    }
  });
});

function relativeLuminance(hex: string): number {
  const channels = hexToRgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722;
}

function hexToRgb(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (match === null) {
    throw new Error(`expected six-digit hex color, got ${hex}`);
  }
  const value = match[1] ?? "";
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}
