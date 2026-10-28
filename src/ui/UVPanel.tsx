import { Grid2X2 } from "lucide-react";
import { useEditor } from "./hooks";
export function UVPanel() {
  const e = useEditor(),
    d = e.doc,
    slot = e.model?.slots.find((s) => s.id === e.activeId);
  return (
    <div className="uv-panel">
      <div className="section-heading">
        <span>
          <Grid2X2 size={14} /> UV GUIDES
        </span>
        <label className="toggle-label">
          <input
            aria-label="Show UV overlay"
            type="checkbox"
            checked={e.uvVisible}
            onChange={(ev) => {
              e.uvVisible = ev.target.checked;
              e.emit();
            }}
          />{" "}
          Show
        </label>
      </div>
      <div className="uv-settings">
        <select
          aria-label="UV set"
          title="UV mapping for the guides and live Base Color preview"
          disabled={!slot}
          value={d?.uvSet ?? "uv"}
          onChange={(ev) => e.selectUVSet(ev.target.value)}
        >
          {(slot?.uvSets.length ? slot.uvSets : ["uv"]).map((s) => (
            <option key={s} value={s}>
              {d?.uvNames?.[s] ||
                slot?.uvLabels[s] ||
                (s === "uv" ? "UV 0" : `UV ${s.slice(2)}`)}
            </option>
          ))}
        </select>
      </div>
      {slot && (
        <div className="uv-name">
          <input
            aria-label="UV map name"
            key={`${d?.id}-${d?.uvSet}`}
            placeholder="Name this UV map…"
            defaultValue={d?.uvNames?.[d.uvSet] ?? ""}
            title="GLB may omit Blender UV map names. This session alias is undoable."
            onBlur={(ev) => {
              const value = ev.target.value;
              if (value !== (d?.uvNames?.[d.uvSet] ?? ""))
                e.change("Rename UV map", (doc) => {
                  doc.uvNames = { ...doc.uvNames, [doc.uvSet]: value };
                });
            }}
          />
        </div>
      )}
      <label className="restriction">
        <input
          aria-label="Clip edits to UV islands"
          type="checkbox"
          disabled={!d}
          checked={d?.restrict ?? false}
          onChange={(ev) =>
            e.change("Island restriction", (doc) => {
              doc.restrict = ev.target.checked;
            })
          }
        />{" "}
        Clip edits to UV islands
      </label>
      {d?.restrict && !d.selectedIslands.length && (
        <small className="uv-clip-hint">
          All islands. Select islands to limit edits further.
        </small>
      )}
      <div className="island-list">
        {d?.islands.length ? (
          d.islands.map((i) => (
            <button
              key={i.id}
              className={d.selectedIslands.includes(i.id) ? "active" : ""}
              onClick={(ev) => e.selectIsland(i.id, ev.shiftKey)}
              title="Click to select · Shift-click to add or remove"
            >
              Island {String(i.id + 1).padStart(2, "0")}
              <span>{i.triangles.length} tris</span>
            </button>
          ))
        ) : (
          <div className="empty-layers">
            UV islands appear after GLB import.
          </div>
        )}
      </div>
      <div className="uv-hint">Shift-click to select multiple islands</div>
    </div>
  );
}
