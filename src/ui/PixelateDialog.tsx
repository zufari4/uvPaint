import { useEffect, useRef, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import { useEditor } from "./hooks";
import { Button } from "./Button";
import type { TextureDocument } from "../types";
import { defaultPixelateOptions, pixelatedCanvas, pixelateSources, type PixelateOptions } from "../tools/pixelate";
import { PixelateRunner } from "../tools/pixelate-runner";

const percent = (v: number) => `${Math.round(v * 100)}%`;
const controls: { key: keyof PixelateOptions; label: string; min: number; max: number; step: number; format: (v: number) => string }[] = [
  { key: "pixelSize", label: "Pixel size", min: 2, max: 32, step: 1, format: (v) => `${v} px` },
  { key: "detail", label: "Detail preservation", min: 0, max: 1, step: 0.01, format: percent },
  { key: "edges", label: "Edge sensitivity", min: 0, max: 1, step: 0.01, format: percent },
  { key: "outline", label: "Outline", min: 0, max: 1, step: 0.01, format: percent },
  { key: "colors", label: "Color levels", min: 2, max: 32, step: 1, format: (v) => (v === 32 ? "32 · 15-bit" : String(v)) },
  { key: "dither", label: "Dithering", min: 0, max: 1, step: 0.01, format: percent },
];
const guardedEvents = ["pointerdown", "mousedown", "click", "dblclick", "auxclick", "contextmenu", "dragover", "drop"];
type Scope = "all" | "layer";
type Position = { x: number; y: number };
const storageKey = "uvpaint.smartPixelate";
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function loadSettings() {
  let raw: { options?: Record<string, unknown>; scope?: unknown; position?: { x?: unknown; y?: unknown } } = {};
  try { raw = JSON.parse(localStorage.getItem(storageKey) ?? "{}") ?? {}; } catch { /* use defaults */ }
  const options = { ...defaultPixelateOptions };
  for (const c of controls) {
    const value = Number(raw.options?.[c.key]);
    if (raw.options?.[c.key] !== undefined && Number.isFinite(value)) options[c.key] = clamp(value, c.min, c.max);
  }
  const x = Number(raw.position?.x), y = Number(raw.position?.y);
  const position: Position | null = raw.position && Number.isFinite(x) && Number.isFinite(y)
    ? { x: clamp(x, 0, window.innerWidth - 160), y: clamp(y, 0, window.innerHeight - 60) } : null;
  return { options, scope: (raw.scope === "layer" ? "layer" : "all") as Scope, position };
}

type Job = {
  runner: PixelateRunner;
  canvases: HTMLCanvasElement[];
  selection: HTMLCanvasElement | null;
  rendered: { options: PixelateOptions; map: Map<HTMLCanvasElement, HTMLCanvasElement> } | null;
};

export function PixelateDialog({ close }: { close: () => void }) {
  const e = useEditor(), root = useRef<HTMLDivElement>(null);
  const [initial] = useState(loadSettings);
  const [options, setOptions] = useState(initial.options), [scope, setScope] = useState(initial.scope);
  const [position, setPosition] = useState(initial.position), [preview, setPreview] = useState(true);
  const [base, setBase] = useState<TextureDocument | null>(null);
  const [rendering, setRendering] = useState(false), [applying, setApplying] = useState(false);
  const job = useRef<Job | null>(null), busy = useRef(false), dirty = useRef(false), applyRequested = useRef(false);
  const drag = useRef<Position | null>(null);
  const latest = useRef({ options, preview });
  latest.current = { options, preview };
  const activeLayer = base?.layers.find((l) => l.id === base.activeId);
  // One render at a time; slider changes made meanwhile are folded into the next render.
  const refresh = async () => {
    if (busy.current) { dirty.current = true; return; }
    busy.current = true; setRendering(true);
    try {
      do {
        dirty.current = false;
        const current = job.current;
        if (!current) break;
        const { options, preview } = latest.current;
        if (!preview && !applyRequested.current) { e.previewFilter(null); continue; }
        if (current.rendered?.options !== options) {
          const data = await current.runner.render(options);
          if (!data || job.current !== current) { dirty.current = !!job.current; continue; }
          current.rendered = { options, map: new Map(current.canvases.map((c, i) => [c, pixelatedCanvas(c, data[i], current.selection)])) };
        }
        e.previewFilter(current.rendered!.map);
        if (applyRequested.current && !dirty.current) {
          applyRequested.current = false;
          e.applyFilter("Smart pixelate");
          close();
          return;
        }
      } while (dirty.current);
    } catch (error) {
      applyRequested.current = false; setApplying(false); e.fail(error);
    } finally {
      busy.current = false; setRendering(false);
    }
  };
  useEffect(() => {
    const doc = e.beginFilter();
    if (!doc) { close(); return; }
    setBase(doc);
    const previous = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLInputElement>("input")?.focus();
    // The texture stays visible for the preview, so block edits outside the panel but keep middle-drag navigation.
    const guard = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target && root.current?.contains(target)) return;
      if (event instanceof MouseEvent && event.button === 1 && event.type !== "drop" && event.type !== "dragover"
        && target?.closest(".texture-pane canvas, .preview-pane canvas")) return;
      if (event.type !== "dragover") event.preventDefault();
      event.stopPropagation();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation(); close();
    };
    guardedEvents.forEach((type) => window.addEventListener(type, guard, true));
    window.addEventListener("keydown", escape, true);
    return () => {
      guardedEvents.forEach((type) => window.removeEventListener(type, guard, true));
      window.removeEventListener("keydown", escape, true);
      e.cancelFilter();
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    if (!base) return;
    const layers = scope === "all" ? base.layers : base.layers.filter((l) => l.id === base.activeId);
    try {
      const sources = pixelateSources(layers, base.selection);
      job.current = {
        runner: new PixelateRunner(sources.map((s) => s.source)),
        canvases: sources.map((s) => s.layer),
        selection: base.selection,
        rendered: null,
      };
    } catch (error) {
      e.fail(error); close(); return;
    }
    void refresh();
    return () => {
      job.current?.runner.dispose();
      job.current = null;
    };
  }, [base, scope]);
  useEffect(() => { if (job.current) void refresh(); }, [options, preview]);
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify({ options, scope, position })); } catch { /* session-only settings */ }
  }, [options, scope, position]);
  const apply = () => {
    if (!job.current || applyRequested.current) return;
    applyRequested.current = true;
    setApplying(true);
    void refresh();
  };
  return (
    <div className="modal-backdrop filter-backdrop">
      <div
        className="modal filter-modal"
        ref={root}
        style={position ? { position: "fixed", left: position.x, top: position.y, margin: 0 } : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pixelate-title"
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.target as HTMLElement).tagName === "INPUT") {
            event.preventDefault();
            apply();
          }
          if (event.key !== "Tab") return;
          const items = root.current?.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled)");
          if (!items?.length) return;
          const first = items[0], last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }}
      >
        <div
          className="modal-title"
          title="Drag to move"
          onPointerDown={(event) => {
            if (event.button !== 0 || (event.target as Element).closest("button")) return;
            const r = root.current!.getBoundingClientRect();
            drag.current = { x: event.clientX - r.left, y: event.clientY - r.top };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const d = drag.current;
            if (!d) return;
            const r = root.current!.getBoundingClientRect();
            setPosition({
              x: clamp(event.clientX - d.x, 0, window.innerWidth - r.width),
              y: clamp(event.clientY - d.y, 0, window.innerHeight - 60),
            });
          }}
          onPointerUp={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}
        >
          <h2 id="pixelate-title">Smart pixelate</h2>
          <Button title="Cancel smart pixelate" onClick={close}>
            <X size={18} />
          </Button>
        </div>
        <p>
          PS1-style pixel art. Edges and small contrasting details are kept instead of being averaged away.
          {base?.selection ? " Only the selection changes." : ""}
        </p>
        <div className="filter-scope" role="radiogroup" aria-label="Apply to">
          <span>Apply to</span>
          <label>
            <input type="radio" name="pixelate-scope" checked={scope === "all"} disabled={applying}
              onChange={() => setScope("all")} />
            Whole image ({base?.layers.length ?? 0} layers)
          </label>
          <label title={activeLayer?.name}>
            <input type="radio" name="pixelate-scope" checked={scope === "layer"} disabled={applying || !activeLayer}
              onChange={() => setScope("layer")} />
            <span>Active layer{activeLayer ? ` “${activeLayer.name}”` : ""}</span>
          </label>
        </div>
        {controls.map((c) => (
          <label className="setting-row" key={c.key}>
            <span>{c.label}</span>
            <input
              type="range"
              aria-label={c.label}
              min={c.min}
              max={c.max}
              step={c.step}
              value={options[c.key]}
              disabled={applying}
              onChange={(event) => setOptions((o) => ({ ...o, [c.key]: +event.target.value }))}
            />
            <output>{c.format(options[c.key])}</output>
          </label>
        ))}
        <label className="filter-preview-toggle">
          <input type="checkbox" checked={preview} disabled={applying} onChange={(event) => setPreview(event.target.checked)} />
          Preview
          {rendering && <span className="filter-status" role="status">Rendering…</span>}
        </label>
        <small>Middle-drag pans the texture, the wheel zooms. Drag the title to move this panel.</small>
        <div className="filter-footer">
          <Button title="Reset filter settings" disabled={applying} onClick={() => setOptions(defaultPixelateOptions)}>
            <RotateCcw size={16} /> Reset
          </Button>
          <div className="spacer" />
          <button onClick={close}>Cancel</button>
          <button className="primary" disabled={!base || applying} onClick={apply}>{applying ? "Applying…" : "Apply"}</button>
        </div>
      </div>
    </div>
  );
}
