export const studioLightControls = [
  { key: "exposure", label: "Exposure", min: 0.1, max: 2 },
  { key: "key", label: "Main light", min: 0, max: 5 },
  { key: "fill", label: "Fill light", min: 0, max: 3 },
  { key: "environment", label: "Environment light", min: 0, max: 5 },
] as const;
export type StudioLighting = Record<typeof studioLightControls[number]["key"], number>;
export const defaultStudioLighting: StudioLighting = { exposure: 0.8, key: 1.35, fill: 0.45, environment: 0.55 };
export function normalizeStudioLighting(value: unknown, fallback = defaultStudioLighting): StudioLighting {
  const result = { ...fallback };
  if (!value || typeof value !== "object") return result;
  for (const control of studioLightControls) {
    const n = (value as Record<string, unknown>)[control.key];
    if (typeof n === "number" && Number.isFinite(n))
      result[control.key] = Math.min(control.max, Math.max(control.min, n));
  }
  return result;
}
