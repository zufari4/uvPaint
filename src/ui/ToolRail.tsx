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
import { useEffect, useRef, useState, type ComponentType } from "react";
import type { ShapeKind, Tool } from "../types";
import { useEditor } from "./hooks";
import { Button } from "./Button";
import { ColorButton } from "./ColorPicker";
type Icon = ComponentType<{ size?: number; strokeWidth?: number }>;
const LinearGradient: Icon = ({ size = 18, strokeWidth = 1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}>
    <defs><linearGradient id="uvp-linear-gradient"><stop offset="0" stopColor="currentColor" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
    <rect x="3" y="5" width="18" height="14" rx="2" fill="url(#uvp-linear-gradient)" />
  </svg>
);
const RadialGradient: Icon = ({ size = 18, strokeWidth = 1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}>
    <defs><radialGradient id="uvp-radial-gradient"><stop offset="0" stopColor="currentColor" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></radialGradient></defs>
    <rect x="3" y="5" width="18" height="14" rx="2" fill="url(#uvp-radial-gradient)" />
  </svg>
);
export const shapes: [ShapeKind, Icon, string][] = [
  ["line", Slash, "Line"],
  ["rect", Square, "Rectangle"],
  ["ellipse", Circle, "Ellipse"],
  ["polygon", Hexagon, "Regular polygon"],
];
const fills: ["fill" | "linear" | "radial", Icon, string][] = [
  ["fill", PaintBucket, "Fill"],
  ["linear", LinearGradient, "Linear gradient"],
  ["radial", RadialGradient, "Radial gradient"],
];
const items: [Tool, Icon, string][] = [
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
  const [, ShapeIcon, shapeName] = shapes.find(([kind]) => kind === e.shape.kind) ?? shapes[0];
  const fillKind = e.fillTool === "fill" ? "fill" : e.gradient;
  const [, FillIcon, fillName] = fills.find(([kind]) => kind === fillKind) ?? fills[0];
  return (
    <aside className="tool-rail">
      {items.map(([tool, Icon, title], i) => tool === "line" ? (
        <ToolGroup key={tool} className="tool-shapes" menuLabel="Shapes" Icon={ShapeIcon}
          title={`${shapeName} (N) · hold or right-click for shapes · Shift constrains`}
          active={e.tool === "line"} onClick={() => e.setTool("line")}
          options={shapes.map(([kind, Icon, name]) => ({ key: kind, Icon, name, checked: e.shape.kind === kind,
            choose: () => { e.setShape({ kind }); e.setTool("line"); } }))} />
      ) : tool === "fill" ? (
        <ToolGroup key={tool} className="tool-fills" menuLabel="Fill and gradients" Icon={FillIcon}
          title={`${fillName} (G) · hold or right-click for gradients · Shift+G switches`}
          active={e.tool === "fill" || e.tool === "gradient"} onClick={() => e.setTool(e.fillTool)}
          options={fills.map(([kind, Icon, name]) => ({ key: kind, Icon, name,
            checked: kind === fillKind,
            choose: () => {
              if (kind !== "fill") e.setGradient(kind);
              e.setTool(kind === "fill" ? "fill" : "gradient");
            } }))} />
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
/** Tool button with a flyout opened by a long press or right click. */
function ToolGroup({ className, menuLabel, Icon, title, active, onClick, options }: {
  className: string;
  menuLabel: string;
  Icon: Icon;
  title: string;
  active: boolean;
  onClick: () => void;
  options: { key: string; Icon: Icon; name: string; checked: boolean; choose: () => void }[];
}) {
  const [flyout, setFlyout] = useState(false);
  const hold = useRef(0), slot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!flyout) return;
    const close = (ev: Event) => {
      if (ev instanceof KeyboardEvent ? ev.key === "Escape" : !slot.current?.contains(ev.target as Node)) setFlyout(false);
    };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", close, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", close, true);
    };
  }, [flyout]);
  const stopHold = () => { clearTimeout(hold.current); hold.current = 0; };
  const choose = (option: (typeof options)[number]) => { setFlyout(false); option.choose(); };
  return (
    <div className={`tool-group ${className}`} ref={slot}>
      <Button
        className="has-flyout"
        title={title}
        active={active}
        aria-haspopup="menu"
        aria-expanded={flyout}
        onClick={onClick}
        onPointerDown={ev => {
          if (ev.button !== 0) return;
          stopHold();
          hold.current = window.setTimeout(() => setFlyout(true), 350);
        }}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onContextMenu={ev => { ev.preventDefault(); stopHold(); setFlyout(true); }}
      >
        <Icon size={18} strokeWidth={1.6} />
      </Button>
      {flyout && (
        <div className="tool-flyout" role="menu" aria-label={menuLabel}>
          {options.map(option => (
            <button key={option.key} role="menuitemradio" aria-checked={option.checked}
              className={option.checked ? "active" : ""}
              onPointerUp={ev => { if (ev.button === 0) choose(option); }}
              onKeyDown={ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); choose(option); } }}>
              <option.Icon size={16} strokeWidth={1.6} /> {option.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
