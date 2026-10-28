import {
  Move,
  Scan,
  Lasso,
  PenTool,
  WandSparkles,
  Paintbrush,
  Eraser,
  PaintBucket,
  Pipette,
  Stamp,
  Hand,
  Grid2X2,
} from "lucide-react";
import type { Tool } from "../types";
import { useEditor } from "./hooks";
import { Button } from "./Button";
const items: [Tool, typeof Move, string][] = [
  ["move", Move, "Move / transform (V)"],
  ["rect", Scan, "Rectangle selection (M)"],
  ["lasso", Lasso, "Freehand lasso (L)"],
  ["polygon", PenTool, "Polygonal lasso (Shift+L) · Enter closes"],
  ["wand", WandSparkles, "Magic wand (W)"],
  ["brush", Paintbrush, "Brush (B)"],
  ["eraser", Eraser, "Eraser (E)"],
  ["fill", PaintBucket, "Fill (G)"],
  ["eyedropper", Pipette, "Eyedropper (I)"],
  ["clone", Stamp, "Clone stamp (S) · Alt-click source"],
  ["island", Grid2X2, "Select UV island (U)"],
  ["pan", Hand, "Pan (H / Space)"],
];
export function ToolRail() {
  const e = useEditor();
  return (
    <aside className="tool-rail">
      {items.map(([tool, Icon, title], i) => (
        <div className={i === 5 || i === 10 ? "tool-separator" : ""} key={tool}>
          <Button
            title={title}
            active={e.tool === tool}
            onClick={() => e.setTool(tool)}
          >
            <Icon size={18} strokeWidth={1.6} />
          </Button>
        </div>
      ))}
      <div className="tool-colors" role="group" aria-label="Primary and secondary colors"
        onKeyDown={ev => {
          if (ev.code === "KeyX" && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
            ev.preventDefault(); ev.stopPropagation(); [e.color, e.backgroundColor] = [e.backgroundColor, e.color]; e.emit();
          }
        }}>
        <input className="secondary-color" type="color" aria-label="Secondary color" title="Secondary color · X swaps colors"
          value={e.backgroundColor} onChange={ev => { e.backgroundColor = ev.target.value; e.emit(); }} />
        <input className="primary-color" type="color" aria-label="Primary color" title="Primary color · X swaps colors"
          value={e.color} onChange={ev => { e.color = ev.target.value; e.emit(); }} />
      </div>
    </aside>
  );
}
