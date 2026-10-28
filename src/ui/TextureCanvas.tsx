import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointer } from "react";
import { ImagePlus, Maximize, Minus, Plus, ScanLine } from "lucide-react";
import { useEditor } from "./hooks";
import { Button } from "./Button";
import type { Point, SelectionMode } from "../types";
import { canvas, context } from "../core/canvas";
import { polygonMask } from "../tools/selection";
import { traceIslands, hitIsland } from "../tools/uv";
import { PaintStroke } from "../tools/paint";

type Gesture = {
  kind: "pan" | "select" | "paint" | "transform";
  start: Point;
  last: Point;
  points: Point[];
  handle: number;
  original: Point[];
  mode: SelectionMode;
  stroke?: PaintStroke;
  pan?: Point;
};
export function TextureCanvas() {
  const e = useEditor(),
    doc = e.doc;
  const host = useRef<HTMLDivElement>(null),
    view = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 700, h: 500 });
  const [zoom, setZoom] = useState(0.5),
    [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [path, setPath] = useState<Point[]>([]);
  const [space, setSpace] = useState(false);
  const gesture = useRef<Gesture | null>(null);
  const polygon = useRef<Point[]>([]);
  const selectionCache = useRef<{
    source: HTMLCanvasElement;
    outline: HTMLCanvasElement;
  } | null>(null);
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
      setSize({ w: r.width, h: r.height });
    });
    if (host.current) ob.observe(host.current);
    return () => ob.disconnect();
  }, []);
  useEffect(() => {
    fit();
    polygon.current = [];
    setPath([]);
  }, [doc?.id, doc?.width, doc?.height, size.w === 0]);
  useEffect(() => {
    polygon.current = [];
    setPath([]);
  }, [e.tool]);
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
      if ((ev.target as HTMLElement).matches("input,select,textarea")) return;
      if (ev.code === "Space") {
        ev.preventDefault();
        setSpace(true);
      }
      if (ev.key === "Enter" && polygon.current.length) finishPolygon();
      if (ev.key === "Escape") {
        polygon.current = [];
        setPath([]);
        if (gesture.current?.stroke) {
          gesture.current.stroke.cancel();
          gesture.current = null;
        }
      }
    };
    const up = (ev: KeyboardEvent) => {
      if (ev.code === "Space") setSpace(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [doc, zoom]);
  useEffect(() => {
    const c = view.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = Math.round(size.w * ratio);
    c.height = Math.round(size.h * ratio);
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
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
    if (e.output) ctx.drawImage(e.output, 0, 0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    if (e.uvVisible) {
      ctx.globalAlpha = e.uvOpacity;
      ctx.strokeStyle = e.uvColor;
      ctx.lineWidth = 0.8 / zoom;
      traceIslands(ctx, doc.islands, w, h);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const selected = doc.islands.filter((i) =>
        doc.selectedIslands.includes(i.id),
      );
      if (selected.length) {
        traceIslands(ctx, selected, w, h);
        ctx.fillStyle = "#7adbc32a";
        ctx.fill();
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
      ctx.drawImage(selectionCache.current.outline, 0, 0);
    }
    ctx.restore();
    if (path.length) {
      ctx.beginPath();
      path.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (e.tool === "rect" || e.tool === "lasso") ctx.closePath();
      ctx.strokeStyle = "#fff";
      ctx.setLineDash([5 / zoom, 4 / zoom]);
      ctx.lineWidth = 1 / zoom;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const t = e.transform;
    if (t) {
      ctx.strokeStyle = "#99e4d0";
      ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      if (t.kind === "perspective") {
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
      t.points.forEach((p, i) => {
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
  }, [e.revision, size, zoom, pan, path]);
  function down(ev: ReactPointer<HTMLCanvasElement>) {
    if (!doc) return;
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
    };
    if (space || ev.button === 1 || e.tool === "pan") {
      g.kind = "pan";
      g.start = { x: ev.clientX, y: ev.clientY };
      g.pan = pan;
      gesture.current = g;
      return;
    }
    if (e.transform || e.tool === "move") {
      e.beginTransform(e.transform?.kind ?? "perspective");
      const t = e.transform;
      if (!t) return;
      g.kind = "transform";
      g.original = t.points.map((p) => ({ ...p }));
      g.handle = t.points.findIndex(
        (q) => Math.hypot(q.x - p.x, q.y - p.y) < 12 / zoom,
      );
      gesture.current = g;
      return;
    }
    if (e.tool === "island") {
      e.selectIsland(hitIsland(doc, p), ev.shiftKey);
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
    if (e.tool === "eyedropper") {
      e.pickColor(p);
      return;
    }
    if (e.tool === "clone" && ev.altKey) {
      e.cloneSource = p;
      e.notify("Clone source set. Drag to paint from this point.");
      return;
    }
    if (["brush", "eraser", "clone"].includes(e.tool)) {
      if (!e.layer) return;
      if (e.tool === "clone" && !e.cloneSource) {
        e.notify("Alt-click a source point before using Clone Stamp.");
        return;
      }
      g.kind = "paint";
      g.stroke = new PaintStroke(e, p);
      gesture.current = g;
      return;
    }
    if (e.tool === "polygon") {
      polygon.current.push(p);
      setPath([...polygon.current]);
      return;
    }
    gesture.current = g;
    setPath([p]);
  }
  function move(ev: ReactPointer<HTMLCanvasElement>) {
    const g = gesture.current;
    if (!g) return;
    const p = point(ev);
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
    if (g.kind === "transform") {
      const next = g.original.map((q) => ({ ...q }));
      if (g.handle >= 0) next[g.handle] = p;
      else
        next.forEach((q) => {
          q.x += p.x - g.start.x;
          q.y += p.y - g.start.y;
        });
      e.updateTransform(next);
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
    if (g.kind === "paint") g.stroke!.finish();
    if (g.kind === "select" && doc)
      e.setSelection(polygonMask(doc.width, doc.height, g.points), g.mode);
    setPath([]);
  }
  return (
    <section className="texture-pane">
      <div className="pane-heading">
        <span>
          <ScanLine size={14} /> TEXTURE EDITOR
        </span>
        <div className="mini-actions">
          <span>{doc ? `${doc.width} × ${doc.height}` : "RGBA canvas"}</span>
          <span className="tag">sRGB</span>
        </div>
      </div>
      <div
        className={`canvas-host cursor-${space ? "pan" : e.tool}`}
        ref={host}
        onDragOver={(ev) => ev.preventDefault()}
        onDrop={(ev) => {
          ev.preventDefault();
          const files = [...ev.dataTransfer.files];
          void e.run(async () => {
            for (const file of files) {
              const bytes = new Uint8Array(await file.arrayBuffer());
              if (file.name.toLowerCase().endsWith(".glb"))
                await e.importModel(bytes, file.name);
              else await e.importImage(bytes, file.name);
            }
          });
        }}
      >
        <canvas
          ref={view}
          data-testid="texture-canvas"
          onPointerDown={(ev) => {
            try {
              down(ev);
            } catch (error) {
              e.fail(error);
            }
          }}
          onPointerMove={(ev) => {
            try {
              move(ev);
            } catch (error) {
              gesture.current?.stroke?.cancel();
              gesture.current = null;
              e.fail(error);
            }
          }}
          onPointerUp={up}
          onPointerCancel={() => {
            gesture.current?.stroke?.cancel();
            gesture.current = null;
            setPath([]);
          }}
          onDoubleClick={finishPolygon}
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
          onContextMenu={(ev) => ev.preventDefault()}
        />
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
        {doc && (
          <div className="canvas-label">
            {doc.name}
            <span>BASE COLOR</span>
          </div>
        )}
      </div>
      <div className="canvas-footer">
        <span>
          {doc?.selection
            ? "Selection active"
            : e.transform
              ? "Transform active"
              : "Space + drag to pan · Scroll to zoom"}
        </span>
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
    </section>
  );
}
