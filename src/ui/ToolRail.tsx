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
  ["polygon", PenTool, "Polygonal lasso (P) · Enter closes"],
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
      <span className="rail-caption">COLOR</span>
    </aside>
  );
}
