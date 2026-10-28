import type { TextureDocument } from "../types";
export function snapshot(d: TextureDocument): TextureDocument {
  return {
    ...d,
    layers: d.layers.map((l) => ({ ...l })),
    selectedIslands: [...d.selectedIslands],
  };
}
export class History {
  undoStack: { label: string; doc: TextureDocument }[] = [];
  redoStack: { label: string; doc: TextureDocument }[] = [];
  push(label: string, doc: TextureDocument) {
    this.undoStack.push({ label, doc: snapshot(doc) });
    this.redoStack = [];
    this.trim();
  }
  // Pixel buffers are immutable between operations, so snapshots share unchanged layers.
  trim() {
    const budget = 384 * 1024 * 1024;
    while (this.undoStack.length > 1) {
      const seen = new Set<HTMLCanvasElement>();
      for (const s of this.undoStack)
        for (const l of s.doc.layers) seen.add(l.canvas);
      let bytes = 0;
      for (const c of seen) bytes += c.width * c.height * 4;
      if (bytes <= budget) break;
      this.undoStack.shift();
    }
  }
  undo(current: TextureDocument) {
    const s = this.undoStack.pop();
    if (!s) return null;
    this.redoStack.push({ label: s.label, doc: snapshot(current) });
    return snapshot(s.doc);
  }
  redo(current: TextureDocument) {
    const s = this.redoStack.pop();
    if (!s) return null;
    this.undoStack.push({ label: s.label, doc: snapshot(current) });
    return snapshot(s.doc);
  }
}
