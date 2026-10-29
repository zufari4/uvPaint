import { useEffect, useRef, useState } from "react";
import { LayersPanel } from "./LayersPanel";

const corners = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
type Corner = typeof corners[number];
const key = "uvpaint.layersDock";
function initialCorner(): Corner {
  try { const saved = localStorage.getItem(key); if (corners.includes(saved as Corner)) return saved as Corner; } catch { /* Use the default when storage is unavailable. */ }
  return "top-right";
}
export function LayersDock() {
  const [dock, setDock] = useState<Corner>(initialCorner);
  const [preview, setPreview] = useState<Corner | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; target: Corner | null } | null>(null);
  const cancel = () => { drag.current = null; setPreview(null); };
  const commit = (corner: Corner) => {
    setDock(corner);
    try { localStorage.setItem(key, corner); } catch { /* Docking still works in this session. */ }
  };
  useEffect(() => {
    const escape = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && drag.current) { ev.preventDefault(); ev.stopPropagation(); cancel(); }
    };
    window.addEventListener("keydown", escape, true);
    window.addEventListener("blur", cancel);
    return () => { window.removeEventListener("keydown", escape, true); window.removeEventListener("blur", cancel); };
  }, []);
  return <>
    {preview && <div className="layers-dock-preview" data-dock={preview} aria-hidden="true" />}
    <div ref={panel} className={`inspector layers-sidebar${preview ? " docking" : ""}`} data-dock={dock}>
      <LayersPanel headingProps={{
        tabIndex: 0,
        "aria-label": "Layers panel docking",
        title: "Drag to dock in a corner · Arrow keys change corner · Escape cancels",
        onPointerDown: ev => {
          if (ev.button !== 0 || (ev.target as HTMLElement).closest("button,input,select")) return;
          ev.preventDefault(); ev.currentTarget.focus({ preventScroll: true }); ev.currentTarget.setPointerCapture(ev.pointerId);
          drag.current = { x: ev.clientX, y: ev.clientY, target: null };
        },
        onPointerMove: ev => {
          const current = drag.current;
          if (!current || Math.hypot(ev.clientX - current.x, ev.clientY - current.y) < 4) return;
          const r = panel.current!.parentElement!.getBoundingClientRect();
          current.target = `${ev.clientY < r.top + r.height / 2 ? "top" : "bottom"}-${ev.clientX < r.left + r.width / 2 ? "left" : "right"}`;
          setPreview(current.target);
        },
        onPointerUp: ev => {
          if (drag.current?.target) commit(drag.current.target);
          cancel(); if (ev.currentTarget.hasPointerCapture(ev.pointerId)) ev.currentTarget.releasePointerCapture(ev.pointerId);
        },
        onPointerCancel: cancel,
        onLostPointerCapture: cancel,
        onKeyDown: ev => {
          if (ev.target !== ev.currentTarget || !ev.key.startsWith("Arrow")) return;
          ev.preventDefault();
          const [vertical, horizontal] = dock.split("-");
          if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") commit(`${vertical}-${ev.key === "ArrowLeft" ? "left" : "right"}` as Corner);
          else if (ev.key === "ArrowUp" || ev.key === "ArrowDown") commit(`${ev.key === "ArrowUp" ? "top" : "bottom"}-${horizontal}` as Corner);
        },
      }} />
    </div>
  </>;
}
