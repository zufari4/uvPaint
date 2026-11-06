import type { TextureDocument } from "../types";
import { composite } from "../render/composite";
import { toPNG } from "../core/canvas";
import { padTexture } from "./padding";
export async function exportPNG(doc: TextureDocument) {
  const padded = padTexture(composite(doc), doc.islands);
  const blob = await toPNG(padded.canvas);
  const usage = (doc.textureUsage ?? "BaseColor").replace(/\s/g, "");
  const name = `${doc.name.replace(/[^\w\- ]/g, "_")}_${usage}.png`;
  const edge = { padding: padded.padding, radius: padded.radius };
  if (window.desktop) {
    const path = await window.desktop.savePNG(new Uint8Array(await blob.arrayBuffer()), name);
    return path ? { path, ...edge } : null;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { path: name, ...edge };
}
