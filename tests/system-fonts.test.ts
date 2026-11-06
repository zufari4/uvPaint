import { describe, expect, it } from "vitest";
import { fontFamilies } from "../electron/system-fonts";

describe("System font families", () => {
  it("turns registry font names into CSS family names", () => {
    expect(fontFamilies([
      "Arial (TrueType)", "Arial Bold Italic (TrueType)", "Cambria & Cambria Math (TrueType)",
      "Segoe UI Semibold (TrueType)", "Bahnschrift (TrueType)", "Franklin Gothic Medium (TrueType)", "@MS Gothic (TrueType)",
    ])).toEqual(["Arial", "Bahnschrift", "Cambria", "Cambria Math", "Franklin Gothic", "Franklin Gothic Medium", "Segoe UI", "Segoe UI Semibold"]);
  });
});
