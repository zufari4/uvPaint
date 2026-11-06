import type { Island, Layer, ModelAsset, Point, TextureDocument, Tool } from "../types";
import { toPNG } from "./canvas";
import { decodeImage } from "../import/files";
import { disposeModel, loadGLB, type ModelProgress } from "../import/model";
import { demoModel } from "../import/demo";
import { sourceGeometry } from "../render/mesh-source";
import { guideEdges } from "../tools/uv-guides";
import { snapshot } from "./history";

const magic = new TextEncoder().encode("UVPAINT1");
type Asset = { kind: "png"; width: number; height: number } | { kind: "glb" };
type SavedLayer = Omit<Layer, "canvas" | "uvMask" | "placement"> & {
  canvas: number; uvMask: number | null;
  placement?: { source: number; rest: number; points: Point[]; kind: "free" | "perspective" | "mesh" };
};
type SavedDocument = Omit<TextureDocument, "layers" | "selection"> & { layers: SavedLayer[]; selection: number | null };
export type ProjectPaint = { tool: Tool; color: string; backgroundColor: string; brushSize: number; brushOpacity: number; tolerance: number; contiguous: boolean };
export type ProjectState = {
  model: ModelAsset | null;
  documents: TextureDocument[];
  // One current texture per material; activeDocument chooses the active material too.
  openDocuments: number[];
  activeDocument: number;
  hiddenFaces: Set<string>;
  previewMode: "studio" | "unlit";
  previewEdges: boolean;
  paint: ProjectPaint;
};
type Manifest = {
  format: "UV Paint project"; version: 1; assets: Asset[];
  model: { kind: "glb" | "sample"; name: string; asset: number | null; meshes: string[]; materials: string[]; visible: boolean[]; sourcePath?: string } | null;
  documents: SavedDocument[]; openDocuments: number[]; activeDocument: number;
  hiddenFaces: string[]; previewMode: "studio" | "unlit"; previewEdges: boolean; paint: ProjectPaint;
};

