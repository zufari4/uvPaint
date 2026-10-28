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
          disabled={!slot}
          value={d?.uvSet ?? "uv"}
          onChange={(ev) => e.selectUVSet(ev.target.value)}
        >
          {(slot?.uvSets.length ? slot.uvSets : ["uv"]).map((s) => (
            <option key={s} value={s}>
              {s === "uv" ? "UV 0" : `UV ${s.slice(2)}`}
            </option>
          ))}
        </select>
        <input
          aria-label="UV line color"
          title="UV line color"
          type="color"
          value={e.uvColor}
          onChange={(ev) => {
            e.uvColor = ev.target.value;
            e.emit();
          }}
        />
        <input
          aria-label="UV opacity"
          title="UV opacity"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={e.uvOpacity}
          onChange={(ev) => {
            e.uvOpacity = +ev.target.value;
            e.emit();
          }}
        />
      </div>
      <label className="restriction">
        <input
          aria-label="Restrict edits to selected islands"
          type="checkbox"
          disabled={!d}
          checked={d?.restrict ?? false}
          onChange={(ev) =>
            e.change("Island restriction", (doc) => {
              doc.restrict = ev.target.checked;
            })
          }
        />{" "}
        Clip edits to selected islands
      </label>
      {d?.restrict && !d.selectedIslands.length && (
        <small className="warning-inline">
          Select an island to allow edits.
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
