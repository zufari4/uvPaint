import { useEffect } from "react";
import { editor as e } from "../core/editor";
import type { Tool } from "../types";
import { invertSelection } from "../tools/selection";
export function useShortcuts() {
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if (e.modelLoading) return;
      const target = ev.target as HTMLElement;
      if (!ev.defaultPrevented && !document.querySelector(".modal-backdrop") && (ev.ctrlKey || ev.metaKey) && ev.code === "KeyS" && !ev.shiftKey) {
        ev.preventDefault();target.blur();void e.run(() => e.saveProject(ev.altKey));return;
      }
      const historyKey = (ev.ctrlKey || ev.metaKey) && ["KeyZ", "KeyY"].includes(ev.code);
      const textInput = target.closest('textarea,[contenteditable=true],input:not([type=checkbox]):not([type=range]):not([type=color]):not([type=button])');
      if (ev.key === "Escape" && e.pickingLayerIsland) {
        e.pickingLayerIsland = false;
        e.emit();
        ev.preventDefault();
        return;
      }
      if (
        ev.defaultPrevented ||
        (target.closest("input,textarea,select,[contenteditable=true]") && (!historyKey || textInput)) ||
        document.querySelector(".modal-backdrop")
      )
        return;
      const k = ev.code.startsWith("Key")
          ? ev.code.slice(3).toLowerCase()
          : ev.key.toLowerCase(),
        ctrl = ev.ctrlKey || ev.metaKey;
      if (ctrl) {
        const actions: Record<string, () => void> = {
          z: () => (ev.shiftKey ? e.redo() : e.undo()),
          y: () => e.redo(),
          c: () => e.copy(),
          x: () => e.copy(true),
          v: () => e.paste(),
          j: () => {
            if (ev.shiftKey) e.copy(false, true);
            else {
              e.copy();
              e.paste();
            }
          },
          a: () => {
            if (e.doc)
              e.setSelection(
                invertSelection(null, e.doc.width, e.doc.height),
                "replace",
              );
          },
          t: () => {
            e.setTool("move");
            e.beginTransform("free");
          },
          d: () => e.deselect(),
          i: () => {
            if (ev.shiftKey) e.invert();
          },
          o: () => void e.run(() => ev.shiftKey ? e.openProject() : e.openModel()),
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
        ev.preventDefault();
        if (!ev.repeat) e.clearPixels();
        return;
      }
      if (ev.altKey) return;
      if (ev.code === "BracketLeft" || ev.code === "BracketRight") {
        const step =
          e.brushSize <= 10
            ? 1
            : e.brushSize <= 100
              ? 5
              : e.brushSize <= 300
                ? 10
                : 25;
        e.brushSize = Math.max(
          1,
          e.brushSize + (ev.code === "BracketLeft" ? -step : step),
        );
        e.emit();
        ev.preventDefault();
        return;
      }
      if (k === "d" || k === "x") {
        if (k === "d") e.resetColors();
        else e.swapColors();
        ev.preventDefault();
        return;
      }
      if (ev.shiftKey && k === "l") {
        e.setTool(e.tool === "lasso" ? "polygon" : "lasso");
        ev.preventDefault();
        return;
      }
      if (
        /^Digit[0-9]$/.test(ev.code) &&
        ["brush", "line", "fill"].includes(e.tool)
      ) {
        e.colorAlpha = (Number(ev.code.slice(-1)) || 10) / 10;
        e.emit();
        ev.preventDefault();
        return;
      }
      const keys: Record<string, Tool> = {
        v: "move",
        m: "rect",
        l: "lasso",
        w: "wand",
        b: "brush",
        n: "line",
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
