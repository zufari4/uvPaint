import type { Point } from "../types";

export type TextOptions = {
  font: string;
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  /** Extra space between characters, in texture pixels. */
  spacing: number;
  /** Rotation about the centre of the text block, in degrees. */
  angle: number;
  align: "left" | "center" | "right";
  outline: boolean;
  outlineWidth: number;
  /** none: hard pixel edges, sharp: crisp edges, smooth: regular anti-aliasing. */
  antialias: "none" | "sharp" | "smooth";
};
export const defaultTextOptions: TextOptions = {
  font: "Arial", size: 48, bold: false, italic: false, underline: false, spacing: 0, angle: 0, align: "left",
  outline: false, outlineWidth: 2, antialias: "smooth",
};
/** Offered when the system font list cannot be read. */
export const textFonts = [
  "Arial", "Arial Black", "Bahnschrift", "Calibri", "Cambria", "Comic Sans MS", "Consolas", "Courier New", "Georgia",
  "Impact", "Lucida Console", "Segoe Print", "Segoe Script", "Segoe UI", "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana",
];
export const fontString = (o: TextOptions, size = o.size) =>
  `${o.italic ? "italic " : ""}${o.bold ? "bold " : ""}${size}px "${o.font}"`;
export const lineHeight = (o: TextOptions) => o.size * 1.2;

let measurer: CanvasRenderingContext2D | null = null;
const measuring = () => (measurer ??= document.createElement("canvas").getContext("2d")!);
let installed: Promise<string[]> | null = null;
/** Installed font families: the system list (or the built-in one) without names the renderer cannot resolve. */
export function availableFonts() {
  return (installed ??= (async () => {
    let names: string[] = [];
    try { names = (await window.desktop?.systemFonts()) ?? []; } catch { /* use the built-in list */ }
    const ctx = measuring(), sample = "mmmmmmmmmmlli WWW 0123";
    const width = (font: string) => { ctx.font = font; return ctx.measureText(sample).width; };
    const fallbacks = ["monospace", "serif"].map((f) => [f, width(`72px ${f}`)] as const);
    // A missing family falls back to the generic font and measures exactly like it.
    const found = [...new Set([...names, ...textFonts])]
      .filter((name) => fallbacks.some(([f, w]) => width(`72px "${name}", ${f}`) !== w))
      .sort((a, b) => a.localeCompare(b));
    return found.length ? found : textFonts;
  })());
}
/** Width of each line and the size of the whole text block, in texture pixels. */
export function measureText(o: TextOptions, text: string) {
  const ctx = measuring();
  ctx.font = fontString(o);
  ctx.letterSpacing = `${o.spacing}px`;
  const lines = text.split("\n"), widths = lines.map((line) => ctx.measureText(line).width);
  return { lines, widths, width: Math.max(0, ...widths), height: lines.length * lineHeight(o) };
}
const rotate = (p: Point, c: Point, angle: number) => {
  const cos = Math.cos(angle), sin = Math.sin(angle), dx = p.x - c.x, dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
};
/** Text block placed with its unrotated top-left corner at `at`; `corners` include the rotation. */
export function textFrame(o: TextOptions, text: string, at: Point) {
  const m = measureText(o, text || " "), width = Math.max(m.width, o.size / 2), height = m.height;
  const center = { x: at.x + width / 2, y: at.y + height / 2 }, angle = (o.angle * Math.PI) / 180;
  const corners = [[0, 0], [width, 0], [width, height], [0, height]].map(([x, y]) => rotate({ x: at.x + x, y: at.y + y }, center, angle));
  return { width, height, center, angle, corners };
}
/** Whether `p` lies on the text block itself or within `ring` around it (rotation zone). */
export function hitText(o: TextOptions, text: string, at: Point, p: Point, slack: number, ring: number): "body" | "rotate" | null {
  const f = textFrame(o, text, at), q = rotate(p, f.center, -f.angle);
  const x = Math.abs(q.x - f.center.x) - f.width / 2, y = Math.abs(q.y - f.center.y) - f.height / 2;
  return x <= slack && y <= slack ? "body" : x <= ring && y <= ring ? "rotate" : null;
}
const padding = (o: TextOptions) => Math.ceil((o.outline ? o.outlineWidth : 0) + o.size * 0.3);
/** Area covered by the text including outline, glyph overhang and rotation. */
export function textBounds(o: TextOptions, text: string, at: Point) {
  const f = textFrame(o, text, at), pad = padding(o) * Math.SQRT2;
  const xs = f.corners.map((q) => q.x), ys = f.corners.map((q) => q.y);
  const x = Math.floor(Math.min(...xs) - pad), y = Math.floor(Math.min(...ys) - pad);
  return { x, y, width: Math.ceil(Math.max(...xs) + pad) - x, height: Math.ceil(Math.max(...ys) + pad) - y };
}
type Paint = { color: string; alpha: number };
/** Draws the text block at `at`: outline first, fill on top, each with its own alpha. */
export function drawText(target: CanvasRenderingContext2D, o: TextOptions, text: string, at: Point, fill: Paint, outline: Paint) {
  if (!text) return;
  const { lines, widths, width } = measureText(o, text), frame = textFrame(o, text, at), pad = padding(o);
  const scratch = document.createElement("canvas");
  scratch.width = Math.ceil(frame.width + pad * 2);
  scratch.height = Math.ceil(frame.height + pad * 2);
  const ctx = scratch.getContext("2d", { willReadFrequently: o.antialias !== "smooth" })!;
  const underline = Math.max(1, o.size * 0.06);
  const pass = (kind: "fill" | "stroke", paint: Paint) => {
    ctx.clearRect(0, 0, scratch.width, scratch.height);
    ctx.font = fontString(o);
    ctx.letterSpacing = `${o.spacing}px`;
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = o.outlineWidth * 2;
    ctx.fillStyle = ctx.strokeStyle = paint.color;
    lines.forEach((line, i) => {
      const x = pad + (o.align === "center" ? (width - widths[i]) / 2 : o.align === "right" ? width - widths[i] : 0);
      const y = pad + (i + 0.5) * lineHeight(o);
      if (kind === "fill") ctx.fillText(line, x, y);
      else ctx.strokeText(line, x, y);
      if (o.underline && widths[i]) {
        if (kind === "fill") ctx.fillRect(x, y + o.size * 0.32, widths[i], underline);
        else ctx.strokeRect(x, y + o.size * 0.32, widths[i], underline);
      }
    });
    if (o.antialias !== "smooth") {
      const image = ctx.getImageData(0, 0, scratch.width, scratch.height), d = image.data;
      for (let i = 3; i < d.length; i += 4)
        d[i] = o.antialias === "none" ? (d[i] >= 128 ? 255 : 0) : Math.max(0, Math.min(255, (d[i] - 64) * 2));
      ctx.putImageData(image, 0, 0);
    }
    target.save();
    target.globalAlpha = paint.alpha;
    // Rotating hard-edged text with smoothing would bring the soft edges back.
    target.imageSmoothingEnabled = o.antialias !== "none";
    target.translate(frame.center.x, frame.center.y);
    target.rotate(frame.angle);
    target.drawImage(scratch, -frame.width / 2 - pad, -frame.height / 2 - pad);
    target.restore();
  };
  if (o.outline) pass("stroke", outline);
  pass("fill", fill);
}
