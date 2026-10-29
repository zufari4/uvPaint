import { useEffect, useMemo, useRef, useState } from "react";
import { X, SquareDashed, Lasso, PenTool, WandSparkles, Scan, Minus, Plus, Maximize } from "lucide-react";
import type { Point, SelectionMode } from "../types";
import { alphaBounds, masked } from "../core/canvas";
import { combineSelection, floodMask, polygonMask, invertSelection } from "../tools/selection";
import { useEditor } from "./hooks";
import { Button } from "./Button";
import { ImportIslandPicker, type ImportIslandChoice } from "./ImportIslandPicker";
import { selectionHandles, hitSelectionHandle, dragSelectionBounds, transformSelection, selectionCursors, type SelectionBounds } from "../tools/selection-frame";

type ImportTool = "rect" | "lasso" | "polygon" | "wand";
type Drag = { kind: "selection" | "pan" | "frame" | "vertex"; start: Point; points: Point[]; mode: SelectionMode; pan?: Point;
  handle?: number; bounds?: SelectionBounds; mask?: HTMLCanvasElement; closed?: boolean; moved?: boolean };
export function ImageImportDialog({ source }: { source: { image: HTMLCanvasElement; name: string } }) {
  const e = useEditor(), image = source.image;
  const root = useRef<HTMLDivElement>(null), host = useRef<HTMLDivElement>(null), preview = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null), polygon = useRef<Point[]>([]), polygonMode = useRef<SelectionMode>("replace");
  const space = useRef(false);
  const [tool, setTool] = useState<ImportTool>("rect"), [mask, setMask] = useState<HTMLCanvasElement | null>(null);
  const [path, setPath] = useState<Point[]>([]), [target, setTarget] = useState("");
  const [vertices, setVertices] = useState<Point[]>([]);
  const polygonBase = useRef<HTMLCanvasElement | null>(null);
  const [draft, setDraft] = useState<HTMLCanvasElement | null>(null);
  const [tolerance, setTolerance] = useState(24), [contiguous, setContiguous] = useState(true);
  const [size, setSize] = useState({ w: 800, h: 480 }), [zoom, setZoom] = useState(1), [pan, setPan] = useState({ x: 0, y: 0 });
  const [importing, setImporting] = useState(false), [error, setError] = useState("");
  const [step, setStep] = useState<"area" | "island">("area");
  const [choice, setChoice] = useState<ImportIslandChoice | null>(null);
  const bounds = useMemo(() => mask ? alphaBounds(mask) : { x: 0, y: 0, width: image.width, height: image.height }, [mask, image]);
  const displayMask = draft ?? mask;
  const displayBounds = useMemo(() => draft ? alphaBounds(draft) : bounds, [draft, bounds]);
  const selected = useMemo(() => displayMask ? masked(image, displayMask) : null, [image, displayMask]);
  const scale = Math.min((size.w - 40) / image.width, (size.h - 40) / image.height) * zoom;
  const origin = { x: (size.w - image.width * scale) / 2 + pan.x, y: (size.h - image.height * scale) / 2 + pan.y };
  const point = (event: { clientX: number; clientY: number }) => {
    const r = host.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(image.width, (event.clientX - r.left - origin.x) / scale)),
      y: Math.max(0, Math.min(image.height, (event.clientY - r.top - origin.y) / scale)) };
  };
  const resetPath = () => { polygon.current = []; drag.current = null; setPath([]); setDraft(null); };
  const chooseTool = (next: ImportTool) => { resetPath(); setVertices([]); setTool(next); };
  const all = () => { resetPath(); setVertices([]); setMask(null); };
  const polygonSelection = (points: Point[]) => combineSelection(polygonBase.current, polygonMask(image.width, image.height, points), polygonMode.current);
  const combine = (next: HTMLCanvasElement, mode: SelectionMode) => setMask(old =>
    combineSelection(old ?? (mode === "subtract" ? invertSelection(null, image.width, image.height) : null), next, mode));
  const apply = (points: Point[], mode: SelectionMode) => {
    if (points.length < 3) return;
    const next = polygonMask(image.width, image.height, points);
    combine(next, mode);
    setPath([]);
  };
  const finishPolygon = () => {
    if (polygon.current.length < 3) return;
    setMask(polygonSelection(polygon.current)); setVertices(polygon.current); setPath([]); polygon.current = [];
  };
  const cancel = () => { if (!importing) e.cancelImageImport(); };
  const accept = async () => {
    if (!bounds || path.length || importing) return;
    if (e.model && [...e.docs.values()].some(d => d.islands.length)) { setChoice(null); setStep("island"); return; }
    await finish();
  };
  const finish = async (binding?: ImportIslandChoice | null) => {
    setImporting(true); setError("");
    try { await e.acceptImageImport(mask, target || null, binding); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); setImporting(false); }
  };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    preview.current?.focus();
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width && entry.contentRect.height) setSize({ w: entry.contentRect.width, h: entry.contentRect.height }); });
    observer.observe(host.current!);
    const release = () => { space.current = false; drag.current = null; };
    window.addEventListener("blur", release);
    return () => { observer.disconnect(); window.removeEventListener("blur", release); previous?.focus(); };
  }, []);
  useEffect(() => {
    const c = preview.current!, ratio = window.devicePixelRatio || 1;
    c.width = Math.max(1, Math.round(size.w * ratio)); c.height = Math.max(1, Math.round(size.h * ratio));
    const ctx = c.getContext("2d")!;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.save();ctx.translate(origin.x, origin.y);ctx.scale(scale, scale);
    ctx.fillStyle = "#34383e";ctx.fillRect(0, 0, image.width, image.height);
    const tile = 12 / scale;
    ctx.fillStyle = "#464b52";
    for (let y = 0; y < image.height; y += tile) for (let x = 0; x < image.width; x += tile)
      if ((Math.round(x / tile) + Math.round(y / tile)) % 2 === 0) ctx.fillRect(x, y, Math.min(tile, image.width - x), Math.min(tile, image.height - y));
    ctx.globalAlpha = displayMask ? .25 : 1;ctx.drawImage(image, 0, 0);ctx.globalAlpha = 1;
    if (selected) ctx.drawImage(selected, 0, 0);
    ctx.lineWidth = 1.5 / scale;ctx.strokeStyle = "#b4ffe9";ctx.setLineDash([5 / scale, 4 / scale]);
    if (displayMask && displayBounds && !vertices.length) ctx.strokeRect(displayBounds.x, displayBounds.y, displayBounds.width, displayBounds.height);
    if (path.length) {
      ctx.beginPath();path.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      if (tool !== "polygon") ctx.closePath();ctx.stroke();
    }
    ctx.setLineDash([]);ctx.fillStyle = "#243137";
    const dot = (p: Point, circle = false) => {
      ctx.beginPath(); if (circle) ctx.arc(p.x,p.y,5/scale,0,Math.PI*2); else ctx.rect(p.x-4/scale,p.y-4/scale,8/scale,8/scale);
      ctx.fill();ctx.stroke();
    };
    if (tool === "polygon") {
      const points = path.length ? path : vertices;
      if (!path.length && points.length) {ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.stroke();}
      points.forEach((p,i)=>dot(p,i===0));
    } else if (tool === "lasso" && path.length) dot(path[0],true);
    if (displayMask && displayBounds && !path.length && !vertices.length) selectionHandles(displayBounds).forEach(p=>dot(p));
    ctx.restore();
  }, [size, zoom, pan, displayMask, selected, displayBounds, path, vertices, tool]);
  return <div className="modal-backdrop image-import-backdrop">
    <div ref={root} className="modal image-import-modal" role="dialog" aria-modal="true" aria-labelledby="image-import-title"
      onKeyUp={ev => { if (ev.code === "Space") space.current = false; }}
      onKeyDown={ev => {
        if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); if (drag.current?.kind === "frame" || drag.current?.kind === "vertex") { if (drag.current.closed) setVertices(drag.current.points); else if (drag.current.kind === "vertex") {polygon.current=drag.current.points;setPath(polygon.current);} drag.current=null;setDraft(null); } else if (path.length) resetPath(); else cancel(); return; }
        if (ev.key === "Tab") {
          const controls = [...root.current!.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),select:not(:disabled),canvas,[role=button]")].filter(el => el.getClientRects().length);
          const first = controls[0], last = controls.at(-1);
          if (ev.shiftKey && document.activeElement === first) { ev.preventDefault();last?.focus(); }
          else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault();first?.focus(); }
          return;
        }
        if (step === "island") return;
        if ((ev.target as HTMLElement).closest("input,select")) return;
        if (ev.code === "Space" && ev.target === preview.current) { ev.preventDefault();space.current = true; }
        if ((ev.ctrlKey || ev.metaKey) && ev.code === "KeyA") { ev.preventDefault(); all(); }
        else if (ev.code === "KeyM") chooseTool("rect");
        else if (ev.code === "KeyL") chooseTool(ev.shiftKey ? "polygon" : "lasso");
        else if (ev.code === "KeyW") chooseTool("wand");
        else if (ev.key === "Enter" && ev.target === preview.current) { ev.preventDefault();if (polygon.current.length) finishPolygon();else void accept(); }
      }}>
      <div className="modal-title"><h2 id="image-import-title">Import image</h2><Button title="Cancel image import" disabled={importing} onClick={cancel}><X size={18} /></Button></div>
      <div className="image-import-area" style={{ display: step === "area" ? undefined : "none" }}>
      <div className="image-import-source">{source.name} <span>{image.width} × {image.height}</span></div>
      <div className="image-import-tools" role="toolbar" aria-label="Import selection tools">
        {([{ id: "rect", label: "Rectangle (M)", Icon: SquareDashed }, { id: "lasso", label: "Lasso (L)", Icon: Lasso },
          { id: "polygon", label: "Polygon (Shift+L)", Icon: PenTool }, { id: "wand", label: "Magic wand (W)", Icon: WandSparkles }] as const).map(({ id, label, Icon }) =>
          <Button key={id} title={label} active={tool === id} aria-pressed={tool === id} disabled={importing} onClick={() => chooseTool(id)}><Icon size={16} />{label.split(" (")[0]}</Button>)}
        <Button title="Whole image (Ctrl+A)" disabled={importing} onClick={all}><Scan size={16} />Whole image</Button>
        {tool === "wand" && <><label>Tolerance <input aria-label="Import wand tolerance" type="number" min="0" max="255" value={tolerance} onChange={ev => setTolerance(Math.max(0, Math.min(255, +ev.target.value)))} /></label>
          <label><input type="checkbox" checked={contiguous} onChange={ev => setContiguous(ev.target.checked)} />Contiguous</label></>}
      </div>
      <div className="image-import-preview" ref={host}>
        <canvas ref={preview} tabIndex={0} aria-label="Import image preview" data-testid="import-preview"
          onPointerDown={ev => {
            if (ev.button === 2 || importing) return;
            ev.preventDefault();ev.currentTarget.focus();ev.currentTarget.setPointerCapture(ev.pointerId);
            const p = point(ev), mode = ev.shiftKey ? "add" : ev.altKey ? "subtract" : "replace";
            if (tool === "rect") { p.x = Math.round(p.x);p.y = Math.round(p.y); }
            if (ev.button === 1 || space.current) { drag.current = { kind: "pan", start: {x: ev.clientX, y: ev.clientY}, points: [], mode, pan };return; }
            if (!ev.shiftKey && !ev.altKey) {
              const points = polygon.current.length ? polygon.current : vertices;
              const vertex = tool === "polygon" ? points.findIndex(v=>Math.hypot(v.x-p.x,v.y-p.y)*scale<=8) : -1;
              if (vertex >= 0) {drag.current={kind:"vertex",start:p,points:points.map(v=>({...v})),mode,handle:vertex,closed:!polygon.current.length};return;}
              const handle = mask && bounds && !path.length && !vertices.length ? hitSelectionHandle(bounds,p,scale) : -1;
              if (handle >= 0) {drag.current={kind:"frame",start:p,points:[],mode,handle,bounds:bounds!,mask:mask!};return;}
            }
            setVertices([]);
            if (tool === "wand") { combine(floodMask(image, p.x, p.y, tolerance, contiguous), mode);return; }
            if (tool === "polygon") {
              if (!polygon.current.length) {polygonMode.current = mode;polygonBase.current = mask ?? (mode === "subtract" ? invertSelection(null,image.width,image.height) : null);}
              polygon.current = [...polygon.current, p];setPath(polygon.current);return;
            }
            drag.current = { kind: "selection", start: p, points: [p], mode };setPath([p]);
          }}
          onPointerMove={ev => {
            const g = drag.current;if (!g) {
              const p=point(ev), points=polygon.current.length?polygon.current:vertices;
              const vertex=tool==="polygon" && points.some(v=>Math.hypot(v.x-p.x,v.y-p.y)*scale<=8);
              const handle=mask&&bounds&&!path.length&&!vertices.length?hitSelectionHandle(bounds,p,scale):-1;
              ev.currentTarget.style.cursor=vertex?"move":handle>=0?selectionCursors[handle]:"crosshair";return;
            }
            if (g.kind === "pan") { setPan({ x: g.pan!.x + ev.clientX-g.start.x, y: g.pan!.y + ev.clientY-g.start.y });return; }
            const p = point(ev);
            if (g.kind === "frame") {setDraft(transformSelection(g.mask!,g.bounds!,dragSelectionBounds(g.bounds!,g.handle!,g.start,p)));return;}
            if (g.kind === "vertex") {
              g.moved ||= Math.hypot(p.x-g.start.x,p.y-g.start.y)*scale>3;
              if (!g.moved) return;
              const points=g.points.map((v,i)=>i===g.handle?p:v);
              if (g.closed) {setVertices(points);setDraft(polygonSelection(points));} else {polygon.current=points;setPath(points);}return;
            }
            if (tool === "rect") { p.x = Math.round(p.x);p.y = Math.round(p.y); }
            g.points = tool === "rect" ? [g.start, { x: p.x, y: g.start.y }, p, { x: g.start.x, y: p.y }] : [...g.points, p];
            setPath(g.points);
          }}
          onPointerUp={() => { const g = drag.current;drag.current = null;
            if (g?.kind === "selection") { apply(g.points, g.mode);setPath([]); }
            if (g?.kind === "frame" || (g?.kind === "vertex" && g.closed)) {if(draft)setMask(draft);setDraft(null);}
            if (g?.kind === "vertex" && !g.closed && !g.moved && g.handle===0) finishPolygon();
          }}
          onPointerCancel={() => {const g=drag.current;if(g?.kind==="vertex"){if(g.closed)setVertices(g.points);else polygon.current=g.points;} drag.current = null;setDraft(null);setPath(polygon.current); }}
          onDoubleClick={() => { if (tool === "polygon") finishPolygon(); }}
          onContextMenu={ev => ev.preventDefault()}
          onWheel={ev => { ev.preventDefault();setZoom(z => Math.max(.1, Math.min(20, z * (ev.deltaY < 0 ? 1.15 : 1/1.15)))); }} />
        <div className="canvas-zoom">
          <Button title="Zoom import out" onClick={() => setZoom(z => Math.max(.1, z / 1.2))}><Minus size={13} /></Button>
          <span>{Math.round(scale * 100)}%</span>
          <Button title="Zoom import in" onClick={() => setZoom(z => Math.min(20, z * 1.2))}><Plus size={13} /></Button>
          <Button title="Fit import image" onClick={() => { setZoom(1);setPan({x:0,y:0}); }}><Maximize size={13} /></Button>
        </div>
      </div>
      <div className="image-import-hint">{tool === "polygon" ? "Click vertices · Enter or double-click to finish" : "Drag to select · Shift adds · Alt subtracts"} · Space-drag to pan</div>
      {error && <p role="alert" className="import-error">{error}</p>}
      <div className="image-import-footer">
        <label>Import to <select aria-label="Import target layer" value={target} disabled={importing} onChange={ev => setTarget(ev.target.value)}>
          <option value="">New layer</option>
          {e.doc?.layers.slice().reverse().map(l => <option key={l.id} value={l.id}>{l.name}{l.visible ? "" : " · Hidden"}</option>)}
        </select></label>
        <span>{bounds ? `${bounds.width} × ${bounds.height} px` : "No area selected"}</span>
        <div className="spacer" /><button disabled={importing} onClick={cancel}>Cancel</button>
        <button disabled={importing || !bounds || !!path.length} onClick={() => void finish(null)}>Add</button>
        <button className="primary" disabled={importing || !bounds || !!path.length} onClick={() => void accept()}>{importing ? "Importing…" : "Next"}</button>
      </div>
      </div>
      {step === "island" && <>
        <p className="image-import-hint">Choose a UV island for the imported image{target ? " in the current material" : ""}. Hover to highlight · Middle-drag to orbit.</p>
        <ImportIslandPicker targetMaterial={target ? e.activeId : undefined} onPick={setChoice} />
        <div className="image-import-footer">
          <button disabled={importing} onClick={() => { setError(""); setStep("area"); }}>Back to image area</button>
          <div className="spacer" />
          <button disabled={importing} onClick={() => void finish(null)}>Import without link</button>
          <button className="primary" disabled={importing || !choice} onClick={() => void finish(choice)}>{importing ? "Importing…" : "Import linked image"}</button>
        </div>
        {error && <p role="alert" className="import-error">{error}</p>}
      </>}
    </div>
  </div>;
}
