import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointer } from "react";
import { ImagePlus, Maximize, Minimize2, Maximize2, Minus, Plus } from "lucide-react";
import { useEditor } from "./hooks";
import { Button } from "./Button";
import type { Point, SelectionMode } from "../types";
import { canvas, context } from "../core/canvas";
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
  kind: "pan" | "select" | "paint" | "transform" | "move-pending" | "selection-frame";
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
  const cursorPoint = useRef<Point | null>(null);
  const updateBrushCursor = () => {
    const ring = brushCursor.current, p = cursorPoint.current;
    if (!ring) return;
    const visible = !!doc && !!p && ["brush", "eraser", "clone"].includes(e.tool) &&
      !space && !e.pickingLayerIsland && !e.imageImport && !e.islandMenu && gesture.current?.kind !== "pan";
    ring.style.display = visible ? "block" : "none";
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
  useEffect(updateBrushCursor, [e.tool, e.brushSize, zoom, space, e.pickingLayerIsland, e.imageImport, e.islandMenu, doc?.id]);
  const polygon = useRef<Point[]>([]);
  const selectionTool = ["rect", "lasso", "polygon", "wand"].includes(e.tool);
  const selectionBox = doc?.selection ? selectionBounds(doc.selection) : null;
  const selectionCache = useRef<{
    source: HTMLCanvasElement;
    outline: HTMLCanvasElement;
  } | null>(null);
  const visibility = useRef(new TextureVisibility());
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
    const down = (ev: KeyboardEvent) => {
      if (ev.defaultPrevented || document.querySelector(".modal-backdrop")) return;
      if ((ev.target as HTMLElement).matches("input,select,textarea")) return;
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
      }
    };
    const up = (ev: KeyboardEvent) => {
      if (ev.code === "Space") setSpace(false);
    };
    const blur = () => {
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
    // Checkerboard is presentation only; it is never part of the document buffer.
    const tile = 16 / zoom;
    ctx.fillStyle = "#36393d";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#414448";
    for (let y = 0; y < h; y += tile)
      for (let x = 0; x < w; x += tile)
        if ((Math.round(x / tile) + Math.round(y / tile)) % 2 === 0)
          ctx.fillRect(x, y, Math.min(tile, w - x), Math.min(tile, h - y));
    visibility.current.update(doc, e.textureHiddenFaces, e.visibleIslands, e.textureIsolated);
    const visibleTexture = visibility.current.render(e.output, e.layer?.visible ? e.transform?.outside : undefined, 0.4 * (e.layer?.opacity ?? 0));
    if (visibleTexture ?? e.output) ctx.drawImage((visibleTexture ?? e.output)!, 0, 0);
    if (!visibleTexture && e.transform?.outside && e.layer?.visible) {
      ctx.save();
      ctx.globalAlpha = 0.4 * e.layer.opacity;
      ctx.drawImage(e.transform.outside, 0, 0);
      ctx.restore();
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    if (e.uvDisplay !== "off" || doc.selectedIslands.length || e.pickingLayerIsland) {
      ctx.globalAlpha = e.uvOpacity;
      ctx.strokeStyle = e.uvColor;
      ctx.lineWidth = 0.8 / zoom;
      traceGuides(ctx, e.visibleIslands, e.pickingLayerIsland && e.uvDisplay === "off" ? "outline" : e.uvDisplay, w, h);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const selected = e.visibleIslands.filter((i) =>
        doc.selectedIslands.includes(i.id),
      );
      if (selected.length) {
        traceIslands(ctx, selected, w, h);
        ctx.fillStyle = "#7adbc32a";
        ctx.fill();
        traceGuides(ctx, selected, "outline", w, h);
        ctx.strokeStyle = "#b4ffe9";
        ctx.lineWidth = 1.8 / zoom;
        ctx.stroke();
      }
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
    if (e.cloneSource && e.tool === "clone") {
      const p = e.cloneSource;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      ctx.moveTo(p.x - 8 / zoom, p.y);
      ctx.lineTo(p.x + 8 / zoom, p.y);
      ctx.moveTo(p.x, p.y - 8 / zoom);
      ctx.lineTo(p.x, p.y + 8 / zoom);
      ctx.stroke();
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
    if (e.tool === "eyedropper" || (e.tool === "brush" && ev.altKey)) {
      e.pickColor(p);
      return;
    }
    if (e.tool === "clone" && ev.altKey) {
      e.cloneSource = p;
      e.emit();
      return;
    }
    if (["brush", "eraser", "clone"].includes(e.tool)) {
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
    if (g.kind === "selection-frame") {
      const frame = g.selectionFrame!;
      frame.next = dragSelectionBounds(frame.bounds, g.handle, g.start, p);
      setSelectionPreview(frame.next);
      return;
    }
    if (g.kind === "move-pending") {
      if (Math.hypot(p.x - g.start.x, p.y - g.start.y) * zoom < 4) return;
      e.beginTransform("free");
      if (!e.transform) return;
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
    if (!g) return;
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
