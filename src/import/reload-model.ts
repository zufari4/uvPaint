import type { Island, MaterialSlot, ModelAsset, TextureDocument } from "../types";
import { sourceGeometry } from "../render/mesh-source";
import { extractIslands, islandMask } from "../tools/uv";
import { faceKey } from "../tools/uv-guides";

const incompatible = (reason: string): never => { throw new Error(`Cannot reload GLB without losing existing edits: ${reason}. The current model was kept.`); };
function match<T extends { name: string }>(old: T, index: number, candidates: T[], used: Set<T>): T {
  const named = candidates.filter(item => item.name === old.name && !used.has(item));
  const found = named.length === 1 ? named[0]
    : named.includes(candidates[index]) ? candidates[index]
    : candidates.length === 1 && !used.has(candidates[0]) ? candidates[0] : undefined;
  if (!found) return incompatible(`cannot identify ${old.name || "an unnamed object/material"}`);
  used.add(found);return found;
}
const islandKey = (island: Island) => island.faces?.map(faceKey).sort().join("|");

/** Prepare a reload transaction. Only the newly loaded model is mutated here. */
export function prepareReload(old: ModelAsset, next: ModelAsset) {
  const partsUsed = new Set<typeof next.parts[number]>();
  for (const [index, part] of old.parts.entries()) {
    const replacement = match(part, index, next.parts, partsUsed);
    const a = sourceGeometry(part), b = sourceGeometry(replacement);
    if (a.getAttribute("position").count !== b.getAttribute("position").count ||
      !!a.index !== !!b.index || a.index?.count !== b.index?.count ||
      (a.index && b.index && Array.from(a.index.array).some((value, i) => value !== b.index!.array[i])))
      incompatible(`topology of ${part.name || "a mesh"} changed; existing face bindings cannot be matched safely`);
    replacement.uuid = part.uuid;
    replacement.visible = part.visible;
  }
  const slotsUsed = new Set<MaterialSlot>(), slots = new Map<string, MaterialSlot>();
  for (const [index, slot] of old.slots.entries()) {
    const replacement = match(slot, index, next.slots, slotsUsed);
    replacement.id = slot.id;
    replacement.preview.userData.slotId = slot.id;
    replacement.studio.userData.slotId = slot.id;
    for (const doc of replacement.documents) doc.id = slot.id;
    slots.set(slot.id, replacement);
  }
  // Scene identity lets the viewport retain its camera on this replacement.
  next.scene.uuid = old.scene.uuid;
  const layouts = new Map<string, Island[]>();
  const layout = (slot: MaterialSlot, uvSet: string, sourceIndex?: number) => {
    if (!slot.uvSets.includes(uvSet) && slot.uvSets.length) incompatible(`UV map ${uvSet} is missing from ${slot.name}`);
    const key = `${slot.id}:${uvSet}:${sourceIndex ?? -1}`;
    let islands = layouts.get(key);
    if (!islands) {
      islands = extractIslands(next.scene, slot.id, uvSet, sourceIndex === undefined ? undefined : slot.sourceTextures[sourceIndex]?.texture);
      layouts.set(key, islands);
    }
    return islands;
  };
  for (const slot of next.slots) for (const doc of slot.documents)
    doc.islands = layout(slot, doc.uvSet, doc.sourceIndex);
  const documents = new WeakMap<TextureDocument, TextureDocument>();
  const migrate = (doc: TextureDocument): TextureDocument => {
    const cached = documents.get(doc);if (cached) return cached;
    const slot = slots.get(doc.id);
    if (!slot) return incompatible(`material ${doc.name} was removed`);
    const sourceIndex = doc.sourceIndex === undefined ? undefined
      : slot.sourceTextures.findIndex(source => source.usage === (doc.textureUsage ?? "Base Color"));
    if (sourceIndex === -1) incompatible(`texture channel ${doc.textureUsage ?? "Base Color"} was removed`);
    const islands = layout(slot, doc.uvSet, sourceIndex);
    const linked = (island: Island, uvSet: string) => {
      const key = islandKey(island);
      const found = key && layout(slot, uvSet, sourceIndex).find(candidate => islandKey(candidate) === key);
      if (!found) return incompatible(`a selected or linked UV island in ${doc.name} changed its face membership`);
      return found;
    };
    const result: TextureDocument = { ...doc, sourceIndex, islands,
      selectedIslands: doc.selectedIslands.map(id => {
        const island = doc.islands.find(item => item.id === id);
        return island ? linked(island, doc.uvSet).id : id;
      }),
      layers: doc.layers.map(layer => {
        if (!layer.uvBinding) return { ...layer };
        const island = linked(layer.uvBinding.island, layer.uvBinding.uvSet);
        const sameUV = JSON.stringify(island.triangles) === JSON.stringify(layer.uvBinding.island.triangles);
        return { ...layer, uvBinding: { ...layer.uvBinding, island },
          uvMask: sameUV ? layer.uvMask : islandMask({ ...doc, islands: [island], selectedIslands: [] }) };
      }),
    };
    documents.set(doc, result);return result;
  };
  return { migrate };
}
