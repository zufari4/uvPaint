import { useState } from "react";
import { X } from "lucide-react";
import { useEditor } from "./hooks";
import { Button } from "./Button";
export function SizeDialog({ close }: { close: () => void }) {
  const e = useEditor();
  const [w, setW] = useState(e.doc?.width ?? 2048),
    [h, setH] = useState(e.doc?.height ?? 2048);
  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        onSubmit={(ev) => {
          ev.preventDefault();
          void e.run(async () => {
            await e.newCanvas(w, h);
            close();
          });
        }}
      >
        <div className="modal-title">
          <h2>{e.doc ? "Resize texture" : "New texture"}</h2>
          <Button type="button" title="Close" onClick={close}>
            <X size={18} />
          </Button>
        </div>
        <p>
          {e.doc
            ? "Layers scale to the new dimensions. This change can be undone."
            : "Start with a transparent RGBA canvas."}
        </p>
        <div className="size-fields">
          <label>
            Width
            <input
              aria-label="Texture width"
              type="number"
              min="1"
              required
              value={w}
              onChange={(ev) => setW(+ev.target.value)}
            />
          </label>
          <span>×</span>
          <label>
            Height
            <input
              aria-label="Texture height"
              type="number"
              min="1"
              required
              value={h}
              onChange={(ev) => setH(+ev.target.value)}
            />
          </label>
        </div>
        <small>
          {((w * h * 4) / 1048576).toFixed(1)} MiB per layer · Dimensions
          checked against available memory and GPU limits.
        </small>
        <button className="primary" disabled={e.busy} type="submit">
          {e.doc ? "Resize texture" : "Create texture"}
        </button>
      </form>
    </div>
  );
}
export function HelpDialog({ close }: { close: () => void }) {
  return (
    <div className="modal-backdrop">
      <div className="modal help-modal">
        <div className="modal-title">
          <h2>Your texture workbench</h2>
          <Button title="Close help" onClick={close}>
            <X size={18} />
          </Button>
        </div>
        <p>
          Open a GLB → choose a material → import images → select a fragment →
          Extract → Perspective → export PNG.
        </p>
        <dl>
          <dt>Selection</dt>
          <dd>
            M rectangle · L lasso · Shift+L switches lasso · W wand
            <br />
            Shift adds · Alt subtracts · Enter closes polygon
            <br />
            Drag selection corners / sides to resize · Center handle moves the area
          </dd>
          <dt>Cut & extract</dt>
          <dd>
            Ctrl+C / X / V copy, cut, paste · Ctrl+J copy to layer
            <br />
            Ctrl+A all · Ctrl+D deselect · Ctrl+Shift+I invert
            <br />
            Ctrl+Shift+J extract · Delete clears
          </dd>
          <dt>Transform</dt>
          <dd>
            Ctrl+T free transform · Corners scale · Outside frame rotates
            <br />
            V: click selects an island and linked layer · Drag moves the image
            <br />
            Esc (with nothing to cancel), Show all layers or an empty click with V / U leaves the island focus
            <br />
            Shift unlocks proportions / snaps rotation / moves along one axis · Alt from center
            <br />
            Ctrl snaps rotation to 5° and movement to 10 texture pixels
            <br />Press Ctrl after starting a scale drag to snap size to 10 pixels
            <br />
            Ctrl-drag a corner distorts · Warp has 16 control points
            <br />
            Enter applies · Escape restores original
          </dd>
          <dt>Paint</dt>
          <dd>
            B brush · N line · E eraser · G fill · I eyedropper
            <br />
            Line: click two points or drag, drag the end points to adjust, Enter applies, Esc cancels, Shift snaps to 45°
            <br />Shapes: hold or right-click the line button to pick a rectangle, ellipse or regular polygon; fill uses the primary color, the outline the secondary one; Shift draws squares and circles
            <br />While a shape is editable: drag inside to move it (Shift keeps one axis, Ctrl 10 px steps), just outside to rotate (Shift 15°, Ctrl 5°), Ctrl snaps end points to a 10 px grid
            <br />Gradient: hold or right-click the fill button (Shift+G switches); drag from start to end, primary to secondary color, Enter applies
            <br />S clone stamp, Alt-click to set source; the source then moves with the brush · [ / ] brush size
            <br />
            F resizes the brush: move the mouse, click or Enter applies, Esc / right-click cancels
            <br />
            Alt-click with Brush samples color · 1–9 / 0 color alpha
            <br />D black/white · X swaps foreground/background
          </dd>
          <dt>Navigation</dt>
          <dd>
            Space-drag / H pan · Scroll zooms
            <br />
            3D: middle-drag orbit · Shift+middle pan
            <br />
            Ctrl+middle / wheel zoom · Home / numpad decimal frame
            <br />
            Numpad 1/3/7 views (Ctrl reverses) · 5 perspective/ortho
            <br />
            Numpad 2/4/6/8 orbit · 9 opposite · +/− zoom
          </dd>
          <dt>History & files</dt>
          <dd>
            Ctrl+Z undo · Ctrl+Shift+Z / Ctrl+Y redo
            <br />
            Ctrl+O open GLB · Ctrl+Shift+S export PNG
            <br />
            PNG export extends island edges by half of the smallest gap between islands
            <br />
            Ctrl+S save project · Ctrl+Alt+S save as · Ctrl+Shift+O open project
          </dd>
        </dl>
        <small>
          Save a .uvpaint project to retain the model, all textures, layers and
          UV bindings. Undo history starts fresh when a project is opened.
        </small>
      </div>
    </div>
  );
}
