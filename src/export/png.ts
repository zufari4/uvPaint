import type { TextureDocument } from "../types";
import { composite } from "../render/composite";
import { toPNG } from "../core/canvas";
export async function exportPNG(doc: TextureDocument) {
  const blob = await toPNG(composite(doc));
  const name = `${doc.name.replace(/[^\w\- ]/g, "_")}_BaseColor.png`;
  if (window.desktop)
    return window.desktop.savePNG(
      new Uint8Array(await blob.arrayBuffer()),
      name,
    );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}
