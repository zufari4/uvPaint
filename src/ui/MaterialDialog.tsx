import { useState } from "react";
import { X } from "lucide-react";
import { useEditor } from "./hooks";
import { Button } from "./Button";
import type { AlphaMode } from "../types";
export function MaterialDialog({ close }: { close: () => void }) {
  const e = useEditor(),
    d = e.doc!,
    slot = e.model?.slots.find((s) => s.id === d.id);
  const first = slot?.sourceTextures.findIndex((s) => s.usage === "AO") ?? 0;
  const [index, setIndex] = useState(Math.max(0, first)),
    [uv, setUV] = useState(
      slot?.sourceTextures[Math.max(0, first)]?.uvSet ?? d.uvSet,
    );
  return (
    <div className="modal-backdrop">
      <div className="modal material-modal">
        <div className="modal-title">
          <h2>{d.name} · Material</h2>
          <Button title="Close material settings" onClick={close}>
            <X size={18} />
          </Button>
        </div>
        <p>
          {e.model?.slots.length ?? 1} material(s) in this model. Image textures
          and UV maps are inputs of a material, not separate materials.
        </p>
        <div className="material-alpha">
          <label>
            Alpha mode{" "}
            <select
              aria-label="Material alpha mode"
              value={d.alphaMode ?? "BLEND"}
              onChange={(ev) =>
                e.change("Material alpha mode", (doc) => {
                  doc.alphaMode = ev.target.value as AlphaMode;
                })
              }
            >
              <option value="OPAQUE">Opaque · ignore alpha in preview</option>
              <option value="MASK">Cutout · alpha threshold</option>
              <option value="BLEND">Blend · smooth transparency</option>
            </select>
          </label>
          {d.alphaMode === "MASK" && (
            <label>
              Threshold{" "}
              <input
                aria-label="Alpha cutoff"
                type="number"
                min="0"
                max="1"
                step=".05"
                value={d.alphaCutoff ?? 0.5}
                onChange={(ev) =>
                  e.change("Alpha cutoff", (doc) => {
                    doc.alphaCutoff = Math.min(
                      1,
                      Math.max(0, +ev.target.value),
                    );
                  })
                }
              />
            </label>
          )}
        </div>
        <small>
          Imported alpha mode is preserved. PNG always contains the layer RGBA
          pixels; preview alpha mode is a material setting.
        </small>
        {slot && (
          <>
            <h3>Embedded textures</h3>
            <div className="source-textures">
              {slot.sourceTextures.map((source, i) => (
                <div key={i}>
                  <strong>{source.usage}</strong>
                  <span>{source.name}</span>
                  <small>{slot.uvLabels[source.uvSet] ?? source.uvSet}</small>
                </div>
              ))}
            </div>
            <h3>Transfer alpha between UV maps</h3>
            <p>
              If color and transparency used different UV maps before GLB
              export, reproject alpha from an embedded texture onto the active
              layer's UV layout.
            </p>
            <div className="alpha-transfer">
              <select
                aria-label="Alpha source texture"
                value={index}
                onChange={(ev) => {
                  const next = +ev.target.value;
                  setIndex(next);
                  setUV(slot.sourceTextures[next].uvSet);
                }}
              >
                {slot.sourceTextures.map((source, i) => (
                  <option value={i} key={i}>
                    {source.name} · alpha
                  </option>
                ))}
              </select>
              <select
                aria-label="Alpha source UV map"
                value={uv}
                onChange={(ev) => setUV(ev.target.value)}
              >
                {slot.uvSets.map((set) => (
                  <option value={set} key={set}>
                    {d.uvNames?.[set] || slot.uvLabels[set]}
                  </option>
                ))}
              </select>
            </div>
            <small>
              Destination: {d.uvNames?.[d.uvSet] || slot.uvLabels[d.uvSet]}.
              Replaces the active layer's alpha, preserves its RGB and is
              undoable. No AO shading is applied. Overlapping destination
              islands may not represent different source alpha values.
            </small>
            <Button
              className="primary"
              disabled={!e.layer || !slot.sourceTextures.length}
              title="Transfer alpha to active layer"
              onClick={() =>
                void e.run(async () => {
                  e.transferMaterialAlpha(index, uv);
                  close();
                })
              }
            >
              Transfer alpha to active layer
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
