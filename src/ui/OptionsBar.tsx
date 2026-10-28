import { useState } from "react";
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
export function OptionsBar() {
  const e = useEditor();
  const [sx, setSx] = useState(100),
    [sy, setSy] = useState(100),
    [angle, setAngle] = useState(0),
    [linked, setLinked] = useState(true);
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
            eraser: "Eraser",
            fill: "Fill",
            eyedropper: "Eyedropper",
            clone: "Clone stamp",
            island: "UV islands",
            pan: "Hand",
          }[e.tool]
        }
      </span>
      {["brush", "fill", "eyedropper"].includes(e.tool) && (
        <label className="color-swatch" title="Paint color">
          <input
            aria-label="Paint color"
            type="color"
            value={e.color}
            onChange={(ev) => {
              e.color = ev.target.value;
              e.emit();
            }}
          />
        </label>
      )}
      {!selection && e.doc?.selection && (
        <Button title="Clear selection (Ctrl+D)" onClick={() => e.deselect()}>
          Clear selection
        </Button>
      )}
      {!selection && e.doc?.restrict && (
        <span className="options-hint">
          UV clipping: {e.doc.selectedIslands.length || "all"} islands
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
      {["wand", "fill"].includes(e.tool) && (
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
      {["brush", "eraser", "clone", "fill"].includes(e.tool) && (
        <>
          <label>
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
          <label>
            Opacity{" "}
            <input
              aria-label="Brush opacity"
              type="number"
              min="0"
              max="100"
              value={Math.round(e.brushOpacity * 100)}
              onChange={(ev) => {
                e.brushOpacity = Math.max(
                  0,
                  Math.min(1, +ev.target.value / 100),
                );
                e.emit();
              }}
            />{" "}
            %
          </label>
          {e.tool === "clone" && (
            <span className="options-hint">Alt-click to set source</span>
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
              onChange={(ev) => {
                setSx(+ev.target.value);
                if (linked) setSy(+ev.target.value);
              }}
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
                if (ev.target.checked) setSy(sx);
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
              onChange={(ev) => {
                setSy(+ev.target.value);
                if (linked) setSx(+ev.target.value);
              }}
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
              e.adjustTransform(sx / 100, sy / 100, angle);
              setSx(100);
              setSy(100);
              setAngle(0);
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
      <div className="texture-meta mini-actions">
        <span>
          {e.doc ? `${e.doc.width} × ${e.doc.height}` : "RGBA canvas"}
        </span>
        <span className="tag">sRGB</span>
      </div>
    </div>
  );
}
