import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HTMLAttributes } from "react";
import {
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
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import type { Layer, Blend } from "../types";
import { useEditor } from "./hooks";
import { editor } from "../core/editor";
import { Button } from "./Button";
function Thumbnail({ layer, refresh }: { layer: Layer; refresh: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const crop = useMemo(() => {
    const w = layer.canvas.width, h = layer.canvas.height;
    let left = 1, top = 1, right = 0, bottom = 0;
    for (const triangle of layer.uvBinding?.island.triangles ?? []) {
      for (const p of triangle) {
        left = Math.min(left, p.x); top = Math.min(top, p.y);
        right = Math.max(right, p.x); bottom = Math.max(bottom, p.y);
      }
    }
    left = Math.max(0, left); top = Math.max(0, top);
    right = Math.min(1, right); bottom = Math.min(1, bottom);
    return right > left && bottom > top
      ? { x: left * w, y: top * h, width: (right - left) * w, height: (bottom - top) * h }
      : { x: 0, y: 0, width: w, height: h };
  }, [layer.uvBinding, layer.canvas.width, layer.canvas.height]);
  useEffect(() => {
    // Reading a large GPU-backed layer is costly, so in-place edits (brush frames) redraw the thumbnail once they pause.
    const timer = setTimeout(() => {
      const c = ref.current;
      if (!c) return;
      const x = c.getContext("2d")!;
      x.clearRect(0, 0, 44, 36);
      const s = Math.min(44 / crop.width, 36 / crop.height);
      const draw = (image: HTMLCanvasElement) => x.drawImage(image,
        crop.x, crop.y, crop.width, crop.height,
        (44 - crop.width * s) / 2, (36 - crop.height * s) / 2,
        crop.width * s, crop.height * s);
      draw(layer.canvas);
      if (layer.uvMask) {
        x.save();
        x.globalCompositeOperation = "destination-in";
        draw(layer.uvMask);
        x.restore();
      }
    }, refresh ? 250 : 0);
    return () => clearTimeout(timer);
  }, [layer.canvas, layer.uvMask, crop, refresh]);
  return <canvas className="layer-thumb" ref={ref} width="44" height="36" />;
}
type RowProps = {
  layer: Layer; selected: boolean; renaming: boolean; refresh: number;
  setRenaming: (id: string | null) => void; markClick: () => void;
};
// Rows skip re-rendering on every brush frame unless their own layer changed.
const LayerRow = memo(function LayerRow({ layer, selected, renaming, refresh, setRenaming, markClick }: RowProps) {
  const island = layer.uvBinding ? String(layer.uvBinding.island.id + 1).padStart(2, "0") : "";
  return (
    <div
      data-layer-id={layer.id}
      className={`layer-row ${selected ? "selected" : ""}`}
      onClick={() => { markClick(); editor.selectLayer(layer.id); }}
      onDoubleClick={ev => {
        if ((ev.target as HTMLElement).closest("button,input")) return;
        editor.selectLayer(layer.id); setRenaming(layer.id);
      }}
    >
      <Button
        title={layer.visible ? "Hide layer" : "Show layer"}
        onClick={(ev) => {
          ev.stopPropagation();
          editor.updateLayer(layer.id, { visible: !layer.visible });
        }}
      >
        {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
      </Button>
      <Thumbnail layer={layer} refresh={refresh} />
      {renaming ? <input
        aria-label={`Layer name ${layer.name}`}
        autoFocus
        defaultValue={layer.name}
        onClick={(ev) => ev.stopPropagation()}
        onFocus={ev => ev.currentTarget.select()}
        onBlur={(ev) => {
          setRenaming(null);
          const name = ev.target.value.trim() || "Layer";
          if (name !== layer.name) editor.updateLayer(layer.id, { name });
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
            ev.preventDefault(); ev.stopPropagation(); editor.selectLayer(layer.id); setRenaming(layer.id);
          }
        }}>{layer.name}</span>}
      {island && <small className="layer-island-label" title={`Linked UV island ${island} · ${layer.uvBinding!.uvSet}`}>{island}</small>}
    </div>
  );
}, (a, b) => a.selected === b.selected && a.renaming === b.renaming && a.refresh === b.refresh &&
  a.layer.id === b.layer.id && a.layer.name === b.layer.name && a.layer.visible === b.layer.visible &&
  a.layer.canvas === b.layer.canvas && a.layer.uvMask === b.layer.uvMask && a.layer.uvBinding === b.layer.uvBinding);
export function LayersPanel({ dockHandleProps, onCollapse, collapseSide = "right" }: {
  dockHandleProps?: HTMLAttributes<HTMLDivElement>;
  onCollapse?: () => void;
  collapseSide?: "left" | "right";
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const e = useEditor(),
    d = e.doc,
    l = e.layer;
  const list = useRef<HTMLDivElement>(null), panelClick = useRef(0);
  const markClick = useCallback(() => { panelClick.current = performance.now(); }, []);
  const islandKey = d ? `${d.id}:${d.uvSet}:${d.selectedIslands.join(",")}` : "";
  useEffect(() => {
    // Island picks from the 2D/3D views reveal the linked layer; clicks in this list already show it.
    if (performance.now() - panelClick.current < 500 || !d?.selectedIslands.length) return;
    const first = d.layers.slice().reverse().find(layer =>
      layer.uvBinding?.uvSet === d.uvSet && d.selectedIslands.includes(layer.uvBinding.island.id));
    if (first) list.current?.querySelector<HTMLElement>(`[data-layer-id="${CSS.escape(first.id)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [islandKey]);
  return (
    <div className="layers-panel">
      <div {...dockHandleProps} className="layers-drag-handle" />
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
        <label title="Layer opacity">
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
        {onCollapse && <Button className="layers-collapse" title="Collapse layers panel" onClick={onCollapse}>
          {collapseSide === "right" ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}
        </Button>}
      </div>
      <div className="layer-list" ref={list}>
        {d?.layers
          .slice()
          .reverse()
          .map((layer) => (
            <LayerRow key={layer.id} layer={layer} selected={d.activeId === layer.id} renaming={renaming === layer.id}
              refresh={layer.id === d.activeId && !e.transform ? e.pixelsRevision : 0}
              setRenaming={setRenaming} markClick={markClick} />
          ))}
        {!d?.layers.length && (
          <div className="empty-layers">Images and fragments appear here.</div>
        )}
      </div>
      <div className="layer-footer">
        <Button title="Import image layer" disabled={e.busy} onClick={() => void e.run(() => e.openImage())}><ImagePlus size={15} /></Button>
        <Button title="New empty layer" disabled={!d} onClick={() => e.addEmpty()}><Plus size={15} /></Button>
        <Button
          title="Delete layer"
          disabled={!l}
          onClick={() => e.deleteLayer()}
        >
          <Trash2 size={14} />
        </Button>
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
        <Button title="Merge down" disabled={!l || d?.layers[0] === l} onClick={() => e.mergeDown()}>
          <ArrowDownToLine size={15} />
        </Button>
      </div>
    </div>
  );
}
