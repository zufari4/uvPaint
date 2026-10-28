import * as THREE from "three";
import type { MaterialSlot, TextureDocument } from "../types";
export function syncMaterial(
  slot: MaterialSlot,
  doc: TextureDocument,
  output?: HTMLCanvasElement,
) {
  const source =
    doc.sourceIndex === undefined
      ? slot.original.map
      : slot.sourceTextures[doc.sourceIndex]?.texture;
  slot.texture.wrapS = source?.wrapS ?? THREE.ClampToEdgeWrapping;
  slot.texture.wrapT = source?.wrapT ?? THREE.ClampToEdgeWrapping;
  slot.texture.offset.copy(source?.offset ?? new THREE.Vector2());
  slot.texture.repeat.copy(source?.repeat ?? new THREE.Vector2(1, 1));
  slot.texture.center.copy(source?.center ?? new THREE.Vector2());
  slot.texture.rotation = source?.rotation ?? 0;
  const channel = doc.uvSet === "uv" ? 0 : Number(doc.uvSet.slice(2));
  let recompile = slot.texture.channel !== channel;
  if (output) {
    if (
      slot.texture.image.width !== output.width ||
      slot.texture.image.height !== output.height
    ) {
      const previous = slot.texture;
      slot.texture = previous.clone();
      slot.texture.image = output;
      previous.dispose();
      slot.preview.map = slot.studio.map = slot.texture;
      recompile = true;
    } else slot.texture.image = output;
    slot.texture.needsUpdate = true;
  }
  slot.texture.channel = channel;
  slot.texture.updateMatrix();
  for (const material of [slot.preview, slot.studio]) {
    const mode = doc.alphaMode ?? "BLEND",
      blend = mode === "BLEND",
      cutoff = mode === "MASK" ? (doc.alphaCutoff ?? 0.5) : 0;
    const changed =
      material.transparent !== blend || material.alphaTest > 0 !== cutoff > 0;
    material.transparent = blend;
    material.alphaTest = cutoff;
    material.depthWrite = !blend;
    if (recompile || changed) material.needsUpdate = true;
  }
}
