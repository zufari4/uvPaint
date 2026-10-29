import { useEffect, useRef, useState } from "react";
import type { HTMLAttributes } from "react";
import {
  Layers,
  Eye,
  EyeOff,
  Plus,
  Copy,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowDownToLine,
  ImagePlus,
  SquareMousePointer,
} from "lucide-react";
import type { Layer, Blend } from "../types";
import { useEditor } from "./hooks";
import { Button } from "./Button";
function Thumbnail({ layer, refresh }: { layer: Layer; refresh: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!,
      x = c.getContext("2d")!;
    x.clearRect(0, 0, 44, 36);
    const s = Math.max(44 / layer.canvas.width, 36 / layer.canvas.height);
    x.drawImage(
      layer.canvas,
      (44 - layer.canvas.width * s) / 2,
      (36 - layer.canvas.height * s) / 2,
      layer.canvas.width * s,
      layer.canvas.height * s,
    );
  }, [layer.canvas, refresh]);
  return <canvas className="layer-thumb" ref={ref} width="44" height="36" />;
}
export function LayersPanel({ headingProps }: { headingProps?: HTMLAttributes<HTMLDivElement> }) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const e = useEditor(),
    d = e.doc,
    l = e.layer;
  return (
    <div className="layers-panel">
      <div {...headingProps} className="section-heading layers-drag-heading">
        <span>
          <Layers size={14} /> LAYERS <b>{d?.layers.length ?? 0}</b>
        </span>
        <div className="mini-actions">
          <Button title="Merge down" disabled={!l || d?.layers[0] === l} onClick={() => e.mergeDown()}>
            <ArrowDownToLine size={15} />
          </Button>
        </div>
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
              onDoubleClick={ev => {
                if ((ev.target as HTMLElement).closest("button,input")) return;
                e.selectLayer(layer.id); setRenaming(layer.id);
              }}
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
              <Thumbnail layer={layer} refresh={e.transform ? 0 : e.pixelsRevision} />
              {renaming === layer.id ? <input
                aria-label={`Layer name ${layer.name}`}
                autoFocus
                defaultValue={layer.name}
                onClick={(ev) => ev.stopPropagation()}
                onFocus={ev => ev.currentTarget.select()}
                onBlur={(ev) => {
                  setRenaming(null);
                  const name = ev.target.value.trim() || "Layer";
                  if (name !== layer.name)
                    e.updateLayer(layer.id, {
                      name,
                    });
                }}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === "Escape") {
                    ev.preventDefault(); ev.stopPropagation();
                    if (ev.key === "Escape") ev.currentTarget.value = layer.name;
                    ev.currentTarget.blur();
                  }
                }}
              /> : <span className="layer-name" title="Double-click to rename" tabIndex={0}
                onKeyDown={ev => {
                  if (ev.key === "F2" || ev.key === "Enter") {
                    ev.preventDefault();ev.stopPropagation();e.selectLayer(layer.id);setRenaming(layer.id);
                  }
                }}>{layer.name}</span>}
              <small>{Math.round(layer.opacity * 100)}%</small>
              {layer.uvBinding && <small className="layer-island-label" title={`Linked UV: ${layer.uvBinding.uvSet}`}>
                Island {String(layer.uvBinding.island.id + 1).padStart(2, "0")}
              </small>}
            </div>
          ))}
        {!d?.layers.length && (
          <div className="empty-layers">Images and fragments appear here.</div>
        )}
      </div>
      <div className="layer-footer">
        <Button title="Import image layer" disabled={e.busy} onClick={() => void e.run(() => e.openImage())}><ImagePlus size={15} /></Button>
        <Button title="New empty layer" disabled={!d} onClick={() => e.addEmpty()}><Plus size={15} /></Button>
        <Button title={e.pickingLayerIsland ? "Cancel picking UV island (Escape)" : "Pick UV island from canvas or model"}
          disabled={!l || !d?.islands.length} aria-pressed={e.pickingLayerIsland} active={e.pickingLayerIsland}
          onClick={() => e.toggleIslandPicker()}><SquareMousePointer size={16} /></Button>
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
