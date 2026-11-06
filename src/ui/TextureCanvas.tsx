import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointer } from "react";
import { ImagePlus, Maximize, Minimize2, Maximize2, Minus, Plus } from "lucide-react";
import { useEditor } from "./hooks";
import { Button } from "./Button";
import type { Point, SelectionMode, ShapeKind } from "../types";
import { canvas, context, masked } from "../core/canvas";
import { polygonMask } from "../tools/selection";
import { selectionBounds, selectionHandles, selectionCursors, hitSelectionHandle, dragSelectionBounds, transformSelection, type SelectionBounds } from "../tools/selection-frame";
import { traceIslands, hitIsland } from "../tools/uv";
import { traceGuides } from "../tools/uv-guides";
import { PaintStroke } from "../tools/paint";
import { TextureVisibility } from "../render/texture-visibility";
import { LayersDock } from "./LayersDock";
import {
  dragTransform,
  hitTransform,
  insideTransform,
  midpoint,
  transformHandles,
  transformResizeCursor,
  type TransformHit,
} from "../tools/free-transform";

type Gesture = {
  kind: "pan" | "select" | "paint" | "transform" | "move-pending" | "selection-frame" | "line";
  lineHandle?: "a" | "b";
  fresh?: boolean;
  start: Point;
  last: Point;
  points: Point[];
  handle: number;
  original: Point[];
  mode: SelectionMode;
  stroke?: PaintStroke;
  pan?: Point;
  transformHit?: TransformHit;
  selectionFrame?: { mask: HTMLCanvasElement; bounds: SelectionBounds; next: SelectionBounds };
  selectOnClick?: boolean;
  outsideFrame?: boolean;
  addIsland?: boolean;
  clientStart: Point;
  zoom: number;
};
const sizeTools = ["brush", "line", "eraser", "clone"];
const snapAngle = (from: Point, to: Point, step = Math.PI / 4) => {
  const dx = to.x - from.x, dy = to.y - from.y;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  const length = dx * Math.cos(angle) + dy * Math.sin(angle);
  return { x: from.x + Math.cos(angle) * length, y: from.y + Math.sin(angle) * length };
};
/** Shift: lines snap to 45°, rectangles and ellipses become squares and circles, polygons rotate in 15° steps. */
const constrainShape = (kind: ShapeKind, from: Point, to: Point): Point => {
  if (kind === "line") return snapAngle(from, to);
  if (kind === "polygon") return snapAngle(from, to, Math.PI / 12);
  const side = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  return { x: from.x + Math.sign(to.x - from.x || 1) * side, y: from.y + Math.sign(to.y - from.y || 1) * side };
};
export function TextureCanvas({ expanded, onToggleExpand }: { expanded: boolean; onToggleExpand: () => void }) {
  const e = useEditor(),
    doc = e.doc;
  const host = useRef<HTMLDivElement>(null),
    view = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 700, h: 500 });
  const [zoom, setZoom] = useState(0.5),
    [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [path, setPath] = useState<Point[]>([]);
  const [selectionPreview, setSelectionPreview] = useState<SelectionBounds | null>(null);
  const [space, setSpace] = useState(false);
  const gesture = useRef<Gesture | null>(null);
  const brushCursor = useRef<HTMLDivElement>(null);
  const cloneMarker = useRef<HTMLDivElement>(null);
  const cursorPoint = useRef<Point | null>(null);
  // Blender-style F resize: the ring is centred left of the pointer so the pointer starts on its edge.
  const sizing = useRef<{ center: Point; original: number } | null>(null);
  const endSizing = useRef<((cancel: boolean) => void) | null>(null);
  const updateBrushCursor = () => {
    const ring = brushCursor.current, resize = sizing.current, p = resize?.center ?? cursorPoint.current;
    const marker = cloneMarker.current;
    if (marker) {
      // The clone source travels with the pointer once the first stroke has fixed the offset.
      const source = !doc || e.tool !== "clone" || !e.cloneSource ? null
        : e.cloneOffset ? (cursorPoint.current && { x: cursorPoint.current.x - e.cloneOffset.x * zoom, y: cursorPoint.current.y - e.cloneOffset.y * zoom })
        : { x: origin.x + e.cloneSource.x * zoom, y: origin.y + e.cloneSource.y * zoom };
      marker.style.display = source ? "block" : "none";
      if (source) marker.style.transform = `translate(${source.x}px, ${source.y}px)`;
    }
    if (!ring) return;
    // Line and shape points use a crosshair; the ring only appears while F resizes.
    const visible = !!doc && !!p && sizeTools.includes(e.tool) && (!!resize ||
      (e.tool !== "line" && !space && !e.pickingLayerIsland && !e.imageImport && !e.islandMenu && gesture.current?.kind !== "pan"));
    ring.style.display = visible ? "block" : "none";
    if (resize) ring.dataset.size = `${e.brushSize} px`;
    else delete ring.dataset.size;
    if (!visible || !p) return;
    const diameter = Math.max(2, e.brushSize * zoom);
    ring.style.width = ring.style.height = `${diameter}px`;
    ring.style.transform = `translate(${p.x - diameter / 2}px, ${p.y - diameter / 2}px)`;
  };
  const trackBrushCursor = (event: {clientX: number; clientY: number}) => {
    const r = host.current!.getBoundingClientRect();
    cursorPoint.current = { x: event.clientX - r.left, y: event.clientY - r.top };
    updateBrushCursor();
  };
  useEffect(updateBrushCursor, [e.tool, e.brushSize, zoom, pan, space, e.pickingLayerIsland, e.imageImport, e.islandMenu, doc?.id, e.cloneSource, e.cloneOffset]);
  const polygon = useRef<Point[]>([]);
  const selectionTool = ["rect", "lasso", "polygon", "wand"].includes(e.tool);
  const selectionBox = doc?.selection ? selectionBounds(doc.selection) : null;
  const selectionCache = useRef<{
    source: HTMLCanvasElement;
    outline: HTMLCanvasElement;
  } | null>(null);
  const visibility = useRef(new TextureVisibility());
  const outsideCache = useRef<{ source: HTMLCanvasElement; mask: HTMLCanvasElement; revision: number; outside: HTMLCanvasElement } | null>(null);
  const checker = useRef<CanvasPattern | null>(null);
  const screenBuffer = useRef<HTMLCanvasElement | null>(null);
  const guides = useRef<{ key: string; islands: unknown[]; canvas: HTMLCanvasElement } | null>(null);
  const fit = () => {
    if (doc) {
      setZoom(
        Math.min((size.w - 100) / doc.width, (size.h - 100) / doc.height),
      );
      setPan({ x: 0, y: 0 });
    }
  };
  useEffect(() => {
    const ob = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      if (!r.width || !r.height) return;
      setSize({ w: r.width, h: r.height });
    });
    if (host.current) ob.observe(host.current);
    return () => ob.disconnect();
  }, []);
  useEffect(() => {
    fit();
    polygon.current = [];
    setPath([]);
  }, [doc?.id, doc?.sourceIndex, doc?.width, doc?.height, size.w === 0]);
  useEffect(() => {
    polygon.current = [];
    setPath([]);
    if (gesture.current?.kind === "selection-frame") gesture.current = null;
    setSelectionPreview(null);
  }, [e.tool, doc?.id, doc?.selection]);
  const origin = {
    x: (size.w - (doc?.width ?? 0) * zoom) / 2 + pan.x,
    y: (size.h - (doc?.height ?? 0) * zoom) / 2 + pan.y,
  };
  // Selecting a layer brings its linked island into view when it lies (partly) outside the view.
  const shownLayer = useRef<string | undefined>(undefined);
  useEffect(() => {
    const layer = e.layer, previous = shownLayer.current;
    shownLayer.current = layer?.id;
    if (!doc || !layer || previous === undefined || previous === layer.id) return;
    const binding = layer.uvBinding;
    if (!binding || binding.uvSet !== doc.uvSet || !binding.island.triangles.length) return;
    const points = binding.island.triangles.flat();
    const x0 = Math.min(...points.map((p) => p.x)) * doc.width, x1 = Math.max(...points.map((p) => p.x)) * doc.width;
    const y0 = Math.min(...points.map((p) => p.y)) * doc.height, y1 = Math.max(...points.map((p) => p.y)) * doc.height;
    const margin = 24;
    const inside = origin.x + x0 * zoom >= margin && origin.x + x1 * zoom <= size.w - margin &&
      origin.y + y0 * zoom >= margin && origin.y + y1 * zoom <= size.h - margin;
    if (inside) return;
    const z = Math.min(zoom, (size.w - margin * 4) / Math.max(1, x1 - x0), (size.h - margin * 4) / Math.max(1, y1 - y0));
    setZoom(z);
    setPan({ x: (doc.width / 2 - (x0 + x1) / 2) * z, y: (doc.height / 2 - (y0 + y1) / 2) * z });
  }, [e.layer?.id]);
  function point(event: { clientX: number; clientY: number }) {
    const r = host.current!.getBoundingClientRect();
    return {
      x: (event.clientX - r.left - origin.x) / zoom,
      y: (event.clientY - r.top - origin.y) / zoom,
    };
  }
  function finishPolygon() {
    if (doc && polygon.current.length >= 3) {
      e.setSelection(polygonMask(doc.width, doc.height, polygon.current));
      polygon.current = [];
      setPath([]);
    }
  }
  useEffect(() => {
    const startSizing = () => {
      const p = cursorPoint.current!;
      const state = { center: { x: p.x - (e.brushSize * zoom) / 2, y: p.y }, original: e.brushSize };
      sizing.current = state;
      const resize = (ev: PointerEvent) => {
        const r = host.current!.getBoundingClientRect();
        const radius = Math.hypot(ev.clientX - r.left - state.center.x, ev.clientY - r.top - state.center.y);
        e.brushSize = Math.max(1, Math.min(5000, Math.round((2 * radius) / zoom)));
        e.emit();
      };
      const block = (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); };
      const press = (ev: PointerEvent) => {
        block(ev);
        // The context menu of a cancelling right-click arrives after pointerdown.
        if (ev.button === 2) window.addEventListener("contextmenu", block, { capture: true, once: true });
        end(ev.button !== 0);
      };
      const keys = (ev: KeyboardEvent) => {
        if (ev.key !== "Escape" && ev.key !== "Enter" && ev.code !== "KeyF") return;
        block(ev);
        end(ev.key === "Escape");
      };
      const end = (cancel: boolean) => {
        window.removeEventListener("pointermove", resize);
        window.removeEventListener("pointerdown", press, true);
        window.removeEventListener("keydown", keys, true);
        sizing.current = null;
        endSizing.current = null;
        if (cancel) e.brushSize = state.original;
        e.emit();
        updateBrushCursor();
      };
      window.addEventListener("pointermove", resize);
      window.addEventListener("pointerdown", press, true);
      window.addEventListener("keydown", keys, true);
      endSizing.current = end;
      updateBrushCursor();
    };
    const down = (ev: KeyboardEvent) => {
      if (ev.defaultPrevented || document.querySelector(".modal-backdrop")) return;
      if ((ev.target as HTMLElement).matches("input,select,textarea")) return;
      if (ev.code === "KeyF" && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !ev.shiftKey && !ev.repeat &&
        doc && sizeTools.includes(e.tool) && cursorPoint.current && !gesture.current && !sizing.current) {
        ev.preventDefault();
        startSizing();
        return;
      }
      if (ev.code === "Space") {
        ev.preventDefault();
        setSpace(true);
      }
      if (ev.key === "Enter" && polygon.current.length) finishPolygon();
      if (ev.key === "Escape") {
        polygon.current = [];
        setPath([]);
        if (gesture.current?.kind === "selection-frame" || gesture.current?.kind === "move-pending") {
          gesture.current = null;
          setSelectionPreview(null);
        }
        if (gesture.current?.stroke) {
          gesture.current.stroke.cancel();
          gesture.current = null;
        }
        e.cancelLine();
      }
    };
    const up = (ev: KeyboardEvent) => {
      if (ev.code === "Space") setSpace(false);
    };
    const blur = () => {
      endSizing.current?.(true);
      setSpace(false);
      if (gesture.current?.stroke) gesture.current.stroke.finish();
      if (gesture.current?.kind === "transform") e.flushTransform();
      gesture.current = null;
      setSelectionPreview(null);
      setPath([]);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      endSizing.current?.(false);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [doc, zoom]);
  useEffect(() => {
    const c = view.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(size.w * ratio), height = Math.round(size.h * ratio);
    if (c.width !== width) c.width = width;
    if (c.height !== height) c.height = height;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    if (!doc) return;
    ctx.save();
    ctx.translate(origin.x, origin.y);
    ctx.scale(zoom, zoom);
    const w = doc.width,
      h = doc.height;
    // Checkerboard is presentation only; a screen-space pattern keeps it cheap at any zoom.
    if (!checker.current) {
      const tile = document.createElement("canvas");
      tile.width = tile.height = 32;
      const t = tile.getContext("2d")!;
      t.fillStyle = "#36393d"; t.fillRect(0, 0, 32, 32);
      t.fillStyle = "#414448"; t.fillRect(0, 0, 16, 16); t.fillRect(16, 16, 16, 16);
      checker.current = ctx.createPattern(tile, "repeat");
    }
    ctx.save();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = checker.current!;
    ctx.fillRect(origin.x, origin.y, w * zoom, h * zoom);
    ctx.restore();
    visibility.current.update(doc, e.textureHiddenFaces, e.visibleIslands, e.textureIsolated);
    const layer = e.layer;
    let outside: HTMLCanvasElement | undefined;
    if (layer?.visible && e.transform) outside = e.transform.outside;
    else if (layer?.visible && layer.uvMask && e.textureIsolated) {
      const cached = outsideCache.current;
      // An edited shape changes the layer canvas in place, so it is re-masked on every redraw.
      const revision = e.lineEdit ? e.pixelsRevision : 0;
      if (cached?.source !== layer.canvas || cached.mask !== layer.uvMask || cached.revision !== revision)
        outsideCache.current = { source: layer.canvas, mask: layer.uvMask, revision, outside: masked(layer.canvas, layer.uvMask, true) };
      outside = outsideCache.current!.outside;
    }
    // Pixels beyond the island stay faintly visible, except where the user hid faces manually.
    const faint = !e.hiddenFaces.size, outsideAlpha = 0.4 * (layer?.opacity ?? 0);
    const masking = visibility.current.active;
    // Magnified texels stay crisp so pixel-level edits (e.g. pixelation) are visible.
    ctx.imageSmoothingEnabled = zoom < 1;
    if (masking && e.output) {
      // Masking in screen space costs per window pixel instead of per texture pixel.
      let buffer = screenBuffer.current;
      if (!buffer || buffer.width !== width || buffer.height !== height) buffer = screenBuffer.current = canvas(width, height, false);
      const s = context(buffer);
      s.setTransform(1, 0, 0, 1, 0, 0);
      s.clearRect(0, 0, width, height);
      s.setTransform(ratio * zoom, 0, 0, ratio * zoom, ratio * origin.x, ratio * origin.y);
      s.imageSmoothingEnabled = zoom < 1;
      visibility.current.renderTo(s, e.output, faint ? undefined : outside, outsideAlpha);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(buffer, 0, 0);
      ctx.restore();
    } else if (e.output) ctx.drawImage(e.output, 0, 0);
    if (outside && (faint || !masking)) {
      ctx.save();
      ctx.globalAlpha = outsideAlpha;
      ctx.drawImage(outside, 0, 0);
      ctx.restore();
    }
    ctx.imageSmoothingEnabled = true;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    if (e.uvDisplay !== "off" || doc.selectedIslands.length || e.pickingLayerIsland) {
      // UV guides only change with the view or islands, so they are drawn once into a screen-sized overlay.
      const islands = e.visibleIslands;
      const key = [e.uvDisplay, e.pickingLayerIsland, zoom, origin.x, origin.y, width, height, ratio, e.uvColor, e.uvOpacity, doc.selectedIslands.join(","), w, h].join("|");
      let overlay = guides.current;
      if (!overlay || overlay.islands !== islands || overlay.key !== key) {
        const target = overlay && overlay.canvas.width === width && overlay.canvas.height === height ? overlay.canvas : canvas(width, height, false);
        const g = context(target);
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, width, height);
        g.save();
        g.setTransform(ratio * zoom, 0, 0, ratio * zoom, ratio * origin.x, ratio * origin.y);
        g.beginPath();
        g.rect(0, 0, w, h);
        g.clip();
        g.globalAlpha = e.uvOpacity;
        g.strokeStyle = e.uvColor;
        g.lineWidth = 0.8 / zoom;
        traceGuides(g, islands, e.pickingLayerIsland && e.uvDisplay === "off" ? "outline" : e.uvDisplay, w, h);
        g.stroke();
        g.globalAlpha = 1;
        const selected = islands.filter((i) => doc.selectedIslands.includes(i.id));
        if (selected.length) {
          traceIslands(g, selected, w, h);
          g.fillStyle = "#7adbc32a";
          g.fill();
          traceGuides(g, selected, "outline", w, h);
          g.strokeStyle = "#b4ffe9";
          g.lineWidth = 1.8 / zoom;
          g.stroke();
        }
        g.restore();
        overlay = guides.current = { key, islands, canvas: target };
      }
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(overlay.canvas, 0, 0);
      ctx.restore();
    }
    if (doc.selection) {
      if (selectionCache.current?.source !== doc.selection) {
        const out = canvas(w, h);
        const d = context(doc.selection).getImageData(0, 0, w, h).data;
        const image = context(out).createImageData(w, h);
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (
              d[i * 4 + 3] > 127 &&
              (x === 0 ||
                y === 0 ||
                x === w - 1 ||
                y === h - 1 ||
                d[(i - 1) * 4 + 3] < 128 ||
                d[(i + 1) * 4 + 3] < 128 ||
                d[(i - w) * 4 + 3] < 128 ||
                d[(i + w) * 4 + 3] < 128)
            ) {
              const v = (x + y) % 10 < 5 ? 255 : 20;
              image.data.set([v, v, v, 255], i * 4);
            }
          }
        context(out).putImageData(image, 0, 0);
        selectionCache.current = { source: doc.selection, outline: out };
      }
      if (selectionPreview && selectionBox) {
        const b = selectionBox, p = selectionPreview;
        ctx.drawImage(selectionCache.current.outline, b.x, b.y, b.width, b.height, p.x, p.y, p.width, p.height);
      } else ctx.drawImage(selectionCache.current.outline, 0, 0);
    }
    ctx.restore();
    if (selectionTool && selectionBox && !e.transform && !path.length) {
      const b = selectionPreview ?? selectionBox;
      ctx.strokeStyle = "#9ce8d6";
      ctx.lineWidth = 1 / zoom;
      ctx.setLineDash([3 / zoom, 3 / zoom]);
      ctx.strokeRect(b.x, b.y, b.width, b.height);
      ctx.setLineDash([]);
      selectionHandles(b).forEach((p, i) => {
        ctx.fillStyle = "#172d2b";
        ctx.fillRect(p.x - 4 / zoom, p.y - 4 / zoom, 8 / zoom, 8 / zoom);
        ctx.strokeRect(p.x - 4 / zoom, p.y - 4 / zoom, 8 / zoom, 8 / zoom);
        if (i === 8) {
          ctx.beginPath();
          ctx.moveTo(p.x - 7 / zoom, p.y); ctx.lineTo(p.x + 7 / zoom, p.y);
          ctx.moveTo(p.x, p.y - 7 / zoom); ctx.lineTo(p.x, p.y + 7 / zoom);
          ctx.stroke();
        }
      });
    }
    if (path.length) {
      ctx.beginPath();
      path.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (e.tool === "rect" || e.tool === "lasso") ctx.closePath();
      ctx.strokeStyle = "#fff";
      ctx.setLineDash([5 / zoom, 4 / zoom]);
      ctx.lineWidth = 1 / zoom;
      ctx.stroke();
      ctx.setLineDash([]);
      const markers = e.tool === "polygon" ? path : e.tool === "lasso" ? [path[0]] : [];
      ctx.fillStyle = "#243137";
      markers.forEach((p,i) => {
        ctx.beginPath();
        if (i === 0) ctx.arc(p.x,p.y,5/zoom,0,Math.PI*2);
        else ctx.rect(p.x-4/zoom,p.y-4/zoom,8/zoom,8/zoom);
        ctx.fill();ctx.stroke();
      });
    }
    const t = e.transform;
    if (t) {
      ctx.strokeStyle = "#99e4d0";
      ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      if (t.kind !== "mesh") {
        t.points.forEach((p, i) =>
          i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
        );
        ctx.closePath();
      } else {
        for (let y = 0; y < 4; y++)
          for (let x = 0; x < 4; x++) {
            const p = t.points[y * 4 + x];
            if (x < 3) {
              const q = t.points[y * 4 + x + 1];
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(q.x, q.y);
            }
            if (y < 3) {
              const q = t.points[(y + 1) * 4 + x];
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(q.x, q.y);
            }
          }
      }
      ctx.stroke();
      const handles = t.kind === "free" ? transformHandles(t.points) : t.points;
      handles.forEach((p, i) => {
        ctx.fillStyle = "#172d2b";
        ctx.fillRect(p.x - 4 / zoom, p.y - 4 / zoom, 8 / zoom, 8 / zoom);
        ctx.strokeRect(p.x - 4 / zoom, p.y - 4 / zoom, 8 / zoom, 8 / zoom);
        if (t.kind === "perspective") {
          ctx.fillStyle = "#bff9e8";
          ctx.font = `${10 / zoom}px Arial`;
          ctx.fillText(String(i + 1), p.x + 8 / zoom, p.y - 7 / zoom);
        }
      });
    }
    if (e.lineEdit) {
      const { a, b, placed } = e.lineEdit;
      ctx.strokeStyle = "#9ce8d6";
      ctx.lineWidth = 1 / zoom;
      ctx.fillStyle = "#172d2b";
      for (const q of placed ? [a, b] : [a]) {
        ctx.fillRect(q.x - 5 / zoom, q.y - 5 / zoom, 10 / zoom, 10 / zoom);
        ctx.strokeRect(q.x - 5 / zoom, q.y - 5 / zoom, 10 / zoom, 10 / zoom);
      }
    }
    ctx.restore();
    ctx.strokeStyle = "#ffffff1a";
    ctx.strokeRect(origin.x - 0.5, origin.y - 0.5, w * zoom + 1, h * zoom + 1);
  }, [e.revision, size, zoom, pan, path, selectionPreview]);
  function down(ev: ReactPointer<HTMLCanvasElement>) {
    if (ev.button === 2) return;
    if (!doc) return;
    if (e.pickingLayerIsland && ev.button === 0 && !space) {
      ev.preventDefault();
      e.pickLayerIsland(hitIsland({ ...doc, islands: e.visibleIslands }, point(ev)));
      return;
    }
    ev.currentTarget.focus({ preventScroll: true });
    ev.currentTarget.setPointerCapture(ev.pointerId);
    const p = point(ev),
      mode = ev.shiftKey ? "add" : ev.altKey ? "subtract" : e.selectionMode;
    const g: Gesture = {
      kind: "select",
      start: p,
      last: p,
      points: [p],
      handle: -1,
      original: [],
      mode,
      clientStart: { x: ev.clientX, y: ev.clientY },
      zoom,
    };
    if (space || ev.button === 1 || e.tool === "pan") {
      g.kind = "pan";
      g.start = { x: ev.clientX, y: ev.clientY };
      g.pan = pan;
      gesture.current = g;
      return;
    }
    if (ev.button === 0 && e.tool !== "move" && e.tool !== "line" && !e.transform && e.textureIsolated &&
      hitIsland({ ...doc, islands: e.visibleIslands }, p) < 0) e.releaseFocus();
    if (selectionTool && doc.selection && selectionBox && !e.transform && !polygon.current.length) {
      const handle = hitSelectionHandle(selectionBox, p, zoom);
      if (handle >= 0) {
        g.kind = "selection-frame";
        g.handle = handle;
        g.selectionFrame = { mask: doc.selection, bounds: selectionBox, next: selectionBox };
        gesture.current = g;
        return;
      }
    }
    if (e.tool === "move" && !e.transform) {
      g.kind = "move-pending";
      g.addIsland = ev.shiftKey;
      gesture.current = g;
      return;
    }
    if (e.transform || e.tool === "move") {
      e.beginTransform(e.transform?.kind ?? "free");
      const t = e.transform;
      if (!t) return;
      g.kind = "transform";
      g.original = t.points.map((p) => ({ ...p }));
      g.transformHit = hitTransform(
        t.points,
        p,
        zoom,
        t.kind === "free",
        ev.ctrlKey || ev.metaKey,
      );
      g.handle = g.transformHit.handle;
      g.selectOnClick = e.tool === "move" && g.transformHit.handle < 0;
      g.outsideFrame = !insideTransform(t.points, p);
      g.addIsland = ev.shiftKey;
      gesture.current = g;
      return;
    }
    if (e.tool === "island") {
      e.selectCanvasIsland(hitIsland({...doc,islands:e.visibleIslands}, p), ev.shiftKey);
      return;
    }
    if (e.tool === "wand") {
      e.wand(p, mode);
      return;
    }
    if (e.tool === "fill") {
      e.fill(p);
      return;
    }
    if (e.tool === "eyedropper" || ((e.tool === "brush" || e.tool === "line") && ev.altKey)) {
      e.pickColor(p);
      return;
    }
    if (e.tool === "clone" && ev.altKey) {
      e.cloneSource = p;
      e.cloneOffset = null;
      e.emit();
      return;
    }
    if (e.tool === "line") {
      if (!e.layer) {
        e.fail("Select a layer or add an empty layer before painting.");
        return;
      }
      g.kind = "line";
      const line = e.lineEdit;
      if (line) {
        const near = (q: Point) => Math.hypot(q.x - p.x, q.y - p.y) * zoom <= 8;
        const handle = line.placed ? (near(line.b) ? "b" : near(line.a) ? "a" : null) : null;
        if (handle) { g.lineHandle = handle; gesture.current = g; return; }
        if (!line.placed) {
          line.b = p; line.placed = true;
          line.stroke.moveLine(line.a, line.b);
          g.lineHandle = "b"; gesture.current = g;
          return;
        }
        e.finishLine();
      }
      if (p.x < 0 || p.y < 0 || p.x >= doc.width || p.y >= doc.height) return;
      e.lineEdit = { stroke: new PaintStroke(e, p), a: p, b: p, placed: false };
      g.lineHandle = "b"; g.fresh = true; gesture.current = g;
      e.emit();
      return;
    }
    if (sizeTools.includes(e.tool)) {
      if (!e.layer) {
        e.fail("Select a layer or add an empty layer before painting.");
        return;
      }
      if (p.x < 0 || p.y < 0 || p.x >= doc.width || p.y >= doc.height) {
        return;
      }
      if (e.tool === "clone" && !e.cloneSource) {
        return;
      }
      g.kind = "paint";
      g.stroke = new PaintStroke(e, p);
      gesture.current = g;
      return;
    }
    if (e.tool === "polygon") {
      if (polygon.current.length >= 3 && Math.hypot(p.x-polygon.current[0].x,p.y-polygon.current[0].y)*zoom <= 8) {finishPolygon();return;}
      polygon.current.push(p);
      setPath([...polygon.current]);
      return;
    }
    gesture.current = g;
    setPath([p]);
  }
  function move(ev: ReactPointer<HTMLCanvasElement>) {
    const g = gesture.current;
    // Tool options can reflow when a transform starts. Keep drag deltas in the
    // initial canvas coordinate system so that reflow does not move the image.
    const p = g ? {
      x: g.start.x + (ev.clientX - g.clientStart.x) / g.zoom,
      y: g.start.y + (ev.clientY - g.clientStart.y) / g.zoom,
    } : point(ev);
    if (!g) {
      if (selectionTool && selectionBox && !e.transform && !polygon.current.length) {
        const handle = hitSelectionHandle(selectionBox, p, zoom);
        ev.currentTarget.style.cursor = handle < 0 ? "" : selectionCursors[handle];
      } else if (e.tool === "line" && e.lineEdit) {
        const { a, b, placed } = e.lineEdit;
        const near = (q: Point) => Math.hypot(q.x - p.x, q.y - p.y) * zoom <= 8;
        ev.currentTarget.style.cursor = placed && (near(a) || near(b)) ? "move" : "";
      } else if (e.transform) {
        const hit = hitTransform(
          e.transform.points,
          p,
          zoom,
          e.transform.kind === "free",
          ev.ctrlKey || ev.metaKey,
        );
        ev.currentTarget.style.cursor =
          hit.action === "rotate"
            ? "crosshair"
            : hit.action === "scale"
              ? transformResizeCursor(e.transform.points, hit.handle)
              : hit.action === "distort"
                ? "crosshair"
                : "move";
      } else ev.currentTarget.style.cursor = "";
      return;
    }
    if (g.kind === "pan") {
      setPan({
        x: g.pan!.x + ev.clientX - g.start.x,
        y: g.pan!.y + ev.clientY - g.start.y,
      });
      return;
    }
    if (g.kind === "paint") {
      g.stroke!.draw(p);
      return;
    }
    if (g.kind === "line") {
      const line = e.lineEdit;
      if (!line || (g.fresh && Math.hypot(p.x - g.start.x, p.y - g.start.y) * zoom < 4)) return;
      // Dragging right after the first press draws the line in one gesture.
      if (g.fresh) line.placed = true;
      const handle = g.lineHandle ?? "b";
      line[handle] = ev.shiftKey ? constrainShape(e.shape.kind, handle === "a" ? line.b : line.a, p) : p;
      line.stroke.moveLine(line.a, line.b);
      return;
    }
    if (g.kind === "selection-frame") {
      const frame = g.selectionFrame!;
      frame.next = dragSelectionBounds(frame.bounds, g.handle, g.start, p);
      setSelectionPreview(frame.next);
      return;
    }
    if (g.kind === "move-pending") {
      if (Math.hypot(p.x - g.start.x, p.y - g.start.y) * zoom < 4) return;
      e.beginTransform("free");
      // An empty layer cannot be transformed; retrying would rescan the whole texture on every move.
      if (!e.transform) { gesture.current = null; return; }
      g.kind = "transform";
      g.original = e.transform.points.map(p => ({ ...p }));
      g.transformHit = hitTransform(g.original, g.start, zoom, true, ev.ctrlKey || ev.metaKey);
    }
    if (g.kind === "transform") {
      if (g.selectOnClick && Math.hypot(p.x - g.start.x, p.y - g.start.y) * zoom < 4) return;
      g.selectOnClick = false;
      const next = dragTransform(
        g.original,
        g.start,
        p,
        g.transformHit!,
        ev.shiftKey,
        ev.altKey,
        ev.ctrlKey || ev.metaKey,
      );
      e.scheduleTransform(next);
      return;
    }
    g.last = p;
    if (e.tool === "rect")
      g.points = [
        g.start,
        { x: p.x, y: g.start.y },
        p,
        { x: g.start.x, y: p.y },
      ];
    else g.points.push(p);
    setPath([...g.points]);
  }
  function up() {
    const g = gesture.current;
    gesture.current = null;
    // Panning must not end an unfinished polygon or an editable line.
    if (!g || g.kind === "pan" || g.kind === "line") return;
    if (g.kind === "move-pending" || (g.kind === "transform" && g.selectOnClick)) {
      if (g.kind === "transform" && g.outsideFrame) {
        e.clearCanvasSelection();
        return;
      }
      if (doc) {
        const id = hitIsland({ ...doc, islands: e.visibleIslands }, g.start);
        const p = g.start;
        const imageHit = !doc.islands.length && e.layer?.visible && p.x >= 0 && p.y >= 0 && p.x < doc.width && p.y < doc.height
          && context(e.layer.canvas).getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data[3] > 0;
        if (id >= 0) {
          e.selectCanvasIsland(id, g.addIsland);
          e.beginTransform();
        } else if (imageHit) e.beginTransform();
        else e.clearCanvasSelection();
      }
      return;
    }
    if (g.kind === "selection-frame") {
      const frame = g.selectionFrame!;
      if (doc?.selection === frame.mask && ["x", "y", "width", "height"].some(key => frame.bounds[key as keyof SelectionBounds] !== frame.next[key as keyof SelectionBounds]))
        e.setSelection(transformSelection(frame.mask, frame.bounds, frame.next), "replace");
      setSelectionPreview(null);
      return;
    }
    if (g.kind === "transform") e.flushTransform();
    if (g.kind === "paint") g.stroke!.finish();
    if (g.kind === "select" && doc)
      e.setSelection(polygonMask(doc.width, doc.height, g.points), g.mode);
    setPath([]);
  }
  return (
    <section className="texture-pane">
      <div
        className={`canvas-host cursor-${space ? "pan" : e.pickingLayerIsland ? "eyedropper" : e.tool}`}
        ref={host}
        onDragOver={(ev) => ev.preventDefault()}
        onDrop={(ev) => {
          ev.preventDefault();
          const files = [...ev.dataTransfer.files];
          void e.run(async () => {
            for (const file of files) {
              if (file.name.toLowerCase().endsWith(".glb")) {
                await e.importModelFile(file);
                continue;
              }
              const bytes = new Uint8Array(await file.arrayBuffer());
              if (file.name.toLowerCase().endsWith(".uvpaint"))
                await e.importProject(bytes, file.name);
              else await e.requestImageImport(bytes, file.name);
            }
          });
        }}
      >
        <Button className="texture-expand" title={expanded ? "Restore split view" : "Expand texture editor"} aria-pressed={expanded} onClick={onToggleExpand}>
          {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </Button>
        <canvas
          ref={view}
          data-testid="texture-canvas"
          tabIndex={0}
          aria-label="Texture canvas"
          onKeyDown={ev => {
            if (gesture.current?.kind !== "selection-frame") return;
            if (ev.key === "Escape" || ((ev.ctrlKey || ev.metaKey) && ["KeyZ", "KeyY"].includes(ev.code))) {
              gesture.current = null; setSelectionPreview(null);
              ev.preventDefault(); ev.stopPropagation();
            }
          }}
          onPointerDown={(ev) => {
            try {
              down(ev);
              trackBrushCursor(ev);
            } catch (error) {
              e.fail(error);
            }
          }}
          onPointerMove={(ev) => {
            try {
              move(ev);
              trackBrushCursor(ev);
            } catch (error) {
              gesture.current?.stroke?.cancel();
              gesture.current = null;
              e.fail(error);
            }
          }}
          onPointerUp={ev => { up();trackBrushCursor(ev); }}
          onPointerEnter={trackBrushCursor}
          onPointerLeave={() => { cursorPoint.current = null;updateBrushCursor(); }}
          onPointerCancel={() => {
            gesture.current?.stroke?.cancel();
            if (gesture.current?.kind === "transform") e.flushTransform();
            gesture.current = null;
            setSelectionPreview(null);
            setPath([]);
            cursorPoint.current = null;updateBrushCursor();
          }}
          onDoubleClick={() =>
            e.transform ? e.confirmTransform() : finishPolygon()
          }
          onWheel={(ev) => {
            ev.preventDefault();
            if (!doc) return;
            const p = point(ev),
              z = Math.min(
                32,
                Math.max(0.005, zoom * Math.exp(-ev.deltaY * 0.001)),
              );
            const r = host.current!.getBoundingClientRect();
            setPan({
              x: ev.clientX - r.left - size.w / 2 - (p.x - doc.width / 2) * z,
              y: ev.clientY - r.top - size.h / 2 - (p.y - doc.height / 2) * z,
            });
            setZoom(z);
          }}
          onContextMenu={(ev) => {ev.preventDefault();e.openIslandMenu(ev.clientX,ev.clientY,doc ? hitIsland({...doc,islands:e.visibleIslands},point(ev)) : -1);}}
        />
        <div className="brush-footprint" ref={brushCursor} aria-hidden="true" data-testid="brush-footprint" />
        <div className="clone-source" ref={cloneMarker} aria-hidden="true" data-testid="clone-source" />
        <LayersDock />
        {!doc && (
          <div className="empty-canvas">
            <div className="empty-icon">
              <ImagePlus size={30} />
            </div>
            <h2>A canvas for your model.</h2>
            <p>
              Open a GLB, bring in an image,
              <br />
              and make every island your own.
            </p>
            <Button
              className="primary"
              onClick={() => void e.run(() => e.openModel())}
            >
              Open GLB
            </Button>
            <button
              className="text-button"
              onClick={() => void e.run(() => e.sample())}
            >
              Explore the sample project →
            </button>
            <small>Drop a GLB or an image anywhere here</small>
          </div>
        )}
      <div className="canvas-zoom">
        <div className="mini-actions">
          <Button
            title="Zoom out"
            onClick={() => setZoom((z) => Math.max(0.005, z / 1.2))}
          >
            <Minus size={13} />
          </Button>
          <span className="zoom-label">{Math.round(zoom * 100)}%</span>
          <Button
            title="Zoom in"
            onClick={() => setZoom((z) => Math.min(32, z * 1.2))}
          >
            <Plus size={13} />
          </Button>
          <Button title="Fit canvas" onClick={fit}>
            <Maximize size={13} />
          </Button>
        </div>
      </div>
      </div>
    </section>
  );
}