export async function encodeProject(state: ProjectState): Promise<Uint8Array> {
  // Capture metadata before PNG encoding yields; pixel buffers are immutable
  // between editor operations and can be shared without another full copy.
  const savedDocuments = state.documents.map(snapshot);
  const assets: Asset[] = [], chunks: Uint8Array[] = [], images = new Map<HTMLCanvasElement, number>();
  const image = async (c: HTMLCanvasElement | null | undefined): Promise<number | null> => {
    if (!c) return null;
    const cached = images.get(c); if (cached !== undefined) return cached;
    const id = assets.length;
    assets.push({ kind: "png", width: c.width, height: c.height }); images.set(c, id);
    chunks.push(new Uint8Array(await (await toPNG(c)).arrayBuffer()));
    return id;
  };
  let model: Manifest["model"] = null;
  if (state.model) {
    const source = state.model.source;
    if (!source) throw new Error("This model has no saved source. Import its GLB before saving a project.");
    model = { kind: source.kind, name: state.model.name, asset: null,
      meshes: state.model.parts.map(p => p.uuid), materials: state.model.slots.map(s => s.id), visible: state.model.parts.map(p => p.visible) };
    if (source.kind === "glb") { model.sourcePath = source.path;model.asset = assets.length; assets.push({ kind: "glb" });chunks.push(source.bytes); }
  }
  const documents: SavedDocument[] = [];
  for (const doc of savedDocuments) {
    const layers: SavedLayer[] = [];
    for (const layer of doc.layers) {
      const placement = layer.placement?.rendered === layer.canvas ? layer.placement : undefined;
      layers.push({ id: layer.id, name: layer.name, visible: layer.visible, opacity: layer.opacity, blend: layer.blend,
        canvas: (await image(layer.canvas))!, uvMask: await image(layer.uvMask), uvBinding: layer.uvBinding,
        placement: placement ? { source: (await image(placement.source))!, rest: (await image(placement.rest))!,
          kind: placement.kind, points: placement.points.map(p => ({ ...p })) } : undefined });
    }
    documents.push({ ...doc, layers, selectedIslands: [...doc.selectedIslands], uvNames: { ...doc.uvNames }, selection: await image(doc.selection) });
  }
  const manifest: Manifest = { format: "UV Paint project", version: 1, assets, model, documents,
    openDocuments: [...state.openDocuments], activeDocument: state.activeDocument, hiddenFaces: [...state.hiddenFaces],
    previewMode: state.previewMode, previewEdges: state.previewEdges, paint: { ...state.paint } };
  const json = new TextEncoder().encode(JSON.stringify(manifest));
  const length = 16 + json.length + chunks.reduce((sum, chunk) => sum + 4 + chunk.length, 0);
  if (json.length > 64 * 1024 * 1024 || length > 0xffffffff) throw new Error("The project exceeds the file format size limit.");
  const out = new Uint8Array(length), view = new DataView(out.buffer);
  out.set(magic);view.setUint32(8, json.length, true);view.setUint32(12, chunks.length, true);out.set(json, 16);
  let offset = 16 + json.length;
  for (const chunk of chunks) { view.setUint32(offset, chunk.length, true);offset += 4;out.set(chunk, offset);offset += chunk.length; }
  return out;
}

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid uvPaint project: ${message}`);
}
const record = (v: unknown) => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string";
const int = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const uv = (v: unknown): v is string => text(v) && /^uv\d*$/.test(v);
const point = (p: unknown): p is Point => record(p) && finite((p as Point).x) && finite((p as Point).y);

export async function decodeProject(bytes: Uint8Array, checkSize: (w: number, h: number) => Promise<void>, progress?: ModelProgress): Promise<ProjectState> {
  requireValue(bytes.length >= 16 && magic.every((v, i) => bytes[i] === v), "unrecognized file header.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(8, true), count = view.getUint32(12, true);
  requireValue(jsonLength <= 64 * 1024 * 1024 && jsonLength <= bytes.length - 16 && count <= (bytes.length - 16 - jsonLength) / 4, "truncated header.");
  let manifest: Manifest;
  try { manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(16, 16 + jsonLength))); }
  catch { throw new Error("Invalid uvPaint project: unreadable manifest."); }
  requireValue(record(manifest) && manifest.format === "UV Paint project" && manifest.version === 1, "unsupported project version.");
  requireValue(Array.isArray(manifest.assets) && manifest.assets.length === count && Array.isArray(manifest.documents) && manifest.documents.length > 0, "missing assets or documents.");
  const chunks: Uint8Array[] = []; let offset = 16 + jsonLength;
  for (let i = 0; i < count; i++) {
    requireValue(offset + 4 <= bytes.length, "missing asset length.");
    const length = view.getUint32(offset, true);offset += 4;
    requireValue(length > 0 && length <= bytes.length - offset, "truncated asset.");
    chunks.push(bytes.subarray(offset, offset + length));offset += length;
  }
  requireValue(offset === bytes.length, "unexpected trailing data.");
  let memory = 0;
  for (const [i, asset] of manifest.assets.entries()) {
    requireValue(record(asset) && (asset.kind === "png" || asset.kind === "glb"), "unknown asset type.");
    if (asset.kind === "png") {
      const data = chunks[i];
      requireValue(int(asset.width) && asset.width > 0 && int(asset.height) && asset.height > 0 && data.length >= 33,
        "invalid image dimensions.");
      requireValue([137,80,78,71,13,10,26,10].every((b,j) => data[j] === b) &&
        new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(16) === asset.width &&
        new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(20) === asset.height, "image header mismatch.");
      memory += asset.width * asset.height * 4;
    }
  }
  const available = await window.desktop?.memory();
  requireValue(Number.isSafeInteger(memory) && (!available || memory * 2 < available * .8), "not enough memory for the project images.");
  const decoded = new Map<number, HTMLCanvasElement>();
  const images = manifest.assets.filter(a => a.kind === "png").length;
  const image = async (id: number | null, w?: number, h?: number) => {
    if (id === null) return null;
    requireValue(int(id) && id < count && manifest.assets[id].kind === "png", "invalid image reference.");
    const asset = manifest.assets[id] as Extract<Asset, {kind: "png"}>;
    if (w !== undefined) requireValue(asset.width === w && asset.height === h, "layer image dimensions differ from the document.");
    if (!decoded.has(id)) {
      await checkSize(asset.width, asset.height);
      await progress?.("Decoding layer images", `${decoded.size + 1} / ${images}`);
      const pixels = await decodeImage(chunks[id]);
      requireValue(pixels.width === asset.width && pixels.height === asset.height, "decoded image size mismatch.");
      decoded.set(id, pixels);
    }
    return decoded.get(id)!;
  };
  let model: ModelAsset | null = null;
  try {
    const meshes = new Map<string, string>(), materials = new Map<string, string>(), faceCounts = new Map<string, number>();
    if (manifest.model !== null) {
      const saved = manifest.model;
      requireValue(record(saved) && ["glb", "sample"].includes(saved.kind) && text(saved.name) &&
        Array.isArray(saved.meshes) && saved.meshes.every(text) && new Set(saved.meshes).size === saved.meshes.length &&
        Array.isArray(saved.materials) && saved.materials.every(text) && new Set(saved.materials).size === saved.materials.length &&
        Array.isArray(saved.visible) && saved.visible.every(v => typeof v === "boolean"), "invalid model metadata.");
      if (saved.kind === "glb") {
        requireValue(int(saved.asset) && saved.asset < count && manifest.assets[saved.asset].kind === "glb", "missing embedded model.");
        model = (await loadGLB(new Uint8Array(chunks[saved.asset]).buffer, saved.name, checkSize, progress)).model;
        requireValue(saved.sourcePath === undefined || text(saved.sourcePath), "invalid source GLB path.");
        if (model.source?.kind === "glb") model.source.path = saved.sourcePath;
      } else model = (await demoModel(checkSize)).model;
      requireValue(model.parts.length === saved.meshes.length && model.slots.length === saved.materials.length && saved.visible.length === model.parts.length, "model structure mismatch.");
      model.name = saved.name;
      model.parts.forEach((part, i) => {
        meshes.set(saved.meshes[i], part.uuid);part.visible = saved.visible[i];
        const g = sourceGeometry(part);faceCounts.set(part.uuid, (g.index?.count ?? g.getAttribute("position").count) / 3);
      });
      model.slots.forEach((slot, i) => materials.set(saved.materials[i], slot.id));
    }
    const face = (meshId: string, triangle: number) => {
      const mapped = meshes.get(meshId);
      requireValue(mapped && int(triangle) && triangle < faceCounts.get(mapped)!, "unknown model face.");
      return mapped;
    };
    const island = (value: Island): Island => {
      requireValue(record(value) && int(value.id) && Array.isArray(value.triangles) && value.triangles.every(t => Array.isArray(t) && t.length === 3 && t.every(point)), "invalid UV island.");
      const result: Island = { id: value.id, triangles: value.triangles };
      if (value.faces !== undefined) {
        requireValue(Array.isArray(value.faces) && value.faces.length === value.triangles.length, "invalid island face links.");
        result.faces = value.faces.map(f => {
          requireValue(record(f) && text(f.meshId) && Array.isArray(f.vertices) && f.vertices.length === 3 && f.vertices.every(text) &&
            Array.isArray(f.normal) && f.normal.length === 3 && f.normal.every(finite), "invalid face metadata.");
          const meshId = face(f.meshId, f.triangle);
          return { ...f, meshId, vertices: f.vertices.map(key => {
            requireValue(key.startsWith(`${f.meshId}:`), "invalid UV vertex link.");
            return meshId + key.slice(f.meshId.length);
          }) };
        });
      }
      guideEdges(result);return result;
    };
    const documents: TextureDocument[] = [];
    const documentKeys = new Set<string>();
    for (const saved of manifest.documents) {
      requireValue(record(saved) && text(saved.id) && text(saved.name) && int(saved.width) && saved.width > 0 && int(saved.height) && saved.height > 0 &&
        uv(saved.uvSet) && Array.isArray(saved.layers) && Array.isArray(saved.islands) && Array.isArray(saved.selectedIslands) &&
        typeof saved.restrict === "boolean", "invalid texture document.");
      const id = model ? materials.get(saved.id) : saved.id;requireValue(id, "unknown material.");
      requireValue(saved.sourceIndex === undefined || int(saved.sourceIndex), "invalid source texture index.");
      const key = `${id}:${saved.sourceIndex ?? -1}`;
      requireValue(!documentKeys.has(key), "duplicate texture document.");documentKeys.add(key);
      if (model) {
        const slot = model.slots.find(s => s.id === id)!;
        requireValue(slot.documents.some(d => d.sourceIndex === saved.sourceIndex && d.textureUsage === saved.textureUsage), "unknown texture document.");
      }
      requireValue(saved.alphaMode === undefined || ["OPAQUE", "MASK", "BLEND"].includes(saved.alphaMode), "invalid alpha mode.");
      requireValue(saved.alphaCutoff === undefined || (finite(saved.alphaCutoff) && saved.alphaCutoff >= 0 && saved.alphaCutoff <= 1), "invalid alpha cutoff.");
      requireValue(saved.textureUsage === undefined || text(saved.textureUsage), "invalid texture usage.");
      requireValue(saved.textureName === undefined || text(saved.textureName), "invalid texture name.");
      requireValue(saved.uvNames === undefined || (record(saved.uvNames) && Object.entries(saved.uvNames).every(([k,v]) => uv(k) && text(v))), "invalid UV aliases.");
      await checkSize(saved.width, saved.height);
      const islands = saved.islands.map(island), ids = new Set(islands.map(i => i.id));
      requireValue(ids.size === islands.length && saved.selectedIslands.every(i => ids.has(i)), "invalid island selection.");
      const layers: Layer[] = [];
      for (const l of saved.layers) {
        requireValue(record(l) && text(l.id) && text(l.name) && typeof l.visible === "boolean" && finite(l.opacity) && l.opacity >= 0 && l.opacity <= 1 &&
          ["source-over", "multiply", "screen", "overlay", "darken", "lighten"].includes(l.blend), "invalid layer.");
        const pixels = await image(l.canvas, saved.width, saved.height);requireValue(pixels, "layer has no pixels.");
        const layer: Layer = { id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend,
          canvas: pixels, uvMask: await image(l.uvMask, saved.width, saved.height) };
        if (l.uvBinding !== undefined) {
          requireValue(record(l.uvBinding) && uv(l.uvBinding.uvSet) && layer.uvMask, "invalid layer UV binding.");
          layer.uvBinding = { uvSet: l.uvBinding.uvSet, island: island(l.uvBinding.island) };
        }
        if (l.placement !== undefined) {
          const p = l.placement;
          requireValue(record(p) && ["free", "perspective", "mesh"].includes(p.kind) && Array.isArray(p.points) &&
            p.points.length === (p.kind === "mesh" ? 16 : 4) && p.points.every(point), "invalid layer placement.");
          const source = await image(p.source), rest = await image(p.rest, saved.width, saved.height);
          requireValue(source && rest, "placement has no source.");
          layer.placement = { source, rest, kind: p.kind, points: p.points, rendered: pixels };
        }
        layers.push(layer);
      }
      requireValue(new Set(layers.map(l => l.id)).size === layers.length && text(saved.activeId) &&
        (layers.length ? layers.some(l => l.id === saved.activeId) : saved.activeId === ""), "invalid active layer.");
      documents.push({ id, name: saved.name, width: saved.width, height: saved.height, layers, activeId: saved.activeId,
        selection: await image(saved.selection, saved.width, saved.height), uvSet: saved.uvSet, islands, selectedIslands: saved.selectedIslands,
        restrict: false, alphaMode: saved.alphaMode, alphaCutoff: saved.alphaCutoff, uvNames: saved.uvNames,
        sourceIndex: saved.sourceIndex, textureUsage: saved.textureUsage, textureName: saved.textureName });
    }
    requireValue(Array.isArray(manifest.openDocuments) && manifest.openDocuments.every(i => int(i) && i < documents.length) &&
      new Set(manifest.openDocuments.map(i => documents[i].id)).size === manifest.openDocuments.length &&
      new Set(documents.map(d => d.id)).size === manifest.openDocuments.length &&
      int(manifest.activeDocument) && manifest.openDocuments.includes(manifest.activeDocument), "invalid active document.");
    if (model) for (const slot of model.slots) {
      const docs = documents.filter(d => d.id === slot.id);
      requireValue(docs.length === slot.documents.length, "missing material textures.");slot.documents = docs;
    }
    requireValue(Array.isArray(manifest.hiddenFaces) && manifest.hiddenFaces.every(text), "invalid hidden faces.");
    const hiddenFaces = new Set(manifest.hiddenFaces.map(key => {
      const i = key.lastIndexOf(":"), triangle = Number(key.slice(i + 1));
      requireValue(i > 0 && /^\d+$/.test(key.slice(i + 1)), "invalid hidden face key.");
      return `${face(key.slice(0, i), triangle)}:${triangle}`;
    }));
    requireValue(["studio", "unlit"].includes(manifest.previewMode) && typeof manifest.previewEdges === "boolean", "invalid preview settings.");
    const paint = manifest.paint;
    requireValue(record(paint) && ["move", "rect", "lasso", "polygon", "wand", "brush", "line", "eraser", "fill", "eyedropper", "clone", "island", "pan"].includes(paint.tool) &&
      text(paint.color) && /^#[0-9a-f]{6}$/i.test(paint.color) && text(paint.backgroundColor) && /^#[0-9a-f]{6}$/i.test(paint.backgroundColor) &&
      finite(paint.brushSize) && paint.brushSize >= 1 && finite(paint.brushOpacity) && paint.brushOpacity >= 0 && paint.brushOpacity <= 1 &&
      finite(paint.tolerance) && paint.tolerance >= 0 && paint.tolerance <= 255 && typeof paint.contiguous === "boolean", "invalid paint settings.");
    return { model, documents, openDocuments: manifest.openDocuments, activeDocument: manifest.activeDocument, hiddenFaces,
      previewMode: "studio", previewEdges: manifest.previewEdges, paint };
  } catch (error) { if (model) disposeModel(model);throw error; }
}
