import type { Point } from "../types";

export type TextOptions = {
  font: string;
  size: number;
  bold: boolean;
  italic: boolean;
  align: "left" | "center" | "right";
  outline: boolean;
  outlineWidth: number;
  /** none: hard pixel edges, sharp: crisp edges, smooth: regular anti-aliasing. */
  antialias: "none" | "sharp" | "smooth";
};
export const defaultTextOptions: TextOptions = {
  font: "Arial", size: 48, bold: false, italic: false, align: "left", outline: false, outlineWidth: 2, antialias: "smooth",
};
export const textFonts = [
  "Arial", "Arial Black", "Bahnschrift", "Calibri", "Cambria", "Comic Sans MS", "Consolas", "Courier New", "Georgia",
  "Impact", "Lucida Console", "Segoe Print", "Segoe Script", "Segoe UI", "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana",
];
export const fontString = (o: TextOptions, size = o.size) =>
  `${o.italic ? "italic " : ""}${o.bold ? "bold " : ""}${size}px "${o.font}"`;
export const lineHeight = (o: TextOptions) => o.size * 1.2;

let measurer: CanvasRenderingContext2D | null = null;
let installed: string[] | null = null;
/** Fonts from the list that exist on this system: their metrics differ from both generic fallbacks. */
export function availableFonts() {
  if (installed) return installed;
  measurer ??= document.createElement("canvas").getContext("2d")!;
  const sample = "mmmmmmmmmmlli WWW 0123", width = (font: string) => { measurer!.font = font; return measurer!.measureText(sample).width; };
  const fallbacks = ["monospace", "serif"].map((f) => [f, width(`72px ${f}`)] as const);
  installed = textFonts.filter((name) => fallbacks.some(([f, w]) => width(`72px "${name}", ${f}`) !== w));
  return installed.length ? installed : textFonts;
}
/** Width of each line and the size of the whole text block, in texture pixels. */
export function measureText(o: TextOptions, text: string) {
  measurer ??= document.createElement("canvas").getContext("2d")!;
  measurer.font = fontString(o);
  const lines = text.split("\n"), widths = lines.map((line) => measurer!.measureText(line).width);
  return { lines, widths, width: Math.max(0, ...widths), height: lines.length * lineHeight(o) };
}
/** Area covered by the text including outline and glyph overhang. */
export function textBounds(o: TextOptions, text: string, at: Point) {
  const { width, height } = measureText(o, text), pad = Math.ceil((o.outline ? o.outlineWidth : 0) + o.size * 0.3);
  return { x: Math.floor(at.x - pad), y: Math.floor(at.y - pad), width: Math.ceil(width + pad * 2), height: Math.ceil(height + pad * 2) };
}
type Paint = { color: string; alpha: number };
/** Draws the text block with its top-left corner at `at`: outline first, fill on top, each with its own alpha. */
export function drawText(target: CanvasRenderingContext2D, o: TextOptions, text: string, at: Point, fill: Paint, outline: Paint) {
  if (!text) return;
  const { lines, widths, width } = measureText(o, text), box = textBounds(o, text, at);
  if (box.width <= 0 || box.height <= 0) return;
  const scratch = document.createElement("canvas");
  scratch.width = box.width;
  scratch.height = box.height;
  const ctx = scratch.getContext("2d", { willReadFrequently: o.antialias !== "smooth" })!;
  const pass = (kind: "fill" | "stroke", paint: Paint) => {
    ctx.clearRect(0, 0, box.width, box.height);
    ctx.font = fontString(o);
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = o.outlineWidth * 2;
    ctx.fillStyle = ctx.strokeStyle = paint.color;
    lines.forEach((line, i) => {
      const x = at.x - box.x + (o.align === "center" ? (width - widths[i]) / 2 : o.align === "right" ? width - widths[i] : 0);
      const y = at.y - box.y + (i + 0.5) * lineHeight(o);
      if (kind === "fill") ctx.fillText(line, x, y);
      else ctx.strokeText(line, x, y);
    });
    if (o.antialias !== "smooth") {
      const image = ctx.getImageData(0, 0, box.width, box.height), d = image.data;
      for (let i = 3; i < d.length; i += 4)
        d[i] = o.antialias === "none" ? (d[i] >= 128 ? 255 : 0) : Math.max(0, Math.min(255, (d[i] - 64) * 2));
      ctx.putImageData(image, 0, 0);
    }
    target.save();
    target.globalAlpha = paint.alpha;
    target.drawImage(scratch, box.x, box.y);
    target.restore();
  };
  if (o.outline) pass("stroke", outline);
  pass("fill", fill);
}
