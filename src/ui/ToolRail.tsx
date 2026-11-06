import {
  Move,
  Scan,
  Lasso,
  PenTool,
  WandSparkles,
  Paintbrush,
  Slash,
  Eraser,
  PaintBucket,
  Pipette,
  Stamp,
  Hand,
  Grid2X2,
  Square,
  Circle,
  Hexagon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ShapeKind, Tool } from "../types";
import { useEditor } from "./hooks";
import { Button } from "./Button";
import { ColorButton } from "./ColorPicker";
export const shapes: [ShapeKind, typeof Move, string][] = [
  ["line", Slash, "Line"],
  ["rect", Square, "Rectangle"],
  ["ellipse", Circle, "Ellipse"],
  ["polygon", Hexagon, "Regular polygon"],
];
const items: [Tool, typeof Move, string][] = [
  ["move", Move, "Move / transform (V)"],
  ["rect", Scan, "Rectangle selection (M)"],
  ["lasso", Lasso, "Freehand lasso (L)"],
  ["polygon", PenTool, "Polygonal lasso (Shift+L) · Enter closes"],
  ["wand", WandSparkles, "Magic wand (W)"],
  ["brush", Paintbrush, "Brush (B)"],
  ["line", Slash, "Line (N)"],
  ["eraser", Eraser, "Eraser (E)"],
  ["fill", PaintBucket, "Fill (G)"],
  ["eyedropper", Pipette, "Eyedropper (I)"],
  ["clone", Stamp, "Clone stamp (S) · Alt-click source"],
  ["island", Grid2X2, "Select UV island (U)"],
  ["pan", Hand, "Pan (H / Space)"],
];
export function ToolRail() {
  const e = useEditor();
  const [flyout, setFlyout] = useState(false);
  const hold = useRef(0), shapeSlot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!flyout) return;
    const close = (ev: Event) => {
      if (ev instanceof KeyboardEvent ? ev.key === "Escape" : !shapeSlot.current?.contains(ev.target as Node)) setFlyout(false);
    };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", close, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", close, true);
    };
  }, [flyout]);
  const stopHold = () => { clearTimeout(hold.current); hold.current = 0; };
  const chooseShape = (kind: ShapeKind) => {
    setFlyout(false);
    e.setShape({ kind });
    e.setTool("line");
  };
  const [, ShapeIcon, shapeName] = shapes.find(([kind]) => kind === e.shape.kind) ?? shapes[0];
  return (
    <aside className="tool-rail">
      {items.map(([tool, Icon, title], i) => tool === "line" ? (
        <div className="tool-shapes" key={tool} ref={shapeSlot}>
          <Button
            className="has-flyout"
            title={`${shapeName} (N) · hold or right-click for shapes · Shift constrains`}
            active={e.tool === tool}
            aria-haspopup="menu"
            aria-expanded={flyout}
            onClick={() => e.setTool(tool)}
            onPointerDown={ev => {
              if (ev.button !== 0) return;
              stopHold();
              hold.current = window.setTimeout(() => setFlyout(true), 350);
            }}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            onContextMenu={ev => { ev.preventDefault(); stopHold(); setFlyout(true); }}
          >
            <ShapeIcon size={18} strokeWidth={1.6} />
          </Button>
          {flyout && (
            <div className="tool-flyout" role="menu" aria-label="Shapes">
              {shapes.map(([kind, Icon, name]) => (
                <button key={kind} role="menuitemradio" aria-checked={e.shape.kind === kind}
                  className={e.shape.kind === kind ? "active" : ""}
                  onPointerUp={ev => { if (ev.button === 0) chooseShape(kind); }}
                  onKeyDown={ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); chooseShape(kind); } }}>
                  <Icon size={16} strokeWidth={1.6} /> {name}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className={i === 5 || i === 11 ? "tool-separator" : ""} key={tool}>
          <Button
            title={title}
            active={e.tool === tool}
            onClick={() => e.setTool(tool)}
          >
            <Icon size={18} strokeWidth={1.6} />
          </Button>
        </div>
      ))}
      <div className="tool-colors" role="group" aria-label="Primary and secondary colors">
        <ColorButton className="secondary-color" label="Secondary color" title="Secondary color · shape outline · X swaps colors"
          color={e.backgroundColor} alpha={e.backgroundAlpha} onChange={(color, alpha) => e.setColor("secondary", color, alpha)} />
        <ColorButton className="primary-color" label="Primary color" title="Primary color · X swaps colors"
          color={e.color} alpha={e.colorAlpha} onChange={(color, alpha) => e.setColor("primary", color, alpha)} />
      </div>
    </aside>
  );
}
