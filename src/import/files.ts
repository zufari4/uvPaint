import { canvas, context } from "../core/canvas";
export async function pickFile(kind: "model" | "image" | "project") {
  if (window.desktop) return window.desktop.openFile(kind);
  return new Promise<{ name: string; bytes: Uint8Array; handle?: string } | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept =
      kind === "model" ? ".glb" : kind === "project" ? ".uvpaint" : "image/png,image/jpeg,image/webp,image/bmp";
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(
        file
          ? { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }
          : null,
      );
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
export async function decodeImage(bytes: Uint8Array) {
  const blob = new Blob([new Uint8Array(bytes)]);
  const bitmap = await createImageBitmap(blob, {
    imageOrientation: "from-image",
    premultiplyAlpha: "default",
    colorSpaceConversion: "default",
  });
  try {
    const c = canvas(bitmap.width, bitmap.height);
    context(c).drawImage(bitmap, 0, 0);
    return c;
  } finally {
    bitmap.close();
  }
}
