import { useEffect, useRef } from "react";
import {
  Layers,
  Eye,
  EyeOff,
  Plus,
  Copy,
  Trash2,
  ArrowUp,
  ArrowDown,
  Merge,
  ImagePlus,
} from "lucide-react";
import type { Layer, Blend } from "../types";
import { useEditor } from "./hooks";
import { Button } from "./Button";
function Thumbnail({ layer }: { layer: Layer }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!,
      x = c.getContext("2d")!;
    x.clearRect(0, 0, 44, 36);
    const s = Math.min(44 / layer.canvas.width, 36 / layer.canvas.height);
    x.drawImage(
      layer.canvas,
      (44 - layer.canvas.width * s) / 2,
      (36 - layer.canvas.height * s) / 2,
      layer.canvas.width * s,
      layer.canvas.height * s,
    );
  }, [layer.canvas]);
  return <canvas className="layer-thumb" ref={ref} width="44" height="36" />;
}
export function LayersPanel() {
  const e = useEditor(),
    d = e.doc,
    l = e.layer;
  return (
    <div className="layers-panel">
      <div className="section-heading">
        <span>
          <Layers size={14} /> LAYERS <b>{d?.layers.length ?? 0}</b>
        </span>
        <Button
          title="Import image layer"
          disabled={!d}
          onClick={() => void e.run(() => e.openImage())}
        >
          <ImagePlus size={15} />
        </Button>
      </div>
      <div className="layer-properties">
        <select
          aria-label="Layer blend mode"
          disabled={!l}
          value={l?.blend ?? "source-over"}
          onChange={(ev) =>
            l && e.updateLayer(l.id, { blend: ev.target.value as Blend })
          }
        >
          {[
            ["source-over", "Normal"],
            ["multiply", "Multiply"],
            ["screen", "Screen"],
            ["overlay", "Overlay"],
            ["darken", "Darken"],
            ["lighten", "Lighten"],
          ].map(([value, name]) => (
            <option key={value} value={value}>
              {name}
            </option>
          ))}
        </select>
        <label>
          Opacity{" "}
          <input
            aria-label="Layer opacity"
            type="number"
            min="0"
            max="100"
            disabled={!l}
            value={Math.round((l?.opacity ?? 1) * 100)}
            onChange={(ev) =>
              l &&
              e.updateLayer(l.id, {
                opacity: Math.max(
                  0,
                  Math.min(1, Number(ev.target.value) / 100),
                ),
              })
            }
          />
          <span>%</span>
        </label>
      </div>
      <div className="layer-list">
        {d?.layers
          .slice()
          .reverse()
          .map((layer) => (
            <div
              key={layer.id}
              className={`layer-row ${d.activeId === layer.id ? "selected" : ""}`}
              onClick={() => e.selectLayer(layer.id)}
            >
              <Button
                title={layer.visible ? "Hide layer" : "Show layer"}
                onClick={(ev) => {
                  ev.stopPropagation();
                  e.updateLayer(layer.id, { visible: !layer.visible });
                }}
              >
                {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
              </Button>
              <Thumbnail layer={layer} />
              <input
                aria-label={`Layer name ${layer.name}`}
                key={layer.name}
                defaultValue={layer.name}
                onClick={(ev) => ev.stopPropagation()}
                onFocus={() => e.selectLayer(layer.id)}
                onBlur={(ev) => {
                  if (ev.target.value !== layer.name)
                    e.updateLayer(layer.id, {
                      name: ev.target.value || "Layer",
                    });
                }}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter") ev.currentTarget.blur();
                }}
              />
              <small>{Math.round(layer.opacity * 100)}%</small>
            </div>
          ))}
        {!d?.layers.length && (
          <div className="empty-layers">Images and fragments appear here.</div>
        )}
      </div>
      <div className="layer-footer">
        <Button
          title="New empty layer"
          disabled={!d}
          onClick={() => e.addEmpty()}
        >
          <Plus size={15} />
        </Button>
        <Button
          title="Duplicate layer"
          disabled={!l}
          onClick={() => e.duplicateLayer()}
        >
          <Copy size={14} />
        </Button>
        <Button
          title="Move layer up"
          disabled={!l}
          onClick={() => e.reorder(1)}
        >
          <ArrowUp size={14} />
        </Button>
        <Button
          title="Move layer down"
          disabled={!l}
          onClick={() => e.reorder(-1)}
        >
          <ArrowDown size={14} />
        </Button>
        <Button
          title="Merge down"
          disabled={!l || d?.layers[0] === l}
          onClick={() => e.mergeDown()}
        >
          <Merge size={15} />
        </Button>
        <div className="spacer" />
        <Button
          title="Delete layer"
          disabled={!l}
          onClick={() => e.deleteLayer()}
        >
          <Trash2 size={14} />
        </Button>
      </div>
    </div>
  );
}
