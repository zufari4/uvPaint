import { useEffect, useState } from "react";
import {
  Check,
  X,
  FlipHorizontal2,
  FlipVertical2,
  RotateCw,
  Scissors,
  Scan,
  Grid2X2,
  SquareDashed,
  SquarePlus,
  SquareMinus,
} from "lucide-react";
import { useEditor } from "./hooks";
import { Button } from "./Button";
import { ColorButton } from "./ColorPicker";
export function OptionsBar() {
  const e = useEditor();
  // Typed values wait for Set; otherwise the fields follow the frame while it is dragged.
  const [draft, setDraft] = useState<{ w: number; h: number; angle: number; ratio: number } | null>(null),
    [linked, setLinked] = useState(true);
  const frame = e.frameGeometry;
  const live = {
    w: Math.round(frame?.width ?? 100), h: Math.round(frame?.height ?? 100), angle: Math.round((frame?.angle ?? 0) * 10) / 10,
    ratio: frame?.width && frame.height ? frame.height / frame.width : 1,
  };
  const shown = draft ?? live;
  const sx = shown.w, sy = shown.h, angle = shown.angle;
  const edit = (patch: Partial<typeof live>) => setDraft({ ...shown, ...patch });
  // The ratio is kept separately so cleared or partly typed values cannot destroy it.
  const setSx = (w: number) => edit(linked ? { w, h: Math.round(w * shown.ratio) } : { w });
  const setSy = (h: number) => edit(linked ? { h, w: Math.round(h / shown.ratio) } : { h });
  const setAngle = (value: number) => edit({ angle: value });
  useEffect(() => setDraft(null), [e.transform]);
  const selection = ["rect", "lasso", "polygon", "wand"].includes(e.tool);
  return (
    <div className="options-bar">
      <span className="tool-name">
        {
          {
            move: "Transform",
            rect: "Rectangle",
            lasso: "Lasso",
            polygon: "Polygon lasso",
            wand: "Magic wand",
            brush: "Brush",
            line: { line: "Line", rect: "Rectangle", ellipse: "Ellipse", polygon: "Polygon" }[e.shape.kind],
            eraser: "Eraser",
            fill: "Fill",
            gradient: e.gradient === "radial" ? "Radial gradient" : "Linear gradient",
            eyedropper: "Eyedropper",
            clone: "Clone stamp",
            island: "UV islands",
            pan: "Hand",
          }[e.tool]
        }
      </span>
      {(["brush", "fill", "eyedropper"].includes(e.tool) || (e.tool === "line" && e.shape.kind === "line")) && (
        <ColorButton label="Paint color" title="Paint color and alpha" color={e.color} alpha={e.colorAlpha}
          onChange={(color, alpha) => e.setColor("primary", color, alpha)} />
      )}
      {!selection && e.doc?.selection && (
        <Button title="Clear selection (Ctrl+D)" onClick={() => e.deselect()}>
          Clear selection
        </Button>
      )}
      {!selection && (e.layer?.uvBinding || (e.tool !== "move" && (e.doc?.restrict || (e.tool === "fill" && !!e.doc?.islands.length)))) && (
        <span className="options-hint">
          {e.tool === "fill" && e.doc?.islands.length ? "Fill: island under cursor" : `UV clipping: ${e.layer?.uvBinding ? `Island ${String(e.layer.uvBinding.island.id + 1).padStart(2, "0")}` : `${e.doc?.selectedIslands.length || "all"} islands`}`}
        </span>
      )}
      {selection && (
        <>
          <div
            className="selection-modes"
            role="group"
            aria-label="Selection mode"
          >
            {(
              [
                ["replace", SquareDashed, "New selection"],
                ["add", SquarePlus, "Add to selection (Shift)"],
                ["subtract", SquareMinus, "Subtract selection (Alt)"],
              ] as const
            ).map(([mode, Icon, title]) => (
              <Button
                key={mode}
                title={title}
                active={e.selectionMode === mode}
                aria-pressed={e.selectionMode === mode}
                onClick={() => {
                  e.selectionMode = mode;
                  e.emit();
                }}
              >
                <Icon size={16} />
              </Button>
            ))}
          </div>
          <Button
            title="Invert selection (Ctrl+Shift+I)"
            onClick={() => e.invert()}
          >
            Invert
          </Button>
          <Button title="Deselect (Ctrl+D)" onClick={() => e.deselect()}>
            Deselect
          </Button>
          <Button
            title="Extract selection to new layer (Ctrl+Shift+J)"
            onClick={() => e.copy(false, true)}
          >
            <Scissors size={14} /> Extract
          </Button>
        </>
      )}
      {(e.tool === "wand" || (e.tool === "fill" && !e.doc?.islands.length && !e.model)) && (
        <>
          <label>
            Tolerance{" "}
            <input
              aria-label="Tolerance"
              type="number"
              min="0"
              max="255"
              value={e.tolerance}
              onChange={(ev) => {
                e.tolerance = Math.max(0, Math.min(255, +ev.target.value));
                e.emit();
              }}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={e.contiguous}
              onChange={(ev) => {
                e.contiguous = ev.target.checked;
                e.emit();
              }}
            />{" "}
            Contiguous
          </label>
        </>
      )}
      {e.tool === "gradient" && (
        <>
          <div className="selection-modes" role="group" aria-label="Gradient type">
            {(["linear", "radial"] as const).map(kind => (
              <Button key={kind} title={kind === "linear" ? "Linear gradient" : "Radial gradient"}
                active={e.gradient === kind} aria-pressed={e.gradient === kind} onClick={() => e.setGradient(kind)}>
                {kind === "linear" ? "Linear" : "Radial"}
              </Button>
            ))}
          </div>
          <ColorButton label="Gradient start color" title="Start color (primary)" color={e.color} alpha={e.colorAlpha}
            onChange={(color, alpha) => e.setColor("primary", color, alpha)} />
          <Button title="Swap start and end colors (X)" onClick={() => e.swapColors()}>⇄</Button>
          <ColorButton label="Gradient end color" title="End color (secondary)" color={e.backgroundColor} alpha={e.backgroundAlpha}
            onChange={(color, alpha) => e.setColor("secondary", color, alpha)} />
          <span className="options-hint">{e.gradient === "radial"
            ? "Drag from the centre outwards"
            : "Drag from start to end"} · drag points to adjust · Enter applies · Shift snaps to 45°</span>
        </>
      )}
      {["brush", "line", "eraser", "clone", "fill"].includes(e.tool) && (
        <>
          {e.tool !== "fill" && !(e.tool === "line" && e.shape.kind !== "line") && (
          <label title="F: drag to resize, click to apply">
            Size{" "}
            <input
              aria-label="Brush size"
              type="number"
              min="1"
              value={e.brushSize}
              onChange={(ev) => {
                e.brushSize = Math.max(1, +ev.target.value);
                e.emit();
              }}
            />{" "}
            px
          </label>
          )}
          {(e.tool === "brush" || e.tool === "eraser") && (
            <label title="Edge softness: 100% is a hard edge">
              Hardness{" "}
              <input
                aria-label="Brush hardness"
                type="number"
                min="0"
                max="100"
                value={Math.round(e.brushHardness * 100)}
                onChange={(ev) => {
                  e.brushHardness = Math.max(0, Math.min(1, +ev.target.value / 100));
                  e.emit();
                }}
              />{" "}
              %
            </label>
          )}
          {e.tool === "clone" && (
            <span className="options-hint">Alt-click to set source</span>
          )}
          {e.tool === "line" && e.shape.kind !== "line" && (
            <>
              <label title="Fill with the primary color">
                <input type="checkbox" aria-label="Shape fill" checked={e.shape.fill}
                  onChange={ev => e.setShape({ fill: ev.target.checked })} />{" "}
                Fill
              </label>
              <ColorButton label="Fill color" title="Fill color (primary)" color={e.color} alpha={e.colorAlpha}
                onChange={(color, alpha) => e.setColor("primary", color, alpha)} />
              <label title="Outline in the secondary color">
                <input type="checkbox" aria-label="Shape outline" checked={e.shape.outline}
                  disabled={!e.shape.fill}
                  onChange={ev => e.setShape({ outline: ev.target.checked })} />{" "}
                Outline
              </label>
              <ColorButton label="Outline color" title="Outline color (secondary)" color={e.backgroundColor} alpha={e.backgroundAlpha}
                onChange={(color, alpha) => e.setColor("secondary", color, alpha)} />
              <label title="Outline width">
                <input aria-label="Outline width" type="number" min="1" max="1000" value={e.shape.width}
                  disabled={!e.shape.outline}
                  onChange={ev => e.setShape({ width: Math.max(1, Math.min(1000, +ev.target.value || 1)) })} />{" "}
                px
              </label>
              {e.shape.kind === "polygon" && (
                <label>
                  Sides{" "}
                  <input aria-label="Polygon sides" type="number" min="3" max="24" value={e.shape.sides}
                    onChange={ev => e.setShape({ sides: Math.max(3, Math.min(24, Math.round(+ev.target.value) || 3)) })} />
                </label>
              )}
            </>
          )}
          {e.tool === "line" && (
            <span className="options-hint">{e.shape.kind === "polygon"
              ? "Drag from the centre to a corner · drag points to adjust · Enter applies · Shift snaps rotation"
              : e.shape.kind === "line"
                ? "Click two points or drag · drag end points to adjust · Enter applies · Shift snaps to 45°"
                : `Drag corner to corner · drag points to adjust · Enter applies · Shift draws a ${e.shape.kind === "rect" ? "square" : "circle"}`}</span>
          )}
        </>
      )}
      {e.tool === "move" && (
        <>
          <Button
            title="Free transform (Ctrl+T)"
            active={e.transform?.kind === "free"}
            disabled={!e.layer}
            onClick={() => e.beginTransform("free")}
          >
            Free transform
          </Button>
          <Button
            title="Four-corner perspective"
            active={e.transform?.kind === "perspective"}
            disabled={!e.layer}
            onClick={() => e.beginTransform("perspective")}
          >
            <Scan size={14} /> Perspective
          </Button>
          <Button
            title="Mesh warp — 16 control points"
            active={e.transform?.kind === "mesh"}
            disabled={!e.layer}
            onClick={() => e.beginTransform("mesh")}
          >
            <Grid2X2 size={14} /> Warp
          </Button>
          <span className="divider-line" />
          <Button
            title="Flip horizontal"
            disabled={!e.layer}
            onClick={() => e.adjustTransform(-1, 1)}
          >
            <FlipHorizontal2 size={16} />
          </Button>
          <Button
            title="Flip vertical"
            disabled={!e.layer}
            onClick={() => e.adjustTransform(1, -1)}
          >
            <FlipVertical2 size={16} />
          </Button>
          <label>
            W{" "}
            <input
              aria-label="Transform width percent"
              type="number"
              value={sx}
              onChange={(ev) => setSx(+ev.target.value)}
            />
            %
          </label>
          <label title="Lock proportions">
            <input
              aria-label="Lock proportions"
              type="checkbox"
              checked={linked}
              onChange={(ev) => {
                setLinked(ev.target.checked);
                if (ev.target.checked && draft && draft.w > 0 && draft.h > 0) setDraft({ ...draft, ratio: draft.h / draft.w });
              }}
            />
            ↔
          </label>
          <label>
            H{" "}
            <input
              aria-label="Transform height percent"
              type="number"
              value={sy}
              onChange={(ev) => setSy(+ev.target.value)}
            />
            %
          </label>
          <label>
            <RotateCw size={12} />
            <input
              aria-label="Transform rotation degrees"
              type="number"
              value={angle}
              onChange={(ev) => setAngle(+ev.target.value)}
            />
            °
          </label>
          <Button
            title="Apply scale and rotation to transform"
            disabled={!e.layer}
            onClick={() => {
              e.setTransformFrame(sx, sy, angle);
              setDraft(null);
            }}
          >
            Set
          </Button>
        </>
      )}
      {e.tool === "polygon" && (
        <span className="options-hint">Click vertices · Enter closes</span>
      )}
      {e.tool === "island" && (
        <span className="options-hint">
          Click an island · Shift adds to selection
        </span>
      )}
      {e.tool === "eyedropper" && (
        <span className="options-hint">Sample the composited base color</span>
      )}
      {e.tool === "pan" && (
        <span className="options-hint">Drag the canvas · Scroll to zoom</span>
      )}
      <div className="spacer" />
      {e.transform && (
        <>
          <Button
            title="Apply transform (Enter)"
            className="confirm-button"
            onClick={() => e.confirmTransform()}
          >
            <Check size={15} /> Apply
          </Button>
          <Button
            title="Cancel transform (Escape)"
            onClick={() => e.cancelTransform()}
          >
            <X size={15} />
          </Button>
        </>
      )}
    </div>
  );
}
