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
            M rectangle · L freehand · P polygon · W wand
            <br />
            Shift adds · Alt subtracts · Enter closes polygon
          </dd>
          <dt>Cut & extract</dt>
          <dd>
            Ctrl+C / X / V copy, cut, paste · Ctrl+J extract
            <br />
            Ctrl+D deselect · Ctrl+Shift+I invert · Delete clears
          </dd>
          <dt>Transform</dt>
          <dd>
            V then drag to move. Perspective has four independent corners. Warp
            has 16 control points.
            <br />
            Enter applies · Escape restores original
          </dd>
          <dt>Paint</dt>
          <dd>
            B brush · E eraser · G fill · I eyedropper
            <br />S clone stamp, Alt-click to set source · [ / ] brush size
          </dd>
          <dt>Navigation</dt>
          <dd>
            Space-drag / H pan · Scroll zooms
            <br />
            3D: drag orbit · right-drag pan · scroll zoom
          </dd>
          <dt>History & files</dt>
          <dd>
            Ctrl+Z undo · Ctrl+Shift+Z / Ctrl+Y redo
            <br />
            Ctrl+O open GLB · Ctrl+Shift+S export PNG
          </dd>
        </dl>
        <small>
          Edits live in memory. Export each material before closing; project
          files and GLB export are outside this version.
        </small>
      </div>
    </div>
  );
}
