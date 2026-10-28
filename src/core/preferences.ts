import type { UVDisplayMode } from "../types";
export const preferenceKey = "uvpaint.preferences";
export function loadPreferences(): {
  uvColor: string;
  uvOpacity: number;
  textScale: number;
  uvDisplay: UVDisplayMode;
} {
  const defaults = { uvColor: "#a5ece0", uvOpacity: 0.65, textScale: 1.4, uvDisplay: "off" as UVDisplayMode };
  try {
    const saved = JSON.parse(localStorage.getItem(preferenceKey) ?? "null");
    if (!saved || typeof saved !== "object") return defaults;
    return {
      uvDisplay: ["off", "quads", "triangles", "outline"].includes(saved.uvDisplay)
        ? saved.uvDisplay : defaults.uvDisplay,
      textScale:
        typeof saved.textScale === "number" &&
        Number.isFinite(saved.textScale) &&
        saved.textScale >= 0.8 &&
        saved.textScale <= 2.2
          ? saved.textScale
          : defaults.textScale,
      uvColor:
        typeof saved.uvColor === "string" &&
        /^#[0-9a-f]{6}$/i.test(saved.uvColor)
          ? saved.uvColor
          : defaults.uvColor,
      uvOpacity:
        typeof saved.uvOpacity === "number" &&
        Number.isFinite(saved.uvOpacity) &&
        saved.uvOpacity >= 0 &&
        saved.uvOpacity <= 1
          ? saved.uvOpacity
          : defaults.uvOpacity,
    };
  } catch {
    return defaults;
  }
}
