import type { TextureDocument } from "../types";
export function snapshot(d: TextureDocument): TextureDocument {
  return {
    ...d,
    layers: d.layers.map((l) => ({ ...l })),
    selectedIslands: [...d.selectedIslands],
    uvNames: d.uvNames ? { ...d.uvNames } : undefined,
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
  // Only buffers that the newest snapshot no longer uses cost extra memory; buffers still
  // shared with the live document must not count, or large layer stacks keep a single step.
  trim() {
    const budget = 512 * 1024 * 1024;
    const buffers = (doc: TextureDocument) => doc.layers.flatMap((l) => [
      l.canvas, l.uvMask, l.placement?.source, l.placement?.rest, l.placement?.rendered,
    ].filter((c): c is HTMLCanvasElement => !!c));
    while (this.undoStack.length > 1) {
      const live = new Set(buffers(this.undoStack[this.undoStack.length - 1].doc));
      const seen = new Set<HTMLCanvasElement>();
      for (const s of this.undoStack)
        for (const c of buffers(s.doc)) if (!live.has(c)) seen.add(c);
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
