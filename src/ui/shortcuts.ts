import { useEffect } from "react";
import { editor as e } from "../core/editor";
import type { Tool } from "../types";
export function useShortcuts() {
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if (
        (ev.target as HTMLElement).matches("input,textarea,select") ||
        document.querySelector(".modal-backdrop")
      )
        return;
      const k = ev.key.toLowerCase(),
        ctrl = ev.ctrlKey || ev.metaKey;
      if (ctrl) {
        const actions: Record<string, () => void> = {
          z: () => (ev.shiftKey ? e.redo() : e.undo()),
          y: () => e.redo(),
          c: () => e.copy(),
          x: () => e.copy(true),
          v: () => e.paste(),
          j: () => e.copy(false, true),
          d: () => e.deselect(),
          i: () => {
            if (ev.shiftKey) e.invert();
          },
          o: () => void e.run(() => e.openModel()),
          s: () => {
            if (ev.shiftKey) void e.run(() => e.export());
          },
        };
        if (actions[k]) {
          ev.preventDefault();
          actions[k]();
        }
        return;
      }
      if (ev.key === "Enter") {
        e.confirmTransform();
        return;
      }
      if (ev.key === "Escape") {
        e.cancelTransform();
        return;
      }
      if (ev.key === "Delete") {
        e.clearPixels();
        return;
      }
      if (k === "[" || k === "]") {
        e.brushSize = Math.max(1, e.brushSize + (k === "[" ? -4 : 4));
        e.emit();
        return;
      }
      const keys: Record<string, Tool> = {
        v: "move",
        m: "rect",
        l: "lasso",
        p: "polygon",
        w: "wand",
        b: "brush",
        e: "eraser",
        g: "fill",
        i: "eyedropper",
        s: "clone",
        u: "island",
        h: "pan",
      };
      if (keys[k]) {
        ev.preventDefault();
        e.setTool(keys[k]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
