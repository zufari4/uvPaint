import * as THREE from "three";
import { sourceGeometry } from "../render/mesh-source";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { ModelAsset, TextureDocument, MaterialSlot } from "../types";
import { canvas, context } from "../core/canvas";
import { extractIslands } from "../tools/uv";
import { syncMaterial } from "../render/material";
export async function loadGLB(
  bytes: ArrayBuffer,
  name: string,
  check: (w: number, h: number) => Promise<void>,
) {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (url.startsWith("blob:") || url.startsWith("data:")) return url;
    throw new Error(
      "Use a self-contained GLB with embedded textures and buffers. External resources are not loaded.",
    );
  });
  const loader = new GLTFLoader(manager);
  const gltf = await loader.parseAsync(bytes, "");
  const result = await prepareModel(gltf.scene, name, check);
  result.model.source = { kind: "glb", bytes: new Uint8Array(bytes.slice(0)) };
  return result;
}
export async function prepareModel(
  scene: THREE.Group,
  name: string,
  check: (w: number, h: number) => Promise<void>,
) {
  const slots: MaterialSlot[] = [],
    parts: THREE.Mesh[] = [],
    docs: TextureDocument[] = [];
  const seen = new Map<string, MaterialSlot>();
  const meshes: THREE.Mesh[] = [];
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh) meshes.push(o);
  });
  if (!meshes.length)
    throw new Error("This GLB contains no renderable meshes.");
  for (const mesh of meshes) {
    parts.push(mesh);
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    const replacements: THREE.Material[] = [];
    for (const base of materials) {
      const original = base as THREE.MeshStandardMaterial;
      let slot = seen.get(base.uuid);
      const sets = Object.keys(mesh.geometry.attributes)
        .filter((k) => /^uv\d*$/.test(k))
        .sort();
      if (!slot) {
        const img = original.map?.image as
          | { width: number; height: number }
          | undefined;
        const w = img?.width ?? 1024,
          h = img?.height ?? 1024;
        await check(w, h);
        const pixels = canvas(w, h);
        const ctx = context(pixels);
        if (img) ctx.drawImage(img as CanvasImageSource, 0, 0, w, h);
        const id = base.uuid;
        const texture = new THREE.CanvasTexture(pixels);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.flipY = false;
        texture.generateMipmaps = false;
        texture.minFilter = texture.magFilter = THREE.LinearFilter;
        if (original.map) {
          texture.wrapS = original.map.wrapS;
          texture.wrapT = original.map.wrapT;
          texture.offset.copy(original.map.offset);
          texture.repeat.copy(original.map.repeat);
          texture.center.copy(original.map.center);
          texture.rotation = original.map.rotation;
          texture.channel = original.map.channel;
        }
        const preview = new THREE.MeshBasicMaterial({
          map: texture,
          color: 0xffffff,
          transparent: original.transparent,
          side: original.side,
          depthWrite: !original.transparent,
          toneMapped: false,
          alphaTest: original.alphaTest,
        });
        preview.userData.slotId = id;
        const studio = new THREE.MeshStandardMaterial({
          map: texture,
          color: 0xffffff,
          roughness: 0.55,
          metalness: 0,
          side: original.side,
          transparent: original.transparent,
          alphaTest: original.alphaTest,
          depthWrite: !original.transparent,
        });
        studio.userData.slotId = id;
        const sourceTextures = [
          ["Base Color", original.map],
          ["AO", original.aoMap],
          ["Normal", original.normalMap],
          ["Roughness", original.roughnessMap],
          ["Metallic", original.metalnessMap],
          ["Emissive", original.emissiveMap],
        ].flatMap(([usage, t]) =>
          t instanceof THREE.Texture
            ? [
                {
                  name: t.name || String(usage),
                  usage: String(usage),
                  uvSet: t.channel ? `uv${t.channel}` : "uv",
                  texture: t,
                },
              ]
            : [],
        );
        const uvLabels = Object.fromEntries(
          sets.map((set) => [
            set,
            `${set === "uv" ? "UV 0" : `UV ${set.slice(2)}`} · ${
              sourceTextures
                .filter((t) => t.uvSet === set)
                .map((t) => t.usage)
                .join(", ") || "Unused"
            }`,
          ]),
        );
        slot = {
          id,
          name: base.name || `Material ${slots.length + 1}`,
          original,
          preview,
          studio,
          texture,
          uvSets: sets,
          sourceTextures,
          uvLabels,
          documents: [],
        };
        seen.set(id, slot);
        slots.push(slot);
        const layerId = crypto.randomUUID();
        docs.push({
          id,
          name: slot.name,
          width: w,
          height: h,
          layers: img
            ? [
                {
                  id: layerId,
                  name: "Original base color",
                  visible: true,
                  opacity: 1,
                  blend: "source-over",
                  canvas: pixels,
                },
              ]
            : [
                {
                  id: layerId,
                  name: "Empty canvas",
                  visible: true,
                  opacity: 1,
                  blend: "source-over",
                  canvas: pixels,
                },
              ],
          activeId: layerId,
          selection: null,
          uvSet: original.map?.channel ? `uv${original.map.channel}` : "uv",
          islands: [],
          selectedIslands: [],
          restrict: false,
          alphaMode: original.transparent
            ? "BLEND"
            : original.alphaTest > 0
              ? "MASK"
              : "OPAQUE",
          alphaCutoff: original.alphaTest || 0.5,
          uvNames: {},
          sourceIndex: original.map
            ? sourceTextures.findIndex((t) => t.usage === "Base Color")
            : undefined,
          textureUsage: "Base Color",
          textureName: original.map?.name || "Base Color",
        });
      } else slot.uvSets = [...new Set([...slot.uvSets, ...sets])].sort();
      replacements.push(slot.preview);
    }
    mesh.material = Array.isArray(mesh.material)
      ? replacements
      : replacements[0];
  }
  for (const doc of docs) {
    const slot = slots.find((s) => s.id === doc.id)!;
    if (!slot.uvSets.includes(doc.uvSet)) doc.uvSet = slot.uvSets[0] ?? "uv";
    doc.islands = extractIslands(scene, doc.id, doc.uvSet);
    doc.restrict = doc.islands.length > 0;
    syncMaterial(slot, doc);
    slot.documents.push(doc);
    for (const [sourceIndex, source] of slot.sourceTextures.entries()) {
      if (source.usage === "Base Color") continue;
      const image = source.texture.image as { width: number; height: number };
      await check(image.width, image.height);
      const pixels = canvas(image.width, image.height);
      context(pixels).drawImage(image as CanvasImageSource, 0, 0);
      const layerId = crypto.randomUUID();
      const islands = extractIslands(
        scene,
        doc.id,
        source.uvSet,
        source.texture,
      );
      slot.documents.push({
        id: doc.id,
        name: slot.name,
        width: image.width,
        height: image.height,
        layers: [
          {
            id: layerId,
            name: source.name,
            visible: true,
            opacity: 1,
            blend: "source-over",
            canvas: pixels,
          },
        ],
        activeId: layerId,
        selection: null,
        uvSet: source.uvSet,
        islands,
        selectedIslands: [],
        restrict: islands.length > 0,
        alphaMode: doc.alphaMode,
        alphaCutoff: doc.alphaCutoff,
        uvNames: {},
        sourceIndex,
        textureUsage: source.usage,
        textureName: source.name,
      });
    }
  }
  const model: ModelAsset = { name, scene, slots, parts };
  return { model, docs };
}
export function disposeModel(model: ModelAsset) {
  const textures = new Set<THREE.Texture>();
  for (const slot of model.slots) {
    for (const value of Object.values(slot.original))
      if (value instanceof THREE.Texture) textures.add(value);
    slot.texture.dispose();
    slot.preview.dispose();
    slot.studio.dispose();
    slot.original.dispose();
  }
  for (const t of textures) t.dispose();
  for (const part of model.parts) sourceGeometry(part).dispose();
}
